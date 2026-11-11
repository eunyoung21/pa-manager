# 테스트용(헤드리스) 크롬만 끈다 — 이름에 pa-…-e2e 가 들어간 임시 프로필로 뜬 것만.
# 🔴 절대 `taskkill /IM chrome.exe` 를 쓰지 말 것: 사용자가 쓰는 크롬 창까지 전부 꺼진다.
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'pa-[a-z0-9-]*(e2e|test)' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
