// PA 매니저 → 한글 업무용 구글시트 v2
//  · 리스트업/컨택현황 브랜드별 분리  · 정산=6/1~7/4 창 기준(보낸 DM 전부 + 성사 전부)  · 정산내역 명단
const crypto = require('crypto');
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const j = require(__dirname + '/pa-live.json');
const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const TODAY = '2026-07-05';
const WIN_LO = '2026-06-01', WIN_HI = '2026-07-04';

const PA_LIST = ['유송미', '박민선', '이은영', '기타'];
const PA_RENAME = { '송미님': '유송미', '민선님': '박민선', '이은영님': '이은영' };
function sanitizePA(raw) {
  if (!raw) return '';
  let s = String(raw);
  if (PA_RENAME[s]) s = PA_RENAME[s];
  if (PA_LIST.includes(s)) return s;
  const fk = (s.match(/[가-힣]/) || [])[0];
  if (fk) { const bf = PA_LIST.filter(p => p.startsWith(fk)); if (bf.length === 1) return bf[0]; }
  const ko = s.replace(/[^가-힣]/g, '');
  const bk = PA_LIST.find(p => p.replace(/[^가-힣]/g, '').includes(ko) || ko.includes(p.replace(/[^가-힣]/g, '')));
  return bk || s;
}
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Y' : 'N';
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
// 날짜 → YYYY-MM-DD (앱 parseDateKey 동일)
function pdk(s) {
  if (!s) return null; const str = String(s).trim();
  const m2 = str.match(/^(\d{2})[^\d](\d{1,2})[^\d](\d{1,2})$/);
  if (m2) { const mm = m2[2].padStart(2, '0'), dd = m2[3].padStart(2, '0'); if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `20${m2[1]}-${mm}-${dd}`; }
  const m4 = str.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (m4) return `${m4[1]}-${m4[2].padStart(2, '0')}-${m4[3].padStart(2, '0')}`;
  return null;
}
const inWin = d => d && d >= WIN_LO && d <= WIN_HI;

// ── 토큰 ───────────────────────────────────────────────────────
function b64u(x){return Buffer.from(x).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
async function getToken(){
  const now=Math.floor(Date.now()/1000);
  const h=b64u(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const c=b64u(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const sig=b64u(crypto.createSign('RSA-SHA256').update(h+'.'+c).sign(sa.private_key));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+h+'.'+c+'.'+sig});
  const jj=await r.json(); if(!jj.access_token) throw new Error('token '+JSON.stringify(jj)); return jj.access_token;
}

// ── 컬럼 정의 ──────────────────────────────────────────────────
const S1 = [['등록일','date'],['채널명','name'],['링크','link'],['팔로워','followers'],['담당PA','pa'],['페르소나','persona'],['피드분석메모','feedMemo'],['가설/특이사항','hypothesis'],['검수상태','reviewStatus'],['반려사유','rejectReason'],['id','id']];
const S2D = [['날짜','date'],['채널명','name'],['링크','link'],['팔로워','followers'],['담당PA','pa'],['진행상태','contactStatus'],['DM발송','dmSent'],['DM발송일','dmDate'],['협업성사','dealDone'],['성사일','dealDate'],['거절일','rejectDate'],['단가','rate'],['예상게시일','expectedPost'],['출고완료','shippingDone'],['계약서','contractDone'],['메모','memo'],['id','id']];
const CL = [['날짜','date'],['채널명','name'],['링크','link'],['팔로워','followers'],['카테고리','category'],['담당PA','pa'],['진행상태','contactStatus'],['DM발송','dmSent'],['협업성사','dealDone'],['성사일','dealDate'],['단가','rate'],['예상게시일','expectedPost'],['출고완료','shippingDone'],['계약서','contractDone'],['메모','memo'],['id','id']];
const SH = [['출고요청일','requestDate'],['요청자','requester'],['사유','reason'],['채널명','channelName'],['수령자명','recipient'],['연락처','phone'],['배송지주소','address'],['상품명','product'],['수량','qty'],['비고','notes'],['처리상태','status'],['출고일자','shipDate'],['송장번호','tracking'],['id','id']];
const RV = [['날짜','date'],['채널명','channelName'],['본명','realName'],['담당PA','pa'],['PA코드','paCode'],['게시링크','postLink'],['라이브','live'],['라이브일','liveDate'],['상태','status'],['메모','memo'],['검수체크','checks'],['id','id']];
const PV = [['채널명','channelName'],['성명','realName'],['전화번호','phone'],['주소','address'],['주민번호','rrn'],['은행','bankName'],['예금주','bankHolder'],['계좌번호','bankAccount'],['통장사본','bankFile'],['신분증사본','idFile'],['비고','notes'],['id','id']];

const byName = {}; j.brands.forEach(b => byName[b.name] = b);
const BT = '베이스튠', GR = '그래니살라';
const S2BT = '📨 컨택현황(베이스튠)', S2GR = '📨 컨택현황(그래니살라)';

// 브랜드열 포함 일반 탭
function tableRows(cols, key) {
  const rows = [['브랜드', ...cols.map(c => c[0])]];
  for (const b of j.brands) for (const r of (b[key] || [])) rows.push([b.name, ...cols.map(c => cell(r[c[1]]))]);
  return rows;
}
// 브랜드별 단일 탭 (브랜드열 없음)
function brandTable(cols, key, brandName) {
  const b = byName[brandName];
  const rows = [cols.map(c => c[0])];
  for (const r of (b[key] || [])) rows.push(cols.map(c => cell(r[c[1]])));
  return rows;
}
// 컨택현황(브랜드별): 데이터 + 정산PA (수식열은 별도)
function contactData(brandName) {
  const b = byName[brandName];
  const rows = [[...S2D.map(c => c[0]), '정산PA']];
  for (const r of (b.step2Rows || [])) rows.push([...S2D.map(c => cell(r[c[1]])), sanitizePA(r.pa)]);
  return rows;
}

// 정산내역 명단(값): 창 내 DM/성사 건별
function settleLedger() {
  const out = [['브랜드', '담당PA', '채널명', '유형', '기준일', '금액']];
  const items = [];
  for (const b of j.brands) for (const r of (b.step2Rows || [])) {
    if (!r.name) continue;
    const pa = sanitizePA(r.pa) || '미지정';
    if (r.dmSent === 'Y') { const d = pdk(r.dmDate) || pdk(r.date); if (inWin(d)) items.push([b.name, pa, r.name, 'DM', d, 2000]); }
    if (r.dealDone === 'Y') { const d = pdk(r.dealDate) || pdk(r.date); if (inWin(d)) items.push([b.name, pa, r.name, '성사', d, 20000]); }
  }
  // 정렬: PA → 유형(성사 먼저) → 기준일
  items.sort((a, b) => a[1].localeCompare(b[1]) || (a[3] === b[3] ? 0 : a[3] === '성사' ? -1 : 1) || String(a[4]).localeCompare(String(b[4])));
  return out.concat(items);
}

// 정산완료기록(과거 settlements 평탄화)
function settleRecord() {
  const out = [['브랜드', '월', '담당PA', '지급액', '지급일', '비고']];
  const s = j.settlements || {};
  for (const brand of Object.keys(s)) (function rec(node, path) {
    if (node && typeof node === 'object' && ('paid' in node || 'paidDate' in node)) { out.push([brand, path[0] || '', path[1] || '', cell(node.paid), cell(node.paidDate), cell(node.note)]); return; }
    if (node && typeof node === 'object') for (const k of Object.keys(node)) rec(node[k], [...path, k]);
  })(s[brand], []);
  return out;
}

// DK 람다(문자열) — 날짜셀 → YYYY-MM-DD
const DK = `LAMBDA(x,LET(s,TRIM(TO_TEXT(x)),IF(NOT(REGEXMATCH(s,"^\\d+\\D+\\d+\\D+\\d+")),"",LET(y,REGEXEXTRACT(s,"^(\\d+)"),mo,REGEXEXTRACT(s,"^\\d+\\D+(\\d+)"),da,REGEXEXTRACT(s,"^\\d+\\D+\\d+\\D+(\\d+)"),(IF(LEN(y)>=4,LEFT(y,4),"20"&RIGHT("0"&y,2)))&"-"&RIGHT("0"&mo,2)&"-"&RIGHT("0"&da,2)))))`;
// 컨택현황 수식 4열(S:DM기준일 T:DM수당 U:성사기준일 V:성사수당), R=행
function contactFormulas(R) {
  const W = "'💰 정산요약'";
  const S = `=LET(dk,${DK},IF($G${R}<>"Y","",IF(dk($H${R})<>"",dk($H${R}),dk($A${R}))))`;
  const T = `=IF($S${R}="",0,IF(AND($S${R}>=${W}!$B$1,$S${R}<=${W}!$B$2),2000,0))`;
  const U = `=LET(dk,${DK},IF($I${R}<>"Y","",IF(dk($J${R})<>"",dk($J${R}),dk($A${R}))))`;
  const V = `=IF($U${R}="",0,IF(AND($U${R}>=${W}!$B$1,$U${R}<=${W}!$B$2),20000,0))`;
  return [S, T, U, V];
}

(async () => {
  const at = await getToken();
  const H = { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' };
  const api = (p, m, b) => fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });

  const cBT = contactData(BT), cGR = contactData(GR);
  const nBT = cBT.length, nGR = cGR.length; // 헤더포함
  const PAY = [...PA_LIST, '미지정'];

  const tabs = {
    'ℹ️ 안내': [
      ['PA 매니저 — 구글시트 업무용 (v2)'],
      ['생성일', TODAY, '출처: 라이브(Supabase id=1)'],
      [''],
      ['■ 탭 구성'],
      ['· 리스트업/컨택현황은 브랜드별로 분리: 「리스트업(베이스튠/그래니살라)」「컨택현황(베이스튠/그래니살라)」'],
      ['· 파란 헤더(1행)와 맨 끝 id 열은 지우지 마세요(프로그램 재불러오기용).'],
      [''],
      ['■ 정산 규칙 (6/1~7/4 기준)'],
      ['· 정산 대상 = 창(정산 시작일~종료일) 안에 "보낸 DM 전부" + "성사된 협업 전부".'],
      ['· DM발송=Y 1건당 2,000원 · 협업성사=Y 1건당 20,000원 · 실지급 = 소계 × 96.7%(3.3% 공제).'],
      ['· 기준일: DM은 DM발송일(비었으면 행 날짜), 성사는 성사일(비었으면 행 날짜).'],
      ['· 「💰 정산요약」 위쪽에서 시작일/종료일/브랜드를 바꾸면 자동 재계산됩니다.'],
      ['· 「🧾 정산내역」 = 창 안의 건별 명단(누가 성사·누가 DM). 컨택현황에서 체크를 고친 뒤엔 정산요약은 자동 갱신, 명단은 bat 재실행 시 갱신.'],
      [`· 현재 창: ${WIN_LO} ~ ${WIN_HI}`],
    ],
    '📋 리스트업(베이스튠)': brandTable(S1, 'step1Rows', BT),
    '📋 리스트업(그래니살라)': brandTable(S1, 'step1Rows', GR),
    [S2BT]: cBT,
    [S2GR]: cGR,
    '🤖 Claude': tableRows(CL, 'claudeStep2Rows'),
    '📦 출고': tableRows(SH, 'shippingRows'),
    '🎬 영상검수': tableRows(RV, 'reviewRows'),
    '🔒 개인정보': tableRows(PV, 'privacyRows'),
    '🧾 정산내역': settleLedger(),
    '📒 정산완료기록': settleRecord(),
  };
  // 💰 정산요약 (컨트롤 + PA 라벨만 RAW)
  tabs['💰 정산요약'] = [
    ['정산 시작일', WIN_LO, '', '← 포함 시작일 (YYYY-MM-DD)'],
    ['정산 종료일', WIN_HI, '', '← 포함 종료일'],
    ['브랜드', '전체', '', '← 전체 / 베이스튠 / 그래니살라'],
    [''],
    ['담당PA', 'DM 건수', 'DM수당', '성사 건수', '성사수당', '소계', '실지급(3.3%공제)', '정산완료', '성사 채널'],
    ...PAY.map(p => [p]),
    ['합계'],
  ];

  const tabNames = Object.keys(tabs);

  // 1) 새 탭 추가
  let meta = await (await api('?fields=sheets.properties', 'GET')).json();
  const existing = new Map(meta.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  const addReqs = tabNames.filter(t => !existing.has(t)).map(t => ({ addSheet: { properties: { title: t } } }));
  if (addReqs.length) { const r = await api(':batchUpdate', 'POST', { requests: addReqs }); if (!r.ok) throw new Error('add ' + await r.text()); }
  await api(':batchUpdate', 'POST', { requests: [{ updateSpreadsheetProperties: { properties: { title: 'PA 매니저 (구글시트 업무용)' }, fields: 'title' } }] });

  // 2) 값(RAW)
  await api('/values:batchClear', 'POST', { ranges: tabNames.map(t => `'${t}'`) });
  const rawData = tabNames.map(t => ({ range: `'${t}'!A1`, values: tabs[t] }));
  let r = await api('/values:batchUpdate', 'POST', { valueInputOption: 'RAW', data: rawData });
  if (!r.ok) throw new Error('raw ' + await r.text());

  // 3) 수식(USER_ENTERED)
  const f = [];
  for (const [tab, n] of [[S2BT, nBT], [S2GR, nGR]]) {
    const rows = [['DM기준일', 'DM수당', '성사기준일', '성사수당']];
    for (let R = 2; R <= n; R++) rows.push(contactFormulas(R));
    f.push({ range: `'${tab}'!S1`, values: rows });
  }
  // 정산요약 집계
  const P1 = 6, Plast = P1 + PAY.length - 1, Ptot = Plast + 1;
  const refR = t => `'${t}'!$R:$R`, refT = t => `'${t}'!$T:$T`, refV = t => `'${t}'!$V:$V`, refB = t => `'${t}'!$B:$B`;
  const sumBrand = (col) => (r) => `IF($B$3="${GR}",0,SUMIF(${refR(S2BT)},$A${r},${col(S2BT)}))+IF($B$3="${BT}",0,SUMIF(${refR(S2GR)},$A${r},${col(S2GR)}))`;
  const dmSum = sumBrand(refT), dealSum = sumBrand(refV);
  const chJoin = (r) => `=TEXTJOIN(", ",TRUE,IF($B$3="${GR}","",IFERROR(TEXTJOIN(", ",TRUE,FILTER(${refB(S2BT)},${refR(S2BT)}=$A${r},${refV(S2BT)}>0)),"")),IF($B$3="${BT}","",IFERROR(TEXTJOIN(", ",TRUE,FILTER(${refB(S2GR)},${refR(S2GR)}=$A${r},${refV(S2GR)}>0)),"")))`;
  const pay = [];
  for (let i = 0; i < PAY.length; i++) {
    const r = P1 + i;
    pay.push([`=C${r}/2000`, `=${dmSum(r)}`, `=E${r}/20000`, `=${dealSum(r)}`, `=C${r}+E${r}`, `=ROUND(F${r}*0.967,0)`, false, chJoin(r).slice(1)]);
  }
  // B열부터 채우기 위해 각 행을 B..I 로: [DM건수(B),DM수당(C),성사건수(D),성사수당(E),소계(F),실지급(G),완료(H),성사채널(I)]
  const payVals = pay.map(row => [row[0], row[1], row[2], row[3], row[4], row[5], row[6], '=' + row[7]]);
  f.push({ range: `'💰 정산요약'!B${P1}`, values: payVals });
  f.push({ range: `'💰 정산요약'!B${Ptot}`, values: [[`=SUM(B${P1}:B${Plast})`, `=SUM(C${P1}:C${Plast})`, `=SUM(D${P1}:D${Plast})`, `=SUM(E${P1}:E${Plast})`, `=SUM(F${P1}:F${Plast})`, `=SUM(G${P1}:G${Plast})`]] });
  r = await api('/values:batchUpdate', 'POST', { valueInputOption: 'USER_ENTERED', data: f });
  if (!r.ok) throw new Error('ue ' + await r.text());

  // 4) 서식
  meta = await (await api('?fields=sheets.properties', 'GET')).json();
  const idOf = new Map(meta.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  const reqs = [];
  const HDRBG = { red: 0.20, green: 0.33, blue: 0.55 }, WHITE = { red: 1, green: 1, blue: 1 };
  for (const t of tabNames) {
    if (t === 'ℹ️ 안내') continue;
    const sid = idOf.get(t);
    const hdr = (t === '💰 정산요약') ? 4 : 0;
    reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: hdr, endRowIndex: hdr + 1 }, cell: { userEnteredFormat: { backgroundColor: HDRBG, textFormat: { bold: true, foregroundColor: WHITE } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } });
    reqs.push({ updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: hdr + 1 } }, fields: 'gridProperties.frozenRowCount' } });
  }
  const dv = (sid, col, list) => ({ setDataValidation: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: list.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } });
  // 컨택현황 두 탭: 드롭다운 + 수당 숫자서식
  for (const t of [S2BT, S2GR]) {
    const sid = idOf.get(t);
    reqs.push(dv(sid, 5, ['컨택 전', '진행중', '컨택 완료', '계약서 작성', '거절'])); // F 진행상태
    for (const c of [6, 8, 13, 14]) reqs.push(dv(sid, c, ['Y', 'N'])); // G DM발송, I 협업성사, N 출고완료, O 계약서
    reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 19, endColumnIndex: 20 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0"원"' } } }, fields: 'userEnteredFormat.numberFormat' } }); // T DM수당
    reqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: 21, endColumnIndex: 22 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0"원"' } } }, fields: 'userEnteredFormat.numberFormat' } }); // V 성사수당
  }
  // Claude Y/N
  const sidC = idOf.get('🤖 Claude');
  for (const c of [8, 9, 13, 14]) reqs.push(dv(sidC, c, ['Y', 'N']));
  // 정산내역 금액 서식
  const sidL = idOf.get('🧾 정산내역');
  reqs.push({ repeatCell: { range: { sheetId: sidL, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0"원"' } } }, fields: 'userEnteredFormat.numberFormat' } });
  // 정산요약 서식
  const sidP = idOf.get('💰 정산요약');
  reqs.push({ setDataValidation: { range: { sheetId: sidP, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: 'ONE_OF_LIST', values: ['전체', BT, GR].map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } });
  const won = { type: 'NUMBER', pattern: '#,##0"원"' };
  reqs.push({ repeatCell: { range: { sheetId: sidP, startRowIndex: P1 - 1, endRowIndex: Ptot, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: won } }, fields: 'userEnteredFormat.numberFormat' } }); // C DM수당
  reqs.push({ repeatCell: { range: { sheetId: sidP, startRowIndex: P1 - 1, endRowIndex: Ptot, startColumnIndex: 4, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: won } }, fields: 'userEnteredFormat.numberFormat' } }); // E,F,G
  reqs.push({ setDataValidation: { range: { sheetId: sidP, startRowIndex: P1 - 1, endRowIndex: Plast, startColumnIndex: 7, endColumnIndex: 8 }, rule: { condition: { type: 'BOOLEAN' } } } }); // H 완료
  reqs.push({ repeatCell: { range: { sheetId: sidP, startRowIndex: Ptot - 1, endRowIndex: Ptot, startColumnIndex: 0, endColumnIndex: 7 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.86 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } });
  reqs.push({ repeatCell: { range: { sheetId: sidP, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, textFormat: { bold: true }, backgroundColor: { red: 1, green: 0.97, blue: 0.85 } } }, fields: 'userEnteredFormat(numberFormat,textFormat,backgroundColor)' } });
  r = await api(':batchUpdate', 'POST', { requests: reqs });
  if (!r.ok) throw new Error('fmt ' + await r.text());

  // 5) 옛 탭 삭제
  meta = await (await api('?fields=sheets.properties', 'GET')).json();
  const del = meta.sheets.filter(s => !tabNames.includes(s.properties.title)).map(s => ({ deleteSheet: { sheetId: s.properties.sheetId } }));
  if (del.length) { r = await api(':batchUpdate', 'POST', { requests: del }); if (!r.ok) throw new Error('del ' + await r.text()); }

  const ledN = tabs['🧾 정산내역'].length - 1;
  console.log('완료. 탭:', tabNames.length, '개');
  console.log('컨택현황 베이스튠', nBT - 1, '· 그래니', nGR - 1, '· 정산내역(창내 건별)', ledN, '건');
  console.log('시트: https://docs.google.com/spreadsheets/d/' + SHEET + '/edit');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
