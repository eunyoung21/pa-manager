/*************************************************************************
 * PA Manager — Google Apps Script 백엔드 (Render/Supabase 대체)
 *
 * 배포: 스프레드시트에 바인딩(또는 SS_ID 스크립트 속성) → 웹앱 배포
 *       "실행: 나 / 액세스: 모든 사용자" → /exec URL 을 index.html 의 API 상수로.
 *
 * 저장 구조(모두 이 스프레드시트 = 백엔드):
 *   _appdata : A열에 앱 데이터 JSON 을 45k자 청크로 분할 저장 (권위 데이터)
 *   _meta    : A1=rev(정수) A2=count(행수) A3=updatedAt A4=pbucket
 *   _users   : A1 에 계정 배열 JSON (passwordHash 포함 — 공개 저장소 아님, 시트에만)
 *   _log     : [t, ip, username, action, ua] 행 append (최근 500)
 *   Drive 폴더 'PA-Manager-pfiles'  : 개인정보 첨부(신분증·통장) 이미지, 파일명 = pfile id
 *   Drive 폴더 'PA-Manager-backups' : 스냅샷 JSON (주기 6h / 급감 차단 직전본)
 *
 * 시크릿(TOKEN_SECRET)은 코드가 아니라 Script Properties 에 저장 → 저장소 공개해도 안전.
 * 최초 1회 setup() 실행 필요.
 *************************************************************************/

var SHEET_APPDATA = '_appdata', SHEET_META = '_meta', SHEET_USERS = '_users', SHEET_LOG = '_log';
var CHUNK = 45000;                 // 셀당 50k자 한도 → 여유있게 45k
var PFILE_FOLDER = 'PA-Manager-pfiles';
var BACKUP_FOLDER = 'PA-Manager-backups';
var SALT = '_pa_mgr_ey_salt_2024'; // 기존 server.js 와 동일(계정 해시 호환)
var PFILE_BASE = 700000;
var LOG_MAX = 500;

/* ── 스프레드시트 핸들 ─────────────────────────────────────── */
function SS() {
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet(name) {
  var ss = SS();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

/* ── 최초 설정 (한 번 실행) ────────────────────────────────── */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN_SECRET')) {
    props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  sheet(SHEET_APPDATA); sheet(SHEET_META); sheet(SHEET_USERS); sheet(SHEET_LOG);
  // 기본 관리자
  var users = readUsers();
  if (!users.length) {
    users.push({
      id: Utilities.getUuid().replace(/-/g, '').slice(0, 8),
      username: 'admin',
      passwordHash: sha256hex('admin1234' + SALT),
      role: 'manager', brand: 'all', pa: '',
      createdAt: new Date().toISOString()
    });
    writeUsers(users);
  }
  pfileFolder(); backupFolder();
  var d = readData();
  if (!d.brands) writeData({ brands: [], settlements: {}, paList: [] }, true);
  Logger.log('setup 완료. /exec 배포 후 index.html API 상수에 URL 입력.');
  Logger.log('TOKEN_SECRET set: ' + !!props.getProperty('TOKEN_SECRET'));
}

/* ── 계약서 메일 권한 점검 (편집기에서 실행) ───────────────────
   setup 을 실행해도 권한 창이 안 뜨면 이 함수를 실행해 본다.
   무엇이 되고 안 되는지, 메일이 어느 주소로 나가는지 실행 로그에 찍어준다. */
function checkMail() {
  var me = deployerEmail();
  Logger.log('배포 계정: ' + (me || '(주소를 못 읽음 — 권한 목록에 userinfo.email 이 없는 경우. 발송에는 지장 없음)'));
  var quota;
  try {
    quota = MailApp.getRemainingDailyQuota();
  } catch (e) {
    Logger.log('❌ 메일 발송 권한이 없습니다.');
    Logger.log('   → appsscript.json 을 새 것으로 바꾸고 저장했는지 확인하세요.');
    Logger.log('   → (⚙ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 체크 후 편집기에서 교체)');
    Logger.log('   상세: ' + (e && e.message || e));
    return;
  }
  Logger.log('✅ 메일 발송 권한 OK — 오늘 남은 발송 가능 수: ' + quota);
  var from = teamAlias();
  if (me && me.toLowerCase() === TEAM_EMAIL.toLowerCase())
    Logger.log('발신 주소: ' + TEAM_EMAIL + ' (배포 계정이 팀 메일)');
  else if (from)
    Logger.log('발신 주소: ' + TEAM_EMAIL + ' (등록된 별칭으로 발송)');
  else
    Logger.log('발신 주소: ' + me + ' — ' + TEAM_EMAIL + ' 로 사본(cc)이 갑니다. '
             + '팀 메일 이름으로 보내려면 Gmail 설정 → 계정 → "다른 주소에서 메일 보내기" 에 ' + TEAM_EMAIL + ' 등록.');
  Logger.log('여기까지 나왔으면 배포(새 버전)만 하면 끝입니다.');
}

/* 실제로 한 통 보내 본다 — 배포 계정 본인에게 테스트 메일 발송 */
function sendTestMail() {
  var me = deployerEmail();
  var to = me || TEAM_EMAIL;   // 주소를 못 읽어도 팀 메일로는 보내 본다
  if (!me) Logger.log('계정 주소를 못 읽어 팀 메일(' + TEAM_EMAIL + ')로 보냅니다.');
  try {
    var opts = { replyTo: TEAM_EMAIL, name: 'PA Manager' };
    var from = teamAlias();
    if (from) opts.from = from;
    GmailApp.sendEmail(to, '[PA Manager] 계약서 메일 발송 테스트', '이 메일이 도착했다면 발송 준비가 끝났습니다.', opts);
    Logger.log('✅ ' + to + ' 로 테스트 메일을 보냈습니다. 받은편지함을 확인하세요.');
  } catch (e) {
    Logger.log('❌ 발송 실패: ' + (e && e.message || e));
    Logger.log('   → checkMail 을 먼저 실행해 권한부터 확인하세요.');
  }
}

/* ── 암호화 헬퍼 ───────────────────────────────────────────── */
function toHex(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] + 256) % 256;
    s += (v < 16 ? '0' : '') + v.toString(16);
  }
  return s;
}
function sha256hex(str) {
  return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}
function secret() {
  var s = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!s) throw new Error('TOKEN_SECRET 미설정 — setup() 을 먼저 실행하세요.');
  return s;
}
function hmacHex(payload) {
  return toHex(Utilities.computeHmacSha256Signature(payload, secret()));
}
function makeToken(username, role, brand) {
  var expires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30일
  var payload = username + '|' + role + '|' + (brand || 'all') + '|' + expires;
  var sig = hmacHex(payload);
  return Utilities.base64Encode(payload + '|' + sig, Utilities.Charset.UTF_8);
}
function verifyToken(token) {
  try {
    if (!token) return null;
    var decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString('UTF-8');
    var p = decoded.split('|');
    if (p.length === 5) {
      var username = p[0], role = p[1], brand = p[2], expires = p[3], sig = p[4];
      if (Date.now() > parseInt(expires, 10)) return null;
      if (sig !== hmacHex(username + '|' + role + '|' + brand + '|' + expires)) return null;
      return { username: username, role: role, brand: brand };
    }
    if (p.length === 4) { // 구형(브랜드 없음)
      var u2 = p[0], r2 = p[1], e2 = p[2], s2 = p[3];
      if (Date.now() > parseInt(e2, 10)) return null;
      if (s2 !== hmacHex(u2 + '|' + r2 + '|' + e2)) return null;
      return { username: u2, role: r2, brand: 'all' };
    }
    return null;
  } catch (e) { return null; }
}

/* ── 계정 저장/조회 ────────────────────────────────────────── */
function readUsers() {
  var v = sheet(SHEET_USERS).getRange(1, 1).getValue();
  if (!v) return [];
  try { var a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function writeUsers(users) {
  sheet(SHEET_USERS).getRange(1, 1).setValue(JSON.stringify(users));
}

/* ── 앱 데이터 저장/조회 (청크) ────────────────────────────── */
function readData() {
  var sh = sheet(SHEET_APPDATA);
  var last = sh.getLastRow();
  if (!last) return { brands: [], settlements: {}, paList: [] };
  var vals = sh.getRange(1, 1, last, 1).getValues();
  var str = '';
  for (var i = 0; i < vals.length; i++) str += vals[i][0];
  if (!str) return { brands: [], settlements: {}, paList: [] };
  try { return JSON.parse(str); } catch (e) { throw new Error('데이터 파싱 실패: ' + e.message); }
}
// 손상되어 못 읽으면 null 반환(예외 대신) — 저장 시 정상 데이터로 덮어써 복구할 수 있게.
function readDataSafe() { try { return readData(); } catch (e) { return null; } }
function countRows(d) {
  var n = 0, keys = ['step1Rows', 'step2Rows', 'claudeStep1Rows', 'claudeStep2Rows', 'shippingRows', 'reviewRows', 'privacyRows'];
  var brands = (d && d.brands) || [];
  for (var i = 0; i < brands.length; i++)
    for (var k = 0; k < keys.length; k++)
      n += ((brands[i][keys[k]]) || []).length;
  return n;
}
// 브랜드별 배열 행수를 {brandId: {key: N, ...}} 형태로 요약 — _meta 에 캐싱해 preSaveGuard 가 전체 데이터를 안 읽어도 되게.
function brandCounts(d) {
  var GKEYS = ['step1Rows', 'step2Rows', 'claudeStep1Rows', 'claudeStep2Rows', 'shippingRows', 'reviewRows', 'privacyRows'];
  var out = {};
  for (var bi = 0; bi < (d && d.brands ? d.brands : []).length; bi++) {
    var b = d.brands[bi], bc = {};
    for (var ki = 0; ki < GKEYS.length; ki++) bc[GKEYS[ki]] = ((b[GKEYS[ki]]) || []).length;
    out[b.id] = bc;
  }
  return out;
}
function metaGet() {
  var v = sheet(SHEET_META).getRange(1, 1, 5, 1).getValues();
  var bc = {};
  try { if (v[4][0]) bc = JSON.parse(String(v[4][0])); } catch (e) {}
  return { rev: Number(v[0][0]) || 0, count: Number(v[1][0]) || 0, updatedAt: v[2][0] || '', pbucket: Number(v[3][0]) || -1, brandCounts: bc };
}
function metaSet(m) {
  sheet(SHEET_META).getRange(1, 1, 5, 1).setValues([[m.rev], [m.count], [m.updatedAt], [m.pbucket != null ? m.pbucket : -1], [JSON.stringify(m.brandCounts || {})]]);
}
function writeData(obj, bumpMeta) {
  var str = JSON.stringify(obj);
  var sh = sheet(SHEET_APPDATA);
  // 청크 분할 — 이모지(서로게이트 페어)가 경계에서 잘리지 않게 조정.
  // 🔴 2026-08-04 사고: 경계가 URL 쿼리(...?utm_source | =ig_web_copy_link) 사이에 떨어져
  //    청크가 '=' 로 시작 → 시트가 수식으로 해석해 그 칸이 #ERROR! 가 되고 45,000자가 통째로 소실.
  //    (앱 전체가 '데이터 파싱 실패'로 읽기 불가. 결손 구간을 백업에서 떼어 이어붙여 복구함)
  //    → 청크가 수식 트리거 문자(= + - @)로 시작하지 않게 경계를 앞으로 당긴다.
  var rows = [];
  for (var i = 0; i < str.length; ) {
    var end = Math.min(i + CHUNK, str.length);
    if (end < str.length) {
      var c = str.charCodeAt(end - 1);
      if (c >= 0xD800 && c <= 0xDBFF) end--; // 마지막이 상위 서로게이트면 한 칸 물러남
      var guard = 0;
      while (end > i + 1 && guard++ < 10 && '=+-@'.indexOf(str.charAt(end)) >= 0) end--; // 다음 청크 첫 글자가 수식 트리거면 회피
    }
    rows.push([str.substring(i, end)]);
    i = end;
  }
  if (!rows.length) rows.push(['']);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, 1).setNumberFormat('@'); // 서식을 텍스트로 고정(수식 해석 2중 차단)
  sh.getRange(1, 1, rows.length, 1).setValues(rows);
  SpreadsheetApp.flush(); // 쓰기 즉시 확정(부분쓰기·절단 방지)
  // 검증: #ERROR! 셀만 확인. setNumberFormat('@')으로 수식 해석을 차단했고 JSON.stringify 출력은 항상 유효하므로
  //       JSON.parse 재검증은 불필요(3MB 재읽기+파싱 제거 → 저장 속도 단축).
  var v2 = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var j = 0; j < v2.length; j++) {
    var cell = String(v2[j][0]);
    if (cell.charAt(0) === '#' && cell.indexOf('!') > 0 && cell.length < 20) {
      snapshot('write-verify-fail', { at: new Date().toISOString(), len: str.length, cell: cell, row: j + 1 }, { reason: 'chunk-error-value' });
      throw new Error('저장 검증 실패 — 청크 ' + (j + 1) + '이 시트 에러값(' + cell + ')이 됨. 재시도합니다.');
    }
  }
  var m = metaGet();
  m.rev = (m.rev || 0) + 1;
  m.count = countRows(obj);
  m.updatedAt = new Date().toISOString();
  m.brandCounts = brandCounts(obj);
  if (bumpMeta && bumpMeta.pbucket !== undefined) m.pbucket = bumpMeta.pbucket;
  metaSet(m);
  return m.rev;
}

/* ── Drive 폴더 ────────────────────────────────────────────── */
function getFolder(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function pfileFolder() { return getFolder(PFILE_FOLDER); }
function backupFolder() { return getFolder(BACKUP_FOLDER); }

/* ── 스냅샷 (Drive JSON) ───────────────────────────────────── */
function snapshot(reason, obj, meta) {
  try {
    var name = reason + '_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    backupFolder().createFile(name, JSON.stringify({ meta: meta || {}, snap: obj }), 'application/json');
    // 회전: 각 reason 접두사별 최근 30개만 유지
    trimBackups(reason, 30);
  } catch (e) { Logger.log('snapshot err ' + e.message); }
}
function trimBackups(prefix, keep) {
  var files = [];
  var it = backupFolder().getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf(prefix + '_') === 0) files.push(f); }
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = keep; i < files.length; i++) files[i].setTrashed(true);
}

/* ── 저장 안전장치 (server.js preSaveGuard 포팅) ───────────── */
// ★ 성능 최적화: 저장마다 3MB 전체 데이터를 읽는 대신, _meta 에 캐싱된 행수(brandCounts)를 사용.
//   차단이 필요한 경우(드문 케이스)에만 실제 데이터를 읽는다.
function preSaveGuard(incoming, force) {
  var C = countRows(incoming);
  var m = metaGet(); // 빠른 읽기: _meta 5개 셀만
  var curCount = m.count || 0;
  var curBrand = m.brandCounts || {};

  // ① 급감(40%+) → 차단. 데이터가 없는 초기 상태(curCount=0)는 통과.
  if (!force && curCount >= 50 && C < curCount * 0.6) {
    var snap1 = readDataSafe(); // 차단 케이스만 전체 읽기 (드묾)
    snapshot('shrink-blocked', snap1 || incoming, { reason: 'shrink-blocked', prevCount: curCount, newCount: C, at: new Date().toISOString() });
    return { block: true, prevCount: curCount, newCount: C };
  }
  // ①-b 브랜드별 배열 급감 — _meta.brandCounts 캐시로 비교(전체 읽기 불필요)
  if (!force) {
    var GKEYS = ['step1Rows', 'step2Rows', 'claudeStep1Rows', 'claudeStep2Rows', 'shippingRows', 'reviewRows', 'privacyRows'];
    for (var bi = 0; bi < incoming.brands.length; bi++) {
      var nb = incoming.brands[bi];
      var ob = curBrand[nb.id] || {};
      for (var ki = 0; ki < GKEYS.length; ki++) {
        var oN = ob[GKEYS[ki]] || 0, nN = ((nb[GKEYS[ki]]) || []).length;
        if (oN >= 30 && nN < oN * 0.5) {
          var snap2 = readDataSafe(); // 차단 케이스만 전체 읽기 (드묾)
          snapshot('shrink-blocked-brand', snap2 || incoming, { reason: 'shrink-blocked-brand', brand: nb.id, key: GKEYS[ki], prev: oN, next: nN, at: new Date().toISOString() });
          return { block: true, prevCount: curCount, newCount: C, brand: nb.id, key: GKEYS[ki], prev: oN, next: nN };
        }
      }
    }
  }
  // ② 6시간 주기 스냅샷 — 현재 쓰려는 데이터를 그대로 저장(전체 읽기 불필요)
  var pbucket = Math.floor(Date.now() / (6 * 3600 * 1000));
  if (pbucket !== m.pbucket) {
    snapshot('periodic', incoming, { reason: 'periodic', count: C, at: new Date().toISOString() });
    return { block: false, pbucket: pbucket };
  }
  return { block: false };
}

/* ── 개인정보 자동폐기 — 정산완료 30일 뒤, 신분증사본·통장사본·주민번호 ── */
function ymdKey(s) {
  if (!s) return null;
  var str = String(s).trim(), m;
  m = str.match(/^(\d{2})[^\d](\d{1,2})[^\d](\d{1,2})$/);
  if (m) return '20' + m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  m = str.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  return null;
}
function pad2(x) { x = String(x); return x.length < 2 ? '0' + x : x; }
function daysSinceYmd(s) {
  var k = ymdKey(s); if (!k) return null;
  var p = k.split('-'), then = new Date(+p[0], +p[1] - 1, +p[2]);
  var now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((t0 - then) / 86400000);
}
function todayDisp() {
  var d = new Date();
  return String(d.getFullYear()).slice(2) + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
}
function deletePfileByUrl(url) {
  try {
    var m = url && String(url).match(/id=(\d+)/);
    if (!m) return;
    var it = pfileFolder().getFilesByName(m[1]);
    while (it.hasNext()) it.next().setTrashed(true);
  } catch (e) {}
}
function purgeExpiredPrivacy(data) {
  if (!data || !Array.isArray(data.brands)) return false;
  var changed = false;
  for (var bi = 0; bi < data.brands.length; bi++) {
    var b = data.brands[bi];
    var s2 = Array.isArray(b.step2Rows) ? b.step2Rows : [];
    var priv = Array.isArray(b.privacyRows) ? b.privacyRows : [];
    for (var si = 0; si < s2.length; si++) {
      var r = s2[si];
      if (r && r.infSettled === 'Y' && r.infSettledDate && !r.privacyPurged) {
        var ds = daysSinceYmd(r.infSettledDate);
        if (ds != null && ds >= 30) {
          /* 폐기 대상은 신분증사본·통장사본·주민등록번호(2026-08-12 변경).
             예전엔 개인정보 행을 통째로 지우고 연락처·계약서 파일까지 날렸는데,
             정산 끝난 사람의 이름·연락처·주소·계좌·계약서는 회계 증빙으로 계속 필요하다.
             주민등록번호는 반대로 보관할 근거가 없어 값까지 비운다.
             → 행은 남기고 idFile·bankFile 을 떼어(실제 파일도 휴지통) rrn 을 비운다. */
          for (var pi = 0; pi < priv.length; pi++) {
            var p = priv[pi];
            if (!p || p.channelName !== r.name) continue;
            if (p.idFile)   { deletePfileByUrl(p.idFile.url);   p.idFile = null;   changed = true; }
            if (p.bankFile) { deletePfileByUrl(p.bankFile.url); p.bankFile = null; changed = true; }
            if (p.rrn)      { p.rrn = '';                                          changed = true; }
          }
          r.privacyPurged = true; r.privacyPurgedDate = todayDisp();
          changed = true;
        }
      }
    }
    b.privacyRows = priv;
  }
  return changed;
}

/* ── 로그 ──────────────────────────────────────────────────── */
function logAction(action, sess, e) {
  try {
    var sh = sheet(SHEET_LOG);
    var ip = (e && e.parameter && e.parameter.ip) || '';
    var ua = '';
    sh.appendRow([new Date().toISOString(), ip, (sess && sess.username) || '', action, ua]);
    var last = sh.getLastRow();
    if (last > LOG_MAX + 50) sh.deleteRows(1, last - LOG_MAX);
  } catch (err) {}
}

/* ── 응답 ──────────────────────────────────────────────────── */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ── 라우터 ────────────────────────────────────────────────── */
function doGet(e) { return handle(e, {}); }
function doPost(e) {
  var body = {};
  try { if (e.postData && e.postData.contents) body = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(e, body);
}
function handle(e, body) {
  try {
    var p = e.parameter || {};
    var action = body.action || p.action || '';
    var token = body.token || p.token || '';
    var sess = verifyToken(token);
    var need = function () { if (!sess) throw { code: 401, msg: '로그인이 필요합니다.' }; return sess; };
    var mgr = function () { need(); if (sess.role !== 'manager') throw { code: 403, msg: '권한 없음' }; return sess; };

    switch (action) {
      case 'login':    return login(body);
      case 'logout':   return json({ ok: true });
      case 'rev':      need(); return json({ ok: true, rev: metaGet().rev });
      case 'get':      return getData(need(), e);
      case 'save':     return saveData(need(), body, p);
      case 'pfileSave':return pfileSave(need(), body);
      case 'pfileGet': return pfileGet(need(), body, p);
      case 'contractArchive': return contractArchive(need(), body);
      case 'archivePending': return archivePending(mgr(), body);
      case 'archiveFile': return archiveFile(mgr(), body);
      case 'archiveComplete': return archiveComplete(mgr(), body);
      case 'contractMail': return contractMail(need(), body);
      case 'users':    return usersList(mgr());
      case 'userCreate':return userCreate(mgr(), body);
      case 'userDelete':return userDelete(mgr(), body);
      case 'userUsername':return userField(mgr(), body, 'username');
      case 'userPassword':return userField(mgr(), body, 'password');
      case 'userBrand':return userField(mgr(), body, 'brand');
      case 'userPa':   return userField(mgr(), body, 'pa');
      case 'userTabs': return userField(mgr(), body, 'tabs');
      case 'usersImport':return usersImport(mgr(), body);
      case 'logs':     return logsList(mgr());
      case 'backups':  return backupsList(mgr());
      case 'restore':  return restore(mgr(), body);
      case 'sheetProxy':return sheetProxy(need(), body);
      case 'ping':     return json({ ok: true, rev: metaGet().rev });
      default:         return json({ error: 'unknown action: ' + action });
    }
  } catch (err) {
    if (err && err.code) return json({ error: err.msg, code: err.code });
    return json({ error: String(err && err.message || err) });
  }
}

/* ── 액션 구현 ─────────────────────────────────────────────── */
function login(body) {
  var username = body.username, password = body.password;
  if (!username || !password) return json({ error: 'Bad request' });
  var users = readUsers();
  var u = null;
  for (var i = 0; i < users.length; i++) if (users[i].username === username) { u = users[i]; break; }
  if (!u || u.passwordHash !== sha256hex(password + SALT))
    return json({ error: '아이디 또는 비밀번호가 틀렸습니다.' });
  logAction('login', { username: username }, null);
  return json({
    ok: true, token: makeToken(u.username, u.role, u.brand),
    role: u.role, username: u.username, brand: u.brand || 'all', pa: u.pa || '', tabs: u.tabs || ''
  });
}

function getData(sess, e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var d = readData();
    if (purgeExpiredPrivacy(d)) writeData(d);
    return json({ ok: true, rev: metaGet().rev, data: d });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function saveData(sess, body, p) {
  var incoming = body.data;
  if (!incoming || !Array.isArray(incoming.brands)) return json({ error: 'bad payload' });
  var force = (p && p.force === '1') || body.force === true || body.force === 1;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json({ error: 'busy, retry' });
  try {
    // ★ 동시편집 보호: 클라가 읽은 리비전(baseRev) 이후 다른 사람이 저장했으면 통째 덮어쓰기를 막는다.
    //   클라는 conflict 를 받으면 최신본을 받아 자기 변경분만 얹어(3-way 병합) 다시 저장한다.
    //   baseRev 를 안 보내는 옛 클라이언트(캐시된 페이지)는 종전대로 동작(하위호환).
    if (!force && body.baseRev !== undefined && body.baseRev !== null && body.baseRev !== '') {
      var curRev = metaGet().rev;
      if (Number(body.baseRev) !== Number(curRev)) return json({ conflict: true, rev: curRev });
    }
    var g = preSaveGuard(incoming, force);
    if (g.block) return json({ blocked: true, error: '안전장치: 데이터 급감 감지로 저장을 막았습니다.' + (g.brand ? ' (' + g.brand + ' ' + g.key + ' ' + g.prev + '→' + g.next + ')' : ''), prevCount: g.prevCount, newCount: g.newCount, brand: g.brand, key: g.key });
    var rev = writeData(incoming, g.pbucket !== undefined ? { pbucket: g.pbucket } : null);
    logAction('save', sess, null);
    return json({ ok: true, rev: rev });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

/* pfile: 개인정보 첨부(신분증·통장) — Drive 폴더에 파일명=id 로 저장 */
function nextPfileId() {
  var max = PFILE_BASE;
  var it = pfileFolder().getFiles();
  while (it.hasNext()) { var n = parseInt(it.next().getName(), 10); if (!isNaN(n) && n > max) max = n; }
  return max + 1;
}
function pfileSave(sess, body) {
  var dataUrl = body.data;
  if (!dataUrl) return json({ error: 'no data' });
  var m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return json({ error: 'bad data url' });
  var type = m[1], b64 = m[2];
  // 이관용: 관리자가 id 를 지정하면 그 id 로 저장(기존 privacyRows url 참조 유지). 없으면 새 id 발급.
  var id = (sess.role === 'manager' && /^\d+$/.test(String(body.id || ''))) ? parseInt(body.id, 10) : nextPfileId();
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), type, String(id));
  var f = pfileFolder().createFile(blob);
  f.setName(String(id));
  return json({ ok: true, id: id, url: '/api/pfile?id=' + id, name: body.name || '', type: type });
}
function pfileGet(sess, body, p) {
  var id = String((body && body.id) || (p && p.id) || ''); // 클라는 본문으로 보냄(쿼리 fallback)
  if (!/^\d+$/.test(id)) return json({ error: 'bad id' });
  var it = pfileFolder().getFilesByName(id);
  if (!it.hasNext()) return json({ error: 'not found' });
  var f = it.next();
  var blob = f.getBlob();
  var dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  return json({ ok: true, id: id, dataUrl: dataUrl, type: blob.getContentType() });
}

/* 서류 영구보관 — 개인정보로 올라온 계약서·신분증사본·통장사본을 브랜드 드라이브에 복사.
   pfile 은 정산 30일 후 자동폐기되지만, 이 보관본은 폐기 대상이 아니라 회계/증빙용으로 남는다.
   대상: 브랜드 드라이브 > PA 협업 > 개인정보파일(신분증·통장) / 계약서파일(계약서) */
var BRAND_ARCHIVE_FOLDER = {
  basetune: { privacy: '1-nqYhZjNhbJPtLiqLx3OjUeyqX8F7pjp', contract: '1SOULiiEG2U_BZ9S3erQK368LVzBn_r-K' },
  granny:   { privacy: '1X6zSLsUyAWw8Yesd6TzJmjhfF2hZ39zH', contract: '19W5eF5pZxlpeDvL3aS-_kWoy-bQ7kXu7' }
};
// 위 ID 가 비어 있을 때만 쓰는 구버전 폴백: 브랜드 폴더 아래 하위폴더를 찾아/만들어 씀.
var BRAND_DRIVE_FOLDER = {
  basetune: '1naWNt2xs9biAipjDZWEWVVU1nrOC8sXv',
  granny:   '1ubvCkIzuspkDtTvbDBvMFF5tV6jsxJp_'
};
/* 파일명은 올린 파일 이름을 그대로 쓴다(사람이 알아보기 쉽게).
   노션 자동기입이 읽어야 하는 값(브랜드·종류·채널명·본명·계약날짜)은 이름이 아니라
   파일 '설명'에 JSON 으로 심어둔다 → 이름을 바꿔도 자동기입이 깨지지 않는다.
   설명이 없는 파일(손으로 넣은 것)은 이름 규칙으로 읽어본다:
     계약서 …_채널명_본명_YYMMDD / 신분증사본_채널명_본명 / 통장사본_채널명_본명 */
var ARCHIVE_KIND = {
  contract: { key: 'contract', label: '계약서',   slot: 'contract', sub: '계약서파일',   legacySub: '계약서', dated: true },
  id:       { key: 'id',       label: '신분증사본', slot: 'privacy',  sub: '개인정보파일', legacySub: null,   dated: false },
  bank:     { key: 'bank',     label: '통장사본',  slot: 'privacy',  sub: '개인정보파일', legacySub: null,   dated: false }
};
var ARCHIVE_DONE_FOLDER = '완료';   // 노션 기입까지 끝난 파일을 옮겨두는 하위폴더
/* 보관 폴더 점검 (편집기에서 실행) — '폴더 미지정' 이 뜰 때 원인을 가른다.
   이 함수가 함수 목록에 안 보이면 = 붙여넣기가 저장되지 않은 것.
   보이고 로그가 다 OK 인데 앱에서 여전히 실패하면 = 저장은 됐지만 '새 버전' 배포를 안 한 것. */
function checkArchive() {
  var brands = Object.keys(BRAND_ARCHIVE_FOLDER);
  for (var i = 0; i < brands.length; i++) {
    var b = brands[i], cfg = BRAND_ARCHIVE_FOLDER[b];
    var slots = ['privacy', 'contract'];
    for (var s = 0; s < slots.length; s++) {
      var id = cfg[slots[s]];
      if (!id) { Logger.log('❌ ' + b + '.' + slots[s] + ' — 폴더 ID 가 비어 있음(옛 코드)'); continue; }
      try {
        var f = DriveApp.getFolderById(id);
        Logger.log('✅ ' + b + '.' + slots[s] + ' → ' + f.getName());
      } catch (e) {
        Logger.log('❌ ' + b + '.' + slots[s] + ' (' + id + ') — 열 수 없음: ' + (e.message || e)
                 + ' → 배포 계정에 이 폴더 권한이 있는지 확인');
      }
    }
  }
  Logger.log('여기까지 전부 ✅ 인데 앱에서 실패하면 → 배포 관리에서 "버전: 새 버전" 으로 다시 배포하세요.');
}

function archiveFolder(brand, kind) {
  var cfg = (BRAND_ARCHIVE_FOLDER[brand] || {});
  var fid = cfg[kind.slot];
  if (fid) return DriveApp.getFolderById(fid);           // 지정된 폴더로 정확히
  if (!kind.legacySub) return null;                      // 미지정이면 엉뚱한 곳에 만들지 않고 실패
  var bid = BRAND_DRIVE_FOLDER[brand];
  if (!bid) return null;
  var parent = DriveApp.getFolderById(bid);
  var it = parent.getFoldersByName(kind.legacySub);
  return it.hasNext() ? it.next() : parent.createFolder(kind.legacySub);
}
/* 파일 설명에 심는 메모(JSON). 노션 자동기입이 이걸 읽는다.
   { s:'pfile:9001', b:'basetune', k:'contract', c:'채널명', r:'본명', d:'260805' } */
function archiveMemo(f) {
  var d = '';
  try { d = f.getDescription() || ''; } catch (e) { return null; }
  if (d.charAt(0) !== '{') return null;
  try { var o = JSON.parse(d); return (o && o.k) ? o : null; } catch (e) { return null; }
}
// 같은 서류를 두 번 올리지 않도록: 메모의 출처(pfile id)가 같으면 이미 올린 그 파일로 본다.
// 같은 사람·같은 종류인데 출처가 다르면 = 다른 파일로 교체 업로드 → 덮어쓰지 않고 함께 남긴다.
function findArchived(folder, memo) {
  var it = folder.getFiles(), same = null, names = {};
  while (it.hasNext()) {
    var f = it.next();
    names[f.getName()] = true;
    var m = archiveMemo(f);
    if (!m || m.k !== memo.k) continue;
    if (memo.s && !same && m.s === memo.s) same = f;
  }
  return { same: same, names: names };
}
function contractArchive(sess, body) {
  var brand = String((body && body.brand) || '');
  var kind = ARCHIVE_KIND[String((body && body.kind) || 'contract')];
  if (!kind) return json({ error: 'bad kind' });
  var sub = archiveFolder(brand, kind);
  if (!sub) return json({ error: '드라이브 폴더 미지정 (' + brand + '/' + kind.sub + ')' });

  var m = String((body && body.pfileUrl) || '').match(/[?&]id=(\d+)/);
  // 올린 파일 이름에서 드라이브가 못 쓰는 문자만 제거.
  var nm = String(body.name || '').replace(/[\\\/:*?"<>|]/g, '').trim();
  var dot = nm.lastIndexOf('.'), ext = dot > 0 ? nm.slice(dot) : '', base = dot > 0 ? nm.slice(0, dot) : nm;
  if (!base) { base = kind.label; ext = ext || ''; }
  // 계약날짜: 「2026년08월06일」 → 이름 끝 6자리(…_260805) → 오늘 순으로 읽는다.
  var memo = { s: m ? ('pfile:' + m[1]) : '', b: brand, k: String(body.kind || 'contract'),
    c: String(body.channelName || ''), r: String(body.realName || ''),
    d: dateFromName(base) || todayDisp().replace(/[^0-9]/g, '') };

  var prev = findArchived(sub, memo);
  if (prev.same) return json({ ok: true, url: prev.same.getUrl(), name: prev.same.getName(), dup: true });
  // 계약서는 보낸 파일과 같은 표준형으로 이름을 맞춘다: 드래프터_광고모델_홍길동_2026년08월06일.docx
  // (본명이나 브랜드를 모르면 올린 이름 그대로 — 사람이 알아볼 단서를 지우지 않는다)
  var std = memo.k === 'contract' ? standardContractName(brand, memo.r, memo.d) : '';
  if (std) base = std;
  // 같은 이름이 이미 있으면 덮어쓰지 않고 번호를 붙인다.
  var fname = base + ext;
  for (var i = 2; prev.names[fname]; i++) fname = base + '_' + i + ext;

  var saved = null;
  // 1순위: 이미 올라온 pfile 을 서버 내에서 복사(바이트 재전송 없음)
  if (m) {
    var it = pfileFolder().getFilesByName(m[1]);
    if (it.hasNext()) saved = it.next().makeCopy(fname, sub);
  }
  // 2순위: pfile 을 못 찾으면 data(base64) 로 직접 저장
  if (!saved && body.data) {
    var mm = String(body.data).match(/^data:([^;]+);base64,(.*)$/);
    if (!mm) return json({ error: 'bad data' });
    saved = sub.createFile(Utilities.newBlob(Utilities.base64Decode(mm[2]), mm[1], fname));
  }
  if (!saved) return json({ error: 'no source' });
  try { saved.setDescription(JSON.stringify(memo)); } catch (e) {}
  return json({ ok: true, url: saved.getUrl(), name: fname });
}

/* ── 계약서 메일 발송 ────────────────────────────────────────
   앱이 만든 .docx(base64)를 그대로 첨부해 모델에게 보낸다.
   브라우저는 메일에 파일을 자동첨부할 수 없어서 발송만 여기서 한다.
   발신자: 배포 계정이 팀 메일이거나 팀 메일이 Gmail 별칭이면 팀 메일로,
           아니면 배포 계정으로 나가되 회신주소는 항상 팀 메일. */
var TEAM_EMAIL = 'cheddar@dayzcorp.kr';

/* 배포 계정 주소. 권한 목록에 userinfo.email 이 없으면 빈 문자열이 나온다(발송 자체엔 지장 없음). */
function deployerEmail() {
  var e = '';
  try { e = Session.getEffectiveUser().getEmail() || ''; } catch (err) {}
  if (!e) { try { e = Session.getActiveUser().getEmail() || ''; } catch (err) {} }
  return e;
}
/* 팀 메일로 보낼 수 있으면 그 주소를 돌려준다(별칭일 때만 from 지정이 먹힌다) */
function teamAlias() {
  var me = deployerEmail();
  if (me && me.toLowerCase() === TEAM_EMAIL.toLowerCase()) return '';  // 기본 발신자가 이미 팀 메일
  try {
    var al = GmailApp.getAliases() || [];
    for (var i = 0; i < al.length; i++) if (String(al[i]).toLowerCase() === TEAM_EMAIL.toLowerCase()) return al[i];
  } catch (e) {}
  return '';
}

function contractMail(sess, body) {
  var to = String((body && body.to) || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: '받는 사람 이메일이 올바르지 않습니다.' });

  var m = String((body && body.data) || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return json({ error: '첨부할 계약서 파일이 없습니다.' });

  var fname = String((body && body.filename) || '').replace(/[\\\/:*?"<>|\r\n]/g, '').trim() || '광고모델계약서.docx';
  if (fname.slice(-5).toLowerCase() !== '.docx') fname += '.docx';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fname);

  var subject = String((body && body.subject) || '').replace(/[\r\n]+/g, ' ').trim() || '광고모델 계약서';
  var text = String((body && body.body) || '');

  var quota = 0;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  if (quota === 0) return json({ error: '오늘 메일 발송 한도를 다 썼습니다. 내일 다시 시도하세요.' });

  var from = teamAlias();
  var senderName = String((body && body.senderName) || '').replace(/[\r\n]+/g, ' ').trim();
  var opts = {
    attachments: [blob],
    replyTo: TEAM_EMAIL,
    htmlBody: text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  };
  if (senderName) opts.name = senderName;
  if (from) opts.from = from;
  // 발신이 팀 메일이 아니면 팀 메일에도 사본을 남긴다(보낸 기록 확인용).
  // 주소를 못 읽는 경우(userinfo.email 없음)엔 자기 자신에게 cc 하는 꼴이 될 수 있어 생략한다.
  var me = deployerEmail();
  if (!from && me && me.toLowerCase() !== TEAM_EMAIL.toLowerCase()) opts.cc = TEAM_EMAIL;

  try {
    GmailApp.sendEmail(to, subject, text, opts);
  } catch (err) {
    return json({ error: '메일 발송 실패: ' + String(err && err.message || err) });
  }
  logAction('contractMail:' + to, sess, null);
  return json({ ok: true, to: to, from: from || me || TEAM_EMAIL, cc: opts.cc || '' });
}

/* 노션 자동기입용 — 아직 처리 안 된(=완료 폴더로 안 옮긴) 계약서 건 목록.
   계약서 1장 = 정산 1건. 같은 사람의 신분증·통장이 개인정보파일에 있는지도 함께 알려준다. */
/* 계약서 파일명 표준형 — 우리가 메일로 보낸 이름과 같게 맞춘다.
   드래프터_광고모델_홍길동_2026년08월06일   (광고주명이 곧 브랜드) */
var BRAND_COMPANY_SHORT = { basetune: '드래프터', granny: '썸웨어코드' };
function stampKo(ymd6) {                                   // 260806 → 2026년08월06일
  var m = String(ymd6 || '').match(/^(\d{2})(\d{2})(\d{2})$/);
  return m ? ('20' + m[1] + '년' + m[2] + '월' + m[3] + '일') : '';
}
function standardContractName(brand, realName, ymd6) {
  var co = BRAND_COMPANY_SHORT[brand], ko = stampKo(ymd6), who = String(realName || '').trim();
  if (!co || !ko || !who) return '';
  return [co, '광고모델', who, ko].join('_').replace(/[\\\/:*?"<>|]/g, '');
}
/* 이름에서 계약날짜(YYMMDD) 뽑기: 「2026년08월06일」 먼저, 없으면 끝의 6자리 */
function dateFromName(stem) {
  var k = String(stem || '').match(/(\d{4})년\s*(\d{2})월\s*(\d{2})일/);
  if (k) return k[1].slice(2) + k[2] + k[3];
  var d = String(stem || '').match(/(\d{6})(?!.*\d)/);
  return d ? d[1] : '';
}
function parseArchiveName(name, kind) {
  // 확장자와 중복번호(_2, _3)만 떼어낸다. 6자리 계약날짜를 떼면 안 되므로 1~2자리로 제한.
  var stem = String(name).replace(/\.[^.]+$/, '').replace(/_\d{1,2}$/, '');
  if (kind.dated) {                                                        // …_채널명_본명_YYMMDD
    // 표준형: 광고주_광고모델_본명_2026년08월06일 — 채널명은 없고 본명이 마지막에서 두 번째
    var ko = stem.match(/^(.+)_(\d{4})년\s*(\d{2})월\s*(\d{2})일$/);
    if (ko) {
      var head = ko[1], i2 = head.lastIndexOf('_');
      var who2 = i2 > 0 ? head.slice(i2 + 1) : head;
      return { channelName: '', realName: who2, date: ko[2].slice(2) + ko[3] + ko[4], who: who2 };
    }
    var m = stem.match(/^(.*)_(\d{6})$/); if (!m) return null;
    var who = m[1].replace(/_?계약서_?$/, '');                             // 손으로 넣은 '…_계약서_날짜' 도 받아준다
    var i = who.lastIndexOf('_');
    return { channelName: i > 0 ? who.slice(0, i) : who, realName: i > 0 ? who.slice(i + 1) : '', date: m[2], who: who };
  }
  var p = kind.label + '_';                                                // 종류_채널명_본명
  if (stem.indexOf(p) !== 0) return null;
  var w = stem.slice(p.length), j = w.lastIndexOf('_');
  return { channelName: j > 0 ? w.slice(0, j) : w, realName: j > 0 ? w.slice(j + 1) : '', date: '', who: w };
}
/* 파일 하나에서 노션 기입에 쓸 값을 뽑는다. 파일 설명(앱이 심어둔 메모)이 1순위,
   없으면(손으로 넣은 파일) 이름 규칙으로 읽는다. */
function archiveInfo(f, kind) {
  var m = archiveMemo(f);
  if (m && m.k === kind.key) {
    var who = (m.c || '') + (m.r ? '_' + m.r : '');
    return { channelName: m.c || '', realName: m.r || '', date: m.d || '', who: who || (m.r || m.c || '') };
  }
  return parseArchiveName(f.getName(), kind);
}
function doneFolder(folder) {
  var it = folder.getFoldersByName(ARCHIVE_DONE_FOLDER);
  return it.hasNext() ? it.next() : folder.createFolder(ARCHIVE_DONE_FOLDER);
}
function archivePending(sess, body) {
  var brands = Object.keys(BRAND_ARCHIVE_FOLDER), out = [];
  for (var i = 0; i < brands.length; i++) {
    var brand = brands[i];
    var cf = archiveFolder(brand, ARCHIVE_KIND.contract);
    var pf = archiveFolder(brand, ARCHIVE_KIND.id);
    if (!cf) continue;
    // 개인정보파일 폴더의 신분증·통장을 미리 모아 사람별로 붙여준다(완료 폴더 제외).
    var priv = {};
    if (pf) {
      var pit = pf.getFiles();
      while (pit.hasNext()) {
        var pfl = pit.next(), pm = archiveMemo(pfl), pn = pfl.getName();
        var k = null;
        if (pm) k = pm.k === 'id' ? 'idFile' : (pm.k === 'bank' ? 'bankFile' : null);
        else k = pn.indexOf(ARCHIVE_KIND.id.label + '_') === 0 ? 'idFile' : (pn.indexOf(ARCHIVE_KIND.bank.label + '_') === 0 ? 'bankFile' : null);
        if (!k) continue;
        var pp = archiveInfo(pfl, k === 'idFile' ? ARCHIVE_KIND.id : ARCHIVE_KIND.bank);
        if (!pp || !pp.who) continue;
        (priv[pp.who] = priv[pp.who] || {})[k] = { id: pfl.getId(), name: pn, url: pfl.getUrl() };
      }
    }
    var cit = cf.getFiles();
    while (cit.hasNext()) {
      var f = cit.next(), n = f.getName();
      var p = archiveInfo(f, ARCHIVE_KIND.contract);
      if (!p) continue;                                                    // 정보를 못 읽는 파일은 건드리지 않음
      var extra = priv[p.who] || {};
      out.push({ brand: brand, channelName: p.channelName, realName: p.realName, date: p.date,
        contractFile: { id: f.getId(), name: n, url: f.getUrl() },
        idFile: extra.idFile || null, bankFile: extra.bankFile || null });
    }
  }
  return json({ ok: true, items: out });
}
/* 보관된 서류 1개를 내려받기 (정산 대시보드가 쓸 로컬 사본용) */
function archiveFile(sess, body) {
  var id = String((body && body.id) || '');
  if (!id) return json({ error: 'id 필요' });
  var f = DriveApp.getFileById(id);
  var blob = f.getBlob();
  return json({ ok: true, id: id, name: f.getName(), type: blob.getContentType(),
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
}

/* 노션 기입까지 끝난 건의 파일을 각 폴더의 '완료' 하위로 이동 */
function archiveComplete(sess, body) {
  var ids = (body && body.fileIds) || [];
  if (!Array.isArray(ids) || !ids.length) return json({ error: 'fileIds 필요' });
  var moved = 0, errs = [];
  for (var i = 0; i < ids.length; i++) {
    try {
      var f = DriveApp.getFileById(String(ids[i]));
      var parents = f.getParents();
      if (!parents.hasNext()) { errs.push(ids[i] + ': 부모 폴더 없음'); continue; }
      var cur = parents.next();
      if (cur.getName() === ARCHIVE_DONE_FOLDER) { moved++; continue; }    // 이미 완료 — 다시 옮기지 않음
      f.moveTo(doneFolder(cur));
      moved++;
    } catch (e) { errs.push(String(ids[i]) + ': ' + (e.message || e)); }
  }
  logAction('archiveComplete:' + moved, sess, null);
  return json({ ok: errs.length === 0, moved: moved, errors: errs });
}

/* 구글 시트 CSV 프록시 (앱의 '시트에서 불러오기' 기능용) */
function sheetProxy(sess, body) {
  var url = body.url || '';
  if (url.indexOf('https://docs.google.com/spreadsheets/') !== 0) return json({ error: 'bad url' });
  try {
    var res = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
    return json({ ok: true, csv: res.getContentText() });
  } catch (e) { return json({ error: String(e.message || e) }); }
}

/* users */
function usersList(sess) {
  return json({ ok: true, users: readUsers().map(function (u) {
    return { id: u.id, username: u.username, role: u.role, brand: u.brand, pa: u.pa, tabs: u.tabs || '', createdAt: u.createdAt };
  }) });
}
function userCreate(sess, body) {
  var users = readUsers();
  if (!body.username || !body.password) return json({ error: 'username/password 필요' });
  for (var i = 0; i < users.length; i++) if (users[i].username === body.username) return json({ error: '이미 존재하는 아이디' });
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  users.push({ id: id, username: body.username, passwordHash: sha256hex(body.password + SALT),
    role: body.role || 'staff', brand: body.brand || 'all', pa: body.pa || '', tabs: body.tabs || '', createdAt: new Date().toISOString() });
  writeUsers(users);
  return json({ ok: true, id: id });
}
// 계정 일괄 이관(해시 그대로) — 이미 있는 username 은 건너뜀(admin 보존)
function usersImport(sess, body) {
  var incoming = body.users;
  if (!Array.isArray(incoming)) return json({ error: 'users 배열 필요' });
  var cur = readUsers(), have = {};
  cur.forEach(function (u) { have[u.username] = true; });
  var added = 0;
  incoming.forEach(function (u) {
    if (!u || !u.username || !u.passwordHash || have[u.username]) return;
    cur.push({ id: u.id || Utilities.getUuid().replace(/-/g, '').slice(0, 8), username: u.username,
      passwordHash: u.passwordHash, role: u.role || 'staff', brand: u.brand || 'all', pa: u.pa || '',
      createdAt: u.createdAt || new Date().toISOString() });
    added++; have[u.username] = true;
  });
  writeUsers(cur);
  return json({ ok: true, added: added, total: cur.length });
}
function findUser(users, id) { for (var i = 0; i < users.length; i++) if (users[i].id === id) return i; return -1; }
function userDelete(sess, body) {
  var users = readUsers(); var idx = findUser(users, body.id);
  if (idx < 0) return json({ error: '없는 계정' });
  if (users[idx].username === sess.username) return json({ error: '본인 계정 삭제 불가' });
  users.splice(idx, 1); writeUsers(users);
  return json({ ok: true });
}
function userField(sess, body, field) {
  var users = readUsers(); var idx = findUser(users, body.id);
  if (idx < 0) return json({ error: '없는 계정' });
  if (field === 'username') {
    if (!body.username) return json({ error: 'username 필요' });
    for (var i = 0; i < users.length; i++) if (users[i].username === body.username && users[i].id !== body.id) return json({ error: '이미 존재하는 아이디' });
    users[idx].username = body.username;
  } else if (field === 'password') {
    if (!body.password) return json({ error: 'password 필요' });
    users[idx].passwordHash = sha256hex(body.password + SALT);
  } else if (field === 'brand') {
    users[idx].brand = body.brand || 'all';
  } else if (field === 'pa') {
    users[idx].pa = body.pa || '';
  } else if (field === 'tabs') {
    users[idx].tabs = body.tabs || '';
  }
  writeUsers(users);
  return json({ ok: true });
}

/* logs */
function logsList(sess) {
  var sh = sheet(SHEET_LOG);
  var last = sh.getLastRow();
  if (!last) return json({ ok: true, logs: [] });
  var n = Math.min(200, last);
  var vals = sh.getRange(last - n + 1, 1, n, 5).getValues();
  var logs = vals.map(function (r) { return { t: r[0], ip: r[1], username: r[2], action: r[3], ua: r[4] }; }).reverse();
  return json({ ok: true, logs: logs });
}

/* backups / restore */
function backupsList(sess) {
  var files = [], it = backupFolder().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    files.push({ id: f.getId(), name: f.getName(), created: f.getDateCreated().toISOString() });
  }
  files.sort(function (a, b) { return b.created < a.created ? -1 : 1; });
  return json({ ok: true, backups: files });
}
function restore(sess, body) {
  var id = body.id;
  if (!id) return json({ error: 'id 필요' });
  var f = DriveApp.getFileById(id);
  var obj = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  var snap = obj.snap || obj;
  if (!snap || !Array.isArray(snap.brands)) return json({ error: '스냅샷 형식 아님' });
  var before = countRows(readData());
  var rev = writeData(snap);
  return json({ ok: true, from: id, beforeCount: before, afterCount: countRows(snap), rev: rev });
}
