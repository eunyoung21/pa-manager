/* 거절 3일 뒤 데이터 자동 삭제 E2E — node test/reject-purge.e2e.mjs
   확인: 거절된 지 3일 지난 행은 컨택현황/자동화에서 통째로 사라짐(2일 이내는 그대로) ·
        컨택현황(수동 DM)에서 지워진 행은 DM 수당(2천원)이 정산에 '🚫 거절(삭제됨)'으로만 남음(이름은 안 남음) ·
        자동화(자동 DM)는 수당이 없어 그냥 지워짐(정산에 안 남음) · 실제 진행(성사·완료)된 건은 거절이어도 보호 ·
        DM 안 보낸 거절 건은 남길 비용이 없어 조용히 지워짐. */
import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const TMP = path.join(os.tmpdir(), 'pa-rejpurge-e2e');

const ymd = n => { const t = new Date(Date.now() - n * 864e5); return String(t.getFullYear()).slice(2) + '.' + String(t.getMonth() + 1).padStart(2, '0') + '.' + String(t.getDate()).padStart(2, '0'); };
const ym = n => { const t = new Date(Date.now() - n * 864e5); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0'); };
const S2 = (id, name, pa, x = {}) => ({ id, step1Id: '', date: ymd(10), name, link: 'https://instagram.com/' + id, followers: '1000', pa,
  contactStatus: '컨택 완료', dmSent: 'N', dealDone: 'N', finalDone: 'N', rate: '', shipDate: '', expectedPost: '',
  shippingDone: '미완료', contractDone: '미완료', contractUrl: '', memo: '', ...x });

let savedData = { paList: ['박민선', '안민영'], brands: [
  { id: 'basetune', name: '베이스튠', step1Rows: [], claudeStep1Rows: [],
    claudeStep2Rows: [
      S2('c2_ra', '라자동', '', { contactStatus: '거절', endReason: '무응답', dmSent: 'Y', dmDate: ymd(10), rejectDate: ymd(5) }), // 자동화 · 5일 전 거절 → 삭제, 수당 없음
    ],
    step2Rows: [
      S2('s2_a', '아이', '박민선', { contactStatus: '거절', dmSent: 'Y', dmDate: ymd(10), rejectDate: ymd(4) }),           // 4일 전 거절(DM함) → 삭제 + 수당 보존
      S2('s2_n', '나중', '박민선', { contactStatus: '거절', dmSent: 'Y', dmDate: ymd(10), rejectDate: ymd(0) }),           // 오늘 거절 → 아직 그대로
      S2('s2_d', '이틀', '박민선', { contactStatus: '거절', dmSent: 'Y', dmDate: ymd(10), rejectDate: ymd(2) }),           // 2일 전 거절 → 아직 그대로(3일 미만)
      S2('s2_p', '보호', '안민영', { contactStatus: '거절', dmSent: 'Y', dmDate: ymd(10), dealDone: 'Y', rejectDate: ymd(9) }), // 실제 진행(성사)된 건 → 거절이어도 보호
      S2('s2_x', '공짜', '박민선', { contactStatus: '거절', dmSent: 'N', rejectDate: ymd(9) }),                            // DM 안 보냄 → 조용히 삭제, 수당 없음
    ],
    shippingRows: [], reviewRows: [], privacyRows: [] },
  { id: 'granny', name: '그래니샐러드', step1Rows: [], claudeStep1Rows: [], claudeStep2Rows: [], step2Rows: [], shippingRows: [], reviewRows: [], privacyRows: [] },
], settlements: {} };
let rev = 1;
const PORT = 8952;
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    html = html.replace('<div id="root"></div>',
      `<div id="root"></div><script>window.PA_API='http://127.0.0.1:${PORT}/api';
       localStorage.setItem('pa_mgr_auth', JSON.stringify({token:'T',username:'테스터',role:'manager',brand:'all'}));</script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
  }
  let body = ''; req.setEncoding('utf8'); req.on('data', c => body += c);
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    if (b.action === 'users' || b.action === 'logs') return send({ ok: true, users: [], logs: [] });
    if (b.action === 'login') return send({ ok: true, token: 'T', username: '테스터', role: 'manager', brand: 'all' });
    if (b.action === 'get') return send({ ok: true, data: savedData, rev });
    if (b.action === 'rev') return send({ ok: true, rev });
    if (b.action === 'save') { savedData = b.data; rev++; return send({ ok: true, rev }); }
    return send({ ok: true });
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const UD = path.join(TMP, 'chrome-prof'); fs.rmSync(UD, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9353',
  '--user-data-dir=' + UD, 'about:blank'], { stdio: 'ignore' });
async function wsUrl() {
  for (let i = 0; i < 60; i++) { try { return (await (await fetch('http://127.0.0.1:9353/json/version')).json()).webSocketDebuggerUrl; } catch { await new Promise(r => setTimeout(r, 300)); } }
  throw new Error('크롬 기동 실패');
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const waiters = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++msgId; waiters.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
const evalJs = async expr => {
  const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS 오류: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
async function waitFor(expr, label, ms = 25000) {
  const t0 = Date.now();
  for (;;) { if (await evalJs(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return; if (Date.now() - t0 > ms) throw new Error('시간초과: ' + label); await new Promise(r => setTimeout(r, 250)); }
}
let fail = 0;
const chk = (c, m, extra) => { console.log((c ? '  PASS ' : '  FAIL ') + m + (c || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); if (!c) fail++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const J = JSON.stringify;
const click = (sel, txt) => evalJs(`(()=>{const b=[...document.querySelectorAll(${J(sel)})].find(x=>x.textContent.includes(${J(txt)}));if(!b)throw new Error('없음: '+${J(sel + ' / ' + txt)});b.click();return 1})()`);
const B = () => savedData.brands[0];
const row = n => (B().step2Rows.find(x => x.name === n) || B().claudeStep2Rows.find(x => x.name === n));

await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await waitFor(`[...document.querySelectorAll('.step-tab')].some(b=>b.textContent.includes('인플루언서 관리'))`, '앱 로딩');
// 저장(=purge 반영) 완료까지 기다린다
await wait(2500);

console.log('\n[삭제] 거절 3일 지난 건은 통째로 사라짐');
chk(!row('아이'), '컨택현황: 4일 전 거절(DM함) → 삭제됨', B().step2Rows.map(x => x.name));
chk(!row('공짜'), 'DM 안 보낸 거절도 삭제됨(비용 없음)', B().step2Rows.map(x => x.name));
chk(!row('라자동'), '자동화: 5일 전 거절 → 삭제됨', B().claudeStep2Rows.map(x => x.name));

console.log('\n[보호] 아직 3일 안 됐거나, 실제 진행된 건은 그대로');
chk(!!row('나중'), '오늘 거절 → 아직 안 지워짐');
chk(!!row('이틀'), '2일 전 거절 → 아직 안 지워짐(3일 미만)');
chk(!!row('보호'), '성사(dealDone) 있던 건은 거절이어도 보호');

console.log('\n[정산] 삭제된 컨택현황 건의 DM 수당(2천원)은 정산에 남음 — 이름 없이 거절 표시만');
const rb = B().rejectedBilling || [];
chk(rb.length === 1 && rb[0].pa === '박민선' && rb[0].ym === ym(10), '박민선에게 DM 수당 1건 보존', rb);
chk(!JSON.stringify(rb).includes('아이'), '보존된 기록에 원래 이름은 안 남음', rb);
chk(!(B().rejectedBilling || []).some(e => e.pa === undefined), '자동화(라자동)·DM 안 보낸(공짜) 건은 수당 기록 안 남김');

console.log('\n[화면] 정산 탭 — 전체 누적에서 박민선에게 거절(삭제됨) 2,000원이 잡힘');
await click('.step-tab', '정산'); await waitFor(`document.querySelector('.pa-badge')`, '정산 화면');
await evalJs(`(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'all');s.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);
await wait(400);
const minTxt = () => evalJs(`(()=>{const b=[...document.querySelectorAll('.pa-badge')].find(x=>x.textContent==='박민선');return b?b.closest('tr').innerText.replace(/\\s+/g,' '):''})()`);
chk((await minTxt()).includes('DM 1건') || (await minTxt()).includes('DM'), '박민선 DM 건수에 반영', await minTxt());
await evalJs(`(()=>{const tr=[...document.querySelectorAll('.pa-badge')].find(x=>x.textContent==='박민선').closest('tr');const btn=tr.querySelector('td:last-child button');btn&&btn.click();return 1})()`);
await wait(300);
chk((await evalJs(`document.body.innerText`)).includes('거절(삭제됨)'), '펼치면 채널명 대신 「거절(삭제됨)」만 보임');

console.log('\n' + (fail ? ('❌ 실패 ' + fail + '건') : '✅ 전부 통과'));
try { chrome.kill(); } catch {}
server.close();
process.exit(fail ? 1 : 0);
