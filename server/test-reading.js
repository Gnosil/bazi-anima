// 全流水线本地测试：node test-reading.js [--quick]
// 直连中转 API，跑 V1..V6 + voiceA/B，产物存 /tmp/gen-steps.json + /tmp/gen-final-blocks.json
const fs = require('fs'), path = require('path');
const env = { ...process.env };
for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
}
const { runStep } = require('./lib/reading');
const { paipan } = require('../engine/paipan');

(async () => {
  const chart = paipan({ year: 2000, month: 5, day: 20, hour: 14, minute: 30, gender: 'female', city: '上海' });
  console.log('盘:', chart.bazi, '| 起运', chart.palaces.config.qiYunAge, '岁\n');
  const t0 = Date.now();
  const steps = [], readings = [];
  let prev = null, allDiffs = [];
  for (let k = 1; k <= 6; k++) {
    const s = Date.now();
    const r = await runStep({ step: 'V' + k, chart, prev }, env);
    steps.push(r);
    prev = r.result.reading;
    readings.push(r.result);
    for (const d of r.result.diff) allDiffs.push({ v: 'V' + k, ...d });
    console.log(`V${k} ${(Date.now() - s) / 1000 | 0}s retried=${r.retried} diff=${r.result.diff.length} conflicts=${r.result.conflicts.length}`);
    console.log('   身强弱:', r.result.reading.骨架.身强弱.slice(0, 60));
  }
  const blocks = [];
  for (const part of ['voiceA', 'voiceB']) {
    const s = Date.now();
    const r = await runStep({ step: part, chart, r6: prev, diffs: allDiffs }, env);
    steps.push(r);
    blocks.push(...r.result.blocks);
    console.log(`${part} ${(Date.now() - s) / 1000 | 0}s retried=${r.retried} blocks=${r.result.blocks.length}`);
  }
  fs.writeFileSync('/tmp/gen-steps.json', JSON.stringify(steps.map(s => ({ step: s.step, result: s.result })), null, 1));
  fs.writeFileSync('/tmp/gen-final-blocks.json', JSON.stringify({ readings, blocks }, null, 1));
  console.log(`\n总耗时 ${(Date.now() - t0) / 1000 | 0}s`);
  const love = blocks.find(b => b.id === 'love'), one = blocks.find(b => b.id === 'oneline');
  console.log('\n—— 抽检 love 块 ——\ncaption:', love.caption, '\n', love.text.slice(0, 260), '…');
  console.log('\n—— oneline ——\n', one.text);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
