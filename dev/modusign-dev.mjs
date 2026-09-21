/* 개발 서버용 모두싸인 — Apps Script(Code.gs)의 modusignSend·modusignList 와 같은 동작.
   _local/modusign-key.json 에 {"email":"모두싸인 로그인 이메일","key":"API 키"} 가 있으면 실제 모두싸인으로 보낸다(실제 발송 테스트용).
   없으면 흉내만 낸다(아무 데도 안 나감). 기록은 _local/modusign.json, 서명본은 _local/modusign-signed/ 에.
   라이브 시트·드라이브엔 절대 안 쓴다. */
import fs from 'fs';
import path from 'path';

export function makeModusign(LOCAL) {
  const KEY = path.join(LOCAL, 'modusign-key.json');
  const DB = path.join(LOCAL, 'modusign.json');
  const OUT = path.join(LOCAL, 'modusign-signed');
  const readDb = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
  const writeDb = rows => fs.writeFileSync(DB, JSON.stringify(rows, null, 1));
  const cred = () => { try { const c = JSON.parse(fs.readFileSync(KEY, 'utf8')); return c.email && c.key ? c : null; } catch { return null; } };
  const auth = c => 'Basic ' + Buffer.from(c.email + ':' + c.key).toString('base64');
  async function msFetch(method, p, payload) {
    const c = cred();
    const r = await fetch('https://api.modusign.co.kr' + p, { method: method.toUpperCase(),
      headers: { Authorization: auth(c), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined });
    const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {}
    return { code: r.status, body, text };
  }
  const errText = r => r ? String((r.body && (r.body.title || r.body.message)) || r.text || '').slice(0, 200) : '응답 없음';
  function plans(needRrn) {   // Code.gs msFieldPlans 와 같게
    const sig = { type: 'SIGNATURE', dataLabel: '모델 서명', required: true, signatureTypes: ['SIGN'],
      position: { anchor: { text: '서명을 갈음합니다.', offset: { x: 0, y: 0.03 } } }, size: { width: 0.2, height: 0.06 } };
    const rrn = { type: 'TEXT', dataLabel: '주민등록번호', required: true,
      position: { anchor: { text: '주민등록번호:', offset: { x: 0.13, y: 0 } } }, size: { width: 0.25, height: 0.025 },
      textStyle: { size: 10, font: 'NOTO_SANS' } };
    return [...(needRrn ? [{ tag: '서명+주민번호', fields: [sig, rrn] }] : []), { tag: '서명', fields: [sig] }, { tag: '자리 지정 없음', fields: null }];
  }

  async function send(b) {
    const method = b.method === 'EMAIL' ? 'EMAIL' : 'KAKAO';
    let to = String(b.to || '').trim();
    if (method === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { error: '받는 사람 이메일이 올바르지 않습니다.' };
    if (method === 'KAKAO') { to = to.replace(/[^0-9]/g, ''); if (!/^01\d{8,9}$/.test(to)) return { error: '받는 사람 휴대폰 번호가 올바르지 않습니다.' }; }
    const name = String(b.name || '').trim();
    if (!name) return { error: '모델 이름이 없습니다.' };
    const m = String(b.data || '').match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return { error: '계약서 파일이 없습니다.' };
    const title = String(b.title || '').replace(/\.docx$/i, '').trim().slice(0, 100) || ('광고모델계약서_' + name);
    const rec = (id, status, placement) => {
      const rows = readDb();
      rows.push({ id, brand: String(b.brand || ''), name, to, method, sentAt: new Date().toISOString(), by: 'admin', status, driveUrl: '', placement, date: String(b.date || ''), title, mock: !cred() });
      writeDb(rows);
    };
    if (!cred()) {           // 흉내 — 파일은 _local 에 그대로 남겨 확인할 수 있게
      const id = 'mock-' + Date.now();
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, id + '.docx'), Buffer.from(m[2], 'base64'));
      rec(id, 'ON_GOING', plans(!!b.needRrn)[0].tag);
      return { ok: true, id, status: 'ON_GOING', placement: plans(!!b.needRrn)[0].tag, mock: true };
    }
    let last = null;
    for (const pl of plans(!!b.needRrn)) {
      const part = { type: 'SIGNER', name, role: '모델', signingOrder: 1, signingMethod: { type: method, value: to }, locale: 'ko' };
      if (b.message) part.requesterMessage = String(b.message).slice(0, 500);
      if (pl.fields) part.fields = pl.fields;
      const r = await msFetch('post', '/documents', { title, file: { base64: m[2], extension: 'docx' }, participants: [part] });
      if (r.code >= 200 && r.code < 300 && r.body && r.body.id) { rec(r.body.id, r.body.status || 'ON_GOING', pl.tag); return { ok: true, id: r.body.id, status: r.body.status || 'ON_GOING', placement: pl.tag }; }
      last = r;
      console.log('[modusign] 실패', pl.tag, r.code, r.text.slice(0, 300));
      if (!(r.code === 400 && /anchor/i.test(r.text))) break;
    }
    return { error: '모두싸인 요청 실패(' + (last && last.code) + '): ' + errText(last) };
  }

  async function list(b) {
    const brand = String(b.brand || '');
    const rows = readDb();
    const mine = rows.filter(o => !brand || o.brand === brand).reverse().slice(0, 30);
    let checked = 0;
    for (const o of mine) {
      if (checked >= 8 || o.mock) continue;
      const open = o.status === 'ON_GOING' || !o.status;
      if (!open && !(o.status === 'COMPLETED' && !o.driveUrl)) continue;
      checked++;
      const g = await msFetch('get', '/documents/' + encodeURIComponent(o.id));
      if (g.code !== 200 || !g.body) continue;
      if (g.body.status) o.status = g.body.status;
      if (o.status === 'COMPLETED' && !o.driveUrl && g.body.file && g.body.file.downloadUrl) {
        let r = await fetch(g.body.file.downloadUrl);
        if (!r.ok) r = await fetch(g.body.file.downloadUrl, { headers: { Authorization: auth(cred()) } });
        if (r.ok) {
          fs.mkdirSync(OUT, { recursive: true });
          const f = path.join(OUT, (o.title || o.id) + '.pdf');
          fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
          o.driveUrl = 'file:///' + f.replace(/\\/g, '/');
        }
      }
    }
    writeDb(rows);
    return { ok: true, items: mine.map(({ id, name, to, method, sentAt, by, status, driveUrl, placement }) => ({ id, name, to, method, sentAt, by, status, driveUrl, placement })) };
  }

  // 흉내 모드에서 '서명 완료'를 만들어 보는 개발용 동작(테스트용)
  function mockSign(b) {
    const rows = readDb(); const o = rows.find(x => x.id === b.id);
    if (!o) return { error: 'no doc' };
    o.status = b.status || 'COMPLETED'; if (o.status === 'COMPLETED') o.driveUrl = 'https://drive.google.com/mock/' + o.id;
    writeDb(rows); return { ok: true };
  }
  return { send, list, mockSign, isReal: () => !!cred() };
}
