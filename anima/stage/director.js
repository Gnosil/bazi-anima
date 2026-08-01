/* 导演 —— 把「用户的问题」变成「动画脚本」。
 *
 * 在线：POST 到 LLM API（window.BAZI_API 或 opts.endpoint），期望返回 DSL.md 格式的 JSON。
 * 离线 / 失败：回退到关键词路由 + final.json 里预生成的 anim 脚本。绝不黑屏。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Director = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* （文档用途）早期版本的提示词构造。实际提示词在 server/lib/core.js 服务端组装，
     前端只发 {question, chart, readingDigest}。 */
  function buildPrompt(question, chart, final) {
    return {
      system: [
        '你是一个八字命理动画导演。用户提问后，你不用文字回答，而是输出一个像素动画脚本 JSON。',
        '严格遵守以下 DSL（超出白名单即作废）：',
        'sprite 白名单: hero(主角; idle/walk/curl/shrug/cheer), ghost(剪影; idle/approach), rival(蓝影=劫财; idle/approach), coin(fall/drift), flame(blink/steady), torch(lit/off/flicker), basket, umbrella, wall, lid, bubbles(rise), crack, qmark(blink), ban, orbit(wuxing)。',
        '画布 120×48，地面 y=40。duration 10–20 秒。actors ≤ 12。',
        'caption 必填：一句 ≤50 字的静态字幕，解释画面在向用户说明什么，不剧透全部结论。',
        '画面语言靠组合：财留不住=coin.fall+basket 靠右；表达被压=lid+bubbles；第三方=rival.approach；后半程才亮=torch.off×4+最右 torch.lit+hero.walk。',
        '涉及寿命/灾祸/疾病/婚变结局的问题：只能返回 {hero.shrug + ban}，caption 用温和拒答。',
        '只输出 JSON，不要输出任何其他文字。',
      ].join('\n'),
      user: JSON.stringify({
        question,
        chart: {
          bazi: chart.bazi, dayMaster: chart.dayMaster, wuXing: chart.wuXing.percent,
          wangShuai: chart.wangShuai.label, shiShenCount: chart.shiShenCount,
          shenSha: chart.shenSha.map(x => x.name + '@' + x.pillars.join('')),
          naYin: Object.fromEntries(Object.entries(chart.pillars).map(([k, v]) => [k, v.naYin])),
        },
        readingDigest: (final.blocks || []).map(b => ({ id: b.id, title: b.title })),
      }),
    };
  }

  /* 离线回退：路由 → final.json 里对应 block 的 anim */
  const ROUTE_TO_BLOCK = {
    self: 'who', love: 'love', wealth: 'money', career: 'career', health: 'body',
    family: 'family', peers: 'peers', future: 'path', express: 'who',
  };
  const FIXED = {
    boundary: {
      caption: '这类问题不算——命理给的是倾向，不是判决。换个问法？',
      duration: 12, backdrop: 'ground',
      actors: [{ sprite: 'hero', behavior: 'shrug' }, { sprite: 'ban', x: 84, y: 30 }],
    },
    unknown: {
      caption: '这个盘上看不出来。问问感情、钱、工作、身体、家里人？',
      duration: 12, backdrop: 'ground',
      actors: [{ sprite: 'hero', behavior: 'shrug' }, { sprite: 'qmark', behavior: 'blink', x: 84, y: 18 }],
    },
  };

  /* 没有预生成命书（新盘离线）时的通用场景 —— 画面按盘走，字幕只说画面 + 引导接 API */
  const GENERIC = {
    love:   { caption: '配偶宫在你的日柱。想听这条线的细节，得让命理师上线（接 API）再问。',
              actors: [{sprite:'umbrella',x:30,y:1},{sprite:'hero',behavior:'idle',x:24},{sprite:'ghost',x:70}] },
    wealth: { caption: '钱的形状每张盘不一样——币怎么掉、筐在哪，要问在线的命理师。',
              actors: [{sprite:'coin',behavior:'fall',x:10,count:4},{sprite:'hero',behavior:'idle'}] },
    career: { caption: '火把哪支亮着，得对着你的大运看——在线提问能给你具体的。',
              actors: [{sprite:'torch',behavior:'off',x:8},{sprite:'torch',behavior:'flicker',x:54},{sprite:'torch',behavior:'lit',x:100},{sprite:'hero',behavior:'walk',range:[2,100]}] },
    health: { caption: '雨大不大，看你盘里的水；怀里有没有火，看你的纳音。',
              actors: [{sprite:'hero',behavior:'curl'},{sprite:'flame',behavior:'blink',x:56,y:32}], backdrop: 'rain' },
    family: { caption: '父母宫在年柱——墙厚不厚，每张盘不同。',
              actors: [{sprite:'wall',x:10},{sprite:'wall',x:100},{sprite:'hero',behavior:'idle'}] },
    peers:  { caption: '同辈这条线看比劫的分布——具体到你，得在线问。',
              actors: [{sprite:'ghost',x:6},{sprite:'hero',behavior:'idle'},{sprite:'ghost',x:98}] },
    future: { caption: '四块砖照你的四柱五行上色——时间轴在下面，拖着看。',
              actors: [{sprite:'tiles'},{sprite:'hero',behavior:'walk',range:[4,112]}], backdrop: 'none' },
    self:   { caption: '绕着你转的是你的五行，密的多、疏的少。',
              actors: [{sprite:'orbit',behavior:'wuxing'},{sprite:'hero',behavior:'idle'}] },
    express:{ caption: '话冒上来有没有被压住，看印和伤官的比例。',
              actors: [{sprite:'lid',x:44,y:8,w:32},{sprite:'bubbles',behavior:'rise',x:54,count:5},{sprite:'hero',behavior:'idle'}] },
  };

  function fallback(question, ctx) {
    const r = ctx.route(question);
    if (FIXED[r]) return { script: FIXED[r], via: 'fixed', route: r };
    const blockId = ROUTE_TO_BLOCK[r] || 'who';
    const block = (ctx.final.blocks || []).find(b => b.id === blockId);
    if (block && block.anim) return { script: block.anim, via: 'prebaked', route: r };
    if (GENERIC[r]) return { script: { duration: 14, backdrop: 'ground', ...GENERIC[r] }, via: 'generic', route: r };
    return { script: FIXED.unknown, via: 'fixed', route: r };
  }

  /* 主入口 */
  async function ask(question, ctx) {
    const endpoint = (typeof window !== 'undefined' && window.BAZI_API) || ctx.endpoint;
    if (endpoint) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            chart: ctx.chart,   // 服务端 (server/lib/core.js) 自己组提示词
            readingDigest: (ctx.final.blocks || []).map(b => ({ id: b.id, title: b.title })),
          }),
        });
        const raw = await res.json();
        const sc = raw.script || raw;          // 兼容裸脚本或 {script} 包装
        ctx.validate(sc);                       // 不合法会 throw → 走 fallback
        return { script: sc, via: 'api' };
      } catch (e) {
        console.warn('[director] API 失败，回退预置脚本:', e.message);
      }
    }
    return fallback(question, ctx);
  }

  return { ask, fallback, buildPrompt, FIXED, ROUTE_TO_BLOCK };
});
