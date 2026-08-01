'use strict';
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

module.exports = { chartHash, upsertChart, saveAsk, saveReading, enabled };
