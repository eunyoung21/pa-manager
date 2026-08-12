/* 개인정보 자동폐기 검증 — Code.gs 를 그대로 읽어 구글 전역만 가짜로 끼워 실행한다.
   규칙(2026-08-12): 정산완료 30일 뒤, 폐기하는 것은 신분증사본·통장사본·주민등록번호.
   이름·연락처·주소·계좌·계약서는 회계 증빙으로 남긴다.
   실행: node test/privacy-purge.test.mjs */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const CODE = fs.readFileSync(path.join(REPO, 'apps-script', 'Code.gs'), 'utf8');

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

const vmMod = await import('node:vm');

/* Code.gs 를 통째로 실행하고 purgeExpiredPrivacy 만 꺼내 돌린다.
   pfileNames = 그 시점에 Drive 에 실제로 있는 pfile 이름(=id) 목록. */
function run(data, { pfileNames = [] } = {}) {
  const trashed = [];
  const sandbox = {
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    SpreadsheetApp: {}, Utilities: {}, LockService: {}, GmailApp: {}, Session: {}, ScriptApp: {},
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
    DriveApp: {},
  };
  // pfileFolder() 가 쓰는 폴더 — 이름으로 파일을 찾아 휴지통으로 보낸다
  sandbox.DriveApp = {
    getFoldersByName: () => ({
      hasNext: () => true,
      next: () => ({
        getFilesByName: (nm) => {
          const has = pfileNames.includes(nm);
          let done = !has;
          return { hasNext: () => !done, next: () => { done = true; trashed.push(nm); return { setTrashed() {} }; } };
        },
      }),
    }),
  };
  const ctx = vmMod.createContext(sandbox);
  new vmMod.Script(CODE + '\n;globalThis.__purge = purgeExpiredPrivacy;').runInContext(ctx);
  const changed = ctx.__purge(data);
  return { changed, trashed };
}

const old = new Date(Date.now() - 40 * 86400000);
const OLD_DATE = String(old.getFullYear()).slice(2) + '.'
  + String(old.getMonth() + 1).padStart(2, '0') + '.' + String(old.getDate()).padStart(2, '0');
const recent = new Date(Date.now() - 5 * 86400000);
const NEW_DATE = String(recent.getFullYear()).slice(2) + '.'
  + String(recent.getMonth() + 1).padStart(2, '0') + '.' + String(recent.getDate()).padStart(2, '0');

const person = () => ({
  channelName: '@granny_kim', realName: '김하늘', phone: '010-1234-5678',
  address: '서울시 강남구', rrn: '900101-2345678',
  bankName: '국민', bankHolder: '김하늘', bankAccount: '123-456-789',
  idFile: { url: '/api/pfile?id=700101', name: '신분증.jpg' },
  bankFile: { url: '/api/pfile?id=700102', name: '통장.jpg' },
  contractFile: { url: '/api/pfile?id=700103', name: '계약서.docx' },
});
const data = (settledDate) => ({
  brands: [{
    id: 'granny',
    step2Rows: [{ name: '@granny_kim', phone: '010-1234-5678', infSettled: 'Y', infSettledDate: settledDate }],
    privacyRows: [person()],
  }],
});

console.log('\n정산완료 30일 경과 — 신분증·통장·주민번호만 폐기');
{
  const d = data(OLD_DATE);
  const { changed, trashed } = run(d, { pfileNames: ['700101', '700102', '700103'] });
  const p = d.brands[0].privacyRows[0], s2 = d.brands[0].step2Rows[0];
  chk(changed === true, '변경됨으로 보고한다');
  chk(d.brands[0].privacyRows.length === 1, '개인정보 행이 사라지지 않는다');
  chk(!p.idFile, '신분증사본 떼어냄');
  chk(!p.bankFile, '통장사본 떼어냄');
  chk(trashed.includes('700101') && trashed.includes('700102'), '실제 파일도 휴지통으로');
  chk(!trashed.includes('700103'), '계약서 파일은 지우지 않는다');
  chk(!!p.contractFile, '계약서 첨부는 그대로 남는다');
  chk(p.realName === '김하늘', '실명 남음');
  chk(p.address === '서울시 강남구', '주소 남음');
  chk(p.bankAccount === '123-456-789', '계좌번호 남음');
  chk(p.rrn === '', '주민등록번호는 비운다 (보관 근거 없음)');
  chk(s2.phone === '010-1234-5678', '컨택현황 연락처도 남음');
  chk(s2.privacyPurged === true && !!s2.privacyPurgedDate, '폐기 표시·날짜 기록');
}

console.log('\n두 번 돌려도 안전 (이미 폐기된 건)');
{
  const d = data(OLD_DATE);
  run(d, { pfileNames: ['700101', '700102'] });
  const { trashed } = run(d, { pfileNames: ['700101', '700102'] });
  chk(trashed.length === 0, '두 번째엔 지울 것이 없다');
  chk(d.brands[0].privacyRows.length === 1, '행은 여전히 남아 있다');
}

console.log('\n아직 30일이 안 됐으면 아무것도 안 한다');
{
  const d = data(NEW_DATE);
  const { changed, trashed } = run(d, { pfileNames: ['700101', '700102'] });
  const p = d.brands[0].privacyRows[0];
  chk(changed === false, '변경 없음');
  chk(!!p.idFile && !!p.bankFile, '신분증·통장 그대로');
  chk(p.rrn === '900101-2345678', '주민등록번호도 그대로');
  chk(trashed.length === 0, '파일도 그대로');
}

console.log(fail ? `\n실패 ${fail}건\n` : '\n전부 통과\n');
process.exit(fail ? 1 : 0);
