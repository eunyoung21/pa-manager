/* 계약서 파일 이름 규칙 검증 — index.html 안의 생성기를 그대로 실행한다.
   이름 맨 앞의 광고주명이 곧 브랜드다. 서명본이 회신되면 계약서 회수기가
   이 이름을 보고 베이스튠/그래니 드라이브로 갈라 넣으므로, 규칙이 깨지면
   서명된 계약서가 엉뚱한 폴더로 가거나 아예 인식되지 않는다.

   실행: node test/contract-filename.test.mjs [index.html] */
import fs from 'fs';

const SRC = process.argv[2] || 'index.html';
const html = fs.readFileSync(SRC, 'utf8');

// 인라인 <script> 중 계약서 생성기가 든 블록만 골라 실행 (배포 코드와 동일한 원본)
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = blocks.find(b => b.includes('function contractFileName'));
if (!code) { console.error('index.html 에서 contractFileName 을 찾지 못했습니다.'); process.exit(1); }

// 브라우저 전역 최소 흉내 (블록 맨 위에서 <style> 을 head 에 꽂는다)
const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, click() {}, set textContent(v) {} });
globalThis.window = globalThis;
globalThis.document = { createElement: el, head: { appendChild() {} }, body: { appendChild() {} } };
new Function(code)();

let fail = 0;
const eq = (got, want, label) => {
  if (got === want) return console.log('  ok   ' + label);
  fail++; console.log('  FAIL ' + label + '\n         받은값 ' + got + '\n         기대값 ' + want);
};
const nameOf = (brandId, name, date) =>
  window.buildContractDocx(brandId, name, '800000', date, { name, phone: '', addr: '', rrn: '' }).filename;

console.log('\n계약서 파일 이름 — 광고주명이 맨 앞에 와야 브랜드가 갈린다');
eq(nameOf('basetune', '문태양', '2026-08-06'), '드래프터_광고모델_문태양_2026년08월06일.docx',
   '베이스튠 → 드래프터');
eq(nameOf('granny', '한은민', '2026-08-06'), '썸웨어코드_광고모델_한은민_2026년08월06일.docx',
   '그래니살라 → 썸웨어코드');
eq(nameOf('basetune', '', '2026-08-06'), '드래프터_광고모델_모델_2026년08월06일.docx',
   '이름 비면 "모델"');
eq(nameOf('granny', '한은민', ''), '썸웨어코드_광고모델_한은민_____년__월__일.docx',
   '계약일자 비면 빈칸 유지');

console.log('\n회수기가 이 이름을 되읽을 수 있어야 한다 (contract-collector/Code.gs 와 같은 규칙)');
const COMPANY = { basetune: '드래프터', granny: '썸웨어코드' };
function parseBack(n) {                       // 회수기 parseSentName 과 동일한 규칙
  if (!/\.docx$/i.test(n)) return null;
  let stem = n.replace(/\.docx$/i, ''), brand = '';
  for (const b in COMPANY) if (stem.startsWith(COMPANY[b] + '_')) { brand = b; stem = stem.slice(COMPANY[b].length + 1); break; }
  const m = stem.match(/^(?:광고모델계약서|광고모델)_(.+)$/);
  if (!m) return null;
  const d = m[1].match(/^(.*)_(\d{4})년(\d{2})월(\d{2})일$/);
  return d ? { brand, realName: d[1], date: d[2].slice(2) + d[3] + d[4] }
           : { brand, realName: m[1].replace(/_[_\d]*년[_\d]*월[_\d]*일$/, ''), date: '' };
}
const back = (brandId, name, date) => JSON.stringify(parseBack(nameOf(brandId, name, date)));
eq(back('basetune', '문태양', '2026-08-06'), JSON.stringify({ brand: 'basetune', realName: '문태양', date: '260806' }),
   '베이스튠 왕복');
eq(back('granny', '한은민', '2026-12-31'), JSON.stringify({ brand: 'granny', realName: '한은민', date: '261231' }),
   '그래니 왕복');
eq(back('basetune', '김 영희', '2026-08-06'), JSON.stringify({ brand: 'basetune', realName: '김 영희', date: '260806' }),
   '이름에 공백이 있어도 왕복');

console.log(fail ? `\n실패 ${fail}건\n` : '\n전부 통과\n');
process.exit(fail ? 1 : 0);
