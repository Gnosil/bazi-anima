#!/usr/bin/env node
// 把 lib/core.js 内联成单文件 ESM worker → worker.bundle.js（wrangler 直接部署，无需构建链）
const fs = require('fs'), path = require('path');
const wrap = (file, ret) => {
  let code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  code = code.replace(/^'use strict';\n/, '').replace(/\nmodule\.exports[\s\S]*$/, '');
  return `const ${ret} = (() => {\n${code}\nreturn { answer: typeof answer !== 'undefined' ? answer : null, runStep: typeof runStep !== 'undefined' ? runStep : null, saveAsk: typeof saveAsk !== 'undefined' ? saveAsk : null, saveReading: typeof saveReading !== 'undefined' ? saveReading : null, enabled: typeof enabled !== 'undefined' ? enabled : null, gapRun: typeof gapRun !== 'undefined' ? gapRun : null, fetchApproved: typeof fetchApproved !== 'undefined' ? fetchApproved : null, factoryStatus: typeof factoryStatus !== 'undefined' ? factoryStatus : null };\n})();`;
};
const out = `// 自动生成：node build-worker.js —— 不要手改，改 lib/*.js
${wrap('lib/core.js', 'CORE')}
${wrap('lib/reading.js', 'READING')}
${wrap('lib/store.js', 'STORE')}
${wrap('lib/assets.js', 'ASSETS')}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
export default {
  async scheduled(event, env, ctx) {
    // 每 10 分钟：目录补齐/缺口分析 → 造素材 → 入库（wrangler.toml [triggers] 配置）
    ctx.waitUntil(ASSETS.gapRun(env).then(r => console.log('[factory]', JSON.stringify(r))).catch(e => console.warn('[factory]', e.message)));
  },
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const parts = new URL(req.url).pathname.split('/').filter(Boolean);
    const route0 = parts.pop() || 'ask';
    if (req.method === 'GET' && route0 === 'assets') {
      const list = await ASSETS.fetchApproved(env, true);
      return Response.json({ assets: list }, { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } });
    }
    if (req.method === 'GET' && parts[0] === 'factory') {
      try {
        if (route0 === 'status') return Response.json(await ASSETS.factoryStatus(env), { headers: CORS });
        if (route0 === 'run') return Response.json(await ASSETS.gapRun(env), { headers: CORS });
        return Response.json({ error: '用 /factory/status 或 /factory/run' }, { status: 404, headers: CORS });
      } catch (e) { return Response.json({ error: e.message }, { status: 500, headers: CORS }); }
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
`;
fs.writeFileSync(path.join(__dirname, 'worker.bundle.mjs'), out);
console.log('-> worker.bundle.mjs', (out.length / 1024).toFixed(1) + 'KB');
