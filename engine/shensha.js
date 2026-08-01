'use strict';
// 神煞查法。每个神煞返回 {name, ref, hits:[柱名]}，ref = 以什么为基准查的。
// 注意：神煞流派差异极大，这里只收「争议最小、实战最常用」的一批。
// 要加/减，改 tables.SHENSHA_DEFAULT 或 config.shenSha。

const T = require('./tables');
const PILLARS = ['year','month','day','hour'];
const PILLAR_CN = { year:'年', month:'月', day:'日', hour:'时' };

// 三合局归组：支 -> 局
const JU = {};
[[['申','子','辰'],'水'],[['寅','午','戌'],'火'],[['巳','酉','丑'],'金'],[['亥','卯','未'],'木']]
  .forEach(([zs, ju]) => zs.forEach(z => JU[z] = ju));

// 按局查表
const BY_JU = {
  桃花: { 水:'酉', 火:'卯', 金:'午', 木:'子' },
  驿马: { 水:'寅', 火:'申', 金:'亥', 木:'巳' },
  华盖: { 水:'辰', 火:'戌', 金:'丑', 木:'未' },
  将星: { 水:'子', 火:'午', 金:'酉', 木:'卯' },
  劫煞: { 水:'巳', 火:'亥', 金:'寅', 木:'申' },
  亡神: { 水:'亥', 火:'巳', 金:'申', 木:'寅' },
};

// 按天干查表（日干为主，年干为辅）
const BY_GAN = {
  天乙贵人: { 甲:['丑','未'],戊:['丑','未'],庚:['丑','未'], 乙:['子','申'],己:['子','申'],
             丙:['亥','酉'],丁:['亥','酉'], 壬:['卯','巳'],癸:['卯','巳'], 辛:['午','寅'] },
  文昌:    { 甲:['巳'],乙:['午'],丙:['申'],丁:['酉'],戊:['申'],己:['酉'],庚:['亥'],辛:['子'],壬:['寅'],癸:['卯'] },
  禄神:    { 甲:['寅'],乙:['卯'],丙:['巳'],丁:['午'],戊:['巳'],己:['午'],庚:['申'],辛:['酉'],壬:['亥'],癸:['子'] },
  羊刃:    { 甲:['卯'],丙:['午'],戊:['午'],庚:['酉'],壬:['子'] }, // 只取阳干（阴刃有争议，默认关）
  金舆:    { 甲:['辰'],乙:['巳'],丙:['未'],丁:['申'],戊:['未'],己:['申'],庚:['戌'],辛:['亥'],壬:['丑'],癸:['寅'] },
};

// 按年支查表
const HONG_LUAN = { 子:'卯',丑:'寅',寅:'丑',卯:'子',辰:'亥',巳:'戌',午:'酉',未:'申',申:'未',酉:'午',戌:'巳',亥:'辰' };
const TIAN_XI   = Object.fromEntries(Object.entries(HONG_LUAN)
  .map(([k,v]) => [k, T.ZHI[(T.ZHI.indexOf(v) + 6) % 12]]));
const GU_GUA = {
  亥:['寅','戌'],子:['寅','戌'],丑:['寅','戌'],
  寅:['巳','丑'],卯:['巳','丑'],辰:['巳','丑'],
  巳:['申','辰'],午:['申','辰'],未:['申','辰'],
  申:['亥','未'],酉:['亥','未'],戌:['亥','未'],
};

function hitsIn(zhiMap, targets) {
  const t = Array.isArray(targets) ? targets : [targets];
  return PILLARS.filter(p => t.includes(zhiMap[p])).map(p => PILLAR_CN[p]);
}

/**
 * @param {{year,month,day,hour}} gan  四柱天干
 * @param {{year,month,day,hour}} zhi  四柱地支
 * @param {string[]} enabled 启用的神煞名
 */
function calcShenSha(gan, zhi, enabled) {
  const list = enabled && enabled.length ? enabled : T.SHENSHA_DEFAULT;
  const out = [];
  const push = (name, ref, hits) => { if (hits.length) out.push({ name, ref, pillars: hits }); };

  // 以年支/日支各查一次三合局系
  for (const [name, table] of Object.entries(BY_JU)) {
    if (!list.includes(name)) continue;
    for (const [refKey, refZhi] of [['年支', zhi.year], ['日支', zhi.day]]) {
      const ju = JU[refZhi];
      if (!ju) continue;
      push(name, refKey, hitsIn(zhi, table[ju]));
    }
  }

  for (const [name, table] of Object.entries(BY_GAN)) {
    if (!list.includes(name)) continue;
    for (const [refKey, refGan] of [['日干', gan.day], ['年干', gan.year]]) {
      const t = table[refGan];
      if (!t) continue;
      push(name, refKey, hitsIn(zhi, t));
      if (name === '羊刃' || name === '禄神') break; // 这两个只以日干论
    }
  }

  if (list.includes('红鸾')) push('红鸾', '年支', hitsIn(zhi, HONG_LUAN[zhi.year]));
  if (list.includes('天喜')) push('天喜', '年支', hitsIn(zhi, TIAN_XI[zhi.year]));
  if (list.includes('孤辰') || list.includes('寡宿')) {
    const [gu, gua] = GU_GUA[zhi.year] || [];
    if (list.includes('孤辰')) push('孤辰', '年支', hitsIn(zhi, gu));
    if (list.includes('寡宿')) push('寡宿', '年支', hitsIn(zhi, gua));
  }

  // 去重合并（同名同柱只留一条，ref 合并）
  const merged = new Map();
  for (const s of out) {
    const key = s.name + '|' + s.pillars.join(',');
    if (merged.has(key)) merged.get(key).ref += '/' + s.ref;
    else merged.set(key, { ...s });
  }
  return [...merged.values()];
}

module.exports = { calcShenSha };
