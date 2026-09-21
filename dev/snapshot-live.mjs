/* 라이브 구글시트(_appdata)를 읽기 전용으로 받아 _local/ 에 스냅샷한다.
   시트에는 아무것도 쓰지 않는다(스코프도 readonly). 개발 서버는 이 스냅샷만 본다. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SHEET = '1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc';
const sa = JSON.parse(fs.readFileSync('D:/Git/cafe24-gsheet-automation/credentials.json', 'utf8'));
const OUT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''), '_local');

const b64url = s => Buffer.from(s).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key, 'base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + head + '.' + claim + '.' + sig })).json()).access_token;

const get = async range => (await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${encodeURIComponent(range)}`,
  { headers: { Authorization: 'Bearer ' + tok } })).json()).values || [];

const chunks = await get('_appdata!A:A');
const meta = await get('_meta!A1:A4');
const data = JSON.parse(chunks.map(r => r[0] || '').join(''));

fs.mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
const body = JSON.stringify({ meta: meta.map(r => r[0]), data });
fs.writeFileSync(path.join(OUT, `live-${stamp}.json`), body);
fs.writeFileSync(path.join(OUT, 'live-snapshot.json'), body);

console.log('rev', meta[0]?.[0], '· 저장', meta[2]?.[0]);
for (const b of data.brands || [])
  console.log(b.name, ['step1Rows', 'step2Rows', 'shippingRows', 'reviewRows', 'privacyRows'].map(k => k.replace('Rows', '') + ' ' + (b[k] || []).length).join(' · '));
console.log('paList', JSON.stringify(data.paList));
