// index.html 안의 JSX 문법 검사 — 브라우저 Babel 과 같은 변환을 미리 돌려본다
const fs=require('fs');const path=require('path');
const Babel=require(process.env.BABEL||'D:/Git/pa-manager/node_modules/@babel/standalone');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=h.match(/<script type="text\/pa-jsx" id="pa-app-src">([\s\S]*?)<\/script>/);
if(!m){console.error('JSX 블록 없음');process.exit(1);}
try{Babel.transform(m[1],{presets:['react']});console.log('JSX OK');}
catch(e){console.error(e.message.slice(0,600));process.exit(1);}
