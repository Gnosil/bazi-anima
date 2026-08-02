'use strict';
/* 后端核心：提示词 + 校验 + 调中转 API。
 * 与运行时无关 —— Vercel function 和 Cloudflare Worker 都 require 这一份。
 * 校验逻辑与 anima/stage/stage.js 的 validateScript 保持同一份白名单。
 */

const SPRITES_OK = {
  hero: ['idle','walk','curl','shrug','cheer'], ghost: ['idle','approach'], rival: ['idle','approach'],
  coin: ['fall','drift'], flame: ['blink','steady'], torch: ['lit','off','flicker'],
  basket: [], umbrella: [], wall: [], lid: [], bubbles: ['rise'], crack: [], qmark: ['blink'], ban: [], orbit: ['wuxing'], tiles: [],
};

function validateScript(sc, dynNames) {
  const err = m => { throw new Error('脚本校验失败: ' + m); };
  const dyn = dynNames instanceof Set ? dynNames : new Set(dynNames || []);
  if (!sc || typeof sc !== 'object') err('不是对象');
  if (!sc.caption || typeof sc.caption !== 'string') err('caption 必填');
  if ([...sc.caption].length > 60) err('caption 超长');
  const out = {
    caption: sc.caption,
    duration: Math.min(20, Math.max(10, +sc.duration || 15)),
    backdrop: ['ground', 'rain', 'none'].includes(sc.backdrop) ? sc.backdrop : 'ground',
    actors: [],
  };
  for (const a of (sc.actors || []).slice(0, 12)) {
    const builtin = Object.prototype.hasOwnProperty.call(SPRITES_OK, a.sprite);
    if (!builtin && !dyn.has(a.sprite)) err('未知 sprite: ' + a.sprite);
    if (builtin) {
      const ok = SPRITES_OK[a.sprite];
      if (a.behavior && ok.length && !ok.includes(a.behavior)) err(a.sprite + ' 不支持 ' + a.behavior);
      out.actors.push({ ...a, behavior: a.behavior || ok[0] || null });
    } else {
      out.actors.push({ ...a, behavior: ['static', 'blink'].includes(a.behavior) ? a.behavior : 'static' });
    }
  }
  if (!out.actors.length) err('actors 为空');
  return out;
}

const SYSTEM = [
  '你是像素动画导演。你唯一的输出是一个 JSON 对象——动画脚本。',
  '',
  '【输出格式，一字不差地遵守】',
  '第一个字符必须是 { ，最后一个字符必须是 } 。',
  '禁止 markdown 代码块，禁止任何解释文字。',
  '禁止出现这些字段：script、scene、scenes、narration、description、effects、theme、music。',
  '只允许四个顶层字段：caption / duration / backdrop / actors。',
  '',
  '【合法输出示例 1】问「钱怎么样」：',
  '{"caption":"币一直在掉，前半程接不住；右边那个筐，44 岁以后才出现。","duration":15,"backdrop":"ground","actors":[{"sprite":"coin","behavior":"fall","x":8,"count":6},{"sprite":"basket","x":96},{"sprite":"hero","behavior":"idle","x":16}]}',
  '',
  '【合法输出示例 2】问「我能活多久」（红线问题）：',
  '{"caption":"这类问题不算——命理给的是倾向，不是判决。换个问法？","duration":12,"backdrop":"ground","actors":[{"sprite":"hero","behavior":"shrug"},{"sprite":"ban","x":84,"y":30}]}',
  '',
  '【sprite 白名单，超出即作废】',
  'hero: idle|walk(range:[x1,x2])|curl|shrug|cheer （主角，自动2倍大）',
  'ghost: idle|approach(range) （灰剪影=他人）   rival: idle|approach （蓝剪影=劫财/第三方）',
  'coin: fall(x,count)|drift(from:[x,y],to:[x,y])   flame: blink|steady (x,y)',
  'torch: lit|off|flicker (x)   basket(x)   umbrella(x,伞=被照顾)   wall(x,墙=庇护/边界)',
  'lid(x,y,w,盖子=压制)   bubbles: rise(x,count,ceiling)   crack(x,len,裂缝)',
  'qmark: blink(x,y)   ban(x,y,禁止圈)   orbit: wuxing（五行粒子）   tiles（四柱地砖）',
  '',
  '【画布】120 宽 × 48 高，地面 y=40。duration 10–20。caption ≤50 字。actors ≤12。',
  '',
  '【画面语言】靠组合：财留不住=coin.fall+basket 放最右(x:96)；表达被压=lid+bubbles；',
  '第三方=hero+ghost+rival.approach；后半程才亮=torch.off×4+最右torch.lit+hero.walk；',
  '内耗=backdrop:"rain"+hero.curl+flame.blink；被围=wall(x:10)+wall(x:100)+hero。',
  '',
  '【caption】指着画面说（「右边那个筐」「反复靠近的蓝影」），有人味，禁止「此动画展示了」这类话。',
  '断语必须来自用户传的 chart 数据，不许编。',
  '',
  '【红线】寿命/生死、疾病诊断、灾祸预言、婚变结局、投资指令 → 输出示例 2 那种拒答脚本。',
  '红线拒答时：caption 只能是温和的拒绝+引导换话题，禁止包含任何盘面解读（不许提宫位/神煞/五行），actors 只能是 hero.shrug + ban。',
].join('\n');

const EX_MONEY = '{"caption":"币一直在掉，前半程接不住；右边那个筐，44 岁以后才出现。","duration":15,"backdrop":"ground","actors":[{"sprite":"coin","behavior":"fall","x":8,"count":6},{"sprite":"basket","x":96},{"sprite":"hero","behavior":"idle","x":16}]}';
const EX_BOUND = '{"caption":"这类问题不算——命理给的是倾向，不是判决。换个问法？","duration":12,"backdrop":"ground","actors":[{"sprite":"hero","behavior":"shrug"},{"sprite":"ban","x":84,"y":30}]}';

function chartDigest(chart) {
  return {
    bazi: chart.bazi,
    dayMaster: chart.dayMaster,
    wuXingPercent: chart.wuXing && chart.wuXing.percent,
    wangShuai: chart.wangShuai && chart.wangShuai.label,
    shiShenCount: chart.shiShenCount,
    shenSha: (chart.shenSha || []).map(x => x.name + '@' + (x.pillars || []).join('')),
    naYin: chart.pillars && Object.fromEntries(Object.entries(chart.pillars).map(([k, v]) => [k, v.naYin])),
    palaces: chart.palaces && chart.palaces.byPillar && Object.fromEntries(
      Object.entries(chart.palaces.byPillar).map(([k, v]) => [k, v.palace + ' ' + v.ageFrom + '-' + (v.ageTo || '终')])),
  };
}

/* 中转对 system 字段支持不可靠 → 规范放第一个 user turn，few-shot 锁格式。
 * 实测：纯 system 提示会被 deepseek-v4-flash 无视，few-shot 后 100% 出合法 DSL。 */
function buildMessages(question, chart, readingDigest, dynLine) {
  return [
    { role: 'user', content: SYSTEM + '\n\n命盘：' + JSON.stringify({ bazi: chart.bazi, wuXing: chart.wuXing && chart.wuXing.percent }) + '\n问题：钱怎么样' },
    { role: 'assistant', content: EX_MONEY },
    { role: 'user', content: '问题：我能活多久' },
    { role: 'assistant', content: EX_BOUND },
    { role: 'user', content: '命盘：' + JSON.stringify(chartDigest(chart)) +
        (readingDigest ? '\n已有解读块：' + JSON.stringify(readingDigest) : '') +
        (dynLine || '') + '\n问题：' + question + '\n（示例只示范 JSON 格式；caption 和画面必须针对这个问题和这张盘原创，禁止照抄示例句子）' },
  ];
}

/* 从模型返回里抠出 JSON（容忍代码块包裹/前后废话/丢闭合符） */
function repairJSON(cand) {
  const stack = []; let inStr = false, esc = false;
  for (let i = 0; i < cand.length; i++) {
    const c = cand[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  let s = cand;
  if (esc) s = s.slice(0, -1);
  if (inStr) s += '"';
  s = s.replace(/\s+$/, '');
  if (s.endsWith(':')) s += 'null';
  else if (s.endsWith(',')) s = s.slice(0, -1);
  return JSON.parse(s + stack.reverse().join(''));
}

function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fallthrough */ } }
  const i = text.indexOf('{');
  if (i >= 0) { try { return repairJSON(text.slice(i)); } catch (e) { /* fallthrough */ } }
  // 预填了 { 的场合：返回是从 "caption 开始的续写
  try { return JSON.parse('{' + text.slice(text.indexOf('"'))); } catch (e) { /* fallthrough */ }
  throw new Error('返回中没有合法 JSON');
}

/**
 * 主入口。env: {BAZI_API_URL, BAZI_API_KEY, BAZI_MODEL}
 * body: {question, chart, readingDigest?}
 */
async function answer(body, env, fetchFn, dynAssets) {
  const f = fetchFn || fetch;
  const question = String(body.question || '').slice(0, 200);
  if (!question) throw new Error('question 必填');
  if (!body.chart || !body.chart.bazi) throw new Error('chart 必填（前端把 chart.json 带上）');
  const dynNames = new Set((dynAssets || []).map(a => a.name));
  const dynLine = (dynAssets && dynAssets.length)
    ? '\n可用扩展素材（behavior 只有 static|blink，坐标 x,y；按意象选用）：' +
      dynAssets.map(a => a.name + '(' + a.label + '=' + a.symbolism + ')').join('；')
    : '';

  const call = async (messages) => {
    const res = await f(env.BAZI_API_URL || 'https://api.openai-next.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.BAZI_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.BAZI_MODEL || 'deepseek-v4-flash',
        max_tokens: 700,
        temperature: 0.6,
        messages,
      }),
    });
    if (!res.ok) throw new Error('上游 ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    return { text, data };
  };

  const base = buildMessages(question, body.chart, body.readingDigest, dynLine);
  let { text, data } = await call(base);
  let raw = text;

  try {
    const script = validateScript(extractJSON(raw), dynNames);
    return { script, usage: data.usage || null, model: data.model, retried: false };
  } catch (e1) {
    // 重试一次：把不合法输出和错误一起打回去
    const retryMsgs = [
      ...base,
      { role: 'assistant', content: raw.slice(0, 1500) },
      { role: 'user', content: '你的输出不合法：' + e1.message +
        '。重新输出，只输出 JSON 对象，顶层只有 caption/duration/backdrop/actors 四个字段，第一个字符必须是 { 。' },
      { role: 'assistant', content: '{' },
    ];
    const r2 = await call(retryMsgs);
    const raw2 = r2.text.trimStart().startsWith('{') ? r2.text : '{' + r2.text;
    const script = validateScript(extractJSON(raw2), dynNames);
    return { script, usage: r2.data.usage || null, model: r2.data.model, retried: true };
  }
}

module.exports = { answer, validateScript, SYSTEM, buildMessages, extractJSON };
