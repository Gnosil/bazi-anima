'use strict';
/**
 * L1 排盘引擎 —— 确定性计算，输出 chart.json
 *
 * 设计原则：这一层只出「事实」，不出「判断」。
 * 任何带流派色彩的取舍都必须走 config，并原样写进 meta.config 以便追溯。
 */
const { Solar, Lunar } = require('lunar-javascript');
const T = require('./tables');
const DEFAULT_CONFIG = require('./config');
const { toTrueSolar, CITIES } = require('./solartime');
const { calcShenSha } = require('./shensha');
const { calcRelations, calcWuXing, calcWangShuai } = require('./relations');
const { calcPalaces } = require('./palaces');

const SCHEMA_VERSION = '0.1.0';
const PILLARS = ['year', 'month', 'day', 'hour'];
const CN = { year: '年', month: '月', day: '日', hour: '时' };

function changSheng(dayGan, zhi) {
  const start = T.CHANG_SHENG_START[dayGan];
  const dir = T.GAN_YINYANG[dayGan] === '阳' ? 1 : -1;
  const si = T.ZHI.indexOf(start), zi = T.ZHI.indexOf(zhi);
  const step = ((zi - si) * dir + 12) % 12;
  return T.CHANG_SHENG_ORDER[step];
}

/**
 * @param {object} input
 * @param {'solar'|'lunar'} [input.calendar='solar']
 * @param {number} input.year @param {number} input.month @param {number} input.day
 * @param {number} input.hour @param {number} [input.minute=0]
 * @param {boolean} [input.isLeapMonth=false] 农历闰月
 * @param {'male'|'female'} input.gender
 * @param {string} [input.city] 出生城市（用于真太阳时）
 * @param {number} [input.longitude] 出生地经度，优先于 city
 * @param {number} [input.tzOffset=8] 时区
 * @param {string} [input.name]
 * @param {object} [cfgOverride]
 */
function paipan(input, cfgOverride = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...cfgOverride };
  const minute = input.minute ?? 0;
  const tzOffset = input.tzOffset ?? 8;

  // —— 真太阳时校正 ——
  let lon = input.longitude;
  if (lon == null && input.city && CITIES[input.city]) lon = CITIES[input.city][0];
  let clock = { y: input.year, m: input.month, d: input.day, h: input.hour, mi: minute };
  let solarCal = clock;

  if (input.calendar === 'lunar') {
    const l = Lunar.fromYmdHms(input.year, (input.isLeapMonth ? -1 : 1) * input.month,
                               input.day, input.hour, minute, 0);
    const s = l.getSolar();
    clock = { y: s.getYear(), m: s.getMonth(), d: s.getDay(), h: input.hour, mi: minute };
    solarCal = clock;
  }

  let corrected = { ...clock, offsetMinutes: 0, parts: { lon: 0, eot: 0 } };
  const doCorrect = lon != null && (cfg.trueSolarTime.longitude || cfg.trueSolarTime.equationOfTime);
  if (doCorrect) corrected = toTrueSolar(clock, lon, tzOffset, cfg.trueSolarTime);

  // —— 排盘 ——
  const solar = Solar.fromYmdHms(corrected.y, corrected.m, corrected.d, corrected.h, corrected.mi, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  ec.setSect(cfg.ziShi === 'early' ? 2 : 1); // 1=晚子时(次日) 2=早子时(当日)

  const gz = { year: ec.getYear(), month: ec.getMonth(), day: ec.getDay(), hour: ec.getTime() };
  const gan = {}, zhi = {};
  for (const p of PILLARS) { gan[p] = gz[p][0]; zhi[p] = gz[p][1]; }
  const dayGan = gan.day;

  const pillars = {};
  const getters = {
    year:  ['getYearShiShenGan','getYearShiShenZhi','getYearHideGan','getYearNaYin','getYearXunKong','getYearDiShi'],
    month: ['getMonthShiShenGan','getMonthShiShenZhi','getMonthHideGan','getMonthNaYin','getMonthXunKong','getMonthDiShi'],
    day:   ['getDayShiShenGan','getDayShiShenZhi','getDayHideGan','getDayNaYin','getDayXunKong','getDayDiShi'],
    hour:  ['getTimeShiShenGan','getTimeShiShenZhi','getTimeHideGan','getTimeNaYin','getTimeXunKong','getTimeDiShi'],
  };
  for (const p of PILLARS) {
    const [sg, sz, hg, ny, xk, ds] = getters[p];
    const hideGan = T.ZHI_HIDE[zhi[p]].map(([g, kind, w]) => ({
      gan: g, kind, weight: w, wuXing: T.GAN_WUXING[g], shiShen: T.shiShen(dayGan, g),
    }));
    pillars[p] = {
      label: CN[p],
      ganZhi: gz[p],
      gan: gan[p], ganWuXing: T.GAN_WUXING[gan[p]], ganYinYang: T.GAN_YINYANG[gan[p]],
      zhi: zhi[p], zhiWuXing: T.ZHI_WUXING[zhi[p]], zhiYinYang: T.ZHI_YINYANG[zhi[p]],
      shiShenGan: p === 'day' ? '日主' : ec[sg](),
      shiShenZhi: ec[sz](),
      hideGan,
      naYin: ec[ny](),
      xunKong: ec[xk](),
      diShi: ec[ds](),
      changSheng: changSheng(dayGan, zhi[p]),
    };
  }

  const wuXing = calcWuXing(gan, zhi, cfg.wangShuaiWeights);
  const wangShuai = calcWangShuai(dayGan, wuXing);
  const relations = cfg.relations ? calcRelations(gan, zhi) : null;
  const shenSha = calcShenSha(gan, zhi, cfg.shenSha);

  const shiShenCount = {};
  for (const p of PILLARS) {
    if (p !== 'day') shiShenCount[pillars[p].shiShenGan] = (shiShenCount[pillars[p].shiShenGan] || 0) + 1;
    for (const h of pillars[p].hideGan) shiShenCount[h.shiShen] = (shiShenCount[h.shiShen] || 0) + 0.5;
  }

  // —— 大运 ——
  const yun = ec.getYun(input.gender === 'male' ? 1 : 0);
  const daYunList = yun.getDaYun().slice(0, cfg.daYunCount + 1);
  const daYun = daYunList.map((d, i) => {
    const dgz = d.getGanZhi();
    const item = {
      index: i,
      ganZhi: dgz || '(起运前)',
      startYear: d.getStartYear(), endYear: d.getEndYear(),
      startAge: d.getStartAge(), endAge: d.getEndAge(),
    };
    if (dgz) {
      item.gan = dgz[0]; item.zhi = dgz[1];
      item.ganWuXing = T.GAN_WUXING[dgz[0]]; item.zhiWuXing = T.ZHI_WUXING[dgz[1]];
      item.shiShenGan = T.shiShen(dayGan, dgz[0]);
      item.changSheng = changSheng(dayGan, dgz[1]);
      item.hideGan = T.ZHI_HIDE[dgz[1]].map(([g, kind]) => ({ gan: g, kind, shiShen: T.shiShen(dayGan, g) }));
    }
    const n = cfg.liuNianPerYun || 10;
    item.liuNian = d.getLiuNian().slice(0, n).map(ln => {
      const lgz = ln.getGanZhi();
      return {
        year: ln.getYear(), age: ln.getAge(), ganZhi: lgz,
        shiShenGan: T.shiShen(dayGan, lgz[0]),
        ganWuXing: T.GAN_WUXING[lgz[0]], zhiWuXing: T.ZHI_WUXING[lgz[1]],
      };
    });
    return item;
  });

  // —— 宫位（V2/V3 的输入）——
  const qiYunAge = (yun.getStartYear() || 0) + (yun.getStartMonth() || 0) / 12 + (yun.getStartDay() || 0) / 365;
  const palaces = calcPalaces(pillars, input.gender, qiYunAge, cfg.palaces || {});

  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      engine: 'bazi-anima/engine + lunar-javascript',
      config: cfg,
    },
    input: {
      name: input.name || null,
      gender: input.gender,
      calendar: input.calendar || 'solar',
      clockTime: `${clock.y}-${String(clock.m).padStart(2,'0')}-${String(clock.d).padStart(2,'0')} ${String(clock.h).padStart(2,'0')}:${String(clock.mi).padStart(2,'0')}`,
      birthplace: input.city || (lon != null ? `经度 ${lon}` : null),
      longitude: lon ?? null,
    },
    time: {
      trueSolarTime: `${corrected.y}-${String(corrected.m).padStart(2,'0')}-${String(corrected.d).padStart(2,'0')} ${String(corrected.h).padStart(2,'0')}:${String(corrected.mi).padStart(2,'0')}`,
      correctionMinutes: corrected.offsetMinutes,
      correctionParts: corrected.parts,
      applied: doCorrect,
      warning: doCorrect ? null : '未做真太阳时校正（缺出生地经度）——时柱可能有误',
    },
    solar: { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay(),
             hour: solar.getHour(), minute: solar.getMinute(), week: solar.getWeekInChinese() },
    lunar: { text: lunar.toString(), year: lunar.getYearInChinese(), month: lunar.getMonthInChinese(),
             day: lunar.getDayInChinese(), jieQi: lunar.getJieQi() || null,
             prevJieQi: lunar.getPrevJieQi(true).getName(), nextJieQi: lunar.getNextJieQi(true).getName() },
    bazi: `${gz.year} ${gz.month} ${gz.day} ${gz.hour}`,
    dayMaster: { gan: dayGan, wuXing: T.GAN_WUXING[dayGan], yinYang: T.GAN_YINYANG[dayGan] },
    pillars,
    wuXing,
    wangShuai,
    shiShenCount,
    relations,
    shenSha,
    palaces,
    qiYun: { text: yun.getStartYear() + '年' + yun.getStartMonth() + '月' + yun.getStartDay() + '日后起运',
             startSolar: yun.getStartSolar().toYmd(), forward: yun.isForward() },
    daYun,
  };
}

module.exports = { paipan, SCHEMA_VERSION };
