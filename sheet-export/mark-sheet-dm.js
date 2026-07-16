// send-dm 결과(dm-preview.json)로 은영(그래니) 탭의 DM발송=Y / 진행상태=컨택 중 표기
// 발송 전송확인(sent=true)된 계정만. 링크의 username 매칭.
const crypto = require('crypto');
const fs = require('fs');
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const TAB = '은영(그래니)';
const PREVIEW = process.argv[2] || 'D:/claude-work/influencer-finder/data/dm-preview.json';

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
const handleOf = l => { const m=(l||'').match(/instagram\.com\/([A-Za-z0-9._]+)/); return m?m[1].toLowerCase().replace(/\.$/,''):''; };

(async()=>{
  const prev = JSON.parse(fs.readFileSync(PREVIEW,'utf8'));
  const sentUsers = new Set((prev.results||[]).filter(r=>r.sent).map(r=>r.username.toLowerCase().replace(/\.$/,'')));
  console.log('전송확인 계정 수:', sentUsers.size);
  const at=await getToken();
  const H={Authorization:'Bearer '+at,'Content-Type':'application/json'};
  const api=(p,m,b)=>fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${p}`,{method:m,headers:H,body:b?JSON.stringify(b):undefined});
  const g=await (await api(`/values/${encodeURIComponent(TAB)}!A1:N400`,'GET')).json();
  const rows=g.values||[];
  const data=[]; let marked=0;
  for(let i=1;i<rows.length;i++){
    const u=handleOf(rows[i][3]);
    if(u && sentUsers.has(u)){
      const rn=i+1; // sheet row number
      data.push({range:`${TAB}!G${rn}`, values:[['컨택 중']]});
      data.push({range:`${TAB}!H${rn}`, values:[['Y']]});
      marked++;
      console.log(`  행${rn} @${u} → DM발송 Y`);
    }
  }
  if(!data.length){console.log('매칭된 발송건 없음');return;}
  const r=await api('/values:batchUpdate','POST',{valueInputOption:'RAW',data});
  const jj=await r.json();
  if(!r.ok){console.error('표기 실패',JSON.stringify(jj));process.exit(1);}
  console.log(`완료: ${marked}명 DM발송=Y / 진행상태=컨택 중`);
})();
