/* 모두싸인 서명 요청 E2E
   개발 서버(흉내 모드: 아무 데도 안 나감) + 실제 크롬으로 계약서 생성 창에서 사람이 하듯 입력·클릭한다.
   확인: ✍️ 모두싸인 선택 → 카카오톡(전화번호)으로 서명 요청 → 서버가 받은 계약서·받는 사람·주민번호 칸 요청,
        보낸 목록에 '서명 대기' → 서명 완료되면 '서명 완료'+서명본 링크, 📧 메일 방식은 그대로.
   실행: node test/modusign.e2e.mjs */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { unzip } from './ziplib.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-modusign-e2e');
fs.rmSync(TMP, { recursive: true, force: true });
const LOCAL = path.join(TMP, 'local'); fs.mkdirSync(LOCAL, { recursive: true });
fs.writeFileSync(path.join(LOCAL, 'live-snapshot.json'), JSON.stringify({ brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], step2Rows: [], privacyRows: [], settlements: [] },
] }));
const PORT = 8937;
const srv = spawn(process.execPath, [path.join(REPO, 'dev', 'dev-server.mjs')], { env: { ...process.env, PORT: String(PORT), LOCAL_DIR: LOCAL }, stdio: 'ignore' });
const api = async b => (await fetch(`http://127.0.0.1:${PORT}/api`, { method: 'POST', body: JSON.stringify(b) })).json();
for (let i = 0; ; i++) { try { await api({ action: 'rev' }); break; } catch { if (i > 40) throw new Error('개발 서버 기동 실패'); await new Promise(r => setTimeout(r, 250)); } }
const db = () => { try { return JSON.parse(fs.readFileSync(path.join(LOCAL, 'modusign.json'), 'utf8')); } catch { return []; } };

/* ── 크롬 (CDP) ── */
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof');
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9337',
  '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { const j = await (await fetch('http://127.0.0.1:9337/json/version')).json(); return j.webSocketDebuggerUrl; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('크롬 기동 실패');
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const waiters = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId; waiters.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const evalJs = async (expr) => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 오류: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr, label, ms = 25000) {
  const t0 = Date.now();
  for (;;) {
    if (await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return;
    if (Date.now() - t0 > ms) throw new Error('시간초과: ' + label);
    await new Promise(r => setTimeout(r, 250));
  }
}
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const clickBtn = t => evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(t)})).click(), 1`);
const txt = () => evalJs(`document.body.innerText`);
const fill = (o) => evalJs(`(()=>{
  const set=(el,v)=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
                      el.dispatchEvent(new Event('input',{bubbles:true})); };
  const ins=[...document.querySelectorAll('input')].filter(i=>i.type!=='file');
  const by=ph=>ins.find(i=>(i.placeholder||'').includes(ph));
  const o=${JSON.stringify(o)};
  if('name' in o) set(by('홍길동'),o.name);
  if('phone' in o) set(by('010-1234-5678'),o.phone);
  if('addr' in o) set(by('서울특별시'),o.addr);
  if('fee' in o) set(by('800000'),o.fee);
  if('email' in o) set(by('model@example.com'),o.email);
  set(document.querySelector('input[type=date]'),'2026-09-21');
  return 1;
})()`);
const listItems = () => evalJs(`[...document.querySelectorAll('.ms-item')].map(x=>x.innerText.replace(/\\s+/g,' ').trim())`);

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`document.querySelector('.contract-link')`, '앱 로딩');
await evalJs(`(window.__cf=[],window.confirm=m=>{window.__cf.push(m);return true},1)`);
await evalJs(`document.querySelector('.contract-link').click(), 1`);
await waitFor(`document.querySelector('.ct-via')`, '계약서 생성 창');

console.log('\n[기본] 📧 메일 방식이 기본 · 기존 화면 그대로');
chk((await txt()).includes('받는 사람 이메일') && (await txt()).includes('메일 보내기'), '메일 방식: 이메일 칸·메일 보내기 버튼');
chk(!(await evalJs(`!!document.querySelector('.ms-list')`)), '메일 방식엔 서명 요청 목록 없음');

console.log('\n[모두싸인] 선택 → 받는 방법·목록');
await clickBtn('✍️ 모두싸인'); await waitFor(`document.querySelector('.ms-list')`, '모두싸인 화면');
await waitFor(`document.querySelector('.ms-list').innerText.includes('아직 없음')`, '빈 목록');
chk((await txt()).includes('카카오톡 (전화번호)') && (await txt()).includes('서명 요청 보내기'), '받는 방법(카카오톡/이메일)·서명 요청 버튼');
chk(!(await txt()).includes('메일 보내기'), '메일 보내기 버튼은 숨김');

console.log('\n[막기] 전화번호 없으면 안 보냄');
await fill({ name: '김하늘', phone: '', addr: '서울특별시 강남구 테헤란로 1', fee: '800000' });
await clickBtn('서명 요청 보내기'); await wait(500);
chk((await txt()).includes('휴대폰 번호를 전화번호 칸에'), '전화번호 없으면 경고');
chk(db().length === 0, '요청 안 감');

console.log('\n[발송] 카카오톡으로 서명 요청');
await fill({ phone: '010-9999-8888' });
await clickBtn('서명 요청 보내기');
await waitFor(`document.body.innerText.includes('김하늘 님에게 서명 요청을 보냈습니다')`, '발송 완료 안내');
chk((await evalJs('window.__cf.length')) === 1 && /카카오톡 010-9999-8888/.test(await evalJs('window.__cf[0]')), '보내기 전 확인창(받는 곳 표시)', await evalJs('window.__cf'));
const r0 = db()[0] || {};
chk(r0.method === 'KAKAO' && r0.to === '01099998888', '카카오톡·숫자만 번호로 요청', r0);
chk(r0.brand === 'basetune' && r0.name === '김하늘' && r0.date === '2026-09-21', '브랜드·이름·계약일자 기록', r0);
chk(r0.placement === '서명+주민번호', '주민번호를 비워 보내면 모델이 서명 화면에서 입력', r0.placement);
chk(/광고모델계약서_김하늘/.test(r0.title || ''), '문서 제목 = 계약서 파일명', r0.title);
let xml = '';
try { xml = unzip(fs.readFileSync(path.join(LOCAL, 'modusign-signed', r0.id + '.docx')))['word/document.xml'].toString('utf8').replace(/<[^>]+>/g, ''); } catch (e) { chk(false, '보낸 계약서 풀기: ' + e.message); }
chk(xml.includes('김하늘') && xml.includes('800,000') && xml.includes('010-9999-8888'), '보낸 파일 = 값 채운 계약서');
chk(xml.includes('서명을 갈음합니다.') && xml.includes('주민등록번호:'), '서명 자리 기준 문구가 계약서에 있음');
await waitFor(`document.querySelectorAll('.ms-item').length===1`, '목록 갱신');
let li = await listItems();
chk(/김하늘/.test(li[0]) && /서명 대기/.test(li[0]) && !/서명본/.test(li[0]), '목록: 김하늘 · 서명 대기', li);

console.log('\n[완료] 서명 끝나면 서명 완료 + 서명본 링크');
await api({ action: '_msMockSign', id: r0.id, status: 'COMPLETED' });
await clickBtn('↻ 새로고침'); await wait(600);
li = await listItems();
chk(/서명 완료/.test(li[0]) && /서명본/.test(li[0]), '목록: 서명 완료 · 서명본', li);

console.log('\n[이메일로] 주민번호 채워 보내면 서명만');
await evalJs(`(()=>{const r=[...document.querySelectorAll('input[name=ms-how]')][1];r.click();return 1})()`); await wait(200);
await evalJs(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('비워두면'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'900101-1234567');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await fill({ name: '박바다', email: 'sea@example.com' });
await clickBtn('서명 요청 보내기');
await waitFor(`document.body.innerText.includes('박바다 님에게 서명 요청을 보냈습니다')`, '이메일 발송 안내');
const r1 = db()[1] || {};
chk(r1.method === 'EMAIL' && r1.to === 'sea@example.com' && r1.placement === '서명', '이메일·서명 자리만', r1);
await waitFor(`document.querySelectorAll('.ms-item').length===2`, '목록 2건');
li = await listItems();
chk(/박바다/.test(li[0]) && /김하늘/.test(li[1]), '최근 보낸 건이 위', li);

console.log('\n[기억] 다시 열면 마지막 방식(모두싸인)');
await clickBtn('닫기'); await wait(200);
await evalJs(`document.querySelector('.contract-link').click(), 1`);
await waitFor(`document.querySelector('.ct-via')`, '다시 열기');
chk(await evalJs(`!!document.querySelector('.ms-list')`), '모두싸인 방식으로 열림');
await clickBtn('📧 메일'); await wait(200);
chk((await txt()).includes('메일 보내기'), '메일로 되돌리면 기존 버튼');

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
srv.kill();
process.exit(fail ? 1 : 0);
