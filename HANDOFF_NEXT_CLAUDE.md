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
7-1. **OPEN 식별자는 안정적이다** — `OPEN-MEMO-KB-MINHEIGHT`처럼 설명형 이름을 쓰고,
   **닫혔다고 남은 것을 재번호하지 않으며 그 이름을 재사용하지 않는다.** 코드 주석·commit·
   `docs/incidents.md`가 같은 이름을 참조한다.
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

- **기준 HEAD**: master, **푸시 완료**. 마지막 코드 커밋 **`76e7b8e`**(MindSet 바 추출).
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
  🔴 그 전까지 **Memo 1·2단계부터 6개 커밋이 미푸시 상태였다**(배포본이 `8cebbe7`에 머물러 있었다).
  **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** — 내 수정이
  사용자 화면에 아예 없을 수 있다(`CLAUDE.md` 7절 0번이 같은 얘기를 한다).
- **실측**: `Dashboard.tsx` **3,605줄** · `dashboard.css` 10,980줄 · 훅 6개
  (`useMemoEditSession` 326 · `useMemoListData` 230 · `useMyPageSession` 215 ·
  `useIdeaBuild` 186 · `useNewsTrendFeed` 124 · `useJobsFeed` 105)
- **끝난 작업**: **Memo 소유권 리팩토링** 1·2단계 완료. PHASE 2 종료, **PHASE 3의 JSX-first 추가 분리는 중단**
  (⑭ theme은 Context 비도입 결정과 충돌 / ⑯ 빠른수정은 밀도 0.57로 비용 초과 / ⑰ Monthly MEMO는
  prop 66이라 단일 분리 불가). 대신 **hook-first**로 방향을 바꿨고 두 단계로 끝났다.
- **현재 큰 작업: Dashboard ownership 분리.** Audit(후보 6개)은 4-1절.
  **1~4순위 완료** — My Page `e805191` · Idea Build `50cdf8e` · Briefing 피드 `3f999da` ·
  MindSet 바 `76e7b8e`.
  **남은 후보(Today's Focus · Projects)는 각각 사용자 승인 후 별건으로 시작한다 —
  승인 없이 착수하지 마라.**
- **모바일 Memo 본문 14px은 재현되지 않았다**(2026-09-09, 코드 변경 0) — 본문 크기는 전부
  `var(--memo-base-font)`(모바일 16px) 하나를 쓰고 320/375/430에서 동일했다. **열린 작업 아님.**
- **✅ 2026-09-09 실기기 검증 완료 (사용자 확인).** Memo 소유권 1·2단계 · My Page 추출 ·
  Idea Build 추출 · 마이페이지 닉네임 칸 — **전부 정상.**
  🟡 **`b8668aa`(Briefing 실기기 2건 수정)와 `76e7b8e`(MindSet)는 실기기 미확인.**
    앞의 것은 `3f999da` 후속 — 발견된 2건 모두 **회귀가 아니라 기존 버그**였다.
    (그 커밋 diff에 `scroll` 0회 · `onOpen` 본문 글자 동일 · `setTrendHistoryDate(null)`이
    onOpen에 들어간 적 없음.) 나머지 Briefing 경로는 실기기 정상 확인 완료.
- **blocker**: 없음. **Memo 3단계는 계획돼 있지 않다** — 새 지시 없이 시작하지 마라.

hook-first 누적: `Dashboard.tsx` 4,309(Memo 착수 시점) → 4,137(Memo 1단계) → 4,019(Memo 2단계)
→ 3,847(My Page) → **3,725줄**(Idea Build). 훅 4개 954줄.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `76e7b8e` | **Dashboard ownership — MindSet 바 추출.** state 2 · ref 2 · 함수 3을 `useMindsetBar`로(effect·useMemo·파생값은 원래 0). `Dashboard.tsx` 3,620→3,583(−37). 외부 의존 **1** · 반환 키 4 · rename 0. **옮긴 본문 42줄 바이트 단위 동일.** 입력칸 JSX와 `guardLogin()`은 Dashboard 유지. eslint 17→17 |
| `b8668aa` | **실기기 2건 — Trend 날짜·Briefing 스크롤이 재진입 시 유지되던 것.** 둘 다 **기존 버그**(git 증거는 커밋 메시지). `onOpen`에 Trend 날짜 리셋 한 줄 + Briefing 3개만 `.dialog-inner.scrollTop = 0`. 실측 400→0 / 9.8→오늘, News↔Trend 독립 유지 |
| `3f999da` | **Dashboard ownership 3순위 — Briefing 피드 추출.** 훅 **둘**로(`useNewsTrendFeed` state 4·effect 2·fn 2·파생 8 / `useJobsFeed` state 5·effect 3·fn 2·파생 2). `Dashboard.tsx` 3,725→3,605(−120). 외부 의존 5+5 · 반환 키 16+11 · rename 0. **옮긴 본문 131줄 바이트 단위 동일.** `renderJobCard`와 선택→메모 경로는 Dashboard bridge 유지. eslint 17→17 |
| (검증) | 2026-09-09: **실기기 확인 완료** — Memo 1·2단계 · My Page · Idea Build · 닉네임 칸 전부 정상. `8cebbe7..454a362` 푸시. |
| `454a362` | **마이페이지 닉네임 칸이 모바일 키보드 뒤에 깔리던 것.** 원인은 값이 아니라 **배선 누락** — 비밀번호 칸 셋과 달리 `onFocus`도 `scroll-margin-top`도 없었다(실측 375×684+kb 326: 칸 top 406 vs 키보드 상단 358). `revealMyPageField`의 래퍼 탐색을 `.wave-field, .mypage-field`로 넓히고 같은 핸들러·같은 76px을 붙였다. 데스크톱 영향 0 |
| (조사) | 2026-09-09: **Briefing 피드 Preflight Audit** — 154줄 · state 9 · effect 5 · fn 5 · 파생값 10. 외부 참조 **정확히 3개**. 판정 `SAFE WITH BOUNDARY`. **코드 변경 0** |
| `50cdf8e` | **Dashboard ownership 2순위 — Idea Build 추출.** state 16 · effect 1 · 함수 5 · 파생값 3을 `useIdeaBuild`로. `Dashboard.tsx` 3,847→3,725(−122). 외부 의존 4 · 반환 키 31 · rename 0. **옮긴 본문 118줄 바이트 단위 동일.** JSX 3덩어리는 Dashboard 소유 유지. eslint 17→17 |
| `e805191` | **Dashboard ownership 1순위 — My Page / 계정 추출.** state 15 · ref 2 · 파생값 2 · 함수 6을 `useMyPageSession`으로. `Dashboard.tsx` 4,019→3,847(−172). 외부 의존 6 · 반환 키 26 · rename 0. **옮긴 본문 154줄 바이트 단위 동일.** eslint 17→17 |
| `8fe11c0` | **Memo 소유권 2단계** — 목록·달력 state 15 · ref 1 · 함수 3 · useMemo 6 · effect 4를 `useMemoListData`로. `Dashboard.tsx` 4,137→4,019(−118). 외부 의존 4 · 반환 키 37 · rename 0. **옮긴 본문 81줄 9/9 글자 단위 동일** |
| `f2962aa` | **Memo 소유권 1단계** — 폼 state 16 · ref 4 · 함수 11 · effect 1(날짜검증)을 `useMemoEditSession`으로. `Dashboard.tsx` 4,309→4,137(−172). 외부 의존 12 · 반환 키 39 · rename 0. **옮긴 본문 171줄 11/11 동일**. 쓰기 경로 전부 운영 DB로 검증 완료 |
| (조사) | 2026-09-09: **Dashboard ownership Audit** — 책임 16개 분류(A 5 · B 3 · C 8), 후보 6개 선정. 클러스터별 "밖에서 참조되는 심볼" 실측이 판정 근거다. **코드 변경 0** |
| (조사) | 2026-09-09: **모바일 Memo 본문 14px 재현 실패** — 로컬 dev에서 실제 DOM 실측 결과 전 경로 16px. 코드 변경 0 (위 1절) |
| (문서) | 2026-09-09: `AGENTS.md`의 Notion 동기화 규칙을 CURRENT 정본 정책과 일치시켰다. 9/8 감사 핵심 FAIL 원인 두 건의 후속 해소 Decision Log를 남기고, Official·GeekNews migration 번호는 착수 시 목록 확인 후 배정하도록 고정값을 제거했다 |
| `00f7756` · `7973e3e` | **실기기 게이트 둘 — 사용자 확인 완료.** 자동 새로고침 후 대시보드 하단 잘림 / 프로젝트 메모·편집 키보드 하단 여백·가림. 둘 다 정상. **이 둘을 근거로 다음 작업을 막지 마라** |
| `c7258cc` (+ `7a0d972` `57d34ec` `978fc68` `35f161b` `48bb23d`) | 프로젝트 편집을 **일반 페이지**로 — 옛 구조 4조건 제거. 후속 UI 정리 포함 |
| `d922ac5` | "오늘의 뉴스"에 지난주 기사 — 4일째부터 하루 −12 감점(`STALE_PENALTY_PER_DAY`) |
| `87f4707` · `0656944` | 첫 로딩 30~107초 — 비싼 생성을 `isPastManualRefreshWindow()`(11:30)로 미룸 |
| `845ca19` | 역량 시그널 0건 고착 v3 — 근거 패딩 차단 + `repairSignalEvidence` 재시도 |

경위·수치는 git 로그와 Notion Decision Log에 있다. 여기 옮겨 적지 마라.

# 3. OPEN

아직 해결되지 않은 것만. 해결되면 **행을 지우고, 그 식별자는 다시 쓰지 않는다.**

> 🔴 **식별자는 안정적이다 — 재번호·재사용 금지.** 코드 주석·commit·`docs/incidents.md`가
> 같은 이름을 참조한다. 항목이 닫혀도 남은 것들의 이름을 당기지 마라.
> (2026-09-09에 숫자 번호를 이 방식으로 바꿨다. 예전 코드 주석의 **"OPEN 6"은
> 아래 `OPEN-MEMO-KB-MINHEIGHT`**, "OPEN 3"은 `OPEN-VIEWPORT-DEBUG`를 가리킨다.)

- **`OPEN-TOOLBAR-COVERS-HEADER`** 🔴 서식툴바가 상단 버튼 둘을 덮는다 (메모·프로젝트 공통).
  끝까지 스크롤하면 `.mobile-rich-toolbar`(z 240)가 y=0에 핀되어 fixed인 `‹`(z 80)·`⋮`(z 70)를
  덮어 **안 눌린다**. **두 화면이 같은 조건**이라 한쪽만 고치면 갈라진다 — 메모 쪽 규칙에서 같이
  고쳐야 하고 거긴 20라운드 태운 자리라 **별도 작업**이다. 사용자가 거슬린다고 하면 그때 둘 다.
- **`OPEN-PROJ-KB-OFFSET`** 🟡 프로젝트 편집에서 키보드 첫 화면의 본문 시작이 21px 내려갔다.
  컨트롤을 키운 대가다. **버그 아님** — 문서 스크롤러라 탭하면 캐럿이 올라온다. 없애려면 메모처럼
  `html.kb-open`에서 상태행을 접어야 하는데 **방금 키운 UI가 타이핑 중 사라지는 것**이라 보류.
  사용자에게 설명 완료, **결정 대기.**
- **`OPEN-VIEWPORT-DEBUG`** 🟡 진단 계측이 남아 있다 — `ViewportDebug.tsx`의 `🟣 proj` 블록과
  `latchedProj`/`latchedPush`. 실기기 게이트가 전부 닫혔으므로 **이제 지워도 된다.**
- **`OPEN-PROJ-46DVH`** 🟡 `.proj-detail-editing .proj-body-input`의 `min-height: 46dvh` —
  문서 스크롤러에서는 증상이 되지 않지만 뷰포트 단위가 남아 있다. 고정값이나 flex로. 급하지 않다.
- **`OPEN-MEMO-KB-MINHEIGHT`** 🟡 문서-코드 불일치(발견만 함). `CLAUDE.md` 지뢰표는 *"키보드 여유는
  `padding-bottom` 하나로 충분하다 — `min-height`를 걷었다"* 고 적었는데 **`dashboard.css`에 그 규칙이
  그대로 있고 로컬 실측도 규칙대로 동작한다**(`html.kb-open .memo-edit-page.big-postit`의
  `min-height: calc(100lvh + --kb-inset)`).
  🔴 **리팩토링 회귀가 아니다** — Memo 1단계(`f2962aa`) 이후 이 규칙에 닿은 CSS 변경이 0이다.
  지뢰표 기록이 낡았는지 처방이 되돌려졌는지 **원인 미확정 — 고치기 전에 그것부터 가려라**
  (실기기에서 `100lvh`는 792라 계산이 로컬과 다르다).

# 4. NEXT

**🔴 Memo 소유권 리팩토링은 1·2단계로 끝났다. 3단계는 계획돼 있지 않다 — 새 지시 없이 시작하지 마라.**

## 4-1. Dashboard ownership 분리 — 후보 현황

책임 16개를 A/B/C로 분류했다(**A 5 · B 3 · C 8**). 판정 근거는 줄 수가 아니라
**"그 클러스터 밖(비-JSX)에서 참조되는 심볼 수"** 실측이다. 그 수치는 착수할 때 다시 재라.

| # | 책임 | 등급 | 상태 |
|---|---|---|---|
| 1 | My Page / 계정 | A | ✅ `e805191` |
| 2 | Idea Build | A | ✅ `50cdf8e` |
| 3 | Briefing 피드(News·Trend·Jobs) | B | ✅ `3f999da` — 훅 2개로 분리 |
| 4 | MindSet 바 | A | ✅ `76e7b8e` (실측 42줄) |
| **5** | **Today's Focus** ← 다음 후보 | A | 미착수 · 55줄 · 밖 참조 0(`openFocusMemo`만 콜백 주입) |
| 6 | Projects | B | 미착수 · **밖 참조 27** — 마지막에 해라 |

**C 등급은 후보가 아니다**(억지로 넣지 마라): 선택→메모 저장(에디터 ref 4개를 가로질러
ref injection이 필요하다) · bodyEditor 다리 · Key Notes · 포스트잇 오케스트레이션(Memo 3단계) ·
모바일 시트/`activeMemoEditorRef` · dialog 레지스트리 · `confirmDialog` · `pendingInsert`.
**`patchMemoInLists`는 경계가 더 좋아지지 않으므로 Dashboard bridge로 그대로 인정한다.**

### 추출 3회에서 확립된 경계 (다음 후보에도 그대로 적용해라)

- **JSX는 Dashboard가 소유한다.** 훅은 `.ts`이고 JSX를 담지 않는다 — JSX 덩어리가 쓰는 값을
  훅이 반환하는 쪽으로 푼다(`.tsx`로 바꾸지 마라). Idea Build가 이 경계의 기준 사례다.
- **dialog에 안 가는 값은 spread에서 빼라** — rest 분해로 갈라낸다(`openMyPage`, Idea의 JSX 전용 11개).
- **훅 호출 위치로 훅 호출 순서를 보존한다.** 위치를 옮겨야 하면 그 위에서 쓰는 코드가 0인지 먼저 재라.
- **옮긴 본문은 바이트 단위로 diff해서 rename 0을 증명한다.**

## 4-2. Briefing 피드 — 분리 후 남은 경계 (`3f999da`)

훅 둘이 소유한다. **더 쪼개지도, 하나로 합치지도 마라** — `briefing` payload 하나가 News·Trend를
같이 먹이고(가르면 fetch가 두 벌), `jobs`는 `briefing`을 코드에서 한 번도 참조하지 않는다.

**Dashboard에 남은 bridge 4개는 설계상 남긴 것이다:**
- `renderJobCard` — JSX 함수라 `.ts` 훅에 안 들어간다. 그게 잇는
  `selectableHandlers`·`openFullJobPicker`(선택 → 메모)도 Dashboard가 bridge한다.
  🔴 **두 훅 모두 Memo를 알지 않는다. 훅 → Memo 직접 참조를 만들지 마라.**
- `useDialogRegistry.onOpen` 3줄 — 훅은 setter만 돌려주고 **registry 로직은 옮기지 않았다.**
  (News 날짜 되돌림 / Jobs 탭·펼침 초기화. 이 셋이 재진입 리셋 계약이다.)
- 다이얼로그 3개 JSX 조립 · `onResetRoles`(Jobs ↔ My Page).

⚠️ `todayIso`는 두 훅이 fallback payload에서 쓰므로 **훅 호출보다 위에 있어야 한다**(이번에 올렸다).
⚠️ **재진입 리셋은 전부 `onOpen` 한 곳이 한다**(News 날짜 · Trend 날짜 · Jobs 탭·펼침 ·
   Briefing 3개 스크롤). 훅 안에서 초기화하지 말고, **그 스크롤 리셋 키를 늘리지 마라** —
   모든 다이얼로그를 top reset하는 것은 이 앱의 계약이 아니다(편집창은 위치가 유지돼야 한다).

## 4-3. 그 밖의 대기 항목

1. **진단 계측 제거** (`OPEN-VIEWPORT-DEBUG`) — 실기기 게이트가 닫혔으니 바로 가능.
2. **`buildMemoInput()` 추출** — 별건 커밋. 저장 payload 11개 필드가 `handlePostitBack` ·
   `handleSaveMemo` · `handleMemoDialogBack` **세 곳에 글자 그대로 복제**돼 있다.
   두 단계 모두 "동작 변경 0"이 목적이라 일부러 안 건드렸다.
3. **`min-height: 46dvh` 정리** (`OPEN-PROJ-46DVH`).
4. **`OPEN-MEMO-KB-MINHEIGHT` 원인 규명** — 고치기 전에 "지뢰표가 낡았나 / 처방이 되돌려졌나"부터 가려라.

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

**✅ 2026-09-09 실기기 검증 완료 (사용자 확인) — 열린 게이트 없음.**
Memo 소유권 1·2단계 · My Page 추출 · Idea Build 추출 · 마이페이지 닉네임 칸 **전부 정상.**
그 전 세션들의 상세 검증표(Memo 1단계 쓰기 경로 8항목 · 2단계 화면 9경로 등)는
**커밋 메시지와 git history에 있다** — 여기 복제하지 않는다(0-2절 규칙 3·6).

**마지막 정적 검사** (`454a362` 기준)
```
npx tsc --noEmit          0
npm run check             exit 0
eslint (Dashboard+훅4)    17 → 17     (추출 3회 내내 신규 0)
CSS 중괄호 (주석 제거 후) 2903 / 2903
```
🟡 `immutability` 1건은 회귀가 아니다 — `autosaveTimerRef`가 훅 반환값이 되면서 React Compiler가
ref로 인식하지 못해 `handlePostitBack`을 지적한다. **같은 ref 객체이고 동작은 동일하다.**

**추출 3회의 무변화 근거** (다음 후보에도 같은 절차를 써라)
- 옮긴 본문을 원본과 **바이트 단위로 diff**했다: My Page 154/154 · Idea Build 118/118 · rename 0.
- prop 이름·의미 변경 0. 훅 반환 키가 곧 dialog prop 이름이라 spread가 그대로 편다.
- 훅 호출 위치로 **훅 호출 순서**를 보존했다(Idea는 클러스터 자리 그대로, My Page는
  `open`이 필요해 `useDialogRegistry` 아래로 내렸고 그 위에서 쓰는 코드가 0인 것을 먼저 쟀다).

**🔴 직접 검증하지 못한 것 (현재 기준)**
- Android · 설치형 PWA standalone은 안 봤다(확인은 전부 iOS 실기기 + 로컬 뷰포트).
- 닉네임 칸의 **iOS 액세서리 바(열쇠·카드 칩) 회피**는 그 바 높이를 우리가 그릴 수 없어
  로컬에서 못 쟀다 — 76px이 그것을 넘기는 값이라는 근거는 **실기기 확인 하나뿐**이다.
- Idea Build의 **저장 확정(DB write)** 두 경로와 **재생성**은 로컬에서 일부러 실행하지 않았다
  (확인 팝업까지만 가고 취소). 실기기에서는 사용자가 확인했다.

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
