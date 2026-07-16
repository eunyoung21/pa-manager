// 💰 정산요약 탭만 재작성 — 정산 기준 = 매달 1일~말일(달력 월)
//  · 월 드롭다운(B3)에서 시작/종료일 자동 파생(B1/B2) → 컨택현황 헬퍼 수당열도 월 기준으로 맞음
//  · 다른 탭/데이터는 건드리지 않음
const crypto = require('crypto');
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const S2BT = '📨 컨택현황(베이스튠)', S2GR = '📨 컨택현황(그래니살라)';
const SUMMARY = '💰 정산';
const BT = '베이스튠', GR = '그래니살라';
const MONTHS = ['2026-05', '2026-06', '2026-07'];
const DEFAULT_MONTH = '2026-06';
const PAY = ['유송미', '박민선', '이은영', '기타', '미지정'];

function b64u(x){return Buffer.from(x).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
async function getToken(){
  const now=Math.floor(Date.now()/1000);
  const h=b64u(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const c=b64u(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const sig=b64u(crypto.createSign('RSA-SHA256').update(h+'.'+c).sign(sa.private_key));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+h+'.'+c+'.'+sig});
  const jj=await r.json(); if(!jj.access_token) throw new Error('token '+JSON.stringify(jj)); return jj.access_token;
}

// 컨택현황 열: Q=정산PA G=DM발송 R=DM기준일 I=협업성사 J=성사일 T=성사기준일 B=채널명
const REF = t => ({ Q: `'${t}'!$Q$2:$Q`, G: `'${t}'!$G$2:$G`, R: `'${t}'!$R$2:$R`, I: `'${t}'!$I$2:$I`, J: `'${t}'!$J$2:$J`, T: `'${t}'!$T$2:$T`, B: `'${t}'!$B$2:$B` });
const bt = REF(S2BT), gr = REF(S2GR);
// DM 건수: DM발송=Y, DM기준일(발송일∨등록일) 월 일치
const dmCnt = (r) => {
  const one = (x) => `SUMPRODUCT((${x.Q}=$A${r})*(${x.G}="Y")*(LEFT(${x.R},7)=$B$3))`;
  return `IF($B$4="${GR}",0,${one(bt)})+IF($B$4="${BT}",0,${one(gr)})`;
};
// 성사 건수: 협업성사=Y, 성사일(J) 있고 그 월 일치 (성사일 빈칸은 제외)
const deCnt = (r) => {
  const one = (x) => `SUMPRODUCT((${x.Q}=$A${r})*(${x.I}="Y")*(${x.J}<>"")*(LEFT(${x.T},7)=$B$3))`;
  return `IF($B$4="${GR}",0,${one(bt)})+IF($B$4="${BT}",0,${one(gr)})`;
};
function chJoin(r) {
  const one = (x) => `IFERROR(TEXTJOIN(", ",TRUE,FILTER(${x.B},${x.Q}=$A${r},${x.I}="Y",${x.J}<>"",LEFT(${x.T},7)=$B$3)),"")`;
  return `=TEXTJOIN(", ",TRUE,IF($B$4="${GR}","",${one(bt)}),IF($B$4="${BT}","",${one(gr)}))`;
}

(async () => {
  const at = await getToken();
  const H = { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' };
  const api = (p, m, b) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });

  const meta = await (await api('?fields=sheets.properties(title,sheetId)', 'GET')).json();
  const sid = (meta.sheets.find(s => s.properties.title === SUMMARY) || {}).properties?.sheetId;
  if (sid == null) throw new Error('정산요약 탭을 찾을 수 없음');

  // 1) 초기화
  await api(`/values/${encodeURIComponent(`'${SUMMARY}'`)}:clear`, 'POST', {});

  // 2) 컨트롤/헤더/라벨 (RAW)
  const P1 = 7, Plast = P1 + PAY.length - 1, Ptot = Plast + 1;
  const raw = [
    ['정산 시작일', ''],   // B1: 아래에서 수식으로
    ['정산 종료일', ''],   // B2: 아래에서 수식으로
    ['정산 월', DEFAULT_MONTH, '', '← 여기서 월 선택 (매달 1일~말일 기준)'],
    ['브랜드', '전체', '', '← 전체 / 베이스튠 / 그래니살라'],
    [''],
    ['담당PA', 'DM 건수', 'DM수당', '성사 건수', '성사수당', '소계', '실지급(3.3%공제)', '정산완료', '성사 채널'],
    ...PAY.map(p => [p]),
    ['합계'],
  ];
  // 레이아웃은 RAW('2026-06'을 텍스트로 보존), B1/B2 수식은 아래 USER_ENTERED에서
  await api('/values:batchUpdate', 'POST', { valueInputOption: 'RAW', data: [{ range: `'${SUMMARY}'!A1`, values: raw }] });
  await api('/values:batchUpdate', 'POST', { valueInputOption: 'USER_ENTERED', data: [
    { range: `'${SUMMARY}'!B1`, values: [['=$B$3&"-01"'], ['=TEXT(EOMONTH(DATE(LEFT($B$3,4),MID($B$3,6,2),1),0),"yyyy-mm-dd")']] },
  ] });

  // 3) 집계 수식 (USER_ENTERED)
  const rows = [];
  for (let i = 0; i < PAY.length; i++) {
    const r = P1 + i;
    rows.push([`=${dmCnt(r)}`, `=B${r}*2000`, `=${deCnt(r)}`, `=D${r}*20000`, `=C${r}+E${r}`, `=ROUND(F${r}*0.967,0)`, false, chJoin(r)]);
  }
  await api('/values:batchUpdate', 'POST', { valueInputOption: 'USER_ENTERED', data: [
    { range: `'${SUMMARY}'!B${P1}`, values: rows },
    { range: `'${SUMMARY}'!B${Ptot}`, values: [[`=SUM(B${P1}:B${Plast})`, `=SUM(C${P1}:C${Plast})`, `=SUM(D${P1}:D${Plast})`, `=SUM(E${P1}:E${Plast})`, `=SUM(F${P1}:F${Plast})`, `=SUM(G${P1}:G${Plast})`]] },
  ] });

  // 4) 서식
  const won = { type: 'NUMBER', pattern: '#,##0"원"' };
  const reqs = [
    // 헤더(6행=idx5)
    { repeatCell: { range: { sheetId: sid, startRowIndex: 5, endRowIndex: 6 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.20, green: 0.33, blue: 0.55 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    // 컨트롤(1~4행 A:B) 강조 + 텍스트포맷(월 날짜화 방지)
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.97, blue: 0.85 } } }, fields: 'userEnteredFormat(numberFormat,textFormat,backgroundColor)' } },
    // 월 드롭다운 B3
    { setDataValidation: { range: { sheetId: sid, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: 'ONE_OF_LIST', values: MONTHS.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
    // 브랜드 드롭다운 B4
    { setDataValidation: { range: { sheetId: sid, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: 'ONE_OF_LIST', values: ['전체', BT, GR].map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } },
    // 금액서식: C(DM수당) idx2, E/F/G idx4-7  (B,D=건수는 제외)
    { repeatCell: { range: { sheetId: sid, startRowIndex: P1 - 1, endRowIndex: Ptot, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: won } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: P1 - 1, endRowIndex: Ptot, startColumnIndex: 4, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: won } }, fields: 'userEnteredFormat.numberFormat' } },
    // 체크박스 H(idx7) PA행만
    { setDataValidation: { range: { sheetId: sid, startRowIndex: P1 - 1, endRowIndex: Plast, startColumnIndex: 7, endColumnIndex: 8 }, rule: { condition: { type: 'BOOLEAN' } } } },
    // 합계행 강조
    { repeatCell: { range: { sheetId: sid, startRowIndex: Ptot - 1, endRowIndex: Ptot, startColumnIndex: 0, endColumnIndex: 7 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.86 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
  ];
  const rf = await api(':batchUpdate', 'POST', { requests: reqs });
  if (!rf.ok) throw new Error('fmt ' + await rf.text());

  console.log('💰 정산요약 재작성 완료 — 월 기준(기본', DEFAULT_MONTH + '). 월/브랜드 드롭다운으로 조회.');
  console.log('시트: https://docs.google.com/spreadsheets/d/' + SHEET + '/edit#gid=' + sid);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
