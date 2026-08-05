/* 배포도우미.html 생성 — Code.gs·appsscript.json 최신 내용을 그대로 박아 넣는다.
   코드가 바뀌면 다시 실행: node apps-script/make-deploy-helper.mjs */
import fs from 'fs';
import path from 'path';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const code = fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const manifest = fs.readFileSync(path.join(DIR, 'appsscript.json'), 'utf8');
const SHEET = 'https://docs.google.com/spreadsheets/d/1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc/edit';
const stamp = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>PA 매니저 백엔드 업데이트</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#111;font-family:"Malgun Gothic",system-ui,sans-serif;line-height:1.6}
  .wrap{max-width:720px;margin:0 auto;padding:48px 24px 96px}
  h1{font-size:20px;font-weight:800;margin:0 0 6px}
  .sub{color:#777;font-size:13px;margin:0 0 40px}
  .step{border-top:1px solid #e5e5e5;padding:24px 0}
  .step:last-of-type{border-bottom:1px solid #e5e5e5}
  .n{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border:1px solid #111;border-radius:50%;font-size:12px;font-weight:700;margin-right:8px}
  .t{font-size:15px;font-weight:700;display:inline}
  .d{color:#555;font-size:13.5px;margin:8px 0 0;padding-left:30px}
  .d b{color:#111}
  .d code{background:#f4f4f4;padding:1px 5px;border-radius:3px;font-size:12.5px}
  .bar{margin:12px 0 4px 30px;padding:9px 14px;border:1px solid #e5e5e5;border-radius:6px;background:#fafafa;
       color:#555;font-size:13px;white-space:nowrap;overflow-x:auto}
  .pick{border:1px solid #999;border-radius:4px;padding:2px 8px;background:#fff;color:#111;font-weight:700}
  .list{padding-left:52px;margin:10px 0 0}
  .list li{margin:5px 0}
  .note{color:#888;font-size:12.5px;margin-top:12px}
  .btn{margin:14px 0 0 30px;padding:11px 20px;border:1px solid #111;background:#111;color:#fff;border-radius:6px;
       font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn:hover{opacity:.85}
  .btn.done{background:#fff;color:#111}
  a{color:#111}
  .warn{margin-top:36px;padding:14px 16px;border:1px solid #e5e5e5;border-radius:6px;color:#555;font-size:13px}
  .foot{margin-top:28px;color:#999;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>PA 매니저 백엔드 업데이트</h1>
  <p class="sub">계약서 메일 발송을 켜려면 아래 순서대로. 복사 버튼만 누르면 됩니다. (기준 ${stamp})</p>

  <div class="step">
    <span class="n">1</span><span class="t">Apps Script 편집기 열기</span>
    <p class="d"><a href="${SHEET}" target="_blank">PA Manager 데이터 시트 열기</a> → 상단 <b>확장 프로그램 → Apps Script</b></p>
  </div>

  <div class="step">
    <span class="n">2</span><span class="t">Code.gs 교체</span>
    <p class="d">왼쪽에서 <code>Code.gs</code> 클릭 → 편집창 안을 클릭하고 <b>Ctrl+A</b>로 전체 선택 → <b>Ctrl+V</b>로 붙여넣기</p>
    <button class="btn" data-k="code">Code.gs 복사</button>
  </div>

  <div class="step">
    <span class="n">3</span><span class="t">appsscript.json 교체</span>
    <p class="d">왼쪽 <b>⚙ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 체크</b> → 편집기로 돌아와 <code>appsscript.json</code> 클릭 → <b>Ctrl+A</b> → <b>Ctrl+V</b><br>
    (메일 보낼 권한이 여기 적혀 있어서 이 파일도 꼭 바꿔야 합니다)</p>
    <button class="btn" data-k="manifest">appsscript.json 복사</button>
  </div>

  <div class="step">
    <span class="n">4</span><span class="t">저장 후 권한 승인</span>
    <p class="d"><b>Ctrl+S</b>로 저장합니다. 그러면 코드 편집창 <b>바로 위 회색 줄(툴바)</b>에 이런 버튼들이 있습니다:</p>
    <div class="bar">↶&nbsp;&nbsp;↷&nbsp;&nbsp;│&nbsp;&nbsp;▷ 실행&nbsp;&nbsp;&nbsp;🐞 디버그&nbsp;&nbsp;&nbsp;<span class="pick">SS ▾</span>&nbsp;&nbsp;&nbsp;실행 로그</div>
    <ol class="d list">
      <li><b>SS ▾</b> 처럼 함수 이름이 적힌 <b>드롭다운</b>을 클릭합니다. (지금 뭐가 적혀 있든 상관없습니다 — 그게 함수 선택 칸입니다)</li>
      <li>목록이 쭉 뜨면 그중 <code>setup</code> 을 클릭합니다. 목록이 길면 스크롤하세요.</li>
      <li>드롭다운이 <b>setup ▾</b> 로 바뀐 걸 확인하고, 왼쪽 <b>▷ 실행</b>을 누릅니다.</li>
      <li><b>"승인 필요"</b> 창 → <b>권한 검토</b> → 본인 구글 계정 선택</li>
      <li><b>"Google에서 확인하지 않은 앱"</b> 경고가 뜨면 왼쪽 아래 <b>고급</b> → 맨 아래 <b>PA Manager(안전하지 않음)으로 이동</b></li>
      <li>권한 목록에서 <b>Gmail에서 이메일 보내기</b> 항목까지 확인 → 맨 아래 <b>허용</b></li>
      <li>아래 <b>실행 로그</b>에 <code>setup 완료</code> 가 뜨면 성공입니다.</li>
    </ol>
    <p class="d note">※ 드롭다운이 안 보이면 창이 좁아 접힌 것입니다 — 브라우저 창을 넓히거나 최대화하세요.<br>
    ※ <code>setup</code> 은 여러 번 실행해도 데이터가 지워지지 않습니다(없는 것만 만듭니다). 안심하고 눌러도 됩니다.<br>
    ※ 권한 창에서 <b>취소를 눌렀어도 망가지는 건 없습니다</b> — 그냥 다시 ▷ 실행 하면 됩니다.</p>
  </div>

  <div class="step">
    <span class="n">4-1</span><span class="t">권한이 진짜 들어갔는지 확인 (권한 창이 안 뜬 경우 꼭)</span>
    <p class="d">권한 창 없이 바로 <b>"실행이 완료됨"</b> 이 떴다면, 3단계(<code>appsscript.json</code>)가 저장되지 않아
    <b>옛 권한 목록 그대로</b>일 수 있습니다. 아래로 확인하세요.</p>
    <ol class="d list">
      <li>함수 드롭다운에서 <code>checkMail</code> 선택 → <b>▷ 실행</b></li>
      <li>화면 아래 <b>실행 로그</b>를 봅니다.
        <br>· <b>✅ 메일 발송 권한 OK</b> → 통과. 5단계로 가세요.
        <br>· <b>❌ 메일 발송 권한이 없습니다</b> → 3단계를 다시 하세요:
        <b>⚙ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 체크</b> → 편집기 왼쪽에 생긴
        <code>appsscript.json</code> 클릭 → Ctrl+A → 위 3단계 복사 버튼으로 붙여넣기 → Ctrl+S → 다시 <code>setup</code> 실행
      </li>
      <li>로그에 <b>발신 주소</b>가 어디로 나가는지도 같이 찍힙니다. 확인해 두세요.</li>
    </ol>
    <p class="d note">※ 진짜 메일이 나가는지까지 보려면 <code>sendTestMail</code> 을 실행하세요 — 본인 메일로 테스트 한 통이 옵니다.</p>
  </div>

  <div class="step">
    <span class="n">5</span><span class="t">재배포</span>
    <p class="d">우상단 <b>배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포</b><br>주소는 그대로 유지됩니다. 이걸 안 하면 앱에는 옛 버전이 계속 물려 있습니다.</p>
  </div>

  <div class="warn">
    끝나면 PA 매니저에서 <b>📄 계약서 생성 → 받는 사람 이메일 입력 → 📧 메일 보내기</b>로 본인 메일에 한 번 테스트해 보세요.<br>
    "백엔드에 메일 발송 기능이 아직 적용되지 않았습니다"가 뜨면 5단계(재배포)가 안 된 것입니다.
  </div>
  <p class="foot">이 파일은 <code>node apps-script/make-deploy-helper.mjs</code> 로 다시 만들 수 있습니다(코드 바뀔 때마다).</p>
</div>

<script>
const PAYLOAD = ${JSON.stringify({ code, manifest }).replace(/</g, '\\u003c')};
document.querySelectorAll('.btn').forEach(b=>{
  b.addEventListener('click', async ()=>{
    const text = PAYLOAD[b.dataset.k];
    try{ await navigator.clipboard.writeText(text); }
    catch(e){
      const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    const old=b.textContent;
    b.textContent='복사됨 — 편집기에서 Ctrl+A 후 Ctrl+V';
    b.classList.add('done');
    setTimeout(()=>{ b.textContent=old; b.classList.remove('done'); }, 4000);
  });
});
</script>
</body>
</html>`;

const out = path.join(DIR, '배포도우미.html');
fs.writeFileSync(out, html, 'utf8');
console.log('생성: ' + out + '  (Code.gs ' + code.length + '자, appsscript.json ' + manifest.length + '자)');
