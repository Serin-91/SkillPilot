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
- **기준 HEAD**: master. 마지막 기능 = **`bb9e891`**(⑤ Big Editor 표현 JSX) / 그 앞 = **`458c8e1`**(⑥ 모바일 옵션 시트) / 그 앞 = **`be27f8c`**(lint 검증 복구) / 그 앞 = **`134af03`**(재-Audit ① 메모 편집 폼 → `memo-edit-form.tsx`).
  그 앞이 **`eac2abf`**(② Project 껍데기 → `ProjectDetailShell`) /
  그 앞이 **`3e1c996`**(⑪ `openCreateMemoForm` → `useMemoEditSession`) /
  그 앞이 **`8ac4a47`**(⑩ 선택삭제 2함수 → `useMemoListData`) /
  그 앞이 **`74b07e7`**(⑧ `confirmDialogNode` → `ConfirmDialog`) /
  그 앞이 **`5012001`**(⑨ 카드용 파생 카운트 6개 + eslint baseline 정정) /
  그 앞이 **`f137cc9`**(③ Idea Build JSX 추출).
  🔴 이 줄 위에 **docs 전용 커밋이 하나 더 있을 수 있다** — 커밋 해시는 커밋된 뒤에야 정해져서
  기능 커밋 안에서 자기 해시를 적을 수 없다(amend로 쪻으면 해시가 또 바뀜다). 
  **이 파일이 가리키는 것은 항상 마지막 기능 커밋이다.** `git log --oneline -5`로 대조해라.
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
  🔴 **미푸시 누적 주의** — 예전에 6개 커밋이 미푸시로 쌓여 배포본이 뒤지지는 사고가 있었다.
  **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** — 내 수정이
  사용자 화면에 아예 없을 수 있다(`CLAUDE.md` 7절 0번이 같은 얘기를 한다).
- **🎉 Memo 정렬 작업은 코드 쪽이 끝났다**(2026-09-10). `bfe3318` 제목 깜빡임 · `2584097` Key Notes
  수동 순서 복구 · `ba78b0c` Monthly 날짜별 순서 + 동률 확정 · `3e6fd43` 상태전이/쓰기 경계 마감.
  **Pin 수동 순서는 세션 내내 전/후 동일**(pinned [0-9] · priority [0-10])이고 사용자 메모 write 0이다.
  🔴 **정렬 규칙의 정본은 `src/lib/memo/ordering.ts`(순수 함수 4개)이고 `ordering.check.ts`가
  `npm run check`에서 계약 13가지를 지킨다 — 정렬을 건드리기 전에 거기부터 읽어라.**
  🔴 **이 작업의 교훈 셋:**
  ① **낙관적 갱신은 서버의 "빈 값 = 그대로 둔다" 계약을 같이 지켜야 한다**(제목 깜빡임).
  ② **기본값(default)과 강제 정렬을 구분해라.** `52b42b2`가 "날짜 최신순"을 무조건 정렬로 넣어
     **사용자가 드래그로 저장해 둔 실제 데이터(pin_order 11건)를 화면에서 덮었다**(`2584097`이 되돌림).
  ③ **상태 전이는 한 함수의 규칙이 아니라 계약이다.** `toggleImportant`만 고치면 편집 폼 저장
     경로가 같은 계약을 계속 깬다 — `updateMemo`(공유 쓰기 지점)에서 의존 필드를 정규화한다.
- ✅ **`memo_day_order` 마이그레이션 적용 완료 — 저장까지 실제로 확인했다**(2026-09-10, 사용자가
  SQL Editor에서 실행). 운영 DB에 사용자가 직접 드래그한 순서가 들어와 있고 화면과 일치한다:
  09-10 `버그잡기 → 메모색상? → 피곤해...`(sort_order 0,1,2) · 09-02 6건(0~5) — **날짜별로
  연속·중복 없음**. 🔴 **기간 메모 `버그잡기`(09-10~09-15)가 09-10에만 순서 행을 갖고
  09-11에서는 기본 순서로 나온다** — 날짜 독립성이 실데이터로 증명됐다.
  ✅ **(해소) 날짜를 옮길 때 기본 순서가 잠깐 보이던 창은 `650f5e5`에서 없앴다.**
  `dayOrder`가 `{day, order}` 한 벌이라 날짜마다 순서를 잃던 것을 **날짜 키 캐시**
  (`dayOrders: Map<day, Map<memoId, sortOrder>>`)로 바꿨다 — 이미 본 날짜는 첫 프레임부터
  저장 순서고, 캐시가 없는 날짜는 `dayOrderPending`으로 목록 렌더를 잠깐 막는다(틀린 순서를
  그리는 것보다 안 그리는 게 낫다). 🔴 **날짜 mismatch guard를 없앤 게 아니라 키 조회로
  더 강해졌다** — 키가 안 맞으면 이전 날짜 순서를 읽을 방법이 아예 없다.
  실측(MutationObserver): 수정 전 A→B **701ms** · B→A **352ms** 동안 틀린 순서가 보였고,
  수정 후 **양방향 0ms**(복귀는 mutation 1회로 곧장 저장 순서).
  🔴 **그 게이트가 대가를 만들었고 `8ec059a`에서 갚았다** — 날짜를 클릭할 때 그 날짜만 lazy
  fetch하니 **처음 방문하는 날짜마다 목록이 잠깐 비었다**(실기기 2차 신고). 지금은
  **보이는 달 전체를 한 번에 preload**해서 캐시를 미리 채운다(`getMemoDayOrdersForRangeAction`).
  🔴 순서가 **없는** 날짜도 빈 맵으로 넣어야 "이미 안다"가 되어 게이트가 안 걸린다 —
  그걸 빼면 메모 없는 날짜가 계속 pending으로 남는다. 실측: 첫 방문 날짜 6개에서 blank **4 → 0**.
- **Monthly 순서 저장은 원자적이다** — `reorderMemosForDay`가 단일 `upsert(rows)`(INSERT … ON
  CONFLICT 한 문장, 요청 1회)라 부분 쓰기가 없다. 🔴 **여기를 개별 update 루프로 바꾸지 마라.**
  🟡 대조: Key Notes `reorderPinnedMemos`는 `Promise.all`로 **N개 개별 UPDATE**라 부분 쓰기가
  가능하다(호출부도 `void`라 롤백이 없다). 이번 범위 밖이라 그대로 뒀다 — 남은 위험으로 안다.
- **실측(2026-09-11, ⑥ 추출 후 = 현재 HEAD)**: `Dashboard.tsx` **2,247줄**.
  경로: 2,609 → ③ **2,533** → ⑨ **2,527** → ⑧ **2,504** → ⑩ **2,482** → ⑪ **2,465** → ② **2,379** → ① **2,281** → (lint 수정 +5) **2,286** → ⑥ **2,264**(−22).
  🔴 **빈줄을 57로 적었던 것은 계측 버그였다** — `split(/\r?\n/)`가 파일 끝 개행 때문에 빈 원소를
  하나 더 만들어 총합이 2,610으로 나왔다. 지금은 그 원소를 버려서 `wc -l`과 일치한다.
  `dashboard.css` 11,080줄.
  🔴 **훅 11개의 줄 수 목록은 걷어냈다**(2026-09-11). 후보를 하나 옮길 때마다 두세 개가 바뀌는데
  CURRENT에 그 표를 두면 매 세션 stale 충돌이 난다 — 필요하면 `wc -l src/lib/**/use*.ts`로 그때 재라.
  여기 남기는 현재값은 **Dashboard 줄 수와 이번에 건드린 훅**뿐이다(이번: `useMemoEditSession` 364줄).
  🔴 옛 "2,578/2,582줄"은 Fast Track 직후 값이고 그 뒤 `650f5e5`·`8ec059a`가 주석 +132줄을 얹었다 —
  **줄 수를 인용하지 말고 매번 다시 재라.** 주석 195블록 중 **사고이력형 47블록 490줄**(주석의 52.8%)이고
  대부분 KEEP 영역(포스트잇 진입 경로 · 스크롤 잠금 · 배경복사)에 붙어 있어 코드와 함께 남는다.
- **끝난 작업**: **Memo 소유권 리팩토링** 1·2단계 완료. 그 시점의 PHASE 3 JSX-first 분리는 중단했었다
  (⑭ theme은 Context 비도입 결정과 충돌 / ⑯ 빠른수정은 밀도 0.57로 비용 초과 / ⑰ Monthly MEMO는
  prop이 많아 보류). 대신 **hook-first**로 방향을 바꿔 훅 후보 6개를 끝냈다.
  🔴 **⑰ Monthly MEMO "분리 불가" 판단은 2026-09-09 Fast Track에서 뒤집혔다** — `1458df9`로
  분리 완료했다. 당시 근거였던 prop 수는 실제 **62개**이고(옛 "66"은 map 지역변수 4개를 포함한
  과다계수), 로직을 함께 옮기지 않고 **JSX 조립만** 떼면 prop 수가 많아도 배선이 1:1로 유지된다.
  전수 대조 결과 **SAME 62 / DIFFERENT 0**이었다(6절).
- **🎉 Dashboard ownership 분리 — 훅 후보 6개 전부 완료.** My Page `e805191` · Idea Build `50cdf8e` ·
  Briefing 피드 `3f999da` · MindSet `76e7b8e` · Today's Focus `a59f602` · **Projects `f8a69cf`**.
  🔴 "밖 참조 N개"를 셀 때는 **JSX와 비-JSX를 갈라서 세라** — Projects는 27이 아니라 실제 3이었고,
  선택→메모는 "ref injection 필요"라는 C 판정 자체가 오분류(실제 비-JSX 참조 0)였다.
  둘을 합쳐 세면 멀쩡한 후보가 불가능해 보인다.
- **🎉 Fast Track(2026-09-09) — JSX 축 4단계 완료.** 재감사에서 "남은 3,347줄의 42%가 JSX"임을
  확인하고 그 축을 처음으로 건드렸다. `a1d4ad8` 다크 확장창 배경 · `615cdf4` 카드7+헤더 ·
  `e479bb9` 선택→메모 · `1458df9` Monthly 다이얼로그. **3,347 → 2,578줄(−769 · −23.0%).**
  🔴 그때의 "추가 모듈화 중단"은 **4-1-1절 KEEP 표에 한정된 말이다**(줄 수만 노리고 그것들을 깨지
  말라는 뜻). Roadmap 자체는 진행 중이고, 남은 후보는 **4-1-2절 재-Audit**에 있다.
- **모바일 Memo 본문 14px은 재현되지 않았다**(2026-09-09, 코드 변경 0) — 본문 크기는 전부
  `var(--memo-base-font)`(모바일 16px) 하나를 쓰고 320/375/430에서 동일했다. **열린 작업 아님.**
- **✅ 2026-09-09 실기기 검증 완료 (사용자 확인).** Memo 소유권 1·2단계 · My Page 추출 ·
  Idea Build 추출 · 마이페이지 닉네임 칸 — **전부 정상.**
  🟡 **`a59f602`(Today's Focus)와 `f8a69cf`(Projects)가 실기기 미확인이다.** `b8668aa`·`76e7b8e`는 확인 완료.
    앞의 것은 `3f999da` 후속 — 발견된 2건 모두 **회귀가 아니라 기존 버그**였다.
    (그 커밋 diff에 `scroll` 0회 · `onOpen` 본문 글자 동일 · `setTrendHistoryDate(null)`이
    onOpen에 들어간 적 없음.) 나머지 Briefing 경로는 실기기 정상 확인 완료.
- **🎉 2026-09-10 세션 ④ — 실기기 신고 4건 마감**(`650f5e5` 코드 3건 · `3d12089` 디자인 1건).
  ① 날짜 이동 flicker(위 참고) ② **Dashboard TODAY 3건이 오늘 날짜 수동 순서를 따른다** —
  오늘 날짜의 기존 `memo_day_order`를 **읽기 전용**으로 재사용한다(전용 컬럼·테이블 0 ·
  TODAY 카드 드래그 0 · Key Notes `pin_order`와 연결 0). 순서가 없으면 기존 기본값(중요 우선)
  유지라서 comparator를 두 벌 만들지 않고 `compareByDayOrder(order, fallback)`로 인자를 더했다.
  ③ **새 일반 중요 메모가 무조건 맨 뒤로 가던 계약을 바꿨다**(아래 5절) ④ 웹 Create 라벨 가독성.
  🔴 **이 세션의 교훈: "탁하다"·"안 보인다"는 값이 아니라 표면 비교로 풀린다.** Key Notes와
  웹 Create를 같은 색으로 나란히 재보니 **색 레이어 문자열이 완전히 동일**했고 다른 것은
  유리 표현(inset)과 라벨이 쓰던 토큰뿐이었다 — 색값을 하나도 안 바꾸고 끝났다.
- ✅ **2026-09-10 실기기 검증 완료(사용자 확인, Web·Mobile).** `2f1517a`의 셋이 전부 정상이다 —
  Key Notes 안 중요 OFF→ON 즉시 재정렬 · 새 Pin 맨 앞 · 기존 Pin 상대순서 보존.
  **웹 고정메모 가로 스크롤 버벅임도 재현되지 않는다**(당시 Zoom 실행으로 인한 로컬 PC 부하로 판단).
  🔴 계약과 재발방지 규칙은 5절과 `CLAUDE.md` 지뢰표에 있다 — 여기 다시 적지 않는다.
- 🔴🔴 **Dashboard 모듈화 Roadmap은 진행 중이다. "끝났다"고 읽지 마라**(2026-09-10 사용자 정정).
  목표는 줄 수가 아니라 **얇은 orchestration shell**이다 — 화면 조립 · 페이지 전환/모달 조정 ·
  기능 간 bridge · 공통 coordination만 남기고 **feature 구현은 전부 밖으로** 낸다.
  Fast Track의 "여기서 멈춘다"는 **4-1-1절 KEEP 표에 한정된 국소 중단선**이지 전체 종료가 아니다.
  **2026-09-10 재-Audit 결과가 4-1-2절에 있다 — 다음 라운드는 거기서 후보 1개씩 골라 진행한다.**
- ✅ **후보 ③ Idea Build JSX 추출 완료(2026-09-11).** `ideaModeSelector`·`ideaPickerBlock`·
  `ideaSourcePickerNode` 71줄을 `idea-dialog.tsx`로 옮겼다. **새 파일 0 · 새 훅/Context 0 ·
  로직 이동 0 · CSS 변경 0** — 옮긴 71줄 중 70줄이 원문과 **바이트 동일**(1줄은 낡아진 주석 정정).
  🔴 부수효과가 이 후보의 진짜 이득이다: JSX 전용 값 11개를 따로 꺼내던 **rest 분해가 사라져**
  `const ideaDialogProps = useIdeaBuild(...)` 한 줄이 됐다. Dashboard는 이제 Idea Build의
  버튼 구조·조건부 마크업을 소유하지 않는다. **2,609 → 2,533줄(−76).**
- **blocker**: 없음.

누적: `Dashboard.tsx` 4,309(Memo 착수) → … → 3,551 → 3,347(Projects)
→ 2,970(카드+헤더) → 2,740(선택→메모) → **2,578줄**(Monthly 다이얼로그).
**Memo 착수 시점 대비 −1,731줄(−40.2%).** 훅 10개 1,906줄 + 분리 컴포넌트 5개 999줄.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `bb9e891` | **"메모로 저장"(Big Editor) 표현 JSX → `big-editor.tsx`(신규, 재-Audit 후보 ⑤).** 🔴 **부분 이동이다.** candidate 전체 범위는 57줄(`bigEditorInner` 42 + 오버레이 7 + 페이지 8; Audit 63과 −6)인데 그중 **JSX 27줄만 바이트 동일로 옮겼다**(insert-bar 12 · actions 4 · 오버레이 5 · 페이지 6). 🔴 **`memoEditForm(bigEditorHandleRef, closeBigEditor, {...})` 호출은 Dashboard에 남겼다** — 그게 이 화면의 orchestration이자 **공용 폼의 세 설정 지점 중 하나**라, 옮기면 폼 배선이 두 곳으로 갈라져 `memo-edit-form.tsx` 머리말의 "폼은 한 벌" 계약이 깨지고 props가 ~38개로 불어난다(사용자 지시 §10 "orchestration wrapper와 mount 위치는 Dashboard 유지"에 맞춘 선택이다). 새 컴포넌트 4개 · Props **2/4/5/4** · **ref/editor handle 0**(`bigEditorHandleRef`는 Dashboard 소유 그대로이고 새 파일은 코드에 ref를 한 번도 안 쓴다 — 언급 2건은 전부 주석). state/effect 이동 0 · Context/registry 0 · CSS/className/DOM 0. 🔴 **마운트 계약 무변경**: `grep bigEditorNode`(17줄) · `bigEditorPageNode` · `bigEditorHandleRef`(10줄) 전부 **전후 완전 동일**. `bigEditorInner`만 들여쓰기 2칸이 줄었다(이제 컴포넌트의 children). 검증(①에서 미검증이던 Big Editor 실화면을 이번에 닫았다): 데스크톱 오버레이·모바일 페이지 **둘 다 marker로 확인**(서로 배타, 각 1개) · editor **1개** · undo/redo·save·delete·close 핸들러 전부 연결(**save는 누르지 않았다**) · `titleId="body-editor-title"` 전달 확인 · 열기/닫기/재진입 해시 **3786150716 동일** · 모바일 페이지 outerHTML **4,417자·해시 4171499167 전후 문자 단위 동일**(버튼 17·입력 1·에디터 1). `react-hooks/todo` **0**(컴파일러 bailout 재발 없음). **DB write 0**(텍스트 selector 금지 원칙을 지켜 고유 클래스·임시 훅만 사용). **2,264 → 2,247줄(−17)**, big-editor.tsx 신규 96줄 |
| `458c8e1` | **모바일 메모 옵션 시트 → `memo-edit-form.tsx`의 `MobileMemoOptionsSheet`(재-Audit 후보 ⑥).** 옮긴 JSX **31줄 바이트 동일**(diff 공집합). candidate 실범위 **35줄**(Audit과 일치). Props **12** — Audit의 13에서 `mobileMemoMenuOpen`이 빠졌다(가드를 Dashboard에 남겼기 때문). **ref·editor handle 0** · state/effect/handler ownership 이동 0 · 새 Context/registry 0 · CSS/className/DOM 0. 🔴 **장부 정정: 마운트 호출부는 2곳이 아니라 3곳**이다 — ① `postitEditMode` (postitViewNode 안) ② `mobileEditActive \|\| bigEditorPage \|\| monthlyComposePage` (모바일 편집 페이지) ③ `memoFormOpen && !monthlyComposePage` (먼슬리 다이얼로그 안). **3곳 전부 조건식까지 바이트 동일**(`grep` 전후 diff 공집합, 3 → 3). `mobileMemoMenuOpen &&` 가드도 Dashboard 래퍼에 남겨 닫힘 시 값이 예전처럼 `false`다. 검증(3 host 전부 양성대조 마커 확인 후 복구): **모바일 Create** 0→1→0→1(항목 4개) · **모바일 Edit** 0→1→0→1→0(항목 7개, 상태그룹+메모삭제) · **먼슬리 다이얼로그(데스크톱)** mount 1 / visible 0(모바일 전용 CSS) — host 체인이 `dialog.monthly-memo-dialog` 안임을 확인. 동시 mount는 어느 상태에서도 **최대 1**. 데스크톱 일반 화면 0(negative check). 시트 outerHTML **657자·해시 2499360795 전후 동일** · form mount 1 유지 · `.ProseMirror` **같은 노드**(remount 0). ⚠️ **DB write 2건 발생**(내 실수 — "완료" 텍스트로 버튼을 고르다 **상태 옵션**을 눌러 autosave가 돌았다). 같은 메모 status를 `진행 중`으로 되돌렸고 **새로고침 후 목록에서 `진행 중` 확인**해 데이터는 원복했다(updated_at은 갱신). 이후 검증은 `.mobile-options-done` 클래스로만 눌렀다. **2,286 → 2,264줄(−22)**, memo-edit-form 268 → 330(+62) |
| `134af03` | **Memo 편집 폼 JSX 3덩어리 → `memo-edit-form.tsx`(신규, 재-Audit 후보 ①).** `MemoHeadActions`(25) · `QuickEditForm`(40) · `MemoEditForm`(67) = **JSX 132줄 바이트 동일**(diff 공집합). 후보 실범위는 **153줄**(Audit 158). Props는 컴포넌트별 **8 / 24 / 26**, union 35 — `any`·spread·god-object 0. 🔴 **핵심은 "폼 한 벌" 계약 보존이다**: Dashboard에 `memoHeadActions()`·`quickEditFormNode`·`memoEditForm(ref,onCancel,opts)` **이름과 시그니처를 래퍼로 남겨** 호출부 4종(`grep` 전후 **완전 공집합**)이 한 글자도 안 바뀌었다. 🔴 **editor ref 4개는 전부 Dashboard 소유 그대로**(detailEditorRef·compactEditorRef·bigEditorHandleRef·bodyEditorHandleRef) — 호출부가 화면마다 **다른 ref**를 넘기는 기존 설계를 그대로 쓴다. `postitScrollRef`도 유지. **ref 이동 0 · Tiptap 인스턴스 생성 위치 0 · `key`(`editorKey-formSessionKey`) 0.** 실측 마운트: 모바일 Create · 데스크톱 quick-edit · 데스크톱 detail-edit 세 경로 모두 `.big-title-row` **정확히 1개**(전후 동일). 🔴 **Tiptap 회귀 체크 통과** — 제목 입력으로 리렌더를 유발해도 `.ProseMirror` **DOM 노드 identity가 그대로**(remount 0)고 본문도 안 날아갔다. undo/redo 핸들러 연결 유지. DOM: 모바일 Create 페이지 **3,832자·해시 3578971744 문자 단위 동일**, 데스크톱 quick-edit 폼 **2,414자·해시 3682405211 동일**. 🔴 **양성 대조**: 세 컴포넌트에 마커를 넣어 quick=`quick-edit-form`, 모바일 Create=`memo-edit-form`이 **각 1개씩** 뜨는 것을 확인 후 복구. ⚠️ **DB write 2건 발생**(내 실수 — 제목 입력이 autosave를 깨웠다). 같은 값으로 되돌려 **데이터는 원상복구**했고 본문·다른 필드는 무변경이지만 `updated_at`은 갱신됐다. ⚠️ **eslint GONE**: Dashboard의 `react-hooks` **에러 7건이 사라졌다**(신규 0). 그중 2건은 옮긴 코드(`memoEditForm(ref,…)`를 렌더 중 호출)라 설명되지만 **5건은 내가 안 건드린 줄**이고, 원인 기전을 끝내 규명하지 못했다. **줄었을 뿐 새로 생긴 건 없다.** **2,379 → 2,281줄(−98)**, memo-edit-form.tsx 신규 268 |
| `eac2abf` | **Project 상세/편집 껍데기 → `project-detail-dialog.tsx`의 `ProjectDetailShell`(재-Audit 후보 ②).** 옮긴 JSX **104줄이 바이트 동일**(본문 90 + 모바일 옵션시트 14, diff 공집합). 🔴 **장부 정정 2건**: ① 목적지는 **신규 파일이 아니다** — `project-detail-dialog.tsx`가 이미 있었고(`ProjectDetailView`/`ProjectDetailEdit`) 그 파일 머리말이 "껍데기는 아직 Dashboard에 있다"고 적어 둔 바로 그 부분을 이번에 옮겼다. ② 실제 블록은 4덩어리 **121줄**(Audit 124)이고 그중 `projTemplatePromptNode`(11)·`projAutosaveStatusNode`(4)는 **body-editor 다이얼로그도 쓰므로 Dashboard에 남겨 node prop으로 넘긴다** — 옮겼으면 그쪽이 끊긴다. **Props 39개**(외부 의존 39 = 데이터 12 · setter 9 · handler/callback 12 · ref 3 · node 3), `any`·spread·god-object 0, dependency↔Props **누락 0 / 과잉 0**(tsc 0으로 교차확인). 🔴 **ref 3개는 Dashboard 소유 그대로**(`projectEditorRef`·`projectDetailScrollRef`·`projectDetailScrollBtnRef`) — 받아서 붙이기만 한다. state/effect/CRUD 이동 0 · 새 Context/registry 0 · CSS 0 · DOM 0. 🔴 **마운트 계약 무변경**: `grep projDetailBody` 전후 **완전 공집합**이고 런타임 `.proj-detail-inner` **mounts=1**(모바일이면 `.proj-edit-page`, 아니면 `<dialog>` — 한 번에 한 곳). 검증: 상세 DOM이 전후 **edit 8,660자/해시 571489923 · view 2,258자/해시 3841506333으로 문자 단위 동일**(버튼 28 · 입력 3). `projectDetailScrollRef` **두 부착점 다 확인** — edit에선 `onScroll` undefined, 취소로 view 전환하면 attached(원본 삼항 그대로). 핸들러 6개(undo·redo·더보기·뒤로·취소·저장) 전부 연결 · 재진입 해시 동일 · 콘솔 에러 0. 🔴 **양성 대조 먼저 했다** — 새 컴포넌트에 `data-pc2`를 넣으니 상세 DOM에 정확히 1개 나타나고 해시가 갈렸다(확인 후 복구). **저장·삭제는 누르지 않았다 — DB write 0.** **2,465 → 2,379줄(−86)**, project-detail-dialog 271 → 453(+182) |
| `3e1c996` | **`openCreateMemoForm` → `useMemoEditSession`(재-Audit 후보 ⑪) + 장부 정합성.** 함수 17줄을 **바이트 동일**로 옮겼다(diff 공집합). 🔴 **장부 충돌을 코드로 확정했다** — 후보 표의 "20줄 · `theme`+`memoFormRef`"는 틀렸고 실제는 **17줄 · `theme`+`scrollToMemoForm`**이다(표를 고쳤다). 몸통은 폼 setter 14개 호출인데 **14개 전부 이 훅 것**이었다(13개는 훅 state, `setMemoFormOpen`은 이미 이 훅의 인자). `memoDialogDateIso`도 이미 인자였다. 🔴 **`memoFormRef`는 Dashboard에 그대로 뒀다** — JSX가 쓰는 ref라 훅으로 끌면 ref 소유가 번진다. 대신 **`scrollToMemoForm` 콜백만 주입**한다(`CLAUDE.md` 공유-ref 규칙의 실제 적용례다). 새 인자 **2개**(`theme`·`scrollToMemoForm`) · 새 파일 0 · 새 Context/ref 0 · JSX·CSS·DOM 0 · Tiptap handle 0. 부수효과 1건: `setFormContentMode`·`setFormEmoji`가 훅 밖 사용 0회가 돼 ⑩과 같은 규칙으로 반환·구조분해에서 뺐다(값 2개는 렌더용 유지). Dashboard의 `defaultMemoColor` import도 미사용이 돼 뺐다. 검증: Create 폼 outerHTML이 전후 **5,252자 · 해시 2465898565로 문자 단위 동일**(테마 light · 제목 "" · Free Note · 날짜 2026-09-11 양쪽 · 색 yellow · 본문 "") · 닫은 뒤 재진입도 같은 해시 · 콘솔 에러 0. 🔴 **양성 대조 먼저 했다** — 훅의 `openCreateMemoForm`에 동기 마커를 넣으니 Create 클릭 후 `__pc11="from-hook"`이고 주입한 `scrollToMemoForm`이 **정확히 1회** 불렸다. 🔴 이 계측이 필요했던 이유: 브라우저 패널이 숨겨져 있으면 **rAF가 0회**라(실측) `scrollIntoView` 가로채기는 **거짓 음성**이 된다 — 스크롤은 rAF 안에 있어서 동기 마커로만 확인된다. **DB write 0**. **2,482 → 2,465줄(−17)**, useMemoEditSession 333 → 364(+31) |
| `8ac4a47` | **선택삭제 2함수 → `useMemoListData`(재-Audit 후보 ⑩) + 문서 정합성 정정.** `toggleMemoSelected`·`handleMemoTrashClick` 22줄을 **바이트 동일**로 옮겼다(diff 공집합). 🔴 **새 배선은 `askConfirm` 하나뿐** — 선택 state 3개·`refreshAfterMemoChange`는 이미 그 훅 것이다. **Dashboard의 직접 서버액션 호출이 `deleteMemo` 1건 줄어 import에서도 빠졌다**(완료조건 4번 7→6). 🔴 `askConfirm`은 Dashboard에서 **함수 선언**이라 호이스팅된다 — 훅 호출이 그 선언보다 **위**에 있어도 안전하다(참조만 넘기고 호출은 클릭 시점). 훅 호출 위치를 옮길 필요가 없었다. 부수효과 1건: 이동 후 `setMemoSelectionMode`·`setSelectedMemoIds`가 훅 밖 사용 0회가 돼 eslint 신규 warning 2건이 발생했다 — **그 파일의 기존 규칙대로 반환과 구조분해에서 뺐다**(값 2개는 렌더용으로 유지). 검증: confirm 문구·라벨 동일 · 9 mounts · **cancel 후 선택이 그대로 남는 계약 유지**(라벨 "선택한 메모 1개 삭제" · checkbox 체크 유지) · 메모 내용 문자 단위 불변 · 서버로그에 delete 흔적 0 · 콘솔 에러 0. 🔴 **양성 대조 먼저 했다** — 훅 안 confirm 문구에 `PC10-MARKER`를 넣으니 팝업에 그대로 나타났다(= 그 문구가 이제 훅에서 온다는 증거). 확인 후 복구. **DB write 0**(항상 취소). **2,504 → 2,482줄(−22)**, useMemoListData 341 → 375(+34) |
| `74b07e7` | **`confirmDialogNode` JSX → `presentational.tsx`의 `ConfirmDialog`(재-Audit 후보 ⑧).** 옮긴 JSX 25줄이 **바이트 동일**(diff 공집합). 새 파일 0 · 새 Context/registry 0 · ref 0 · CSS·className·DOM 계층 변경 0. **state(`confirmDialog`)와 `askConfirm`은 Dashboard KEEP** — 옮긴 것은 presentational JSX뿐이다. 🔴 **`confirmDialog && (...)` 가드를 Dashboard에 남겨 둔 것이 핵심이다** — 그래야 `confirmDialogNode` 값이 예전처럼 null이라 **사용처 전수가 바이트 동일**하다(`grep confirmDialogNode` 전후 diff **완전 공집합**). 🔴 **장부 정정: 사용처는 3곳이 아니라 7곳**이다(직접 렌더 4 · prop 전달 3 → 런타임 동시 마운트 **9개**). 검증: 확인팝업 outerHTML이 전후 **338자 · 해시 278698577로 문자 단위 동일**이고 9개 마운트 전부 같다. 🔴 **양성 대조 먼저 했다** — 컴포넌트 안에 `data-pc-marker`를 넣으니 **9개 전부**에 나타나고 해시가 갈렸다(= 빌드가 실제로 바뀌었고, 9개 모두 추출한 컴포넌트가 그린다는 증거). open/cancel/재진입 정상 · 핸들러 4개(overlay·panel stopPropagation·save·cancel) 전부 연결되고 save는 AsyncFunction · 콘솔 에러 0 · **DB write 0**(항상 취소로 닫았다). **2,527 → 2,504줄(−23)**, presentational 154 → 192(+38) |
| `5012001` | **카드용 파생 카운트 6개 → 각 feature 훅(재-Audit 후보 ⑨).** `incompleteTodoCount`·`dueTodayCount` → `useMemoListData` / `projectIdeaCount`·`projectDevCount`·`projectDraftCount`·`projectIdeaOnlyCount` → `useProjectWorkspace`. **계산식 6개 전부 바이트 동일**(diff 공집합). 🔴 **새 인자 0개** — 두 훅이 원본(`memosForMonthState`+`todayIso` / `projectIdeas`)을 이미 인자·state로 갖고 있어서 배선이 늘지 않았다. 새 파일·새 훅·state·ref·effect·util·`useMemo`·JSX·props·CSS 변경 **전부 0**, 반환 키만 +6. 실측 SAME 6 / DIFFERENT 0 (미완료 1 · 오늘마감 0 · 아이디어 11 · 9/1/1). 🔴 **양성 대조 먼저 했다** — 훅 안에서 `projectIdeaCount+100`을 주니 카드가 **111**로 바뀌어 훅이 화면의 실제 소스임을 확인한 뒤 되돌렸다(그래야 SAME 6이 stale 번들의 거짓 음성이 아니다). **2,533 → 2,527줄(−6)**, useMemoListData 332 → 341(+9) · useProjectWorkspace 326 → 334(+8) |
| `f137cc9` | **Idea Build JSX 3덩어리 → `idea-dialog.tsx`(재-Audit 후보 ③) + Audit 장부 정정.** 71줄 이동, 그중 **70줄 바이트 동일**(1줄은 낡아진 주석). 새 파일·새 훅·새 Context·로직 이동·CSS 변경 **전부 0**. 🔴 진짜 이득은 배선이다 — JSX 전용 값 11개를 rest로 빼내던 구조가 사라져 `const ideaDialogProps = useIdeaBuild(...)` 한 줄이 됐다. 전수 대조: 훅 반환 31키 불변 · SAME 28 · 빠진 3(옮긴 노드 자체) · 새로 온 11(옛 rest와 정확히 일치). props 31 → 39. DOM 2,240자 문자 단위 동일이고, **양성 대조로 두 빌드가 갈렸음을 먼저 확인했다**(마커가 Dashboard 청크 → idea-dialog 청크로 이동). **2,609 → 2,533줄(−76)**, idea-dialog 369 → 464(+95) |

🔴 **`f137cc9` 장부 재확인(2026-09-11)**: `git show --numstat`이 Dashboard **+15/−91 = 순 −76**이고 `wc -l` 2,533(=2,609−76)로 검산 일치 — **장부가 맞다.** 세션 종료 UI의 `+15/−20`은 커밋 내용이 아니다(추가분 15만 일치). **이 건으로 다시 전체 Audit 하지 마라.**

경위·수치는 git 로그에 있다. 여기 옮겨 적지 마라. (2026-09-11에 `650f5e5`·`3e6fd43`·`3d12089`·`8ec059a`·`7acbfb4`·`2f1517a` 행을 걷었다 —
둘 다 종료됐고 그 계약은 5절과 `ordering.check.ts`가 지킨다.)
(2026-09-10에 운영 규칙 6·8에 맞춰 오래된 22행을 걷었다: `a1d4ad8` · `f8a69cf` · `a59f602` · `76e7b8e` · `b8668aa` · `3f999da` · (검증) · `454a362` · (조사) · `50cdf8e` · `e805191` · `8fe11c0` · `f2962aa` · (조사) · (조사) · (문서) · `00f7756` · `7973e3e` · **`52b42b2`**(`2584097`이 되돌린 건이라 그 행에 경위가 남아 있다) · **`1458df9`·`e479bb9`**(경계 설명은 4-1·4-2-1절) · **`2584097`·`ba78b0c`**(계약은 5절과 Monthly MEMO Feature에 있다). 전부 종료된 건이고 `git log`에 있다. Projects·Briefing 등의 **살아 있는 경계 설명은 4-2·4-2-1절에 그대로 있다** — 거기서 읽어라. 새 행을 넣을 때 오래된 행을 같이 걷어라.)

# 3. OPEN

아직 해결되지 않은 것만. 해결되면 **행을 지우고, 그 식별자는 다시 쓰지 않는다.**

> 🔴 **식별자는 안정적이다 — 재번호·재사용 금지.** 코드 주석·commit·`docs/incidents.md`가
> 같은 이름을 참조한다. 항목이 닫혀도 남은 것들의 이름을 당기지 마라.
> (2026-09-09에 숫자 번호를 이 방식으로 바꿨다. 예전 코드 주석의 **"OPEN 6"은
> 아래 `OPEN-MEMO-KB-MINHEIGHT`**, "OPEN 3"은 `OPEN-VIEWPORT-DEBUG`를 가리킨다.)

- ~~**`OPEN-LINT-DASHBOARD-UNVALIDATED`**~~ ✅ **해결** — ① 이후 Dashboard에서 React Compiler react-hooks 검증이 멈췄던 건.
  🔴 **CLOSED (2026-09-11, `be27f8c`).** 원인은 **hoisted forward reference** 하나였다 —
  `cycleMemoStar`가 자기보다 **아래**에 선언된 `handleTogglePin`을 부르고 있었고, ①이 배선을 바꾸면서
  그 참조가 컴파일러의 `PruneHoistedContexts` 패스에 걸렸다. 컴파일러가 낸 진단은
  `Todo: [PruneHoistedContexts] Rewrite hoisted function references`이고, 기본값이
  `panicThreshold: 'none'`이라 **그 함수(=Dashboard 전체) 분석을 조용히 건너뛴다** → 진단 0건.
  **수정은 두 함수 선언 순서를 바꾼 것뿐이다**(둘 다 함수 선언이라 호이스팅되어 런타임 동일 · DOM 해시 동일).
  🔴 **진단 확보 방법을 남긴다**: 기본 설정에는 `react-hooks/todo`가 꺼져 있다. bailout을 보려면
  `npx eslint --rule '{"react-hooks/todo":2}' --format json src/app/Dashboard.tsx` 로 켜서 읽어라
  (config 파일은 건드리지 말 것 — 이번에도 안 건드렸다).
  🔴 **지난 세션의 "2건은 구조 변경으로 정상 소멸" 판정은 틀렸다.** 검증이 살아나자 그 2건
  (`memoEditForm(detailEditorRef,…)` · `memoEditForm(bigEditorHandleRef,…)`)도 **그대로 돌아왔다** —
  고쳐진 게 아니라 같이 숨어 있었던 것이다. 사라진 7건은 전부 bailout 때문이었다.
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
2026-09-11에 그중 ③(71줄)을 뺐고 **600줄 남았다.**
C 등급 8개(아래 문단)는 여전히 후보가 아니다 — 줄 수를 줄이려고 그것들을 억지로 손대지 마라.

**옛 C 등급 8개 중 지금도 후보가 아닌 것**(억지로 넣지 마라): bodyEditor 다리 ·
포스트잇 오케스트레이션 · 모바일 시트/`activeMemoEditorRef` · dialog 레지스트리 ·
`confirmDialog` · `pendingInsert` · Key Notes(가능하지만 −20줄이라 이득 없음).
**`patchMemoInLists`는 경계가 더 좋아지지 않으므로 Dashboard bridge로 그대로 인정한다.**
근거 수치는 4-1-1절 표에 있다.

🔴 **"선택→메모 저장은 에디터 ref 4개를 가로질러 ref injection이 필요하다"는 옛 C 판정은
틀렸다 — 2026-09-09에 `e479bb9`로 추출 완료했다.** ref 4개를 고르는 것은
`activeMemoEditorRef`+`insertPendingAtCursor`(**pendingInsert** 클러스터)이고, 선택 클러스터는
`setPendingInsert` 하나만 부른다. 실측: 비-JSX 외부 참조 **0** · dialog registry 접촉 **0** ·
에디터 ref 접촉 **0** · 의존성 5. 두 클러스터가 한 덩어리로 묶여 같이 탈락했던 것이다.
**다시 합치지 마라** — 그 경계가 이 훅이 성립하는 유일한 이유다.

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

**남은 것은 전부 "feature 전용 JSX 조립"이다.** feature 로직(state·effect·CRUD·파생)은 이미
훅 11개가 갖고 있고, Dashboard에 남은 로직 851줄은 대부분 4-1-1 KEEP이다. 아래는 **KEEP 밖**
후보만이고, prop 수는 AST로 실측했다(블록 안에서 쓰는데 블록 밖에서 선언된 식별자, 루프 지역변수 제외).

🔴 **line number는 추출할 때마다 밀린다 — 절대값으로 믿지 말고 이름으로 다시 찾아라.**
아래 위치는 **2,533줄 시점(③ 추출 후)** 기준이라 ⑨·⑧·⑩·⑪·②·①·⑥ 이후 **이미 밀려 있다**(현재 2,264줄). 이름으로 찾아라.

| 후보 | 기능 | 위치 | 줄(주석포함) | props | 목적지 | 등급 | 선행조건 |
|---|---|---|---:|---:|---|---|---|
| ~~③ Idea Build JSX 3덩어리~~ | Idea | — | ~~71~~ | ~~12~~ | `idea-dialog.tsx` | **✅ 2026-09-11 완료** | — |
| ~~⑨ 카드용 파생 카운트 6개~~ | Memo·Project | — | ~~13~~ | ~~3~~ | 각 훅 | **✅ 2026-09-11 완료** | — |
| ~~⑧ `confirmDialogNode` JSX~~ | 공통 | — | ~~27~~ | ~~2~~ | `presentational.tsx` | **✅ 2026-09-11 완료** | — |
| ~~② 프로젝트 상세/편집 JSX~~ | Project | — | ~~121~~ | ~~39~~ | `project-detail-dialog.tsx`(기존) | **✅ 2026-09-11 완료** | — |
| ~~① 메모 편집 폼 JSX~~ | Memo | — | ~~153~~ | ~~8/24/26~~ | `memo-edit-form.tsx` | **✅ 2026-09-11 완료** | — |
| ~~⑥ 모바일 메모 옵션 시트~~ | Memo | — | ~~35~~ | ~~12~~ | `memo-edit-form.tsx` | **✅ 2026-09-11 완료** | — |
| ~~⑤ "메모로 저장" JSX~~ | Memo | — | ~~57~~(이동 27) | ~~2/4/5/4~~ | `big-editor.tsx` | **✅ 2026-09-11 부분완료** | — |
| ④ `postitViewNode` | Memo | 1792–1885 | 94 | 24 | `postit-view.tsx`(신규) | B | ①⑥ |
| ⑦ 편집 페이지 래퍼 3종 | Memo | 1764–1791·1950–1963 | 42 | 17 | ①·⑤와 같은 파일 | C→B | ①⑤ |
| ~~⑩ 선택삭제 2함수~~ | Memo | — | ~~24~~ | — | `useMemoListData` | **✅ 2026-09-11 완료** | — |
| ~~⑪ `openCreateMemoForm`~~ | Memo | — | ~~17~~ | — | `useMemoEditSession` | **✅ 2026-09-11 완료** | — |

**남은 A/B 합계 = 153줄**(210 − ⑤ candidate 57)。후보행 합은 ④ 94 + ⑦ 42 = **136**이라 **residual 17**이다(직전 11 + ⑤에서 생긴 6 = Audit 63 vs 실측 57). 🔴 숫자를 억지로 맞추지 마라 — ⑦ 완료 시점에 국소 확인한다.
🔴 **2026-09-11 장부 정정 3건** — 직전 보고의 숫자가 틀렸다:
① 총합이 2,610으로 나온 것은 위 `split` 버그다(빈줄 57 → **56**).
② 후보 합계 "689줄"은 ⑤(1960–2036)가 ⑦(2029–2036)을 **삼켜 8줄 중복 계산**한 값이었다.
   범위를 ⑤=1960–2022 / ⑦=1837–1864+2023–2036으로 갈라 재니 **중복 0 · unique 671줄**이고,
   거기서 ③ 71줄이 빠져 지금 **600줄**이다.
③ "feature implementation ≈ 481줄"과 "689줄"은 **단위가 달랐다** — 앞은 코드만 눈대중, 뒤는
   주석 포함 물리줄. 실측하면 감사 시점 671줄 = **코드 549 + 주석 120 + 빈줄 2**다.

호출부·import가 +55줄쯤 돌아오므로 순감 **≈ −464 → 약 2,001줄**. 🔴 **목표가 아니라 거리 표시다.**

**얇은 shell 완료 조건(구조 기준 · 정량 판정 가능)** — 줄 수 기준을 만들지 않는다:
1. Dashboard의 **JSX 비율 < 15%**이고, 남은 JSX는 `<Component …/>` 조립·`<dialog>` 껍데기뿐이다
   (feature 마크업 = `<div className="big-title-row">`류 0개).
2. feature 전용 **`useState`가 0개**다(현재 남은 것 중 `keynoteFullView`·`keynotesOpenSeq`·
   `postitExpanded` 등이 여기 걸린다 — 화면 전환 플래그 4종과 `confirmDialog`는 예외로 인정).
3. feature 전용 **effect 0개**(전체화면 layout/theme/배경복사 4종은 KEEP 예외).
4. 서버 액션 직접 호출이 **0곳**(현재 `updateMemo`·`createMemo`·`deleteMemo`·`toggleImportant`·
   `setMemoPinned`·`recordMemoSource`·`getMemosForMonthAction` 7개가 남아 있다).
5. 남는 것: 훅 호출 · Component 조립 · dialog registry · cross-feature bridge · guardLogin.

⚠️ **①은 tiptap 편집 폼이라 이 목록에서 가장 위험하다** — 지뢰표 "편집 스크롤러 리렌더 → blur",
"같은 ref를 여러 벌이 공유하면 마지막 사본이 이긴다", "폼은 한 벌"이 전부 이 블록에 걸려 있다.
③·⑨·⑧·⑩·⑪(완료) 다음은 **②**다(아래). ①은 마지막이다.

🔴 **선행조건 표기 정정(2026-09-11)**: ②와 ① 모두 **선행조건 자체는 없다.** 다만 ①은 Tiptap·ref·모바일 편집 계약이 한꺼번에 걸린 **가장 위험한 후보**라 뒤로 미루고 ②를 먼저 했다. ④⑤⑥⑦은 **①을 선행조건으로** 가진다. (옛 "선행조건이 없는 것은 ② 하나뿐"은 틀린 문장이라 폐기했다.)

🔴 **다음 1건 추천: ⑦ 편집 페이지 wrapper 3종**(42줄 · props 17). 선행조건 ①+⑤가 이번에 충족됐다. ④(`postitViewNode` 94줄 · props 24)보다 작고, 무엇보다 **⑤에서 방금 같은 종류를 해봤다** — `bigEditorNode`/`bigEditorPageNode`가 바로 그 wrapper 계열이라 남은 3종도 같은 패턴(껍데기만 컴포넌트로, 조건식과 마운트는 Dashboard)으로 간다. 🔴 착수 시: ⑦의 wrapper들이 `mobileEditPageNode`·`composePageNode`처럼 **`memoEditForm`/`memoHeadActions` 호출을 품고 있는지** 먼저 보고, 품고 있으면 ⑤와 똑같이 **그 호출은 Dashboard에 남기고 껍데기만** 옮겨라. 그 다음이 ④다. 🔴 **residual 11**(remaining unique 210 − 후보행 합 199)은 아직 실체 미확인이다 — 남은 후보가 ④·⑦ 둘뿐이 되는 ⑦ 완료 시점에 국소 확인하면 되고, 지금 전체 Audit으로 맞추려 하지 마라.

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

**마지막 정적 검사** (tsc 0 · `npm run check` exit 0).
🔴 **신뢰 가능한 canonical baseline = `e26 w8`**(파일 40, 2026-09-11 검증 복구 후 확정).
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

**2026-09-10 세션 ⑥ 검증** — `2f1517a` 3건(OFF→ON 옛 자리 · 새 Pin 맨 앞 · Notion 금지) 전부
양성·음성 대조까지 확인했고 **사용자 실기기(Web·Mobile) 통과로 닫혔다**. 테스트 메모 2건은 원복해
세션 시작 시점 목록과 완전히 동일하다(사용자 메모 write 0). 수치는 그 커밋 메시지에 있다.
🔴 **남길 교훈 둘**: ① 재현 조건은 "그 세션에서 드래그를 했나"다 — 드래그 없이 재고 닫으면 **거짓 음성**이다.
② **브라우저 패널이 숨겨져 있으면 `requestAnimationFrame`이 3초에 0회다**(실측). 프레임·애니메이션·
스크롤 체감을 그 상태에서 "재현 안 됨"으로 쓰지 마라.

**2026-09-11 세션 ⑧ — 후보 ③ Idea Build JSX 추출 (Notion write 0)**
- **DOM 무변화 증명**: Idea Build를 연 직후의 `<dialog>` outerHTML을 정규화해 비교 —
  **2,240자 문자 단위 동일**(`identical: true`).
  🔴 **양성 대조로 빌드가 실제로 갈렸는지 먼저 확인했다**(지뢰표 "해시 동일 = 같은 빌드 두 번"):
  마커 `idea-mode-chip-random`이 대조군에서는 `src_app_Dashboard_tsx_*.js`에 있고
  수정 후에는 `src_components_dashboard_*.js`(= `ai-direction-modal`을 가진 청크)에 있다.
- **동작 8경로 실측**(로컬 1280×900): 다이얼로그 오픈 · 랜덤(active+pulse+안내문구) ·
  프로젝트 선택 팝업(11행) · 검색 필터 11→3→11 · 선택 확정(칩·카드 제목·상태 배지) ·
  팝업 닫힘 · ✕ 닫기 · 재진입 시 선택 유지. **콘솔 에러 0.**
- **배선 전수 대조**: 훅 반환 31키 불변 · SAME 28 · 빠진 값 3(옮긴 JSX 노드 자체) ·
  새로 들어온 값 11(= 옛 rest 11개와 정확히 일치, **11/11 도달**). props 31 → 39.
- ⚠️ **"완료 상태 프로젝트 제외"는 양성 대조를 못 만들었다** — 운영 데이터에 `완료` 프로젝트가
  0건이라 11/11이 그대로 나온다. 그 필터는 `useIdeaBuild`에 있고 이번에 안 건드렸다.
- ⚠️ **Idea ON(생성)·저장 3경로는 일부러 안 눌렀다** — 운영 DB 쓰기이고 하루 횟수를 소모한다.
  결과 화면(`ideaDisplay`)·History·재생성 버튼은 **미검증**이다. 모바일/PWA도 미검증.

**2026-09-10 세션 ⑦ — Dashboard 재-Audit (AUDIT ONLY · 코드 변경 0 · Notion write 0)**
- 구성 실측(TypeScript 파서로 JSX 노드 범위 · 주석 블록 분리): 2,609줄 =
  로직 851 / JSX 774 / 주석 928 / 빈줄 56. 최상위 선언 147개.
- KEEP 7개 **전부 재확인**(판정 변경 0). KEEP 밖 후보 **JSX 9덩어리 + 함수 2개 = 671줄**(중복 0)을
  prop 실측과 함께 4-1-2절에 표로 남겼다. **추출은 하지 않았다 — 다음 라운드에 1개씩.**

**2026-09-10 세션 ⑤ 검증** — `8ec059a` 5건(첫 방문 blank · 새 메모 드래그 · OFF→ON · 드래그 잠금 ·
Create 유리) 전부 음성 대조까지 확인했고 **실기기 통과로 닫혔다**. 상세 수치는 그 커밋 메시지에 있다.
🔴 남길 것 둘: ① **드래그를 합성할 때는 대상을 먼저 `scrollIntoView` 해라** — 뷰포트 밖이면
`elementFromPoint`가 null이라 "안 움직인다"가 거짓 양성이 된다. ② **eslint baseline은 canonical 범위 기준 e26 w8**이고(위 6절),
절대 수치를 믿지 말고 `git stash`로 HEAD를 **같은 명령으로** 재서 차집합을 봐라.

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
