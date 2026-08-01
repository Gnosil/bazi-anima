#!/usr/bin/env python3
"""把任意 PNG 像素形象导入成舞台主角。

用法:  python3 import-hero.py hero-source.png [--size 32]

做的事:
 1. 裁掉透明边 → 最近邻缩放到 32×32（保持像素感，绝不插值）
 2. 量化到 ≤10 色（像素画通常本来就少色，量化只是兜底）
 3. 从这一张站立图程序化衍生 7 个动作帧:
      idle0/idle1  待机呼吸（整体下移 1px 交替）
      walk0/walk1  行走（下半身左右错位 1px + 轻微倾斜）
      curl         蜷缩（纵向压扁到 75%，底部对齐）
      shrug        摊手（头部行左右各外扩 1px 模拟耸肩）
      cheer        欢呼（整体上移 1px + 顶部行外扩）
 4. 输出 anima/assets/hero32.js —— {palette:[hex...], frames:{名字: [[索引行]...]}}
    stage.js 检测到它就用你的形象，检测不到回退内置小人。

规格建议（给 Dan）:
 - 正面站立、透明背景 PNG
 - 本身就是像素图最好（32×32 / 64×64），普通图也行但会被硬缩到 32
 - 如果你有多姿势 sprite sheet，横向排列等宽帧，加 --sheet N 按 N 帧切开，
   顺序: 站立 走1 走2 蜷缩 摊手 欢呼（缺的帧自动用衍生补）
"""
import sys, json, os
from PIL import Image

SIZE = 32
TRANSPARENT = -1

def load_and_fit(path, size):
    im = (path if isinstance(path, Image.Image) else Image.open(path)).convert('RGBA')
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    # 等比装进 size×size，最近邻
    w, h = im.size
    k = min(size / w, size / h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    im = im.resize((nw, nh), Image.NEAREST)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - nw) // 2, size - nh))  # 底部对齐（脚踩地）
    return canvas

def quantize(im, max_colors=10):
    px = im.load()
    counts = {}
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128: continue
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    if len(counts) > max_colors:
        pal_im = im.convert('RGB').quantize(colors=max_colors, dither=Image.NONE).convert('RGB')
        qx = pal_im.load()
        colors, grid = [], []
        for y in range(im.height):
            row = []
            for x in range(im.width):
                if px[x, y][3] < 128: row.append(TRANSPARENT); continue
                c = qx[x, y]
                if c not in colors: colors.append(c)
                row.append(colors.index(c))
            grid.append(row)
        return colors, grid
    colors = list(counts.keys())
    grid = []
    for y in range(im.height):
        row = []
        for x in range(im.width):
            r, g, b, a = px[x, y]
            row.append(TRANSPARENT if a < 128 else colors.index((r, g, b)))
        grid.append(row)
    return colors, grid

def shift(grid, dx, dy):
    n = len(grid); out = [[TRANSPARENT]*n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            v = grid[y][x]
            if v == TRANSPARENT: continue
            nx, ny = x+dx, y+dy
            if 0 <= nx < n and 0 <= ny < n: out[ny][nx] = v
    return out

def bottom(grid):
    n = len(grid)
    for y in range(n-1, -1, -1):
        if any(v != TRANSPARENT for v in grid[y]): return y
    return n-1

def top(grid):
    for y, row in enumerate(grid):
        if any(v != TRANSPARENT for v in row): return y
    return 0

def derive(base):
    n = len(base); b0, t0 = bottom(base), top(base)
    mid = (t0 + b0) // 2
    idle1 = shift(base, 0, 1)
    # walk: 下半身错位
    def legs(dx):
        out = [row[:] for row in base]
        for y in range(mid + (b0-mid)//2, n):
            row = [TRANSPARENT]*n
            for x in range(n):
                v = base[y][x]
                if v == TRANSPARENT: continue
                nx = x + dx
                if 0 <= nx < n: row[nx] = v
            out[y] = row
        return out
    # curl: 压到 75% 高
    h = b0 - t0 + 1; ch = max(1, int(h*0.75))
    curl = [[TRANSPARENT]*n for _ in range(n)]
    for cy in range(ch):
        sy = t0 + round(cy * (h-1) / max(1, ch-1))
        curl[b0-ch+1+cy] = base[sy][:]
    # shrug: 头部行外扩
    shrug = [row[:] for row in base]
    for y in range(t0, mid):
        row = [TRANSPARENT]*n
        for x in range(n):
            v = base[y][x]
            if v == TRANSPARENT: continue
            for nx in (x-1, x, x+1):
                if 0 <= nx < n and row[nx] == TRANSPARENT: row[nx] = v
        shrug[y] = row
    cheer = shift(base, 0, -1)
    return {'idle0': base, 'idle1': idle1, 'walk0': legs(-1), 'walk1': legs(1),
            'curl': curl, 'shrug': shrug, 'cheer': cheer}

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(0)
    src = sys.argv[1]
    sheet = 0
    if '--sheet' in sys.argv: sheet = int(sys.argv[sys.argv.index('--sheet')+1])
    if sheet:
        im = Image.open(src).convert('RGBA')
        fw = im.width // sheet
        frames_raw = [load_and_fit(im.crop((i*fw, 0, (i+1)*fw, im.height)), SIZE) for i in range(sheet)]
        # 合并量化保持同一调色板：先横向拼起来
        strip = Image.new('RGBA', (SIZE*sheet, SIZE), (0,0,0,0))
        for i, f in enumerate(frames_raw): strip.paste(f, (i*SIZE, 0))
        colors, big = quantize(strip)
        grids = [[row[i*SIZE:(i+1)*SIZE] for row in big] for i in range(sheet)]
        names = ['idle0','walk0','walk1','curl','shrug','cheer']
        d = derive(grids[0])
        for i, nm in enumerate(names):
            if i < len(grids): d[nm] = grids[i]
        d['idle1'] = shift(grids[0], 0, 1)
        frames = d
    else:
        im = load_and_fit(src, SIZE)
        colors, base = quantize(im)
        frames = derive(base)

    out = {
        'size': SIZE,
        'source': os.path.basename(src),
        'palette': ['#%02X%02X%02X' % c for c in colors],
        'frames': frames,
    }
    js = ('/* 自动生成: python3 import-hero.py %s —— 不要手改 */\n'
          '(function(root,f){if(typeof module==="object"&&module.exports)module.exports=f();else root.HERO32=f();})'
          '(typeof self!=="undefined"?self:this,function(){return %s;});\n'
          % (os.path.basename(src), json.dumps(out, separators=(',', ':'))))
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hero32.js')
    open(dst, 'w').write(js)
    print('->', dst, f'{len(js)//1024}KB · {len(colors)} 色 · {len(frames)} 帧')

if __name__ == '__main__':
    main()
