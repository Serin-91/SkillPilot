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
| HEAD | `bf94a21` + 이번 문서 변경 |
| 마지막 **기능** 커밋 | `84a4fd5` (메모 저장 payload → `buildMemoInput()`) |
| branch / remote | `master` = `origin/master`, ahead 0 / behind 0 |
| working tree | clean |
| `Dashboard.tsx` | **2,195줄** (useState 22 / useEffect 13 — 전부 shell·경계 소유) |
| dashboard CSS | **`src/app/styles/dashboard/` 8개 · 합 11,102줄** (최대 2,691 — 분할 완료) |
| `MemoRichEditor.tsx` | 657줄 |
| canonical eslint | **e26 w8** (파일 44) |
| 저장소 전체 eslint | e29 w14 — **범위가 달라 canonical과 직접 비교 금지** |
| tsc / `npm run check` | 0 / **0 (OK 42 — `css-order.check.ts` 추가로 41에서 +1)** |
| `react-hooks/todo` | 9건 — `OPEN-COMPILER-BAILOUT-TRY-FINALLY` 그대로 |
| **blocker** | **없음** |

> 위 검증 수치는 `3dcbee3` 시점 실측이다(이후 코드 변경 0). 이번 변경은 **문서만** 고쳤으므로 다시 돌리지 않았다.

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
- **훅 밖 사용이 0회라 반환하지 않은 7개를 다시 반환하지 마라**: `setSavingMemo` ·
  `setMemoDateError` · `setAutosaveStatus` · `formBodyRef` · `formBodyFlushRef` ·
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
- 🔴 **`@import` aggregator로 되돌리지 마라** — Lightning CSS가 `color-mix()` 폴백을 `@supports`로
  쪼개 방출해 CSS 출력이 달라진다(2026-09-14 실측 후 폐기, 경위는 `docs/refactor-plan.md` 2순위 절).
- 옛 주석·문서의 `dashboard.css NNNN절`은 **범위표에서 파일을 고르고 `NNNN − (시작 − 1)`**로 찾는다.
  범위표 정본은 `Dashboard.tsx`의 import 주석이다(헤더를 안 넣어서 이 식이 정확하다).
- 지키는 장치: `src/lib/dashboard/css-order.check.ts` (`npm run check` 포함).

## 입력 UI

- **입력칸 `font-size` 16px 하한을 내리지 마라** (같은 셀렉터 3선언 전부 16px). iOS가 자동확대한다.
- **모바일 한 줄 요약을 `<input>`으로 되돌리거나 고정 height를 다시 주지 마라.**
  둘 중 하나만 어겨도 30자에서 내부 가로 overflow가 생기고 iOS caret이 끝에 고정된다(`d40a308`).

## 운영 DB

- 🔴 `.env.local`은 **운영 Supabase**다. 검증 제한은 `CLAUDE.md` 2절이 정본이다.
- **DB write 0 증명은 `window.fetch`를 임시로 감싸 server action을 전수 세어서 한다**(추측 금지, 래퍼는 반드시 제거).

# 4. OPEN

해결되면 **행을 지우고, 그 식별자는 다시 쓰지 않는다.**

- **`OPEN-COMPILER-BAILOUT-TRY-FINALLY`** — 🟡 blocker 아님.
  `try/finally`를 쓰는 함수는 React Compiler가 분석을 포기한다. *"with a finalizer ('finally') clause"*
  메시지는 **`catch`를 붙여도 안 풀린다**는 뜻이다.
  🔴 bailout은 **파일이 아니라 함수 단위**라 그 함수만 빠진다 — 급하지 않다.
  ⚠️ **canonical `e26 w8`은 그 함수들을 과소보고한다** — "이 범위가 깨끗하다"로 읽지 마라.
  진단: `npx eslint --rule '{"react-hooks/todo":2}' --format json <경로>` (config는 건드리지 말 것).
  🔴 **컴파일러는 먼저 만난 bailout 하나만 보고한다 — 하나 고치면 반드시 다시 재라.**
  손대려면 **별도 리팩토링 세션**으로 잡아라.
- **`OPEN-TOOLBAR-COVERS-HEADER`** — 🟡 서식툴바가 상단 버튼 둘을 덮는다(메모·프로젝트 공통).
  끝까지 스크롤하면 `.mobile-rich-toolbar`(z 240)가 y=0에 핀되어 fixed인 `‹`(z 80)·`⋮`(z 70)를 덮어 안 눌린다.
  🔴 **두 화면이 같은 조건이라 한쪽만 고치면 갈라진다.** 메모 쪽은 20라운드 태운 자리다 — 별도 작업.
- **`OPEN-PROJ-KB-OFFSET`** — 🟡 **버그 아님, 사용자 결정 대기.** 프로젝트 편집에서 키보드 첫 화면의
  본문 시작이 21px 내려갔다(컨트롤을 키운 대가). 문서 스크롤러라 탭하면 캐럿이 올라온다.
  · A(현행 유지) 21px 유지 · B(`html.kb-open`에서 상태행 접기) 21px 회수, 타이핑 중 컨트롤이 사라짐.
  🔴 **B는 메모에서 이미 해보고 삭제한 처방이다** — `html.kb-open .big-postit > .big-meta-row
  { display:none !important }`가 사용자 신고 *"메모 유형 선택 영역이 가려짐"*의 **유일한 기전**으로
  특정돼 2026-09-02에 걷혔고(`05-account-help.css` 551절 "되살리지 마라"), 그때 사용자가
  **"정상 flow로 보이게 하는 것을 우선"**이라고 명시했다. 그 선례를 알고 고르면 된다.

# 5. CLOSED — 다시 열면 위험한 것

경위·실측은 전부 git 커밋 메시지와 `docs/incidents.md`에 있다. 여기 복제하지 않는다.

- ✅ **`dashboard.css` 분할 — CLOSED**(2026-09-14). 11,102줄 한 덩어리 → `src/app/styles/dashboard/`
  8개(861 / 899 / 294 / 539 / 1,668 / 2,691 / 2,543 / 1,607). `dashboard.css`는 삭제했다.
  **줄 범위 그대로 자르기만** 했다 — 셀렉터·특이도·`!important`·`@media`·순서 전부 보존.
  🔴 **기능별 재배치는 A 띠(01~05)에서만 가능하고 06/07/08은 불가능하다** — 날짜순 패치라
  한 파일에 여러 기능이 섞여 있고 의미가 순서에 들어 있다. 계약은 3절 "CSS 순서".
  검증 — **소스와 번들 산출물을 구분해서 읽어라**:
  · **소스**: 8개 blob을 순서대로 이어붙이면 옛 `dashboard.css` blob과 **바이트 동일**(705,787B).
    작업 트리 기준으로는 CRLF라 716,889B다 — 두 숫자는 같은 파일의 LF/CRLF 차이다.
  · **번들 산출물(dev)**: 🔴 **바이트 동일이 아니다**(399,546 → 400,271B). 차이는 정확히 넷이고
    전부 캐스케이드 중립이다 — ① dev 소스 주석이 1개→8개 ② `@media (max-width:720px)` 블록
    하나가 05/06 경계에서 **같은 조건으로 닫혔다 다시 열림**(규칙 순서 보존) ③ Lightning CSS가
    `@media` 병합 때 지우던 **동일 중복 1쌍**(`.mobile-options-date-popup .mini-date-weekdays/-days
    { gap:2px }`, 옛 L3961·L4901에 실제로 두 번)이 둘 다 남음 — 선언이 같아 뒤엣것이 그대로 이긴다
    ④ sourcemap 파일명. **프로덕션 빌드 산출물은 재지 않았다.**
  · **화면**: 브라우저 computed style **라이트/다크 × 375/1280 네 조합 전부 1,645개 요소 차이 0**.
    셀렉터 시퀀스(@media 컨텍스트 포함) 4,129개 **순서까지 동일**.
  🔴 **줄 수를 더 줄이려고 06/07/08을 다시 쪼개지 마라** — 남은 건 날짜순 패치라 자를 의미 경계가 없다.
- ✅ **Dashboard ownership Roadmap — 종료**(2026-09-12 Audit 2회). 🔴 **재개하지 마라.**
  조건 1(feature-owned raw markup) 잔여 7줄 · MOVE 후보 0, 조건 4는 "feature-owned direct action 0" 기준 충족.
  남은 3건(종료 핸들러 부수 저장)은 의도된 KEEP이다(3절).
  🔴 **숫자를 0으로 맞추려고 페이지 크롬(blob·footer)을 빼지 마라.**
- ✅ **모바일 Project Summary iOS caret — CLOSED**(`d40a308`, 실기기 확인). 처방 보존 규칙은 3절.
- ✅ **iOS 포커스 자동확대 — CLOSED**(`45c0c3a`). 16px 하한 규칙은 3절.
- ✅ **`OPEN-PROJWORKSPACE-COMPILER-BAILOUT` — CLOSED**(`b84e131`, hoisted forward reference).
- ✅ **`OPEN-PROJ-46DVH` — CLOSED**(2026-09-14). **기록이 낡았고, 남은 값은 의도된 것이다.**
  OPEN은 `.proj-detail-editing .proj-body-input { min-height: 46dvh }`(L4009)를 지목했는데,
  `c7258cc` 이후 페이지 경로의 승자는 **L10893 `.proj-edit-page .proj-body-input { min-height: 40vh }`**다
  (둘 다 (0,2,0), 파일 뒤가 이긴다). 그 커밋 메시지가 이미 적어뒀다 —
  *"40vh로 낮췄을 뿐 뷰포트 단위 자체는 남아 있다. 문서 스크롤러에서는 빈 박스가 스크롤 끝을
  밀지 않으므로 증상이 되지 않지만, **탭 영역 용도로만 남긴 값**이다."*
  실측(로컬 375×684, 저장 안 되는 새 프로젝트): 껍데기 `min-height 0` · 본문박스 `273.6px`(=40vh) ·
  `docSH 684 = innerH` · **`maxScroll 0`** — 키보드 닫힘/열림 기하가 **완전히 동일**하다(본문 시작 차이 0).
  즉 `ui-layout.md`의 "뷰포트 단위를 바닥으로 쓰지 마라"가 막으려는 실패(문서가 뷰포트를 넘어
  굴릴 자리가 생김)가 **구조적으로 일어날 수 없다** — 껍데기 바닥이 0이고 문서가 스크롤러다.
  🔴 **값을 고치려면 대체값이 필요한데 그건 magic number다.** 46dvh를 원인으로 본 **오진 전력**도 있다
  (`c7258cc`: 긴 본문 825px에서는 여백이 43px로 정상이었다). 건드리지 마라.
- ✅ **`OPEN-MEMO-KB-MINHEIGHT` — CLOSED**(2026-09-14). **기록이 틀렸다. 코드는 처음부터 맞았다.**
  OPEN이 인용한 *"키보드 여유는 `padding-bottom` 하나로 충분하다 — `min-height`를 걷었다"*는
  `CLAUDE.md`에 있던 적이 없다(전 history `git log -S` 0건). 출처는 **커밋 `d6b6f94` 메시지**이고,
  그 커밋은 **9분 뒤 `c5d4a0c`로 코드 전부 되돌려졌다**("기록만 남긴다"). 남은 기록을 현재 계약으로 읽은 것이다.
  🔴🔴 **`html.kb-open`의 `min-height: calc(100lvh + --kb-inset)`을 지우지 마라.**
  `c5d4a0c`가 증명했다 — 지우면 메모지가 뷰포트보다 짧아져 `body`/`html`의 같은 gradient가
  다른 크기로 그려지며 **이음매가 남는다**(11라운드가 이미 적어둔 것을 읽고도 다시 했다).
  옛 지뢰표도 "그대로 둬라"라고 명시했다.
  실측(로컬 375×684, 새 메모): 키보드 닫힘 `min-height 684 = var(--app-vh)` · `maxScroll 0` /
  키보드 열림 `1010 = 100lvh + kb-inset` · `padding-bottom 422`. 둘 다 규칙대로다.
  ⚠️ **별건으로 남는 관찰**: `d6b6f94`는 실기기 `100lvh`=792라 kb-open 바닥이 1118이 되어
  끝까지 굴리면 빈 메모지가 보인다고 적었다. `c5d4a0c`는 그 분석을 부정하지 않고 **처방만** 되돌렸다.
  실기기 증거가 없으면 손대지 마라 — 값을 바꾸는 시도는 이미 한 번 더 나쁜 회귀를 냈다.
- ✅ **Repo Hygiene / Harness 구조 — CLOSED**(2026-09-14). 더 옮기거나 지울 것이 없다.
  workspace를 `_reference/`·`_archive/`로 분리 · repo root 정리 · 미사용 scaffold asset 7개 제거 ·
  `supabase/.temp/` 추적 해제 + gitignore · `template.check.ts` 등록(**check 30/30, 미등록 0**) ·
  `CLAUDE.md` 434→129줄 + `.claude/rules`·`skills` 분리 · HANDOFF 499→압축 · stale pointer 정리.
  🔴 **파일 수를 더 줄이려 하지 마라** — 남은 후보는 취향 수준이고, 옮기면 주석·문서 포인터만 다시 깨진다.
  (유일한 잔재: `supabase/migrations/` 빈 로컬 폴더. git에는 없다.)
- ✅ **`OPEN-VIEWPORT-DEBUG` — CLOSED**(2026-09-14). `?debug=vp` 진단 패널을 전부 걷었다
  (`ViewportDebug.tsx` 246줄 · Dashboard 호출부 · `noteBodyShrink`/`__spBodyShrink` 채널).
  🔴 **이제 실기기 값을 화면에서 읽을 방법이 없다** — 로컬 판정은 `npm run check:layout`과
  `layout-invariants.ts`의 `measureEditor()`/`judge()` 콘솔 호출이고, 실기기는 사용자 스크린샷이다.
  조사가 길어지면 그 기간만 되살려라: `git show abb95fe:src/components/ViewportDebug.tsx`.
  **끝나면 반드시 다시 지운다** — 이 패널은 전역을 갈아끼우던 몽키패치까지 품었던 이력이 있다.
- ✅ **Memo 정렬 — CLOSED**(2026-09-10). 정본은 `ordering.ts` + `ordering.check.ts` 18계약.
- ✅ **`memo_day_order` 마이그레이션·저장·날짜 독립성 — 실데이터 확인 종료**(`650f5e5`·`8ec059a`).
  처방은 날짜 키 캐시 + 보이는 달 preload. 🔴 순서가 **없는** 날짜도 빈 맵으로 넣어야 게이트가 안 걸린다.

# 6. NEXT

Roadmap도 CSS 분할도 닫혔다. 남은 것은 **4절 OPEN 셋뿐**이다. 한 번에 하나씩, 사용자 승인 후.

1. **`OPEN-PROJ-KB-OFFSET`** — 코드가 아니라 **사용자 결정**을 기다리는 항목이다(4절 A/B).
2. **`OPEN-COMPILER-BAILOUT-TRY-FINALLY`** — 별도 리팩토링 세션.
3. **`OPEN-TOOLBAR-COVERS-HEADER`** — 메모·프로젝트 양쪽 동시 수정. 별도 세션.

🔴 **`docs/refactor-plan.md`의 남은 미착수분은 TSX 분해(0단계·1순위)다.** CSS는 끝났다 —
다시 열지 마라.

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
