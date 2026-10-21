/* 이름 → 인스타 계정명 1회 이관(2026-10-16) — node test/name-handle-mig.test.mjs
   성사 전만 바꾸고, 성사 이후·출고/영상검수/개인정보와 이름으로 이어진 사람은 그대로. 원래 이름은 nameBefore. 두 번째엔 안 돎. */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const H = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const grab = (head) => { const a = H.indexOf(head); if (a < 0) throw new Error('없음: ' + head);
  const m = H.slice(a + head.length).search(/\n(function |const |\/\/|\/\*)/); return H.slice(a, a + head.length + m); };
const ctx = { today: () => '26.10.16' };
vm.runInNewContext(['const IG_RESERVED', 'function igHandle(', 'function migNameToHandle('].map(grab).join('\n') + '\nthis.mig=migNameToHandle;', ctx);
let fail = 0;
const chk = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
const R = (id, name, u, x = {}) => ({ id, name, username: u, link: `https://www.instagram.com/${u}/`, ...x });
const b = {
  step1Rows: [R('l1', '양깨비 | 탭핏', 'yangkkaebi'), R('l2', '성사한분', 'deal_one'), { id: 'l3', name: '링크만', link: 'https://www.instagram.com/link_only/?utm_source=x' }],
  step2Rows: [R('s1', '성사한분', 'deal_one', { dealDone: 'Y' }), R('s2', '출고된분', 'shipped_one'), R('s3', 'same_name', 'same_name'), R('s4', 'sora', 'sora_x'), R('s5', '출고 된 분', 'spaced_one')],
  claudeStep2Rows: [R('c1', '자동 대기 | 일상', 'auto_wait'), R('c2', '정산끝', 'paid_one', { infSettled: 'Y' })],
  shippingRows: [{ id: 'sh', channelName: '출고된분' }, { id: 'sh2', channelName: 'ora' }, { id: 'sh3', channelName: '출고된분 ' }], reviewRows: [], privacyRows: [],
};
const { b: o, n } = ctx.mig(b);
const nm = (k, id) => o[k].find((r) => r.id === id).name;
chk(nm('step1Rows', 'l1') === 'yangkkaebi' && o.step1Rows[0].nameBefore === '양깨비 | 탭핏', '리스트업: 계정명으로 · 원래 이름은 nameBefore');
chk(nm('step1Rows', 'l3') === 'link_only', '아이디 칸 없으면 링크에서');
chk(nm('claudeStep2Rows', 'c1') === 'auto_wait', '자동화 성사 전: 바뀜');
chk(nm('step2Rows', 's1') === '성사한분' && nm('step1Rows', 'l2') === '성사한분', '성사한 사람(+같은 이름 리스트업)은 그대로');
chk(nm('step2Rows', 's2') === '출고된분', '출고 기록과 이름으로 이어진 사람은 그대로');
chk(nm('claudeStep2Rows', 'c2') === '정산끝', '정산 끝난 사람은 그대로');
chk(nm('step2Rows', 's4') === 'sora_x', '글자 s 를 지우지 않음(sora ≠ 출고의 ora)', nm('step2Rows', 's4'));
chk(nm('step2Rows', 's5') === '출고 된 분', '공백만 다른 출고 이름이면 그대로', nm('step2Rows', 's5'));
chk(n === 4 && o.nameHandleMig === '26.10.16', '4명 · 이관 표시', { n, m: o.nameHandleMig });
chk(ctx.mig(o).n === 0, '두 번째엔 안 돎');
console.log(fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'); process.exit(fail ? 1 : 0);
