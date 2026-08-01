'use strict';
// ⚠️ 流派开关 —— 这些是「有分歧」的地方，默认值先按主流填，等 Dan 确认后改。
// 每一项都会原样写进 chart.json 的 meta.config，保证任何一张盘都能追溯是用什么规则算的。

module.exports = {
  // 早晚子时：'late'  = 23:00-24:00 算次日子时（主流/传统）
  //           'early' = 23:00-24:00 算当日子时（日柱不换）
  ziShi: 'late',

  // 真太阳时校正
  trueSolarTime: {
    longitude: true,   // 经度时差（每偏离 120°E 一度 ±4 分钟）
    equationOfTime: true, // 均时差（地球轨道偏心 + 黄赤交角，±16 分钟）
  },

  // 起运：'exact' = 按到节气的精确时长折算（3日=1年, 1日=4月, 1时辰=10日）
  //       'day'   = 只按天数取整
  qiYun: 'exact',

  // 大运排几步
  daYunCount: 10,
  // 每步大运列几个流年（0 = 全列 10 年）
  liuNianPerYun: 10,

  // 旺衰打分权重：月令 > 日支(得地) > 其他支 > 天干
  wangShuaiWeights: {
    monthZhi: 3.0,   // 月令
    dayZhi:   1.5,   // 日支（坐支）
    otherZhi: 1.0,   // 年支/时支
    gan:      1.0,   // 天干
    hideMain: 1.0,   // 藏干本气按 ZHI_HIDE 权重再乘这个系数
  },

  // 神煞：留空 = 用 tables.SHENSHA_DEFAULT
  shenSha: null,

  // 是否输出关系（刑冲合害会）
  relations: true,
};
