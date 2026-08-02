'use strict';
/* 素材工厂 —— 每 30 分钟一次的缺口分析：
 * 读最近的解读/提问 → 对比已有素材 → 让 DeepSeek 发明缺的意象（文本点阵）→ 校验入库。
 * 我们的 sprite 本来就是字符矩阵，所以「画画」= 结构化文本生成，纯文本模型就能干。
 */

const BUILTIN = ['hero','ghost','rival','coin','flame','torch','basket','umbrella','wall','lid','bubbles','crack','qmark','ban','orbit','tiles'];
const PER_RUN = 6;          // 每轮最多造几个（10分钟一轮 → 每小时 ≤36）

/* ── 素材索引目录：分门别类的生成清单。gapRun 逐条补齐，全齐后才进语料自由发挥。
 * [category, name, label, symbolism]。name 一旦入库不改。 ── */
const CATALOG = [
  // 天象 —— 时运明暗
  ['celestial','sun','太阳','阳气与显达，事情摆上明面'],
  ['celestial','moon','月亮','阴柔与内省，暗中酝酿'],
  ['celestial','star','星子','远处的指望，尚未落地的机会'],
  ['celestial','cloud','云','遮蔽与暧昧，一时看不清'],
  ['celestial','rainbow','虹','雨后转机'],
  ['celestial','lightning','闪电','骤变与惊动'],
  ['celestial','snowflake','雪花','冷清收藏，宜静不宜动'],
  ['celestial','bigdipper','北斗','方向感，认路的凭据'],
  // 山水 —— 处境地势
  ['nature','mountain','山','靠山与阻隔，看它在身前还是身后'],
  ['nature','river','河','流动的机缘，顺流省力逆流费劲'],
  ['nature','wave','浪','起伏反复，一阵一阵来'],
  ['nature','whirlpool','漩涡','越挣越紧的纠缠'],
  ['nature','stone','石','硬碰硬的现实，也是垫脚的料'],
  ['nature','cave','洞','退守之所，蛰伏期'],
  ['nature','island','岛','自成一方，孤而不困'],
  ['nature','spring','泉','源头活水，生生不息的补给'],
  ['nature','well','井','存下来的家底，取之有度'],
  ['nature','cliff','崖','边界与险，再进一步要掂量'],
  // 草木 —— 生长节律
  ['plant','seed','种子','埋着的可能，时候未到'],
  ['plant','sprout','新芽','刚冒头的起色'],
  ['plant','tree','大树','成形的格局，能荫人也挡光'],
  ['plant','pine','松','耐寒的长性，慢而稳'],
  ['plant','bamboo','竹','一节一节长，弯而不折'],
  ['plant','lotus','莲','浊处自清'],
  ['plant','blossom','花','正当时的好看，留不长久'],
  ['plant','leaf','落叶','该放下的旧事'],
  ['plant','root','根','看不见的根基'],
  ['plant','vine','藤','攀附借力，也会缠人'],
  ['plant','gourd','葫芦','收纳与药方，护身的家什'],
  // 生灵 —— 六亲人事
  ['creature','crane','鹤','清贵孤高，站得远'],
  ['creature','turtle','龟','慢寿稳妥，背着壳走'],
  ['creature','carp','鲤','逆流向上的那股劲'],
  ['creature','swallow','燕','来回奔波，衔泥成家'],
  ['creature','butterfly','蝶','变化与短暂的好时光'],
  ['creature','horse','马','驿动奔波，闲不住'],
  ['creature','oxen','牛','负重耐劳，闷头做事'],
  ['creature','rooster','鸡','守时报晓，嘴上功夫'],
  ['creature','snake','蛇','阴柔盘算，静而后动'],
  ['creature','rabbit','兔','机警温和，留后路'],
  // 器物 —— 能力资财
  ['vessel','bell','钟','提醒与警示，到点就响'],
  ['vessel','scale','秤','掂量轻重，讲个公道'],
  ['vessel','mirror','镜','照见自己，藏不住'],
  ['vessel','seal','印','名分与权柄，落印才算数'],
  ['vessel','sword','剑','决断，也伤人伤己'],
  ['vessel','book','书卷','学问文书，慢功夫'],
  ['vessel','brush','毛笔','表达与文名'],
  ['vessel','inkstone','砚台','磨出来的功夫'],
  ['vessel','scroll','卷轴','来历与凭证，展开才见分晓'],
  ['vessel','abacus','算盘','精打细算'],
  ['vessel','censer','香炉','敬与静，心里有数'],
  ['vessel','cauldron','鼎','担得起的分量，三足才稳'],
  ['vessel','teacup','茶盏','小坐慢谈，缓一缓'],
  ['vessel','winepot','酒壶','应酬与放纵，过量伤身'],
  ['vessel','vase','瓶','易碎的体面'],
  ['vessel','fan','扇','收放自如的姿态'],
  ['vessel','jade','玉佩','贴身的福泽，温润护人'],
  ['vessel','ingot','元宝','正财入库'],
  ['vessel','coinstring','钱串','细水长流的进项'],
  ['vessel','ruler','尺','规矩与分寸'],
  ['vessel','needle','针','细处见真章，也扎人'],
  ['vessel','spool','线轴','牵挂与联络，越抽越长'],
  ['vessel','chess','棋子','局中人，一步看三步'],
  ['vessel','qin','琴','知音与心事'],
  ['vessel','drum','鼓','声势与动员，一鼓作气'],
  ['vessel','comb','木梳','理顺，从头来'],
  ['vessel','hourglass','沙漏','时限将至，快慢自见'],
  ['vessel','lamp','灯','守夜的那点亮'],
  ['vessel','key','钥匙','解开的门路在别处'],
  ['vessel','lock','锁','守住的与打不开的'],
  ['vessel','shield','盾','庇护与防备'],
  ['vessel','crown','冠','名位到头，戴着也沉'],
  // 屋宇 —— 家宅根基
  ['structure','gate','门','进退之口，开合看时机'],
  ['structure','pagoda','塔','层层往上，越高越风'],
  ['structure','temple','庙','敬畏与归处'],
  ['structure','archway','牌坊','面子与名声，立给外人看'],
  ['structure','window','窗','看得见出不去，也透气'],
  ['structure','roof','屋檐','头顶的遮蔽，寄人檐下'],
  ['structure','fence','篱笆','软边界，拦君子不拦小人'],
  ['structure','stairs','台阶','一级一级来，没有电梯'],
  ['structure','pillar','柱','顶梁的担当'],
  ['structure','granary','谷仓','存粮与积蓄，丰年防歉年'],
  ['structure','bridge','桥','过渡与贵人搭的路'],
  // 行旅 —— 大运流转
  ['journey','boat','舟','载着走的运，同舟共济'],
  ['journey','sail','帆','借风使力'],
  ['journey','anchor','锚','停泊定心，也拖后腿'],
  ['journey','rudder','舵','方向在自己手里'],
  ['journey','wheel','车轮','滚动向前，周而复始'],
  ['journey','signpost','路标','岔口的提示'],
  ['journey','footprint','脚印','走过的都算数'],
  ['journey','ladder','梯','升迁的道，得一格一格踩'],
  ['journey','rope','绳','牵引与束缚'],
  ['journey','raft','筏','将就渡河的临时办法'],
  ['journey','kite','风筝','飞得高，线在别人手里'],
  // 符箓 —— 命理法器
  ['ritual','taiji','太极','阴阳消长，坏里有好'],
  ['ritual','bagua','八卦','万象归位'],
  ['ritual','talisman','符纸','讨个心安的凭仗'],
  ['ritual','lots','签筒','摇出来的运数'],
  ['ritual','joss','线香','心诚则灵，烟往上走'],
  ['ritual','beads','念珠','一颗一颗数着过'],
  ['ritual','woodenfish','木鱼','敲给自己听的节拍'],
  ['ritual','gongbell','铜锣','开场与收场的响动'],
  ['ritual','compass','罗盘','定向定位，心里的指南'],
  // 烟火 —— 衣食日用
  ['life','ricebag','米袋','口粮踏实，仓廪实心不慌'],
  ['life','teapot','茶壶','养人的慢日子'],
  ['life','broom','扫帚','扫旧迎新，清理门户'],
  ['life','plow','犁','下力气翻的地才长东西'],
  ['life','fishnet','渔网','广撒慢收，网眼别太密'],
  ['life','cradle','摇篮','子息与新生'],
  ['life','firecracker','爆竹','热闹一响，碎红满地'],
  ['life','scarecrow','稻草人','唬得住鸟，唬不住人'],
  ['life','pillow','枕','睡得着是福'],
  ['life','medicinebag','药囊','带病延年，调理为上'],
  // 意象 —— 抽象处境
  ['abstract','chain','锁链','脱不开的牵制'],
  ['abstract','cage','笼','看得见的自由'],
  ['abstract','hook','钩','放长线的算计'],
  ['abstract','target','靶','被盯上，也是目标所在'],
  ['abstract','dice','骰子','听天由命的一掷'],
  ['abstract','mask','面具','对外的那张脸'],
  ['abstract','arrow','箭','离弦不回头'],
  ['abstract','bow','弓','蓄力待发，拉满易折'],
  ['abstract','flag','旗','立场亮出来'],
  ['abstract','maze','迷宫','绕来绕去，出口在边上'],
];

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

/* ── 调色修复：模型爱配一身黑，深色舞台上隐形。保色相提亮到可见阈值 ── */
function lum(hex) {
  const c = String(hex || '').replace('#', '');
  return 0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16);
}
function brighten(hex, target) {
  const c = String(hex || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(c)) return null;
  const l = lum(hex);
  if (l >= target) return '#' + c.toUpperCase();
  if (l < 8) return null;   // 近纯黑，无色相可保
  const f = target / l;
  return '#' + [0, 2, 4].map(i => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * f))
    .toString(16).padStart(2, '0')).join('').toUpperCase();
}
const CAT_COLOR = { celestial: '#F5C542', nature: '#3D9BE8', plant: '#3FBF6A', creature: '#C77DFF',
  vessel: '#E8B84B', structure: '#D98E36', journey: '#5CE1C4', ritual: '#C77DFF',
  life: '#F0553D', abstract: '#8579B0', free: '#5CE1C4' };
function fixPalette(p, cat) {
  const base = CAT_COLOR[cat] || '#8579B0';
  const b = brighten(p.b, 110) || base;
  let h = brighten(p.h, 170) || brighten(b, 170) || '#F2EDFF';
  if (lum(h) <= lum(b)) h = brighten(b, Math.min(235, lum(b) + 70)) || '#F2EDFF';
  const d = brighten(p.d || p.o, 55) || brighten(b, 55) || b;
  const o = lum(p.o) < 18 ? '#241C3D' : p.o;
  return { o, b, h, d };
}

/* ── 线稿修复：模型爱整只用描边字符 o 画，暗描边在暗舞台上隐形。
 * 内部（不贴透明）的 o 转主体色 b；若仍是纯线稿（o 占比高），把描边色提亮当线条色用 ── */
function fixGrid(grid) {
  const H = grid.length, W = grid[0].length;
  const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < W) ? grid[y][x] : '.';
  let filled = 0;
  for (const row of grid) for (const ch of row) if (ch !== '.') filled++;
  if (!filled) return { grid, lineArt: false };
  const out = grid.map((row, y) => row.split('').map((ch, x) => {
    if (ch !== 'o') return ch;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (at(x + dx, y + dy) === '.') return 'o';   // 贴边，保留描边
    return 'b';                                      // 内部描边 → 主体
  }).join(''));
  let o2 = 0;
  for (const row of out) for (const ch of row) if (ch === 'o') o2++;
  return { grid: out, lineArt: o2 / filled >= 0.55 };
}

function validAsset(a, cat) {
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
  const fx = fixGrid(a.grid);
  a.grid = fx.grid;
  a.palette = fixPalette(a.palette, cat);
  if (fx.lineArt) a.palette.o = brighten(a.palette.o, 125) || a.palette.b;
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

/* ── 主流程：目录补齐优先，目录满了才进语料自由发挥 ── */
async function gapRun(env) {
  if (env.ASSET_FACTORY === 'off') return { skipped: 'ASSET_FACTORY=off' };

  const assetsR = await sb(env, 'assets?select=name,label&limit=1000', {});
  const existing = assetsR.ok ? await assetsR.json() : [];
  const haveSet = new Set([...BUILTIN, ...existing.map(a => a.name)]);
  const missing = CATALOG.filter(c => !haveSet.has(c[1]));

  let messages, catMap = {};
  if (missing.length) {
    // 定向模式：点名画目录里缺的条目（命中率远高于让模型自己想）
    const targets = missing.slice(0, PER_RUN);
    for (const [cat, name] of targets) catMap[name] = cat;
    messages = [
      { role: 'user', content: FACTORY_PROMPT + '\n\n示例输出（仅示范格式，禁止照抄）：' },
      { role: 'assistant', content: EX_ASSET },
      { role: 'user', content:
        '本轮是定向任务：把下面 ' + targets.length + ' 个物件全部画出来，name 必须一字不差用给定的 slug，label 和 symbolism 照抄给定值：\n' +
        targets.map(([cat, name, label, sym]) => '- ' + name + '（' + label + '，' + sym + '）').join('\n') +
        '\n\nassets 数组必须恰好是上面这 ' + targets.length + ' 个，一个不多一个不少；清单之外的任何 name 都不要画。' +
        '\n每个都要画成 16×16 里一眼能认出的剪影，输出 JSON：' },
    ];
  } else {
    // 自由模式：目录已齐，从解读语料里挖新意象
    const [asksR, readsR] = await Promise.all([
      sb(env, 'asks?select=question,script->caption&order=created_at.desc&limit=30', {}),
      sb(env, 'readings?select=blocks&order=created_at.desc&limit=5', {}),
    ]);
    const asks = asksR.ok ? await asksR.json() : [];
    const reads = readsR.ok ? await readsR.json() : [];
    const corpus = [
      ...asks.map(a => (a.question || '') + '→' + (a.caption || '')),
      ...reads.flatMap(r => (r.blocks || []).map(b => (b.caption || '') + ' ' + String(b.text || '').slice(0, 60))),
    ].filter(Boolean).slice(0, 40);
    messages = [
      { role: 'user', content: FACTORY_PROMPT + '\n\n示例输出（仅示范格式，禁止照抄）：' },
      { role: 'assistant', content: EX_ASSET },
      { role: 'user', content:
        '已有素材（不许重复、不许近义重复）：' + [...haveSet].join(', ') +
        '\n\n最近的解读语料（从中找被提到、但已有素材表达不了的具体意象）：\n' + corpus.join('\n') +
        '\n\n造 ' + PER_RUN + ' 个新素材。必须是中式命理/民俗语境里认得出的意象（禁止西洋/埃及/魔幻符号），' +
        '每个都要跟命理解读用得上，symbolism 写清楚什么概念用它。输出 JSON：' },
    ];
  }

  const out = extractJSON(await llm(env, messages, 3600));
  let cands = Array.isArray(out.assets) ? out.assets : [];
  if (missing.length) {
    const want = new Set(Object.keys(catMap));
    cands = cands.filter(a => want.has(a && a.name));   // 定向轮：清单外的直接丢，不占名额
  }

  const results = { mode: missing.length ? 'catalog' : 'free', catalogLeft: Math.max(0, missing.length - PER_RUN), ok: [], rejected: [] };
  for (const a of cands.slice(0, PER_RUN)) {
    const bad = validAsset(a, catMap[a.name] || 'free');
    if (bad) { results.rejected.push({ name: a.name, why: bad }); continue; }
    const r = await sb(env, 'assets', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        name: a.name, label: a.label, size: a.size === 8 ? 8 : 16, grid: a.grid,
        palette: { o: a.palette.o, b: a.palette.b, h: a.palette.h, d: a.palette.d || a.palette.o },
        symbolism: a.symbolism, behaviors: ['static', 'blink'], tags: a.tags || [],
        category: catMap[a.name] || 'free',
      }),
    });
    if (r.ok) results.ok.push(a.name + '(' + a.label + ')');
    else if (r.status === 409) results.rejected.push({ name: a.name, why: '重名' });
    else results.rejected.push({ name: a.name, why: 'db ' + r.status });
  }
  return results;
}

/* ── 覆盖面板：各分类补齐进度 ── */
async function factoryStatus(env) {
  const r = await sb(env, 'assets?select=name,label,status,category,created_at&order=created_at.desc&limit=1000', {});
  const rows = r.ok ? await r.json() : [];
  const have = new Set(rows.map(x => x.name));
  const byCat = {};
  for (const [cat, name, label] of CATALOG) {
    byCat[cat] = byCat[cat] || { total: 0, done: 0, missing: [] };
    byCat[cat].total++;
    if (have.has(name)) byCat[cat].done++;
    else if (byCat[cat].missing.length < 5) byCat[cat].missing.push(name + '(' + label + ')');
  }
  const inCatalog = new Set(CATALOG.map(c => c[1]));
  return {
    total: rows.length,
    approved: rows.filter(x => x.status === 'approved').length,
    candidate: rows.filter(x => x.status === 'candidate').length,
    catalog: { size: CATALOG.length, done: CATALOG.filter(c => have.has(c[1])).length },
    free: rows.filter(x => !inCatalog.has(x.name)).length,
    byCategory: byCat,
    latest: rows.slice(0, 8).map(x => x.name + '(' + (x.label || '') + ')'),
    latestAt: rows[0] ? rows[0].created_at : null,
  };
}

/* 已批准素材（给 /assets 端点和提示词白名单） */
async function fetchApproved(env, full) {
  const sel = full ? 'name,label,size,grid,palette,symbolism,behaviors' : 'name,label,symbolism';
  const r = await sb(env, 'assets?select=' + sel + '&status=eq.approved&order=created_at.asc&limit=200', {});
  return r.ok ? await r.json() : [];
}

module.exports = { gapRun, fetchApproved, factoryStatus, validAsset, BUILTIN, CATALOG };
