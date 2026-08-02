'use strict';
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

module.exports = { gapRun, fetchApproved, validAsset, BUILTIN };
