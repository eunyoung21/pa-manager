# PA Manager (ey) — 프로젝트 가이드 (Claude용)

인플루언서 협업을 **리스트업 → 컨택 → 계약 → 출고 → 영상검수 → 업로드**까지 한 곳에서 관리하는 사내 웹앱. 관리자와 PA 알바가 함께 사용한다.

## 아키텍처 (한눈에)
- **프론트엔드**: `index.html` 단일 파일. React + ReactDOM을 unpkg CDN으로 로드하고, `<script type="text/babel">` 안에 JSX로 전체 앱을 작성 (빌드 단계 없음, 브라우저에서 Babel이 변환).
- **백엔드**: `server.js` — 의존성 없는 순수 Node `http` 서버 (포트 `3456`, `process.env.PORT` 우선). 정적 파일 서빙 + `/api/*` REST.
- **데이터 저장소**: **Supabase** (`SUPABASE_URL`, `SUPABASE_ANON_KEY` 환경변수 — Render에만 설정됨). 이게 실데이터의 원본.
  - `data.json`은 로컬 폴백/백업본. 환경변수 없으면 서버가 이걸 사용.
- **사용자/인증**: `users.json` (해시 비번). 로그인 시 base64 토큰 발급 → 이후 `Authorization: Bearer <token>`.
- **구글 시트**: 리스트업/컨택 데이터의 **단일 정답(source of truth)**. '동기화' 버튼 = 시트 → 앱 **완전 교체(mirror)**. 앱이 시트로 거꾸로 쓰지는 않음.

## 배포 (중요)
- 실제 사이트 = **Render 배포본** → https://pa-manager.onrender.com
- **GitHub `main`에 push하면 Render가 자동 배포** (보통 1~5분). 로컬 수정만으로는 라이브에 반영 안 됨.
- 배포 확인: `curl`로 라이브 HTML에 방금 추가한 코드 마커가 있는지 grep.

## 로컬 실행
```
node server.js        # 또는 start.bat (Windows)
# http://localhost:3456
```
- 환경변수(SUPABASE_*) 없이 띄우면 실데이터 대신 `data.json` 사용. 실데이터로 보려면 Render의 env 값 필요.

## 프론트엔드 구조 (index.html)
- 메인 컴포넌트: `AppMain`. 탭(`TABS`) 기반.
- 탭: `dashboard`(📊 대시보드, 첫 화면) · `step1`(STEP1 리스트업) · `step2`(STEP2 컨택현황) · `shipping`(출고) · `review`(영상검수) · `dm`(DM 템플릿) · `settle`(정산, 관리자) · `privacy`(개인정보, 관리자) · `guide`(가이드).
- 데이터 모델: `data.brands[]` (basetune/granny), 각 브랜드에 `step1Rows / step2Rows / shippingRows / reviewRows / privacyRows`, 그리고 `data.settlements`.
  - step1Row: `pa, date, name, link, followers, persona, feedMemo, hypothesis, reviewStatus(승인/반려/검수대기), rejectReason, promotedToStep2`
  - step2Row: `pa, name, contactStatus(컨택 전/컨택 중/컨택 완료/거절), contractDone(미완료/✅ 완료), shippingDone, dmSent, dealDone, contractUrl, ...`
- 자동저장: 상태 변경 시 700ms 디바운스로 `POST /api/data`. 서버 최초 로드 전엔 저장 안 함(`serverLoadedRef`).

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
- 한국어 커밋 메시지 사용. 수정 → 커밋 → `git push origin main` → Render 자동 배포 → 라이브 확인.
