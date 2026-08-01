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

// 常用城市经纬度（扩展用；找不到时要求调用方直接传经度）
const CITIES = {
  '北京':[116.41,39.90], '上海':[121.47,31.23], '广州':[113.26,23.13], '深圳':[114.06,22.55],
  '杭州':[120.15,30.28], '南京':[118.80,32.06], '成都':[104.07,30.57], '重庆':[106.55,29.56],
  '武汉':[114.31,30.52], '西安':[108.94,34.34], '天津':[117.20,39.13], '沈阳':[123.43,41.80],
  '哈尔滨':[126.53,45.80],'长沙':[112.94,28.23], '郑州':[113.63,34.75], '济南':[117.00,36.65],
  '青岛':[120.38,36.07], '福州':[119.30,26.08], '厦门':[118.09,24.48], '昆明':[102.71,25.05],
  '贵阳':[106.63,26.65], '南宁':[108.37,22.82], '合肥':[117.28,31.86], '南昌':[115.89,28.68],
  '太原':[112.55,37.87], '石家庄':[114.50,38.05],'兰州':[103.82,36.06],'银川':[106.28,38.47],
  '西宁':[101.78,36.62], '乌鲁木齐':[87.62,43.79],'呼和浩特':[111.75,40.84],'拉萨':[91.11,29.65],
  '海口':[110.35,20.02], '香港':[114.17,22.32], '澳门':[113.55,22.20], '台北':[121.52,25.03],
};

module.exports = { toTrueSolar, equationOfTimeMinutes, CITIES };
