# Apps Script 백엔드 배포 (한 번만)

Render/Supabase를 대체하는 Google Sheets 백엔드. 아래는 **구글 계정으로 직접** 해야 함.

## 1. Apps Script 열기
- 구글 시트 **`PA Manager 데이터`** 열기 (id `1mtsbnaa_M991Zc-b0FE4cSiMcBEu5L-IUSdmvC5tcQc`)
- 상단 **확장 프로그램 → Apps Script**  (이렇게 열면 이 시트에 '바인딩'되어 SS_ID 설정 불필요)

## 2. 코드 붙여넣기
- 기본 `Code.gs` 내용 지우고 → 이 폴더의 **`Code.gs`** 전체 붙여넣기
- 왼쪽 **⚙ 프로젝트 설정 → "appsscript.json 매니페스트 파일 표시" 체크**
- 편집기로 돌아와 `appsscript.json` 열고 → 이 폴더의 **`appsscript.json`** 내용으로 교체
- 💾 저장

## 3. 초기화 실행
- 함수 드롭다운에서 **`setup`** 선택 → **실행** ▶
- 권한 요청 뜨면 **본인 구글 계정 승인**("안전하지 않음" 경고는 본인 스크립트라 계속 진행)
- 실행 로그에 `setup 완료` 뜨면 OK. (시트에 `_appdata`·`_meta`·`_users`·`_log` 탭, Drive에 `PA-Manager-pfiles`·`PA-Manager-backups` 폴더 생성됨. 기본 관리자 `admin` / `admin1234`)

## 4. 웹앱 배포
- 우상단 **배포 → 새 배포** → 톱니 **유형 선택 → 웹 앱**
- **실행: 나(본인)**, **액세스 권한: 모든 사용자** → **배포**
- 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/……/exec`) **복사** → 나한테 전달

> 코드 고쳐 재배포할 땐 **배포 관리 → 편집(연필) → 버전: 새 버전 → 배포**. URL은 그대로 유지됨.

## 5. 계약서 메일 발송 켜기 (2026-08-05 추가 — 이미 배포된 백엔드도 이 3단계 필요)
계약서를 메일로 보내려면 **Gmail 발송 권한**이 새로 필요하다. 코드만 붙여넣고 재배포하면 권한이 없어 발송이 실패한다.

1. **코드·매니페스트 갱신**: 편집기에서 `Code.gs`·`appsscript.json` 을 이 폴더 최신본으로 교체 후 저장
   (`appsscript.json` 에 `script.send_mail`·`gmail.send`·`gmail.settings.basic` 스코프가 들어있어야 함)
2. **권한 재승인**: 함수 드롭다운에서 **`setup`** 실행 ▶ → 권한 요청 창에서 **"Gmail에서 메일 보내기"** 항목까지 **허용**
   (이 단계를 건너뛰면 발송 시 `권한 없음` 오류)
3. **재배포**: **배포 → 배포 관리 → 편집(연필) → 버전: 새 버전 → 배포** (URL 유지)

**발신 주소**: 이 웹앱을 배포한 구글 계정으로 나간다.
- 배포 계정이 `cheddar@dayzcorp.kr` 이면 → 그대로 팀 메일로 발송
- 다른 계정이면 → 그 계정으로 발송되고 `cheddar@dayzcorp.kr` 로 **사본(cc)** 이 간다.
  팀 메일 이름으로 보내려면 Gmail **설정 → 계정 → 다른 주소에서 메일 보내기** 에 `cheddar@dayzcorp.kr` 를 별칭으로 등록하면 자동으로 그 주소로 발송된다.
- 회신 주소(Reply-To)는 어느 경우든 항상 `cheddar@dayzcorp.kr`.

> 하루 발송 한도: 일반 gmail.com 계정 100통 / Workspace 계정 1,500통. 한도 초과 시 앱에 안내가 뜬다.

## 이후 (내가 진행)
- 그 `/exec` URL 을 `index.html` 의 `API` 상수에 넣고
- `migrate.js` 로 백업 데이터·개인정보 첨부를 이 백엔드로 이관
- 로그인·저장·개인정보·안전장치 E2E 검증
- 저장소 공개 전환 + GitHub Pages 발행 → 새 접속 주소로 컷오버
