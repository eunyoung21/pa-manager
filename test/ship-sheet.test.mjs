/* 출고 요청 시트 자동 기입(Code.gs shipSheetAppend) 단위 테스트 — node test/ship-sheet.test.mjs
   구글 시트·잠금·속성을 가짜로 만들어 Code.gs 를 그대로 실행한다(2026-11-23).
   위치(맨 아래)·서식 복사·중복 막기·송장칸 안 건드림·'=' 글자 고정·오류 안내를 본다. */
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const code = fs.readFileSync(path.join(REPO, 'apps-script/Code.gs'), 'utf8');

const tzParts = (d, o) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', ...o }).format(d);
const Utilities = {
  formatDate(d, tz, pat) {
    const y = tzParts(d, { year: 'numeric' }), m = Number(tzParts(d, { month: 'numeric' })), dd = Number(tzParts(d, { day: 'numeric' }));
    const p2 = (n) => ('0' + n).slice(-2);
    const hh = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(d));
    if (pat === 'H') return String(hh);
    return pat.replace('yyyy', y).replace('MM', p2(m)).replace('dd', p2(dd)).replace(/\bM\b/, String(m)).replace(/\bd\b/, String(dd));
  },
  parseDate(s) { return new Date(s + 'T00:00:00+09:00'); },
};

function makeSheet(grid, maxRows) {
  // grid: 행(1부터)별 [{v,fmt}] 9칸
  const cell = (r, c) => { grid[r] = grid[r] || []; return (grid[r][c - 1] = grid[r][c - 1] || { v: '', fmt: 'General' }); };
  const disp = (x) => (x.v instanceof Date ? Utilities.formatDate(x.v, 'x', 'yyyy-MM-dd') : String(x.v ?? ''));
  const sh = {
    _grid: grid, _max: maxRows || 1000,
    getLastRow() { let l = 0; Object.keys(grid).forEach((r) => { if ((grid[r] || []).some((x) => x && x.v !== '')) l = Math.max(l, Number(r)); }); return l; },
    getMaxRows() { return sh._max; },
    insertRowsAfter(_, n) { sh._max += n; },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => disp(cell(r + i, c + j)))),
        getValue: () => cell(r, c).v,
        getDisplayValue: () => disp(cell(r, c)),
        setNumberFormat(f) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) cell(r + i, c + j).fmt = f; return this; },
        setValue(v) { cell(r, c).v = v; return this; },
        setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => { cell(r + i, c + j).v = v; })); return this; },
        copyTo(dst, type) { if (String(type) === 'FORMAT') for (let j = 0; j < nc; j++) dst._set && dst._set(j, cell(r, c + j).fmt); },
        _set(j, f) { cell(r, c + j).fmt = f; },
      };
    },
  };
  return sh;
}
const hdr = ['출고요청일', '요청자 성함', '출고 요청 사유', '수령자명', '수령자연락처', '주소', '상품명', '출고 송장번호', '비고'];
function build({ dateAsText, rows = 2, headerAt = 4 } = {}) {
  const g = {};
  const put = (r, arr, fmt) => { g[r] = arr.map((v) => ({ v, fmt: fmt || 'General' })); };
  put(1, ['', '', '', '', '', '', '', '', '']); g[2] = [{ v: '당일 출고 12시 마감', fmt: 'General' }];
  for (let r = 3; r < headerAt; r++) g[r] = [{ v: '안내 문구', fmt: 'General' }];
  put(headerAt, hdr);
  const day = new Date('2026-11-20T00:00:00+09:00');
  for (let i = 0; i < rows; i++) put(headerAt + 1 + i, [dateAsText ? '2026. 11. 2' + i : day, '이은영', '협찬', '홍길동' + i, '010-0000-000' + i, '서울시 어딘가 ' + i, '해트케 압력이불 (1)', '', ''], 'General');
  return makeSheet(g);
}

let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };

function run(sheets, body, { openThrows, at } = {}) {
  const RealDate = Date;
  const FakeDate = at ? class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(at); } static now() { return new RealDate(at).getTime(); } static [Symbol.hasInstance](x) { return x instanceof RealDate; } } : RealDate;
  const ctx = {
    console, Utilities, Date: FakeDate, String, Number, Math, JSON, Object, Array, RegExp, Error, Intl,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: {
      CopyPasteType: { PASTE_FORMAT: 'FORMAT', PASTE_DATA_VALIDATION: 'VALIDATION' },
      openById: () => { if (openThrows) throw new Error('접근 권한 없음'); return { getSheetByName: (n) => sheets[n] || null }; },
      flush() {},
    },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return JSON.parse(ctx.shipSheetAppend({}, body).t);
}
const month = Number(tzParts(new Date(), { month: 'numeric' }));
// 오늘(한국 날짜) 오전 1시 — 이 검사들은 돌리는 시각(낮 12시 전후)에 흔들리지 않게 고정
const MORNING = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) + 'T01:00:00+09:00');
const tab = `출고요청(${month}월)`;
const base = { requester: '이은영', recipient: '김모델', phone: '010-1234-5678', address: '부산시 해운대구 1', product: '해트케 압력이불 (1)', reason: '협찬' };
const val = (sh, r, c) => (sh._grid[r] && sh._grid[r][c - 1] ? sh._grid[r][c - 1].v : '');

// 0) 낮 12시(한국 시간) 이후면 출고요청일이 다음 날 — 11:59 는 오늘, 12:00 은 내일, 월말은 다음 달 1일(2026-11-24)
{
  const dstr = (sh) => Utilities.formatDate(val(sh, 7, 1), 'x', 'yyyy-MM-dd');
  const t = (iso) => new Date(iso);
  let sh = build(); let res = run({ [tab]: sh }, base, { at: t('2026-11-24T11:59:00+09:00') });
  chk(res.ok && dstr(sh) === '2026-11-24' && res.date === '2026-11-24', '오전 11:59 요청 → 출고요청일 오늘(24일)', [res, dstr(sh)]);
  sh = build(); res = run({ [tab]: sh }, base, { at: t('2026-11-24T12:00:00+09:00') });
  chk(res.ok && dstr(sh) === '2026-11-25' && res.date === '2026-11-25', '낮 12:00 요청 → 출고요청일 다음 날(25일)', [res, dstr(sh)]);
  sh = build(); res = run({ [tab]: sh }, base, { at: t('2026-11-24T23:30:00+09:00') });
  chk(res.ok && dstr(sh) === '2026-11-25', '밤 23:30 요청 → 25일', dstr(sh));
  sh = build({ dateAsText: true }); res = run({ [tab]: sh }, base, { at: t('2026-11-24T15:00:00+09:00') });
  chk(res.ok && val(sh, 7, 1) === '2026. 11. 25', '글자 날짜 시트도 다음 날(2026. 11. 25)', val(sh, 7, 1));
}
// 1) 날짜 셀 시트: 맨 아래(머리글 4행 + 데이터 2줄 → 7행)에 들어감
{
  const sh = build(); const res = run({ [tab]: sh }, base, { at: MORNING });
  chk(res.ok && res.row === 7 && !res.dup, '맨 아래 빈 줄(7행)에 추가', res);
  chk(val(sh, 7, 4) === '김모델' && val(sh, 7, 5) === '010-1234-5678' && val(sh, 7, 6) === '부산시 해운대구 1' && val(sh, 7, 7) === '해트케 압력이불 (1)', 'D~G 수령자·연락처·주소·상품명');
  chk(val(sh, 7, 2) === '이은영' && val(sh, 7, 3) === '협찬', 'B 요청자 성함 · C 사유(협찬)');
  chk(val(sh, 7, 1) instanceof Date && Utilities.formatDate(val(sh, 7, 1), 'x', 'yyyy-MM-dd') === Utilities.formatDate(new Date(), 'x', 'yyyy-MM-dd'), 'A 출고요청일 = 오늘(날짜 값)', val(sh, 7, 1));
  chk(val(sh, 7, 8) === '' && val(sh, 7, 9) === '', '송장번호(H)·비고(I)는 비어 있음 — 물류가 출고로 오해하지 않게');
  chk(sh._grid[7][4].fmt === '@' && sh._grid[7][5].fmt === '@', '연락처·주소는 글자 서식(앞자리 0 보존)');
  // 같은 건 다시 → 중복으로 안 넣음
  const again = run({ [tab]: sh }, base);
  chk(again.ok && again.dup === true && again.row === 7 && sh.getLastRow() === 7, '같은 건 재요청 → 중복으로 안 넣음', again);
  // 상품 문구만 달라도(수동으로 먼저 옮겨 적은 건) 같은 사람·연락처·주소면 중복
  const diffProd = run({ [tab]: sh }, { ...base, product: '구르미차렵 · 블루 (1)' });
  chk(diffProd.ok && diffProd.dup === true && sh.getLastRow() === 7, '상품 문구가 달라도 같은 사람·연락처·주소면 중복', diffProd);
  // 다른 사람 → 8행
  const res2 = run({ [tab]: sh }, { ...base, recipient: '박다른', phone: '010-9999-0000' });
  chk(res2.ok && res2.row === 8, '다른 사람은 그 다음 줄(8행)', res2);
}
// 2) 송장·비고가 앱에 있으면 H·I 에 넣음
{
  const sh = build(); const res = run({ [tab]: sh }, { ...base, tracking: '1234567890', notes: '문앞에 두세요' });
  chk(res.ok && val(sh, 7, 8) === '1234567890' && val(sh, 7, 9) === '문앞에 두세요', '앱에 송장·비고가 있으면 H·I 에 그대로', res);
}
// 3) 글자 날짜 시트: 위 줄과 같은 모양('2026. 11. 22' → '2026. 11. dd')
{
  const sh = build({ dateAsText: true }); const res = run({ [tab]: sh }, base, { at: MORNING });
  const y = tzParts(new Date(), { year: 'numeric' }), d = Number(tzParts(new Date(), { day: 'numeric' }));
  chk(res.ok && val(sh, 7, 1) === `${y}. ${month}. ${d}`, '글자 날짜는 위 줄과 같은 모양(2026. 11. N)으로', val(sh, 7, 1));
  chk(sh._grid[7][0].fmt === '@', '글자 날짜 칸은 글자 서식(날짜로 안 바뀜)');
}
// 4) 머리글 위치가 달라도(2행) 찾음 / 데이터가 하나도 없어도 머리글 바로 아래
{
  const sh = build({ rows: 0, headerAt: 2 }); const res = run({ [tab]: sh }, base);
  chk(res.ok && res.row === 3, '머리글이 2행이고 데이터가 없으면 3행', res);
}
// 5) '=' 로 시작하는 값도 수식이 안 되게 글자 서식
{
  const sh = build(); run({ [tab]: sh }, { ...base, recipient: '=SUM(1)', address: '+82 서울' });
  chk(sh._grid[7][3].fmt === '@' && sh._grid[7][5].fmt === '@', "'='·'+' 시작 값은 글자 서식으로 고정");
}
// 6) 오류 안내
{
  const noTab = run({}, base); chk(!noTab.ok && /탭이 없어요/.test(noTab.error) && noTab.error.includes(tab), '이번 달 탭이 없으면 안내', noTab);
  const sh = build(); sh._grid[4] = [{ v: '엉뚱', fmt: 'General' }];
  const noHdr = run({ [tab]: sh }, base); chk(!noHdr.ok && /머리글/.test(noHdr.error), '머리글을 못 찾으면 안내', noHdr);
  const perm = run({}, base, { openThrows: true }); chk(!perm.ok && /권한/.test(perm.error), '시트를 못 열면(권한) 안내', perm);
  chk(!run({ [tab]: build() }, { ...base, requester: '' }).ok, '요청자 성함이 없으면 거절');
  chk(!run({ [tab]: build() }, { ...base, address: '' }).ok, '주소가 없으면 거절');
  chk(!run({ [tab]: build() }, { ...base, phone: '' }).ok, '연락처가 없으면 거절');
}
console.log('\n' + (fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
