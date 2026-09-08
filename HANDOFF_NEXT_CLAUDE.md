# HANDOFF 운영 규칙 — **먼저 읽어라** (사용자 지시, 2026-09-08)

**이 파일은 역사 기록이 아니라 다음 Claude를 위한 현재 인계서다.**

1. **새 절을 계속 append하지 않는다.** `57절 → 58절 → 59절…` 금지.
   세션이 끝날 때 **기존 CURRENT를 최신 상태로 교체·정리**한다.
2. **이 파일에는 오직 다음만 남긴다.**
   CURRENT / JUST DONE / OPEN / NEXT / INVARIANTS·DO NOT TOUCH / VERIFICATION / REFERENCES.
3. **해결된 버그의 긴 조사 과정·실패 실험·과거 수치·과거 TODO를 보존하지 않는다.** 보낼 곳:
   - 장기 재발방지 규칙 → **`CLAUDE.md`** (3절 지뢰표 · 4-1 기능 동결)
   - 사고·원인 상세 → **`docs/incidents.md`** · `docs/mobile-pwa-postmortem.md`
   - 구현 역사 → **git commit/history**
   - 제품·설계 결정 → **Notion / ADR**
4. **git이 과거를 보관하므로 HANDOFF가 git history를 복제하지 않는다.**
5. **`현재`·`다음`·`미해결`은 반드시 실제 HEAD 기준으로 다시 검증한다.**
   과거 절의 상태를 복사해서 현재 상태라고 쓰지 않는다.
6. **해결된 항목은 다음 세션까지 꼭 알아야 할 이유가 없으면 제거한다.**
   JUST DONE에는 최근 핵심 **3~7개**만 유지한다.
7. **긴 기술 설명이 10줄 이상 필요하면 여기 복제하지 말고** canonical 문서 경로 + 핵심 한두 줄만 적는다.
8. **크기: 권장 150~300줄 · 가급적 400줄 이하 · 500줄을 넘기면 다시 압축한다.**
   중요한 정보를 지우라는 뜻이 아니라 **장기 보존 위치와 CURRENT 인계를 분리**하라는 뜻이다.
9. **새 Claude는 `CLAUDE.md` → 이 파일 → 이 파일이 지정한 문서** 순으로 읽는다.
   과거 git history를 선제적으로 탐색하지 않는다.
10. **HANDOFF 갱신은 세션 종료 작업의 일부다.** 맨 아래에 추가하는 것이 아니라 전체를 정리한다.
    (`CLAUDE.md` 0-2절이 같은 규칙을 영구 규칙으로 갖고 있다.)

> 📌 2026-09-08에 이 구조로 전환했다. 그 전의 누적본(525줄, 그 전엔 4,188줄)은
> `git show 2d82917:HANDOFF_NEXT_CLAUDE.md`로 꺼낼 수 있다. **archive 파일은 만들지 않았다.**

---

# 1. CURRENT

- **기준 HEAD**: master, 워킹트리 clean. **마지막 코드 커밋 `f2962aa`** — 그 뒤는 문서 커밋뿐이다.
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
- **실측**: `Dashboard.tsx` **4,137줄** · `dashboard.css` 10,977줄 · `src/lib/memo/useMemoEditSession.ts` 326줄
- **현재 큰 작업**: **Memo 소유권 리팩토링** — 1단계(`useMemoEditSession`) **완료**, 2단계 대기
- **상태**: 기능 작업은 열린 것이 없다. 리팩토링 PHASE 2는 종료, **PHASE 3의 JSX-first 추가 분리는 중단**
  (⑭ theme은 Context 비도입 결정과 충돌 / ⑯ 빠른수정은 밀도 0.57로 비용 초과 / ⑰ Monthly MEMO는
  prop 66이라 단일 분리 불가). 대신 **hook-first**로 방향을 바꿨고 그 1단계가 끝난 상태다.
- **blocker**: 없음. 2단계는 **사용자 지시 대기**(자동 착수 금지).

Memo 소유권 재측정(HEAD `8cebbe7` 기준, 코드 변경 0): 당시 `Dashboard.tsx` 4,309줄 중
Memo 소유 구역이 겹침 없이 **약 1,537줄 = 35.7%**(보수적 하한 — `main.page` 안 Memo 지분과
선언 일부 제외). 이 조사로 hook-first가 유효함을 확인하고 1단계를 착수했다.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `f2962aa` | **Memo 소유권 1단계** — 폼 state 16 · ref 4 · 함수 11 · effect 1(날짜검증)을 `useMemoEditSession`으로. `Dashboard.tsx` 4,309→4,137(−172). 외부 의존 12 · 반환 키 39 · 호출부 rename 0. **옮긴 본문 171줄이 원문과 글자 단위 동일(11/11)** |
| (문서) | HANDOFF를 누적형 → CURRENT overwrite로 전환. 영구 규칙은 `CLAUDE.md` 0-2·0-3·4-1·5절과 `AGENTS.md`로 옮겼다 |
| `00f7756` · `7973e3e` | **실기기 게이트 둘 — 사용자 확인 완료.** 자동 새로고침 후 대시보드 하단 잘림 / 프로젝트 메모·편집 키보드 하단 여백·가림. 둘 다 정상. **이 둘을 근거로 다음 작업을 막지 마라** |
| `c7258cc` (+ `7a0d972` `57d34ec` `978fc68` `35f161b` `48bb23d`) | 프로젝트 편집을 **일반 페이지**로 — 옛 구조 4조건 제거. 후속 UI 정리 포함 |
| `d922ac5` | "오늘의 뉴스"에 지난주 기사 — 4일째부터 하루 −12 감점(`STALE_PENALTY_PER_DAY`) |
| `87f4707` · `0656944` | 첫 로딩 30~107초 — 비싼 생성을 `isPastManualRefreshWindow()`(11:30)로 미룸 |
| `845ca19` | 역량 시그널 0건 고착 v3 — 근거 패딩 차단 + `repairSignalEvidence` 재시도 |

경위·수치는 git 로그와 Notion Decision Log에 있다. 여기 옮겨 적지 마라.

# 3. OPEN

실제로 아직 해결되지 않은 것만. (해결된 것은 지웠다.)

1. **🔴 서식툴바가 상단 버튼 둘을 덮는다 (메모·프로젝트 공통).** 끝까지 스크롤하면
   `.mobile-rich-toolbar`(z 240)가 y=0에 핀되어 fixed인 `‹`(z 80)·`⋮`(z 70)를 덮어 **안 눌린다**
   (실측 scrollY 434). **두 화면이 같은 조건**이라 한쪽만 고치면 갈라진다 — 메모 쪽 규칙에서 같이
   고쳐야 하고 거긴 20라운드 태운 자리라 **별도 작업**이다. 사용자가 거슬린다고 하면 그때 둘 다.
2. **🟡 프로젝트 편집 키보드 첫 화면 본문 시작이 21px 내려갔다** (196 → 217px, 키보드까지 141px).
   컨트롤을 키운 대가다. **버그 아님** — 문서 스크롤러라 탭하면 캐럿이 올라온다. 없애려면 메모처럼
   `html.kb-open`에서 상태행을 접어야 하는데 **방금 키운 UI가 타이핑 중 사라지는 것**이라 보류.
   사용자에게 설명 완료, 결정 대기.
3. **🟡 진단 계측이 남아 있다** — `ViewportDebug.tsx`의 `🟣 proj` 블록(`8043fbd`·`cf6f274`)과
   `latchedProj`/`latchedPush`. 실기기 게이트가 닫혔으므로 **이제 지워도 된다.**
4. **🟡 `min-height: 46dvh`** (`.proj-detail-editing .proj-body-input`) — 문서 스크롤러에서는 증상이
   되지 않지만 뷰포트 단위가 남아 있다. 탭 영역 용도이므로 고정값이나 flex로. 급하지 않다.
5. **🔴 Memo 1단계 실기기 미확인** — 메모 저장·삭제·autosave를 실기기에서 아직 안 봤다(6절 참고).

# 4. NEXT

### 1) Memo 소유권 **2단계 `useMemoListData`** — 🔴 **사용자 지시 전까지 착수 금지**

- **대상**: `viewYear` `viewMonth0` `viewMemos` `memosForMonthState` `viewLoading` `memoDialogDay`
  `rangeMemos` `dateRangeMode` `customRangeStart/End` `typeFilter` `memoSearch`
  `importantMemosState` `memoSelectionMode` `selectedMemoIds` +
  `goToMonth` `goToToday` `patchMemoInLists` `refreshAfterMemoChange` + 달력 `useMemo` 6개
- **완료 조건**: 동작 변경 0 / 옮긴 본문이 원문과 글자 단위 동일 / `tsc` 0 · `npm run check` exit 0 /
  기준선 대조군 해시 동일 + **양성 대조 통과** / 운영 DB 무쓰기
- **하지 말 것**: UI 변경 · Undo·Redo 위치 변경 · 저장 payload dedupe · JSX 이동 · 새 Context
- **🔴 반드시 지킬 계약**: `patchLocalMemo`(1단계 훅 안)가 쓰는 **세 setter**
  `setViewMemos` · `setMemosForMonthState` · `setPostitViewMemo` 를 전부 유지한다.
  하나라도 빠지면 "메모를 껐다 켜야 반영된다"가 재발한다.

### 2) 진단 계측 제거 (OPEN 3) — 게이트가 닫혔으니 바로 가능

### 3) `buildMemoInput()` 추출 — **별건 커밋**

저장 payload 11개 필드가 `handlePostitBack` · `handleSaveMemo` · `handleMemoDialogBack`
**세 곳에 글자 그대로 복제**돼 있다. 1단계에서 일부러 안 건드렸다(동작 변경 0이 목적이었다).

### 4) `min-height: 46dvh` 정리 (OPEN 4)

# 5. INVARIANTS / DO NOT TOUCH

> 전체 목록은 **`CLAUDE.md` 3절 지뢰표**(매 세션 자동 로드)와 **`CLAUDE.md` 4-1 기능 동결**에 있다.
> 여기엔 **지금 작업(Memo 리팩토링)에 직접 걸리는 것만** 둔다.

- **`useMemoEditSession`에 bodyEditor를 넣지 마라.** `openBodyEditor`/`closeBodyEditor`와
  `bodyEditorDraft/Target/SessionKey`, caret 복원 effect는 `bodyEditorTarget === "project"` 분기로
  `setProjContent`·`setProjEditorKey`·`readProjContent`를 부른다 → **Memo 훅이 Project state를 소유**하게 된다.
- **`activeMemoEditorRef`를 어느 훅에도 넣지 마라.** `activeDialogKey`/`bigEditorOpen`/
  `postitEditMode`/`memoFormOpen` **네 그룹**을 읽어 ref 4개 중 하나를 고른다.
- **훅 밖 사용이 0회라 반환하지 않은 7개를 다시 반환하지 마라**: `setSavingMemo` `setMemoDateError`
  `setAutosaveStatus` `formBodyRef` `formBodyFlushRef` `memoBodyBaselineRef` `cancelFormBodyFlush`.
  밖에서 만지면 **자동저장 축소 가드의 기준이 깨진다**(되돌릴 수 없는 쓰기다).
- **`scheduleAutosave` · `autosaveTimerRef` · `memoBodyBaselineRef` · 본문 flush ref는 한 묶음이다.**
- **`pendingInsert` useState 선언을 원래 자리로 되돌리지 마라.** `loadMemoIntoForm`이
  `setPendingInsert(null)`을 부르는데 **useState는 hoisting이 없어** TDZ로 화면이 통째로 죽는다.
  같은 이유로 **훅 호출을 더 위로 올리지 마라**(`setPostitViewMemo`·`postitEditMode`가 걸린다).
- **"옮기면서 고치기" 금지** — 이동과 동작 변경을 같은 커밋에 섞지 않는다.

# 6. VERIFICATION

**마지막 정적 검사** (HEAD `2d82917`)
```
npx tsc --noEmit        0
npm run check           exit 0
eslint (Dashboard+훅)   22 → 20   (react-hooks/refs −3 / immutability +1)
```
🟡 `immutability` +1은 회귀가 아니다 — `autosaveTimerRef`가 훅 반환값이 되면서 React Compiler가
ref로 인식하지 못해 `handlePostitBack`을 지적한다. **같은 ref 객체이고 동작은 동일하다.**

**마지막 화면 검증** (로컬 375×684 / 1280×800, 운영 DB **무쓰기**)
- 기준선 대조군(`docs/baseline`): 되돌린 상태와 얹은 상태의 **스냅샷 해시 동일, 차집합 0**
- **양성 대조 통과**: `main.page` padding 1px → 56 → 57 → 56
- 기존 메모 document 편집 진입 시 `<a href>`·`H1` 보존 / 신규 폼 초기 날짜 / 제목 입력 /
  날짜검증 effect 양방향 / 신규 폼 취소 시 목록 불변 / 메모 쓰기 액션 로그 **0건**

**마지막 실기기 검증**: `00f7756`(대시보드 하단 잘림) · `7973e3e`(프로젝트 편집 키보드) — 둘 다 정상.

**🔴 직접 검증하지 못한 것**
- Memo 1단계의 **쓰기 경로 전부**: autosave 실제 저장 / 수동 저장 / 삭제 / 목록 즉시 반영 /
  닫았다 다시 열었을 때 값 유지. **운영 Supabase에 쓰는 경로라 실행하지 않았다**(`.env.local`이 운영).
- Memo 1단계 **실기기 미확인**.
- Browser 패널이 숨겨져 있어 **스크린샷 0장**. 좌표·computed는 정확하지만 스크롤·애니메이션은 못 쟀다.

# 7. REFERENCES

| 무엇 | 어디 |
|---|---|
| **"하지 마라" 규칙 전체** | `CLAUDE.md` **3절 지뢰표** + **4-1 기능 동결** |
| **HANDOFF 운영 규칙(영구)** | `CLAUDE.md` **0-2절** |
| **UI 체감 신고 대응 순서** | `CLAUDE.md` **0-3절** |
| **보고 형식** | `CLAUDE.md` **5절** (정본) |
| **"스크롤 잠김" 2분 절차 / 불변식 7개** | `CLAUDE.md` **7절**, `src/lib/layout-invariants.ts`, `?debug=vp` |
| **사고 경위·실측 수치** | `docs/incidents.md` · `docs/mobile-pwa-postmortem.md` |
| **리팩토링 무변화 판정 절차** | `docs/baseline/README.md` (⚠️ `__settle()` 앞에 `await document.fonts.ready`) |
| **모바일 편집 구조의 현재 계약** | `dashboard.css` 9525·9579·9599·10228절 주석 |
| **제품·설계 결정** | Notion [Product Workspace](https://app.notion.com/p/3c565d3c830981759c32c0775d7e1996) — Roadmap 배너 · Monthly MEMO Feature · [Decision Log](https://app.notion.com/p/8721a21da37d416fa98572c9db2f34a6) |
| **실패 회고(사람이 읽는 글)** | Notion [🕳️ 지뢰밭 모임](https://app.notion.com/p/3c665d3c83098190850ee3de98477f45) |
| **이 파일의 누적본(2026-09-08 이전)** | `git show 2d82917:HANDOFF_NEXT_CLAUDE.md` |
| **코드 주석의 "HANDOFF NN절"** | 전부 **접힌 옛 절**이다(내 번호로 찾지 마라). 위 누적본 또는 `git log -- HANDOFF_NEXT_CLAUDE.md`. 살아 있는 내용은 이미 `CLAUDE.md`·`docs/incidents.md`·Notion에 있다 |
| **Notion 동기화 게이트** | `AGENTS.md` (정본) |
