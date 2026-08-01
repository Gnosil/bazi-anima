'use strict';
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
function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* */ } }
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

module.exports = { runStep, slice, V_SPEC, voicePrompt };
