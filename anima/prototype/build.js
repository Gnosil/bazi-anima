#!/usr/bin/env node
// 打包成单文件：字体 + tokens + stage + chart + final(用户看的) + process(开发者看的)
const fs=require('fs'), path=require('path'), D=__dirname;
const R=p=>fs.readFileSync(path.join(D,p),'utf8');
const caseDir=process.argv[2]||'../../cases/demo-1998';
const font=fs.readFileSync(path.join(D,'../assets/zpix-subset.woff2')).toString('base64');
const reading=JSON.parse(R(path.join(caseDir,'reading.json')));
let html=R('index.html')
  .replace('__FONT_URL__',`data:font/woff2;base64,${font}`)
  .replace('__TOKENS__',R('../design-system/tokens.js'))
  .replace('__STAGE__',R('../stage/stage.js'))
  .replace('__DIRECTOR__',R('../stage/director.js'))
  .replace('__CHART__',R(path.join(caseDir,'chart.json')))
  .replace('__FINAL__',R(path.join(caseDir,'final.json')))
  .replace('__PROCESS__',JSON.stringify(reading.versions));
const out=path.join(D,'../../out/prototype.html');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
console.log('->',out,(html.length/1024).toFixed(0)+'KB');
