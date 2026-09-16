#!/usr/bin/env python3
"""把 export 目录里的 22 张白底精灵图抠成透明底。

关键点：角色本身有大片白色（肚皮、脸颊、白毛），所以不能用「白色=透明」
的全图阈值。改为从画布四边做泛洪填充——只有与边缘连通的浅色像素才算背景，
被黑描边包住的角色内部白色自然保留。

用法:
    python3 cutout.py            # 处理全部，输出到 ../mascot-lab/
    python3 cutout.py 仓鼠       # 只处理名字含"仓鼠"的，便于抽样检查
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from collections import deque

SRC = Path('/Users/sunjian/Downloads/export (33)')
DST = Path('/Users/sunjian/Documents/POC/mascot-lab/assets/characters')

# 近白判定：三通道都高于该值才可能是背景。描边是黑色的，容忍度高一点
# 也不会漏进角色内部；太低反而会在白肚皮贴近画布边缘时误判。
NEAR_WHITE = 238
# 输出尺寸与 WebP 质量。5x5 表 1536px 时每格 ~307px，显示画布 260px 足够。
OUT_SIZE = 1536
WEBP_Q = 90


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """从四边泛洪，返回 True=背景 的掩码。

    描边偶有 1-2px 断口，泛洪会顺着断口在角色里拉出细条泄漏。
    对背景掩码做开运算（先腐蚀后膨胀）：细于 3px 的泄漏通道被删除，
    大块真实背景（格间空隙、爪间缝隙）形状不变。
    """
    h, w, _ = rgb.shape
    near = (rgb >= NEAR_WHITE).all(axis=2)
    bg = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not bg[y, x]:
                bg[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                queue.append((ny, nx))
    # 开运算去细缝泄漏（核 13：封住 ≤12px 的描边断口，
    # 爪间 ~15px 以上的真实缝隙不受影响）
    m = Image.fromarray((bg * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MinFilter(13)).filter(ImageFilter.MaxFilter(13))
    return np.asarray(m) > 128


def sever(alpha: np.ndarray, grid: int) -> None:
    """把粘连的相邻帧切开（原地修改 alpha）。

    AI 生成的表有时相邻两帧会碰到一起（上一行的彩球垂到下一行头顶），
    连通域就数不出 grid*grid 个身体。做法：按空隙把内容分成段，段数不足
    grid 时，反复在「内容最少的行/列」切开，直到段数够了为止。切开处最多
    损失 5px 内容，显示时不足 1px。已经分开的素材一刀都不用切。
    """
    def segments(counts):
        segs, start = [], None
        for i, c in enumerate(counts):
            if c and start is None:
                start = i
            elif not c and start is not None:
                segs.append((start, i - 1)); start = None
        if start is not None:
            segs.append((start, len(counts) - 1))
        return segs

    def cuts_pass(get_counts, at):
        """沿一维反复切割，直到段数达到 grid。"""
        for _ in range(grid * 2):
            counts = get_counts()
            segs = segments(counts)
            if len(segs) >= grid:
                return
            # 找全图范围内内容最少的切割点（避开段边缘 25px）
            best, best_y = None, None
            for s, e in segs:
                if e - s < 50:
                    continue
                inner = counts[s + 25:e - 24]
                y = s + 25 + int(np.argmin(inner))
                n = int(counts[y])
                if best is None or n < best:
                    best, best_y = n, y
            if best_y is None or best > 0.45 * max(1, int(counts.max())):
                return  # 切无可切，或最细处仍然太实——不动手
            at(best_y)
        return

    h, w = alpha.shape

    def cut_row(y):
        alpha[max(0, y - 2):y + 3, :] = 0

    def cut_col(x):
        alpha[:, max(0, x - 2):x + 3] = 0

    cuts_pass(lambda: alpha.sum(axis=1), cut_row)
    cuts_pass(lambda: alpha.sum(axis=0), cut_col)


def cutout(path: Path, grid: int) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert('RGB'))
    bg = background_mask(rgb)
    alpha = (~bg).astype(np.uint8) * 255
    sever(alpha, grid)
    # 边缘羽化：掩码轻微收缩+模糊，弱化白边和锯齿
    mask_img = Image.fromarray(alpha)
    mask_img = mask_img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = np.dstack([rgb, np.asarray(mask_img)])
    return Image.fromarray(rgba, 'RGBA')


# 中文文件名 -> 项目内 ASCII 命名
ID_MAP = {
    '仓鼠': 'hamster', '双马尾啦啦队女孩': 'cheerleader', '国风汉服小女孩': 'hanfu',
    '头顶绿芽银虎斑猫': 'sproutcat', '布偶猫': 'ragdoll', '星之卡比': 'kirby',
    '柴犬': 'shiba', '水豚': 'capybara', '派蒙': 'paimon',
    '社恐程序员': 'coder', '魔法少女': 'magicalgirl'
}


def main() -> None:
    names = sys.argv[1:] or None
    files = sorted(SRC.glob('*.png'))
    if names:
        files = [f for f in files if any(n in f.name for n in names)]
    DST.mkdir(parents=True, exist_ok=True)
    for f in files:
        grid = 5 if '转向' in f.name else 3
        img = cutout(f, grid)
        img = img.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
        zh = f.name.replace('多角度转向表.png', '').replace('表情反应贴纸表.png', '')
        en = ID_MAP.get(zh, zh)
        suffix = 'directions-25' if grid == 5 else 'reactions'
        out = DST / f'{en}-{suffix}.webp'
        img.save(out, 'WEBP', quality=WEBP_Q, method=4)
        kb = out.stat().st_size // 1024
        print(f'{f.name} -> {out.name}  {kb}KB')
    print('done')


if __name__ == '__main__':
    main()
