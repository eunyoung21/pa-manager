/* DM 후 7일 무응답 → 자동 거절 (2026-10-14: 14일·8월 한정 → 7일·항상)
   index.html 의 isNoReply·sweepNoReply 를 그대로 꺼내 실행한다. 실행: node test/no-reply-7d.test.mjs */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\//, ''));
const H = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
// 최상위 함수 하나를 통째로 잘라낸다(다음 줄이 최상위 선언으로 시작하는 곳까지)
const grab = (head) => { const a = H.indexOf(head); if (a < 0) throw new Error('없음: ' + head);
  const m = H.slice(a + head.length).search(/\n(function |const |\/\/|\/\*)/); return H.slice(a, a + head.length + m); };
const src = ['function normStatus(', 'function parseDateKey(', 'const NO_REPLY_DAYS', 'const NO_REPLY_DM_UNTIL',
  'function isNoReply(', 'function noReplyCutKey(', 'function sweepNoReply('].map(grab).join('\n');
const ctx = { today: () => '26.10.14' };
vm.runInNewContext(src + '\nthis.sweepNoReply=sweepNoReply;this.NO_REPLY_DAYS=NO_REPLY_DAYS;', ctx);

let fail = 0;
const chk = (c, m, x) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const R = (id, days, x = {}) => ({ id, name: id, dmSent: 'Y', dmDate: ago(days), contactStatus: '컨택 완료', ...x });

chk(ctx.NO_REPLY_DAYS === 7, '기준 7일');
const b = { step2Rows: [R('d8', 8), R('d7', 7), R('d6', 6), R('d30', 30), R('rep', 20, { replied: 'Y' }), R('deal', 20, { dealDone: 'Y' }),
  R('imp', 20, { importedFrom: 'hattke' }), R('talk', 20, { contactStatus: '진행중' })],
  claudeStep2Rows: [R('a8', 8, { contactStatus: '컨택 중' }), R('a3', 3, { contactStatus: '컨택 중' })] };
const { b: out, n } = ctx.sweepNoReply(b);
const rej = [...out.step2Rows, ...out.claudeStep2Rows].filter((r) => r.endReason === '무응답').map((r) => r.id).sort();
chk(JSON.stringify(rej) === JSON.stringify(['a8', 'd30', 'd7', 'd8']), '7일 이상 지난 답장 없는 사람만 거절(9월·10월 구분 없이)', rej);
chk(n === 4, '4명', n);
chk(!rej.includes('d6') && !rej.includes('a3'), '7일 안 된 사람은 그대로');
chk(!rej.includes('rep') && !rej.includes('deal') && !rej.includes('imp') && !rej.includes('talk'), '답장·성사·옮겨온 기록·대화중은 제외');
chk(ctx.sweepNoReply(out).n === 0, '두 번 돌려도 추가로 안 옮김');
console.log(fail ? `❌ 실패 ${fail}건` : '✅ 전부 통과'); process.exit(fail ? 1 : 0);
