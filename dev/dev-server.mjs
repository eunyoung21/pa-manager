/* 개발 서버 — 라이브(구글시트)에 절대 쓰지 않는다.
   _local/live-snapshot.json(읽기전용 스냅샷)을 메모리에 올려 Apps Script 흉내를 내고,
   저장은 _local/dev-data.json 에만 남긴다. 스냅샷 갱신: node dev/snapshot-live.mjs */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { makeModusign } from './modusign-dev.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const LOCAL = process.env.LOCAL_DIR ? path.resolve(process.env.LOCAL_DIR) : path.join(ROOT, '_local'); // 테스트는 임시 폴더로
const SITE = process.env.SITE ? path.resolve(process.env.SITE) : ROOT; // 다른 저장소의 index.html 을 같은 스냅샷으로 띄울 때
const PORT = Number(process.env.PORT || 8930);
const DEV = path.join(LOCAL, process.env.SITE ? 'dev-data-site.json' : 'dev-data.json');

let data = JSON.parse(fs.readFileSync(fs.existsSync(DEV) ? DEV : path.join(LOCAL, 'live-snapshot.json'), 'utf8'));
if (data.data) data = data.data;           // 스냅샷 형식 {meta,data}
let rev = 1;
const MS = makeModusign(LOCAL);

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
      case 'modusignSend': return send(await MS.send(b).catch(e => ({ error: String(e.message || e) })));
      case 'modusignList': return send(await MS.list(b).catch(e => ({ error: String(e.message || e) })));
      case '_msMockSign': return send(MS.mockSign(b));
      case 'pfileGet': return send({ ok: false, error: '개발 서버: 첨부 미리보기 없음' });
      default: return send({ ok: true });
    }
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`PA Manager v2 dev → http://127.0.0.1:${PORT}  (라이브 쓰기 없음)` + (MS.isReal() ? ' · 모두싸인 실제 발송 켜짐' : '')));
