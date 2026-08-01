#!/usr/bin/env node
// 把 index.html + tokens.js + sprites.js + 字体 打包成单文件，便于分享/做 artifact
const fs = require('fs'), path = require('path');
const D = __dirname;
const font = fs.readFileSync(path.join(D, '../assets/zpix-subset.woff2')).toString('base64');
let html = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
html = html
  .replace('__FONT_URL__', `data:font/woff2;base64,${font}`)
  .replace('__TOKENS__', fs.readFileSync(path.join(D, 'tokens.js'), 'utf8'))
  .replace('__SPRITES__', fs.readFileSync(path.join(D, 'sprites.js'), 'utf8'));
const out = path.join(D, '../../out/design-system.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('->', out, (html.length / 1024).toFixed(0) + 'KB');
