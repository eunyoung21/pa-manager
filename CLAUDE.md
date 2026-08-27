# PA Manager (ey) — 프로젝트 가이드 (Claude용)

인플루언서 협업을 **리스트업 → 컨택 → 계약 → 출고 → 영상검수 → 업로드**까지 한 곳에서 관리하는 사내 웹앱. 관리자와 PA 알바가 함께 사용한다.

> ⚠️ **2026-08-12 기준 최신.** Render/Supabase/`server.js` 시절 설명이 오래 남아 있었다.
> 그 백엔드는 **삭제됐다**(`pa-manager.onrender.com` → 404). 아래가 현재 구조다.

## 아키텍처 (한눈에)
- **프론트엔드**: `index.html` 단일 파일. React + ReactDOM을 unpkg CDN으로 로드하고, `<script type="text/babel">` 안에 JSX로 전체 앱을 작성 (빌드 단계 없음, 브라우저에서 Babel이 변환).
- **백엔드**: `apps-script/Code.gs` — 구글 시트에 바인딩된 Apps Script 웹앱. `index.html` 의 `API` 상수(1945행)가 그 `/exec` 주소를 부른다. 액션은 `handle()` 의 switch 참고 (`login/get/save/pfile*/contractMail/archive*/users/...`).
- **데이터 저장소**: 구글 시트 `PA Manager 데이터`(id `1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc`) 의 `_appdata` 탭에 앱 JSON 을 45k자 청크로 분할 저장. 첨부(신분증·통장 등)는 본문이 아니라 **Drive `PA-Manager-pfiles`** 에 두고 참조 url만 저장한다.
  - `data.json` 은 옛 로컬 폴백본. **커밋 금지**(gitignore). 낡은 폴백이 화면을 덮어써 편집을 날린 사고가 있었다.
- **사용자/인증**: 시트 `_users` 탭(해시 비번 + `SALT`). 로그인하면 `TOKEN_SECRET`(Script Properties 의 랜덤값)으로 **HMAC 서명한 토큰**을 발급 → 이후 요청 body 의 `token` 필드로 보낸다. 시크릿이 코드에 없으므로 저장소가 공개여도 위조 불가.
- **구글 시트(리스트업 원본)**: 리스트업/컨택 데이터의 **단일 정답(source of truth)**. '동기화' 버튼 = 시트 → 앱 **완전 교체(mirror)**. 앱이 시트로 거꾸로 쓰지는 않음.

## 배포 (중요)
- 실제 사이트 = **GitHub Pages** → https://eunyoung21.github.io/pa-manager/ (`main` 브랜치 루트)
- **`main` 에 push 하면 Pages 가 자동 반영** (보통 1분 내). 프론트(`index.html`) 는 이걸로 끝.
- **백엔드(`Code.gs`) 를 고쳤으면 push 만으로는 반영되지 않는다.** Apps Script 편집기에 붙여넣고 → **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포**. 이 과정을 빼먹어 "코드는 맞는데 동작이 옛날"인 경우가 반복됐다. `apps-script/DEPLOY.md` 참고.
- 배포 확인: 라이브에서 `?action=ping` 을 호출하면 `{"ok":true,"rev":N}`.
- ⚠️ **저장소는 PUBLIC 이다.** 시크릿·개인정보·실데이터를 커밋하지 말 것(`.gitignore` 확인).

## 로컬 실행
- 정적 파일이라 `index.html` 을 그대로 열거나 아무 정적 서버로 띄우면 된다. 라이브 백엔드를 그대로 부른다.
- 백엔드를 건드리지 않고 프론트만 테스트하려면 `window.PA_API` 로 목 서버를 주입한다(`test/` 의 E2E 가 이 방식).
- `server.js` · `node/` · `start.bat` 은 **폐기된 Render 백엔드 잔재**다. 실행하지 말 것(gitignore 로 빠져 있음).

## 프론트엔드 구조 (index.html)
- 메인 컴포넌트: `AppMain`. 탭(`TABS`) 기반.
- 탭: `dashboard`(📊 대시보드, 첫 화면) · `step1`(STEP1 리스트업) · `step2`(STEP2 컨택현황) · `shipping`(출고) · `review`(영상검수) · `dm`(DM 템플릿) · `settle`(정산, 관리자) · `privacy`(개인정보, 관리자) · `guide`(가이드).
- 데이터 모델: `data.brands[]` (basetune/granny), 각 브랜드에 `step1Rows / step2Rows / shippingRows / reviewRows / privacyRows`, 그리고 `data.settlements`.
  - step1Row: `pa, date, name, link, followers, persona, feedMemo, hypothesis, reviewStatus(승인/반려/검수대기), rejectReason, promotedToStep2`
  - step2Row: `pa, name, contactStatus(컨택 전/컨택 중/컨택 완료/거절), contractDone(미완료/✅ 완료), shippingDone, dmSent, dealDone, contractUrl, ...`
- 자동저장: 상태 변경 시 700ms 디바운스로 `POST /api/data`. 서버 최초 로드 전엔 저장 안 함(`serverLoadedRef`).

## 계약서 수집 (영상검수 탭 📥 버튼)
- 이 앱은 **메일함을 만지지 않는다.** 버튼 → `collectRun` 이 시트 `_collect` 탭 A1 에 요청만 적고, 별도 스크립트 **계약서 회수기**(`D:\claude-work\contract-collector`, cheddar 계정 전용·비공개)가 1분 트리거로 그걸 보고 대신 돈다. 결과는 A2 에 **건수만**(`collectState` 로 폴링).
- 이유: 이 백엔드는 액세스가 `ANYONE_ANONYMOUS` 라 **Gmail 읽기 권한을 붙이면 안 된다**(토큰 유출 시 메일함 전체가 위험). 그래서 권한은 회수기에 두고 요청만 공유한다. 알바(staff)도 그대로 쓸 수 있는 이유이기도 하다.
- 소급 수집(`mode:'all'`)은 서버에서 `role==='manager'` 일 때만 통과시킨다(클라이언트만 믿지 않는다).
- 회수기 쪽 1분 트리거(`pump`)가 없으면 버튼이 "회수기가 응답하지 않습니다" 로 끝난다 → 회수기에서 `setup` 재실행.

## 접근 모델
- `authInfo.role`: `manager`(전체) / `staff`(리스트업·컨택·출고만). `?mode=staff`로도 staff UI 강제 가능.
- `authInfo.brand`: `all` / `basetune` / `granny` — 담당 브랜드만 노출(클라이언트 게이팅).

## 주의할 함정 (과거에 겪은 것)
1. **UTF-8 본문 깨짐(해결됨)**: `req.on('data', c=> body+=c)`는 멀티바이트 한글이 청크 경계에서 `�`로 깨진다. POST 핸들러는 반드시 `req.setEncoding('utf8')` 사용.
2. **낡은 탭이 서버를 덮어씀(해결됨)**: 프론트가 localStorage(`pa_mgr_v5`)에 캐시 → 옛 탭이 자동저장으로 서버를 덮어쓸 수 있음. 데이터 수정 후엔 **모든 탭/기기 새로고침** 필요. `serverLoadedRef`로 마운트 시 덮어쓰기를 막아둠.

## 작업 팁
- JSX는 브라우저 Babel이 변환하므로 **배포 전 문법 검증**을 하면 좋다: `@babel/standalone`(unpkg)로 `index.html`의 babel 스크립트를 `Babel.transform(code,{presets:['react']})` 해보면 문법 오류를 잡을 수 있다.
- 다크 테마 CSS 변수: `--bg #111`, `--surface #1a1a1a`, `--surface2 #222`, `--surface3 #2a2a2a`, `--border #2d2d2d`, `--muted #71717a`, `--accent #6366f1`, `--green --red --blue`.
- `.main`은 `display:flex; overflow:hidden`이므로, 탭 최상위 div는 `flex:1 1 0; min-width:0; overflow-y:auto`를 줘야 폭을 채우고 스크롤된다.

## 커밋/푸시
- 한국어 커밋 메시지 사용. 수정 → 커밋 → `git push origin main` → Pages 자동 반영 → 라이브 확인.
- 백엔드(`Code.gs`)를 고쳤다면 push 와 별개로 **Apps Script 새 버전 배포**까지 해야 반영된다.
