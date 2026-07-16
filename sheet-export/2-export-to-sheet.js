// PA Manager 라이브 데이터 → 구글 시트 익스포트 (무손실, 역-불러오기 가능 구조)
const crypto = require('crypto');
const fs = require('fs');
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const j = require(__dirname + '/pa-live.json');

const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const TODAY = '2026-07-05';

// ── SA 액세스 토큰 ─────────────────────────────────────────────
function b64url(x){return Buffer.from(x).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
async function getToken(){
  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=b64url(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const sig=crypto.createSign('RSA-SHA256').update(header+'.'+claim).sign(sa.private_key);
  const jwt=header+'.'+claim+'.'+b64url(sig);
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+jwt});
  const jj=await r.json(); if(!jj.access_token) throw new Error('token: '+JSON.stringify(jj));
  return jj.access_token;
}

// ── 값 정규화 (무손실) ─────────────────────────────────────────
function cell(v){
  if(v===null||v===undefined) return '';
  if(typeof v==='boolean') return v;
  if(typeof v==='number') return v;
  if(typeof v==='object') return JSON.stringify(v);
  return String(v);
}
// 행 배열 → {header, rows} : _brand 먼저, id 다음, 나머지 first-seen 순
function buildTable(rowsByBrand){
  const order=[]; const seen=new Set();
  for(const {rows} of rowsByBrand) for(const r of rows) for(const k of Object.keys(r)) if(!seen.has(k)){seen.add(k);order.push(k);}
  const rest=order.filter(k=>k!=='id');
  const header=['_brand', ...(seen.has('id')?['id']:[]), ...rest];
  const out=[header];
  for(const {brand,rows} of rowsByBrand) for(const r of rows){
    out.push(header.map(h=> h==='_brand'? brand : cell(r[h])));
  }
  return out;
}

const BRAND_TYPES=[
  ['step1','step1Rows'],['step2','step2Rows'],['shipping','shippingRows'],
  ['privacy','privacyRows'],['review','reviewRows'],['claudeStep2','claudeStep2Rows'],
];

// settlements 평탄화: brand → ...경로 → {paid,...} 리프
function flattenSettlements(s){
  const out=[['_brand','seg1','seg2','note','paid','paidDate']];
  for(const brand of Object.keys(s||{})){
    walk(s[brand], []);
    function walk(node, path){
      if(node && typeof node==='object' && ('paid' in node || 'paidDate' in node)){
        out.push([brand, path[0]||'', path[1]||'', cell(node.note), cell(node.paid), cell(node.paidDate)]);
        return;
      }
      if(node && typeof node==='object') for(const k of Object.keys(node)) walk(node[k], [...path,k]);
    }
  }
  return out;
}

// ── 탭 정의 만들기 ─────────────────────────────────────────────
function buildAllTabs(){
  const tabs={};
  tabs['_meta']=[
    ['PA Manager 데이터 익스포트'],
    ['생성일', TODAY],
    ['출처', 'https://pa-manager.onrender.com (Supabase id=1 라이브)'],
    [''],
    ['구조 안내 (나중에 프로그램으로 역-불러오기 가능하도록 설계됨)'],
    ['탭 규칙', '행타입 탭은 첫 열 _brand(=브랜드 id) + id + 각 필드. 값은 원본 그대로(RAW). 객체/배열 필드는 JSON 문자열.'],
    ['브랜드 id', j.brands.map(b=>b.id+'='+b.name).join(' , ')],
    ['행타입 탭', BRAND_TYPES.map(t=>t[0]).join(', ')],
    ['독립 탭', 'brands, paList, settlements'],
    ['편집 주의', '헤더(1행)와 _brand/id 열은 지우지 마세요. 그래야 프로그램으로 다시 불러올 수 있습니다.'],
  ];
  tabs['brands']=[['id','name'], ...j.brands.map(b=>[b.id, b.name])];
  for(const [tab,key] of BRAND_TYPES){
    const rowsByBrand=j.brands.map(b=>({brand:b.id, rows:(b[key]||[])}));
    tabs[tab]=buildTable(rowsByBrand);
  }
  tabs['paList']=[['pa'], ...(j.paList||[]).map(p=>[cell(p)])];
  tabs['settlements']=flattenSettlements(j.settlements);
  return tabs;
}

// ── 실행 ───────────────────────────────────────────────────────
(async()=>{
  const at=await getToken();
  const H={Authorization:'Bearer '+at,'Content-Type':'application/json'};
  const api=(path,method,body)=>fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${path}`,{method,headers:H,body:body?JSON.stringify(body):undefined});

  const tabs=buildAllTabs();
  const tabNames=Object.keys(tabs);

  // 현재 시트 조회
  let meta=await (await api('?fields=sheets.properties','GET')).json();
  const existing=new Map(meta.sheets.map(s=>[s.properties.title,s.properties.sheetId]));

  // 1) 필요한 탭 추가 (없는 것만), 임시로 시트1 유지
  const addReqs=[];
  for(const name of tabNames) if(!existing.has(name)) addReqs.push({addSheet:{properties:{title:name}}});
  if(addReqs.length){
    const r=await api(':batchUpdate','POST',{requests:addReqs});
    if(!r.ok){console.error('addSheet fail',await r.text());process.exit(1);}
  }
  // 제목 변경
  await api(':batchUpdate','POST',{requests:[{updateSpreadsheetProperties:{properties:{title:'PA Manager 데이터'},fields:'title'}}]});

  // 2) 값 채우기 (RAW, 탭별 clear 후 update)
  await api('/values:batchClear','POST',{ranges:tabNames.map(n=>`'${n}'`)});
  const data=tabNames.map(n=>({range:`'${n}'!A1`, values:tabs[n]}));
  const r2=await api('/values:batchUpdate','POST',{valueInputOption:'RAW', data});
  if(!r2.ok){console.error('values fail',await r2.text());process.exit(1);}
  const res2=await r2.json();
  console.log('updated cells:', res2.totalUpdatedCells);

  // 3) 헤더 굵게 + 1행 고정 + 시트1 삭제
  meta=await (await api('?fields=sheets.properties','GET')).json();
  const idOf=new Map(meta.sheets.map(s=>[s.properties.title,s.properties.sheetId]));
  const fmtReqs=[];
  for(const name of tabNames){
    const sid=idOf.get(name);
    fmtReqs.push({repeatCell:{range:{sheetId:sid,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true},backgroundColor:{red:0.92,green:0.94,blue:0.98}}},fields:'userEnteredFormat(textFormat,backgroundColor)'}});
    fmtReqs.push({updateSheetProperties:{properties:{sheetId:sid,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}});
  }
  if(idOf.has('시트1')) fmtReqs.push({deleteSheet:{sheetId:idOf.get('시트1')}});
  const r3=await api(':batchUpdate','POST',{requests:fmtReqs});
  if(!r3.ok){console.error('format fail',await r3.text());process.exit(1);}

  // 요약
  console.log('탭별 행수(헤더제외):');
  for(const n of tabNames) console.log('  '+n+':', tabs[n].length-1);
  console.log('완료 → https://docs.google.com/spreadsheets/d/'+SHEET+'/edit');
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
