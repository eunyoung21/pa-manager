// 은영(그래니) 탭에 귀농/귀촌/전원생활 인플루언서 30명 append (기존 120행 아래에 추가)
const crypto = require('crypto');
const fs = require('fs');
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const TAB = '은영(그래니)';
const DATE = '26.07.06';

// 입력: data/rural-final.json = [{name, link, followers, category}]
const picks = JSON.parse(fs.readFileSync(process.argv[2] || 'D:/claude-work/influencer-finder/data/rural-final.json', 'utf8'));

function b64url(x){return Buffer.from(x).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
async function getToken(){
  const now=Math.floor(Date.now()/1000);
  const h=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const c=b64url(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const sig=crypto.createSign('RSA-SHA256').update(h+'.'+c).sign(sa.private_key);
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+h+'.'+c+'.'+b64url(sig)});
  const jj=await r.json(); if(!jj.access_token) throw new Error('token: '+JSON.stringify(jj));
  return jj.access_token;
}
// 행: 브랜드,날짜,채널명,링크,팔로워,카테고리,진행상태,DM발송,협업성사,성사일,단가,예상게시일,출고완료,계약서
function row(p){
  return ['그래니살라', DATE, p.name, p.link, String(p.followers), p.category||'귀농·전원',
          '컨택 전','N','N','','','','미완료','미완료'];
}
(async()=>{
  const at=await getToken();
  const H={Authorization:'Bearer '+at,'Content-Type':'application/json'};
  const api=(path,method,body)=>fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${path}`,{method,headers:H,body:body?JSON.stringify(body):undefined});
  // 현재 데이터 행수 확인(중복 append 방지)
  const g=await (await api(`/values/${encodeURIComponent(TAB)}!D1:D400`,'GET')).json();
  const existing=(g.values||[]).slice(1).map(r=>(r[0]||'').trim());
  const fresh=picks.filter(p=>!existing.includes(p.link.trim()));
  console.log(`기존 ${existing.length}행 · 입력 ${picks.length}명 · 신규 ${fresh.length}명 append`);
  const values=fresh.map(row);
  const r=await api(`/values/${encodeURIComponent(TAB)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,'POST',{values});
  const jj=await r.json();
  if(!r.ok){console.error('append 실패',JSON.stringify(jj));process.exit(1);}
  console.log('완료:', jj.updates && jj.updates.updatedRange);
})();
