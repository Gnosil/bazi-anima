#!/usr/bin/env node
'use strict';
const { paipan } = require('./paipan');
const args = {};
process.argv.slice(2).forEach(a => { const [k, ...v] = a.replace(/^--/, '').split('='); args[k] = v.join('='); });

if (!args.date) {
  console.log(`用法:
  node engine/cli.js --date=1998-11-24 --time=10:30 --gender=male --city=北京 [--calendar=lunar] [--out=chart.json]`);
  process.exit(0);
}
const [y, m, d] = args.date.split('-').map(Number);
const [h, mi] = (args.time || '0:0').split(':').map(Number);
const chart = paipan({
  calendar: args.calendar || 'solar',
  year: y, month: m, day: d, hour: h, minute: mi || 0,
  gender: args.gender || 'male', city: args.city,
  longitude: args.lon ? Number(args.lon) : undefined,
  name: args.name,
});
const json = JSON.stringify(chart, null, 2);
if (args.out) { require('fs').writeFileSync(args.out, json); console.log('written ->', args.out); }
else console.log(json);
