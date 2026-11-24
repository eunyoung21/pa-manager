/* 서명 완료 → 계약 완료 자동 표시 검증 — Code.gs 를 그대로 실행하고 구글 전역·데이터 읽기/쓰기만 가짜로 끼운다.
   규칙(2026-11-24): 모두싸인 발송기가 서명 완료본을 올리면(contractArchive, signed:true) 그 사람 행의 계약 완료를 서버가 직접 표시.
   실행: node test/contract-mark-done.test.mjs */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const CODE = fs.readFileSync(path.join(REPO, 'apps-script', 'Code.gs'), 'utf8');
let fail = 0;
const chk = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };

function run(data, args) {
  const sandbox = {
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    SpreadsheetApp: {}, GmailApp: {}, Session: {}, ScriptApp: {}, DriveApp: {},
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, pat) => { const k = new Date(d.getTime() + 9 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return pat === 'yy.MM.dd' ? String(k.getUTCFullYear()).slice(2) + '.' + p(k.getUTCMonth() + 1) + '.' + p(k.getUTCDate()) : ''; } },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
  };
  const ctx = vm.createContext(sandbox);
  new vm.Script(CODE + '\n;var __w=0; readData=function(){return __data}; writeData=function(o){__w++; __data=o; return 77;};').runInContext(ctx);
  ctx.__data = JSON.parse(JSON.stringify(data));
  const res = ctx.markContractDone_(...args);
  return { res, data: ctx.__data, writes: ctx.__w };
}
const row = (x) => ({ id: 'r' + Math.random(), name: 'chan', realName: '', product: '', contractDone: '미완료', contractDate: '', contractUrl: '', stage: 'contract', ...x });
const mk = (rows, claude = []) => ({ brands: [{ id: 'hatke', name: '해트케', step2Rows: rows, claudeStep2Rows: claude }] });
const SIGNED = '2026-11-23T05:00:00.000Z';

console.log('채널명이 한 명과 맞으면');
{
  const { res, data, writes } = run(mk([row({ name: 'sowoo.log' }), row({ name: 'other' })]), ['hatke', 'sowoo.log', '이새하', '해트케 압력이불', 'https://drive/x', SIGNED]);
  const r = data.brands[0].step2Rows[0];
  chk(res.ok && res.marked && writes === 1, '표시하고 한 번 저장', res);
  chk(r.contractDone === '✅ 완료' && r.contractDate === '26.11.23' && r.contractUrl === 'https://drive/x' && r.stage === 'adcode', '계약 완료·서명일·링크·단계(광고코드)', r);
  chk(data.brands[0].step2Rows[1].contractDone === '미완료', '다른 사람은 그대로');
}
console.log('자동화 탭에 있는 사람도');
{
  const { res, data } = run(mk([], [row({ name: 'auto_ch' })]), ['hatke', 'auto_ch', '', '', '', SIGNED]);
  chk(res.marked && data.brands[0].claudeStep2Rows[0].contractDone === '✅ 완료', '자동리스트업 탭 행도 표시', res);
}
console.log('채널명 표기가 달라도(대소문자·공백) 찾음');
{
  const { res } = run(mk([row({ name: 'Sowoo Log' })]), ['hatke', 'sowoo.log'.replace('.', ' '), '', '', '', SIGNED]);
  chk(res.marked, '대소문자·공백 무시', res);
}
console.log('여러 명이면 본명 → 제품으로 좁힘');
{
  const rows = [row({ name: 'same', realName: '가나다', product: 'A' }), row({ name: 'same', realName: '라마바', product: 'A' })];
  const { res, data } = run(mk(rows), ['hatke', 'same', '라마바', 'A', '', SIGNED]);
  chk(res.marked && data.brands[0].step2Rows[1].contractDone === '✅ 완료' && data.brands[0].step2Rows[0].contractDone === '미완료', '본명으로 좁혀 한 명만', res);
  const rows2 = [row({ name: 'same', product: 'A' }), row({ name: 'same', product: 'B' })];
  const r2 = run(mk(rows2), ['hatke', 'same', '', 'B', '', SIGNED]);
  chk(r2.res.marked && r2.data.brands[0].step2Rows[1].contractDone === '✅ 완료' && r2.data.brands[0].step2Rows[0].contractDone === '미완료', '제품으로 좁혀 한 명만', r2.res);
}
console.log('한 명으로 못 좁히면 건드리지 않음');
{
  const { res, writes } = run(mk([row({ name: 'dup' }), row({ name: 'dup' })]), ['hatke', 'dup', '', '', '', SIGNED]);
  chk(!res.ok && res.reason === 'ambiguous' && writes === 0, '모호 → 저장 안 함', res);
  const n = run(mk([row({ name: 'x' })]), ['hatke', 'zzz', '', '', '', SIGNED]);
  chk(!n.res.ok && n.res.reason === 'nomatch' && n.writes === 0, '없는 사람 → 저장 안 함', n.res);
  const b = run(mk([row({ name: 'x' })]), ['nobrand', 'x', '', '', '', SIGNED]);
  chk(!b.res.ok && b.res.reason === 'brand' && b.writes === 0, '없는 브랜드 → 저장 안 함', b.res);
}
console.log('이미 계약 완료면 다시 저장하지 않음 / 단계는 앞으로만');
{
  const done = row({ name: 'd', contractDone: '✅ 완료', contractDate: '26.11.01', contractUrl: 'https://old', stage: 'adset' });
  const { res, data, writes } = run(mk([done]), ['hatke', 'd', '', '', 'https://new', SIGNED]);
  chk(res.ok && res.already && writes === 0 && data.brands[0].step2Rows[0].contractUrl === 'https://old' && data.brands[0].step2Rows[0].stage === 'adset', '이미 완료 → 그대로(날짜·링크·단계 안 덮음)', res);
  const e = run(mk([row({ name: 'e', stage: 'adset' })]), ['hatke', 'e', '', '', '', SIGNED]);
  chk(e.data.brands[0].step2Rows[0].stage === 'adset' && e.data.brands[0].step2Rows[0].contractDone === '✅ 완료', '이미 뒤 단계(광고세팅)면 단계는 안 되돌림', e.data.brands[0].step2Rows[0]);
  const f = run(mk([row({ name: 'f', contractDone: '✅ 완료', contractDate: '', contractUrl: '', stage: 'adcode' })]), ['hatke', 'f', '', '', 'https://u', SIGNED]);
  chk(f.res.marked && f.data.brands[0].step2Rows[0].contractUrl === 'https://u' && f.data.brands[0].step2Rows[0].contractDate === '26.11.23', '완료인데 날짜·링크가 비면 채움', f.res);
}
console.log('contractArchive 는 서명 완료본(signed:true)일 때만 표시');
{
  const n = (CODE.match(/body\.signed \? markContractDone_/g) || []).length;
  chk(n === 2, '새로 저장한 경우·이미 있던 경우 모두 signed 일 때만(사람이 직접 올린 계약서 파일은 표시 안 함)', n);
}
console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
