/* 라이브 드라이브(PA-Manager-pfiles)에서 브랜드 계약서 양식(.docx)을 읽기 전용으로 받아 _local/pfiles/<id> 에 둔다.
   개발 서버의 pfileGet 이 이걸 돌려준다(복사본에서도 실제 양식으로 계약서가 만들어지게). 드라이브엔 아무것도 안 쓴다. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const sa = JSON.parse(fs.readFileSync('D:/Git/cafe24-gsheet-automation/credentials.json', 'utf8'));
const OUT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''), '_local');
const b64url = s => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + head + '.' + claim + '.' + sig })).json()).access_token;
const H = { Authorization: 'Bearer ' + tok };

const snap = JSON.parse(fs.readFileSync(path.join(OUT, 'live-snapshot.json'), 'utf8'));
const data = snap.data || snap;
fs.mkdirSync(path.join(OUT, 'pfiles'), { recursive: true });
for (const b of data.brands || []) {
  const id = String(b.contractTemplate?.url || '').match(/id=(\d+)/)?.[1];
  if (!id) continue;
  const q = encodeURIComponent(`name='${id}' and trashed=false`);
  const list = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: H })).json();
  const f = list.files?.[0];
  if (!f) { console.log(b.id, id, '— 서비스계정이 못 찾음', JSON.stringify(list).slice(0, 200)); continue; }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: H });
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(path.join(OUT, 'pfiles', id), buf);
  console.log(b.id, id, f.mimeType, buf.length + 'B', '→ _local/pfiles/' + id);
}
