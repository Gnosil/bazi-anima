'use strict';
// 四柱之间的刑冲合害会 —— 纯结构性事实，不做吉凶判断（吉凶归 L2 方法论层）
const T = require('./tables');
const PILLARS = ['year','month','day','hour'];
const CN = { year:'年', month:'月', day:'日', hour:'时' };

function pairsOf(map) {
  const out = [];
  for (let i = 0; i < PILLARS.length; i++)
    for (let j = i + 1; j < PILLARS.length; j++)
      out.push([PILLARS[i], PILLARS[j], map[PILLARS[i]], map[PILLARS[j]]]);
  return out;
}

function matchPair(list, a, b) {
  return list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function calcRelations(gan, zhi) {
  const R = { ganHe: [], ganChong: [], he: [], chong: [], hai: [], po: [], xing: [], sanHe: [], sanHui: [] };

  for (const [pa, pb, a, b] of pairsOf(gan)) {
    const he = T.GAN_HE.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (he) R.ganHe.push({ pillars: [CN[pa], CN[pb]], items: [a, b], huaTo: he[2] });
    if (matchPair(T.GAN_CHONG, a, b)) R.ganChong.push({ pillars: [CN[pa], CN[pb]], items: [a, b] });
  }

  for (const [pa, pb, a, b] of pairsOf(zhi)) {
    const P = [CN[pa], CN[pb]], I = [a, b];
    const he = T.LIU_HE.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (he) R.he.push({ pillars: P, items: I });
    if (matchPair(T.LIU_CHONG, a, b)) R.chong.push({ pillars: P, items: I });
    if (matchPair(T.LIU_HAI, a, b))   R.hai.push({ pillars: P, items: I });
    if (matchPair(T.LIU_PO, a, b))    R.po.push({ pillars: P, items: I });
    if (a === b && T.ZI_XING.includes(a)) R.xing.push({ pillars: P, items: I, type: '自刑' });
  }

  const allZhi = PILLARS.map(p => zhi[p]);
  const countOf = z => allZhi.filter(x => x === z).length;

  for (const [group, wx] of T.SAN_HE) {
    const present = group.filter(z => countOf(z) > 0);
    if (present.length === 3) R.sanHe.push({ items: group, huaTo: wx, full: true });
    else if (present.length === 2 && present.includes(group[1]))
      R.sanHe.push({ items: present, huaTo: wx, full: false, note: '半合（带旺支）' });
  }
  for (const [group, wx] of T.SAN_HUI) {
    const present = group.filter(z => countOf(z) > 0);
    if (present.length === 3) R.sanHui.push({ items: group, huaTo: wx, full: true });
  }
  for (const [group, type] of T.SAN_XING) {
    const present = group.filter(z => countOf(z) > 0);
    if (present.length === group.length) R.xing.push({ items: group, type, full: true });
    else if (group.length === 3 && present.length === 2)
      R.xing.push({ items: present, type, full: false, note: '两支相刑' });
  }
  return R;
}

// 五行力量量化。刻意做得「可解释」：每一分都能说出来自哪里。
function calcWuXing(gan, zhi, W) {
  const score = { 木:0, 火:0, 土:0, 金:0, 水:0 };
  const detail = [];
  const add = (wx, v, src) => { score[wx] += v; detail.push({ wuXing: wx, value: +v.toFixed(3), from: src }); };

  for (const p of PILLARS) {
    add(T.GAN_WUXING[gan[p]], W.gan, `${CN[p]}干 ${gan[p]}`);
    const base = p === 'month' ? W.monthZhi : p === 'day' ? W.dayZhi : W.otherZhi;
    for (const [hg, kind, w] of T.ZHI_HIDE[zhi[p]])
      add(T.GAN_WUXING[hg], base * w * W.hideMain, `${CN[p]}支 ${zhi[p]} 藏${hg}(${kind})`);
  }
  const total = Object.values(score).reduce((a, b) => a + b, 0) || 1;
  const pct = {};
  for (const k of Object.keys(score)) pct[k] = +((score[k] / total) * 100).toFixed(1);
  return {
    raw: Object.fromEntries(Object.entries(score).map(([k, v]) => [k, +v.toFixed(3)])),
    percent: pct,
    detail,
  };
}

// 日主旺衰：同党（比劫+印） vs 异党（食伤+财+官杀）
function calcWangShuai(dayGan, wuXing) {
  const me = T.GAN_WUXING[dayGan];
  const yin = Object.keys(T.SHENG).find(k => T.SHENG[k] === me);   // 生我
  const shi = T.SHENG[me];                                          // 我生
  const cai = T.KE[me];                                             // 我克
  const guan = Object.keys(T.KE).find(k => T.KE[k] === me);         // 克我
  const p = wuXing.percent;
  const ally = p[me] + p[yin];
  const foe  = p[shi] + p[cai] + p[guan];
  let label;
  if (ally >= 60) label = '偏强';
  else if (ally >= 52) label = '略强';
  else if (ally > 48) label = '中和';
  else if (ally > 40) label = '略弱';
  else label = '偏弱';
  return {
    allyPercent: +ally.toFixed(1),
    foePercent: +foe.toFixed(1),
    label,
    note: '仅为量化参考，最终强弱由 L2 方法论层判定（需考虑月令、通根、透干、调候）',
    map: { 比劫: me, 印: yin, 食伤: shi, 财: cai, 官杀: guan },
  };
}

module.exports = { calcRelations, calcWuXing, calcWangShuai };
