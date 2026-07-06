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

## 이후 (내가 진행)
- 그 `/exec` URL 을 `index.html` 의 `API` 상수에 넣고
- `migrate.js` 로 백업 데이터·개인정보 첨부를 이 백엔드로 이관
- 로그인·저장·개인정보·안전장치 E2E 검증
- 저장소 공개 전환 + GitHub Pages 발행 → 새 접속 주소로 컷오버
