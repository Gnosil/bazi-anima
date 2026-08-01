// 本地冒烟测试：node test-local.js "问题"
// 需要 server/.env（KEY=VALUE 每行一条）
const fs = require('fs'), path = require('path');
const envFile = path.join(__dirname, '.env');
const env = { ...process.env };
if (fs.existsSync(envFile))
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
  }
const { answer } = require('./lib/core');
const chart = require('../cases/demo-1998/chart.json');
const q = process.argv[2] || '我的感情怎么样';
answer({ question: q, chart }, env)
  .then(r => { console.log('模型:', r.model, '| tokens:', JSON.stringify(r.usage)); console.log(JSON.stringify(r.script, null, 2)); })
  .catch(e => { console.error('FAIL:', e.message); process.exit(1); });
