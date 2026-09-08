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

- **기준 HEAD**: master, 워킹트리 clean. **마지막 코드 커밋 `8fe11c0`**(Memo 2단계) — 그 뒤는 문서 커밋뿐이다.
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
- **실측**: `Dashboard.tsx` **4,019줄** · `dashboard.css` 10,977줄 ·
  `useMemoEditSession.ts` 326줄 · `useMemoListData.ts` 230줄
- **현재 큰 작업**: **Memo 소유권 리팩토링** — 1단계·2단계 **모두 완료**
- **상태**: 기능 작업은 열린 것이 없다. 리팩토링 PHASE 2는 종료, **PHASE 3의 JSX-first 추가 분리는 중단**
  (⑭ theme은 Context 비도입 결정과 충돌 / ⑯ 빠른수정은 밀도 0.57로 비용 초과 / ⑰ Monthly MEMO는
  prop 66이라 단일 분리 불가). 대신 **hook-first**로 방향을 바꿨고 두 단계로 끝났다.
- **blocker**: 없음. **3단계는 계획돼 있지 않다** — 새 지시 없이 시작하지 마라.

PHASE 3의 JSX-first 추가 분리는 중단 상태 그대로다. hook-first가 그 대안이었고 두 단계로 끝났다.
누적: `Dashboard.tsx` 4,309(착수 시점) → 4,137(1단계) → **4,019줄**(2단계), 훅 2개 556줄.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `8fe11c0` | **Memo 소유권 2단계** — 목록·달력 state 15 · ref 1 · 함수 3 · useMemo 6 · effect 4를 `useMemoListData`로. `Dashboard.tsx` 4,137→4,019(−118). 외부 의존 4 · 반환 키 37 · rename 0. **옮긴 본문 81줄 9/9 글자 단위 동일** |
| `f2962aa` | **Memo 소유권 1단계** — 폼 state 16 · ref 4 · 함수 11 · effect 1(날짜검증)을 `useMemoEditSession`으로. `Dashboard.tsx` 4,309→4,137(−172). 외부 의존 12 · 반환 키 39 · rename 0. **옮긴 본문 171줄 11/11 동일**. 쓰기 경로 전부 운영 DB로 검증 완료 |
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
5. **🟡 Memo 리팩토링 — 실기기만 남았다.** 1단계는 쓰기 경로 전부를 **운영 DB로 실제로 태워** 통과,
   2단계는 달력·목록 9경로를 화면에서 통과시켰다(6절). 남은 것은 **실기기 확인**이고 사용자만 할 수 있다.
6. **🟡 문서-코드 불일치 (Memo 리팩토링과 무관, 발견만 함 · 이번에도 안 건드렸다).** `CLAUDE.md` 지뢰표는 *"키보드 여유는
   `padding-bottom` 하나로 충분하다 — `min-height`를 걷었다(실측 `minH 1010→358` / `padB 422→326`)"*
   고 적었는데, **현재 `dashboard.css` 10029~10032에 그 규칙이 그대로 있다**
   (`html.kb-open .memo-edit-page.big-postit { min-height: calc(100lvh + --kb-inset); padding-bottom: calc(96px + …) }`).
   로컬 375 주입 실측도 `minH 684→1010` · `padB 96→422`로 **규칙 그대로** 동작한다.
   🔴 `dashboard.css`의 마지막 변경은 `48bb23d`로 **리팩토링 이전**이고 `f2962aa` 이후 CSS diff는 0이라
   **1단계 회귀가 아니다.** 지뢰표 기록이 낡았는지, 그 처방이 되돌려졌는지 **원인 미확정** —
   고치기 전에 그것부터 가려라(실기기에서 `100lvh`는 792라 계산이 로컬과 다르다).

# 4. NEXT

**🔴 Memo 소유권 리팩토링은 1·2단계로 끝났다. 3단계는 계획돼 있지 않다 — 새 지시 없이 시작하지 마라.**

1. **진단 계측 제거** (OPEN 3) — 실기기 게이트가 닫혔으니 바로 가능.
2. **`buildMemoInput()` 추출** — 별건 커밋. 저장 payload 11개 필드가 `handlePostitBack` ·
   `handleSaveMemo` · `handleMemoDialogBack` **세 곳에 글자 그대로 복제**돼 있다.
   두 단계 모두 "동작 변경 0"이 목적이라 일부러 안 건드렸다.
3. **`min-height: 46dvh` 정리** (OPEN 4).
4. **OPEN 6 원인 규명** — 고치기 전에 "지뢰표가 낡았나 / 처방이 되돌려졌나"부터 가려라.

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

**마지막 정적 검사** (2026-09-08, Memo 2단계 `8fe11c0` 기준)
```
npx tsc --noEmit        0
npm run check           exit 0
eslint (Dashboard+훅2)  22 → 20 → 17   (1단계 refs −3 / 2단계 −3)
```
🟡 `immutability` +1은 회귀가 아니다 — `autosaveTimerRef`가 훅 반환값이 되면서 React Compiler가
ref로 인식하지 못해 `handlePostitBack`을 지적한다. **같은 ref 객체이고 동작은 동일하다.**

**2단계 화면 검증** (로컬 1280×800, 운영 DB **쓰기 0건**)
- 기준선 대조군: 되돌린 상태와 얹은 상태의 **해시 동일, 차집합 0** / 양성 대조 51→54→51
- 서빙 빌드가 실제로 갈렸는지 **청크 내용**으로 확인(`useMemoListData` 유무 ↔ `customRangeIncomplete` 유무)
- 월 이동(연속 클릭 1회만 먹는 `navigatingRef` 가드 포함) · Today · 날짜 선택 ·
  기간 전체 53/이번 달 12/선택일 3 · 검색 3→2 · 유형 필터 · 중요 메모(대시보드 핀 3 / Key Notes 20) ·
  선택 모드 진입·선택·해제 · 기존 메모 열기(링크 보존) · 주간 미리보기·TODAY/NEXT

**1단계 쓰기 경로 검증** (운영 Supabase 실제 쓰기, 테스트 메모 1건 생성→삭제, 잔존 0)
- `createMemo` 1 · `updateMemo` 4(autosave 2 + 수동 2) · `deleteMemo` 1
- autosave 실저장 / 수동 저장 / 삭제(대시보드로 안 튕김) / **세 setter 동시 반영** /
  재진입 값 유지 / quick·document / plain·rich_html 보존 / 모바일 375 구조

**마지막 실기기 검증**: `00f7756`(대시보드 하단 잘림) · `7973e3e`(프로젝트 편집 키보드) — 둘 다 정상.
**Memo 1단계는 실기기 미확인**(OPEN 5).

**✅ Memo 1단계 쓰기 경로 검증 완료 (2026-09-08, 로컬 → 운영 Supabase 실제 쓰기)**

테스트 메모 **1건**(`5e71f1c4…`)만 만들어 전 경로를 태우고 **삭제로 닫았다 — 잔존 0건.**
서버 로그로 확인한 실제 액션: `createMemo` 1 · `updateMemo` 4(autosave 2 + 수동 2) · `deleteMemo` 1
· 그 뒤마다 `getMemosForMonthAction`.

| 항목 | 결과 |
|---|---|
| ① autosave 실제 저장 | ✅ `저장 중…` → `저장됨 ✓`, 새로고침 후에도 본문 유지 |
| ② 수동 저장 | ✅ 폼 저장 · 포스트잇 저장 둘 다 |
| ③ 삭제 | ✅ 목록·달력에서 사라지고 **대시보드로 안 튕김**(`closePostitView` 계약 유지) |
| ④ 목록 즉시 반영 **세 setter** | ✅ `viewMemos`(목록 행) · `memosForMonthState`(달력 셀) · `postitViewMemo`(저장 후 뷰가 새 제목) **전부** |
| ⑤ 닫았다 재진입 | ✅ 새로고침 후 제목·본문 유지 |
| ⑥ quick / document | ✅ quick=`textarea.memo-quick-editor`(평문) / document=tiptap, 상호 전환 정상 |
| ⑦ plain / rich_html 보존 | ✅ plain 왕복 유지, document에서 `<strong>` 추가 → `rich_html`로 저장 → 재로드 후 보존 |
| ⑧ 모바일(375 뷰포트) | ✅ 편집 진입 · 마커 `.memo-edit-page` · **조상에 굴러가는 스크롤러 0개** · `transform: none` · 툴바 `sticky top:0` · 뒤로가기 `fixed t=2` · 키보드 주입 시 레이아웃 정상 |

**🔴 직접 검증하지 못한 것**
- **실기기 미확인** — ⑧은 로컬 375 뷰포트일 뿐 실제 iOS가 아니다. 실기기에서만 나는 것들
  (키보드 애니메이션·`vv.offsetTop` 승격·주소창)은 여전히 안 봤다. **사용자만 할 수 있다.**
- Browser 패널이 숨겨져 있어 **스크린샷 0장**. 좌표·computed는 정확하지만 스크롤·애니메이션은 못 쟀다.
- 기존 메모는 **읽기만** 했다(모바일에서 ‹로 나가면 `handlePostitBack`이 저장하므로 reload로 이탈).

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
