// PA Manager 라이브 데이터(Supabase id=1)를 로컬 pa-live.json 으로 저장.
// TOKEN_SECRET 기본값으로 관리자 토큰을 만들어 라이브 /api/data 를 인증 GET 한다.
const crypto = require('crypto');
const fs = require('path');
const SECRET = process.env.TOKEN_SECRET || 'pa_mgr_token_secret_2024_ey';
const BASE = 'https://pa-manager.onrender.com';

(async () => {
  const expires = Date.now() + 3600 * 1000;
  const payload = `admin|manager|all|${expires}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}|${sig}`).toString('base64');
  const r = await fetch(BASE + '/api/data', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { console.error('fetch fail', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const j = await r.json();
  require('fs').writeFileSync(__dirname + '/pa-live.json', JSON.stringify(j));
  const brands = (j.brands || []).map(b => `${b.name}: s1=${(b.step1Rows||[]).length} s2=${(b.step2Rows||[]).length}`).join(' | ');
  console.log('저장됨 pa-live.json |', brands, '| paList', (j.paList||[]).length);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
