/* bazi-anima 设计系统 —— 唯一真源 (single source of truth)
 * 动画代码、设计系统预览页、未来的 sprite 生成脚本都从这里读。
 * 改这里 = 全局生效。不要在别处硬编码颜色。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DS = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* ── 1. 基础网格 ────────────────────────────────────────────
   * 一切尺寸都是 UNIT 的整数倍。像素风的清晰度全靠这个。
   */
  const UNIT = 4;                 // 基础单位 px
  const SPRITE = 16;              // 天干/地支/十神 图标 原始画布 16×16
  const SPRITE_BIG = 32;          // 日主角色立绘 32×32
  const TILE = 48;                // 大运关卡场景 tile 48×48
  const SCALE = { sm: 2, md: 3, lg: 4 };  // 整数倍缩放，绝不允许非整数

  /* ── 2. 底色 / 中性色 ──────────────────────────────────────
   * 深色夜间 RPG UI。娱乐向，所以对比度拉高一点，字要能一眼看清。
   */
  const base = {
    bg0:    '#0E0B14',   // 最底层背景
    bg1:    '#171226',   // 面板
    bg2:    '#241C3D',   // 凸起面板 / 卡片
    bg3:    '#33285A',   // hover / 选中
    line:   '#443A6B',   // 常规描边
    lineLit:'#6B5CA5',   // 高亮描边
    textHi: '#F2EDFF',   // 标题
    text:   '#C6BCE6',   // 正文
    textDim:'#8579B0',   // 次要
    gold:   '#F5C542',   // 强调 / 金币 / 高亮
    danger: '#FF5C6E',   // 警示
    ok:     '#5CE1A0',   // 正向
  };

  /* ── 3. 五行色 ─────────────────────────────────────────────
   * 每个五行三档：dark(阴影) / base(主体) / light(高光)。
   * 像素画上色只用这三档 —— 限制色阶是像素风「像」的关键。
   */
  const wuXing = {
    木: { dark:'#1E5B34', base:'#3FBF6A', light:'#86F0A6', name:'木', en:'wood' },
    火: { dark:'#7A1E1E', base:'#F0553D', light:'#FFA36B', name:'火', en:'fire' },
    土: { dark:'#6B4415', base:'#D98E36', light:'#F5C97A', name:'土', en:'earth' },
    金: { dark:'#8A8270', base:'#DDD6C0', light:'#FFFBEA', name:'金', en:'metal' },
    水: { dark:'#12386B', base:'#3D9BE8', light:'#8ED2FF', name:'水', en:'water' },
  };

  /* ── 4. 十神色（按组）──────────────────────────────────────
   * 十神有 10 个，但配 10 种颜色会糊。按五组上色，组内用阴阳区分明暗。
   * 这套色是「技能栏图标」的底色。
   */
  const shiShenGroup = {
    比劫: { base:'#9AA8FF', dark:'#4A55A8', light:'#CDD4FF', label:'比劫', role:'同伴 / 竞争' },
    食伤: { base:'#FF8FD1', dark:'#A33F79', light:'#FFC7E6', label:'食伤', role:'表达 / 才华' },
    财:   { base:'#F5C542', dark:'#9C7508', light:'#FFE79A', label:'财',   role:'资源 / 欲望' },
    官杀: { base:'#FF5C6E', dark:'#9E2334', light:'#FFA5AE', label:'官杀', role:'约束 / 压力' },
    印:   { base:'#5CE1C4', dark:'#1B7F6B', light:'#A8F5E5', label:'印',   role:'庇护 / 学习' },
  };
  const shiShenToGroup = {
    比肩:'比劫', 劫财:'比劫', 食神:'食伤', 伤官:'食伤',
    正财:'财', 偏财:'财', 正官:'官杀', 七杀:'官杀', 正印:'印', 偏印:'印',
  };
  // 阳性十神用 light，阴性用 base —— 阴阳在视觉上是「亮度」不是「色相」
  const shiShenYinYang = {
    比肩:'阳', 劫财:'阴', 食神:'阳', 伤官:'阴', 偏财:'阳',
    正财:'阴', 七杀:'阳', 正官:'阴', 偏印:'阳', 正印:'阴',
  };

  /* ── 5. 神煞 = Buff / Debuff ───────────────────────────────
   * 娱乐向的关键翻译层：把术语翻成玩家一眼懂的状态。
   * tone: 'good' 正面光环 | 'bad' 负面 debuff | 'wild' 中性但强烈
   */
  const shenSha = {
    天乙贵人:{ tone:'good', icon:'star',   label:'贵人庇护', blurb:'关键时刻有人拉一把' },
    文昌:    { tone:'good', icon:'book',   label:'文思泉涌', blurb:'读书考试脑子好使' },
    禄神:    { tone:'good', icon:'coin',   label:'衣食无忧', blurb:'基础收入稳' },
    金舆:    { tone:'good', icon:'cart',   label:'坐享其成', blurb:'配偶/平台带来的加成' },
    将星:    { tone:'good', icon:'flag',   label:'领队光环', blurb:'天生站 C 位' },
    红鸾:    { tone:'good', icon:'heart',  label:'桃花运',   blurb:'感情线活跃' },
    天喜:    { tone:'good', icon:'heart',  label:'喜事将近', blurb:'好消息' },
    桃花:    { tone:'wild', icon:'flower', label:'魅力四射', blurb:'人缘极好，也容易招惹' },
    驿马:    { tone:'wild', icon:'horse',  label:'停不下来', blurb:'搬家、出差、变动多' },
    华盖:    { tone:'wild', icon:'crown',  label:'孤高天赋', blurb:'有才华但爱独处' },
    羊刃:    { tone:'wild', icon:'blade',  label:'锋芒毕露', blurb:'狠劲够，也容易伤人伤己' },
    劫煞:    { tone:'bad',  icon:'skull',  label:'破财警告', blurb:'意外损耗' },
    亡神:    { tone:'bad',  icon:'fog',    label:'心神不宁', blurb:'容易内耗、判断失准' },
    孤辰:    { tone:'bad',  icon:'ghost',  label:'独行侠',   blurb:'亲密关系上偏冷' },
    寡宿:    { tone:'bad',  icon:'ghost',  label:'独行侠',   blurb:'亲密关系上偏冷' },
  };
  const toneColor = { good:'#5CE1A0', bad:'#FF5C6E', wild:'#C77DFF' };

  /* ── 6. 十二长生 = 角色状态等级 ────────────────────────────
   * 用于大运关卡的「本关状态」标签。level 0-4 决定关卡节点亮度。
   */
  const changSheng = {
    长生:{ level:3, label:'起势' }, 沐浴:{ level:2, label:'摇摆' },
    冠带:{ level:3, label:'成型' }, 临官:{ level:4, label:'当打' },
    帝旺:{ level:4, label:'巅峰' }, 衰:  { level:2, label:'转弱' },
    病:  { level:1, label:'低谷' }, 死:  { level:0, label:'停滞' },
    墓:  { level:1, label:'收藏' }, 绝:  { level:0, label:'归零' },
    胎:  { level:2, label:'孕育' }, 养:  { level:2, label:'蓄力' },
  };

  /* ── 7. 排版 ───────────────────────────────────────────────
   * Zpix 是 12px 设计的点阵字。字号必须是 12 的整数倍，否则糊。
   */
  const type = {
    family: "'Zpix', 'Fusion Pixel', 'MS Gothic', monospace",
    sizes: { xs:12, sm:12, md:12, lg:24, xl:36, xxl:48 },
    lineHeight: { tight:1.0, normal:1.5, loose:2.0 },
    rule: '字号只能取 12 / 24 / 36 / 48。行高只能取 1.0 / 1.5 / 2.0。',
  };

  /* ── 8. 动效 ───────────────────────────────────────────────
   * 像素动画的灵魂是「帧」不是「缓动」。禁止 ease 曲线，只允许阶跃。
   */
  const motion = {
    fps: 8,                                  // 精灵动画统一 8fps（复古手感）
    steps: { fast: 4, normal: 8, slow: 12 }, // CSS steps() 帧数
    duration: { fast:'160ms', normal:'320ms', slow:'640ms' },
    easing: 'steps(8, end)',
    rule: '禁止 cubic-bezier / ease-in-out。所有过渡必须 steps()，保持点阵质感。',
  };

  return {
    UNIT, SPRITE, SPRITE_BIG, TILE, SCALE,
    base, wuXing, shiShenGroup, shiShenToGroup, shiShenYinYang,
    shenSha, toneColor, changSheng, type, motion,
    // 便捷取色
    colorOfShiShen(s) {
      const g = shiShenGroup[shiShenToGroup[s]];
      if (!g) return base.textDim;
      return shiShenYinYang[s] === '阳' ? g.light : g.base;
    },
  };
});
