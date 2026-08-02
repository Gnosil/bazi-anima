// 自动生成：node build-worker.js —— 不要手改，改 lib/*.js
const CORE = (() => {
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

return { answer: typeof answer !== 'undefined' ? answer : null, runStep: typeof runStep !== 'undefined' ? runStep : null, saveAsk: typeof saveAsk !== 'undefined' ? saveAsk : null, saveReading: typeof saveReading !== 'undefined' ? saveReading : null, enabled: typeof enabled !== 'undefined' ? enabled : null, gapRun: typeof gapRun !== 'undefined' ? gapRun : null, fetchApproved: typeof fetchApproved !== 'undefined' ? fetchApproved : null };
})();
const READING = (() => {
/* 完整命书流水线 —— V1..V6 迭代推理 + voiceA/voiceB 成文。
 * 无状态：每步一个 HTTP 调用，中间结果由前端携带。
 * 与 core.js 同样的抗性设计：few-shot 锁格式（中转丢 system）+ 校验失败带错重试一次。
 */

/* ── 每层解锁的数据切片 ── */
function slice(chart, upto) {
  const d = { bazi: chart.bazi, dayMaster: chart.dayMaster, gender: chart.input && chart.input.gender };
  d.wuXingPercent = chart.wuXing.percent;
  d.wangShuai = { label: chart.wangShuai.label, allyPercent: chart.wangShuai.allyPercent };
  if (upto >= 2) {
    d.palaces = {};
    for (const [k, v] of Object.entries(chart.palaces.byPillar))
      d.palaces[k] = { 柱: v.label, 干支: v.ganZhi, 宫: v.palace, 年龄段: v.ageFrom + '-' + (v.ageTo || '终'),
                       表面: v.surface.shiShenGan + '/' + v.surface.ganWuXing + v.surface.zhiWuXing };
    d.月令 = chart.lunar.prevJieQi + '后';
  }
  if (upto >= 3) {
    for (const [k, v] of Object.entries(chart.palaces.byPillar))
      d.palaces[k].深读 = {
        藏干: v.deep.hideGan.map(h => h.gan + '(' + h.kind + '·' + h.shiShen + '·' + h.weight + ')').join(' '),
        十二长生: v.deep.changSheng,
      };
    d.关系 = {};
    for (const [k, arr] of Object.entries(chart.relations))
      if (Array.isArray(arr) && arr.length)
        d.关系[k] = arr.map(x => (x.pillars ? x.pillars.join('') : '') + (x.items ? x.items.join('') : '') + (x.type || '') + (x.huaTo ? '化' + x.huaTo : '')).join(',');
  }
  if (upto >= 4) {
    d.纳音 = {};
    for (const [k, v] of Object.entries(chart.pillars)) d.纳音[v.label + '柱'] = v.naYin;
  }
  if (upto >= 5) {
    d.十神数 = chart.shiShenCount;
    d.十神六亲 = chart.palaces.kinByShiShen.slice(0, 6).map(k => k.roles + '·强度' + k.strength + '·via' + k.viaShiShen.join('/'));
  }
  if (upto >= 6) d.神煞 = chart.shenSha.map(s => s.name + '@' + s.pillars.join(''));
  return d;
}

const DIM_NAMES = {
  1: '身强弱+五行盈缺', 2: '＋宫位（四柱表面+年龄段）', 3: '＋日支藏干+坐支关系+刑冲合害',
  4: '＋纳音', 5: '＋十神数量与六亲', 6: '＋神煞',
};

/* ── V 层的格式 few-shot（迷你假盘，防照抄）── */
const V_SPEC = [
  '你是命理推理引擎，执行迭代收敛式解读。只输出一个 JSON 对象，第一个字符是{，最后是}，禁止 markdown。',
  '顶层字段只有：version, reading, diff, conflicts。',
  'reading 固定结构：{"骨架":{"身强弱":str,"五行盈缺":str,"用神":str},"六亲宫":{"父母":str,"兄弟":str,"配偶":str,"子女":str,"亲友":str},"年龄段":[4个{"range":str,"claim":str}],"领域":{"性格":str,"事业":str,"财":str,"感情":str,"健康":str}}',
  '每条 str ≤55字，句内必须带（证据：盘中位置）。全文精炼，不许废话。没解锁的维度写"本层未解锁"。',
  '核心规则：不许在上一版文字上打补丁——用全部已解锁维度从头重写完整结论；写完后与上一版逐条对比，把改变的写进 diff:[{"path":str,"from":str,"to":str,"why":str}]；观点相抵时记 conflicts:[{"between":str,"issue":str,"resolution":str}]，粗读与精读冲突以精读为主但保留背景。',
  '红线：健康不提病名，绝不提寿命/灾祸/婚变结局。',
].join('\n');

const V_EX_IN = '第1层（身强弱+五行盈缺）。命盘：{"bazi":"甲子 丙寅 甲午 庚午","wuXingPercent":{"木":30,"火":40,"土":10,"金":12,"水":8}}';
const V_EX_OUT = '{"version":"V1","reading":{"骨架":{"身强弱":"木有火泄，偏弱（证据：火40%为我生）","五行盈缺":"火过旺、水近缺（证据：火40% 水8%）","用神":"倾向取水滋木（证据：水8%全局最低）"},"六亲宫":{"父母":"本层未解锁","兄弟":"本层未解锁","配偶":"本层未解锁","子女":"本层未解锁","亲友":"本层未解锁"},"年龄段":[{"range":"未解锁","claim":"本层未解锁"},{"range":"未解锁","claim":"本层未解锁"},{"range":"未解锁","claim":"本层未解锁"},{"range":"未解锁","claim":"本层未解锁"}],"领域":{"性格":"火旺主发散，想法外露（证据：火40%）","事业":"输出多蓄养少（证据：食伤火为最大占比）","财":"财星土偏薄（证据：土10%）","感情":"未见明显信号，待宫位层","健康":"火炎水浅，注意作息（证据：水8%）"}},"diff":[],"conflicts":[]}';

/* ── voice 层 ── */
const VOICE_RULES = [
  '你现在是把结构化命理结论写成人话的写手。只输出 JSON。',
  '文风铁律：全程第二人称"你"；术语出现后必须在同一句里用生活场景解释；每块 200-400 字（oneline 除外）；每块至少一个能对号入座的具体生活画面（从盘推出，不是万金油）；段落间用\\n\\n；结尾不总结、给画面或动作。',
  '禁用（出现即废）：值得注意的是/总的来说/综合来看/换句话说/此外/因此/首先其次/与此同时；空泛形容词（深刻独特丰富复杂强大显著）；"不是X而是Y"全篇最多1次；破折号一段最多1个。',
  '红线：健康只说体质倾向不说病名；寿命一个字不提；婚姻只说相处模式不说结局；不给投资指令。',
  'caption 规则：≤50字，指着画面元素说（画面内容会在输入里给你），说象征但不剧透全文。',
].join('\n');

const SCENE_HINTS = {
  open: '五行粒子绕着主角转（密=多疏=少）+旁边一簇小火',
  who: '一条盖子压着往上冒的粉色点（话被压住）',
  family: '两堵砖墙夹着主角',
  peers: '左右两个灰影，金币从主角身边飘向影子',
  love: '一把伞+灰影伴侣+右侧反复靠近退开的蓝影+主角脚下裂缝',
  path: '四块按四柱五行上色的地砖，主角从左走到右',
  money: '金币不断下落多数落空+右侧有个筐',
  career: '一排火把只有最右一支亮着，主角向右走',
  body: '下雨，主角蜷着，怀里一簇火忽明忽暗',
  oneline: '主角欢呼+一簇稳定的火',
};

function voicePrompt(part, chart, r6, diffs) {
  const ages = Object.values(chart.palaces.byPillar).map(v =>
    v.label + '柱 ' + v.ganZhi + '(' + (chart.pillars[{ '年': 'year', '月': 'month', '日': 'day', '时': 'hour' }[v.label]].naYin) + ') ' + v.ageFrom + '-' + (v.ageTo || '终') + '岁');
  const blocks = part === 'A'
    ? [
      '{"id":"open","title":"开场","text":"...开场直接切最扎眼的一点，不铺垫","caption":"..."}',
      '{"id":"who","title":"你是谁","text":"...性格+底层驱动，约300字","caption":"..."}',
      '{"id":"family","title":"你的人 · 父母","text":"...","caption":"..."}',
      '{"id":"peers","title":"你的人 · 同辈","text":"...","caption":"..."}',
      '{"id":"love","title":"你的人 · 伴侣","text":"...全书最需要上心处如实说，但只说模式","caption":"..."}',
    ]
    : [
      '{"id":"path","title":"你的四段路","segments":[{"age":"x-y 岁","pillar":"年柱 干支 · 纳音","text":"..."},共4段,顺序年月日时],"caption":"..."}',
      '{"id":"money","title":"钱","text":"...","caption":"..."}',
      '{"id":"career","title":"事业","text":"...","caption":"..."}',
      '{"id":"body","title":"身体","text":"...结尾提醒身体不适去看医生","caption":"..."}',
      '{"id":"oneline","title":"一句话","text":"一句能记一年的话"}',
    ];
  const hints = Object.entries(SCENE_HINTS)
    .filter(([k]) => (part === 'A' ? ['open','who','family','peers','love'] : ['path','money','career','body','oneline']).includes(k))
    .map(([k, v]) => k + '=' + v).join('；');
  const g = (chart.input && chart.input.gender) === 'female' ? '女' : '男';
  return VOICE_RULES +
    '\n\n命主：' + g + '命，八字 ' + chart.bazi + '，日主' + chart.dayMaster.gan + chart.dayMaster.wuXing +
    '。称呼配偶用「' + (g === '女' ? '他' : '她') + '」，所有性别相关表述与' + g + '命一致。' +
    '\n\n输出格式：{"blocks":[' + blocks.join(',') + ']}' +
    '\n每块的画面（caption 要指着它说）：' + hints +
    (part === 'B' ? '\n四段路的真实数据（必须用这些年龄和干支）：' + ages.join('；') : '') +
    '\n\n结构化结论（V6 定稿，你的唯一事实来源，不许编盘上没有的）：' + JSON.stringify(r6) +
    '\n推理过程中的关键改写（写文时可用"看着像X其实是Y"的结构呈现这些反转）：' + JSON.stringify((diffs || []).slice(0, 14)) +
    '\n\n输出 JSON：';
}

/* ── 通用调用（few-shot + 重试）── */
/* 括号配平修复：模型常在 end_turn 时丢最后一两个闭合符，或 max_tokens 截在字符串中间 */
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
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* */ } }
  const i = text.indexOf('{');
  if (i >= 0) { try { return repairJSON(text.slice(i)); } catch (e) { /* */ } }
  try { return JSON.parse('{' + text.slice(text.indexOf('"'))); } catch (e) { /* */ }
  throw new Error('返回中没有合法 JSON');
}

async function llm(messages, env, maxTokens, fetchFn) {
  const f = fetchFn || fetch;
  const res = await f(env.BAZI_API_URL || 'https://api.openai-next.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.BAZI_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.BAZI_MODEL || 'deepseek-v4-flash', max_tokens: maxTokens, temperature: 0.7, messages }),
  });
  if (!res.ok) throw new Error('上游 ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const data = await res.json();
  return { text: (data.content || []).map(c => c.text || '').join(''), usage: data.usage, stop: data.stop_reason };
}

async function callWithRetry(base, validate, env, maxTokens, fetchFn) {
  let { text, usage, stop } = await llm(base, env, maxTokens, fetchFn);
  try {
    return { out: validate(extractJSON(text)), usage, retried: false };
  } catch (e1) {
    const reason = stop === 'max_tokens'
      ? '你的输出太长被截断了。把每条内容压到 40 字以内，重新输出完整 JSON。'
      : '输出不合法：' + e1.message + '。重新输出，只输出 JSON，第一个字符必须是{。';
    const retry = [...base,
      { role: 'assistant', content: text.slice(0, 1800) },
      { role: 'user', content: reason },
      { role: 'assistant', content: '{' }];
    const r2 = await llm(retry, env, Math.min(maxTokens + 800, 4000), fetchFn);
    const raw = r2.text.trimStart().startsWith('{') ? r2.text : '{' + r2.text;
    return { out: validate(extractJSON(raw)), usage: r2.usage, retried: true };
  }
}

/* ── 校验 ── */
function vValidate(o) {
  const err = m => { throw new Error(m); };
  if (!o.reading) err('缺 reading');
  const R = o.reading;
  for (const k of ['身强弱', '五行盈缺', '用神']) if (typeof (R.骨架 || {})[k] !== 'string') err('骨架.' + k + ' 缺失');
  for (const k of ['父母', '兄弟', '配偶', '子女', '亲友']) if (typeof (R.六亲宫 || {})[k] !== 'string') err('六亲宫.' + k + ' 缺失');
  if (!Array.isArray(R.年龄段) || R.年龄段.length !== 4) err('年龄段必须4段');
  for (const k of ['性格', '事业', '财', '感情', '健康']) if (typeof (R.领域 || {})[k] !== 'string') err('领域.' + k + ' 缺失');
  o.diff = Array.isArray(o.diff) ? o.diff : [];
  o.conflicts = Array.isArray(o.conflicts) ? o.conflicts : [];
  return o;
}

function voiceValidate(part) {
  return o => {
    const err = m => { throw new Error(m); };
    if (!Array.isArray(o.blocks)) err('缺 blocks');
    const need = part === 'A' ? ['open', 'who', 'family', 'peers', 'love'] : ['path', 'money', 'career', 'body', 'oneline'];
    for (const id of need) {
      const b = o.blocks.find(x => x.id === id);
      if (!b) err('缺 block: ' + id);
      if (id === 'path') {
        if (!Array.isArray(b.segments) || b.segments.length !== 4) err('path.segments 必须4段');
      } else if (typeof b.text !== 'string' || !b.text) err(id + '.text 缺失');
      if (id !== 'oneline' && typeof b.caption !== 'string') err(id + '.caption 缺失');
      if (b.caption && [...b.caption].length > 60) b.caption = [...b.caption].slice(0, 58).join('') + '…';
    }
    return o;
  };
}

/* ── 主入口 ── */
async function runStep(body, env, fetchFn) {
  const { step, chart } = body;
  if (!chart || !chart.bazi) throw new Error('chart 必填');

  if (/^V[1-6]$/.test(step)) {
    const k = +step[1];
    const base = [
      { role: 'user', content: V_SPEC + '\n\n' + V_EX_IN },
      { role: 'assistant', content: V_EX_OUT },
      { role: 'user', content:
        '第' + k + '层（已解锁：' + Object.entries(DIM_NAMES).filter(([n]) => +n <= k).map(([, v]) => v).join('，') + '）。' +
        '\n命盘数据：' + JSON.stringify(slice(chart, k)) +
        (body.prev ? '\n上一版结论（参照物，不许照着改，重写后对比出 diff）：' + JSON.stringify(body.prev) : '\n这是第一层，diff 为空数组。') +
        '\n（示例只示范格式，内容必须针对本盘原创）输出 JSON：' },
    ];
    const r = await callWithRetry(base, vValidate, env, 2400, fetchFn);
    r.out.version = step;
    return { step, result: r.out, usage: r.usage, retried: r.retried };
  }

  if (step === 'voiceOne') {
    if (!body.r6) throw new Error('voiceOne 需要 r6');
    const id = body.block;
    const SPECS = {
      open:   { title: '开场',        extra: '开场直接切这张盘最扎眼的一点，不铺垫、不自我介绍。' },
      who:    { title: '你是谁',      extra: '性格+底层驱动，约 300 字，这是全书最需要「准」的一章。' },
      family: { title: '你的人 · 父母', extra: '' },
      peers:  { title: '你的人 · 同辈', extra: '' },
      love:   { title: '你的人 · 伴侣', extra: '全书最需要上心处如实说，但只说模式不说结局。' },
      path:   { title: '你的四段路',   extra: '输出 segments 数组共4段，顺序年月日时，必须用提供的真实年龄和干支。' },
      money:  { title: '钱',          extra: '' },
      career: { title: '事业',        extra: '' },
      body:   { title: '身体',        extra: '结尾提醒身体不适去看医生。' },
      oneline:{ title: '一句话',      extra: '只输出一句能记一年的话，不要 caption。' },
    };
    if (!SPECS[id]) throw new Error('未知 block: ' + id);
    const g = (chart.input && chart.input.gender) === 'female' ? '女' : '男';
    const fmt = id === 'path'
      ? '{"id":"path","title":"你的四段路","segments":[{"age":"x-y 岁","pillar":"年柱 干支 · 纳音","text":"..."},共4段],"caption":"≤50字"}'
      : id === 'oneline'
        ? '{"id":"oneline","title":"一句话","text":"一句话"}'
        : '{"id":"' + id + '","title":"' + SPECS[id].title + '","text":"200-400字，段落用\\n\\n分隔","caption":"≤50字"}';
    const ages = Object.values(chart.palaces.byPillar).map(v =>
      v.label + '柱 ' + v.ganZhi + '(' + (chart.pillars[{ '年':'year','月':'month','日':'day','时':'hour' }[v.label]].naYin) + ') ' + v.ageFrom + '-' + (v.ageTo || '终') + '岁');
    const base = [{ role: 'user', content:
      VOICE_RULES +
      '\n\n命主：' + g + '命，八字 ' + chart.bazi + '，日主' + chart.dayMaster.gan + chart.dayMaster.wuXing +
      '。称呼配偶用「' + (g === '女' ? '他' : '她') + '」。' +
      '\n\n现在只写一章：「' + SPECS[id].title + '」。' + SPECS[id].extra +
      '\n输出格式（只输出这一个 JSON 对象）：' + fmt +
      (SCENE_HINTS[id] ? '\n这一章的画面（caption 指着它说）：' + SCENE_HINTS[id] : '') +
      (id === 'path' ? '\n四段路真实数据：' + ages.join('；') : '') +
      (body.prevTitles && body.prevTitles.length ? '\n已写完的章节（不要重复其内容）：' + body.prevTitles.join('、') : '') +
      '\n\n结构化结论（V6 定稿，唯一事实来源）：' + JSON.stringify(body.r6) +
      '\n关键改写（可用"看着像X其实是Y"呈现）：' + JSON.stringify((body.diffs || []).slice(0, 10)) +
      '\n输出 JSON：' }];
    const validate = o => {
      if (o.id !== id) o.id = id;
      if (!o.title) o.title = SPECS[id].title;
      if (id === 'path') {
        if (!Array.isArray(o.segments) || o.segments.length !== 4) throw new Error('segments 必须4段');
      } else if (typeof o.text !== 'string' || !o.text) throw new Error('text 缺失');
      if (id !== 'oneline') {
        if (typeof o.caption !== 'string' || !o.caption) throw new Error('caption 缺失');
        if ([...o.caption].length > 60) o.caption = [...o.caption].slice(0, 58).join('') + '…';
      }
      return o;
    };
    const r = await callWithRetry(base, validate, env, id === 'path' ? 1600 : 1100, fetchFn);
    return { step, block: id, result: r.out, usage: r.usage, retried: r.retried };
  }

  if (step === 'yun') {
    if (!body.daYun || !body.liuNian) throw new Error('yun 步骤需要 daYun 和 liuNian');
    const g = (chart.input && chart.input.gender) === 'female' ? '女' : '男';
    const YUN_EX = '{"caption":"这十年的门往西开，今年那扇最松。","sections":{"主调":"…","事业":"…","财":"…","感情":"…","身体":"…"}}';
    const base = [
      { role: 'user', content: [
        '你是命理师，现在只批「选定的大运+流年」。只输出 JSON，第一个字符是{。',
        '格式：' + YUN_EX,
        'sections 五个键固定（主调/事业/财/感情/身体），每条 ≤90 字，第二人称，口语化，术语出现要在同句用人话解释，每条句内带（证据：…）。',
        'caption ≤50 字，像一句签文，不带术语。',
        '方法：把大运当第五根柱看它与原局四柱的合冲刑害、对用神的助碍；流年再叠在大运上；流年与大运干支的关系（伏吟/反吟/冲合）要看。',
        '红线：不提病名、不提任何器官或身体系统名（心血管/肾/泌尿这类词都不行）、不提寿命/灾祸/婚变结局/投资指令。身体条目只说状态感受（易上火/失眠/乏）和作息建议。',
        '命主：' + g + '命。原局：' + JSON.stringify(slice(chart, 6)) +
        (body.r6 ? '\n本命定稿摘要：' + JSON.stringify({ 骨架: body.r6.骨架, 领域: body.r6.领域 }) : '') +
        '\n选定大运：' + JSON.stringify(body.daYun) +
        '\n选定流年：' + JSON.stringify(body.liuNian) +
        '\n（示例只示范格式，caption 和内容必须针对这个大运流年原创，禁止照抄示例句子）输出 JSON：',
      ].join('\n') },
    ];
    const validate = o => {
      if (!o.caption || typeof o.caption !== 'string') throw new Error('缺 caption');
      if ([...o.caption].length > 60) o.caption = [...o.caption].slice(0, 58).join('') + '…';
      for (const k of ['主调', '事业', '财', '感情', '身体'])
        if (typeof (o.sections || {})[k] !== 'string') throw new Error('sections.' + k + ' 缺失');
      return o;
    };
    const r = await callWithRetry(base, validate, env, 1400, fetchFn);
    return { step, result: r.out, usage: r.usage, retried: r.retried };
  }

  if (step === 'voiceA' || step === 'voiceB') {
    if (!body.r6) throw new Error('voice 步骤需要 r6（V6 的 reading）');
    const base = [{ role: 'user', content: voicePrompt(step === 'voiceA' ? 'A' : 'B', chart, body.r6, body.diffs) }];
    const r = await callWithRetry(base, voiceValidate(step === 'voiceA' ? 'A' : 'B'), env, 3400, fetchFn);
    return { step, result: r.out, usage: r.usage, retried: r.retried };
  }

  throw new Error('未知 step: ' + step);
}

return { answer: typeof answer !== 'undefined' ? answer : null, runStep: typeof runStep !== 'undefined' ? runStep : null, saveAsk: typeof saveAsk !== 'undefined' ? saveAsk : null, saveReading: typeof saveReading !== 'undefined' ? saveReading : null, enabled: typeof enabled !== 'undefined' ? enabled : null, gapRun: typeof gapRun !== 'undefined' ? gapRun : null, fetchApproved: typeof fetchApproved !== 'undefined' ? fetchApproved : null };
})();
const STORE = (() => {
/* Supabase 存储层 —— 每张盘/每本命书/每次提问都落库，互相带外键。
 * 走 PostgREST，匿名 key（RLS 只开 insert + charts 只读，公网扒不走 readings/asks）。
 * 所有写入 fire-and-forget：失败只 console.warn，绝不影响主流程。
 */

function chartHash(chart) {
  // 同一生辰同一人 = 同一张盘：真太阳时(分钟精度) + 性别 + 经度
  const t = (chart.time && chart.time.trueSolarTime) || (chart.input && chart.input.clockTime) || '';
  const g = (chart.input && chart.input.gender) || '';
  const lon = (chart.input && chart.input.longitude) != null ? chart.input.longitude : 'x';
  return (t + '|' + g + '|' + lon).replace(/\s+/g, '_');
}

function headers(env, extra) {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY,
    ...extra,
  };
}

function enabled(env) { return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY); }

/** 幂等取盘 id：先查 hash，没有再插（并发下撞唯一约束就重查一次） */
async function upsertChart(chart, env, fetchFn) {
  const f = fetchFn || fetch;
  const base = env.SUPABASE_URL + '/rest/v1/charts';
  const hash = chartHash(chart);

  const find = async () => {
    const r = await f(base + '?select=id&chart_hash=eq.' + encodeURIComponent(hash), { headers: headers(env) });
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].id : null;
  };

  let id = await find();
  if (id) return id;

  const r = await f(base + '?select=id', {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      chart_hash: hash,
      bazi: chart.bazi,
      gender: chart.input.gender,
      birthplace: chart.input.birthplace || null,
      clock_time: chart.input.clockTime,
      true_solar_time: chart.time && chart.time.trueSolarTime,
      chart,
    }),
  });
  if (r.ok) { const rows = await r.json(); return rows[0] && rows[0].id; }
  if (r.status === 409) return await find();     // 并发插入撞唯一约束
  throw new Error('charts 写入失败 ' + r.status + ': ' + (await r.text()).slice(0, 150));
}

async function saveAsk(chart, question, script, meta, env, fetchFn) {
  if (!enabled(env)) return null;
  const f = fetchFn || fetch;
  const chartId = await upsertChart(chart, env, f);
  const r = await f(env.SUPABASE_URL + '/rest/v1/asks', {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ chart_id: chartId, question, script, model: meta.model || null, retried: !!meta.retried }),
  });
  if (!r.ok) throw new Error('asks 写入失败 ' + r.status);
  return chartId;
}

async function saveReading(chart, blocks, process, meta, env, fetchFn) {
  if (!enabled(env)) return null;
  const f = fetchFn || fetch;
  const chartId = await upsertChart(chart, env, f);
  const r = await f(env.SUPABASE_URL + '/rest/v1/readings', {
    method: 'POST',
    headers: headers(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ chart_id: chartId, blocks, process: process || null, model: meta.model || null }),
  });
  if (!r.ok) throw new Error('readings 写入失败 ' + r.status);
  return chartId;
}

return { answer: typeof answer !== 'undefined' ? answer : null, runStep: typeof runStep !== 'undefined' ? runStep : null, saveAsk: typeof saveAsk !== 'undefined' ? saveAsk : null, saveReading: typeof saveReading !== 'undefined' ? saveReading : null, enabled: typeof enabled !== 'undefined' ? enabled : null, gapRun: typeof gapRun !== 'undefined' ? gapRun : null, fetchApproved: typeof fetchApproved !== 'undefined' ? fetchApproved : null };
})();
const ASSETS = (() => {
/* 素材工厂 —— 每 30 分钟一次的缺口分析：
 * 读最近的解读/提问 → 对比已有素材 → 让 DeepSeek 发明缺的意象（文本点阵）→ 校验入库。
 * 我们的 sprite 本来就是字符矩阵，所以「画画」= 结构化文本生成，纯文本模型就能干。
 */

const BUILTIN = ['hero','ghost','rival','coin','flame','torch','basket','umbrella','wall','lid','bubbles','crack','qmark','ban','orbit','tiles'];
const PER_RUN = 6;          // 每轮最多造几个（半小时一轮 = 每天上限 ~288，实际远低于此）

function sb(env, path, opts) {
  return fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY,
      ...(opts && opts.headers),
    },
  });
}

/* 机械修复：行宽/行数不对就补齐或截断（画歪是常事，修一下再验） */
function normalizeGrid(grid, size) {
  if (!Array.isArray(grid)) return grid;
  const rows = grid.map(r => {
    r = String(r || '').replace(/[^.obhd]/g, '.');
    return r.length > size ? r.slice(0, size) : r + '.'.repeat(size - r.length);
  });
  while (rows.length < size) rows.push('.'.repeat(size));
  return rows.slice(0, size);
}

/* ── 点阵校验：方阵、字符集、填充率、非纯矩形 ── */
function validGrid(grid, size) {
  if (!Array.isArray(grid) || grid.length !== size) return '行数≠' + size;
  let filled = 0;
  for (const row of grid) {
    if (typeof row !== 'string' || row.length !== size) return '行宽≠' + size;
    if (/[^.obhd]/.test(row)) return '含非法字符（只许 . o b h d）';
    filled += (row.match(/[obhd]/g) || []).length;
  }
  const ratio = filled / (size * size);
  if (ratio < 0.08) return '太空（填充 ' + (ratio * 100 | 0) + '%）';
  if (ratio > 0.72) return '太满（填充 ' + (ratio * 100 | 0) + '%）';
  return null;
}

function validAsset(a) {
  if (!/^[a-z][a-z0-9_]{2,15}$/.test(a.name || '')) return 'name 不是合法 slug';
  if (BUILTIN.includes(a.name)) return 'name 与内置 sprite 冲突';
  if (!a.label || typeof a.label !== 'string') return '缺 label';
  if (!a.symbolism || typeof a.symbolism !== 'string') return '缺 symbolism';
  const size = a.size === 8 ? 8 : 16;
  a.grid = normalizeGrid(a.grid, size);
  const g = validGrid(a.grid, size);
  if (g) return g;
  for (const k of ['o', 'b', 'h']) {
    if (!/^#[0-9A-Fa-f]{6}$/.test((a.palette || {})[k] || '')) return 'palette.' + k + ' 不是 #RRGGBB';
  }
  return null;
}

const FACTORY_PROMPT = [
  '你是像素素材设计师。为八字命理动画舞台补充新的 16×16 像素道具。只输出 JSON。',
  '',
  '点阵格式：16 行字符串，每行 16 个字符。字符集：. 透明 | o 描边(最深) | b 主体色 | h 高光 | d 暗部。',
  '画法要领：外轮廓用 o 描边；主体 b；受光面点几个 h；底部/背光面用 d；居中构图；下方留 1-2 行空（物体要能"放在地上"）。',
  '填充率 15%-60%。必须是那个物体的可辨认剪影，不许画抽象色块、不许只画一圈椭圆轮廓。',
  '左右对称的物体（钟/秤/镜/灯）先想清楚中轴在第 8 列，两侧镜像。',
  '画完每个都在脑内逐行渲染自检一遍：一个没见过的人能认出这是什么吗？认不出就重画。',
  '',
  '输出：{"assets":[{"name":"英文slug","label":"中文名","size":16,',
  '"grid":["16行×16字符"...],"palette":{"o":"#1A1626","b":"#主体色","h":"#高光色","d":"#暗部色"},',
  '"symbolism":"命理里它表达什么概念（一句话）","behaviors":["static","blink"]}]}',
  '',
  '配色遵守暗夜像素风：饱和度中高、明度分三档，参考 火#F0553D 金#F5C542 水#3D9BE8 木#3FBF6A 土#D98E36 紫#C77DFF。',
].join('\n');

const EX_ASSET = '{"assets":[{"name":"lantern","label":"灯笼","size":16,"grid":["................","......oo........",".....o..o.......","....oooooo......","...obbbbbbo.....","...obhhbbbo.....","...obhbbbbo.....","...obbbbbbo.....","...obbbbdbo.....","...obbbddbo.....","....oooooo......","......oo........",".....oooo.......","................","................","................"],"palette":{"o":"#5A1A1A","b":"#F0553D","h":"#FFA36B","d":"#A83226"},"symbolism":"指引与温度——运势里的一点光","behaviors":["static","blink"]}]}';

async function llm(env, messages, maxTokens) {
  const res = await fetch(env.BAZI_API_URL || 'https://api.openai-next.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.BAZI_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.BAZI_MODEL || 'deepseek-v4-flash', max_tokens: maxTokens, temperature: 0.9, messages }),
  });
  if (!res.ok) throw new Error('上游 ' + res.status);
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('');
}

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
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* */ } }
  const i = text.indexOf('{');
  if (i >= 0) { try { return repairJSON(text.slice(i)); } catch (e) { /* */ } }
  throw new Error('无合法 JSON');
}

/* ── 主流程：缺口分析 → 生成 → 校验 → 入库 ── */
async function gapRun(env) {
  if (env.ASSET_FACTORY === 'off') return { skipped: 'ASSET_FACTORY=off' };

  // 1) 最近的解读语料（captions + 命书开头）
  const [asksR, readsR, assetsR] = await Promise.all([
    sb(env, 'asks?select=question,script->caption&order=created_at.desc&limit=30', {}),
    sb(env, 'readings?select=blocks&order=created_at.desc&limit=5', {}),
    sb(env, 'assets?select=name,label&limit=500', {}),
  ]);
  const asks = asksR.ok ? await asksR.json() : [];
  const reads = readsR.ok ? await readsR.json() : [];
  const existing = assetsR.ok ? await assetsR.json() : [];

  const corpus = [
    ...asks.map(a => (a.question || '') + '→' + (a.caption || '')),
    ...reads.flatMap(r => (r.blocks || []).map(b => (b.caption || '') + ' ' + String(b.text || '').slice(0, 60))),
  ].filter(Boolean).slice(0, 40);
  const have = [...BUILTIN, ...existing.map(a => a.name + '(' + a.label + ')')];

  // 2) 缺口 + 生成（一次调用完成）
  const messages = [
    { role: 'user', content: FACTORY_PROMPT + '\n\n示例输出（仅示范格式，禁止照抄）：' },
    { role: 'assistant', content: EX_ASSET },
    { role: 'user', content:
      '已有素材（不许重复、不许近义重复）：' + have.join(', ') +
      '\n\n最近的解读语料（从中找被提到、但上面素材表达不了的具体意象；也可补命理常用意象如 桥/门/秤/钟/舟/印/剑/书/镜/山/月/井/绳结/种子）：\n' +
      corpus.join('\n') +
      '\n\n造 ' + PER_RUN + ' 个新素材。每个都要跟命理解读用得上，symbolism 写清楚什么概念用它。输出 JSON：' },
  ];
  const out = extractJSON(await llm(env, messages, 3600));
  const cands = Array.isArray(out.assets) ? out.assets : [];

  // 3) 校验 + 入库
  const results = { ok: [], rejected: [] };
  for (const a of cands.slice(0, PER_RUN)) {
    const bad = validAsset(a);
    if (bad) { results.rejected.push({ name: a.name, why: bad }); continue; }
    const r = await sb(env, 'assets', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        name: a.name, label: a.label, size: a.size === 8 ? 8 : 16, grid: a.grid,
        palette: { o: a.palette.o, b: a.palette.b, h: a.palette.h, d: a.palette.d || a.palette.o },
        symbolism: a.symbolism, behaviors: ['static', 'blink'], tags: a.tags || [],
      }),
    });
    if (r.ok) results.ok.push(a.name + '(' + a.label + ')');
    else if (r.status === 409) results.rejected.push({ name: a.name, why: '重名' });
    else results.rejected.push({ name: a.name, why: 'db ' + r.status });
  }
  return results;
}

/* 已批准素材（给 /assets 端点和提示词白名单） */
async function fetchApproved(env, full) {
  const sel = full ? 'name,label,size,grid,palette,symbolism,behaviors' : 'name,label,symbolism';
  const r = await sb(env, 'assets?select=' + sel + '&status=eq.approved&order=created_at.asc&limit=200', {});
  return r.ok ? await r.json() : [];
}

return { answer: typeof answer !== 'undefined' ? answer : null, runStep: typeof runStep !== 'undefined' ? runStep : null, saveAsk: typeof saveAsk !== 'undefined' ? saveAsk : null, saveReading: typeof saveReading !== 'undefined' ? saveReading : null, enabled: typeof enabled !== 'undefined' ? enabled : null, gapRun: typeof gapRun !== 'undefined' ? gapRun : null, fetchApproved: typeof fetchApproved !== 'undefined' ? fetchApproved : null };
})();
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
export default {
  async scheduled(event, env, ctx) {
    // 每 30 分钟：缺口分析 → 造素材 → 入库（wrangler.toml [triggers] 配置）
    ctx.waitUntil(ASSETS.gapRun(env).then(r => console.log('[factory]', JSON.stringify(r))).catch(e => console.warn('[factory]', e.message)));
  },
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const route0 = new URL(req.url).pathname.split('/').filter(Boolean).pop() || 'ask';
    if (req.method === 'GET' && route0 === 'assets') {
      const list = await ASSETS.fetchApproved(env, true);
      return Response.json({ assets: list }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } });
    }
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
    if (!env.BAZI_API_KEY) return Response.json({ error: '未配置 BAZI_API_KEY（npx wrangler secret put BAZI_API_KEY）' }, { status: 500, headers: CORS });
    try {
      const body = await req.json();
      const route = new URL(req.url).pathname.split('/').filter(Boolean).pop() || 'ask';
      if (route === 'save') {
        // 前端生成完命书后回传归档：{chart, blocks, process, model}
        if (!body.chart || !body.blocks) return Response.json({ error: 'chart 和 blocks 必填' }, { status: 422, headers: CORS });
        const chartId = await STORE.saveReading(body.chart, body.blocks, body.process, { model: body.model }, env);
        return Response.json({ ok: true, chartId }, { headers: CORS });
      }
      if (route === 'reading') {
        const out = await READING.runStep(body, env);
        return Response.json(out, { headers: CORS });
      }
      let dyn = [];
      try {
        if (!globalThis.__dynCache || Date.now() - globalThis.__dynCache.t > 300000) {
          globalThis.__dynCache = { t: Date.now(), list: await ASSETS.fetchApproved(env, false) };
        }
        dyn = globalThis.__dynCache.list;
      } catch (e) { /* 素材层失败不影响回答 */ }
      const out = await CORE.answer(body, env, undefined, dyn);
      // 提问自动落库（不阻塞响应，失败不影响用户）
      if (STORE.enabled(env)) ctx.waitUntil(
        STORE.saveAsk(body.chart, body.question, out.script, { model: out.model, retried: out.retried }, env)
          .catch(e => console.warn('[store] ask 落库失败:', e.message)));
      return Response.json(out, { headers: CORS });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 422, headers: CORS });
    }
  },
};
