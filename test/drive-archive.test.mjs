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
  let fileSeq = 0;
  const allFiles = [];
  function file(name, bytes, parent) {
    const o = {
      name, bytes, description: '', parent, id: 'f' + (++fileSeq),
      getName: () => o.name,
      getId: () => o.id,
      getParents: () => iter(o.parent ? [o.parent] : []),
      moveTo: (dest) => { if (o.parent) { const i = o.parent.files.indexOf(o); if (i >= 0) o.parent.files.splice(i, 1); } dest.files.push(o); o.parent = dest; },
      getUrl: () => 'https://drive/' + encodeURIComponent(o.name),
      getDescription: () => o.description,
      setDescription: (d) => { o.description = d; },
      makeCopy: (newName, dest) => { const c = file(newName, bytes, dest); dest.files.push(c); return c; },
      getUrlSafe: () => o.getUrl(),
      setTrashed: () => {},
    };
    allFiles.push(o);
    return o;
  }
  function iter(arr) { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; }

  const roots = {};
  const DriveApp = {
    getFolderById: (id) => { if (!byId[id]) throw new Error('no folder ' + id); return byId[id]; },
    getFileById: (id) => { const f = allFiles.find(x => x.id === id); if (!f) throw new Error('no file ' + id); return f; },
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
    logAction = function(){};
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
  const c = api.contractArchive(SESS, { ...who, kind: 'contract', pfileUrl: '/api/pfile?id=9003', name: 'cooking_j_김하늘_260729.pdf' });
  chk(b.ok && i.ok && c.ok, '3건 모두 보관 성공');
  chk(priv.files.length === 2, '개인정보파일 폴더에 2개(통장·신분증)');
  chk(cont.files.length === 1, '계약서파일 폴더에 1개(계약서)');
  chk(priv.files[0].name === '통장.jpg', '올린 파일명 그대로 → ' + priv.files[0].name);
  chk(priv.files[1].name === '신분증.jpg', '올린 파일명 그대로 → ' + priv.files[1].name);
  chk(cont.files[0].name === '드래프터_광고모델_김하늘_2026년07월29일.pdf', '계약서는 표준형으로 이름 통일 → ' + cont.files[0].name);
  chk(priv.files[0].bytes.toString() === 'bank-img', '내용은 pfile 원본 그대로 복사');
  const memo = JSON.parse(priv.files[0].description);
  chk(memo.s === 'pfile:9001', '출처(pfile id)를 설명 메모에 기록');
  chk(memo.k === 'bank' && memo.c === 'cooking_j' && memo.r === '김하늘', '종류·채널명·본명을 설명 메모에 기록');
  chk(JSON.parse(cont.files[0].description).d === '260729', '계약날짜는 파일명 끝 6자리에서 → ' + JSON.parse(cont.files[0].description).d);
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
  chk(priv.files[1].name === '통장수정.jpg', '다른 이름이면 그대로 → ' + priv.files[1].name);
  const { api: a3, priv: p3 } = makeEnv(CFG_OK);
  a3.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: '통장.jpg' });
  a3.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9002', name: '통장.jpg' });
  chk(p3.files.length === 2 && p3.files[1].name === '통장_2.jpg', '같은 이름이면 덮어쓰지 않고 번호 → ' + p3.files[1].name);
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
  api.contractArchive(SESS, { brand: 'basetune', channelName: 'a/b:c*', realName: '', kind: 'id', pfileUrl: '/api/pfile?id=9002', name: '신분/증:*.png' });
  chk(!/[\\/:*?"<>|]/.test(priv.files[0].name), '파일명 금지문자 제거 → ' + priv.files[0].name);
  const { api: api2, priv: priv2 } = makeEnv(CFG_OK);
  api2.contractArchive(SESS, { brand: 'basetune', kind: 'id', pfileUrl: '/api/pfile?id=9002', name: '신분증.png' });
  chk(priv2.files[0].name === '신분증.png', '채널·성명 없어도 올린 이름 그대로 → ' + priv2.files[0].name);
}

console.log('7) 노션 기입 목록 — 파일명이 제각각이어도 설명 메모로 읽는다');
{
  const { api } = makeEnv(CFG_OK);
  api.contractArchive(SESS, { ...who, kind: 'contract', pfileUrl: '/api/pfile?id=9003', name: '아무렇게나 지은 이름_260729.pdf' });
  api.contractArchive(SESS, { ...who, kind: 'id', pfileUrl: '/api/pfile?id=9002', name: 'IMG_4821.jpg' });
  api.contractArchive(SESS, { ...who, kind: 'bank', pfileUrl: '/api/pfile?id=9001', name: 'KakaoTalk_2026.jpg' });
  const { items } = api.archivePending(SESS, {});
  chk(items.length === 1, '계약서 1장 = 정산 1건 → ' + items.length);
  const it = items[0] || {};
  chk(it.channelName === 'cooking_j' && it.realName === '김하늘', '채널명·본명을 설명에서 복원');
  chk(it.date === '260729', '계약날짜도 복원 → ' + it.date);
  chk(!!it.idFile && !!it.bankFile, '이름이 제각각인 신분증·통장도 같은 사람으로 묶임');

  const mv = api.archiveComplete(SESS, { fileIds: [it.contractFile.id, it.idFile.id, it.bankFile.id] });
  chk(mv.ok && mv.moved === 3, '완료 폴더로 3개 이동');
  chk(api.archivePending(SESS, {}).items.length === 0, '이동 후에는 목록에서 빠짐(중복 기입 방지)');
  chk(api.archiveComplete(SESS, { fileIds: [it.contractFile.id] }).moved === 1, '이미 완료된 건 다시 옮겨도 안전');
}

console.log('8) 손으로 넣은 파일(설명 없음)은 이름 규칙으로 읽는다');
{
  const { api, drive } = makeEnv(CFG_OK);
  const cont = drive.byId[CFG_OK.basetune.contract], priv = drive.byId[CFG_OK.basetune.privacy];
  cont.files.push(drive.file('캐디_갱_서원경_계약서_260729.pdf', Buffer.from('x'), cont));
  priv.files.push(drive.file('신분증사본_캐디_갱_서원경.jpg', Buffer.from('y'), priv));
  priv.files.push(drive.file('통장사본_캐디_갱_서원경.jpg', Buffer.from('z'), priv));
  const { items } = api.archivePending(SESS, {});
  chk(items.length === 1, '손으로 넣은 계약서도 잡힌다');
  chk((items[0] || {}).realName === '서원경' && (items[0] || {}).date === '260729',
    '이름에서 본명·계약날짜 파싱 → ' + (items[0] || {}).realName + '/' + (items[0] || {}).date);
  chk(!!(items[0] || {}).idFile && !!(items[0] || {}).bankFile, '같은 사람의 신분증·통장 연결');
}

console.log('9) 채널명이 어긋나도 본명으로 서류를 이어붙인다 (실제로 정산이 막혔던 경우)');
{
  const { api, drive } = makeEnv(CFG_OK);
  const cont = drive.byId[CFG_OK.basetune.contract], priv = drive.byId[CFG_OK.basetune.privacy];
  const withMemo = (folder, name, memo) => {
    const f = drive.file(name, Buffer.from('x'), folder);
    f.description = JSON.stringify(memo); folder.files.push(f); return f;
  };
  // ① 메일 회수본이라 계약서에 채널명이 없다 + 신분증은 앱에서 올려 채널명이 있다 → 본명으로 이어야 한다
  withMemo(cont, '드래프터_광고모델_정시연_2026년08월12일.docx', { s: '', b: 'basetune', k: 'contract', c: '', r: '정시연', d: '260812' });
  withMemo(priv, '신분증.jpg', { s: 'pfile:1', b: 'basetune', k: 'id',   c: '시연', r: '정시연', d: '260812' });
  withMemo(priv, '통장.jpg',   { s: 'pfile:2', b: 'basetune', k: 'bank', c: '시 연', r: '정 시연', d: '260812' });
  // ② 통장을 성명 적기 전에 올려 본명이 비어 있다 → 채널명으로 이어야 한다
  withMemo(cont, '드래프터_광고모델_한서린_2026년08월12일.docx', { s: '', b: 'basetune', k: 'contract', c: '서린', r: '한서린', d: '260812' });
  withMemo(priv, '신분증2.jpg', { s: 'pfile:3', b: 'basetune', k: 'id',   c: '서린', r: '',  d: '260812' });
  withMemo(priv, '통장2.jpg',   { s: 'pfile:4', b: 'basetune', k: 'bank', c: '서린', r: '',  d: '260812' });

  const items = api.archivePending(SESS, {}).items || [];
  const a = items.find((x) => x.realName === '정시연') || {};
  const b = items.find((x) => x.realName === '한서린') || {};
  chk(!!a.idFile, '계약서에 채널명이 없어도 본명으로 신분증 연결');
  chk(!!a.bankFile, '공백 표기가 달라도(시 연 / 정 시연) 같은 사람으로 연결');
  chk(!!b.idFile && !!b.bankFile, '서류에 본명이 없어도 채널명으로 연결');
}

console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 서류 자동보관 전부 통과'));
process.exit(fail ? 1 : 0);
