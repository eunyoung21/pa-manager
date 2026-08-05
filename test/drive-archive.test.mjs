/* Apps Script 백엔드의 서류 자동보관(contractArchive) 검증
   개인정보로 올라온 계약서·신분증·통장이 브랜드 드라이브의 올바른 폴더로,
   중복 없이 한 번만 복사되는지 확인한다. DriveApp 만 가짜로 끼워 Code.gs 를 그대로 실행.
   실행: node test/drive-archive.test.mjs */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const CODE = fs.readFileSync(path.join(REPO, 'apps-script', 'Code.gs'), 'utf8');

let fail = 0;
const chk = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) fail++; };

/* ── 가짜 드라이브 ── */
function makeDrive() {
  const byId = {};
  function folder(id, name) {
    const files = [];
    const subs = [];
    const f = {
      id, name, files, subs,
      getName: () => name,
      getFiles: () => iter(files.slice()),
      getFilesByName: (n) => iter(files.filter(x => x.name === n)),
      getFoldersByName: (n) => iter(subs.filter(x => x.name === n)),
      createFolder: (n) => { const s = folder('sub-' + n + '-' + id, n); subs.push(s); byId[s.id] = s; return s; },
      createFile: (blob) => { const nf = file(blob.name, blob.bytes, f); files.push(nf); return nf; },
    };
    byId[id] = f;
    return f;
  }
  function file(name, bytes, parent) {
    const o = {
      name, bytes, description: '', parent,
      getName: () => o.name,
      getUrl: () => 'https://drive/' + encodeURIComponent(o.name),
      getDescription: () => o.description,
      setDescription: (d) => { o.description = d; },
      makeCopy: (newName, dest) => { const c = file(newName, bytes, dest); dest.files.push(c); return c; },
      setTrashed: () => {},
    };
    return o;
  }
  function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }

  const roots = {};
  const DriveApp = {
    getFolderById: (id) => { if (!byId[id]) throw new Error('no folder ' + id); return byId[id]; },
    getFoldersByName: (n) => iter(Object.values(roots).filter(f => f.name === n)),
    createFolder: (n) => { const f = folder('root-' + n, n); roots[n] = f; return f; },
  };
  return { DriveApp, folder, file, byId, roots };
}

function makeEnv(archiveCfg) {
  const d = makeDrive();
  d.folder('1naWNt2xs9biAipjDZWEWVVU1nrOC8sXv', '베이스튠(구)');   // 구버전 폴백용 브랜드 폴더
  d.folder('1ubvCkIzuspkDtTvbDBvMFF5tV6jsxJp_', '그래니(구)');
  // 브랜드 드라이브: 베이스튠 > PA 협업 > 개인정보파일 / 계약서파일
  const brandRoot = d.folder('BRAND_BT', '베이스튠');
  const pa = brandRoot.createFolder('PA 협업');
  const priv = pa.createFolder('개인정보파일');
  const cont = pa.createFolder('계약서파일');
  // pfile 저장소 + 이미 올라온 첨부 3개
  const pf = d.folder('PFILES', 'PA-Manager-pfiles');
  d.roots['PA-Manager-pfiles'] = pf;
  pf.files.push(d.file('9001', Buffer.from('bank-img'), pf));
  pf.files.push(d.file('9002', Buffer.from('id-img'), pf));
  pf.files.push(d.file('9003', Buffer.from('contract-pdf'), pf));

  const env = {
    DriveApp: d.DriveApp,
    Utilities: {
      base64Decode: (b) => Buffer.from(b, 'base64'),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      getUuid: () => 'uuid', computeDigest: () => [],
      Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'x', setProperty: () => {} }) },
    SpreadsheetApp: { openById: () => null, getActiveSpreadsheet: () => null },
    GmailApp: {}, MailApp: {}, Session: {}, LockService: {},
    ContentService: { createTextOutput: () => ({ setMimeType: () => {} }), MimeType: {} },
    Logger: { log: () => {} }, console,
  };
  const names = Object.keys(env);
  const factory = new Function(...names, CODE + `
    ;json = function(o){ return o; };
    BRAND_ARCHIVE_FOLDER = ${JSON.stringify(archiveCfg)};
    return { contractArchive: contractArchive, archivePending: archivePending, archiveComplete: archiveComplete, parseArchiveName: parseArchiveName };
  `);
  return { api: factory(...names.map(n => env[n])), priv, cont, pa, brandRoot, drive: d };
}

const CFG_OK = { basetune: { privacy: 'sub-개인정보파일-sub-PA 협업-BRAND_BT', contract: 'sub-계약서파일-sub-PA 협업-BRAND_BT' } };
const SESS = { username: '테스터', role: 'manager' };
const who = { brand: 'basetune', channelName: 'cooking_j', realName: '김하늘' };
const stamp = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()); })();

console.log('1) 통장·신분증 → 개인정보파일 / 계약서 → 계약서파일');
{
  const { api, priv, cont } = makeEnv(CFG_OK);
  const b = api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  const i = api.contractArchive(SESS, { ...who, kind: 'id', pfileUrl: '/api/pfile?id=9002', name: '신분증.jpg' });
  const c = api.contractArchive(SESS, { ...who, kind: 'contract', pfileUrl: '/api/pfile?id=9003', name: '계약서.pdf' });
  chk(b.ok && i.ok && c.ok, '3건 모두 보관 성공');
  chk(priv.files.length === 2, '개인정보파일 폴더에 2개(통장·신분증)');
  chk(cont.files.length === 1, '계약서파일 폴더에 1개(계약서)');
  chk(priv.files[0].name === '통장사본_cooking_j_김하늘.jpg', '통장 파일명: 통장사본_채널명_본명 → ' + priv.files[0].name);
  chk(priv.files[1].name === '신분증사본_cooking_j_김하늘.jpg', '신분증 파일명: 신분증사본_채널명_본명 → ' + priv.files[1].name);
  chk(cont.files[0].name === 'cooking_j_김하늘_' + stamp + '.pdf', '계약서 파일명: 채널명_본명_계약날짜 → ' + cont.files[0].name);
  chk(priv.files[0].bytes.toString() === 'bank-img', '내용은 pfile 원본 그대로 복사');
  chk(priv.files[0].description === 'pfile:9001', '출처(pfile id)를 파일 설명에 기록');
}

console.log('2) 같은 파일을 다시 올려도 한 번만 (중복 방지)');
{
  const { api, priv } = makeEnv(CFG_OK);
  api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  const again = api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  chk(again.ok === true && again.dup === true, '두 번째 호출은 dup 로 응답');
  chk(priv.files.length === 1, '드라이브 파일은 그대로 1개');
}

console.log('3) 다른 파일로 교체해 올리면 덮어쓰지 않고 새로 남긴다');
{
  const { api, priv } = makeEnv(CFG_OK);
  api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  const r2 = api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9002', name: '통장수정.jpg' });
  chk(r2.ok && !r2.dup, '새 파일은 새로 보관');
  chk(priv.files.length === 2, '2개 보관(기존 건 유지)');
  chk(priv.files[1].name === '통장사본_cooking_j_김하늘_2.jpg', '이름 충돌 없이 번호 부여 → ' + priv.files[1].name);
}

console.log('4) pfile 을 못 찾으면 base64 원본으로 저장(조용한 실패 없음)');
{
  const { api, cont } = makeEnv(CFG_OK);
  const r = api.contractArchive(SESS, { ...who, kind: 'contract', pfileUrl: '/api/pfile?id=7777',
    data: 'data:application/pdf;base64,' + Buffer.from('raw-pdf').toString('base64'), name: '계약서.pdf' });
  chk(r.ok === true, '2순위 경로로 저장 성공');
  chk(cont.files.length === 1 && cont.files[0].bytes.toString() === 'raw-pdf', '본문 base64 를 그대로 저장');
}

console.log('5) 폴더 미지정·잘못된 입력 방어');
{
  const { api, priv, drive } = makeEnv({ basetune: { privacy: '', contract: '' } });
  const brandRoot = drive.byId['1naWNt2xs9biAipjDZWEWVVU1nrOC8sXv'];
  const byIdHas = (root, sub) => root.subs.some(s => s.name === sub && s.files.length === 1);
  const r = api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  chk(/미지정/.test(r.error || ''), '개인정보 폴더 ID 없으면 엉뚱한 곳에 만들지 않고 오류');
  chk(priv.files.length === 0, '파일이 새지 않음');
  const c = api.contractArchive(SESS, { ...who, kind: 'contract', pfileUrl: '/api/pfile?id=9003', name: '계약서.pdf' });
  chk(c.ok === true, '계약서는 구버전 폴백(브랜드 폴더 > 계약서)으로 계속 동작 — 기존 기능 무회귀');
  chk(byIdHas(brandRoot, '계약서'), '폴백 폴더에 저장됨');
  const bad = api.contractArchive(SESS, { ...who, kind: '없는종류', pfileUrl: '/api/pfile?id=9001' });
  chk(!!bad.error, '알 수 없는 kind 거부');
  const nb = api.contractArchive(SESS, { ...who, brand: '없는브랜드', kind: 'bank', pfileUrl: '/api/pfile?id=9001' });
  chk(!!nb.error, '알 수 없는 브랜드 거부');
}

console.log('6) 이름 없는 사람 / 금지문자');
{
  const { api, priv } = makeEnv(CFG_OK);
  api.contractArchive(SESS, { brand: 'basetune', channelName: 'a/b:c*', realName: '', kind: 'id', pfileUrl: '/api/pfile?id=9002', name: '신분증.png' });
  chk(!/[\\/:*?"<>|]/.test(priv.files[0].name), '파일명 금지문자 제거 → ' + priv.files[0].name);
  const { api: api2, priv: priv2 } = makeEnv(CFG_OK);
  api2.contractArchive(SESS, { brand: 'basetune', kind: 'id', pfileUrl: '/api/pfile?id=9002', name: '신분증.png' });
  chk(priv2.files[0].name === '신분증사본_미상.png', '채널·성명 없으면 미상 → ' + priv2.files[0].name);
}

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 서류 자동보관 전부 통과'));
process.exit(fail ? 1 : 0);
