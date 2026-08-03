import fs from 'fs';
import { unzip } from './ziplib.mjs';

// index.html 에 들어간 엔진 원본을 그대로 실행(테스트가 실제 배포 코드와 같도록)
const SRC = process.argv[2] || 'index.html';
let code = fs.readFileSync(SRC, 'utf8');
if (/CONTRACT_TPL_ENGINE_START/.test(code)) {
  code = code.split('==CONTRACT_TPL_ENGINE_START==')[1].split('==CONTRACT_TPL_ENGINE_END==')[0];
  code = code.slice(code.indexOf('*/') + 2);
  code = code.slice(0, code.lastIndexOf('/*'));
}
globalThis.window = globalThis;
new Function(code)();
const TPL = globalThis.CONTRACT_TPL;

const V = { name:'김하늘', fee:'800,000', date:'2026년 08월 03일', phone:'010-1234-5678', rrn:'900101-2345678', addr:'서울특별시 강남구 테헤란로 1' };
let fail = 0;
function chk(cond, msg){ console.log((cond?'  PASS ':'  FAIL ')+msg); if(!cond) fail++; }

for (const f of process.argv.slice(3, 5)) {
  console.log('\n=== '+f);
  const src = new Uint8Array(fs.readFileSync(f));
  const before = await TPL.text(src);
  const an = await TPL.analyze(src);
  console.log('  자리 인식:', JSON.stringify(an.slots), 'via', JSON.stringify(an.via), 'unknown', JSON.stringify(an.unknown));
  const outBytes = await TPL.fill(src, V);
  fs.writeFileSync(f.replace(/\.docx$/, '.out.docx'), Buffer.from(outBytes));
  const after = await TPL.text(outBytes);

  chk(after.includes(V.name), '이름 반영');
  chk(after.includes('800,000원정') || after.includes('800,000 원정') || after.includes('800,000원'), '모델료 반영');
  chk(after.includes('2026년 08월 03일'), '계약일자 반영');
  chk(after.includes(V.phone), '연락처 반영');
  chk(after.includes(V.rrn), '주민등록번호 반영');
  chk(after.includes(V.addr), '주소 반영');
  chk(!/000\s*[(（]\s*이하/.test(after), '이름 빈칸(000) 제거');
  chk(!/[_＿]{3,}\s*원정/.test(after), '모델료 빈칸(____) 제거');
  chk(!/[_＿\s]년[_＿\s]*월[_＿\s]*일/.test(after.replace(/\d{4}년\s*\d{2}월\s*\d{2}일/g,'')), '날짜 빈칸 제거');

  // 본문 조항은 그대로여야 한다 — 값이 들어간 지점 말고는 글자 변화 없음
  const norm = s => s.replace(/\s+/g,'');
  const clausesBefore = norm(before).split('제11조')[0];
  const clausesAfter  = norm(after).split('제11조')[0];
  const onlyExpected = clausesAfter
    .replace(norm(V.name),'000')
    .replace(norm(V.fee)+'원정','________________원정');
  chk(onlyExpected === clausesBefore || clausesAfter.length - clausesBefore.length < 40, '조항 본문 보존');

  // 광고주 칸 침범 금지
  const zip = unzip(Buffer.from(outBytes));
  const xml = zip['word/document.xml'].toString('utf8');
  chk(zip['word/styles.xml'] && zip['word/settings.xml'] && Object.keys(zip).length === Object.keys(unzip(Buffer.from(src))).length, '모든 파트 보존 ('+Object.keys(zip).length+'개)');
  // 광고주 칸(상호명·사업자번호·주소·대표자)은 그대로여야 하고, 모델 값은 그 뒤(모델 열)에 들어가야 한다
  const beforeCo = before.match(/주식회사\s*\S+/)[0];
  chk(after.includes(beforeCo), '광고주 상호명 보존');
  const coAddr = before.match(/(서울특별시|경기도)[^주소이름대표자]{5,50}/);
  chk(!coAddr || after.includes(coAddr[0]), '광고주 주소 보존');
  chk((after.match(new RegExp(V.addr.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length === 1, '모델 주소 1회만');
  chk(!coAddr || after.indexOf(coAddr[0]) < after.indexOf(V.addr), '모델 주소가 광고주 주소 뒤(모델 열)');
  chk((xml.match(/010-1234-5678/g)||[]).length === 1, '연락처 1회만');
  chk((xml.match(/김하늘/g)||[]).length === 2, '이름 2회(도입부+서명란) — 실제 '+(xml.match(/김하늘/g)||[]).length);
}

// 표시자({{이름}}) 방식도 되는지 — a.docx 본문에 표시자를 심어 확인
console.log('\n=== 표시자({{ }}) 방식');
{
  const src = new Uint8Array(fs.readFileSync(process.argv[3]));
  // 새 계약서라고 가정: 본문 문구를 표시자로 바꾼 docx 를 만든다
  const zip = unzip(Buffer.from(src));
  let xml = zip['word/document.xml'].toString('utf8');
  // 워드는 한 문장도 여러 조각(run)으로 쪼개 저장한다 → 표시자가 조각에 걸쳐도 되는지 함께 확인
  xml = xml.replace('<w:sectPr', '<w:p><w:r><w:t>{{이름}} 님 확인 / 모델료 {{모델</w:t></w:r><w:r><w:t>료}} / 일자 {{계약일자}}</w:t></w:r></w:p><w:sectPr');
  const files = Object.entries(zip).map(([name, data]) => ({ name, data: new Uint8Array(data) }));
  files.find(f => f.name === 'word/document.xml').data = new TextEncoder().encode(xml);
  // 저장(무압축 zip)
  const zipped = makeStoreZip(files);
  const an = await TPL.analyze(zipped);
  console.log('  자리 인식:', JSON.stringify(an.slots), 'via', JSON.stringify(an.via));
  const out = await TPL.fill(zipped, V);
  const t = await TPL.text(out);
  chk(/김하늘 님 확인 \/ 모델료 800,000 \/ 일자 2026년 08월 03일/.test(t), '표시자 치환(조각 걸침 포함)');
  chk(!/\{\{/.test(t), '표시자 잔여 없음');
}

// 이미 값이 채워진 계약서를 올린 경우 — 남의 값을 덮어쓰면 안 된다
if (process.argv[5]) {
  console.log('\n=== 이미 채워진 계약서 ('+process.argv[5]+')');
  const src = new Uint8Array(fs.readFileSync(process.argv[5]));
  const an = await TPL.analyze(src);
  console.log('  자리 인식:', JSON.stringify(an.slots));
  const out = await TPL.fill(src, V);
  const t = await TPL.text(out);
  chk(t.includes('김가령'), '기존 모델명 보존');
  chk(t.includes('010-7645-6045'), '기존 연락처 보존');
  chk(t.includes('울산 중구 약사로40 삼성래미안 202-803'), '기존 주소 보존');
  chk(!t.includes(V.phone) && !t.includes(V.addr), '채워진 칸에 덮어쓰기 안 함');
  chk(an.slots.name === false && an.slots.date === false, '빈 자리 없음을 알려줌(업로드 경고용)');
}

function makeStoreZip(files){
  const enc = new TextEncoder(); const chunks=[], central=[]; let offset=0;
  const u16=n=>[n&0xFF,(n>>>8)&0xFF], u32=n=>[n&0xFF,(n>>>8)&0xFF,(n>>>16)&0xFF,(n>>>24)&0xFF];
  const table=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?(0xEDB88320^(c>>>1)):(c>>>1); table[n]=c>>>0; }
  const crc32=b=>{ let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=(c>>>8)^table[(c^b[i])&0xFF]; return (c^0xFFFFFFFF)>>>0; };
  files.forEach(f=>{
    const nameB=enc.encode(f.name), data=f.data, crc=crc32(data);
    const local=[0x50,0x4b,0x03,0x04].concat(u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0));
    chunks.push(new Uint8Array(local), nameB, data);
    const cen=[0x50,0x4b,0x01,0x02].concat(u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset));
    central.push(new Uint8Array(cen), nameB);
    offset+=local.length+nameB.length+data.length;
  });
  const cs=central.reduce((a,b)=>a+b.length,0);
  const eocd=[0x50,0x4b,0x05,0x06].concat(u16(0),u16(0),u16(files.length),u16(files.length),u32(cs),u32(offset),u16(0));
  const all=chunks.concat(central,[new Uint8Array(eocd)]);
  const total=all.reduce((a,b)=>a+b.length,0); const out=new Uint8Array(total); let p=0;
  all.forEach(b=>{ out.set(b,p); p+=b.length; });
  return out;
}

console.log('\n' + (fail ? '❌ 실패 '+fail+'건' : '✅ 전부 통과'));
process.exit(fail?1:0);
