# PA Manager

인플루언서 협업(리스트업 → 컨택 → 계약 → 출고 → 영상검수 → 업로드)과 정산을 관리하는 사내 웹앱. 관리자와 PA(프리랜서)가 함께 사용.

## 구조

- **프론트엔드**: 빌드리스 단일 `index.html` (React 18 + Babel standalone, CDN). GitHub Pages 로 정적 호스팅.
- **백엔드**: Google Apps Script 웹앱 (`apps-script/Code.gs`) — Google 스프레드시트를 데이터 저장소로, Google Drive 를 개인정보 첨부(신분증·통장) 저장소로 사용.
- **인증**: HMAC 토큰. 시크릿은 코드가 아니라 Apps Script **Script Properties** 에 보관(저장소에 시크릿 없음).
- **안전장치**: 저장 시 데이터 급감(40%↑) 자동 차단, 6시간 주기 스냅샷, 정산 3일 후 개인정보 자동폐기.

## 배포

- 프론트: `main` 브랜치 → GitHub Pages.
- 백엔드: `apps-script/DEPLOY.md` 참고 (스프레드시트에 바인딩된 Apps Script 웹앱 배포).
- 프론트의 백엔드 주소는 `index.html` 상단 `API` 상수(Apps Script `/exec` URL).

> 실데이터·개인정보·계정·로그는 저장소에 두지 않습니다(Google 시트/Drive/Script Properties).
