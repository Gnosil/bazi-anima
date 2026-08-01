/* 舞台 —— 会动的小人 + 场景。
 * 用户提问 → 路由到一个场景 → 用动画回答，不用文字。
 * 所有形状都是 16×16 / 8×8 点阵，程序化绘制，无外部图片。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../design-system/tokens'));
  else root.Stage = factory(root.DS);
})(typeof self !== 'undefined' ? self : this, function (DS) {

/* ═══ 1. 点阵 ═══
 * . 透明 | o 描边 | b 主体 | h 高光 | d 暗部 | s 肤色 | e 眼睛
 */
const CH = {
  idle0: ['................','.....dddd.......','....osssso......','....oseseo......','....osssso......','.....dddd.......','....obbbbo......','...obbbbbbo.....','...obhbbhbo.....','...obbbbbbo.....','....obbbbo......','.....b..b.......','.....b..b.......','....dd..dd......','................','................'],
  idle1: ['................','................','.....dddd.......','....osssso......','....oseseo......','....osssso......','.....dddd.......','....obbbbo......','...obbbbbbo.....','...obhbbhbo.....','....obbbbo......','.....b..b.......','.....b..b.......','....dd..dd......','................','................'],
  walk0: ['................','.....dddd.......','....osssso......','....oseseo......','....osssso......','.....dddd.......','....obbbbo......','...obbbbbbo.....','...obhbbhbo.....','...obbbbbbo.....','....obbbbo......','....b...b.......','...b.....b......','..dd.....dd.....','................','................'],
  walk1: ['................','.....dddd.......','....osssso......','....oseseo......','....osssso......','.....dddd.......','....obbbbo......','...obbbbbbo.....','...obhbbhbo.....','...obbbbbbo.....','....obbbbo......','.....b.b........','.....b.b........','....dd.dd.......','................','................'],
  cheer: ['................','..b.......b.....','..b..dddd.b.....','...bdssssdb.....','....oseseo......','....osssso......','.....dddd.......','....obbbbo......','...obbbbbbo.....','...obhbbhbo.....','....obbbbo......','.....b..b.......','.....b..b.......','....dd..dd......','................','................'],
  shrug: ['................','................','.....dddd.......','....osssso......','....oseseo......','....osssso......','.....dddd.......','..b.obbbbo.b....','...obbbbbbo.....','...obhbbhbo.....','....obbbbo......','.....b..b.......','.....b..b.......','....dd..dd......','................','................'],
  curl:  ['................','................','................','................','................','.....dddd.......','....osssso......','....oseseo......','....osssso......','...obbbbbbo.....','..obbbbbbbbo....','..obbbbbbbbo....','...oooooooo.....','................','................','................'],
};

const PROP = {
  coin:  ['..oooo..','.ohhhho.','ohhbbhho','ohbhbhho','ohbhbhho','ohhbbhho','.ohhhho.','..oooo..'],
  flame: ['...h....','..hh....','..bhb...','.bbhbb..','.bbhhbb.','obbhhbbo','obbbbbbo','.oobboo.'],
  heart: ['.bb.bb..','bhbbbhb.','bbbbbbb.','bbbbbbb.','.bbbbb..','..bbb...','...b....','........'],
  brick: ['oooooooo','obbbbbbo','oooooooo','obbobbbo','oooooooo','obbbbbbo','oooooooo','obbobbbo'],
  qmark: ['..oooo..','.ohhhho.','ohh..hho','.....hho','...ohho.','...oho..','........','...oo...'],
};

// 自检：所有点阵必须是方阵且只含合法字符
(function validate(){
  for (const set of [CH, PROP]) for (const [k, rows] of Object.entries(set)) {
    const n = rows.length;
    rows.forEach((r, i) => {
      if (r.length !== n) throw new Error(`sprite ${k} row ${i} 宽度 ${r.length} ≠ ${n}`);
      if (/[^.obhdse]/.test(r)) throw new Error(`sprite ${k} row ${i} 含非法字符`);
    });
  }
})();

/* ═══ 2. 绘制 ═══ */
function blit(ctx, rows, pal, x, y, s, flip, z) {
  const n = rows.length, Z = z || 1;
  for (let ry = 0; ry < n; ry++) {
    const row = rows[ry];
    for (let rx = 0; rx < n; rx++) {
      const c = pal[row[flip ? n - 1 - rx : rx]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect((x + rx * Z) * s, (y + ry * Z) * s, s * Z, s * Z);
    }
  }
}
const px = (ctx, x, y, s, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, s, s); };
function blit32(ctx, grid, palette, x, y, s, flip) {
  const n = grid.length;
  for (let ry = 0; ry < n; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < n; rx++) {
      const v = row[flip ? n - 1 - rx : rx];
      if (v < 0) continue;
      ctx.fillStyle = palette[v];
      ctx.fillRect((x + rx) * s, (y + ry) * s, s, s);
    }
  }
}
const H32 = (typeof HERO32 !== 'undefined' && HERO32) ? HERO32
          : (typeof module === 'object' ? (function(){ try { return require('../assets/hero32.js'); } catch(e){ return null; } })() : null);
function drawHero(ctx, frameName, S, x, y) {
  if (H32 && H32.frames[frameName]) { blit32(ctx, H32.frames[frameName], H32.palette, x, y, S.s); return; }
  const fb = { idle0: CH.idle0, idle1: CH.idle1, walk0: CH.walk0, walk1: CH.walk1,
               curl: CH.curl, shrug: CH.shrug, cheer: CH.cheer }[frameName] || CH.idle0;
  blit(ctx, fb, S.pal, x, y, S.s, false, 2);
}
const heroIdleF = t => (t % 8 < 4 ? 'idle0' : 'idle1');
const heroStepF = t => (t % 4 < 2 ? 'walk0' : 'walk1');
function rect(ctx, x, y, w, h, s, c) { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); }

/* ═══ 3. 调色 ═══ */
function palOf(wx, opts = {}) {
  const c = DS.wuXing[wx] || DS.wuXing['木'];
  return {
    o: opts.silhouette ? c.dark : '#0E0B14',
    b: opts.silhouette ? c.dark : c.base,
    h: opts.silhouette ? c.dark : c.light,
    d: opts.silhouette ? c.dark : c.dark,
    s: opts.silhouette ? c.dark : '#F0D2B4',
    e: opts.silhouette ? c.dark : '#0E0B14',
  };
}
const GHOST = { o:'#2B2444', b:'#3A3159', h:'#443A6B', d:'#241C3D', s:'#3A3159', e:'#241C3D' };

/* ═══ 4. 场景 ═══
 * 每个场景 draw(ctx, t, S)：t 是帧号（8fps），S 是共享上下文 {chart, W, H, s, pal}
 * 一个字都不写 —— 回答由动作完成。
 */
const W = 120, H = 48;      // 逻辑像素（画布小一点，同样宽度下每个像素更大）
const GROUND = 26;          // 人物落脚基线：地面线在 GROUND+14
const CX = W / 2 - 8;       // 剪影（1×）居中时的左上角 x
const FEET = GROUND - 2;    // 剪影（1×）左上角 y
const Z = 2;                // 主角放大倍数：前景 2×，背景剪影 1×，靠大小拉开纵深
const CX2 = W / 2 - 16;     // 主角（2×）居中时的左上角 x
const FEET2 = 12;           // 主角（2×）左上角 y —— 脚正好落在地面线上

function drawGround(ctx, s, color) { rect(ctx, 0, GROUND + 14, W, 2, s, color || '#241C3D'); }
const FIRE = { o:'#7A1E1E', b:'#F0553D', h:'#FFA36B' };
const COIN = { o:'#9C7508', b:'#F5C542', h:'#FFE79A' };
const bob = t => (t % 8 < 4 ? CH.idle0 : CH.idle1);
const step = t => (t % 4 < 2 ? CH.walk0 : CH.walk1);

const SCENES = {

  /* 本人 —— 五行粒子绕着他转，量多的绕得密 */
  self: {
    label: '你',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      let i = 0;
      for (const [wx, v] of Object.entries(S.chart.wuXing.percent)) {
        const n = Math.max(1, Math.round(v / 7)), col = DS.wuXing[wx];
        for (let k = 0; k < n; k++) {
          const a = t * 0.07 + i * 1.3 + k * (6.283 / n);
          px(ctx, Math.round(W / 2 + Math.cos(a) * (20 + i * 5)),
                  Math.round(GROUND + 4 + Math.sin(a) * (8 + i * 2)), S.s, col.base);
        }
        i++;
      }
      drawHero(ctx, heroIdleF(t), S, CX2, FEET2);
      if (t % 16 < 10) blit(ctx, PROP.flame, FIRE, CX2 + 34, GROUND + 6, S.s);   // 自带的那点火
    },
  },

  /* 父母 —— 城墙围着他 */
  family: {
    label: '父母宫',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      const bp = { o:'#6B4415', b:'#D98E36', h:'#F5C97A' };
      for (let y = 0; y < 4; y++) for (const bx of [14, 98]) blit(ctx, PROP.brick, bp, bx, 32 - y * 8, S.s);
      drawHero(ctx, heroIdleF(t), S, CX2, FEET2);
      if (t % 24 < 12) for (let k = 0; k < 4; k++) px(ctx, 4 + k * 2, 6 + k * 2, S.s, '#443A6B'); // 进不来的光
    },
  },

  /* 同辈 —— 两个剪影，金币从他这儿飘走 */
  peers: {
    label: '兄弟宫',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      blit(ctx, CH.idle0, GHOST, 6, FEET, S.s);
      blit(ctx, CH.idle0, GHOST, 98, FEET, S.s, true);
      drawHero(ctx, heroIdleF(t), S, CX2, FEET2);
      const k = (t % 32) / 32;
      blit(ctx, PROP.coin, COIN, Math.round(CX2 - 2 - k * 30), Math.round(GROUND + 2 - k * 8), S.s);
    },
  },

  /* 伴侣 —— 伞下两人 + 挤进来的第三个影子 + 脚下裂缝 */
  love: {
    label: '配偶宫',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      const up = { o:'#1B7F6B', b:'#5CE1C4' };
      for (let x = 0; x < 32; x++) {
        const yy = 6 + Math.round(Math.abs(x - 16) * 0.3);
        px(ctx, 34 + x, yy, S.s, up.b); px(ctx, 34 + x, yy + 1, S.s, up.o);
      }
      rect(ctx, 49, 8, 1, 10, S.s, up.o);
      blit(ctx, CH.idle0, GHOST, 60, FEET, S.s, true);              // 伴侣
      drawHero(ctx, heroIdleF(t), S, 22, FEET2);
      const k = Math.sin(t * 0.09);
      blit(ctx, CH.idle0, { ...GHOST, b:'#4A55A8', h:'#4A55A8' },   // 第三个影子（劫财）
           Math.round(96 - k * 10), FEET, S.s, true);
      for (let x = 0; x < 26; x++) px(ctx, 24 + x, GROUND + 14 + (x % 3 ? 0 : 1), S.s, '#0E0B14'); // 裂缝
    },
  },

  /* 钱 —— 币多半漏掉，右边（晚年）才有筐接住 */
  wealth: {
    label: '财',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      for (let i = 0; i < 6; i++) {
        const y = ((t * 2 + i * 17) % 62) - 8;
        if (y > GROUND + 12) continue;
        blit(ctx, PROP.coin, COIN, 10 + i * 15, y, S.s);
      }
      const bp = { o:'#8A8270', b:'#DDD6C0' };
      rect(ctx, 96, GROUND + 6, 18, 2, S.s, bp.b);
      rect(ctx, 96, GROUND + 6, 2, 8, S.s, bp.o);
      rect(ctx, 112, GROUND + 6, 2, 8, S.s, bp.o);
      drawHero(ctx, heroIdleF(t), S, 12, FEET2);
    },
  },

  /* 事业 —— 一排火把只有最后一支亮，他往那边走 */
  career: {
    label: '事业',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      const off = { o:'#33285A', b:'#443A6B', h:'#443A6B' };
      for (let i = 0; i < 5; i++) {
        const x = 8 + i * 23;
        rect(ctx, x + 3, GROUND + 2, 2, 12, S.s, '#443A6B');
        const on = (i === 4 && t % 8 < 6) || (i === 3 && t % 40 < 3);
        blit(ctx, PROP.flame, on ? FIRE : off, x, GROUND - 6, S.s);
      }
      drawHero(ctx, heroStepF(t), S, Math.round(2 + ((t * 1.4) % 88)), FEET2);
    },
  },

  /* 身体 —— 下雨，抱着，胸口一小簇火忽明忽暗 */
  health: {
    label: '体质',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      for (let i = 0; i < 22; i++) {
        const x = (i * 11 + 3) % W, y = (t * 3 + i * 9) % (GROUND + 14);
        px(ctx, x, y, S.s, '#3D9BE8'); px(ctx, x, y + 1, S.s, '#12386B');
      }
      drawHero(ctx, 'curl', S, CX2, FEET2);
      if (t % 12 < 7) blit(ctx, PROP.flame, FIRE, W / 2 - 4, GROUND + 6, S.s);
    },
  },

  /* 四段路 —— 走过四块地砖，砖色 = 该柱五行 */
  future: {
    label: '人生四段',
    draw(ctx, t, S) {
      const P = ['year', 'month', 'day', 'hour'];
      P.forEach((p, i) => {
        const c = DS.wuXing[S.chart.pillars[p].ganWuXing];
        rect(ctx, 4 + i * 28, GROUND + 14, 26, 3, S.s, c.base);
        rect(ctx, 4 + i * 28, GROUND + 17, 26, 2, S.s, c.dark);
      });
      const wx = 4 + ((t * 1.1) % 108);
      drawHero(ctx, heroStepF(t), S, Math.round(wx), FEET2);
      const c = DS.wuXing[S.chart.pillars[P[Math.min(3, Math.floor((wx - 4) / 28))]].ganWuXing];
      px(ctx, Math.round(wx) + 7, GROUND - 6, S.s, c.light);
      px(ctx, Math.round(wx) + 8, GROUND - 6, S.s, c.light);
    },
  },

  /* 表达 —— 印重伤官轻：话堵在头顶出不来 */
  express: {
    label: '表达',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      rect(ctx, W / 2 - 16, 8, 32, 3, S.s, '#5CE1C4');
      for (let i = 0; i < 5; i++) {
        const y = GROUND - 4 - ((t * 3 + i * 13) % 26) * 0.5;
        if (y < 12) continue;
        px(ctx, W / 2 - 6 + i * 3, Math.round(y), S.s, '#FF8FD1');
      }
      drawHero(ctx, heroIdleF(t), S, CX2, FEET2);
    },
  },

  /* 答不了 —— 摊手 */
  unknown: {
    label: '这个盘上看不出来',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      drawHero(ctx, 'shrug', S, CX2, FEET2);
      if (t % 16 < 11) blit(ctx, PROP.qmark, { o:'#443A6B', b:'#8579B0', h:'#C6BCE6' }, CX2 + 34, GROUND - 6, S.s);
    },
  },

  /* 越界的问题 —— 摇头 + 禁止圈 */
  boundary: {
    label: '这个不算',
    draw(ctx, t, S) {
      drawGround(ctx, S.s);
      drawHero(ctx, 'shrug', S, CX2 + (t % 12 < 6 ? -1 : 1), FEET2);
      const cx = W / 2 + 22, cy = GROUND + 4, r = 7;
      for (let a = 0; a < 6.283; a += 0.13)
        px(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), S.s, '#FF5C6E');
      for (let k = -r; k <= r; k++) px(ctx, Math.round(cx + k * 0.7), Math.round(cy + k * 0.7), S.s, '#FF5C6E');
    },
  },
};

/* ═══ 5. 问题 → 场景 路由 ═══ */
const ROUTES = [
  { scene: 'boundary', kw: ['死','寿命','阳寿','大限','活多久','什么时候死','绝症','癌','自杀','出事','车祸','血光','命短','能活'] },
  { scene: 'love',     kw: ['感情','爱情','对象','伴侣','老婆','妻子','女朋友','男朋友','结婚','桃花','喜欢','脱单','分手','复合','婚姻','另一半','暗恋','相亲'] },
  { scene: 'wealth',   kw: ['钱','财','收入','工资','赚','富','穷','存款','投资','理财','买房','负债','发财','副业'] },
  { scene: 'career',   kw: ['事业','工作','职业','跳槽','创业','老板','升职','公司','上班','辞职','行业','考公','读研','前途','发展'] },
  { scene: 'health',   kw: ['健康','身体','体质','累','睡','精力','养生','状态','疲','虚','冷','湿'] },
  { scene: 'family',   kw: ['父母','爸','妈','家里','原生','长辈','家庭','出身'] },
  { scene: 'peers',    kw: ['朋友','同事','兄弟','姐妹','同学','合伙','人际','社交','同辈','圈子'] },
  { scene: 'express',  kw: ['表达','说','写','沟通','社恐','内向','话','创作','作品','才华'] },
  { scene: 'future',   kw: ['大运','流年','今年','明年','未来','以后','运势','什么时候','几岁','阶段','转运'] },
  { scene: 'self',     kw: ['我是','性格','人','自己','命','八字','怎么样','特点'] },
];

function route(q) {
  const s = (q || '').trim();
  if (!s) return 'self';
  for (const r of ROUTES) if (r.kw.some(k => s.includes(k))) return r.scene;
  return 'unknown';
}

/* ═══ 5.5 脚本解释器 —— LLM 输出 DSL（见 DSL.md），这里解释执行 ═══ */
const SPRITES_OK = {
  hero:['idle','walk','curl','shrug','cheer'], ghost:['idle','approach'], rival:['idle','approach'],
  coin:['fall','drift'], flame:['blink','steady'], torch:['lit','off','flicker'],
  basket:[], umbrella:[], wall:[], lid:[], bubbles:['rise'], crack:[], qmark:['blink'], ban:[], orbit:['wuxing'], tiles:[],
};

function validateScript(sc) {
  const err = m => { const e = new Error(m); e.script = sc; throw e; };
  if (!sc || typeof sc !== 'object') err('脚本不是对象');
  if (!sc.caption || typeof sc.caption !== 'string') err('caption 必填');
  if ([...sc.caption].length > 60) err('caption 超过 60 字');
  const out = {
    caption: sc.caption,
    duration: Math.min(20, Math.max(10, +sc.duration || 15)),
    backdrop: ['ground','rain','none'].includes(sc.backdrop) ? sc.backdrop : 'ground',
    actors: [],
  };
  for (const a of (sc.actors || []).slice(0, 12)) {
    if (!SPRITES_OK.hasOwnProperty(a.sprite)) err('未知 sprite: ' + a.sprite);
    const ok = SPRITES_OK[a.sprite];
    if (a.behavior && ok.length && !ok.includes(a.behavior)) err(a.sprite + ' 不支持 behavior: ' + a.behavior);
    out.actors.push({ ...a, behavior: a.behavior || ok[0] || null });
  }
  if (!out.actors.length) err('actors 为空');
  return out;
}

function drawActor(ctx, t, S, a) {
  const s = S.s, num = (v, d) => (typeof v === 'number' ? v : d);
  const rng = Array.isArray(a.range) ? a.range : [8, 96];
  switch (a.sprite) {
    case 'hero': {
      let x = num(a.x, W / 2 - 16);
      let fr = heroIdleF(t);
      if (a.behavior === 'walk') { const span = Math.max(8, rng[1] - rng[0] - 32); x = rng[0] + ((t * (a.speed || 1) * 1.2) % span); fr = heroStepF(t); }
      else if (a.behavior === 'curl') fr = 'curl';
      else if (a.behavior === 'shrug') fr = 'shrug';
      else if (a.behavior === 'cheer') fr = (t % 8 < 4 ? 'cheer' : 'idle0');
      drawHero(ctx, fr, S, Math.round(x), FEET2);
      break;
    }
    case 'ghost': case 'rival': {
      const palG = a.sprite === 'rival' ? { ...GHOST, b:'#4A55A8', h:'#4A55A8' } : GHOST;
      let x = num(a.x, 92);
      if (a.behavior === 'approach') x = (rng[0] + rng[1]) / 2 - Math.sin(t * 0.09) * ((rng[1] - rng[0]) / 2);
      blit(ctx, CH.idle0, palG, Math.round(x), FEET, s, num(a.x, 92) > W / 2);
      break;
    }
    case 'coin': {
      if (a.behavior === 'drift') {
        const f = Array.isArray(a.from) ? a.from : [56, 30], to = Array.isArray(a.to) ? a.to : [10, 22];
        const k = (t % 32) / 32;
        blit(ctx, PROP.coin, COIN, Math.round(f[0] + (to[0] - f[0]) * k), Math.round(f[1] + (to[1] - f[1]) * k), s);
      } else {
        const n = Math.min(8, a.count || 4);
        for (let i = 0; i < n; i++) {
          const y = ((t * 2 + i * (a.period || 17)) % 62) - 8;
          if (y > GROUND + 12) continue;
          blit(ctx, PROP.coin, COIN, num(a.x, 10) + i * 15, y, s);
        }
      }
      break;
    }
    case 'flame': {
      if (a.behavior === 'steady' || t % 12 < 7) blit(ctx, PROP.flame, FIRE, num(a.x, 76), num(a.y, 30), s);
      break;
    }
    case 'torch': {
      const x = num(a.x, 60);
      rect(ctx, x + 3, GROUND + 2, 2, 12, s, '#443A6B');
      const on = a.behavior === 'lit' ? (t % 8 < 6) : a.behavior === 'flicker' ? (t % 40 < 3) : false;
      blit(ctx, PROP.flame, on ? FIRE : { o:'#33285A', b:'#443A6B', h:'#443A6B' }, x, GROUND - 6, s);
      break;
    }
    case 'basket': {
      const x = num(a.x, 96), bp = { o:'#8A8270', b:'#DDD6C0' };
      rect(ctx, x, GROUND + 6, 18, 2, s, bp.b); rect(ctx, x, GROUND + 6, 2, 8, s, bp.o); rect(ctx, x + 16, GROUND + 6, 2, 8, s, bp.o);
      break;
    }
    case 'umbrella': {
      const x = num(a.x, 34), up = { o:'#1B7F6B', b:'#5CE1C4' };
      for (let i = 0; i < 32; i++) { const yy = 6 + Math.round(Math.abs(i - 16) * 0.3); px(ctx, x + i, yy, s, up.b); px(ctx, x + i, yy + 1, s, up.o); }
      rect(ctx, x + 15, 8, 1, 10, s, up.o);
      break;
    }
    case 'wall': {
      const bp = { o:'#6B4415', b:'#D98E36', h:'#F5C97A' };
      for (let y = 0; y < 4; y++) blit(ctx, PROP.brick, bp, num(a.x, 14), 32 - y * 8, s);
      break;
    }
    case 'lid': rect(ctx, num(a.x, W / 2 - 16), num(a.y, 8), num(a.w, 32), 3, s, '#5CE1C4'); break;
    case 'bubbles': {
      const n = Math.min(8, a.count || 5), ceil = num(a.ceiling, 12);
      for (let i = 0; i < n; i++) {
        const y = GROUND - 4 - ((t * 3 + i * 13) % 26) * 0.5;
        if (y < ceil) continue;
        px(ctx, num(a.x, W / 2 - 6) + i * 3, Math.round(y), s, '#FF8FD1');
      }
      break;
    }
    case 'crack': { for (let i = 0; i < num(a.len, 20); i++) px(ctx, num(a.x, 30) + i, GROUND + 14 + (i % 3 ? 0 : 1), s, '#0E0B14'); break; }
    case 'qmark': { if (t % 16 < 11) blit(ctx, PROP.qmark, { o:'#443A6B', b:'#8579B0', h:'#C6BCE6' }, num(a.x, 84), num(a.y, 20), s); break; }
    case 'ban': {
      const cx = num(a.x, 82), cy = num(a.y, 30), r = 7;
      for (let ag = 0; ag < 6.283; ag += 0.13) px(ctx, Math.round(cx + Math.cos(ag) * r), Math.round(cy + Math.sin(ag) * r), s, '#FF5C6E');
      for (let k = -r; k <= r; k++) px(ctx, Math.round(cx + k * 0.7), Math.round(cy + k * 0.7), s, '#FF5C6E');
      break;
    }
    case 'tiles': {
      ['year','month','day','hour'].forEach((pk, i) => {
        const c = DS.wuXing[S.chart.pillars[pk].ganWuXing];
        rect(ctx, 4 + i * 28, GROUND + 14, 26, 3, s, c.base);
        rect(ctx, 4 + i * 28, GROUND + 17, 26, 2, s, c.dark);
      });
      break;
    }
    case 'orbit': {
      let i = 0;
      for (const [wx, v] of Object.entries(S.chart.wuXing.percent)) {
        const n = Math.max(1, Math.round(v / 7)), col = DS.wuXing[wx];
        for (let k = 0; k < n; k++) {
          const ag = t * 0.07 + i * 1.3 + k * (6.283 / n);
          px(ctx, Math.round(W / 2 + Math.cos(ag) * (20 + i * 5)), Math.round(GROUND + 4 + Math.sin(ag) * (8 + i * 2)), s, col.base);
        }
        i++;
      }
      break;
    }
  }
}

function drawScript(ctx, t, S, sc) {
  if (sc.backdrop !== 'none') drawGround(ctx, S.s);
  if (sc.backdrop === 'rain')
    for (let i = 0; i < 22; i++) {
      const x = (i * 11 + 3) % W, y = (t * 3 + i * 9) % (GROUND + 14);
      px(ctx, x, y, S.s, '#3D9BE8'); px(ctx, x, y + 1, S.s, '#12386B');
    }
  for (const a of sc.actors) drawActor(ctx, t, S, a);
}

/* ═══ 6. 播放器 ═══ */
function mount(canvas, chart, opts = {}) {
  const s = opts.scale || 6;
  canvas.width = W * s; canvas.height = H * s;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const S = { chart, s, W, H, pal: palOf(chart.dayMaster.wuXing) };
  const fps = DS.motion.fps || 8;
  let scene = 'self', script = null, t = 0, timer = null;

  function frame() {
    ctx.fillStyle = '#0E0B14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (script) { drawScript(ctx, t % (script.duration * fps), S, script); }
    else (SCENES[scene] || SCENES.unknown).draw(ctx, t, S);
    t++;
  }
  function start() { stop(); frame(); timer = setInterval(frame, 1000 / fps); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  start();
  return {
    play(name) { if (SCENES[name]) { scene = name; script = null; t = 0; } },
    playScript(sc) { script = validateScript(sc); t = 0; return script; },
    ask(q) { const n = route(q); this.play(n); return { scene: n, label: (SCENES[n] || {}).label || '' }; },
    current() { return script ? 'script' : scene; },
    stop, start,
  };
}

return { mount, route, validateScript, SCENES, ROUTES, CH, PROP, W, H, GROUND };
});
