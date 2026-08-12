// PA Manager 라이브 데이터를 로컬 pa-live.json 으로 저장.
//
// 2026-08-12: 백엔드 이전에 맞춰 재작성.
//   이전: Render(Supabase) /api/data 를 하드코딩 시크릿으로 서명한 토큰으로 GET
//   지금: Apps Script + 구글시트가 라이브. Render 는 삭제됨(404).
//   옛 코드는 이전 이후로도 Render 를 읽고 있어서 "라이브"라며 낡은 스냅샷을
//   뽑아냈다. 시크릿을 코드에 박아 공개 저장소에 올린 것도 함께 제거.
//
// 쓰는 법:  set PA_USER=아이디 && set PA_PASS=비밀번호 && node 1-fetch-live.js
//           (비밀번호를 코드·파일에 적지 말 것. 환경변수로만 넘긴다)

const fs = require('fs');

const API = process.env.PA_API ||
  'https://script.google.com/macros/s/AKfycbwwp47BTl9wez0G0svmEkJJTvfjrZv3pRmpqoYi_ozZ7Emfowvd7Jp9qYY1QZf8LGJiOQ/exec';
const USER = process.env.PA_USER || '';
const PASS = process.env.PA_PASS || '';

async function call(payload) {
  const r = await fetch(API, {
    method: 'POST',
    // Apps Script 웹앱은 CORS 프리플라이트를 못 받는다 → text/plain 으로 보낸다
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}

(async () => {
  if (!USER || !PASS) {
    console.error('PA_USER / PA_PASS 환경변수가 필요합니다.');
    console.error('예)  set PA_USER=admin && set PA_PASS=***** && node 1-fetch-live.js');
    process.exit(1);
  }
  const { token } = await call({ action: 'login', username: USER, password: PASS });
  if (!token) throw new Error('로그인 실패 — 토큰을 받지 못했습니다.');

  const j = await call({ action: 'get', token });
  const data = j.data || j;                       // 응답 형태가 바뀌어도 견디게
  fs.writeFileSync(__dirname + '/pa-live.json', JSON.stringify(data));

  const brands = (data.brands || [])
    .map(b => `${b.name}: s1=${(b.step1Rows || []).length} s2=${(b.step2Rows || []).length}`)
    .join(' | ');
  console.log('저장됨 pa-live.json |', brands, '| paList', (data.paList || []).length);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
