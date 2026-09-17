/* 2026-09-17 안민영↔박민선 중복 정리 — 담당은 전부 안민영 (먼저 리스트업/진행)
   박민선 쪽 기록만 '종료' 표시로 바꾼다(삭제 없음). 서비스계정으로 _appdata 를 직접 읽고 쓴다.
   node dedupe-2026-09-17.js          → 미리보기(쓰기 없음) + 백업 저장
   node dedupe-2026-09-17.js --apply  → 실제 반영(쓰기 직전 rev 재확인, 쓴 뒤 되읽어 검증)
   저장 형식은 apps-script/Code.gs writeData 와 같다(45k 청크·서로게이트/수식 트리거 경계 회피·RAW). */
const fs = require('fs');
const crypto = require('crypto');
const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const sa = require('D:/Git/cafe24-gsheet-automation/credentials.json');
const APPLY = process.argv.includes('--apply');
const BK = 'D:/Git/pa-manager-migration-backup/20260917';
const TODAY = '26.09.17';
const NOTE = '[중복정리 26.09.17] 안민영 담당(먼저 진행)';

const b64url = s => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + head + '.' + claim + '.' + sig });
  return (await r.json()).access_token;
}
let TOK;
const api = async (path, opt = {}) => {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/${path}`, { ...opt, headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
  const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j;
};
const readAll = async () => {
  const chunks = (await api('values/' + encodeURIComponent('_appdata!A:A'))).values || [];
  const meta = ((await api('values/' + encodeURIComponent('_meta!A1:A5'))).values || []).map(r => r[0]);
  const raw = chunks.map(r => r[0] || '').join('');
  return { raw, data: JSON.parse(raw), meta };
};
const handleOf = r => { const m = String(r.link || '').match(/instagram\.com\/([A-Za-z0-9._]+)/i); return m ? m[1].toLowerCase() : ''; };

// 바꿀 행 — 박민선 쪽만
function plan(d) {
  const b = d.brands.find(x => x.id === 'basetune');
  const ch = [];
  const s2 = h => b.step2Rows.filter(r => handleOf(r) === h && String(r.pa).includes('민선'));
  const s1 = (h, st) => b.step1Rows.filter(r => handleOf(r) === h && String(r.pa).includes('민선') && r.reviewStatus === st);
  // KimU — 박민선 컨택(9/15 DM) 종료
  s2('k__k.u').forEach(r => ch.push({ arr: 'step2Rows', r, who: 'KimU 박민선 컨택', patch: { contactStatus: '거절', rejectDate: TODAY, memo: [r.memo, NOTE].filter(Boolean).join(' / ') } }));
  // 구름 — 박민선 리스트업(검수대기) 반려
  s1('verdanor_', '검수대기').forEach(r => ch.push({ arr: 'step1Rows', r, who: '구름 박민선 리스트업', patch: { reviewStatus: '반려', rejectReason: '중복 — 안민영 진행·완료' } }));
  // 해기 — 박민선 리스트업(검수대기) 반려 + 9/8 컨택(DM 전) 종료
  s1('__haegi', '검수대기').forEach(r => ch.push({ arr: 'step1Rows', r, who: '해기 박민선 리스트업(7/9)', patch: { reviewStatus: '반려', rejectReason: '중복 — 안민영 진행·완료' } }));
  s2('__haegi').forEach(r => ch.push({ arr: 'step2Rows', r, who: '해기 박민선 컨택(9/8)', patch: { contactStatus: '거절', rejectDate: TODAY, memo: [r.memo, NOTE].filter(Boolean).join(' / ') } }));
  // 찐미니 — 박민선 컨택은 이미 거절, 메모만 남김
  s2('j_mining').forEach(r => { if (!String(r.memo || '').includes('중복정리')) ch.push({ arr: 'step2Rows', r, who: '찐미니 박민선 컨택(이미 거절)', patch: { memo: [r.memo, NOTE].filter(Boolean).join(' / ') } }); });
  return ch;
}
function chunk(str) {
  const rows = []; const CH = 45000;
  for (let i = 0; i < str.length;) {
    let end = Math.min(i + CH, str.length);
    if (end < str.length) {
      const c = str.charCodeAt(end - 1); if (c >= 0xD800 && c <= 0xDBFF) end--;
      let g = 0; while (end > i + 1 && g++ < 10 && '=+-@'.includes(str.charAt(end))) end--;
    }
    rows.push([str.substring(i, end)]); i = end;
  }
  return rows;
}
const KEYS = ['step1Rows', 'step2Rows', 'claudeStep1Rows', 'claudeStep2Rows', 'shippingRows', 'reviewRows', 'privacyRows'];
const counts = d => { const o = {}; d.brands.forEach(b => { const c = {}; KEYS.forEach(k => c[k] = (b[k] || []).length); o[b.id] = c; }); return o; };
const total = d => d.brands.reduce((n, b) => n + KEYS.reduce((m, k) => m + (b[k] || []).length, 0), 0);

(async () => {
  TOK = await token();
  const before = await readAll();
  fs.mkdirSync(BK, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`${BK}/before-dedupe-${stamp}.json`, JSON.stringify({ meta: before.meta, raw: before.raw }));
  console.log('백업:', `${BK}/before-dedupe-${stamp}.json`, '| rev', before.meta[0]);
  const d = JSON.parse(before.raw);
  const ch = plan(d);
  ch.forEach(c => console.log(`- ${c.who}: ${Object.entries(c.patch).map(([k, v]) => `${k} "${c.r[k] ?? ''}" → "${v}"`).join(' · ')}`));
  if (!APPLY) { console.log(`\n미리보기 ${ch.length}건 (쓰기 안 함)`); return; }

  // 반영 — 쓰기 직전 rev 재확인(그 사이 누가 저장했으면 중단 후 다시 실행)
  ch.forEach(c => { const row = d.brands.find(x => x.id === 'basetune')[c.arr].find(r => r.id === c.r.id); Object.assign(row, c.patch); });
  const str = JSON.stringify(d);
  const rows = chunk(str);
  const metaNow = ((await api('values/' + encodeURIComponent('_meta!A1:A5'))).values || []).map(r => r[0]);
  if (String(metaNow[0]) !== String(before.meta[0])) { console.log('⚠️ 그 사이 저장됨(rev', before.meta[0], '→', metaNow[0], ') — 중단. 다시 실행하세요.'); process.exit(2); }
  await api('values/' + encodeURIComponent('_appdata!A:A') + ':clear', { method: 'POST', body: '{}' });
  await api('values/' + encodeURIComponent(`_appdata!A1:A${rows.length}`) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: rows }) });
  const newMeta = [[Number(before.meta[0]) + 1], [total(d)], [new Date().toISOString()], [before.meta[3] ?? -1], [JSON.stringify(counts(d))]];
  await api('values/' + encodeURIComponent('_meta!A1:A5') + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: newMeta }) });

  // 검증 — 되읽어서 파싱, 바뀐 건 계획한 필드뿐인지
  const after = await readAll();
  const A = JSON.parse(before.raw), B = after.data;
  let diffs = 0, bad = [];
  A.brands.forEach((ba, bi) => KEYS.forEach(k => (ba[k] || []).forEach((r, i) => {
    const r2 = B.brands[bi][k][i];
    if (JSON.stringify(r) === JSON.stringify(r2)) return;
    diffs++;
    const c = ch.find(x => x.arr === k && x.r.id === r.id);
    const exp = c ? JSON.stringify({ ...r, ...c.patch }) : null;
    if (!c || exp !== JSON.stringify(r2)) bad.push(`${ba.id}.${k}[${i}] ${r.name}`);
  })));
  const sameOther = JSON.stringify({ ...A, brands: null }) === JSON.stringify({ ...B, brands: null });
  console.log(`\n반영 완료 rev ${before.meta[0]} → ${after.meta[0]} | 바뀐 행 ${diffs}/${ch.length} | 계획 밖 변경 ${bad.length} | 정산·담당목록 동일 ${sameOther} | 행수 동일 ${total(A) === total(B)}`);
  if (bad.length) console.log('계획 밖:', bad);
})().catch(e => { console.error('실패:', e.message); process.exit(1); });
