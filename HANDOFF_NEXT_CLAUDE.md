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

- **기준 HEAD**: master, **`origin/master`까지 푸시 완료**. 마지막 코드 커밋 `454a362`(마이페이지 닉네임 칸 노출).
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
  🔴 그 전까지 **Memo 1·2단계부터 6개 커밋이 미푸시 상태였다**(배포본이 `8cebbe7`에 머물러 있었다).
  **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** — 내 수정이
  사용자 화면에 아예 없을 수 있다(`CLAUDE.md` 7절 0번이 같은 얘기를 한다).
- **실측**: `Dashboard.tsx` **3,725줄** · `dashboard.css` 10,980줄 · `useMemoEditSession.ts` 326줄 ·
  `useMemoListData.ts` 230줄 · `useMyPageSession.ts` 215줄 · `useIdeaBuild.ts` 186줄
- **끝난 작업**: **Memo 소유권 리팩토링** 1·2단계 완료. PHASE 2 종료, **PHASE 3의 JSX-first 추가 분리는 중단**
  (⑭ theme은 Context 비도입 결정과 충돌 / ⑯ 빠른수정은 밀도 0.57로 비용 초과 / ⑰ Monthly MEMO는
  prop 66이라 단일 분리 불가). 대신 **hook-first**로 방향을 바꿨고 두 단계로 끝났다.
- **현재 큰 작업: Dashboard ownership 분리.** Audit(후보 6개)은 4-1절.
  **1순위 My Page `e805191` · 2순위 Idea Build `50cdf8e` 완료.**
  **3순위 Briefing 피드는 Preflight Audit만 끝냈다(2026-09-09, 코드 변경 0) — 판정 `SAFE WITH BOUNDARY`,
  추천 구조는 4-2절. 구현은 사용자 승인 대기다.**
  **남은 후보는 각각 사용자 승인 후 별건으로 시작한다 — 승인 없이 착수하지 마라.**
- **모바일 Memo 본문 14px은 재현되지 않았다**(2026-09-09). 코드/로컬 DOM 기준 **16px 확인 완료**:
  `--memo-base-font`(모바일) · `.rich-editor-content` · `.memo-quick-editor` 전부 16px, 320/375/430
  뷰포트 동일, CSS에 Memo 본문 14px 규칙 **없음**(본문 font-size는 5줄 전부 `var(--memo-base-font)`).
  코드 변경 0. **실기기에서 다시 나면 배포 commit 차이부터 확인해라.** 열린 작업으로 취급하지 않는다.
- **✅ 2026-09-09 실기기 검증 완료 (사용자 확인).** Memo 소유권 1·2단계 · My Page 추출 ·
  Idea Build 추출 · 마이페이지 닉네임 칸 — **전부 정상.** 열린 실기기 게이트는 없다.
- **blocker**: 없음. **Memo 3단계는 계획돼 있지 않다** — 새 지시 없이 시작하지 마라.

hook-first 누적: `Dashboard.tsx` 4,309(Memo 착수 시점) → 4,137(Memo 1단계) → 4,019(Memo 2단계)
→ 3,847(My Page) → **3,725줄**(Idea Build). 훅 4개 954줄.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
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
5. **🟡 문서-코드 불일치 (Memo 리팩토링과 무관, 발견만 함 · 이번에도 안 건드렸다).** `CLAUDE.md` 지뢰표는 *"키보드 여유는
   `padding-bottom` 하나로 충분하다 — `min-height`를 걷었다(실측 `minH 1010→358` / `padB 422→326`)"*
   고 적었는데, **현재 `dashboard.css` 10029~10032에 그 규칙이 그대로 있다**
   (`html.kb-open .memo-edit-page.big-postit { min-height: calc(100lvh + --kb-inset); padding-bottom: calc(96px + …) }`).
   로컬 375 주입 실측도 `minH 684→1010` · `padB 96→422`로 **규칙 그대로** 동작한다.
   🔴 **리팩토링 회귀가 아니다** — Memo 1단계(`f2962aa`) 이후 이 규칙에 닿은 CSS 변경은 0이고,
   `454a362`가 건드린 것은 마이페이지 `scroll-margin-top` 한 줄뿐이다(메모 편집과 무관).
   지뢰표 기록이 낡았는지, 그 처방이 되돌려졌는지 **원인 미확정** —
   고치기 전에 그것부터 가려라(실기기에서 `100lvh`는 792라 계산이 로컬과 다르다).

# 4. NEXT

**🔴 Memo 소유권 리팩토링은 1·2단계로 끝났다. 3단계는 계획돼 있지 않다 — 새 지시 없이 시작하지 마라.**

## 4-1. Dashboard ownership Audit 결과 (2026-09-09, 조사만)

책임 16개를 실제 코드 기준으로 묶고 A/B/C로 분류했다. **A 5 · B 3 · C 8.**
판정 근거는 줄 수가 아니라 **"그 클러스터 밖(비-JSX)에서 참조되는 심볼 수"** 실측이다.

### 추천 후보 6개 (위험 대비 효과 순)

| # | 책임 | 등급 | 범위 (`Dashboard.tsx`) | 예상 파일 | 밖에서 참조되는 심볼 |
|---|---|---|---|---|---|
| ~~1~~ | ~~My Page / 계정~~ **→ `e805191`로 완료** | A | (이동 완료) | `src/lib/dashboard/useMyPageSession.ts` | 0개 |
| ~~2~~ | ~~Idea Build~~ **→ `50cdf8e`로 완료** | A | (이동 완료) | `src/lib/dashboard/useIdeaBuild.ts` | 0개 |
| **3** | **Briefing 피드(News·Trend·Jobs)** — Audit 완료, **승인 대기** | B | 154–307 (154줄) · state 9 · effect 5 · fn 5 · 파생값 10 | **4-2절 참고**(단일 파일 아님) | **3개**(이름 확정) |
| 4 | Mindset 바 | A | 671–744 (74줄) · state 2 · ref 2 · useMemo 1 · fn 3 | `src/lib/dashboard/useMindsetBar.ts` | 0개 |
| 5 | Today's Focus | A | 1632–1686 (55줄) · state 7 · effect 1 · fn 3 | `src/lib/dashboard/useTodaysFocus.ts` | 0개 |
| 6 | Projects | B | 1293–1548 (256줄) + `projDetailBody` 2834–2945 | `src/lib/project/useProjectSession.ts` | **27개** |

**✅ 1순위 My Page는 `e805191`로 끝났다.** 착수 시 재확인한 결과도 클러스터 밖 비-JSX 참조 **0개**였고,
다리를 하나도 새로 만들지 않았다. 남긴 bridge 셋 — 헤더 `onClick={openMyPage}` · `JobsDialog.onResetRoles` ·
`<MyPageDialog {...myPageProps} />`. **앞의 둘은 diff에 나타나지 않았다(한 글자도 안 바뀜).**
`openMyPage`만 spread에서 빼서 다이얼로그로 흘러가지 않게 했다.
⚠️ 훅 호출은 `open` 때문에 `useDialogRegistry` **아래**다 — 위로 올리지 마라(5절 규칙과 방향이 반대다).

**✅ 2순위 Idea Build도 `50cdf8e`로 끝났다.** 착수 시 재확인한 결과도 클러스터 밖 비-JSX 참조 **0개**
(유일한 히트는 `runIdea as runIdeaAction` import 별칭이었다). JSX 3덩어리는 **Dashboard에 남겼다** —
훅이 `.ts`라 JSX를 담지 않고, 그 셋이 쓰는 값 11개를 훅이 반환한다. `setConfirmDialog` 하나만
인자로 받는다(runIdea의 "프로젝트를 먼저 고르라" 알림).
⚠️ 훅 호출을 그 자리에서 옮기지 마라 — 옮긴 useState 16개와 effect 1개가 전부 그 구간에 있어서
지금 자리에서 부르면 훅 호출 순서가 추출 전과 완전히 같다.

**🔴 다음 후보는 ③ Briefing 피드다** — 다만 등급이 **B**이고 남는 다리가 셋이다
(`useDialogRegistry.onOpen`의 `setNewsHistoryDate`·`setJobTab`·`setExpandedJobUrl`),
게다가 `renderJobCard`가 **선택→메모 저장 클러스터(C 등급)**를 가로지른다. A 등급 둘과 달리
경계를 먼저 재판정해야 한다. **자동 착수 금지 — 사용자 승인을 받아라.**

### 등급별 판정 요지

- **A (5)**: My Page · Idea Build · Mindset · Today's Focus · Theme.
  Theme은 34줄뿐이라 후보에서 뺐다(분리 이득 < 소음).
  Focus는 `openFocusMemo`가 memo를 여는 한 줄만 콜백으로 주입하면 된다.
  Idea는 `saveProjectIdea` 서버액션만 쓰고 **Project state는 건드리지 않는다** — 그래서 A다.
- **B (3)**: Briefing 피드 · Jobs · Projects.
  Briefing/Jobs가 남기는 다리는 `useDialogRegistry.onOpen`이 부르는
  `setNewsHistoryDate` · `setJobTab` · `setExpandedJobUrl` 3개, 그리고 `renderJobCard`가 쓰는
  선택→메모 클러스터(`selectableHandlers` · `openFullJobPicker`)다. 그 래퍼는 Dashboard에 남긴다.
  Projects는 이득이 가장 크지만 **밖에서 참조되는 심볼이 27개**다 — 대부분 `projDetailBody`(같이 이동)
  이지만 `readProjContent`/`setProjContent`/`setProjEditorKey`(1585·1592·1593)는 **bodyEditor 다리**로,
  5절 DO NOT TOUCH에 이미 적혀 있다. **1순위로 하지 마라.**
- **C (8) — 지금 분리하면 나빠진다. 후보에 넣지 않는다.**
  선택→메모 저장(1885–2194, fn 16 · 에디터 ref 4개를 가로지른다 → ref injection 필요, 금지 항목) ·
  bodyEditor 다리(1549–1631, DO NOT TOUCH) · Key Notes(`patchMemoInLists`·`handleTogglePin`이
  메모 목록·포스트잇 헤더에 물려 있다) · 포스트잇 오케스트레이션(854–1100, Memo 3단계 영역) ·
  모바일 시트/에디터 ref(`activeMemoEditorRef`, DO NOT TOUCH) · dialog 레지스트리(469–661, 남은
  effect 4개는 페이지↔모달 전환 다리라 Dashboard 소유가 맞다) · `confirmDialog` · `pendingInsert`.
  **`patchMemoInLists`는 경계가 더 좋아지지 않으므로 Dashboard bridge로 그대로 인정한다.**

## 4-2. Briefing 피드 Preflight Audit (2026-09-09, 조사만 · 코드 변경 0)

**범위 재측정(HEAD `50cdf8e` 기준)**: `Dashboard.tsx` **154–307 (154줄)** ·
state **9** · ref **0** · effect **5** · useMemo **0** · function **5** · 파생값 **10**.

### 외부 참조는 정확히 3개 — 전부 `useDialogRegistry.onOpen` 안이다 (417·418줄)

| 심볼 | 어디서 | 무엇 |
|---|---|---|
| `setNewsHistoryDate` | `onOpen` `key === "news"` | 뉴스 다이얼로그를 열 때 히스토리 날짜를 오늘로 되돌린다 |
| `setJobTab` | `onOpen` `key === "jobs"` | 탭을 `recommended`로 |
| `setExpandedJobUrl` | `onOpen` `key === "jobs"` | 펼친 상세를 접는다 |

🔴 `briefing`·`jobs`가 밖에서 참조되는 것처럼 보이는 10곳은 **전부 가짜다** —
import(7·9·44·50·55·83) · `DashboardProps` 필드명(96·97) · 구조분해 별칭
(`briefing: initialBriefing`, 116) · **`dialogs` 맵의 키**(`jobs: jobsRef`, 327).
grep 결과를 그대로 세지 마라.

### Memo 교차 의존 — 접점은 `renderJobCard` **하나**뿐이다

선택→메모 저장 클러스터(1651–2050, C 등급)는 Briefing 클러스터 **밖**에 있고
`openBigEditor`·`setPendingInsert`·`setFormBody`·`editingMemoId`·`refreshAfterMemoChange`를
직접 부른다. Briefing 쪽에서 그리로 넘어가는 유일한 경로는 `renderJobCard`(294–306)가
`JobCard`에 넘기는 **`selectableHandlers` · `openFullJobPicker` 둘**이다.
News·Trend는 그 둘을 **Dashboard의 다이얼로그 JSX에서 직접** 넘기므로 클러스터를 지나지 않는다.

✅ **`renderJobCard`는 JSX를 반환하는 함수라 `.ts` 훅에 못 들어간다 — Dashboard에 남는다.**
그러면 Briefing 훅이 Memo를 알 필요가 **0이 된다**(Idea Build의 JSX 3덩어리와 같은 경계).
**Briefing 훅 → Memo 훅 직접 참조는 만들지 마라.**

### 구조 비교

| | A: 한 훅 `useBriefingFeeds` | **B: News+Trend / Jobs 두 훅** | C: 유지 |
|---|---|---|---|
| 외부 dependency | 7 | 4 + 4 | 0 |
| 반환 키 | ~27 | ~15 + ~12 | 0 |
| Dashboard bridge | `renderJobCard` · onOpen 3 · 다이얼로그 3 조립 · `onResetRoles` | 좌동(onOpen이 news 1 / jobs 2로 갈림) | — |
| cross-feature | 0 (renderJobCard가 남으므로) | 0 | 0 |
| 순환 | 없음 | 없음 | — |
| 회귀 위험 | 중 — 반환 키 27이 지금까지 최대, effect 5가 한 파일 | 낮음 — 각 훅이 payload 하나만 소유 | 0 |

🔴 **News와 Trend는 가를 수 없다** — `briefing` **한 payload**가 둘을 같이 먹인다
(`selectedNews` → News, `trendBrief` → Trend, 거기서 `toolUpdates`·`skillSignals`·
`hasSkillSection`이 파생). 가르면 fetch가 두 벌이 되거나 한쪽이 다른 쪽 state를 받아야 한다.
🔴 **Jobs는 완전히 독립이다** — 자기 payload · effect 2 · 액션 2 · state 3이고
`briefing`을 **코드에서 한 번도 참조하지 않는다**(주석에만 나온다).

### 판정: **SAFE WITH BOUNDARY** · 추천 구조 **B**

진짜 cross-feature 의존은 `renderJobCard` 하나인데 그건 JSX 함수라 어차피 Dashboard 몫이다.
남길 다리는 **명시적이고 작다**(onOpen 3줄 + JSX 조립). A가 아니라 B인 이유는
**소유 단위가 서버 payload 하나**여서다 — `briefing`과 `jobs`는 서로 참조가 0인 별개
payload라, 한 훅에 넣으면 "Briefing 피드"가 무관한 둘을 묶는 라벨일 뿐이다.
파일이 하나 느는 대신 반환 키 총합은 같고 각 훅이 훨씬 읽기 쉬워진다.

- `src/lib/dashboard/useNewsTrendFeed.ts` — `briefing` · `newsHistoryDate` · `trendHistoryDate` ·
  `briefingRetrying` · 파생 7 · effect 2 · `handleRetryBriefing` · `historyDateLabel`
- `src/lib/dashboard/useJobsFeed.ts` — `jobs` · `jobTab` · `expandedJobUrl` · `jobsRecent` ·
  `jobsRetrying` · 파생 3 · effect 3 · `handleRetryJobs` · `selectJobTab`

⚠️ **착수 전 반드시 확인할 것 하나** — `todayIso`(309줄)가 **클러스터보다 아래**에 선언돼 있는데
클러스터가 3곳에서 쓴다. 지금은 두 곳이 async catch 콜백이고 하나가 hoisting되는 함수라
살아 있을 뿐이다. 훅 호출을 154줄 자리에 두려면 **`todayIso` 한 줄을 클러스터 위로 올려라**
(순수 계산이라 훅 순서에 영향이 없다). 훅 호출을 309줄 아래로 내리면 `useRouter`(308)와
순서가 바뀐다 — 동작은 같지만 굳이 바꿀 이유가 없다.
⚠️ 156·159줄의 `eslint-disable react-hooks/set-state-in-effect` 두 줄은 그 effect와 **같이** 옮겨라.

## 4-3. 그 밖의 대기 항목

1. **진단 계측 제거** (OPEN 3) — 실기기 게이트가 닫혔으니 바로 가능.
2. **`buildMemoInput()` 추출** — 별건 커밋. 저장 payload 11개 필드가 `handlePostitBack` ·
   `handleSaveMemo` · `handleMemoDialogBack` **세 곳에 글자 그대로 복제**돼 있다.
   두 단계 모두 "동작 변경 0"이 목적이라 일부러 안 건드렸다.
3. **`min-height: 46dvh` 정리** (OPEN 4).
4. **OPEN 5 원인 규명**(옛 "OPEN 6") — 고치기 전에 "지뢰표가 낡았나 / 처방이 되돌려졌나"부터 가려라.
   ⚠️ 코드 주석·과거 지시문에 남은 **"OPEN 6"은 이 항목을 가리킨다** — Memo 실기기 항목이
   닫히면서 번호가 하나 당겨졌다.

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
