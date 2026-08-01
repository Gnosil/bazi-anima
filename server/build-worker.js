#!/usr/bin/env node
// 把 lib/core.js 内联成单文件 ESM worker → worker.bundle.js（wrangler 直接部署，无需构建链）
const fs = require('fs'), path = require('path');
let core = fs.readFileSync(path.join(__dirname, 'lib/core.js'), 'utf8');
core = core.replace(/^'use strict';\n/, '').replace(/\nmodule\.exports[\s\S]*$/, '');
const out = `// 自动生成：node build-worker.js —— 不要手改，改 lib/core.js
${core}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
    if (!env.BAZI_API_KEY) return Response.json({ error: '未配置 BAZI_API_KEY（npx wrangler secret put BAZI_API_KEY）' }, { status: 500, headers: CORS });
    try {
      const out = await answer(await req.json(), env);
      return Response.json(out, { headers: CORS });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 422, headers: CORS });
    }
  },
};
`;
fs.writeFileSync(path.join(__dirname, 'worker.bundle.mjs'), out);
console.log('-> worker.bundle.mjs', (out.length / 1024).toFixed(1) + 'KB');
