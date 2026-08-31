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

## 속도 (2026-08-31 손봄 — 데이터가 늘어도 안 버벅이게)
데이터가 수백~수천 행이 되면서 로딩·탭전환·타자가 눈에 띄게 밀렸다. 네 군데를 고쳤다.
1. **JSX 컴파일 캐시** — 예전엔 페이지를 열 때마다 브라우저 Babel 이 30만 자를 변환했다(매번 2초+).
   지금은 앱 본체가 `<script type="text/pa-jsx" id="pa-app-src">` 에 들어 있고, 파일 맨 아래 **로더**가
   변환 결과를 *소스 해시*를 열쇠로 `localStorage['pa_app_…']` 에 캐시한다. 두 번째 방문부터는 Babel 을
   내려받지도 않는다. **JSX 를 고치면 해시가 달라져 자동 재컴파일**되므로 낡은 코드가 남을 수 없다(빌드 단계 없음).
   → 편집 방법은 예전과 똑같다. index.html 안의 JSX 를 그대로 고치면 된다.
2. **무거운 라이브러리 지연 로딩** — SheetJS·pdf-lib·html2canvas(합쳐 1.5MB)는 첫 화면에 필요 없다.
   `window.needXLSX()` / `window.needPDF()` 로 실제 쓰는 순간에만 받는다(`loadLib`).
3. **긴 표 점진 렌더(`useProgressive`)** — 표는 처음에 60행만 그리고, 표 끝 감시행이 화면에 들어오면
   60행씩 이어 붙인다(IntersectionObserver). STEP1·STEP2·출고·영상검수·개인정보 다섯 표에 적용.
   **개수 표시·전체선택·삭제·검색·집계는 전부 원본 배열(`shown`)로 계산**하므로 안 그려진 행도 빠지지 않는다.
   이 불변식은 `test/progressive.e2e.mjs` 가 지킨다.
4. **행 수에 비례하는 계산 useMemo** — Step1/Step2 의 `shown`·`cnt`·카테고리 집계는 키를 누를 때마다
   전체 행을 다시 훑었다. 이제 실제 입력이 바뀔 때만 계산한다. 검색어는 `useDeferredValue` 로 표에 한 박자 늦게 반영.
5. **로컬백업 디바운스** — 상태가 바뀔 때마다 1MB 를 `localStorage` 에 동기로 쓰던 걸 400ms 로 모았다.
   탭을 닫거나 숨기면 `flush` 가 즉시 확정하므로 '마지막 보루' 역할은 그대로다.

측정(모의 데이터 1MB·CPU 4배 느리게, `test/progressive.e2e.mjs` 와 같은 목백엔드):
첫 화면 3.9s→**1.1s**(재방문) · STEP1 탭 1.6s→**0.45s** · 검색 한 글자 0.25s→**0.03s** · Y/N 토글 0.12s→**0.05s**

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
- JSX는 로더가 Babel로 변환하므로 **배포 전 문법 검증**을 하면 좋다: `@babel/standalone`(unpkg)로 `index.html`의 babel 스크립트를 `Babel.transform(code,{presets:['react']})` 해보면 문법 오류를 잡을 수 있다.
- 다크 테마 CSS 변수: `--bg #111`, `--surface #1a1a1a`, `--surface2 #222`, `--surface3 #2a2a2a`, `--border #2d2d2d`, `--muted #71717a`, `--accent #6366f1`, `--green --red --blue`.
- `.main`은 `display:flex; overflow:hidden`이므로, 탭 최상위 div는 `flex:1 1 0; min-width:0; overflow-y:auto`를 줘야 폭을 채우고 스크롤된다.

## 커밋/푸시
- 한국어 커밋 메시지 사용. 수정 → 커밋 → `git push origin main` → Pages 자동 반영 → 라이브 확인.
- 백엔드(`Code.gs`)를 고쳤다면 push 와 별개로 **Apps Script 새 버전 배포**까지 해야 반영된다.
