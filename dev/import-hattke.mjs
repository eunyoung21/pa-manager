/* 해트케 프로그램(jjunseobc.github.io/hattke-pa)에서 받은 원본(_local/hattke/hattke-export.json)을
   PA 매니저의 '해트케' 브랜드로 변환한다. 해트케 쪽은 건드리지 않는다(읽기만 했음).
   사용: node dev/import-hattke.mjs            → _local/hattke/brand-hattke.json 생성
   단계 매핑(해트케 → PA): 0 리스팅=dmSent N / 2 DM발송 / 4 계약서발송·수집=성사 / 6 제품발송=계약서 완료 /
   5 광고코드=출고 완료 / 7 광고세팅·입금=최종완료 / 8 완료=최종완료+인플루언서 입금 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const SRC = path.join(ROOT, '_local/hattke/hattke-export.json');
const OUT = path.join(ROOT, '_local/hattke/brand-hattke.json');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const rows = raw.getAll.data;
const settle = raw.getSettlements.data || {};
const cfg = raw.getConfig.data || {};

// 2026-06-05T00:00:00.000Z → 26.06.05 (PA 매니저 날짜 형식)
const d2 = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : '';
};
const num = (v) => (v == null || v === '' ? '' : Number(String(v).replace(/[^0-9]/g, '')) || '');
const phone = (v) => {
  const t = String(v || '').trim();
  if (!t) return '';
  const digits = t.replace(/[^0-9]/g, '');
  if (/^1\d{9}$/.test(digits)) return '0' + digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6); // 1040146390 → 010-4014-6390
  if (/^010\d{8}$/.test(digits)) return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  return t;
};
const id = (r, p) => `ht${p}${r.id}`;
const file = (url, name) => (String(url || '').trim() ? { url: String(url).trim(), name, type: 'link' } : '');

const PA = '안민영';   // 해트케 건의 담당자 — 완료 수당(2만)이 이 사람에게 잡힌다
const step2Rows = [], shippingRows = [], reviewRows = [], privacyRows = [];
for (const r of rows) {
  if (r.status === 'deleted') continue;
  const stage = Number(r.stage) || 0;
  const done = r.status === 'done';
  const rejected = r.status === 'rejected';
  const name = String(r.name || r.nickname || r.instagram_id || '').trim();
  const row = {
    id: id(r, 's'),
    importedFrom: 'hattke',              // 가져온 기록 표시(거절 자동삭제 제외 · 출처 추적)
    date: d2(r.recruited_date),
    name,
    username: String(r.instagram_id || '').trim(),
    link: r.instagram_id ? `https://www.instagram.com/${r.instagram_id}/` : '',
    followers: r.followers ? Number(r.followers).toLocaleString() : '',
    pa: PA,                               // 해트케 담당자(2026-09-30 사용자 지정)
    product: String(r.product || '').trim(),
    contactStatus: rejected ? '거절' : stage >= 4 ? '계약서 작성' : stage >= 2 ? '컨택 완료' : '컨택 전',
    dmSent: stage >= 2 || r.dm_sent === 'Y' ? 'Y' : 'N',
    dmDate: d2(r.dm_sent_date),
    dealDone: stage >= 4 || r.sponsorship_done === 'Y' ? 'Y' : 'N',
    dealDate: stage >= 4 ? d2(r.contract_sent_date) || d2(r.dm_sent_date) : '',
    contractDone: stage >= 6 || done ? '✅ 완료' : '미완료',
    contractDate: d2(r.contract_sent_date),
    productOnly: r.product_only === 'Y' ? 'Y' : '',
    shippingDone: stage === 5 || stage === 7 || done ? '✅ 완료' : '미완료',
    shipDate: d2(r.product_sent_date),
    finalDone: stage === 7 || done ? 'Y' : 'N',
    finalDate: stage === 7 || done ? d2(r.ad_setup_date) || d2(r.payment_date) : '',
    rate: '',
    expectedPost: '',
    contractUrl: String(r.contract_file || '').trim(),
    realName: String(r.influencer_name || '').trim(),
    phone: phone(r.phone),
    address: String(r.address || '').trim(),
    memo: [r.memo, r.special_note].map((x) => String(x || '').trim()).filter(Boolean).join(' / '),
  };
  if (rejected) row.rejectDate = d2(r.dm_sent_date) || d2(r.recruited_date);
  if (done) { row.infSettled = 'Y'; row.infSettledDate = d2(r.payment_date); }
  step2Rows.push(row);

  if (r.product_sent_date) shippingRows.push({
    id: id(r, 'p'), importedFrom: 'hattke', requestDate: d2(r.product_sent_date), requester: PA,
    channelName: name, recipient: String(r.influencer_name || '').trim(), phone: phone(r.phone),
    address: String(r.address || '').trim(), product: String(r.product || '').trim(), notes: '', tracking: '',
    qty: '1', status: '✅ 완료', shipDate: d2(r.product_sent_date), reason: '협찬',
  });

  if (r.ad_code) reviewRows.push({
    id: id(r, 'v'), importedFrom: 'hattke', date: d2(r.ad_setup_date) || d2(r.product_sent_date) || d2(r.recruited_date),
    channelName: name, realName: String(r.influencer_name || '').trim(), pa: PA, paCode: String(r.ad_code).trim(),
    postLink: '', live: stage === 7 || done ? 'Y' : '', liveDate: d2(r.ad_setup_date),
    contractDone: stage >= 6 || done ? 'Y' : '', status: done ? '검수완료' : '검수중', memo: '',
  });

  const pv = { id: id(r, 'i'), channelName: name, realName: String(r.influencer_name || '').trim(), phone: phone(r.phone),
    address: String(r.address || '').trim(), bankName: String(r.bank_name || '').trim(),
    bankAccount: String(r.account_number || '').trim(), bankHolder: '', rrn: '',
    idFile: file(r.id_file, `${name}_신분증(해트케 드라이브)`), bankFile: file(r.bankbook_file, `${name}_통장사본(해트케 드라이브)`),
    notes: '해트케 프로그램에서 가져옴', importedFrom: 'hattke' };
  if (pv.realName || pv.phone || pv.address || pv.bankAccount || pv.idFile || pv.bankFile) privacyRows.push(pv);
}

const products = [...new Set(rows.map((r) => String(r.product || '').trim()).filter(Boolean))];
const brand = {
  id: 'hattke', name: '해트케', products,
  rates: { dm: Number(cfg.rate_dm ?? 0) || 0, deal: Number(cfg.rate_sp ?? 20000) || 0 },  // 해트케 단가(DM 0 · 성사 2만)
  importedFrom: 'hattke', importedAt: new Date().toISOString(),
  step1Rows: [], step2Rows, claudeStep1Rows: [], claudeStep2Rows: [], shippingRows, reviewRows, privacyRows,
};
// 해트케에서 지급한 정산 기록 — 담당자 구분이 없어 '해트케'라는 이름으로 그대로 보존
const settlements = {};
for (const [ym, v] of Object.entries(settle)) settlements[ym] = { [PA]: { paid: Number(v.amount) || 0, paidDate: String(v.date || ''), note: '해트케 프로그램에서 가져온 지급 기록' } };

fs.writeFileSync(OUT, JSON.stringify({ brand, settlements }, null, 1), 'utf8');
const n = (a) => a.length;
console.log('제품', products.join(' / '));
console.log('인플루언서', n(step2Rows), '· 출고', n(shippingRows), '· 영상검수', n(reviewRows), '· 개인정보', n(privacyRows));
const st = {}; step2Rows.forEach((r) => { const k = r.contactStatus + (r.infSettled === 'Y' ? '·입금' : r.finalDone === 'Y' ? '·완료' : ''); st[k] = (st[k] || 0) + 1; });
console.log(st);
console.log('정산 기록', JSON.stringify(settlements));
console.log('→', OUT);
