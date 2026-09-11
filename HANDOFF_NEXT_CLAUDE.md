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

- 🔴 **운영정책 변경(2026-09-10, 사용자 명시 지시): Claude는 Notion을 절대 수정하지 않는다.**
  옛 "Notion 상태 동기화 완료 게이트"는 폐기됐고 `AGENTS.md`가 그 자리에 금지 규칙을 갖는다.
  Notion MCP는 **read-only 조회만** 허용 · 최신화는 사용자/ChatGPT 담당 · **Notion을 안 고쳤다는
  이유로 작업을 미완료로 처리하지 않는다.** Claude가 갱신할 문서는 repo canonical 셋뿐이다.
- **기준 HEAD**: master. 마지막 기능 = **`a9ca6ed`**(④ 포스트잇 보기 표현 → `postit-view.tsx`).
  그 앞 = `cfdb058`(⑦) / `bb9e891`(⑤) / `458c8e1`(⑥) / `be27f8c`(lint 검증 복구) / `134af03`(①) /
  `eac2abf`(②) / `3e1c996`(⑪) / `8ac4a47`(⑩) / `74b07e7`(⑧) / `5012001`(⑨) / `f137cc9`(③).
  🔴 **후보 표(4-1-2)는 ④로 전 행 종료.** 그 뒤 얇은 shell 조건 5개를 재실측했고(4-1-2절),
  **`f8be97c`로 조건 2·3을 달성했다** — Dashboard의 feature 전용 `useState` **0** · feature 전용 effect **0**.
  남은 것은 조건 1(feature raw markup **19줄**)·4(raw server action **6종 8곳**)·5(PARTIAL)다.
  **다음 1건은 4-1-3의 `projTemplatePromptNode`**다.
  🔴 **마지막 기능 `f8be97c` · maintenance `b84e131` · UI `c9bacd6`(모바일 한 줄 요약 폭).**
  ✅ **사용자 실기기 확인(`68a0808`)**: 한줄요약 **폭 확대는 PASS** · Monthly MEMO·Key Notes·포스트잇 등
  기존 범위 **회귀 없음**. 🔴 **iOS 입력 UX 2건 신고** → `45c0c3a`로 A만 고쳤다:
  **A(자동확대)** = input computed font-size **13px**(<16px)라 iOS가 포커스 시 확대하고 blur 뒤에도 유지.
  같은 셀렉터에 13/12/13px 세 선언이 있어 **셋 다 16px로** 올렸다(하나만 고치면 나머지가 이긴다).
  viewport meta·`user-scalable=no` 같은 전역 zoom 차단은 **쓰지 않았다**(접근성 · 원인은 input style).
  🔴 **B(캐럿이 원하는 자리에 안 놓임/전체선택)는 로컬에 독립 원인이 없다** — `.select()`·
  `setSelectionRange`·`focus()`·`user-select:all` **0건**이고 포커스 시 전체선택도 안 일어난다(실측).
  **A의 종속 증상이라는 가설**이지만 데스크톱은 자동확대를 재현 못 해 **증명하지 못했다 — 실기기 판정 대기.**
  🔴 이 줄 위에 **docs 전용 커밋이 하나 더 있을 수 있다** — 커밋 해시는 커밋된 뒤에야 정해져서
  기능 커밋 안에서 자기 해시를 적을 수 없다(amend로 쪻으면 해시가 또 바뀜다). 
  **이 파일이 가리키는 것은 항상 마지막 기능 커밋이다.** `git log --oneline -5`로 대조해라.
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
  🔴 **미푸시 누적 주의** — 예전에 6개 커밋이 미푸시로 쌓여 배포본이 뒤지지는 사고가 있었다.
  **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** — 내 수정이
  사용자 화면에 아예 없을 수 있다(`CLAUDE.md` 7절 0번이 같은 얘기를 한다).
- **🎉 Memo 정렬 작업은 코드 쪽이 끝났다**(2026-09-10). 🔴 **정본은 `src/lib/memo/ordering.ts`이고
  `ordering.check.ts`가 계약 18가지를 지킨다 — 정렬을 건드리기 전에 거기부터 읽어라**(전문은 5절).
  🔴 **교훈 셋:** ① 낙관적 갱신은 서버의 "빈 값 = 그대로 둔다" 계약을 같이 지켜야 한다.
  ② **기본값과 강제 정렬을 구분해라**(`52b42b2`가 수동 `pin_order` 11건을 화면에서 덮었다 → `2584097` 되돌림).
  ③ **상태 전이는 한 함수가 아니라 계약이다** — 공유 쓰기 지점 `updateMemo`에서 정규화한다.
- ✅ **`memo_day_order` 마이그레이션·저장·날짜 독립성 실데이터 확인 종료**(2026-09-10, `650f5e5`·`8ec059a`).
  처방은 **날짜 키 캐시 + 보이는 달 preload**. 🔴 순서가 **없는** 날짜도 빈 맵으로 넣어야 게이트가 안 걸린다.
- **Monthly 순서 저장은 원자적이다** — `reorderMemosForDay`가 단일 `upsert(rows)`(INSERT … ON
  CONFLICT 한 문장, 요청 1회)라 부분 쓰기가 없다. 🔴 **여기를 개별 update 루프로 바꾸지 마라.**
  🟡 대조: Key Notes `reorderPinnedMemos`는 `Promise.all`로 **N개 개별 UPDATE**라 부분 쓰기가
  가능하다(호출부도 `void`라 롤백이 없다). 이번 범위 밖이라 그대로 뒀다 — 남은 위험으로 안다.
- **실측(2026-09-11, `f8be97c` 이후 = 현재 HEAD)**: `Dashboard.tsx` **2,198줄**.
  경로: 2,609 → ③ **2,533** → ⑨ **2,527** → ⑧ **2,504** → ⑩ **2,482** → ⑪ **2,465** → ② **2,379** → ① **2,281** → (lint 수정 +5) **2,286** → ⑥ **2,264** → ⑤ **2,247** → ⑦ **2,243** → ④ **2,208** → `mobileProjectSummaryOpen` **2,198**(−10).
  🔴 **빈줄을 57로 적었던 것은 계측 버그였다** — `split(/\r?\n/)`가 파일 끝 개행 때문에 빈 원소를
  하나 더 만들어 총합이 2,610으로 나왔다. 지금은 그 원소를 버려서 `wc -l`과 일치한다.
  `dashboard.css` 11,080줄.
  🔴 **훅 11개의 줄 수 목록은 걷어냈다**(2026-09-11). 후보를 하나 옮길 때마다 두세 개가 바뀌는데
  CURRENT에 그 표를 두면 매 세션 stale 충돌이 난다 — 필요하면 `wc -l src/lib/**/use*.ts`로 그때 재라.
  여기 남기는 현재값은 **Dashboard 줄 수와 이번에 건드린 파일**뿐이다(이번 ④: 훅 변경 0 ·
  `components/dashboard/postit-view.tsx` **신규 122줄**).
  🔴 옛 "2,578/2,582줄"은 Fast Track 직후 값이고 그 뒤 `650f5e5`·`8ec059a`가 주석 +132줄을 얹었다 —
  **줄 수를 인용하지 말고 매번 다시 재라.** 주석 195블록 중 **사고이력형 47블록 490줄**(주석의 52.8%)이고
  대부분 KEEP 영역(포스트잇 진입 경로 · 스크롤 잠금 · 배경복사)에 붙어 있어 코드와 함께 남는다.
- **끝난 작업**: Memo 소유권 1·2단계 · **훅 후보 6개**(My Page `e805191` · Idea `50cdf8e` · Briefing `3f999da` ·
  MindSet `76e7b8e` · Focus `a59f602` · Projects `f8a69cf`) · **Fast Track JSX 4단계**(`a1d4ad8`·`615cdf4`·
  `e479bb9`·`1458df9`, 3,347 → 2,578줄) · **재-Audit 후보 11개 전부**(4-1-2절).
  🔴 **"밖 참조 N개"를 셀 때는 JSX와 비-JSX를 갈라서 세라** — Projects는 27이 아니라 실제 3이었고,
  선택→메모의 "ref injection 필요"(C 판정)는 **오분류**였다(비-JSX 참조 0). 합쳐 세면 멀쩡한 후보가 불가능해 보인다.
  🔴 ⑰ Monthly MEMO "분리 불가" 판단도 `1458df9`로 뒤집혔다 — **로직을 함께 옮기지 않고 JSX 조립만 떼면
  prop 수가 많아도 배선이 1:1로 유지된다**(SAME 62 / DIFFERENT 0).
- 🟡 **2026-09-11 사용자 수동 확인**: ④(`a9ca6ed`) 이후 **데스크톱 웹 기본 기능 이상 없음.**
  🔴 **모바일 실기기·설치형 PWA는 아직 미검증이다** — 미푸시 24개라 배포본에 이 변경들이 **아예 없다.**
  `f8be97c`(Project 한 줄 요약 팝업)도 로컬 모바일 뷰포트까지만 봤다. **push 여부는 사용자가 정한다.**
- ✅ **실기기 검증 종료분**(사용자 확인): Memo 소유권 1·2단계 · My Page · Idea Build · 마이페이지 닉네임 ·
  `76e7b8e`·`b8668aa`·`8ec059a`·`7acbfb4`·`2f1517a`·`3d12089`. 🟡 **미확인으로 남은 것은 6절에 모아 뒀다**
  (재-Audit 후보 11개 전부 실기기 미확인이다 — 로컬 뷰포트까지만 봤다).
  🔴 **교훈: "탁하다"·"안 보인다"는 값이 아니라 표면 비교로 풀린다** — Key Notes와 웹 Create를 나란히
  재보니 **색 레이어 문자열이 완전히 동일**했고 다른 것은 유리 표현(inset)과 라벨 토큰뿐이었다.
  색값을 하나도 안 바꾸고 끝났다(`3d12089`).
- 🔴🔴 **Dashboard 모듈화 Roadmap은 "끝났다"고 읽지 마라**(2026-09-10 사용자 정정). 후보 표는 비었지만
  목표는 줄 수가 아니라 **얇은 orchestration shell**이다 — 화면 조립 · 페이지 전환/모달 조정 · 기능 간
  bridge · 공통 coordination만 남기고 feature 구현은 전부 밖으로. **판정은 4-1-2절 완료 조건 5개**로 한다.
- **blocker**: 없음.

누적: `Dashboard.tsx` 4,309(Memo 착수) → … → 3,347(Projects) → 2,578(Monthly 다이얼로그)
→ 2,609(주석 +) → **2,208줄**(④ 포스트잇 보기).
**Memo 착수 시점 대비 −2,101줄(−48.8%).** 🔴 줄 수는 성과 지표가 아니다 — 위 Roadmap 항목을 읽어라.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `45c0c3a` | **모바일 한 줄 요약 input을 16px로 — iOS 포커스 자동확대 제거(BUG A).** 카스케이드 승자는 `dashboard.css:5369`의 `font-size: 13px !important`였고 같은 셀렉터에 `4088:13px`·`5103:12px !important`가 더 있어 **셋 다 16px로** 올렸다(하나만 고치면 나머지가 이겨 다시 확대된다 — 이유를 규칙 옆 주석에 남겼다). 🔴 전역 zoom 차단(viewport meta·`user-scalable=no`) **미사용**. ⚠️ **BUG B는 고치지 않았다** — 코드에 selection을 건드리는 곳이 0건이고(로컬 실측: 포커스 시 전체선택 없음 · 중간 caret 유지 · 삽입/삭제 정확 · remount 0) A의 종속 증상이라는 **가설만** 있다(데스크톱은 자동확대 재현 불가 → 실기기 판정 필요). 폭 계약 유지: 320 292/248 · 375 347/303 · 430 402/358, 정렬 일치, overflow 0, maxLength 30, 31자 차단, 잘림 없음. **Desktop 0**(1280 실측: 모바일 팝오버 DOM에 없음 · `#proj-summary`는 바뀐 셀렉터에 `matches:false`). 회귀 8단계 정상 · 리스너 **3/3 balanced** · **DB write 0** · eslint e26 w8 NEW 0/GONE 0 · tsc 0 · check 0 |
| `c9bacd6` | **모바일 Project "한 줄 요약" 입력칸 폭 개선(UI 1건, CSS 선언 1개).** 승자는 `.proj-detail-editing .mobile-project-summary-popover { width: min(252px, 100%) }`(0,2,0 · 파일 뒤쪽)였고 `min()`의 252px가 항상 이겨 **뷰포트와 무관하게 252px 고정**이었다 → `width: 100%`로 교체. 🔴 폭 기준은 `.dialog-body-scroll`(본문 단) — 그 위 조상 둘이 `display: contents`라 건너뛴다. 실측 팝오버/입력칸 **320: 252→292 / 208→248 · 375: 252→347 / 208→303 · 430: 252→402 / 208→358**, 세 폭 모두 제목 입력·상태행과 **l/r 정렬 일치**(전엔 요약칸만 오른쪽 109px을 비웠다), 가로 overflow 0. 30자 계약 유지(320px에서 31자째 차단·caret 정상·입력칸 내부 스크롤 정상). 기존 열기/내부유지/바깥닫힘/재열기/재진입 전부 정상. **Desktop 영향 0**(media ≤720px이고 데스크톱은 이 팝오버를 렌더조차 안 한다 — 별개 `#proj-summary` 278.9px 전후 동일). eslint **e26 w8 · NEW 0 / GONE 0** · tsc 0 · check 0 · **DB write 0** |
| `b84e131` | **`useProjectWorkspace`의 컴파일러 bailout 원인 하나 제거 — 함수 선언 순서만**(maintenance). `openNewProject`(위)가 `openProjectShell`(아래)을 불러 `[PruneHoistedContexts]` Todo가 났고 **훅 전체 분석이 조용히 꺼져 있었다**(`be27f8c`와 같은 부류). 둘 다 함수 선언이라 **런타임 동일**, 로직·API·deps·return 변경 0. 🔴 **양성 대조로 복구 증명**: 훅 본문에 렌더 중 ref 읽기를 임시 주입했을 때 `react-hooks/refs` **0건 → 1건 검출**(프로브 제거 확인). 🔴🔴 **그래도 todo는 0이 안 됐다** — 가려져 있던 두 번째 원인 `try/finally`(컴파일러 미지원)가 드러났고 **canonical 42개 중 9개 파일이 같은 상태**다(위 OPEN). bailout이 **함수 단위**라 남은 건 `handleSaveProject` 하나뿐이다. eslint **e26 w8 · NEW 0 / GONE 0**(분석이 살아났는데도 숨은 진단 0건 = 훅 본문이 실제로 깨끗했다) · tsc 0 · check 0 · `git diff --check` clean. 런타임 `f8be97c` 재검증: 열기/내부 유지/바깥 닫힘/재열기/토글/재진입 전부 정상 · 리스너 **2/2 → 3/3 balanced** · 콘솔 0 · **DB write 0**. useProjectWorkspace 349 → 354(주석 +5) |
| `f8be97c` | **`mobileProjectSummaryOpen` ownership → `useProjectWorkspace`(thin-shell 조건 2·3 달성).** state 1 + 바깥클릭 effect 1을 옮겼고 **effect 본문은 바이트 동일**(이벤트 계약 `document`·`pointerdown`·capture `true`·closest 조기반환·cleanup 전부 보존). 🔴 **감사 장부 정정: 사용처는 "4개"가 아니었다** — 소문자만 세서 그랬고, `setMobileProjectSummaryOpen`까지 세면 Dashboard 6 · 훅 5 · dialog 7이다. 그리고 **훅이 이미 setter를 주입받아 3곳(openNew/openExisting/detailBack)에서 리셋에 쓰고 있었다** — 그래서 이번 이동은 owner 이전 + **주입 인자 −1**이다. 새 Context/registry/ref/reducer 0, 초기값 `false` 동일, 배선 1:1(훅 반환 → `ProjectDetailShell` prop). 검증(로컬 375×684, **stash로 HEAD와 같은 시나리오 전/후 대조**): 7개 측정점(진입·열기·**내부 press 유지**·**바깥 press 닫힘**·재열기·토글 닫기)이 `aria-expanded`까지 **완전 동일**. 🔴 양성대조 먼저 — `closeSummaryOnOutsidePress`가 이제 `src_lib_*.js`에만 있고 Dashboard 청크엔 **없다**. **cleanup 무결**: pointerdown-capture add/remove 계수 3회 개폐 **3/3**, 프로젝트 닫고 재진입 후 **4/4 balanced**(누수 0). 재진입 시 닫힌 상태로 시작(훅 리셋 동작). 콘솔 0 · **DB write 0**(fetch 래퍼로 server action 전수 관측 0건; 제목 빈 새 프로젝트라 autosave의 `!title.trim()` 가드가 먼저 막는다). eslint **e26 w8 · NEW 0 / GONE 0** · Dashboard `react-hooks/todo` 0 · tsc 0 · check 0. ⚠️ 당시 훅 파일이 컴파일러 bailout 상태라 옮긴 effect를 lint가 검사 못 했고 런타임으로만 검증했다 — **`b84e131`에서 그 원인이 제거돼 지금은 검사된다.** **2,208 → 2,198줄(−10)**, useProjectWorkspace 334 → 349(+15) |
| `cfdb058` | **편집 페이지 wrapper → `memo-edit-form.tsx`의 `MemoEditPageShell`(재-Audit 후보 ⑦).** 🔴 **장부 정정: "wrapper 3종" 중 하나는 이미 끝나 있었다** — `bigEditorPageNode`는 ⑤에서 `BigEditorPageShell`로 갔다. 이번 실제 대상은 **2종**(`mobileEditPageNode` 14줄 + `composePageNode` 12줄 = candidate **26줄**, Audit 42와 −16). 🔴 **두 원본이 ref·close·form을 뺀 구조가 완전히 동일**함을 실측했고(정규화 비교 True) 옆 주석도 "먼슬리 Create = 일반메모 편집과 같은 노드"라고 적어 둔 그대로라, **shell 하나를 둘이 공유**하게 했다 — 같은 마크업 두 벌이 사라진 것이 이번의 실제 이득이다(줄 수는 −4뿐). Props **4**(formColor · theme · onClose · children) · **ref/editor handle 0**(shell 본문에 ref 문자 0). 🔴 **`memoHeadActions(ref)`·`memoEditForm(ref, ...)`·`autosaveStatusCorner` 호출은 전부 Dashboard에 남겨 children으로 넘긴다**(⑤ big-editor와 같은 규약). state/effect 0 · Context/registry 0 · CSS/className/DOM 0. 🔴 **중간에 실패한 시도를 기록한다**: 처음엔 `headActions`/`autosaveStatusCorner`를 **prop**으로 넘겼는데 그것만으로 `react-hooks/refs` **NEW 2건**이 생겼다(ref를 받는 함수 호출이 prop 위치로 가면 컴파일러가 다르게 본다). **children 위치로 되돌리니 NEW 0**이 됐다 — 앞으로 ref를 쓰는 node를 넘길 때는 **prop이 아니라 children**으로 줘라. 검증: 두 경로 다 marker로 확인(각 1개) · 마운트/조건식 `grep` 전후 **완전 동일** · 진입/닫기/재진입 해시 동일 · DOM이 **compose 3,832자/해시 3578971744 · detail 4,180자/해시 3092686754로 전후 문자 단위 동일**(①·lint 세션의 독립 기록과도 정확히 일치) · editor 1 · 추가 remount 0 · `react-hooks/todo` **0** · **DB write 0**(텍스트 selector 미사용). **2,247 → 2,243줄(−4)**, memo-edit-form 330 → 356(+26) |

🔴 **`f137cc9` 장부 재확인(2026-09-11)**: `git show --numstat`이 Dashboard **+15/−91 = 순 −76**이고 `wc -l` 2,533(=2,609−76)로 검산 일치 — **장부가 맞다.** 세션 종료 UI의 `+15/−20`은 커밋 내용이 아니다(추가분 15만 일치). **이 건으로 다시 전체 Audit 하지 마라.**

경위·수치는 git 로그에 있다. 여기 옮겨 적지 마라. (2026-09-11 ④ 세션에 운영규칙 6에 맞춰
`f137cc9`·`5012001`·`74b07e7`·`8ac4a47`·`3e1c996` 5행을 걷었다 — ③⑨⑧⑩⑪ 전부 종료됐고 수치는 그 커밋 메시지에 있다.)
(2026-09-11에 `650f5e5`·`3e6fd43`·`3d12089`·`8ec059a`·`7acbfb4`·`2f1517a` 행을 걷었다 —
둘 다 종료됐고 그 계약은 5절과 `ordering.check.ts`가 지킨다.)
(2026-09-10에 운영 규칙 6·8에 맞춰 오래된 22행을 걷었다: `a1d4ad8` · `f8a69cf` · `a59f602` · `76e7b8e` · `b8668aa` · `3f999da` · (검증) · `454a362` · (조사) · `50cdf8e` · `e805191` · `8fe11c0` · `f2962aa` · (조사) · (조사) · (문서) · `00f7756` · `7973e3e` · **`52b42b2`**(`2584097`이 되돌린 건이라 그 행에 경위가 남아 있다) · **`1458df9`·`e479bb9`**(경계 설명은 4-1·4-2-1절) · **`2584097`·`ba78b0c`**(계약은 5절과 Monthly MEMO Feature에 있다). 전부 종료된 건이고 `git log`에 있다. Projects·Briefing 등의 **살아 있는 경계 설명은 4-2·4-2-1절에 그대로 있다** — 거기서 읽어라. 새 행을 넣을 때 오래된 행을 같이 걷어라.)

# 3. OPEN

아직 해결되지 않은 것만. 해결되면 **행을 지우고, 그 식별자는 다시 쓰지 않는다.**

> 🔴 **식별자는 안정적이다 — 재번호·재사용 금지.** 코드 주석·commit·`docs/incidents.md`가
> 같은 이름을 참조한다. 항목이 닫혀도 남은 것들의 이름을 당기지 마라.
> (2026-09-09에 숫자 번호를 이 방식으로 바꿨다. 예전 코드 주석의 **"OPEN 6"은
> 아래 `OPEN-MEMO-KB-MINHEIGHT`**, "OPEN 3"은 `OPEN-VIEWPORT-DEBUG`를 가리킨다.)

- **`OPEN-COMPILER-BAILOUT-TRY-FINALLY`** 🔴 **`try/finally`를 쓰는 함수는 React Compiler가 분석을 포기한다 —
  canonical 42개 중 9개 파일이 그 상태다**(2026-09-11 실측): `widgets.tsx` · `useIdeaBuild` · `useJobsFeed` ·
  `useMyPageSession` · `useNewsTrendFeed` · `useProjectWorkspace` · `useTodaysFocus` · `useMemoEditSession` ·
  `useMemoListData`. 메시지 두 종류 중 *"with a finalizer ('finally') clause"*가 있다는 건 **`catch`를 붙여도
  안 풀린다**는 뜻이다 — `catch (e) { throw e }` 우회는 답이 아니고 `finally` 자체가 미지원이다.
  🔴 **bailout은 파일이 아니라 함수 단위라** 그 함수 하나만 빠지고 나머지는 검사된다 — **급하지 않다.**
  ✅ **배포 blocker가 아니다** — 별도 maintenance backlog이고, 이걸 이유로 push를 막지 않는다(2026-09-11 사용자 판단).
  고치려면 9개 파일의 에러 처리 구조를 바꿔야 하니 **별도 리팩토링 세션으로 잡아라.**
  ⚠️ **canonical `e26 w8`은 그 9개 함수를 과소보고한다** — "이 범위가 깨끗하다"로 읽지 마라.
  진단: `npx eslint --rule '{"react-hooks/todo":2}' --format json <경로>`(config 건드리지 말 것).
  ✅ `OPEN-PROJWORKSPACE-COMPILER-BAILOUT`은 **`b84e131`로 닫혔다**(hoisted forward reference라 선언 순서만 교체 ·
  양성 대조로 `refs` **0건 → 1건 검출** 확인). 🔴 **컴파일러는 먼저 만난 bailout 하나만 보고한다 — 하나 고치면 반드시 다시 재라.**
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

**🔴 Dashboard 모듈화 Roadmap은 진행 중이다**(1절 참고). 다음 라운드는 **4-1-2절 재-Audit 표**에서
후보를 **한 번에 하나씩** 골라 진행한다. 사용자 승인 없이 여러 개를 묶어 하지 마라.

## 4-1. Dashboard ownership 분리 — 후보 현황

책임 16개를 A/B/C로 분류했다(**A 5 · B 3 · C 8**). 판정 근거는 줄 수가 아니라
**"그 클러스터 밖(비-JSX)에서 참조되는 심볼 수"** 실측이다. 그 수치는 착수할 때 다시 재라.

| # | 책임 | 등급 | 상태 |
|---|---|---|---|
| 1 | My Page / 계정 | A | ✅ `e805191` |
| 2 | Idea Build | A | ✅ `50cdf8e` |
| 3 | Briefing 피드(News·Trend·Jobs) | B | ✅ `3f999da` — 훅 2개로 분리 |
| 4 | MindSet 바 | A | ✅ `76e7b8e` (실측 42줄) |
| 5 | Today's Focus | A | ✅ `a59f602` (훅 40줄. `openFocusMemo`는 **콜백 주입이 아니라 Dashboard 유지**) |
| **6** | **Projects** | B | ✅ `f8a69cf` — 재측정 결과 **비-JSX 밖 참조 3개**(옛 "27"은 JSX 포함 값) |
| 7 | 카드 7개 + 헤더 (JSX) | A | ✅ `615cdf4` — Component만, 소유권 이동 0 |
| 8 | 선택→메모 저장 | A | ✅ `e479bb9` — 옛 C 판정이 **오분류**였다(비-JSX 참조 0) |
| 9 | Monthly MEMO 다이얼로그 (JSX) | B | ✅ `1458df9` — Component만, props 62 명시(SAME 62 · DIFF 0) |

**🎉 훅 후보 6개 + JSX 축 4단계 완료.** 🔴 여기 적혀 있던 *"새 후보는 없다"*는 **틀렸다** —
2026-09-10 재-Audit에서 KEEP 밖 feature 구현이 **11덩어리 671줄** 더 나왔다(4-1-2절).
**2026-09-11에 그 11덩어리를 전부 뺐다(③⑨⑧②①⑥⑤⑦⑩⑪④) — 후보 표에 남은 행이 없다.**
🔴 그렇다고 "모듈화 종료"로 읽지 마라 — 판정은 줄 수가 아니라 아래 **얇은 shell 완료 조건 5개**다.
C 등급 8개(아래 문단)는 여전히 후보가 아니다 — 줄 수를 줄이려고 그것들을 억지로 손대지 마라.

**옛 C 등급 8개 중 지금도 후보가 아닌 것**(억지로 넣지 마라): bodyEditor 다리 ·
포스트잇 오케스트레이션 · 모바일 시트/`activeMemoEditorRef` · dialog 레지스트리 ·
`confirmDialog` · `pendingInsert` · Key Notes(가능하지만 −20줄이라 이득 없음).
**`patchMemoInLists`는 경계가 더 좋아지지 않으므로 Dashboard bridge로 그대로 인정한다.**
근거 수치는 4-1-1절 표에 있다.

🔴 **선택→메모와 `pendingInsert`는 별개 클러스터다 — 다시 합치지 마라.** ref 4개를 고르는 것은
`activeMemoEditorRef`+`insertPendingAtCursor`뿐이고 선택 쪽은 `setPendingInsert` 하나만 부른다
(둘을 묶어 세서 "ref injection 필요"라는 오판이 나왔고 `e479bb9`가 뒤집었다). 그 경계가 이 훅의 성립 근거다.

### 추출에서 확립된 경계 (다음 후보에도 그대로 적용해라)

- **훅(`.ts`)은 JSX를 담지 않는다** — JSX 덩어리가 쓰는 값을 훅이 반환하는 쪽으로 푼다.
  🔴 **이걸 "JSX는 영원히 Dashboard 것"으로 읽지 마라.** JSX가 갈 곳은 훅이 아니라
  **Component(`components/dashboard/*.tsx`)**이고, Fast Track 4단계가 그 경로를 이미 증명했다
  (카드7+헤더 · 선택→메모 · Monthly 다이얼로그 62 props · SAME/DIFF 0). 4-1-2절 후보가 전부 이 축이다.
- **dialog에 안 가는 값은 spread에서 빼라** — rest 분해로 갈라낸다(`openMyPage`, Idea의 JSX 전용 11개).
- **훅 호출 위치로 훅 호출 순서를 보존한다.** 위치를 옮겨야 하면 그 위에서 쓰는 코드가 0인지 먼저 재라.
- **옮긴 본문은 바이트 단위로 diff해서 rename 0을 증명한다.**

## 4-1-1. 🛑 절대 분리하지 않을 KEEP 영역 (Roadmap 종료가 아니라 **이 표에 한정된** 중단선)

🔴 **제목의 "멈춘다"는 이 표의 7개 영역에만 해당한다.** Dashboard 모듈화 Roadmap 자체는 진행 중이고
남은 후보는 4-1-2절에 있다. (2026-09-10 사용자 정정 — 예전 제목이 전체 종료로 읽혔다.)
2026-09-10 재검증에서 **7개 전부 KEEP 유지**로 확인했다(판정 바뀐 것 0건).

| 영역 | 비-JSX 밖참조 | 왜 남기나 |
|---|---:|---|
| dialog registry | **74** | 모든 화면이 여기로 모인다. 조정 축 자체다 |
| post-it orchestration | 24 | 함수 11 · 4화면 상태 결합 |
| `bodyEditor` | 6 | 메모↔프로젝트 **양방향** 다리(주입 3 / 반환 3) |
| `pendingInsert` · `activeMemoEditorRef` | 3 | 에디터 ref **4개**를 고른다 = 진짜 ref injection |
| `patchMemoInLists` | 0 | 밖참조 0인데도 KEEP — `useMemoListData`와 `useMemoEditSession`을 **동시에** 만져 어느 쪽에 넣어도 순환 |
| `confirmDialog` | 5 | 3벌 마운트 · guardLogin 경로 |
| 전체화면 layout/theme/배경복사 effect 4종 | — | 실기기 10~22라운드가 걸린 자리 |

🔴 **줄 수를 목표로 이 표를 건드리지 마라.** 새 Context·ref injection·훅 순환이 전부 여기서 시작된다.

## 4-1-2. 🔎 재-Audit 결과 (2026-09-10 · AUDIT ONLY, 코드 변경 0)

**🎉 후보 11개 전 행 종료 — 남은 A/B 후보 0줄.** 2026-09-10 감사가 KEEP 밖에서 찾은 671줄
(JSX 9덩어리 + 함수 2개)을 2026-09-11에 전부 뺐다: ③71 · ⑨13 · ⑧27 · ②121 · ①153 · ⑥35 ·
⑤57(이동 27) · ④94 · ⑦26 · ⑩24 · ⑪17. **목적지와 props·검증 수치는 각 커밋 메시지에 있다** —
여기 복제하지 않는다(운영규칙 3·4).

🔴 **residual 33은 미추출 코드가 아니라 장부 오류였고 닫혔다**(④ 세션, 국소 대조). 2,533줄 스냅샷
(`f137cc9`)에서 `postitViewNode`는 **1792–1885**인데 장부가 ⑦ 범위로 적어둔 **1837–1864(28줄)가 그 안**이었다
(실제 ⑦은 1764·1781로 ④보다 앞). 나머지 ~5줄은 Audit(주석포함)과 actual의 경계 차다.
**숫자를 0으로 맞추려고 새 추출을 만들지 않았다.**

**얇은 shell 완료 조건 5개 — 2026-09-11 실측**(TS 파서 스크립트). 조건 1·4는 아래 정정본이 정본이다.
Dashboard **2,198줄 = 빈줄 55 / 주석 817 / JSX 554 / 로직 772**(`f8be97c` 이후).

| # | 조건 | 현재 | 판정 |
|---|---|---|---|
| 1 | **feature-owned raw markup = 0** (옛 "JSX < 15%"는 폐기) | **19줄 / 11덩어리** | FAIL |
| 2 | feature 전용 `useState` 0 | **0** (+경계 2) | ✅ **PASS** |
| 3 | feature 전용 effect 0 | **0** | ✅ **PASS** |
| 4 | Dashboard가 raw server action을 직접 호출 0 | **6종 · 8 call site** | FAIL |
| 5 | shell-only ownership | memo 저장 2경로가 최대 잔여 | PARTIAL |

🔴🔴 **조건 1 정정(확정)** — 옛 `JSX < 15%`는 **폐기했다.** 허용된 Component 조립 388 +
wrapper/fragment 115 + dialog 껍데기 32 만으로 이미 약 24%라, 15%는 ownership 개선이 아니라
**prop 표기 압축**으로만 도달 가능했다. 새 기준은 **feature-owned raw markup = 0**이다
(현재 19줄: `projTemplatePromptNode` 9 · autosave-status span 4 · `.proj-edit-page` 3 · blob/footer/close-btn 3).
🔴 **조건 4 정정(확정)** — "shell/orchestration 함수를 없애라"는 뜻이 **아니다.** Dashboard가
raw server action을 **직접** 부르지 않고 feature hook/service API를 통해 조정한다는 뜻이다.
그래서 `openMemoModalAt`·`openFocusMemo` 같은 화면 전환 함수는 **남아도 되고**, 그 안의 fetch만 훅으로 내린다.
- 조건 2·3 ✅ **2026-09-11 `f8be97c`로 달성** — 유일한 MOVE 후보였던 `mobileProjectSummaryOpen`
  (state+effect)을 `useProjectWorkspace`로 옮겼다. 🔴 경계 2건 `keynoteFullView`·`keynotesOpenSeq`는
  **그대로 보류**다(둘 다 `openKeyNotes()` 재진입 리셋 경로가 쓰고, 앞은 L339 닫기 가로채기도 읽는다).
  그 둘을 움직이려면 재진입 리셋 계약을 먼저 정리해야 한다.
- 조건 4 실측 8곳: `updateMemo` ×2 · `createMemo` ×1 · `toggleImportant` ×1 · `setMemoPinned` ×1 ·
  `getMemosForMonthAction` ×2 · `recordMemoSource` ×1. 🔴 **`deleteMemo`는 ⑩에서 빠져 7종이 아니라 6종이다.**
  🔴 `toggleImportant`/`setMemoPinned`는 KEEP인 `patchMemoInLists`와 한 몸이다.
5. 남는 것: 훅 호출 · Component 조립 · dialog registry · cross-feature bridge · guardLogin.

**측정 정의**: feature 마크업 = "소문자 태그 + 서브트리에 Component·`<dialog>` 없음"인 최외곽 요소(Component를 감싸는 `div`는 껍데기).

🔴 **순서 교훈**: **공용 폼을 먼저 한 벌로 만들고 그 위에 껍데기를 하나씩 떼라**(④⑤⑥⑦이 ①의
`memo-edit-form.tsx` 위에서만 성립했다). 거기에 **ref는 prop이 아니라 children으로**(⑦ 규약)가 더해져야 한다.

### 4-1-3. 다음 후보 (2026-09-11 얇은 shell 재감사 · AUDIT ONLY)

| 후보 | 종류 | 범위 | owner | 줄 | 조건 개선 | 위험 | 난이도 | 추천 |
|---|---|---|---|---:|---|---|---|---|
| ~~A `mobileProjectSummaryOpen`~~ | state+effect | — | `useProjectWorkspace` | ~12 | 2·3을 0으로 | 없음 | Low | **✅ `f8be97c`** |
| **D `projTemplatePromptNode`** | JSX | L1001–1011 | `project-detail-dialog.tsx` | ~11 | **1의 마크업 19 → 10** | node prop 공유 유지 | Low | **NOW** |
| B `buildMemoInput()` payload | 중복 제거 | Dashboard 2곳 (+훅 1곳) | `useMemoEditSession` | 33→13 | 없음(중복만) | 저장 계약 3종이 다름 | Med-Low | LATER |
| C `openMemoModalAt` 달 fetch | server action | `openMemoModalAt` | `useMemoListData` | ~8 | 4를 8→7 | 화면 전환은 Dashboard 유지 | Med | LATER |
| E `OPEN-VIEWPORT-DEBUG` | cleanup | 3파일 | 삭제 | ~260(Dashboard 4) | 없음 | 없음 | Low | LATER |

🔴 **다음 1건 = D `projTemplatePromptNode` → `project-detail-dialog.tsx`.** 조건 2·3이 닫혔으니
이제 **조건 1(feature raw markup = 0)**이 남은 것 중 경계가 가장 뚜렷하다. 이 노드는 Dashboard에 남은
**19줄 중 9줄**(가장 큰 덩어리)이고 순수 확인 팝업 마크업이다. ⚠️ **node prop 공유를 반드시 유지해라** —
②가 이걸 Dashboard에 남긴 이유가 "작성창과 bodyEditor **둘 다** 쓴다"였다. 컴포넌트로 빼되
**Dashboard가 조립해 node prop으로 넘기는 현재 구조를 바꾸지 마라**(옮겨 심으면 한쪽이 끊긴다).
ref·Tiptap·dialog mount·DB write 위험 0.

🔴 **B는 payload builder만 공통화해라** — 11필드는 세 곳 다 동일하지만(훅의 `readFormBody()` 2회 호출은
순수 ref 읽기라 무해) **감싸는 저장 계약은 셋 다 다르다**(Dashboard 2경로 = `patchLocalMemo`+선닫기 /
훅 = `savingMemo` 스피너+View 복귀). **합치지 마라.** 🔴 **C는 "fetch만 훅으로, `open()`은 Dashboard"가 방향이다.**

🔴 **이번 감사에서 재확인된 KEEP**(판정 변경 0): `patchMemoInLists` · `pendingInsert`/
`insertPendingAtCursor`/`activeMemoEditorRef`(59줄, 에디터 ref 4개 선택) · bodyEditor 다리 ·
dialog registry · `confirmDialog` · `renderJobCard` · postit orchestration · 모바일 시트 2종
(**하나의 공용 바깥클릭 effect를 공유한다 — 쪼개면 리스너가 둘이 된다**) · Key Notes 재진입 리셋 ·
전체화면 layout/theme/배경복사 effect 4종.

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

## 4-2-1. Projects — 분리 후 남은 경계 (`f8a69cf`)

`useProjectWorkspace`가 폼 state·본문 ref·목록 필터·템플릿·저장/삭제·autosave를 소유한다.

**Dashboard에 남긴 bridge는 설계상 남긴 것이다:**
- **bodyEditor(양방향).** 훅은 `readBodyEditorDraft`·`setBodyEditorDraft`·`setBodyEditorSessionKey`를
  **주입받고**, 반대로 `readProjContent`·`setProjContent`·`setProjEditorKey`를 **반환한다**.
  🔴 **bodyEditor state를 훅 안으로 옮기지 마라 — 그 순간 순환이 된다.** Dashboard가 중재자다.
- **`projectEditPage` / `projectPageOpen`** — `mobileEditActive`·`monthlyComposePage`·`bigEditorPage`와
  나란한 **4개짜리 레이아웃 플래그**다. 비-JSX 사용처가 7곳(full-page ref · theme-color effect ·
  배경복사 effect · dialog host effect). 훅으로 끌고 가면 메모·먼슬리 레이아웃이 Project에 묶인다.
- **JSX 전부** — `projTemplatePromptNode`·`projAutosaveStatusNode`·`projDetailBody`·목록 다이얼로그·
  카드 통계·모바일 시트. 훅은 `.ts`다.
- `projectHostKeyRef` effect · `projectEditorRef` · 모바일 시트 state 둘 · dialog registry · `askConfirm`.

⚠️ 훅 호출은 **원래 자리(997행 근처) 그대로**다. `readBodyEditorDraft`/`setBodyEditorDraft`는 아래쪽
bodyEditor 절의 **function 선언이라 호이스팅**되어 인자로 넘겨도 안전하다(호출은 전부 이벤트 핸들러 뒤).
**이 둘을 `const` 화살표 함수로 바꾸지 마라 — 그 순간 TDZ로 죽는다.**

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

- **정렬 저장소 셋은 서로 독립이다 — 합치지 마라.** ① Key Notes 고정 = `memo.pin_order`
  (+ `pinned_at`·`start_date` tie-break, 정본은 서버 `getImportantMemos` **하나**다) ·
  ② Key Notes 일반 중요 = 같은 `pin_order`지만 `.eq("is_pinned", false)`로 갈라져 있다 ·
  ③ Monthly 하단 = `memo_day_order(user_id, day, memo_id)`.
  🔴 **③을 memo 컬럼 하나로 옮기지 마라** — 기간 메모가 여러 날짜에 동시에 뜨므로 날짜 독립성이 깨진다.
  🟢 **③은 Dashboard TODAY가 "오늘 날짜에 한해" 읽기 전용으로 재사용한다**(`650f5e5`).
  쓰기는 여전히 Monthly 하단 하나뿐이고, TODAY 카드에는 드래그가 없다. **TODAY 전용 순서
  컬럼·테이블을 만들지 마라** — 그러면 같은 순서가 두 벌이 된다.
  🔴 **② 계약이 2026-09-10에 바뀌었다**: 예전에는 "수동 블록 전부 → 새 메모 전부"라
  수동 순서를 한 번이라도 만진 사용자는 **새로 ★를 켤 때마다 그게 맨 뒤로** 갔다
  (실데이터 재현: `메모색상?` start_date 09-10이 전체 최신인데 12건 중 11번째).
  지금은 `orderPriorityMemos`가 **표시 순서와 저장된 `pin_order`를 분리**해서, 수동 메모끼리의
  상대 순서는 그대로 두고 `pin_order = null`인 새 메모만 날짜 자리에 끼워 넣는다.
  🔴 **이것은 `2584097`이 되돌린 "전체 start_date DESC 강제 정렬"과 다르다** — 그건 수동 순서를
  화면에서 덮었고, 이건 수동끼리의 순서를 **한 번도 바꾸지 않는다**(`ordering.check.ts` ④가 지킨다).
  DB write 0 · `pin_order` 재매김 0. **pairwise 비교로는 이행성이 깨져서 merge 함수다 —
  comparator로 되돌리지 마라.**
  🔴 **①을 클라이언트에서 다시 정렬하지 마라** — 정렬 규칙이 두 벌이 되고 한쪽만 바뀐다.
  🔴 **① 계약도 2026-09-10에 바뀌었다: 새로 켠 Pin은 고정 영역 맨 앞이다**(예전엔 맨 뒤).
  정렬 규칙은 그대로 서버 하나이고, 바뀐 것은 **삽입 위치**뿐이다 — `nextPinOrder(현재 최솟값)`가
  `min − 1`을 새 메모 **한 행에만** 준다. Pin OFF는 `pin_order`를 null로 비우므로 다시 ON하면
  "새로 고정"이 되어 또 맨 앞이다. **기존 Pin을 미는 N번 update를 만들지 마라.**
  🔴 **화면 순서 스냅샷(`useMemoReorder.dragOrder`)은 그 집합이 바뀌면 버린다** —
  안 버리면 목록에서 빠졌다 돌아온 메모를 옛 index에 다시 꽂아 서버 순서를 덮는다.
  **`known`/`extra`처럼 파생값으로 "버리는 척"하지 마라 — 다음 렌더에 id가 돌아오면 부활한다.**
  🔴 **"기본값"과 "강제 정렬"을 구분해라.** 날짜순은 *아직 수동 순서가 없는* 메모의 기본값이다.
  무조건 정렬로 만들면 사용자가 드래그로 저장해 둔 순서를 화면에서 덮는다(`52b42b2`가 그랬다).
  규칙은 전부 `src/lib/memo/ordering.ts`에 있고 `ordering.check.ts`가 지킨다 — **거기 먼저 읽어라.**
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

**마지막 정적 검사** (tsc 0 · `npm run check` exit 0 · `git diff --check` clean).
🔴 **신뢰 가능한 canonical baseline = `e26 w8`**(파일 **42**, ④ 이후. ⑤ 이전엔 40, ④가 새 파일 1개를 더했다 —
  **새 파일들은 메시지 0건이라 e/w 숫자는 ① 이후 한 번도 안 변했다**).
🔴 **차집합을 낼 때 `message`를 그대로 키로 쓰지 마라** — React Compiler 플러그인은 `message` 안에
  **여러 줄 코드 프레임(줄번호 포함)**을 넣는다. 줄이 밀리면 전부 NEW/GONE으로 보인다(④에서 실제로 그랬다).
  `ruleId` + 첫 줄 headline + 캐럿(`^^^`) 설명 + `> NNN |` 소스 줄의 **코드 본문**으로 서명을 만들면
  줄 이동에 영향받지 않는다(④에서 이 방식으로 **집합이 완전히 동일**함을 확인했다).
  중간에 보였던 **e18은 무효**다 — Dashboard가 분석에서 빠져 과소보고된 값이다.
  ① 이전 e25와 exact signature 비교: **GONE 0 · NEW 0**, `react-hooks/refs`만 6 → 7건이다
  (늘은 1건 = `memoHeadActions(detailEditorRef)` 즐 — ①의 래퍼가 ref를 렌더 중 함수 인자로
  넘기는 기존 3개 자리와 **같은 부류**다. 이번엔 안 고쳤다 — coverage 복구와 lint 청소를 섞지 않는다).
🔴 **eslint canonical 명령은 범위 지정본이다**(2026-09-11 확정) — Dashboard/refactor는 반드시 이걸로 재라:
```
npx eslint --format json src/app/Dashboard.tsx src/lib/dashboard src/lib/memo src/components/dashboard
```
그 범위 baseline은 **e26 w8**(파일 40)이다(① 이전은 e25/39였고 새 파일 1개가 늘었다). 예전 장부의 "e28 w9"는 **다른 명령의 숫자**라 폐기했다 —
저장소 전체 `npx eslint .`는 지금 **e28 w14**다(범위 밖 에러 3 · 경고 6). 
**범위가 다른 두 숫자를 직접 비교하지 마라** — 그게 "w9 → w14 회귀"라는 착각의 정체다.
숫자만 세지 말고 **메시지 집합의 차집합**을 봐라(개수는 같고 내용이 바뀜 수 있다).
`ordering.check.ts`는 13 → **18가지**)

**2026-09-10 세션 ⑥ 검증(종료)** — `2f1517a` 3건, 사용자 실기기(Web·Mobile) 통과. 사용자 메모 write 0.
🔴 남길 교훈: 재현 조건은 **"그 세션에서 드래그를 했나"**다 — 드래그 없이 재고 닫으면 거짓 음성이다.

🔴 **검증 방법 셋(계속 쓴다)**: ① **DB write 0은 `window.fetch`를 임시로 감싸 server action을 전수 세어 증명한다**
(추측 금지 · 래퍼는 반드시 제거). ② **리렌더 유발 시 "값이 같으면 setState가 bail out한다"** — 확실한 트리거를 써라.
③ **공유 ref 사본 수를 직접 못 세면 "정적 attach 1 + 게이트 1 + runtime root 1"** 세 증거로 대신하고 직접 센 것처럼 쓰지 마라.

**종료된 검증 블록(운영 규칙 3·8로 압축)** — 세션 ⑧(③ Idea Build: DOM 2,240자 동일 · 배선 11/11) ·
세션 ⑦(재-Audit ONLY: 2,609줄 = 로직 851/JSX 774/주석 928/빈줄 56 · KEEP 7 재확인 · 결과는 4-1-2절 표) ·
세션 ⑤(`8ec059a` 5건, 실기기 통과). 🔴 남길 것: **드래그를 합성할 때 대상을 먼저 `scrollIntoView` 해라** —
뷰포트 밖이면 `elementFromPoint`가 null이라 "안 움직인다"가 거짓 양성이 된다.

> 걷어낸 검증 블록(운영 규칙 3·8): 마이그레이션 적용 확인 · 세션 ②③④ 정렬 · `ba78b0c` 정적검사 ·
> Fast Track 4단계 · Projects 추출 · POSTFLIGHT. 전부 종료됐고 근거는 그 커밋 메시지와 git에 있다.

**무변화 근거** (다음 후보에도 같은 절차를 써라)
- ① 옮긴 본문을 원본과 **바이트 단위로 diff**한다(지금까지 전부 rename 0 · 최근 ③은 70/71).
- ② **양성 대조로 빌드가 갈렸는지 먼저 확인**한다(마커 문자열이 어느 청크에 있나). 이게 없으면
  "해시 동일"이 "같은 빌드를 두 번 쟀다"와 구분되지 않는다.
- ③ 주변 smoke도 **테스트 메모로** 해라 — 사용자 메모를 모바일로 열었다 나오면 `updateMemo`가 나간다.

**🔴 직접 검증하지 못한 것 (현재 기준)**
- ✅ **(해소) Monthly 하단 순서의 "저장"은 마이그레이션 후 실데이터로 확인했다** — 1절 참고.
  남은 것은 **실기기**뿐이다(아래 항목).
- 🟡 **`updateMemo`의 중요-해제 정규화는 방어적이다.** 지금 그 조합(`is_important:false`를
  `updateMemo`로 보내면서 Pin이 켜진 상태)에 닿는 **UI 경로를 찾지 못했다** — 편집 폼의 ★는
  ☆→★→📌→☆ 순환이라 항상 `handleTogglePin`/`toggleImportant`를 먼저 태운다. 그래도 저장
  payload 셋이 `is_important`를 담아 보내므로 공유 쓰기 지점에서 계약을 지키는 쪽을 택했다.
- 🟡 **Key Notes 드래그의 "저장까지"는 이번에도 안 태웠다.** 한 번 드래그하면 목록 전체의
  `pin_order`가 다시 매겨져 사용자 순서를 건드리게 되므로 `cancel`로 끝냈다.
- 🟡 **"이번 달/기간/전체 기간" 모드에서 드래그가 꺼지는지**는 코드 게이트로만 확인했다.
  같은 분기(`dragEnabled=false`)를 선택 모드로는 실제로 태웠다(체크박스 경로 정상).
- ✅ **(해소) `8ec059a`·`7acbfb4`는 2026-09-10 실기기에서 사용자가 통과 판정했다** —
  Monthly 첫 방문 날짜 blank · 웹에서 방금 만든 메모 드래그 · Web/Mobile 드래그 중 스크롤·선택 잠금 ·
  웹 Create 색상/유리(디자인은 **이번엔 패스** 판정이라 추가 CSS 조정 금지). 같은 커밋의 OFF→ON은
  이번에 `2f1517a`로 다시 고쳐 함께 확인됐다.
- 🔴 **`650f5e5`·`3d12089`는 아직 실기기 미확인이다.** ① 날짜 flicker는 "모바일에서 보인다"는
  신고라 로컬 데스크톱 통과가 증거가 아니고 ② `dayOrderPending` 게이트가 느린 회선에서 얼마나
  비어 보이는지는 로컬(즉시 응답)에서 못 잰다 — 셀룰러에서 "목록이 늦게 뜬다"면 알려달라.
- 🟡 **`bfe3318`·`52b42b2`·`2584097`·`ba78b0c`·`3e6fd43`(5건)이 전부 실기기 미확인이다.** 제목 깜빡임은 **사용자가 실기기에서
  신고한 증상**이라 로컬 뷰포트 재현·수정만으로 닫지 말고 **실기기에서 같은 경로를 다시 밟아 확인**받아야 한다.
  Key Notes도 iOS 실기기·설치형 PWA는 안 봤다.
- 🟡 **중요 메모 그룹의 드래그**는 `OPEN-KEYNOTES-PRIORITY-DRAG`대로 **내가 한쪽으로 정한 것**이다.
  실제로 드래그를 끌어보는 검증은 하지 않았다(포인터 홀드 제스처라 합성이 안 된다).
- 🟡 **`f8a69cf`(Projects) · `a1d4ad8`·`615cdf4`·`e479bb9`·`1458df9`(Fast Track 4단계) 전부
  실기기 미확인이다** — 로컬 데스크톱 1280 / 모바일 375×684 뷰포트까지만 봤다.
  iOS 키보드·스크롤, 설치형 PWA standalone, Android는 **사용자 확인 필요**.
- Fast Track에서 **드래그 선택(문장 선택 → 원형 메뉴)** 경로는 합성 이벤트로 재현하지 못해
  "전체 저장" 경로로만 검증했다. 실제 드래그 선택은 **실기기/수동 확인 필요**.
- Projects의 **bodyEditor 확장 창 실사용 동작**은 합성 클릭 한계로 못 쟀다(baseline 동일까지만 확인).
  `projSummaryError`(30자 초과) 분기도 입력칸 `maxlength=30`이 먼저 막아 UI로는 도달하지 않는다.
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
