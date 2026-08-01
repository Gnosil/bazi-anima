'use strict';
/* Cloudflare Worker 版（可选，国内可达性通常更好）
 * 部署：npx wrangler deploy worker.js --name bazi-ask
 * 密钥：npx wrangler secret put BAZI_API_KEY
 */
import { answer } from './lib/core.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405, headers: CORS });
    try {
      const out = await answer(await req.json(), env);
      return Response.json(out, { headers: CORS });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 422, headers: CORS });
    }
  },
};
