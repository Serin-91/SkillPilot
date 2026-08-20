# SkillPilot 모바일 이식 — 다음 세션 인계 문서

최종 갱신: 2026-08-20 (KST). 이 문서 하나만 읽으면 이어서 작업 가능하도록 작성함.
(구 `CODEX_HANDOFF.md`는 2026-08-13 기준으로 멈춰 있고, 이전 `HANDOFF_NEXT_CLAUDE.md`(2026-08-19 오전판)는
이 문서로 완전히 대체됨 — 그 시점 이후 작업량이 방대해서 참고할 필요 없음.)

## 1. 지금 상태 파악 — 절대 이것부터

```bash
cd "C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot"
git log --oneline -10
git status --short
```

최근 커밋 (rollback 금지, 이 위에서 이어서 작업):
```
556ff85 Fix Key Notes header overlap, toolbar selection sync and heading sizing
2a2f802 Tighten memo spacing and fix mobile toolbar, Key Notes pin, Focus/Idea layout
813e50a Fix Key Notes pin drag freeze and make date validation reachable
b4c9aa1 Fix mobile date validation, toolbar font menu and Focus/Idea sizing
f1b457a Fix mobile gaps across weather, project, memo, Key Notes and support
f5bacbc Fix News/Job/Projects mobile gaps from live feedback + selector-diff
```
`git status --short`에 `.claude/launch.json`만 M으로 남아있는 게 정상 (의도적으로 매번 커밋에서 제외함, 개인 dev-server 설정이라 로컬 전용).

## 2. 아키텍처 (변경 없음, 이전 문서와 동일)

- **`skillpilot`** (`C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`, branch `master`) — **여기가 유일한 작업 대상**. 데스크톱+모바일 코드가 한 파일에 공존 (`src/app/dashboard.css`의 `@media (max-width: 720px)` 블록들이 모바일).
- **`skillpilot-mobile-responsive`** (branch `mobile-responsive`) — **READ-ONLY 참고용**. 기능은 낡았지만 모바일 CSS 값 자체는 검증된 최종본. 절대 수정/checkout/merge 금지.
- 로컬 dev 서버: `localhost:3000` = skillpilot(master), `localhost:3001` = skillpilot-mobile-responsive.
- **`.claude/launch.json` 주의(이번 세션에 바뀜)**: `skillpilot`(3000)은 `runtimeArgs`에 `-p 3000` 고정 + `autoPort:false`로 명시했다 — 로그인 세션이 `localhost` 오리진에 묶여 있어서 포트가 바뀌면 세션이 깨진다. `skillpilot-mobile-ref`(3001)는 이미 떠 있는 별도 프로세스에 **attach만** 하도록 `url: "http://localhost:3001"`로 바꿨다(명령 없음) — Next.js는 같은 디렉터리에 dev 서버 두 개를 못 띄우므로, 3001이 사용 중이면 `preview_start`로 새로 띄우려 하지 말고 그냥 이 attach 설정으로 붙을 것.
- 로그인 세션은 "localhost" 도메인 쿠키(httpOnly)라서 3000/3001 어느 한쪽에 로그인하면 둘 다 로그인된다 — 단, **브라우저 프로필이 다르면 공유 안 됨** (Claude Browser 패널 vs 사용자 실제 Chrome은 별개 세션). 테스트 계정: `skillpilot.dev.admin@gmail.com` / `testpassword123` — **이 비밀번호를 Claude가 직접 입력하는 것은 금지 규칙이라 절대 하지 말 것**, 사용자가 자신의 브라우저(Claude Browser 패널이든 실제 Chrome이든)에서 직접 로그인하게 안내할 것.
- headless 환경이라 `computer`(screenshot/click) 액션은 항상 실패한다. 검증은 `getBoundingClientRect()`/`getComputedStyle()`로. React 클릭은 먼저 `element.click()`을 시도하고 안 먹으면 `el[Object.keys(el).find(k=>k.startsWith('__reactProps'))].onClick({stopPropagation(){}, preventDefault(){}})`로 fiber prop 직접 호출 — **단, portal된 팝업(⋮ 시트 안 미니달력 등)은 이 두 방법 다 실제 pointerdown 이벤트 시퀀스를 흉내내야 진짜 버그를 재현한다(5절 참고, 실제 사고 사례 있음)**.

## 3. 이번 세션(2026-08-19~20)에 처리한 것 — 커밋 6개, 8개 배치

사용자가 4~5차례에 걸쳐 매우 구체적인 모바일 UI 버그 리스트를 줬고, 그때마다 라이브 브라우저 대조로 원인을 찾아 고쳤다. 아래는 "무엇을 왜 고쳤는지"의 요약 — 코드 diff 자체는 git log로 보는 게 정확하다.

### 3-1. 치명적 버그(로직 오류, CSS 아님) — 반드시 알아둘 것
- **날짜 검증 없음**: 시작일 > 종료일이어도 조용히 저장되던 버그. 저장 경로가 3개(저장 버튼 / Monthly MEMO 뒤로가기 나가기 / 포스트잇 뒤로가기 나가기)인데 전부 무검증이었다. **1차 수정(저장 시점 검사)도 불완전했다** — `memoFormOpen`이 false인 특정 경로에서 문구 없이 다이얼로그가 그냥 닫혀버림. **최종 수정**: `useEffect`로 `formStartDate`/`formEndDate`가 바뀌는 즉시 검사하도록 옮김(`validateMemoDates` + `memoDateError` state). 저장/나가기 가드는 안전망으로 유지.
- **Key Notes 고정메모 드래그가 웹에서 멈춤**: `onDragOver`가 커서가 멈춰있어도 초당 수십 번 발사되는데 매번 `setPinnedDragOrder`를 호출해 Dashboard 전체가 리렌더됨. HTML5 draggable은 터치에서 `dragstart`가 안 떠서 모바일에서도 아예 작동 안 함. 관심 직무 우선순위(PriorityList)와 같은 Pointer Events 방식으로 전환, 카드가 실제로 자리를 바꿀 때만 렌더.
- **모바일 서식툴바 글씨크기 메뉴가 세로로 340px 부풀어 툴바를 밀어냄**: `.mobile-font-size-menu`에 위치 지정이 아예 없어 position:static인 채 10항목x34px 블록으로 펼쳐졌음. 트리거 위 드롭다운(76px x 최대190px, 스크롤)으로 되돌림.
- **웹 서식툴바 글씨크기 드롭다운이 잘림**: `.rich-toolbar`가 sticky라 스크롤 컨테이너가 absolute 메뉴를 클리핑. overflow 개방.
- **모바일 미니달력 날짜 클릭이 안 먹힘**: 달력 팝업이 `.mobile-options-backdrop`으로 portal되어 `.mobile-options-sheet` 바깥에 붙는데, outside-press 캡처 핸들러 허용 목록에 sheet만 있어서 실제 터치 pointerdown에서 시트가 먼저 닫히고 click이 도달 못함. **합성 click으로는 재현이 안 되고 실제 PointerEvent 시퀀스로만 재현됨** — 이 패턴(portal된 요소 + outside-press 핸들러)은 다른 곳에도 있을 수 있으니 의심할 것.
- **툴바가 텍스트 선택에 반응 안 함**: `onSelectionUpdate` 콜백이 없어 글자를 선택해도 현재 글씨크기/B/I/U 활성 표시가 갱신 안 됨. 추가함.
- **H1~H3로 바꿔도 글씨가 안 커짐**: 크기는 em으로 정해지는데 글자에 font-size 마크(span)가 붙어있으면 그 span이 이겨서 여백만 바뀐 것처럼 보임. heading 적용 시 font-size 마크 제거.

### 3-2. 고정메모 전체보기 상단 겹침 — 3번 수정 시도 끝에 진짜 원인 발견
사용자가 "왜 이걸 계속 안 고치냐"고 화낼 정도로 반복 실패했던 케이스. **1·2차 수정은 카드의 압정(핀 이모지)을 겨냥했는데 틀렸다.** 실제로 뒤로가기 버튼과 겹친 건 **"고정 메모 N개" 그룹 제목**이었다 — 전체보기에서 `dialog-head`가 9px로 접히며 제목이 위로 올라와 좌상단 버튼(t=3~43, l=7~47)과 정면 충돌. getBoundingClientRect로 후보를 하나씩 좁히지 않고 "카드 압정이겠지"라고 짐작한 게 실패 원인 — **겹침/배치 버그는 반드시 해당 영역 전체를 스캔해서 실제로 겹치는 요소가 뭔지 좌표로 확인할 것, 사용자가 지목한 요소 이름을 액면 그대로 믿지 말 것.**

### 3-3. 나머지 처리 항목 (CSS/레이아웃)
- 날씨 pill: 고정폭 제거, 온도 탭 → 지역/습도 툴팁 추가(대기질과 동일 컴포넌트 WeatherTrigger 공유, WeatherTempTrigger.tsx 신설), 숨긴 지역명 뒤 가운뎃점 잔존 문제, 툴팁 화면 밖 clamp.
- 프로젝트: 목록 타이포 확대, 뒤로가기를 다른 다이얼로그와 동일 40x40 버튼(38px 글리프)으로 통일, 상태/요약 폼 필드 크기/순서, 한 줄 요약 팝오버를 absolute로 겹쳐 띄워 제목 안 밀리게.
- 포스트잇/메모: 저장 버튼 제거 + 나가기 시 자동 전체저장(handlePostitBack), 별표/압정을 순환식(빈별→중요→고정→빈별)으로(기존엔 해제만 가능했음), 회전 효과 모바일만 제거, 제목~본문 여백 축소, 검정 포스트잇 아이콘 흰색.
- Today's Focus / Idea Build: 3001에 있던 모바일 블록이 3000에 통째로 없었음 — 포팅. 헤더 닫기 버튼 위치 통일, 헤더 한 줄 정렬, 히스토리 타이포, Idea 결과 본문/부제목 크기 재조정(13→14.5px, 부제목 16.5px), "왜 이 방향인가요" 박스 아이콘 제거+왼쪽정렬, 재생성 버튼 337→187px 축소.
- My Page, 도움말, 의견/버그 문의: 전체화면 규칙 누락 복구, 타이포 축소, 맞춤법.
- 관심 직무 우선순위: 화살표 버튼 제거하고 드래그 전용으로(Pointer Events, 웹+모바일 공통), 드래그 중 텍스트 선택 방지.

## 4. 아직 안 됐거나 확인 못 한 것 (다음 세션 우선순위)

**중요: 아래 항목들은 코드는 넣었지만 로그인 세션이 만료되거나 다이얼로그가 안 열려서 실물 미검증인 것과, 아예 손 못 댄 것이 섞여 있다. 구분해서 접근할 것.**

- **웹 글씨크기 드롭다운 클리핑 수정 (코드는 있음, 미검증)**: +Create 버튼이 프로그래밍 클릭으로 안 열려서 확인 못함. 데스크톱 뷰포트에서 Monthly MEMO 새 메모 → 서식툴바 → 글씨크기 드롭다운을 열어 확인할 것.
- **Idea Build 생성 전 화면 (손 못 댐)**: "Idea ON" 버튼이 너무 크다는 지적. 하루 2회 생성 제한 때문에 세션 내내 생성 전 화면에 진입을 못했다. 다음날 리셋되면 확인.
- **Idea Build 프로젝트 선택 목록 (손 못 댐)**: "프로젝트에 저장 시 나오는 목록이 꼴사납다" — idea-source-picker / idea-save-overlay 관련. 3001에 관련 클래스가 있는데 3000 JSX에 없는 경우가 많아 selector-diff로는 못 찾는다. 실제로 열어서 봐야 함.
- **Idea Build 내부 글씨 재조정**: 이미 한 차례 조정했지만 "부제목만 조금 키우고 나머진 잘 맞춰야 함"이라는 후속 피드백이 옴 — 현재 값(본문 14.5px/부제목 16.5px)이 최종은 아닐 수 있음. 사용자가 실제로 보고 판단해야 하는 영역.
- **뉴스/채용공고 전체저장 시 모바일 글씨 크기 20px 상한**: "모바일 기본 글씨는 16, 뉴스/채용공고 저장 글씨는 20까지만"이라는 요청 — 저장 경로에 폰트 크기 클램프 로직을 넣어야 하는데 이번 세션엔 손 못 댐.
- **고정메모 캐러셀 카드 크기 균일화 (코드는 있음 미검증)**: height:190px 고정으로 넣었지만 실제 렌더 미확인.
- **제목 아래 여백 추가 축소**: 이미 한 차례 절반으로 줄였는데 사용자가 그래도 넓다고 재차 언급한 이력 있음 — 반절 더 줄여야 할 수도. 실측 후 판단.

## 5. 재발 방지 — 이번 세션에서 새로 배운 함정 (구 문서 7절에 추가)

- **사용자가 "몇 번 수정했는데 안 고쳐졌다"고 하면, 이전 수정이 겨냥한 요소 자체가 틀렸을 가능성을 최우선으로 의심할 것.** 같은 CSS 값을 반복해서 만지지 말고, 해당 영역 전체를 getBoundingClientRect로 스캔해서 실제 겹침/버그를 좌표로 재확인해야 한다(3-2절 사례).
- **portal된 팝업(더보기 시트, 미니달력 등) + outside-press 캡처 핸들러 조합은 특히 취약하다.** 합성 클릭으로는 버그가 재현 안 되고 실제 PointerEvent 시퀀스가 필요할 수 있다 — "합성 클릭으로 됐으니 정상"이라고 성급히 결론내지 말 것.
- **"제목/버튼/아이콘이 다른 곳이랑 다르다"류 피드백은 실제로 다른 다이얼로그의 값을 재서 비교할 것.** 이번 세션에 뒤로가기 버튼(40x40, ::before 38px), 닫기 버튼 위치(t=3,l=7) 등 표준값이 이미 여러 다이얼로그에 존재하므로 새로 만들지 말고 그 값을 그대로 가져다 쓴다.
- **CSS만으로 못 고치는 기능 버그(날짜 검증, 드래그 멈춤, 툴바 selection sync)가 이번 세션에 3건 나왔다.** "모바일 크기가 이상하다"는 요청이라도 항상 로직 버그 가능성을 먼저 배제할 것 — useState/useEffect 의존성, 이벤트 발사 빈도(dragover 등), 렌더 시점 문제를 확인.
- **하루 사용량 제한이 있는 기능(Idea Build 하루 2회)은 세션 중 검증 기회가 제한된다.** 이런 기능을 다음 세션에 넘길 땐 몇 회 남았는지를 미리 확인하고 계획할 것.
- **launch.json에서 autoPort와 고정 포트 지정을 섞어 쓸 때, "같은 디렉터리에 dev 서버 두 개 못 띄움" 에러와 "포트 충돌" 에러를 구분할 것.** 전자는 포트를 바꿔도 안 풀리고, 이미 떠 있는 서버에 url만 지정해 attach하는 게 정답이다(2절 참고).

## 6. 사용자 성향 메모 (누적)

- 한국어로 대화 요청함.
- 피드백은 번호를 매겨 한 번에 몰아서 준다 — 그 안에 "치명적 버그"라고 명시한 항목은 최우선으로 먼저 처리하고 별도로 보고할 것.
- **모호한 지적을 반복해도 원인을 못 찾으면 사용자가 명확히 화를 낸다** (왜 이거를 자꾸 수정 안 하고 넘어가는지 지적받음) — 이럴 땐 변명하지 말고 즉시 전체 스캔으로 재확인하는 게 맞다(5절 참고).
- 실제로 써보고 정확한 배치 지시를 준다 — 좌표/방향까지 구체적으로 말하는 피드백은 그대로 코드로 옮길 것.
- 진행 중 "이렇게까지 고칠 게 많으면 괜한 짓 했나" 자조하는 순간이 있었음 — 이럴 땐 "3001에 있던 모바일 규칙이 3000에 아예 빠져있던 경우가 실제로 많았다"는 근거를 들어 작업이 헛되지 않았음을 담백하게 알려주면 됨(과하게 위로하지 말 것).
- 토큰 부족을 직접 언급하며 절약을 요청한 적 있음 — 이런 요청이 오면 라이브 검증 횟수를 줄이고 확신 있는 수정 위주로 빠르게 진행할 것.
- 세션 끝나기 전에 항상 handoff 갱신을 명시적으로 요청함 — 매 세션 종료 시 이 문서를 갱신하는 걸 기본값으로 여길 것.
- 비밀번호/로그인 절차를 Claude가 대신 하길 원한 적 있었으나 **거절이 맞는 케이스였다** — 이런 요청은 직접 로그인해달라고 안내하고 대안(Claude Browser 패널에서 직접 로그인, 또는 다른 검증 방법)을 제시할 것.
