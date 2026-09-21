/* Code.gs 모두싸인 부분 단위 테스트 — Apps Script 전역(UrlFetchApp 등)을 흉내 내 실제 코드 그대로 돌린다.
   확인: 인증 헤더(이메일:키 base64) · 요청 본문 · 서명 자리 문구가 없으면 한 단계씩 줄여 재시도 ·
        키 없으면 안내 · 목록 열 때 상태 갱신 · 서명 완료 PDF를 계약서 폴더에 표준 이름·메모로 저장(두 번 안 넣음).
   실행: node test/modusign-gs.test.mjs */
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const code = fs.readFileSync(path.join(REPO, 'apps-script', 'Code.gs'), 'utf8');
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };

function makeEnv({ props, responses }) {
  const calls = [], rows = [], files = [];
  const sheetObj = {
    getLastRow: () => rows.length,
    appendRow: r => rows.push(r.slice()),
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (r, c) => ({ setValue: v => { rows[r - 1][c - 1] = v; } }),
  };
  const folder = {
    getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; },
    createFile: blob => { const f = { name: blob.name, desc: '', getName: () => f.name, getUrl: () => 'https://drive/' + f.name, setDescription: d => { f.desc = d; }, getDescription: () => f.desc }; files.push(f); return f; },
  };
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    Utilities: { base64Encode: s => Buffer.from(s).toString('base64') },
    UrlFetchApp: { fetch: (url, o) => {
      calls.push({ url, o });
      const r = responses.shift() || { code: 500, body: {} };
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body || {}),
        getBlob: () => ({ name: '', setName(n) { this.name = n; return this; } }) };
    } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheetObj, insertSheet: () => sheetObj }) },
    DriveApp: { getFolderById: () => folder },
    ContentService: { createTextOutput: t => ({ setMimeType() { return this; }, text: t }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.logAction = () => {};
  ctx.json = o => o;                       // 결과를 객체 그대로 받는다
  ctx.archiveFolder = () => folder;
  ctx.BRAND_COMPANY_SHORT = { basetune: '드래프터' };
  return { ctx, calls, rows, files };
}
const docx = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEsDBA==';
const P = { MODUSIGN_EMAIL: 'cheddar@dayzcorp.kr', MODUSIGN_KEY: 'KEY123' };
const sess = { username: '안민영' };

console.log('\n[키 없음] 안내');
{ const { ctx } = makeEnv({ props: {}, responses: [] });
  let msg = ''; try { ctx.modusignSend(sess, { name: '김하늘', method: 'KAKAO', to: '010-1234-5678', data: docx }); } catch (e) { msg = e.msg; }
  chk(/API 키가 아직 등록되지/.test(msg), '키 없으면 등록 안내', msg); }

console.log('\n[발송] 첫 시도 성공');
{ const { ctx, calls, rows } = makeEnv({ props: P, responses: [{ code: 200, body: { id: 'D1', status: 'ON_GOING' } }] });
  const r = ctx.modusignSend(sess, { brand: 'basetune', name: '김하늘', method: 'KAKAO', to: '010-1234-5678', data: docx, title: '드래프터_광고모델계약서_김하늘_2026년09월21일.docx', date: '2026-09-21', needRrn: true });
  chk(r.ok && r.id === 'D1' && r.placement === '서명+주민번호', '성공·서명+주민번호', r);
  const c = calls[0]; const b = JSON.parse(c.o.payload);
  chk(c.url === 'https://api.modusign.co.kr/documents' && c.o.method === 'post', 'POST /documents');
  chk(c.o.headers.Authorization === 'Basic ' + Buffer.from('cheddar@dayzcorp.kr:KEY123').toString('base64'), '인증 = 이메일:키 base64');
  chk(b.file.base64 === 'UEsDBA==' && b.file.extension === 'docx', '계약서 워드 파일 그대로');
  chk(b.title === '드래프터_광고모델계약서_김하늘_2026년09월21일', '제목(.docx 뗌)', b.title);
  const p = b.participants[0];
  chk(p.signingMethod.type === 'KAKAO' && p.signingMethod.value === '01012345678' && p.name === '김하늘', '카카오톡·숫자 번호·이름', p);
  chk(p.fields.length === 2 && p.fields[0].type === 'SIGNATURE' && p.fields[1].dataLabel === '주민등록번호', '서명+주민번호 칸');
  chk(rows.length === 2 && rows[1][0] === 'D1' && rows[1][1] === 'basetune' && rows[1][6] === '안민영' && rows[1][10] === '2026-09-21', '기록(누가 보냈는지 포함)', rows); }

console.log('\n[서명 자리] 문구가 없으면 줄여서 재시도');
{ const { ctx, calls } = makeEnv({ props: P, responses: [
    { code: 400, body: { title: 'Anchor text not found in PDF' } },
    { code: 400, body: { title: 'Anchor text not found in PDF' } },
    { code: 200, body: { id: 'D2', status: 'ON_GOING' } }] });
  const r = ctx.modusignSend(sess, { brand: 'granny', name: '박바다', method: 'EMAIL', to: 'sea@example.com', data: docx, needRrn: true });
  chk(r.ok && r.placement === '자리 지정 없음' && calls.length === 3, '서명+주민번호 → 서명 → 자리 없이', r);
  chk(!JSON.parse(calls[2].o.payload).participants[0].fields, '마지막은 자리 지정 없음'); }

console.log('\n[실패] 다른 오류는 재시도 없이 이유 표시');
{ const { ctx, calls, rows } = makeEnv({ props: P, responses: [{ code: 401, body: { title: 'Unauthorized' } }] });
  const r = ctx.modusignSend(sess, { name: '김하늘', method: 'KAKAO', to: '01012345678', data: docx });
  chk(/401/.test(r.error) && /Unauthorized/.test(r.error) && calls.length === 1 && rows.length === 0, '401 → 이유 표시·기록 없음', r); }

console.log('\n[입력 확인]');
{ const { ctx, calls } = makeEnv({ props: P, responses: [] });
  chk(/휴대폰/.test(ctx.modusignSend(sess, { name: 'a', method: 'KAKAO', to: '02-123', data: docx }).error), '잘못된 휴대폰');
  chk(/이메일/.test(ctx.modusignSend(sess, { name: 'a', method: 'EMAIL', to: 'x', data: docx }).error), '잘못된 이메일');
  chk(/파일/.test(ctx.modusignSend(sess, { name: 'a', method: 'KAKAO', to: '01012345678' }).error), '파일 없음');
  chk(calls.length === 0, '모두싸인엔 안 감'); }

console.log('\n[목록] 상태 갱신 + 서명본 드라이브 저장');
{ const env = makeEnv({ props: P, responses: [
    { code: 200, body: { id: 'D1', status: 'ON_GOING' } },                                        // 발송
    { code: 200, body: { id: 'D1', status: 'COMPLETED', file: { downloadUrl: 'https://dl/1' } } }, // 목록: 상태
    { code: 200, body: {} }]});                                                                    // PDF 받기
  env.ctx.modusignSend(sess, { brand: 'basetune', name: '김하늘', method: 'KAKAO', to: '01012345678', data: docx, date: '2026-09-21' });
  const l = env.ctx.modusignList(sess, { brand: 'basetune' });
  const it = l.items[0];
  chk(it.status === 'COMPLETED' && it.driveUrl === 'https://drive/드래프터_광고모델_김하늘_2026년09월21일.pdf', '서명 완료·표준 이름으로 저장', it);
  const memo = JSON.parse(env.files[0].desc);
  chk(memo.s === 'modusign:D1' && memo.k === 'contract' && memo.r === '김하늘' && memo.d === '260921' && memo.b === 'basetune', '노션 자동기입용 메모', memo);
  chk(env.rows[1][7] === 'COMPLETED' && env.rows[1][8].includes('drive'), '시트 기록도 갱신');
  const n = env.calls.length;
  const l2 = env.ctx.modusignList(sess, { brand: 'basetune' });
  chk(env.calls.length === n && l2.items[0].driveUrl && env.files.length === 1, '끝난 건은 다시 조회·저장 안 함');
  chk(env.ctx.modusignList(sess, { brand: 'granny' }).items.length === 0, '다른 브랜드 건은 안 보임'); }

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
