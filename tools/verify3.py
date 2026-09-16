"""Uniform crop model for mascot-lab.

One window size, one scale and one clip per sheet, shared by every frame:
  * the window is a square, sized by the tallest and widest pose in the sheet;
  * every pose is drawn from that same square, anchored on its own shoulders and
    feet, so nothing drifts and no neighbour can reach in;
  * the clip is one rect per sheet - the same CSS inset for all frames.
Swap the art and only the measurements change, never the rules.
"""
import sys
from measure import read_png
from verify2 import blobs_of

OPAQUE = 128
VIEW = 260.0
FLOOR = 0.93


def survey(path, grid):
    natural, size, owner, blobs = blobs_of(path, grid)
    # Bodies outgrow their decorations, so the nominal cell still names them.
    found = {}
    for b in blobs:
        for cell, hits in b['hits'].items():
            if hits >= b['count'] / 2 and hits > found.get(cell, (None, 0))[1]:
                found[cell] = (b, hits)
    assert len(found) == grid * grid, f'{path}: {len(found)}/{grid * grid}'
    body = {cell: b for cell, (b, _) in found.items()}
    # Everything else joins the nearest row / column of bodies.
    def anchors(key, low, high):
        groups = [[body[c] for c in range(grid * grid) if (c // grid if key else c % grid) == i]
                  for i in range(grid)]
        bands = [(min(b[low] for b in g), max(b[high] for b in g)) for g in groups]
        return [min(range(grid), key=lambda i: max(0, bands[i][0] - v, v - bands[i][1]))
                for v in ((b[low] + b[high]) / 2 for b in blobs)], bands
    row_of, row_bands = anchors(1, 'miny', 'maxy')
    col_of, col_bands = anchors(0, 'minx', 'maxx')
    home = {b['id']: row_of[i] * grid + col_of[i] for i, b in enumerate(blobs)}
    frames = []
    for cell in range(grid * grid):
        row, column = divmod(cell, grid)
        shape = body[cell]
        x0, y0 = int(column * size), int(row * size)
        x1 = min(natural, -int(-(column + 1) * size // 1))
        y1 = min(natural, -int(-(row + 1) * size // 1))
        floor = shape['maxy']
        band = max(y0, floor - int(size * .05))
        left, right = natural, 0
        for y in range(band, y1):
            base = y * natural
            for x in range(x0, x1):
                if owner[base + x] == shape['id']:
                    left = min(left, x)
                    right = max(right, x)
        parts = [b for i, b in enumerate(blobs) if row_of[i] == row and col_of[i] == column]
        frames.append(dict(cell=cell, row=row, column=column, body=shape['id'],
                           floor=floor, cx=(left + right) / 2, shoulderWidth=right - left,
                           top=min(b['miny'] for b in parts), bottom=max(b['maxy'] for b in parts),
                           left=min(b['minx'] for b in parts), right=max(b['maxx'] for b in parts)))
    return dict(natural=natural, size=size, owner=owner, home=home, frames=frames)


def uniform(sheets, label, ref_label='directions', pad_ratio=0.02):
    sheet = sheets[label]
    ref = sheets[ref_label]['frames'][4]
    ref_ratio = ref['shoulderWidth'] / sheets[ref_label]['size']
    frames = sheet['frames']
    grid = int(round(sheet['natural'] / sheet['size']))
    pad = round(sheet['size'] * pad_ratio)
    tallest = max(f['floor'] - f['top'] for f in frames)          # shoulders to crown
    widest = max(max(f['right'] - f['cx'], f['cx'] - f['left']) for f in frames)
    # Room the sheet actually leaves between rows / columns.
    row_bottom = [max(f['bottom'] for f in frames if f['row'] == r) for r in range(grid)]
    row_top = [min(f['top'] for f in frames if f['row'] == r) for r in range(grid)]
    col_right = [max(f['right'] for f in frames if f['column'] == c) for c in range(grid)]
    col_left = [min(f['left'] for f in frames if f['column'] == c) for c in range(grid)]
    room_above = min([f['floor'] - row_bottom[f['row'] - 1] for f in frames if f['row']] or [1e9]) - pad
    # Measured from the shoulder centre, which is where the window is anchored.
    room_side = min([min(f['cx'] - col_right[f['column'] - 1] for f in frames if f['column']),
                     min(col_left[f['column'] + 1] - f['cx'] for f in frames if f['column'] + 1 < grid)]
                    or [1e9]) - pad
    above = min(tallest + pad, room_above)                        # space kept above the feet
    half = min(widest + pad, room_side)                           # space kept either side
    # One zoom per sheet: shoulders keep the share the reference sheet has, so
    # switching grid or reacting never changes the character's size.
    mean_shoulder = sum(f['shoulderWidth'] for f in frames) / len(frames)
    ref_frames = sheets[ref_label]['frames']
    share = sum(f['shoulderWidth'] for f in ref_frames) / len(ref_frames) / sheets[ref_label]['size']
    zoom = VIEW * share / mean_shoulder
    span = VIEW / zoom
    print(f'--- {label}: 上方需要={tallest}+{pad} 可用={room_above:.0f} → 留{above:.0f} | '
          f'半宽需要={widest:.1f}+{pad} 可用={room_side:.0f} → 留{half:.0f} | '
          f'平均肩宽={mean_shoulder:.1f} 肩宽占比={share:.4f} 窗口={span:.1f} zoom={zoom:.4f}')
    owner, natural, home = sheet['owner'], sheet['natural'], sheet['home']
    foreign = own_cut = 0
    inset = None
    for f in frames:
        down = lambda s: (s - f['floor']) * zoom + VIEW * FLOOR
        across = lambda s: (s - f['cx']) * zoom + VIEW / 2
        top, bottom = down(f['floor'] - above), down(f['floor'] + pad)
        left, right = across(f['cx'] - half), across(f['cx'] + half)
        if inset is None:
            inset = (top, VIEW - bottom, left, VIEW - right)
        for y in range(max(0, int(f['floor'] - VIEW * FLOOR / zoom)), min(natural, int(f['floor'] + VIEW * (1 - FLOOR) / zoom) + 2)):
            dy = down(y)
            if not (0 <= dy <= VIEW and top <= dy <= bottom):
                continue
            for x in range(max(0, int(f['cx'] - VIEW / 2 / zoom)), min(natural, int(f['cx'] + VIEW / 2 / zoom) + 2)):
                dx = across(x)
                if not (0 <= dx <= VIEW and left <= dx <= right):
                    continue
                bid = owner[y * natural + x]
                if not bid:
                    continue
                if home[bid] != f['cell']:
                    foreign += 1
                else:
                    pass
        # own content kept?
        for y in range(f['top'], f['bottom'] + 1):
            for x in range(f['left'], f['right'] + 1):
                if owner[y * natural + x] and home[owner[y * natural + x]] == f['cell']:
                    if not (top <= down(y) <= bottom and left <= across(x) <= right):
                        own_cut += 1
    print(f'    外来像素={foreign}  自有被削={own_cut}  统一裁切 inset={tuple(round(v, 2) for v in inset)}')
    return dict(span=span, zoom=zoom, pad=pad, tallest=tallest, widest=widest, inset=inset,
                foreign=foreign, own_cut=own_cut)


if __name__ == '__main__':
    sheets = {
        'directions': survey('assets/originals/directions.png', 3),
        'reactions': survey('assets/originals/reactions.png', 3),
        'directions25': survey('assets/originals/directions-25.png', 5),
    }
    for label in (sys.argv[1:] or ['directions', 'reactions', 'directions25']):
        uniform(sheets, label)
