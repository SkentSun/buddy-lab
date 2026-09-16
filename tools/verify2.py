"""Rebuild mascot-lab's crop rules on real pixels and check them.

The pose grid inside these PNGs is not the nominal division - rows drift about
10 px upwards per row and columns about 8 px leftwards per column - so a frame
drawn from the nominal cell shows its neighbours. Instead of trusting the grid,
this derives it from the art: every blob is assigned to a row and a column by
nearest anchor, each row/column gets a band, and the crop lines are the
midpoints between neighbouring bands.
"""
import sys
from collections import deque
from measure import read_png

OPAQUE = 128
VIEW = 260.0
FLOOR_LINE = 0.93


def blobs_of(path, grid):
    natural, height, ch, px = read_png(path)
    size = natural / grid
    owner = [0] * (natural * natural)
    alpha = px[ch - 1::ch]
    blobs = []
    for start in range(natural * natural):
        if owner[start] or alpha[start] <= OPAQUE:
            continue
        bid = len(blobs) + 1
        owner[start] = bid
        q = deque([start])
        minx = maxx = start % natural
        miny = maxy = start // natural
        hits = {}
        while q:
            pos = q.popleft()
            x = pos % natural
            y = pos // natural
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            cell = min(grid - 1, int(y / size)) * grid + min(grid - 1, int(x / size))
            hits[cell] = hits.get(cell, 0) + 1
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < natural and 0 <= ny < natural:
                    np = ny * natural + nx
                    if not owner[np] and alpha[np] > OPAQUE:
                        owner[np] = bid
                        q.append(np)
        blobs.append(dict(id=bid, count=sum(hits.values()), hits=hits,
                          minx=minx, maxx=maxx, miny=miny, maxy=maxy,
                          home=max(hits.items(), key=lambda kv: kv[1])[0]))
    return natural, size, owner, blobs


def measure_body(natural, owner, blob, x0, y0, x1, y1, size):
    """Shoulder strip: the lowest fixed-height band of the largest part."""
    floor = blob['maxy']
    band = max(y0, floor - int(size * .05))
    left, right = natural, 0
    for y in range(band, y1):
        base = y * natural
        for x in range(x0, x1):
            if owner[base + x] == blob['id']:
                if x < left: left = x
                if x > right: right = x
    return floor, (left + right) / 2, right - left


def analyse(path, grid):
    natural, size, owner, blobs = blobs_of(path, grid)
    # Bodies are big enough that the nominal cell still identifies them.
    bodies = {}
    for b in blobs:
        cell = b['home']
        hits = b['hits'].get(cell, 0)
        if hits >= b['count'] / 2 and hits > (bodies[cell]['hits'] if cell in bodies else 0):
            bodies[cell] = dict(blob=b, hits=hits)
    assert len(bodies) == grid * grid, f'{path}: 只认出 {len(bodies)}/{grid * grid} 个角色'
    rows = [[] for _ in range(grid)]
    columns = [[] for _ in range(grid)]
    for cell in range(grid * grid):
        row, column = divmod(cell, grid)
        rows[row].append(bodies[cell]['blob'])
        columns[column].append(bodies[cell]['blob'])
    # Assign everything else to its nearest row / column anchor.
    def assign(groups, low, high):
        bands = [(min(b[low] for b in g), max(b[high] for b in g)) for g in groups]
        picked = []
        for b in blobs:
            value = (b[low] + b[high]) / 2
            best, distance = 0, None
            for index, (lo, hi) in enumerate(bands):
                d = 0 if lo <= value <= hi else min(abs(value - lo), abs(value - hi))
                if distance is None or d < distance:
                    best, distance = index, d
            picked.append(best)
        return picked
    row_of = assign(rows, 'miny', 'maxy')
    column_of = assign(columns, 'minx', 'maxx')
    row_band = [(min(b['miny'] for b, r in zip(blobs, row_of) if r == i),
                 max(b['maxy'] for b, r in zip(blobs, row_of) if r == i)) for i in range(grid)]
    column_band = [(min(b['minx'] for b, c in zip(blobs, column_of) if c == i),
                    max(b['maxx'] for b, c in zip(blobs, column_of) if c == i)) for i in range(grid)]
    frames = []
    for cell in range(grid * grid):
        row, column = divmod(cell, grid)
        body = bodies[cell]['blob']
        floor, cx, shoulder = measure_body(natural, owner, body,
                                           int(column * size), int(row * size),
                                           min(natural, -int(-(column + 1) * size // 1)),
                                           min(natural, -int(-(row + 1) * size // 1)), size)
        mine = {b['id'] for b, r, c in zip(blobs, row_of, column_of) if r == row and c == column}
        frames.append(dict(cell=cell, size=size, natural=natural, home={}, body=body['id'],
                           cx=cx, floor=floor, shoulderWidth=shoulder, grid=grid,
                           # Crop lines sit in the empty gutter between bands.
                           clipTop=(row_band[row - 1][1] + row_band[row][0]) / 2 if row else 0,
                           clipBottom=(row_band[row][1] + row_band[row + 1][0]) / 2 if row + 1 < grid else natural,
                           clipLeft=(column_band[column - 1][1] + column_band[column][0]) / 2 if column else 0,
                           clipRight=(column_band[column][1] + column_band[column + 1][0]) / 2 if column + 1 < grid else natural,
                           parts=mine,
                           row=row, column=column))
    ids = {b['id']: r * grid + c for b, r, c in zip(blobs, row_of, column_of)}
    return dict(natural=natural, size=size, owner=owner, frames=frames, home=ids, blobs=blobs)


def report(images, label, reference_label='directions'):
    ref = images[reference_label]['frames'][4]
    ref_ratio = ref['shoulderWidth'] / ref['size']
    sheet = images[label]
    grid = sheet['frames'][0]['grid']
    owner, natural, home = sheet['owner'], sheet['natural'], sheet['home']
    aligned = []
    for f in sheet['frames']:
        scale = ref_ratio / (f['shoulderWidth'] / f['size'])
        assert .65 < scale < 1.35, f['cell']
        aligned.append({**f, 'scale': scale})
    print(f'--- {label} ({grid}x{grid})')
    totals = dict(foreign_old=0, foreign_new=0, own_cut=0, gained=0)
    for f in aligned:
        zoom = VIEW / f['size'] * f['scale']
        at = lambda s: (s - f['floor']) * zoom + VIEW * FLOOR_LINE
        along = lambda s: (s - f['cx']) * zoom + VIEW / 2
        ytop, ybot = at(f['clipTop']), at(f['clipBottom'])
        xleft, xright = along(f['clipLeft']), along(f['clipRight'])
        ys = (f['floor'] - VIEW * FLOOR_LINE / zoom, f['floor'] + VIEW * (1 - FLOOR_LINE) / zoom)
        xs = (f['cx'] - VIEW / 2 / zoom, f['cx'] + VIEW / 2 / zoom)
        foreign_old = foreign_new = own_cut = gained = lost = 0
        culprits = {}
        for y in range(max(0, int(ys[0]) - 3), min(natural, int(ys[1]) + 4)):
            dy = at(y)
            if dy < 0 or dy > VIEW:
                continue
            for x in range(max(0, int(xs[0]) - 3), min(natural, int(xs[1]) + 4)):
                dx = along(x)
                if dx < 0 or dx > VIEW:
                    continue
                bid = owner[y * natural + x]
                if not bid:
                    continue
                foreign = home[bid] != f['cell']
                visible = ytop <= dy <= ybot and xleft <= dx <= xright
                if foreign and y < f['floor'] + 2:
                    foreign_old += 1
                if foreign and visible:
                    foreign_new += 1
                    culprits[home[bid]] = culprits.get(home[bid], 0) + 1
                if not foreign and not visible:
                    own_cut += 1 if bid == f['body'] else 0
                    lost += 1
                if not foreign and visible:
                    gained += 1
        for k, v in (('foreign_old', foreign_old), ('foreign_new', foreign_new),
                     ('own_cut', own_cut), ('gained', gained)):
            totals[k] += v
        note = f'  <== 旧版黑线 {foreign_old}px' if foreign_old else ''
        extra = f'  残留={culprits}' if culprits else ''
        print(f'   cell {f["cell"]:2d} (r{f["row"]}c{f["column"]}) zoom={zoom:.4f}  '
              f'外来 旧={foreign_old:5d} 新={foreign_new:3d}  |  '
              f'主体被削={own_cut:3d} 自有被削={lost:3d}{extra}{note}')
    print(f'   合计 外来旧={totals["foreign_old"]} 外来新={totals["foreign_new"]} '
          f'主体被削={totals["own_cut"]}')


if __name__ == '__main__':
    images = {
        'directions': analyse('assets/originals/directions.png', 3),
        'reactions': analyse('assets/originals/reactions.png', 3),
        'directions25': analyse('assets/originals/directions-25.png', 5),
    }
    for label in (sys.argv[1:] or ['directions25', 'directions', 'reactions']):
        report(images, label)
