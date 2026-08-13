# SkillPilot 모바일 반응형 작업 HANDOFF

최종 갱신: 2026-08-12 (KST)

이 문서는 새 Codex 대화에서 현재 모바일 반응형 작업을 그대로 이어가기 위한 인수인계 문서다. 새 작업자는 반드시 이 파일 전체를 먼저 읽고 아래 규칙을 지켜야 한다.

## 1. 절대 규칙: 모바일 작업과 웹 작업을 섞지 않는다

### 모든 작업 시작 전에 반드시 먼저 할 일

1. 원본 웹 저장소 `skillpilot`의 최신 변경사항을 먼저 확인한다.
   - `master`의 최신 커밋
   - tracked 미커밋 diff
   - 관련 untracked 소스와 migration
2. 확인한 웹 변경 중 이번 모바일 작업에 필요한 **기능 변경만 hunk 단위로** 모바일 브랜치에 반영한다.
3. 그 다음에 사용자가 요청한 모바일 수정 작업을 시작한다.
4. 웹 변경 확인을 생략한 채 모바일 코드부터 수정하면 안 된다.

중요: 여기서 “웹 변경사항을 먼저 반영한다”는 말은 웹 파일을 통째로 복사하거나 병합한다는 뜻이 아니다. 기존 모바일 디자인과 세부조정을 기준으로 유지하면서 새 데이터 타입, API, server action, 상태, 조건, 버튼 등 필요한 변경만 최소 단위로 옮긴다는 뜻이다.

### 원본 웹 파일 수정 절대 금지

- 원본 웹 저장소 `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`의 소스·스타일·설정·마이그레이션 파일은 모바일 작업 중 절대 수정하지 않는다.
- 웹 저장소에서는 `git checkout`, `restore`, `merge`, `commit`, `reset`, `clean`, 파일 복사/덮어쓰기를 하지 않는다.
- 웹 저장소는 `git status`, `git log`, `git diff`, 파일 읽기 등 **read-only 비교 용도**로만 사용한다.
- 예외는 사용자가 이 문서에 지침을 추가하라고 직접 요청한 경우의 `CODEX_HANDOFF.md` 수정뿐이다.
- 실제 구현과 커밋은 반드시 `skillpilot-mobile-responsive` / `mobile-responsive`에서만 한다.
- 웹 `Dashboard.tsx`, `dashboard.css`, `auth.css` 전체를 모바일에 덮어쓰거나 충돌 시 웹 버전 전체를 선택하는 행위도 금지한다.

- 모바일 반응형 작업 전용 worktree:
  - `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot-mobile-responsive`
- 모바일 반응형 작업 전용 브랜치:
  - `mobile-responsive`
- 현재 복구 기준 모바일 커밋:
  - `2223146` (`Restore detailed mobile UI after web sync`)
- 원본/웹 작업 저장소:
  - `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`
- 모바일 UI 작업은 반드시 `skillpilot-mobile-responsive`에서만 한다.
- 원본 `skillpilot` 저장소의 웹 UI/CSS를 모바일 작업 때문에 수정하면 안 된다.
- 모바일용 변경을 `master`와 섞거나, 모바일 브랜치가 아닌 곳에서 커밋하면 안 된다.
- 새 대화 시작 즉시 작업 디렉터리와 브랜치를 확인한다.

```powershell
Set-Location 'C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot-mobile-responsive'
git branch --show-current
git status --short
```

반드시 `mobile-responsive`가 출력되어야 한다. 다르면 작업을 진행하지 말고 올바른 worktree로 이동한다.

### 웹에도 적용하도록 사용자가 명시한 예외

아래 두 항목만 사용자가 웹에도 적용하라고 직접 요청했다.

1. 서식이 있는 메모를 간단 수정하더라도 기존 서식이 유지되어야 한다.
2. 웹의 긴 내용 입력/메모 수정 화면에서 서식 도구막대가 스크롤을 따라 고정되고, 우측 상단에 `↑ 위로` 버튼이 나타나야 한다.

이 예외 외의 모바일 레이아웃/CSS를 데스크톱에 적용하면 안 된다. 모바일 스타일은 원칙적으로 `@media (max-width: 720px)` 안에 둔다.

## 2. 필수 작업 및 확인 방식

- 사용자가 직접 화면을 보는 것이 핵심이므로, 코드를 바꾼 뒤 반드시 웹페이지를 열고 로그인하고 관련 상세페이지까지 직접 확인한다.
- 코드만 보고 완료 처리하면 안 된다.
- 테스트 계정:
  - 이메일: `skillpilot.dev.admin@gmail.com`
  - 비밀번호: `testpassword123`
- 로컬 개발 서버는 반드시 `3001` 포트를 사용한다. `3000`을 사용하지 않는다.
- 실행 명령:

```powershell
npm.cmd run dev -- -p 3001 --webpack
```

- 실행 위치:
  - `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot-mobile-responsive`
- 모바일 프리뷰:
  - `http://localhost:3001/mobile-preview`
- 실제 앱/데스크톱 확인:
  - `http://localhost:3001/`
- 새 대화에서는 서버가 이미 살아 있는지 먼저 확인하고, 꺼져 있을 때만 위 명령으로 다시 실행한다.

## 3. 개발 전용 모바일 프리뷰

- `/mobile-preview`가 구현되어 있다.
- 실제 SkillPilot 메인 화면 `/`을 iframe으로 그대로 재사용한다.
- 기본 viewport 폭은 `390px`이다.
- 상단에 `375 / 390 / 430` 폭 전환 버튼이 있다.
- 버튼은 iframe viewport 폭만 바꾸며 실제 앱 breakpoint/CSS 값에는 영향을 주지 않는다.
- 프리뷰는 중앙 정렬되고 외부는 중립 배경이다.
- 내부 세로 스크롤이 정상 동작한다.
- development 환경에서만 접근 가능하도록 처리했다.
- 인앱 브라우저 패널을 넓혀도 실제 모바일 화면 폭이 풀리지 않으므로, 모바일 작업은 이 주소에서 확인한다.

### 모바일 반응형 검수 기준

1. `390px`을 기준 화면으로 먼저 맞춘다.
2. `375px`에서는 겹침, 잘림, 가로 스크롤만 확인한다.
3. `430px`에서는 과도하게 벌어지거나 깨지지 않는지만 확인한다.
4. 세 폭마다 별도 픽셀 디자인을 만들지 않는다.
5. 특정 폭에서 실제 문제가 있을 때만 최소한의 반응형 보정을 한다.

## 4. 현재 Git 상태: 아직 커밋하지 않은 작업

현재 변경사항은 의도적으로 미커밋 상태다. 새 작업자는 `reset`, `checkout --`, `clean` 등으로 지우면 안 된다. 사용자가 요청하기 전에는 커밋하거나 push하지 않는다.

수정된 추적 파일:

- `src/app/Dashboard.tsx`
- `src/app/auth.css`
- `src/app/dashboard.css`
- `src/components/auth/AuthWeather.tsx`
- `src/lib/useLiveWeather.ts`
- `src/lib/weather.ts`
- `src/proxy.ts`

추가된 미추적 파일/디렉터리:

- `src/app/api/air-quality/`
- `src/app/api/weather-warnings/`
- `src/app/mobile-preview/`
- `src/components/support/`
- `src/components/weather/`
- `src/lib/actions/support.ts`
- `src/lib/air-quality.ts`
- `src/lib/support-options.ts`
- `src/lib/warnings.ts`

주의: `git diff --name-only`에는 미추적 파일이 나오지 않는다. 반드시 `git status --short`도 함께 본다.

## 5. 현재까지 구현한 내용

### 5.1 로그인/회원가입

- 모바일 로그인/회원가입 카드의 비율과 오른쪽 잘림을 수정했다.
- 비회원/비로그인 상태의 상단 `Sign up` 버튼을 모바일에서 축소했다.
  - 최소 폭 약 `70px`
  - 높이 약 `40px`
  - 모바일 글자 크기 약 `13px`

### 5.2 모바일 헤더, 날씨, 대기질

- 모바일 헤더를 두 줄 구성으로 정리했다.
  - 첫 줄: 로고
  - 둘째 줄: 날씨/대기질, 마이페이지, 도움말, 로그아웃
- 마이페이지/도움말/로그아웃과 날씨 영역의 크기 균형을 맞췄다.
- GPS/IP 위치, 지역, 날씨, AirKorea 대기질, KMA 기상특보를 가져오는 로직을 연결했다.
- 세션 캐시는 약 10분이다.
- 날씨/대기질 호버·포커스·터치 팝업을 구현했다.
- 모바일에서 팝업은 불투명 흰 배경이며 MindSet보다 앞에 보이도록 z-index를 조정했다.
- 바깥을 누르면 팝업이 닫힌다.
- 데스크톱의 기존 한 줄 날씨 레이아웃은 유지했다.
- 모바일 대기질 텍스트는 온도와 맞춘 약 `14px`이다.
- 마지막 측정값:
  - 날씨 영역 `clientWidth=172`, `scrollWidth=172`
  - 대기질 글자 `14px`
  - `대기질 좋음`이 칸 밖으로 넘치지 않음

관련 파일/기능:

- `src/lib/useLiveWeather.ts`
- `src/lib/weather.ts`
- `src/lib/air-quality.ts`
- `src/lib/warnings.ts`
- `src/app/api/air-quality/`
- `src/app/api/weather-warnings/`
- `src/components/weather/`

### 5.3 MindSet

- 데스크톱 입력은 기존 구조를 유지했다.
- 모바일에서는 두 줄만 입력되도록 제한했다.
- `Enter`로 세 번째 줄을 만들 수 없도록 키 입력을 차단한다.
- 붙여넣기/일반 입력도 줄바꿈 기준 최대 두 줄로 잘라 저장한다.
- 모바일 textarea는 높이 약 `43px`, 카드 높이는 약 `76px`로 고정했다.
- 입력 때문에 카드가 계속 세로로 늘어나지 않게 했다.

### 5.4 도움말 및 의견·버그 문의

- 임시 축약 도움말을 제거하고, 기존 전체 도움말 기능을 모바일에 연결했다.
- `도움말`과 `의견 · 버그 문의` 탭이 모두 보인다.
- 의견·버그 문의에는 `의견 보내기`와 `버그 신고` 하위 탭이 있다.
- 모바일 다이얼로그를 전체 viewport에 맞추고 불필요한 가로 스크롤/스크롤바를 제거했다.
- 탭 글자 크기를 키워 읽을 수 있게 조정했다.
  - 상단 탭 약 `17px`
  - 하위 탭 약 `16px`
- 문의 제목은 약 `20px`, 본문은 약 `13px`로 조정했다.
- 안내 카드의 과도한 줄바꿈과 세로 공간을 줄였다.
- 문구는 다음과 같이 반영했다.
  - 선택지: `개발자 우쭈쭈 🐣`
  - 안내 제목: `개발자 우쭈쭈🐣`
  - 설명: `잘 만든 기능이나 마음에 쏙 든 포인트`
  - 예시: `예: 이 기능, 디테일 너무 좋아요!`
- 의도적인 줄바꿈 없이 한 줄 중심으로 보이게 했다.
- 도움말 및 문의 화면을 실제 브라우저에서 확인했다.

관련 추가 파일:

- `src/components/support/`
- `src/lib/actions/support.ts`
- `src/lib/support-options.ts`

### 5.5 AI 트렌드 브리핑 메인

- 모바일 메인 카드의 이미지/비주얼을 약 `132×124px` 수준으로 키웠다.
- `TODAY'S BRIEF` 영역이 비어 보이지 않도록 글자와 배치를 조정했다.
- 문구를 두 덩어리로 나눠 배치했다.
  - `오늘 AI 흐름을~정리했어요`
  - `업계 변화부터~한눈에 확인하세요`
- 뒤의 흰색 칸을 제거했다.
- 두 번째 문구 색상을 `TODAY'S BRIEF`와 어울리게 진하게 조정했다.
- 전체 설명 그룹을 약간 아래로 내리고 첫 문구를 살짝 오른쪽으로 이동했다.

### 5.6 AI 트렌드 브리핑/뉴스 상세

- `전체 저장` 버튼을 모바일에 맞게 축소했다.
- 뉴스 소스, 날짜, 전체 저장, 원문 보기 화살표가 같은 상단 줄에 배치되게 했다.
- `ZDNet Korea`처럼 긴 소스명에서도 원문 보기 화살표가 아래로 떨어지지 않도록 공통 레이아웃을 조정했다.
- 실제 브라우저에서 AI Times 항목으로 같은 줄 배치를 확인했다.
- 상세페이지 본문, 부제, 메타 글자 크기도 모바일에 맞게 줄였다.

### 5.7 먼슬리 메모 메인

- 날짜 정사각형 칸을 이전보다 크게 조정했다.
- `TODAY` 아래 요약은 왼쪽, `TODAY'S FOCUS` 버튼은 오른쪽에 배치해 빈 공간 비율을 맞췄다.

### 5.8 먼슬리 메모 상세

- 모바일에서 상세 화면을 전체 viewport 기준으로 재배치했다.
- 제목과 날짜 영역을 분리했다.
- 월 이동, Today, `+Create`를 같은 줄에 정리했다.
- 캘린더 날짜 칸은 정사각형으로 유지하고, 넘치는 메모 텍스트 대신 개수 pill을 표시한다.
- 하단 메모 목록 제목은 약 `14px`, 메타 정보는 약 `11px`로 줄였다.
- 모바일에서 `모든 메모 전체보기` 버튼은 숨긴다.

#### +Create 폼

- 폼 너비를 모바일 화면 안에 제한했다.
- 제목 입력의 가로 폭을 기존보다 약 1/5 줄였다.
- 메모 유형, 시작일, 종료일, 별표 영역을 한 줄 메타 영역으로 재구성했다.
- 시작일/종료일 글씨가 한 줄에 나오며, 모바일에서는 날짜 전체 텍스트 대신 작은 달력 아이콘 중심으로 표시한다.
- 메모 유형 드롭다운의 trigger와 열린 panel 폭이 동일하게 맞도록 마지막 CSS 보정을 추가했다.
- 미니 달력은 화면 중앙에 뜨며 폭은 `min(230px, viewport - 36px)` 수준이다.
- 미니 달력이 잘리거나 대형 달력처럼 커지지 않도록 날짜/패딩을 축소했다.
- 서식 에디터 높이, 글자, 도구막대, 저장/취소 버튼을 모바일에 맞게 조정했다.
- 실제 브라우저에서 Create 폼, 메모 유형 드롭다운, 시작/종료일 미니 달력을 열어 확인했다.

### 5.9 포스트잇/메모 보기 및 수정

- 모바일에서는 모든 포스트잇의 기울어지는 회전 효과를 제거했다.
- 색상별 카드, hover, Key Notes 카드에도 `transform: none`을 적용했다.
- 모바일 메모 본문 글자는 약 `15px`로 맞췄다.
- 메모 수정 제목은 약 `17px`로 줄이고 위쪽에 배치했다.
- 메모 유형 옆에 시작일/종료일 아이콘형 입력을 배치했다.
- 수정/삭제 버튼은 하단 우측에 작게 배치했다.
- 모바일에서 `전체보기` 버튼은 숨긴다.
- 서식이 있는 문서형 메모를 일반 `수정`으로 열어도 평문으로 깨지지 않고 문서 편집 모드/상세 에디터를 사용하도록 `openQuickEdit` 로직을 변경했다.
- 이 서식 유지 로직은 사용자가 웹에도 적용하라고 명시한 공통 동작이다.
- 실제 서식 메모를 열어 내용과 서식이 유지되는 것을 확인했다.

### 5.10 Key Notes

- 모바일 메인 화면에는 Key Notes를 3개만 표시한다.
- Key Notes 상세에서 고정 메모만 모아 보는 `전체보기` 상태를 추가했다.
- 전체보기에서는 고정 메모를 한 줄에 2개씩 정사각형에 가깝게 배치한다.
- 뒤로가기 동작을 추가했다.
- 전체보기에서는 중요 메모 섹션을 감추고 고정 메모 목록에 집중한다.
- 실제 브라우저에서 2열 고정 메모 배치를 확인했다.

### 5.11 프로젝트 메인

- 모바일에서는 `아이디어/기획안 작성/개발 중` 상태 텍스트와 숫자를 숨기고 아이콘만 표시한다.
- 상태 아이콘 세 개는 다닥다닥 붙지 않게 간격을 주고 중앙 정렬했다.
- 프로젝트 소개/성장 그래프는 왼쪽, 액션 영역은 오른쪽으로 재배치했다.
- `+ New Project` 버튼을 프로젝트 설명 글의 오른쪽, `Idea Build` 버튼 바로 위 중앙에 배치했다.
- 모바일 New Project 버튼은 약 `136×40px`, Idea Build는 약 `150px` 폭이다.
- 프로젝트 카드의 불필요한 하단 빈 공간을 줄였다.
- Idea Build 버튼은 지나치게 둥근 pill이 아니라 모서리가 둥근 네모에 가깝게 조정했다.
- 현재 배치는 실제 브라우저에서 확인했다.
- 참고: 좁은 왼쪽 열 때문에 설명 문장이 다소 많이 줄바꿈되는 모습은 남아 있다. 사용자가 추가로 지적할 경우 배치 비율만 모바일 범위에서 조정한다.

### 5.12 프로젝트 상세

- 모바일에서는 데스크톱 표의 헤더인 프로젝트명/한줄요약/상태/최근수정을 숨겼다.
- 상태 유형 검색과 `+Project` 버튼을 축소해 같은 줄에 배치하는 모바일 스타일이 들어가 있다.

### 5.13 Today's Focus 상세

- 모바일 전체 viewport에 맞게 상세 레이아웃을 축소/재배치했다.
- 제목, 액션, 카드, chip, 이유, 버튼, footer의 과도한 크기를 줄였다.
- 실제 브라우저에서 확인했다.

### 5.14 Idea Build 상세

- 모바일에서 중앙 정렬하고 전체 viewport에 맞게 조정했다.
- 결과 카드, 글자, 액션 버튼 등 내부 요소를 모바일 가독성에 맞게 축소했다.
- 실제 브라우저에서 확인했다.

### 5.15 웹에서 사용자가 별도로 요청한 에디터 동작

- 다음 세 위치에 `editor-top-btn`을 추가했다.
  - 포스트잇 편집 폼 (`postitEditMode`일 때)
  - 큰 에디터 노드
  - Monthly Memo 폼
- 데스크톱 `min-width: 721px`에서 서식 도구막대는 `position: sticky; top: 8px`로 내려오며 유지된다.
- `↑ 위로` 버튼은 우측 상단에 fixed 방식으로 나타난다.
- 데스크톱 `/` 로그인 세션에서 Monthly Create를 열어 다음을 확인했다.
  - `.editor-top-btn`: 표시됨, fixed
  - `.rich-toolbar`: sticky, top 8px

## 6. 실제 검증 결과

최근 코드 상태에서 실행한 검증:

```powershell
npx.cmd tsc --noEmit --pretty false
git diff --check
```

- TypeScript 검사: 통과, exit code 0
- `git diff --check`: 통과, exit code 0
- `npm lint`는 이전에 120초 timeout으로 종료되어 성공했다고 말하면 안 된다. 오류 출력은 없었지만 완료되지 않았다.

브라우저에서 확인한 화면:

- 390px 모바일 메인
- 로그인/비로그인 상단 헤더
- 날씨 및 대기질 영역과 팝업
- MindSet 두 줄 제한
- 도움말 상세
- 의견·버그 문의 상세
- AI 트렌드/뉴스 상세
- Monthly Memo 상세
- Monthly Memo Create 폼
- 메모 유형 드롭다운
- 시작일/종료일 미니 달력
- 서식 메모 수정
- Today's Focus 상세
- Idea Build 상세
- Key Notes 고정 메모 전체보기
- 프로젝트 메인 카드
- 데스크톱 Monthly Create의 sticky toolbar와 위로가기 버튼

가로 overflow 측정:

- 375px: `innerWidth=375`, `scrollWidth=362`
- 430px: `innerWidth=430`, `scrollWidth=417`
- 두 폭 모두 가로 스크롤 없음.

## 7. 현재 코드의 주의점

- `src/app/dashboard.css` 아래쪽에 반복 수정 과정에서 다음 모바일 override 블록들이 누적되어 있다.
  - `Mobile refinement pass`
  - `Mobile refinement overrides — keep last in cascade`
- 마지막 cascade가 현재 실제 검증된 결과이므로, 단순 정리를 이유로 성급하게 합치거나 삭제하지 않는다.
- CSS 정리가 필요하다면 먼저 화면 스크린샷/치수를 확보하고, 동작을 보존하는 범위에서만 진행한다.
- 기존 사용자의 미커밋 변경을 덮어쓰거나 되돌리지 않는다.

## 8. `skillpilot-master-wt*` 폴더 설명

- `skillpilot-master-wt`, `skillpilot-master-wt2`는 과거 생성된 약 483MB 규모의 master 스냅샷성 worktree/복사본이다.
- `skillpilot-master-wt3`, `skillpilot-master-wt4`, `skillpilot-master-wt5`는 비어 있는 폴더로 확인됐다.
- 이 폴더들은 현재 모바일 개발용 worktree가 아니다.
- 현재 모바일 개발용은 오직 `skillpilot-mobile-responsive`다.
- 사용자의 명시적 삭제 요청 없이 `skillpilot-master-wt*`를 삭제하지 않는다.

## 9. 새 대화 시작 체크리스트

새 Codex 대화에서는 아래 순서로 바로 이어간다.

1. 이 `CODEX_HANDOFF.md`를 처음부터 끝까지 읽는다.
2. `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot-mobile-responsive`로 이동한다.
3. `git branch --show-current`가 `mobile-responsive`인지 확인한다.
4. `git status --short`로 위 미커밋/미추적 파일이 유지되는지 확인한다.
5. 서버가 없으면 `npm.cmd run dev -- -p 3001 --webpack`으로 실행한다.
6. 인앱 브라우저에서 `http://localhost:3001/mobile-preview`를 연다.
7. 폭은 우선 `390`을 선택한다.
8. 필요하면 테스트 계정으로 직접 로그인한다.
9. 사용자가 지적하는 메인/상세 화면을 실제로 열어 확인한 뒤 수정한다.
10. 수정 후 390을 먼저 검수하고 375/430에서 깨짐과 가로 overflow만 점검한다.
11. 데스크톱에 영향이 없는지 `http://localhost:3001/`에서도 필요한 범위만 확인한다.
12. 사용자가 요청하기 전에는 commit/push/reset/clean을 하지 않는다.

## 10. 바로 이어서 작업할 때의 핵심 요약

- 현재 작업은 완료 커밋이 아니라 여러 모바일 개선이 들어간 **미커밋 진행 상태**다.
- 반드시 모바일 전용 worktree/branch를 사용한다.
- 모바일 기준 폭은 390px이고 확인 주소는 `http://localhost:3001/mobile-preview`다.
- 로그인과 상세페이지 직접 확인은 필수다.
- 데스크톱은 위에 적은 두 가지 명시적 예외 외에는 건드리지 않는다.
- 현재 브라우저 검수와 TypeScript 검사는 통과한 상태다.
- 다음 사용자 피드백이 오면 기존 변경을 보존한 채 해당 항목만 최소 범위로 이어서 수정한다.

## 11. 2026-08-12 추가 모바일 정밀 보정

사용자의 후속 피드백 11개를 `mobile-responsive` 브랜치의 기존 미커밋 작업 위에 추가 반영했다.

- 대기질 `좋음` 문구:
  - 모바일 날씨 폭을 2px만 미세 확장하고 내부 패딩을 조정했다.
  - 글자는 `13.2px`, 진한 ink 색상으로 설정했다.
  - 390px 실측: weather `clientWidth=174`, `scrollWidth=174`, AQ 폭 약 `80.3px`; 잘림 없음.
- 의견·버그 문의:
  - 보내기 버튼을 약 `72×36px`, 글자 `13px`로 축소했다.
  - 의견/버그 textarea 높이를 `165px`로 늘렸다.
  - `개발자 우쭈쭈🐣` 카드에서 설명 다음 줄에 예시가 표시되도록 했다.
  - 버그의 `문제가 발생한 기능`을 나열형 chip에서 기존 유리질 톤의 `선택` 드롭다운으로 변경했다.
- MindSet:
  - 모바일 textarea의 내부 세로 스크롤을 완전히 숨겼다.
  - scroll 이벤트에서도 scrollTop을 0으로 되돌리고, 기존 최대 두 줄 입력 로직을 유지했다.
  - 390px 실측: clientHeight/scrollHeight 모두 `43px`, overflow hidden.
- AI Trend Briefing 상세:
  - 제목과 점을 하나의 왼쪽 heading으로 묶어 왼쪽 정렬했다.
  - 각 `전체 저장` 버튼을 약 26px 높이, 9.5px 글자로 더 축소해 우측에 배치했다.
- Monthly Memo Create:
  - placeholder를 `제목`으로 변경했다.
  - 확장 버튼을 서식 toolbar에서 제거하고 제목 입력 우측 상단으로 이동했다.
  - 작성 중에는 월 달력/메모 목록을 숨겨 독립된 새 작성 화면처럼 보인다.
  - 실제 390px에서 달력 목록 hidden, toolbar 확장 hidden, 제목 우측 확장 visible을 확인했다.
- 미니 달력:
  - `inset: 50% ... 50%`와 `translate3d`를 첫 frame부터 적용하고 위치 transition/animation을 제거했다.
  - 390px에서 즉시 중앙 위치, 폭 230px, transition 0초를 확인했다.
- 프로젝트 메인:
  - Idea Build 버튼만 `top: 16px`로 두 단계 정도 아래로 이동했다.
- 프로젝트 입력:
  - 프로젝트명과 상태를 한 줄 `231.5px / 106px` 비율로 배치했다.
  - 상태 trigger는 높이 40px, 글자 12px로 축소했다.
  - 기본 템플릿은 약 `68×30px`, 확장은 약 `57×30px`, 글자는 11px로 축소해 나란히 배치했다.
- 최종 반응형 가로 overflow 확인:
  - 375: inner 375 / document scroll 362
  - 390: inner 390 / document scroll 377
  - 430: inner 430 / document scroll 417
  - 세 폭 모두 가로 overflow 없음.
- 이 추가 작업에서도 production 컴포넌트의 데스크톱 레이아웃은 변경하지 않고 모바일 CSS 범위로 제한했다.

## 12. 2026-08-13 웹 변경 반영 및 모바일 상세 축소

사용자가 웹 원본에 이미 들어간 compact 구조를 모바일에도 반영해 달라고 요청했다. 원본 저장소는 read-only로 비교하고, 실제 코드는 계속 `skillpilot-mobile-responsive` / `mobile-responsive`에만 수정했다.

- 대기질 tooltip:
  - `WeatherMeta`가 trigger의 실제 viewport 좌표를 계산한다.
  - 미세먼지/초미세먼지 창을 trigger 바로 아래 7px 간격에 fixed 방식으로 표시한다.
  - scroll/resize에도 trigger 위치를 다시 계산한다.
  - 기존 weather overflow에 잘리지 않고 MindSet보다 앞에 표시되는 구조를 유지했다.
- 버그 신고 기능 선택:
  - native `<select>`를 제거했다.
  - 프로젝트 상태/메모 유형과 같은 glass trigger + custom option panel로 변경했다.
  - trigger 42px/13px, option 35px/12px, panel 최대 높이 240px 및 내부 scroll.
  - 실제 390px에서 11개 option, glass gradient, 크기 확인.
- 채용공고:
  - 회사/점핏/원티드 등의 source pill은 `max-content`로 글자 길이만 차지한다.
  - 주요 업무/자격요건/우대사항 label과 emoji를 15.5px로 확대했다.
  - 2026-08-13 localhost 세션에는 수집된 공고가 없어 실제 카드 데이터 시각 검증은 못 했지만 공통 job-card selector에 적용했다.
- Idea Build / Today's Focus:
  - 결과 헤더의 Idea ON 장식 버튼을 8px 아래로 내렸다.
  - 재생성 버튼을 내용 크기에 맞춘 fit-content, 약 40px 높이로 줄였다.
  - History preview의 padding/title/card/meta를 축소하고 2열 compact grid로 변경했다. 두 상세페이지 공통 적용.
- Idea Build 프로젝트 저장 overlay:
  - 프로젝트에 저장/프로젝트명만 저장/이어붙이기 confirmation overlay에 `fixed-overlay idea-save-overlay` class를 추가했다.
  - 상단이 아닌 현재 viewport 중앙에 표시한다.
  - picker 최대 330px, confirm 최대 282px, 62dvh 안에서 scroll하며 버튼/목록/제목을 모두 축소했다.
- Monthly Memo:
  - Create rich editor를 48dvh(390px 실측 약 308px)로 늘렸다.
  - 취소/저장 버튼은 34px/12px로 줄이고 하단 공간을 확보했다.
  - 상세 제목 아래 날짜는 16px.
  - 하단 제목·본문 검색은 글자/placeholder 16px, 높이 44px, 가로 폭 유지.
- Key Notes 고정 메모:
  - post-it 상세의 pin emoji/star와 Unpin 버튼을 오른쪽 compact action으로 정리했다.
  - star 20×26px/15px, Unpin 26px/9.5px로 줄여 제목 열이 `minmax(0,1fr)` 공간을 더 사용한다.
- 프로젝트 메인:
  - Idea Build를 기존 16px에서 24px 아래로 내려 성장 그래프의 세로 중심에 더 가깝게 맞췄다.
- 프로젝트 목록 상세:
  - `프로젝트 아이디어` header 20px, total badge 10px.
  - 검색 40px/13px.
  - 상태 필터와 +Project를 같은 줄 1:1로 배치. 390px 실측 168px/168px, 높이 36px, 글자 12px.
  - 목록 row, title, summary, updated, status badge, legend를 모두 compact하게 축소했다.
- 프로젝트 기존 항목 보기:
  - dialog header 16px, 프로젝트명 17px, summary 12px.
  - 상태/업데이트, 프로젝트 노트 label/body, h1/h2/h3, 하단 네 버튼을 모두 모바일 비율로 축소했다.
  - 프로젝트 note body 13px, padding 11px 10px.
- 프로젝트 생성/수정:
  - `최대 30자` badge와 `0 / 30` counter DOM을 제거했다. maxLength 로직은 유지한다.
  - 한 줄 요약 label 12px, input 38px/14px, 위 여백 8px.
  - 프로젝트 내용 영역은 46dvh 최소 높이, 13px로 설정했다.
  - 취소/저장 버튼은 34px/12px.
  - 실제 390px에서 badge/counter count 0, 요약 input 38px, action 34px 확인.
- 검증:
  - `npx.cmd tsc --noEmit --pretty false --incremental false`: 통과(exit 0, 약 88초).
  - `git diff --check`: 통과.
  - 390px에서 버그 dropdown, Monthly Create, 프로젝트 목록, 기존 프로젝트 보기/수정, Key Notes 고정 메모를 직접 열어 확인했다.
- `dashboard.css`의 `2026-08-13 final mobile cascade`는 반드시 파일 마지막에 유지한다. 이전 mobile override가 많아서 이 최종 블록의 순서가 실제 검증된 결과에 중요하다.

## 13. 2026-08-13 최신 웹 재대조 및 모바일 미세 조정

사용자 지적에 따라 최신 웹 원본과 모바일 브랜치의 해당 렌더링을 다시 대조했다. 이전 반영은 요청 구간 중심의 선택 반영이었으며 웹 원본 전체 동기화가 아니었다. 따라서 앞으로도 “최신 웹 전체가 반영됐다”고 단정하지 말고, 요청된 구간을 원본과 직접 비교한 뒤 답한다.

- AI 뉴스/트렌드 상세의 마지막 업데이트 문구:
  - 모바일 브랜치에만 남아 있던 `최신 업데이트 실패, YYYY-MM-DD 결과 표시 중` suffix를 두 곳 모두 제거했다.
  - 최신 웹 원본과 동일하게 `🕐 마지막 업데이트: ...`만 표시한다.
- 대기질 tooltip:
  - 고정 `min-width: 184px`를 제거하고 `width: max-content`, `min-width: 0`, padding `7px 10px`로 내용 폭에 맞췄다.
  - 실제 390px에서 폭 약 143px, trigger 바로 아래 약 7px 간격을 확인했다.
- 채용 상세:
  - 주요 업무/자격요건/우대사항 소제목과 emoji 크기를 모바일에서 정확히 14px로 설정했다.
- Monthly Memo 검색:
  - 가로 폭은 유지하고 글자/placeholder 16px, 높이 약 42px로 위아래만 소폭 축소했다.
  - 실제 390px에서 폭 약 303.5px, 높이 약 42px, font-size 16px를 확인했다.
- Idea Build 저장 관련 선택/확인창:
  - viewport/다이얼로그 상단 기준 fixed overlay를 제거했다.
  - JSX 렌더 위치를 프로젝트 저장 action 바로 다음으로 옮기고 모바일에서는 inline compact panel로 표시한다.
  - 실제 390px에서 `프로젝트에 저장` 버튼 아래 약 8px 간격, panel 폭 330px를 확인했다.
- Idea Build 프로젝트 선택/랜덤 버튼:
  - 높이 36px, 글자 12px, padding `0 11px`, icon 14px, radius 12px로 축소했다.
  - 실제 390px에서 프로젝트 선택 약 `107×36px`, 랜덤 약 `63×36px`를 확인했다.
- 검증:
  - `npx.cmd tsc --noEmit --pretty false --incremental false`: 통과.
  - `git diff --check`: 통과.
  - `/mobile-preview` 390px에서 대기질 tooltip, Monthly Memo 검색, Idea Build 모드 버튼과 프로젝트 저장 선택창을 직접 열어 좌표와 크기를 확인했다.

## 14. 2026-08-13 Idea Build 하단 간격 축소

- 모바일 Idea Build 결과 상세에서 프로젝트 선택/랜덤 행의 아래 margin을 2px로 줄였다.
- 재생성 버튼의 위 margin을 제거해 선택 버튼 행 바로 아래에 붙였다.
- 생성 시간·횟수 문구는 9px로 크게 축소했다.
- 생성 정보와 History를 다시 한 줄에 배치하고 footer 위 간격을 4px로 줄여 하단 내용을 모두 위로 당겼다.
- History 버튼도 28px 높이/10px 글자로 축소했다.
- 실제 390px에서 선택 행→재생성 약 2px, 재생성→footer 약 4px, 생성 정보 글자 9px를 확인했다.
- `git diff --check` 통과.

## 15. 2026-08-13 Idea Build 헤더 미세 조정

- 모바일 Idea Build 상세의 장식용 `Idea ON` 배지만 기존 위치에서 6px 왼쪽으로 이동했다.
- 세로 위치와 닫기 버튼, 제목 영역은 변경하지 않았다.
- 실제 390px 상세에서 computed `left: -6px` 적용을 확인했다.

## 16. 2026-08-13 Idea Build 재생성 정렬 및 웹 최신본 대조 원칙

- 모든 모바일 수정 전에 로컬 웹 원본 `skillpilot`의 동일 기능 JSX/CSS를 먼저 대조한다. 웹 원본의 최신 변경을 확인하지 않은 채 모바일 이전 코드만 기준으로 수정하지 않는다.
- 웹 코드는 수정하지 않고 `skillpilot-mobile-responsive` / `mobile-responsive`에서만 모바일 보정을 적용한다.
- Idea Build 결과 상세의 재생성 버튼을 중앙에서 왼쪽 정렬로 변경했다.
- 재생성 버튼의 왼쪽 끝을 프로젝트 선택/랜덤 행의 왼쪽 끝과 동일하게 맞췄다.
- `복사/저장 action 행 → 프로젝트 선택 행`의 실제 간격 10px을 기준으로, `프로젝트 선택 행 → 재생성 버튼`도 10px으로 맞췄다.
- 실제 `/mobile-preview` 390px에서 두 간격 모두 약 10px, mode/regen left 모두 약 14.83px로 확인했다.

## 17. 2026-08-13 웹 최신 변경 전체 동기화

사용자가 웹 최신 변경이 모바일에 반영되지 않았다고 지적했고, 실제 Git 기준으로 누락을 확인했다.

- 동기화 전 상태:
  - 모바일 `mobile-responsive`는 웹 `master`보다 20개 커밋 뒤였다.
  - 웹 작업 폴더에는 추가로 14개 수정 소스 파일, `src/lib/jobs/filter.check.ts`, `supabase/day19_migration.sql`이 미커밋 상태로 존재했다.
- 안전 조치:
  - 기존 모바일 작업은 타입 검사와 `git diff --check` 통과 후 `770a607` 체크포인트로 보존했다.
- 반영 내용:
  - 웹 `master`의 누락된 20개 커밋을 모바일 브랜치에 병합했다(`d5529be`).
  - 웹 작업 폴더의 최신 미커밋 서비스 변경과 Day19 파일까지 모바일에 반영했다(`f7803f5`).
  - 모바일 전용 인증 비율, 도움말 custom dropdown/문구, 대기질 tooltip 위치 계산은 웹 최신 기능 위에 다시 복원했다(`f22701f`).
  - 동기화 후 Idea Build 모바일 전용 정렬/크기 cascade를 파일 마지막에 복원했다(`ea16056`).
- 실제 확인된 웹 최신 UI 신호:
  - 메인 Job Description에 새 `직무 재설정 필요` 상태가 표시된다.
  - Idea Build 복사 버튼 문구가 최신 웹의 `전체복사`로 표시된다.
- 390px Idea Build 최종 실측:
  - action→프로젝트 선택 10px, 프로젝트 선택→재생성 10px.
  - 프로젝트 선택과 재생성의 left 좌표 동일(약 37.83px), 재생성은 왼쪽 정렬.
  - 생성 정보 9px.
- 검증:
  - `npx.cmd tsc --noEmit --pretty false --incremental false`: 통과.
  - `git diff --check`: 통과.
  - 로그인된 `/mobile-preview` 390px에서 메인과 Idea Build 상세를 직접 확인했다.
- 앞으로 “웹 최신 반영”은 특정 JSX/CSS 한두 곳 비교가 아니라 아래를 모두 확인해야 한다.
  1. `mobile-responsive..master` 누락 커밋
  2. 웹 `skillpilot` 작업 폴더의 tracked 미커밋 변경
  3. 웹 작업 폴더의 관련 untracked 소스/마이그레이션
  4. 반영 후 390px 로그인·상세페이지 실검증

## 18. 중요 정정 — 웹 동기화 시 모바일 UI 파일 덮어쓰기 금지

17절의 최초 동기화 방식은 잘못됐다. 웹 최신 `Dashboard.tsx`/`dashboard.css`를 충돌 기준으로 선택하면서 기존 모바일 세부조정이 대량 소실됐다. 이후 아래 방식으로 복구했으며 앞으로 반드시 이 원칙을 따른다.

- 복구 커밋: `2223146 Restore detailed mobile UI after web sync`.
- `770a607` 체크포인트에서 기존 모바일 `src/app/Dashboard.tsx`, `src/app/dashboard.css`를 그대로 복구했다.
- 최신 웹과 연결에 필요한 최소 변경만 다시 추가했다.
  - 최신 `JobsView` 타입 연결
  - `isAdmin`, `hasLegacyRoles` optional prop 수용
  - 웹의 뉴스/채용 client-side 지연 조회 action 연결
- 절대 금지:
  - 웹 `Dashboard.tsx`, `dashboard.css`, `auth.css` 전체를 모바일 파일 위에 checkout/copy하지 않는다.
  - 충돌 시 `--theirs`로 UI 파일 전체를 선택하지 않는다.
  - “웹 최신 반영”을 파일 전체 동기화로 해석하지 않는다.
- 올바른 반영 절차:
  1. 웹 변경 diff를 hunk/기능 단위로 읽는다.
  2. 데이터 타입, server action, API, DB migration 같은 기능 변경부터 모바일에 반영한다.
  3. Dashboard JSX는 새 기능에 필요한 상태/조건/버튼만 기존 모바일 구조 안에 최소 삽입한다.
  4. 웹 CSS는 새 class에 필요한 규칙만 가져오고 기존 모바일 cascade는 유지한다.
  5. 390px에서 기존 메인·각 상세페이지의 실측값을 재검증한다.
- 복구 후 실제 390px 확인:
  - document viewport/scrollWidth 모두 390px.
  - Monthly 검색 16px, 높이 42px, 모바일 Create 존재.
  - Key Notes 고정 전체보기 버튼 및 고정/중요 메모 레이아웃 존재.
  - Idea Build action→mode 10px, mode→재생성 10px, 동일 left 정렬.
  - Idea Build 생성 정보 9px, Idea ON `left: -6px`.
- 복구 후 `npx.cmd tsc --noEmit --pretty false --incremental false` 및 `git diff --check` 통과.
