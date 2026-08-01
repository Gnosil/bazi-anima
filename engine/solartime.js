'use strict';
// 真太阳时校正：钟表时 -> 真太阳时
// 钟表时用的是时区标准经线（中国 = 东经 120°），真太阳时才是命理上的「时辰」。
// 两项修正：
//   1) 经度时差 = (出生地经度 - 时区标准经线) × 4 分钟/度
//   2) 均时差 (Equation of Time) = 真太阳时 - 平太阳时，全年在 -14 ~ +16 分钟之间摆动

// 均时差，输入 Date（用于取一年中的第几天），输出分钟。
// 采用 NOAA 常用的低阶近似，误差 < 30 秒，对定时柱足够。
function equationOfTimeMinutes(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const n = Math.floor((date - start) / 86400000) + 1; // day of year
  const B = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/**
 * @param {{y,m,d,h,mi}} clock 钟表时（当地时区）
 * @param {number} longitude 出生地经度，东经为正
 * @param {number} tzOffsetHours 时区偏移小时数（中国 = 8）
 * @param {{longitude:boolean, equationOfTime:boolean}} opts
 * @returns {{y,m,d,h,mi, offsetMinutes, parts:{lon:number, eot:number}}}
 */
function toTrueSolar(clock, longitude, tzOffsetHours, opts) {
  const standardMeridian = tzOffsetHours * 15;
  const lonMin = opts.longitude ? (longitude - standardMeridian) * 4 : 0;
  const utcGuess = new Date(Date.UTC(clock.y, clock.m - 1, clock.d, clock.h - tzOffsetHours, clock.mi));
  const eotMin = opts.equationOfTime ? equationOfTimeMinutes(utcGuess) : 0;
  const offset = lonMin + eotMin;

  const t = new Date(Date.UTC(clock.y, clock.m - 1, clock.d, clock.h, clock.mi));
  t.setUTCMinutes(t.getUTCMinutes() + Math.round(offset));
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    h: t.getUTCHours(), mi: t.getUTCMinutes(),
    offsetMinutes: Math.round(offset),
    parts: { lon: +lonMin.toFixed(2), eot: +eotMin.toFixed(2) },
  };
}

// 城市经度表 —— 由 geo.js（省→市全表）生成，市名直接查
const { PROVINCES, CITY_LON } = require('./geo');
const CITIES = new Proxy({}, { get: (_, k) => (k in CITY_LON ? [CITY_LON[k], 0] : undefined),
                               has: (_, k) => k in CITY_LON,
                               ownKeys: () => Object.keys(CITY_LON),
                               getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });

module.exports = { toTrueSolar, equationOfTimeMinutes, CITIES, PROVINCES, CITY_LON };
