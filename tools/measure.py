"""Offline diagnosis for mascot-lab sprite sheets. No third-party deps."""
import struct, zlib, sys
from collections import deque


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, meta = 8, [], None
    while pos < len(data):
        length, ctype = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and interlace == 0, (depth, interlace)
            meta = (w, h, {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color])
        elif ctype == b'IDAT':
            idat.append(body)
        elif ctype == b'IEND':
            break
        pos += 12 + length
    w, h, ch = meta
    raw = zlib.decompress(b''.join(idat))
    stride = w * ch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        ft = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if ft == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif ft == 3:
            for i in range(stride):
                left = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, ch, out


def analyse(path, grid):
    w, h, ch, px = read_png(path)
    cell = w / grid
    alpha = bytearray(w * h)
    for i in range(w * h):
        alpha[i] = px[i * ch + ch - 1]
    comp = [-1] * (w * h)
    blobs = []
    for start in range(w * h):
        if comp[start] >= 0 or alpha[start] <= 128:
            continue
        idx = len(blobs)
        q = deque([start]); comp[start] = idx
        cells, minx, maxx, miny, maxy, n = set(), w, 0, h, 0, 0
        while q:
            pos = q.popleft(); n += 1
            x, y = pos % w, pos // w
            cells.add((int(y // cell), int(x // cell)))
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    np_ = ny * w + nx
                    if comp[np_] < 0 and alpha[np_] > 128:
                        comp[np_] = idx
                        q.append(np_)
        blobs.append(dict(size=n, cells=cells, minx=minx, maxx=maxx, miny=miny, maxy=maxy))
    print(f'== {path}  {w}x{h}  grid={grid}  cell={cell:.2f}  blobs={len(blobs)}')
    cross = [b for b in blobs if len(b['cells']) > 1]
    print(f'   跨越格子边界的连通块: {len(cross)}')
    for b in cross:
        rows = sorted({c[0] for c in b['cells']})
        cols = sorted({c[1] for c in b['cells']})
        print(f'     size={b["size"]:7d} rows={rows} cols={cols} box=({b["minx"]},{b["miny"]})-({b["maxx"]},{b["maxy"]})')
    # per-cell main body vs stray pixels near the top edge
    print('   cell | topstray | bodyTop bodyBottom | bodyLeft bodyRight')
    for cy in range(grid):
        for cx in range(grid):
            x0, x1 = int(cx * cell), int((cx + 1) * cell)
            y0, y1 = int(cy * cell), int((cy + 1) * cell)
            best, bestn = None, 0
            inside = {}
            for y in range(y0, y1):
                base = y * w
                for x in range(x0, x1):
                    b = comp[base + x]
                    if b >= 0:
                        inside[b] = inside.get(b, 0) + 1
            for b, cnt in inside.items():
                if cnt > bestn:
                    best, bestn = b, cnt
            body = blobs[best] if best is not None else None
            # stray marks not belonging to the body within the upper 14% of the cell
            top_limit = y0 + int(cell * 0.14)
            stray = 0
            for y in range(y0, top_limit):
                for x in range(x0, x1):
                    p = y * w + x
                    if comp[p] >= 0 and comp[p] != best:
                        stray += 1
            bt = f'{body["miny"] - y0:4d}' if body else '  - '
            bb = f'{body["maxy"] - y0:4d}' if body else '  - '
            bl = f'{body["minx"] - x0:4d}' if body else '  - '
            br = f'{body["maxx"] - x0:4d}' if body else '  - '
            others = sorted(((c, blobs[c]) for c in inside if c != best), key=lambda kv: -kv[1]['size'])
            extra = '; '.join(
                f'#{c} n={b["size"]} y={b["miny"] - y0}..{b["maxy"] - y0} x={b["minx"] - x0}..{b["maxx"] - x0}'
                for c, b in others[:3])
            print(f'   {cy}{cx} | {stray:8d} | {bt} {bb} | {bl} {br} | {extra}')


if __name__ == '__main__':
    analyse(sys.argv[1], int(sys.argv[2]))
