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
function metaGet() {
  var v = sheet(SHEET_META).getRange(1, 1, 4, 1).getValues();
  return { rev: Number(v[0][0]) || 0, count: Number(v[1][0]) || 0, updatedAt: v[2][0] || '', pbucket: Number(v[3][0]) || -1 };
}
function metaSet(m) {
  sheet(SHEET_META).getRange(1, 1, 4, 1).setValues([[m.rev], [m.count], [m.updatedAt], [m.pbucket]]);
}
function writeData(obj, bumpMeta) {
  var str = JSON.stringify(obj);
  var sh = sheet(SHEET_APPDATA);
  // 청크 분할 — 이모지(서로게이트 페어)가 경계에서 잘리지 않게 조정.
  var rows = [];
  for (var i = 0; i < str.length; ) {
    var end = Math.min(i + CHUNK, str.length);
    if (end < str.length) {
      var c = str.charCodeAt(end - 1);
      if (c >= 0xD800 && c <= 0xDBFF) end--; // 마지막이 상위 서로게이트면 한 칸 물러남
    }
    rows.push([str.substring(i, end)]);
    i = end;
  }
  if (!rows.length) rows.push(['']);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, 1).setValues(rows);
  SpreadsheetApp.flush(); // 쓰기 즉시 확정(부분쓰기·절단 방지)
  // 검증: 방금 쓴 걸 다시 읽어 JSON 파싱되는지 확인. 실패면 rev 안 올리고 오류(클라가 재시도).
  var back = '', v2 = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var j = 0; j < v2.length; j++) back += v2[j][0];
  try { JSON.parse(back); } catch (e) {
    snapshot('write-verify-fail', { at: new Date().toISOString(), len: str.length }, { reason: 'write-verify-fail' });
    throw new Error('저장 검증 실패(자동 재시도됩니다): ' + e.message);
  }
  var m = metaGet();
  m.rev = (m.rev || 0) + 1;
  m.count = countRows(obj);
  m.updatedAt = new Date().toISOString();
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
function preSaveGuard(incoming, force) {
  var C = countRows(incoming);
  var cur = readDataSafe();
  // ★ 현재 저장본이 손상돼 읽을 수 없으면 급감 비교 불가 → 들어온 정상 데이터로 덮어써 복구.
  if (cur === null) {
    snapshot('corrupt-recover', { at: new Date().toISOString(), newCount: C }, { reason: 'corrupt-recover' });
    return { block: false };
  }
  var curCount = countRows(cur);
  // ① 급감(40%+) → 직전본 스냅샷 후 저장 차단
  if (!force && curCount >= 50 && C < curCount * 0.6) {
    snapshot('shrink-blocked', cur, { reason: 'shrink-blocked', prevCount: curCount, newCount: C, at: new Date().toISOString() });
    return { block: true, prevCount: curCount, newCount: C };
  }
  // ② 6시간 주기 스냅샷
  var m = metaGet();
  var pbucket = Math.floor(Date.now() / (6 * 3600 * 1000));
  if (pbucket !== m.pbucket) {
    snapshot('periodic', incoming, { reason: 'periodic', count: C, at: new Date().toISOString() });
    return { block: false, pbucket: pbucket };
  }
  return { block: false };
}

/* ── 개인정보 자동폐기 (server.js purgeExpiredPrivacy 포팅) ── */
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
        if (ds != null && ds >= 3) {
          var before = priv.length;
          priv = priv.filter(function (p) {
            if (p && p.channelName === r.name) {
              if (p.bankFile) deletePfileByUrl(p.bankFile.url);
              if (p.idFile) deletePfileByUrl(p.idFile.url);
              return false;
            }
            return true;
          });
          if (priv.length !== before) changed = true;
          r.phone = ''; r.privacyPurged = true; r.privacyPurgedDate = todayDisp();
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
      case 'pfileSave':return pfileSave(mgr(), body);
      case 'pfileGet': return pfileGet(need(), body, p);
      case 'users':    return usersList(mgr());
      case 'userCreate':return userCreate(mgr(), body);
      case 'userDelete':return userDelete(mgr(), body);
      case 'userUsername':return userField(mgr(), body, 'username');
      case 'userPassword':return userField(mgr(), body, 'password');
      case 'userBrand':return userField(mgr(), body, 'brand');
      case 'userPa':   return userField(mgr(), body, 'pa');
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
    role: u.role, username: u.username, brand: u.brand || 'all', pa: u.pa || ''
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
    var g = preSaveGuard(incoming, force);
    if (g.block) return json({ blocked: true, error: '안전장치: 데이터 급감 감지로 저장을 막았습니다.', prevCount: g.prevCount, newCount: g.newCount });
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
    return { id: u.id, username: u.username, role: u.role, brand: u.brand, pa: u.pa, createdAt: u.createdAt };
  }) });
}
function userCreate(sess, body) {
  var users = readUsers();
  if (!body.username || !body.password) return json({ error: 'username/password 필요' });
  for (var i = 0; i < users.length; i++) if (users[i].username === body.username) return json({ error: '이미 존재하는 아이디' });
  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  users.push({ id: id, username: body.username, passwordHash: sha256hex(body.password + SALT),
    role: body.role || 'staff', brand: body.brand || 'all', pa: body.pa || '', createdAt: new Date().toISOString() });
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
