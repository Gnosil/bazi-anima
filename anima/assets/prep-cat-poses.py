#!/usr/bin/env python3
"""把猫仙人多姿势源图（PR #5 的 taoist-tabby/*）加工成 hero32.js 的 7 帧。

流程（与 HD-2D 主角管线一致）：
  连通域提取最大块（自动甩掉悬浮的八卦镜/星星）→ 边界光晕清除
  → 所有帧拼条统一量化 16 色（调色板一致）→ majority 采样降到宽 80
  → 底部对齐进 80×80 → 写 hero32.js

帧映射：
  idle0/idle1 ← source/cat-v1,v2（原立绘双帧呼吸）
  walk0       ← taoist-tabby/hop（真跳跃帧）   walk1 ← hop 下移1px
  curl        ← taoist-tabby/cast（凝神施法）
  shrug/cheer ← taoist-tabby/beckon（招手；cheer 上移1px）
"""
import json, os, sys
from collections import Counter, deque
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
TARGET_W = 80
CANVAS = 80
NCOLORS = 16

def largest_component(im, athr=160):
    W, H = im.size
    px = im.load()
    seen = [[False]*W for _ in range(H)]
    best, best_n = None, 0
    for y0 in range(H):
        for x0 in range(W):
            if seen[y0][x0] or px[x0, y0][3] < athr: continue
            comp = []
            q = deque([(x0, y0)]); seen[y0][x0] = True
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and px[nx, ny][3] >= athr:
                        seen[ny][nx] = True; q.append((nx, ny))
            if len(comp) > best_n: best, best_n = comp, len(comp)
    mask = Image.new('L', (W, H), 0)
    mp = mask.load()
    for x, y in best: mp[x, y] = 255
    out = Image.new('RGBA', (W, H), (0,0,0,0))
    out.paste(im, (0,0), mask)
    return out.crop(out.getbbox())

def dehalo(im, passes=2):
    W, H = im.size; px = im.load()
    def haloish(c): r,g,b,_=c; return (r>140 and g<115 and b>105) or (r>170 and g<90 and b<90)
    for _ in range(passes):
        kill=[]
        for y in range(H):
            for x in range(W):
                if px[x,y][3]==0 or not haloish(px[x,y]): continue
                if any(0<=x+dx<W and 0<=y+dy<H and px[x+dx,y+dy][3]==0
                       for dx in(-1,0,1) for dy in(-1,0,1)):
                    kill.append((x,y))
        for x,y in kill: px[x,y]=(0,0,0,0)
    return im

def prep(im):
    return dehalo(largest_component(im))

def majority_scale(im, colors_map, target_w):
    W, H = im.size
    th = round(H * target_w / W)
    px = im.load()
    out = [[None]*target_w for _ in range(th)]
    for ty in range(th):
        for tx in range(target_w):
            x1,x2 = int(tx*W/target_w), max(int(tx*W/target_w)+1, int((tx+1)*W/target_w))
            y1,y2 = int(ty*H/th), max(int(ty*H/th)+1, int((ty+1)*H/th))
            c = Counter(); tot = 0
            for sy in range(y1,y2):
                for sx in range(x1,x2):
                    tot += 1
                    if px[sx,sy][3] >= 160: c[colors_map[(sx,sy)]] += 1
            if c and sum(c.values()) >= tot*0.45: out[ty][tx] = c.most_common(1)[0][0]
    # 去孤立
    kill=[]
    for y in range(th):
        for x in range(target_w):
            if out[y][x] is None: continue
            n=sum(1 for dx in(-1,0,1) for dy in(-1,0,1) if (dx or dy)
                  and 0<=x+dx<target_w and 0<=y+dy<th and out[y+dy][x+dx] is not None)
            if n<=1: kill.append((x,y))
    for x,y in kill: out[y][x]=None
    return out

def to_canvas(grid, canvas):
    th, tw = len(grid), len(grid[0])
    out = [[None]*canvas for _ in range(canvas)]
    ox = (canvas - tw)//2
    oy = canvas - th
    for y in range(th):
        for x in range(tw):
            if grid[y][x] is not None: out[oy+y][ox+x] = grid[y][x]
    return out

def shift(grid, dx, dy):
    n=len(grid); out=[[None]*n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            v=grid[y][x]
            if v is None: continue
            nx,ny=x+dx,y+dy
            if 0<=nx<n and 0<=ny<n: out[ny][nx]=v
    return out

def main():
    srcs = {
        'idle0': prep(Image.open(os.path.join(D,'source/cat-v1.png')).convert('RGBA').crop((56,0,172,102))),
        'idle1': prep(Image.open(os.path.join(D,'source/cat-v2.png')).convert('RGBA').crop((56,0,172,102))),
        'walk0': prep(Image.open(os.path.join(D,'taoist-tabby/hop.png')).convert('RGBA')),
        'curl':  prep(Image.open(os.path.join(D,'taoist-tabby/cast.png')).convert('RGBA')),
        'shrug': prep(Image.open(os.path.join(D,'taoist-tabby/beckon.png')).convert('RGBA')),
    }
    # 统一调色板：全部拼一条量化
    total_w = sum(i.width for i in srcs.values())
    max_h = max(i.height for i in srcs.values())
    strip = Image.new('RGBA', (total_w, max_h), (0,0,0,0))
    x = 0; offs = {}
    for k, im in srcs.items():
        strip.paste(im, (x, max_h - im.height)); offs[k] = (x, max_h - im.height); x += im.width
    q = strip.convert('RGB').quantize(colors=NCOLORS, dither=Image.NONE).convert('RGB')
    qx = q.load(); sp = strip.load()
    colors = []
    def cmap_for(k, im):
        ox, oy = offs[k]; m = {}
        for y in range(im.height):
            for x2 in range(im.width):
                if sp[ox+x2, oy+y][3] >= 160:
                    c = qx[ox+x2, oy+y]
                    if c not in colors: colors.append(c)
                    m[(x2, y)] = colors.index(c)
        return m
    frames = {}
    for k, im in srcs.items():
        g = majority_scale(im, cmap_for(k, im), TARGET_W if im.width>=im.height else round(TARGET_W*0.85))
        frames[k] = to_canvas(g, CANVAS)
    frames['walk1'] = shift(frames['walk0'], 0, 1)
    frames['cheer'] = shift(frames['shrug'], 0, -1)

    pal = ['#%02X%02X%02X' % c for c in colors]
    grids = {k: [[(-1 if v is None else v) for v in row] for row in g] for k, g in frames.items()}
    out = { 'size': CANVAS, 'source': 'cat-v1/v2 + taoist-tabby (PR #5 by radianceded)', 'palette': pal, 'frames': grids }
    js = ('/* 自动生成: python3 prep-cat-poses.py —— 不要手改 */\n'
          '(function(root,f){if(typeof module==="object"&&module.exports)module.exports=f();else root.HERO32=f();})'
          '(typeof self!=="undefined"?self:this,function(){return %s;});\n' % json.dumps(out, separators=(',',':')))
    open(os.path.join(D,'hero32.js'),'w').write(js)
    print('-> hero32.js', len(js)//1024, 'KB ·', len(pal), '色 ·', len(grids), '帧:', ','.join(grids))

if __name__ == '__main__':
    main()
