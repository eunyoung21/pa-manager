/* 개발 서버 — 라이브(구글시트)에 절대 쓰지 않는다.
   _local/live-snapshot.json(읽기전용 스냅샷)을 메모리에 올려 Apps Script 흉내를 내고,
   저장은 _local/dev-data.json 에만 남긴다. 스냅샷 갱신: node dev/snapshot-live.mjs */
import fs from 'fs';
import http from 'http';
import path from 'path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const LOCAL = process.env.LOCAL_DIR ? path.resolve(process.env.LOCAL_DIR) : path.join(ROOT, '_local'); // 테스트는 임시 폴더로
const SITE = process.env.SITE ? path.resolve(process.env.SITE) : ROOT; // 다른 저장소의 index.html 을 같은 스냅샷으로 띄울 때
const PORT = Number(process.env.PORT || 8930);
const DEV = path.join(LOCAL, process.env.SITE ? 'dev-data-site.json' : 'dev-data.json');

let data = JSON.parse(fs.readFileSync(fs.existsSync(DEV) ? DEV : path.join(LOCAL, 'live-snapshot.json'), 'utf8'));
if (data.data) data = data.data;           // 스냅샷 형식 {meta,data}
// 브랜드 계약서 양식(.docx)은 라이브 드라이브에 있어 여기선 못 읽는다 — _local/pfiles/<id> 에 받아둔 것만 쓰고,
// 없으면 양식 지정을 빼서 앱 기본 양식으로 만들게 한다(개발 서버 화면에서만. 라이브 데이터는 그대로).
const PF = path.join(LOCAL, 'pfiles');
for (const b of data.brands || []) { const id = String(b.contractTemplate?.url || '').match(/id=(\d+)/)?.[1]; if (id && !fs.existsSync(path.join(PF, id))) b.contractTemplate = null; }
let rev = 1;

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x');
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const p = path.join(SITE, file);
    if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(p);
    if (file === 'index.html') {
      body = body.toString('utf8').replace('<div id="root"></div>',
        `<div id="root"></div><script>window.PA_API="http://127.0.0.1:${PORT}/api";` +
        `if(!localStorage.getItem("pa_mgr_auth"))localStorage.setItem("pa_mgr_auth",JSON.stringify({ok:true,token:"DEV",username:"admin",role:"manager",brand:"all"}));</script>`);
    }
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  let raw = ''; req.setEncoding('utf8'); req.on('data', c => raw += c);
  req.on('end', async () => {
    const b = JSON.parse(raw || '{}');
    const send = o => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
    switch (b.action) {
      case 'login': return send({ ok: true, token: 'DEV', username: b.username || 'admin', role: 'manager', brand: 'all' });
      case 'get': return send({ ok: true, data, rev });
      case 'rev': return send({ ok: true, rev });
      case 'save':
        data = b.data; rev++;
        fs.writeFileSync(DEV, JSON.stringify(data));
        return send({ ok: true, rev });
      case 'users': return send({ ok: true, users: [] });
      case 'logs': return send({ ok: true, logs: [] });
      case 'pfileGet': {
        const f = path.join(PF, String(b.id || '').replace(/[^0-9]/g, ''));
        if (fs.existsSync(f)) return send({ ok: true, dataUrl: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + fs.readFileSync(f).toString('base64') });
        return send({ ok: false, error: '개발 서버: 첨부 미리보기 없음' });
      }
      // 복사본은 실제 메일을 절대 안 보낸다 — 흉내만 내고 화면에도 '실제로 안 나감'을 표시한다.
      case 'contractMail':
        console.log(`[모의] 메일 발송 — 받는 사람: ${b.to}  제목: ${b.subject}`);
        return send({ ok: true, to: b.to, from: 'dev-mock@localhost', mock: true });
      default: return send({ ok: true });
    }
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`PA Manager v2 dev → http://127.0.0.1:${PORT}  (라이브 쓰기 없음)`));
