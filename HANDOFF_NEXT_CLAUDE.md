# HANDOFF 운영 규칙 — 먼저 읽어라

**이 파일은 역사 기록이 아니라 다음 Claude를 위한 현재 인계서다.**

1. **새 절을 append하지 않는다.** 세션이 끝날 때 **기존 내용을 현재 상태로 교체**한다.
2. 남기는 것은 **BASELINE / ARCHITECTURE / CONTRACTS / OPEN / CLOSED / NEXT / VERIFICATION / REFERENCES** 뿐이다.
3. **해결된 버그의 조사 과정·실패 실험·과거 수치를 보존하지 않는다.** 보낼 곳:
   영구 규칙 → `.claude/rules/` · 사고 상세 → `docs/incidents.md` · 구현 역사 → **git**.
4. **git이 과거를 보관하므로 이 파일이 git history를 복제하지 않는다.**
5. `현재`·`다음`·`미해결`은 반드시 **실제 HEAD 기준으로 다시 검증**한다. 옛 값을 복사하지 마라.
6. **OPEN 식별자는 안정적이다** — 설명형 이름을 쓰고, 닫혀도 재번호·재사용하지 않는다.
   코드 주석·commit·`docs/incidents.md`가 같은 이름을 참조한다.
7. **크기: 권장 180~250줄 · 300줄을 넘기면 다시 압축한다.**
8. 새 Claude는 `CLAUDE.md` → 이 파일 → 이 파일이 가리키는 문서 순으로 읽는다.

> 2026-09-14에 499줄 → 이 구조로 압축했다. 직전 판은 `git show 7e47a70:HANDOFF_NEXT_CLAUDE.md`,
> 2026-09-08 이전 누적본(4,188줄)은 `git show 2d82917:HANDOFF_NEXT_CLAUDE.md`.

---

# 1. CURRENT BASELINE

실측 2026-09-14.

| 항목 | 값 |
|---|---|
| HEAD | `93c3a5b` + 이번 작업(툴바 겹침 · compiler bailout · 문서) |
| 마지막 **기능** 커밋 | 이번 작업 — `OPEN-TOOLBAR-COVERS-HEADER` 수정 |
| branch / remote | `master` = `origin/master`, ahead 0 / behind 0 |
| working tree | clean |
| `Dashboard.tsx` | **2,195줄** (useState 22 / useEffect 13 — 전부 shell·경계 소유) |
| dashboard CSS | **`src/app/styles/dashboard/` 8개 · 합 11,132줄** (최대 2,691 — 분할 완료) |
| `MemoRichEditor.tsx` | 657줄 |
| canonical eslint | **e26 w8** (파일 45) |
| 저장소 전체 eslint | e29 w14 — **범위가 달라 canonical과 직접 비교 금지** |
| tsc / `npm run check` | 0 / **0 (OK 43** — 41 + `css-order` 1 + `with-cleanup` 1**)** |
| `react-hooks/todo` | **0건** (9 → 0, 2026-09-14) |
| **blocker** | **없음** |
| **OPEN** | **없음 — 전부 CLOSED** |

> 위 수치는 **이번 작업 종료 시점 실측**이다(tsc·check·check:layout·canonical eslint·todo 전부 다시 돌렸다).
> `react-hooks/todo`가 0이 되면서 **canonical `e26 w8`의 과소보고가 해소됐다** — 예전에는 bailout된
> 함수 9개를 컴파일러가 아예 안 봤다. 지금 수치는 그 9개까지 포함한 값이고 **NEW/GONE 0**이었다.

- **canonical eslint 명령**(Dashboard·refactor는 반드시 이걸로 잰다):
  ```bash
  npx eslint --format json src/app/Dashboard.tsx src/lib/dashboard src/lib/memo src/components/dashboard
  ```
- 🔴 **줄 수를 인용하지 말고 매번 다시 재라.** 위 수치도 HEAD가 움직이면 stale이다.
- 🔴 **판정은 개수가 아니라 NEW/GONE 차집합이다.** 서명은 `ruleId` + 첫 줄 headline +
  캐럿(`^^^`) 설명 + `> NNN |` 소스 **코드 본문**으로 만든다.
  `message`를 통째로 키로 쓰면 줄번호가 밀릴 때 전부 NEW/GONE으로 보인다.

**배포본 vs HEAD** — 마지막 사용자 실기기 확인은 `68a0808` 배포본이다.
그 뒤 `d40a308`·`18c91be`·`6dc46b1`·`84a4fd5` + docs 커밋이 쌓였다.
🔴 **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** —
내 수정이 사용자 화면에 아예 없을 수 있다.

# 2. CURRENT ARCHITECTURE

**`Dashboard.tsx` = thin orchestration shell.** 화면 조립 · 페이지 전환/모달 조정 ·
기능 간 bridge · 공통 coordination만 갖는다. feature 구현은 전부 밖에 있다.

| 영역 | owner |
|---|---|
| 기능 상태 | `src/lib/dashboard/use*.ts` (Projects · Briefing 2종 · Focus · Idea · MyPage · MindSet) |
| 스타일 | `src/app/styles/dashboard/01~08.css` — **파일명 번호 = 캐스케이드 순서**(3절) |
| 메모 편집 세션 | `src/lib/memo/useMemoEditSession.ts` |
| 메모 목록·월 데이터 | `src/lib/memo/useMemoListData.ts` (`showMonthAt`이 월 fetch 소유) |
| 메모 정렬 규칙 | `src/lib/memo/ordering.ts` (+ `ordering.check.ts` 계약 18가지) |
| 저장 payload 조립 | `src/lib/memo/memo-input.ts` — `buildMemoInput()` **순수 함수** |
| 표현(JSX) | `src/components/dashboard/*` · `src/components/memo/*` |
| 레이아웃 불변식 | `src/lib/layout-invariants.ts` (+ `npm run check:layout`) |

- `buildMemoInput()`은 server action·state·ref·dialog·autosave·저장순서를 **모른다.**
  세 호출부(`handlePostitBack`·`handleMemoDialogBack`·`handleSaveMemo`)가 각자 계약을 감싼다.
  🔴 `contentFormatFor`는 훅에 남는다 — autosave가 따로 쓴다.
- **Dashboard가 남긴 bridge는 설계상 남긴 것이다**: dialog registry · postit orchestration ·
  bodyEditor 양방향 다리 · `pendingInsert`/`activeMemoEditorRef` · `patchMemoInLists` ·
  `confirmDialog` · `renderJobCard` · 전체화면 layout/theme/배경복사 effect 4종.
  🔴 **줄 수를 목표로 이것들을 건드리지 마라** — 새 Context·ref injection·훅 순환이 전부 여기서 시작된다.

# 3. LOAD-BEARING CONTRACTS

깨지면 조용히 데이터가 틀어지는 것들이다.

## 정렬

- **정렬 저장소 셋은 서로 독립이다 — 합치지 마라.**
  ① Key Notes 고정 = `memo.pin_order`(정본은 서버 `getImportantMemos` 하나) ·
  ② Key Notes 일반 중요 = 같은 컬럼이지만 `.eq("is_pinned", false)`로 갈라짐 ·
  ③ Monthly 하단 = `memo_day_order(user_id, day, memo_id)`.
- 🔴 **③을 memo 컬럼으로 옮기지 마라** — 기간 메모가 여러 날짜에 동시에 뜨므로 날짜 독립성이 깨진다.
  Dashboard TODAY가 ③을 **오늘 날짜에 한해 읽기 전용으로** 재사용한다. TODAY 전용 순서 컬럼을 만들지 마라.
- 🔴 **①을 클라이언트에서 다시 정렬하지 마라** — 규칙이 두 벌이 되고 한쪽만 바뀐다.
  새로 켠 Pin은 고정 영역 **맨 앞**이고, `nextPinOrder`가 `min − 1`을 **한 행에만** 준다.
  기존 Pin을 미는 N번 update를 만들지 마라.
- 🔴 **"기본값"과 "강제 정렬"을 구분해라.** 날짜순은 *아직 수동 순서가 없는* 메모의 기본값이다.
  무조건 정렬로 만들면 드래그로 저장해 둔 순서를 화면에서 덮는다.
  `orderPriorityMemos`는 **pairwise 이행성이 깨져서 merge 함수다 — comparator로 되돌리지 마라.**
- 🔴 **화면 순서 스냅샷(`useMemoReorder.dragOrder`)은 그 집합이 바뀌면 버린다.**
  `known`/`extra` 같은 파생값으로 "버리는 척"하지 마라 — 다음 렌더에 id가 돌아오면 부활한다.
- **`reorderMemosForDay`는 단일 `upsert`(요청 1회)라 부분 쓰기가 없다. 개별 update 루프로 바꾸지 마라.**
  🟡 대조: Key Notes `reorderPinnedMemos`는 `Promise.all`로 N개 개별 UPDATE라 부분 쓰기가
  가능하고 호출부도 `void`라 롤백이 없다 — **알려진 남은 위험**이다.

## 훅 경계

- **`useMemoEditSession`에 bodyEditor를 넣지 마라** — `bodyEditorTarget === "project"` 분기가
  `setProjContent`·`setProjEditorKey`를 불러 Memo 훅이 Project state를 소유하게 된다. Dashboard가 중재자다.
- **`activeMemoEditorRef`를 어느 훅에도 넣지 마라** — `activeDialogKey`/`bigEditorOpen`/
  `postitEditMode`/`memoFormOpen` 네 그룹을 읽어 ref 4개 중 하나를 고른다.
- **선택→메모와 `pendingInsert`는 별개 클러스터다 — 다시 합치지 마라.**
- **훅 밖 사용이 0회라 반환하지 않은 6개를 다시 반환하지 마라**: `setSavingMemo` ·
  `setAutosaveStatus` · `formBodyRef` · `formBodyFlushRef` ·
  `memoBodyBaselineRef` · `cancelFormBodyFlush`. 밖에서 만지면 **자동저장 축소 가드의 기준이 깨진다**(되돌릴 수 없는 쓰기).
- **`scheduleAutosave` · `autosaveTimerRef` · `memoBodyBaselineRef` · 본문 flush ref는 한 묶음이다.**
- **두 Briefing 훅은 Memo를 알지 않는다.** 훅 → Memo 직접 참조를 만들지 마라.
- **`projectEditPage`/`projectPageOpen`은 `mobileEditActive`·`monthlyComposePage`·`bigEditorPage`와
  나란한 4개짜리 레이아웃 플래그다.** 훅으로 끌고 가면 메모·먼슬리 레이아웃이 Project에 묶인다.

## 선언 순서 / 생명주기

- **`pendingInsert` useState 선언을 원래 자리로 되돌리지 마라** — `loadMemoIntoForm`이
  `setPendingInsert(null)`을 부르는데 **useState는 hoisting이 없어** TDZ로 화면이 통째로 죽는다.
  같은 이유로 **훅 호출을 더 위로 올리지 마라.**
- **`readBodyEditorDraft`/`setBodyEditorDraft`는 `function` 선언이라 호이스팅된다 —
  `const` 화살표 함수로 바꾸지 마라. 그 순간 TDZ로 죽는다.**
- `todayIso`는 두 Briefing 훅의 fallback payload가 쓰므로 **훅 호출보다 위**에 있어야 한다.
- **재진입 리셋은 전부 `useDialogRegistry.onOpen` 한 곳이 한다**(News 날짜 · Trend 날짜 ·
  Jobs 탭/펼침 · Briefing 3개 스크롤). 훅 안에서 초기화하지 말고,
  **스크롤 리셋 키를 늘리지 마라** — 모든 다이얼로그를 top reset하는 것은 이 앱의 계약이 아니다(편집창은 위치 유지).
- **`handlePostitBack`·`handleMemoDialogBack`의 저장은 셸 종료 핸들러의 부수 저장이라 의도된 KEEP이다.**
  🔴 0으로 만들려고 훅에 넣지 마라 — `memoFormOpen`이 같이 새어 dialog registry와 배경잠금이 반대로 간다.
- 모바일 시트 2종은 **하나의 공용 바깥클릭 effect를 공유한다** — 쪼개면 리스너가 둘이 된다.

## CSS 순서

- 🔴 **`src/app/styles/dashboard/`의 import 순서가 캐스케이드다**(`Dashboard.tsx` 상단).
  옛 `dashboard.css` 11,102줄을 줄 범위 그대로 자른 것이라 **파일명 번호 = 옛 줄 순서**다.
  셀렉터 613개가 2회 이상 등장하므로(총 1,521회) 재배열하면 그 승자가 조용히 바뀐다.
- 🔴 **06/07/08은 동결이다.** 날짜순 패치 레이어(모바일 / 다크 / 편집·뷰포트)라 기능 owner가 없고
  의미가 순서 자체에 들어 있다. **새 규칙은 01~05의 자기 기능 파일에 넣어라.**
  ⚠️ **"동결"은 "새 기능 규칙을 늘리지 마라"이지 "손대지 마라"가 아니다.** 그 파일이 **owner인
  셀렉터의 버그**는 제자리에서 고친다 — 01~05에 새로 쓰면 소스 순서상 앞이라 **지고 죽은 코드가 된다**
  (2026-09-14 툴바 겹침이 그 예: `top` owner가 08이라 08에서 고쳤다).
- 🔴 **`@import` aggregator로 되돌리지 마라** — Lightning CSS가 `color-mix()` 폴백을 `@supports`로
  쪼개 방출해 CSS 출력이 달라진다(2026-09-14 실측 후 폐기, 경위는 `docs/refactor-plan.md` 2순위 절).
- 옛 주석·문서의 `dashboard.css NNNN절`은 **범위표에서 파일을 고르고 `NNNN − (시작 − 1)`**로 찾는다.
  범위표 정본은 `Dashboard.tsx`의 import 주석이다(헤더를 안 넣어서 이 식이 정확하다).
- 지키는 장치: `src/lib/dashboard/css-order.check.ts` (`npm run check` 포함).

## 정리(cleanup) / React Compiler

- 🔴 **훅 안에서 `try/finally`를 다시 쓰지 마라.** React Compiler가 그 **함수 하나를 통째로**
  분석 포기한다(`react-hooks/todo`). 로딩 플래그를 푸는 자리는 **`withCleanup`**(`src/lib/with-cleanup.ts`)을 쓴다.
  훅 9곳이 이걸 쓰고, 계약(정상·early return·throw 전부에서 cleanup 실행 + 에러 재전파)은
  `with-cleanup.check.ts`가 음성 대조까지 포함해 지킨다.
- ⚠️ **`withCleanup`으로 옮길 때는 `try`가 그 함수의 마지막 문장인지 확인해라.**
  원래 `try` 안의 `return`은 **함수 전체**를 끝냈는데, 콜백으로 옮기면 **콜백만** 끝낸다.
  뒤에 문장이 더 있으면 원래는 건너뛰던 코드가 실행된다(옮긴 9곳은 전부 마지막 문장이었다).
- `.finally()` **프로미스 메서드는 괜찮다** — TryStatement가 아니라 bailout 대상이 아니다
  (`useMyPageSession.refreshSystemStatus`가 그대로 쓴다).

## 입력 UI

- **입력칸 `font-size` 16px 하한을 내리지 마라** (같은 셀렉터 3선언 전부 16px). iOS가 자동확대한다.
- **모바일 한 줄 요약을 `<input>`으로 되돌리거나 고정 height를 다시 주지 마라.**
  둘 중 하나만 어겨도 30자에서 내부 가로 overflow가 생기고 iOS caret이 끝에 고정된다(`d40a308`).

## 운영 DB

- 🔴 `.env.local`은 **운영 Supabase**다. 검증 제한은 `CLAUDE.md` 2절이 정본이다.
- **DB write 0 증명은 `window.fetch`를 임시로 감싸 server action을 전수 세어서 한다**(추측 금지, 래퍼는 반드시 제거).

# 4. OPEN

**없다.** 2026-09-14에 마지막 셋(`OPEN-PROJ-KB-OFFSET` · `OPEN-TOOLBAR-COVERS-HEADER` ·
`OPEN-COMPILER-BAILOUT-TRY-FINALLY`)을 닫았다. 경위는 5절.

🔴 **식별자는 재사용하지 않는다.** 새 문제가 생기면 새 이름을 붙여 여기에 적는다.

# 5. CLOSED — 다시 열면 위험한 것

경위·실측·수치는 전부 **git 커밋 메시지**와 `docs/incidents.md`에 있다. 여기 복제하지 않는다.
아래는 **다시 열지 않기 위해 필요한 최소한**만 남긴 것이다.

**2026-09-14 마감 3건**

- ✅ **`OPEN-PROJ-KB-OFFSET`** — **사용자 결정: A(현행 유지)**, 코드 변경 0.
  키보드 첫 화면의 21px은 버그가 아니라 컨트롤을 키운 대가이고, 타이핑 중 상태행이 보이는 쪽이 우선이다.
  🔴 **B안(`html.kb-open`에서 상태행 접기)을 다시 꺼내지 마라** — 메모에서 넣었다가
  *"메모 유형 선택 영역이 가려짐"* 신고의 유일한 기전으로 특정돼 걷어낸 처방이다
  (`05-account-help.css` 551절 "되살리지 마라").
- ✅ **`OPEN-TOOLBAR-COVERS-HEADER`** — sticky 툴바/삽입바가 **fixed 머리행 띠(y 2~42)** 에 핀돼
  ‹·↶·↷·☆·⋮가 안 눌리던 문제. sticky `top`에 `--editor-head-band`(= 머리행 `top` 2px + `height` 40px
  + safe-area)를 더해 해결했고, 프로젝트만 빠져 있던 `z-index: 70`을 메모와 맞췄다.
  일반 규칙은 → `ui-layout.md`("fixed 머리행이 있으면 sticky를 `top: 0`에 붙이지 마라").
  🔴 **`.proj-edit-page`에만 `top`을 덮어쓰지 마라** — 그 금지는 그대로다.
- ✅ **`OPEN-COMPILER-BAILOUT-TRY-FINALLY`** — **9 → 0.** 훅 9곳의 `try/finally`(전부 "로딩 플래그
  풀기" 한 패턴)를 `withCleanup`으로 옮겼다. 동작 변경 0, eslint NEW 0 / GONE 0.
  계약과 옮길 때 주의점은 3절 "정리(cleanup) / React Compiler".

**구조 / 리팩토링**

- ✅ **`dashboard.css` 분할**(`93c3a5b`) — 11,102줄 → `src/app/styles/dashboard/` 8개, 원본은 삭제.
  **줄 범위 그대로 자르기만** 했고 소스 blob 이어붙이면 **바이트 동일**, computed style
  라이트/다크 × 375/1280 **차이 0**. 계약은 3절 "CSS 순서", 상세는 `docs/refactor-plan.md` 2순위 절.
  🔴 **06/07/08을 기능별로 재배치하거나 더 쪼개지 마라** — 날짜순 패치라 자를 의미 경계가 없다.
- ✅ **Dashboard ownership Roadmap — 종료**(2026-09-12 Audit 2회). 🔴 **재개하지 마라.**
  남은 3건(종료 핸들러 부수 저장)은 의도된 KEEP이다(3절).
  🔴 **숫자를 0으로 맞추려고 페이지 크롬(blob·footer)을 빼지 마라.**
- ✅ **Repo Hygiene / Harness 구조**(2026-09-14). 더 옮기거나 지울 것이 없다.
  🔴 **파일 수를 더 줄이려 하지 마라** — 남은 후보는 취향 수준이고, 옮기면 문서 포인터만 다시 깨진다.
- ✅ **`OPEN-VIEWPORT-DEBUG`** — `?debug=vp` 패널을 전부 걷었다.
  🔴 **이제 실기기 값을 화면에서 읽을 방법이 없다** — 로컬은 `npm run check:layout` +
  `measureEditor()`/`judge()` 콘솔 호출, 실기기는 사용자 스크린샷이다.
  조사 기간에만 되살려라: `git show abb95fe:src/components/ViewportDebug.tsx`. **끝나면 반드시 다시 지운다.**

**편집 화면 — 값을 건드리지 마라**

- ✅ **`OPEN-PROJ-46DVH`** — 기록이 낡았고 **남은 40vh는 의도된 값**이다(탭 영역 용도).
  껍데기 바닥이 0이고 문서가 스크롤러라 "뷰포트 단위를 바닥으로" 가 막으려는 실패가 구조적으로 안 난다.
  🔴 **건드리지 마라** — 대체값은 magic number이고, 46dvh를 원인으로 본 **오진 전력**이 있다(`c7258cc`).
- ✅ **`OPEN-MEMO-KB-MINHEIGHT`** — **기록이 틀렸고 코드는 처음부터 맞았다**(출처는 9분 만에
  되돌려진 커밋 `d6b6f94` 메시지였다).
  🔴🔴 **`html.kb-open`의 `min-height: calc(100lvh + --kb-inset)`을 지우지 마라.**
  `c5d4a0c`가 증명했다 — 지우면 메모지가 뷰포트보다 짧아져 gradient **이음매가 남는다**.
  ⚠️ 별건 관찰: 실기기 `100lvh`=792라 kb-open 바닥이 1118이 된다는 `d6b6f94`의 분석은 부정되지
  않았다(처방만 되돌렸다). **실기기 증거 없이 값을 바꾸지 마라** — 이미 더 나쁜 회귀를 냈다.
- ✅ **모바일 Project Summary iOS caret**(`d40a308`, 실기기 확인) · **iOS 포커스 자동확대**(`45c0c3a`).
  처방 보존 규칙은 3절 "입력 UI".
- ✅ **`OPEN-PROJWORKSPACE-COMPILER-BAILOUT`**(`b84e131`, hoisted forward reference).

**데이터**

- ✅ **Memo 정렬**(2026-09-10). 정본은 `ordering.ts` + `ordering.check.ts` 18계약.
- ✅ **`memo_day_order` 마이그레이션·날짜 독립성**(`650f5e5`·`8ec059a`). 처방은 날짜 키 캐시 + 보이는 달 preload.
  🔴 순서가 **없는** 날짜도 빈 맵으로 넣어야 게이트가 안 걸린다.

# 6. NEXT

## `SKILLPILOT STRUCTURAL / TECH-DEBT CLEANUP: CLOSED` (2026-09-14)

Dashboard ownership · CSS ownership · Repo Hygiene · 남은 OPEN 3개가 **전부 닫혔다**
(`react-hooks/todo` 0 · blocker 0 · OPEN 0).

**지금 할 일은 없다.** 다음 세션은 **사용자가 새로 주는 것**으로 시작한다 — 스스로 열지 마라.
🔴 `docs/refactor-plan.md`의 미착수분(TSX 0단계·1순위)은 **명시적 지시가 있을 때만** 착수한다.
CSS 재배치 · 파일 수 줄이기 · repo cleanup은 전부 닫힌 항목이다(5절).

**진짜 남은 것은 실기기 검증뿐이다(7절).** 사용자 신고가 오면 거기서부터 시작한다.

# 7. VERIFICATION — 직접 검증하지 못한 것

마지막 사용자 실기기 확인은 `68a0808` 배포본의 **주요 화면 훑기**였다(Monthly MEMO · Key Notes ·
포스트잇 회귀 없음, 한줄요약 폭 확대 PASS). **개별 경로를 하나씩 태운 것은 아니다.**

남은 진짜 공백:

- **iOS 키보드 경로 · 설치형 PWA standalone · Android** — 전부 미확인.
- **드래그 제스처 전반** — 포인터 홀드라 합성이 안 된다. Key Notes 드래그 "저장까지"와
  중요 메모 그룹 드래그는 코드 게이트로만 확인했다.
- **`d40a308` 이후 4개 커밋은 실기기 미확인**이다(위 배포본보다 뒤).
- `650f5e5`·`3d12089` — 날짜 flicker와 `dayOrderPending` 게이트는 **모바일/느린 회선 신고**라
  로컬 즉시응답에서 못 잰다.
- 닉네임 칸의 **iOS 액세서리 바 회피** — 그 바 높이를 그릴 수 없어 근거가 실기기 확인 하나뿐이다.
- Idea Build **저장 확정(DB write)·재생성**은 로컬에서 일부러 실행하지 않았다.
- 🆕 **툴바 겹침 수정의 `env(safe-area-inset-top)` 몫** — 로컬은 safe-area가 0이라
  `--editor-head-band`가 `42px + 0`으로만 검증됐다. 노치 기기에서 `42px + safe-area`로 커지는
  경로는 **미확인**이다(같은 식을 머리행 `top`이 이미 쓰고 있어 구조는 같다).
- 🆕 **`withCleanup`으로 옮긴 9개 중 실제 저장/재시도 실행은 안 했다** — 운영 DB write라
  일부러 돌리지 않았다. 헬퍼 계약은 `with-cleanup.check.ts`(음성 대조 포함)로, 호출부는
  타입·렌더까지만 확인했다. **저장 버튼을 실제로 누른 검증은 없다.**

🔴 **검증 방법 셋(계속 쓴다)**
① DB write 0은 `window.fetch` 임시 래퍼로 **전수 세어** 증명한다(래퍼는 반드시 제거).
② 리렌더 유발 시 **값이 같으면 setState가 bail out한다** — 확실한 트리거를 써라.
③ 옮긴 본문은 **바이트 단위 diff**로 rename 0을 증명하고, **양성 대조로 빌드가 갈렸는지 먼저** 확인한다.
④ 드래그를 합성할 때 대상을 먼저 `scrollIntoView` 해라 — 뷰포트 밖이면 `elementFromPoint`가 null이라 거짓 양성이 난다.
⑤ 주변 smoke도 **테스트 메모로** 해라 — 사용자 메모를 모바일로 열었다 나오면 `updateMemo`가 나간다.

# 8. REFERENCES

| 무엇 | 어디 |
|---|---|
| 항상 적용되는 운영 계약 | `CLAUDE.md` |
| 영역별 "하지 마라" 규칙 | `.claude/rules/{ui-layout,editor-memo,data-server,frozen-features}.md` |
| 반복 버그 / 스크롤 잠김 절차 | `/debug-hard` · `/scroll-lock` |
| 문서 canonical 역할 · Notion 쓰기 금지 | `AGENTS.md` (정본) |
| 사고 경위·실측 수치 | `docs/incidents.md` · `docs/mobile-pwa-postmortem.md` |
| 무변화 판정 절차 | `docs/baseline/README.md` (⚠️ `__settle()` 앞에 `await document.fonts.ready`) |
| 모듈화 계획(미착수분) | `docs/refactor-plan.md` |
| **실기기 수동 검증 절차** | `docs/phase1-device-checklist.md` — iOS / Android / 설치형 PWA 3환경 × 5화면. 7절의 남은 공백이 정확히 이 문서가 다루는 범위다 |
| **운영 진단 도구(수동)** | `src/lib/jobs/verify-batch.ts` — `npx tsx --env-file=.env.local src/lib/jobs/verify-batch.ts [날짜]`. 🔴 **운영 Supabase READ 전용**(`daily_jobs_run`·`saved_job`). write·destructive 금지, **자동 `npm run check`에 넣지 마라** |
| 모바일 편집 구조의 현재 계약 | `08-editor-viewport.css` 30·84·104·733절 주석 (옛 `dashboard.css` 9525·9579·9599·10228) |
| 제품·설계 결정 | Notion [Product Workspace](https://app.notion.com/p/3c565d3c830981759c32c0775d7e1996) · [Decision Log](https://app.notion.com/p/8721a21da37d416fa98572c9db2f34a6) |
| 실패 회고(사람이 읽는 글) | Notion [🕳️ 지뢰밭 모임](https://app.notion.com/p/3c665d3c83098190850ee3de98477f45) |
| 코드 주석의 "HANDOFF NN절" | 전부 **접힌 옛 절**이다. `git log -- HANDOFF_NEXT_CLAUDE.md`로 찾아라 |
