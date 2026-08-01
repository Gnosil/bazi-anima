'use strict';
/* Vercel Serverless Function —— POST /api/ask
 * 部署：cd server && vercel deploy --prod
 * 环境变量（vercel env add）：BAZI_API_KEY（必填）、BAZI_API_URL、BAZI_MODEL
 */
const { answer } = require('../lib/core');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async (req, res) => {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.BAZI_API_KEY) return res.status(500).json({ error: '服务端未配置 BAZI_API_KEY' });

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const out = await answer(body, process.env);
    return res.status(200).json(out);
  } catch (e) {
    // 校验失败/上游失败都走 4xx，前端 director 会自动回退预置脚本，不黑屏
    return res.status(422).json({ error: e.message });
  }
};
