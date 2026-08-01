'use strict';
/**
 * 宫位 —— V2/V3 的输入数据
 *
 * 两套并行的「六亲定位」，因为 Dan 的方法论里它们来源不同：
 *   1) 柱位宫  —— 父母/配偶/子女，看柱位（年月日时）           ← V2 粗读、V3 精读
 *   2) 十神六亲 —— 亲戚、朋友、兄弟姐妹、长辈，看十神          ← Dan: 「亲戚好友通过别的推」
 *
 * 年龄段 ✅ 跟起运岁数挂钩，不用 16/32/48 等分。
 */
const T = require('./tables');

/* ── 柱位宫 ────────────────────────────────────────────────
 * ✅ Dan 确认：父母宫在【年柱】（不是月柱）
 */
const PILLAR_PALACE = {
  year:  { palace: '父母宫', also: ['祖辈', '出身背景'], note: '✅ Dan 确认父母在年柱' },
  month: { palace: '兄弟宫', also: ['家庭环境', '青年际遇'], note: '✅ Dan 确认' },
  day:   { palace: '配偶宫', also: ['自身'], note: '日干=自己，日支=配偶' },
  hour:  { palace: '子女宫', also: ['晚年', '事业终局'], note: '' },
};

/* ── 十神六亲 ──────────────────────────────────────────────
 * 男命(乾)/女命(坤) 有别的地方分开写。
 */
const SHISHEN_KIN = {
  比肩: { all: ['兄弟姐妹', '同辈朋友', '合作者'], tone: '同盟' },
  劫财: { all: ['同辈竞争者', '不太省心的朋友', '合伙人'], tone: '同盟带摩擦' },
  食神: { male: ['晚辈', '学生', '作品'], female: ['女儿', '子女'], tone: '产出' },
  伤官: { male: ['晚辈', '作品'], female: ['儿子', '子女'], tone: '产出带锋芒' },
  正财: { male: ['妻子', '稳定收入'], female: ['稳定收入'], tone: '所得' },
  偏财: { all: ['父亲'], male: ['情人', '意外之财'], female: ['意外之财'], tone: '所得' },
  正官: { male: ['女儿', '上司'], female: ['丈夫', '上司'], tone: '约束' },
  七杀: { male: ['儿子', '严厉的上级'], female: ['情人', '压力源'], tone: '约束带压迫' },
  正印: { all: ['母亲', '老师', '庇护者'], tone: '滋养' },
  偏印: { all: ['继母/偏门长辈', '偏才的师承'], tone: '滋养带疏离' },
};

/**
 * 年龄段划分 —— ✅ 跟起运岁数挂钩
 * @param {number} qiYunAge 起运岁数
 * @param {object} cfg { stepsPerPillar }
 *
 * ✅ Dan 确认：stepsPerPillar = 2（每柱管 2 步大运 = 20 年）
 *   年柱: 0 → 起运                （起运前，完全受父母影响 —— 跟「父母宫在年柱」自洽）
 *   月柱: 起运 → 起运+20
 *   日柱: 起运+20 → 起运+40
 *   时柱: 起运+40 → 终
 *
 * 备选 stepsPerPillar = 3（每柱 30 年），四柱覆盖更长的人生跨度。
 */
function ageBands(qiYunAge, cfg = {}) {
  const per = (cfg.stepsPerPillar ?? 2) * 10;
  const q = Math.round(qiYunAge * 10) / 10;
  return [
    { pillar: 'year',  label: '年柱', from: 0,         to: q,           desc: '起运前' },
    { pillar: 'month', label: '月柱', from: q,         to: q + per,     desc: `第 1–${cfg.stepsPerPillar ?? 2} 步大运` },
    { pillar: 'day',   label: '日柱', from: q + per,   to: q + per * 2, desc: `第 ${(cfg.stepsPerPillar ?? 2) + 1}–${(cfg.stepsPerPillar ?? 2) * 2} 步大运` },
    { pillar: 'hour',  label: '时柱', from: q + per * 2, to: null,      desc: '之后' },
  ];
}

/**
 * @param {object} pillars paipan 产出的 pillars
 * @param {'male'|'female'} gender
 * @param {number} qiYunAge
 * @param {object} cfg
 */
function calcPalaces(pillars, gender, qiYunAge, cfg = {}) {
  const g = gender === 'female' ? 'female' : 'male';
  const bands = ageBands(qiYunAge, cfg);

  // 1) 柱位宫
  const byPillar = {};
  for (const [p, def] of Object.entries(PILLAR_PALACE)) {
    const band = bands.find(b => b.pillar === p);
    byPillar[p] = {
      label: pillars[p].label,
      ganZhi: pillars[p].ganZhi,
      palace: def.palace,
      also: def.also,
      note: def.note,
      ageFrom: band.from, ageTo: band.to, ageDesc: band.desc,
      // V2 粗读用：柱的干支表面
      surface: {
        gan: pillars[p].gan, zhi: pillars[p].zhi,
        shiShenGan: pillars[p].shiShenGan,
        ganWuXing: pillars[p].ganWuXing, zhiWuXing: pillars[p].zhiWuXing,
      },
      // V3 精读用：藏干 + 坐支关系（✅ Dan 确认这两样都要）
      deep: {
        hideGan: pillars[p].hideGan,
        changSheng: pillars[p].changSheng,
        diShi: pillars[p].diShi,
        shiShenZhi: pillars[p].shiShenZhi,
      },
    };
  }

  // 2) 十神六亲 —— 亲戚/朋友/长辈走这条线
  const kin = {};
  const seen = {};
  for (const p of Object.keys(pillars)) {
    const push = (ss, where, weight) => {
      if (!ss || ss === '日主') return;
      const def = SHISHEN_KIN[ss];
      if (!def) return;
      const roles = [...(def.all || []), ...(def[g] || [])];
      seen[ss] = (seen[ss] || 0) + weight;
      for (const r of roles) {
        kin[r] = kin[r] || { roles: r, viaShiShen: new Set(), at: [], strength: 0, tone: def.tone };
        kin[r].viaShiShen.add(ss);
        kin[r].at.push(`${pillars[p].label}${where}`);
        kin[r].strength += weight;
      }
    };
    push(pillars[p].shiShenGan, '干', 1);
    for (const h of pillars[p].hideGan) push(h.shiShen, `支藏${h.gan}`, h.weight);
  }
  const kinList = Object.values(kin)
    .map(k => ({ ...k, viaShiShen: [...k.viaShiShen], strength: +k.strength.toFixed(2) }))
    .sort((a, b) => b.strength - a.strength);

  return {
    byPillar,
    ageBands: bands,
    kinByShiShen: kinList,
    shiShenWeight: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, +v.toFixed(2)])),
    config: { stepsPerPillar: cfg.stepsPerPillar ?? 2, qiYunAge: +qiYunAge.toFixed(2) },
  };
}

module.exports = { calcPalaces, ageBands, PILLAR_PALACE, SHISHEN_KIN };
