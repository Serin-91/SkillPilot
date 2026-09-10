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

- **기준 HEAD**: master, **푸시 완료**. 둘을 구분해서 읽어라 —
  **저장소 HEAD = 이 문서를 갱신한 docs 커밋**(코드 변경 0) /
  **마지막 기능 코드 = `3e6fd43`**(정렬 상태전이 + 날짜순서 쓰기 경계).
  (`git log --oneline -5`로 확인해라. 이 줄이 실제 HEAD와 어긋나면 **이 파일이 갱신 안 된 것**이다.)
  🔴 그 전까지 **Memo 1·2단계부터 6개 커밋이 미푸시 상태였다**(배포본이 `8cebbe7`에 머물러 있었다).
  **실기기 신고를 받으면 `git log origin/master..master`로 배포 여부부터 확인해라** — 내 수정이
  사용자 화면에 아예 없을 수 있다(`CLAUDE.md` 7절 0번이 같은 얘기를 한다).
- **🎉 Memo 정렬 작업은 코드 쪽이 끝났다**(2026-09-10). `bfe3318` 제목 깜빡임 · `2584097` Key Notes
  수동 순서 복구 · `ba78b0c` Monthly 날짜별 순서 + 동률 확정 · `3e6fd43` 상태전이/쓰기 경계 마감.
  **Pin 수동 순서는 세션 내내 전/후 동일**(pinned [0-9] · priority [0-10])이고 사용자 메모 write 0이다.
  🔴 **정렬 규칙의 정본은 `src/lib/memo/ordering.ts`(순수 함수 3개)이고 `ordering.check.ts`가
  `npm run check`에서 계약 9가지를 지킨다 — 정렬을 건드리기 전에 거기부터 읽어라.**
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
  ⚠️ 날짜를 바꾸면 그 날짜의 순서를 **fetch로 가져오는 짧은 창** 동안 기본 순서가 보인다
  (`dayOrder.day !== memoDialogDateIso`면 빈 맵으로 본다 — 옛 날짜 순서가 새 날짜에 잘못
  적용되는 것을 막는 장치다). **그 창에서 읽고 "순서가 틀렸다"고 판정하지 마라 — 실제로 한 번
  헛짚었다.** 순서를 잴 거면 1.5초쯤 두고 재라.
- **Monthly 순서 저장은 원자적이다** — `reorderMemosForDay`가 단일 `upsert(rows)`(INSERT … ON
  CONFLICT 한 문장, 요청 1회)라 부분 쓰기가 없다. 🔴 **여기를 개별 update 루프로 바꾸지 마라.**
  🟡 대조: Key Notes `reorderPinnedMemos`는 `Promise.all`로 **N개 개별 UPDATE**라 부분 쓰기가
  가능하다(호출부도 `void`라 롤백이 없다). 이번 범위 밖이라 그대로 뒀다 — 남은 위험으로 안다.
- **실측**: `Dashboard.tsx` **2,582줄** · `dashboard.css` 10,993줄 · 훅 10개
  (`useProjectWorkspace` 326 · `useMemoEditSession` 326 · `useSelectionToMemo` 255 ·
  `useMemoListData` 285 · `useMyPageSession` 215 · `useIdeaBuild` 186 ·
  `useNewsTrendFeed` 127 · `useJobsFeed` 105 · `useTodaysFocus` 73 · `useMindsetBar` 63)
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
  **추가 모듈화는 여기서 중단한다**(4-1-1절 KEEP 표). 하한 2,100~2,300은 3,347줄 시점 Audit의
  참고 추정이며 착수 기준이 아니다.
- **모바일 Memo 본문 14px은 재현되지 않았다**(2026-09-09, 코드 변경 0) — 본문 크기는 전부
  `var(--memo-base-font)`(모바일 16px) 하나를 쓰고 320/375/430에서 동일했다. **열린 작업 아님.**
- **✅ 2026-09-09 실기기 검증 완료 (사용자 확인).** Memo 소유권 1·2단계 · My Page 추출 ·
  Idea Build 추출 · 마이페이지 닉네임 칸 — **전부 정상.**
  🟡 **`a59f602`(Today's Focus)와 `f8a69cf`(Projects)가 실기기 미확인이다.** `b8668aa`·`76e7b8e`는 확인 완료.
    앞의 것은 `3f999da` 후속 — 발견된 2건 모두 **회귀가 아니라 기존 버그**였다.
    (그 커밋 diff에 `scroll` 0회 · `onOpen` 본문 글자 동일 · `setTrendHistoryDate(null)`이
    onOpen에 들어간 적 없음.) 나머지 Briefing 경로는 실기기 정상 확인 완료.
- **blocker**: 없음. **Memo 3단계는 계획돼 있지 않다** — 새 지시 없이 시작하지 마라.

누적: `Dashboard.tsx` 4,309(Memo 착수) → … → 3,551 → 3,347(Projects)
→ 2,970(카드+헤더) → 2,740(선택→메모) → **2,578줄**(Monthly 다이얼로그).
**Memo 착수 시점 대비 −1,731줄(−40.2%).** 훅 10개 1,906줄 + 분리 컴포넌트 5개 999줄.

# 2. JUST DONE

| 커밋 | 내용 |
|---|---|
| `3e6fd43` | **정렬 상태전이 마감 + 날짜순서 쓰기 경계.** ① `toggleImportant`이 중요 해제 시 `pin_order`를 남겨 **다시 ★를 켤 때 옛 수동 순서가 부활**했다 → 해제 분기에서 같이 비운다(`setMemoPinned`는 원래 그렇게 하고 있었다). ② 🔴 **형제 구멍**: 저장 payload 셋이 `is_important`만 담고 `is_pinned`/`pin_order`는 안 담아, `updateMemo`로 중요를 끄면 Pin이 켜진 채 남을 수 있었다 → `updateMemo`에 의존 필드 정규화를 넣어 한 곳에서 막는다(`status = null`과 같은 자리). ③ **검색/유형 필터 중 드래그 차단** — 그때 목록이 그 날짜의 일부라 드롭하면 보이는 것만 0..k-1로 재매겨져 숨은 메모의 `sort_order`와 겹친다. ④ 마이그레이션 RLS `with check`가 `user_id`만 봐서 **남의 memo_id로 내 순서 행을 만들 수** 있었다 → memo 소유까지 확인(`memo_source` 패턴). 전이 4종 실측 확인 |
| `ba78b0c` | **Monthly 하단 목록 날짜별 drag 순서 + 동률 확정.** ① `getMemosForMonth/Range/Date`가 `start_date` 하나로만 정렬해 같은 날짜 순서가 조회마다 바뀌던 것(`OPEN-MONTHLY-TIE-ORDER`)을 `created_at DESC → id`로 확정했다. **`getImportantMemos`는 안 건드렸다** — Pin이 pinned_at·start_date tie-break에 의존한다. ② 하단 목록에 날짜별 수동 순서를 넣었다. 🔴 **memo 컬럼 하나로는 불가능하다** — 기간 메모가 여러 날짜 목록에 동시에 뜨므로(실측 확인) 9/10 순서가 9/11을 바꾼다. `memo_day_order(user_id, day, memo_id)` 신설(`day21_migration.sql`). 🔴 Key Notes `pin_order`와 완전 독립 · 달력/chip은 drag 배선 **0개** · 드래그는 기존 `useHoldDrag` 재사용(새 라이브러리 0) · 목록을 `key={dayOrderKey}`로 감싸 날짜 독립성 보장. 저장 실패 시 알림 + 이전 순서 복구(그 복구가 안 되던 버그를 실측으로 잡아 같이 고쳤다) |
| `2584097` | **Key Notes 일반 중요 메모 수동 순서 복구.** `52b42b2`가 날짜 최신순으로 **무조건** 정렬해 드래그가 재진입마다 되돌아갔다. Audit 결과 이 그룹의 드래그는 원래부터 `reorderPinnedMemos(ids, false)` → `memo.pin_order`에 저장되고 있었고(`.eq("is_pinned", …)`로 Pin과 서로 안 덮는다), **운영 DB 실측에서 11건 전부 pin_order 0~10이 채워져 있었다** — 실제 사용자 데이터를 화면에서 덮고 있었던 것이다. 이제 **수동 순서 우선 · 없을 때만 날짜 최신순**이다. 규칙은 `ordering.ts`로 빼고 `ordering.check.ts`를 `npm run check`에 물렸다 |
| `52b42b2` | **Key Notes — 일반 중요 메모 날짜 최신순 + 중요 메모 전체보기.** 정렬 키는 추측하지 않고 **화면이 찍는 값**을 따랐다: Key Notes 카드가 `{memo_type} · {start_date}`를 그리고 먼슬리 목록도 `start_date ~ end_date`라 **`start_date`가 이 앱의 "메모 날짜"**다(동률은 `created_at` 최신순). 🔴 **Pin은 안 건드렸다** — `pinnedMemos`는 기존 filter 한 줄 그대로고 정렬은 `!is_pinned` 배열에만 걸었다. `git stash` 대조로 **Pin 10건 전/후 동일**, 일반 중요 11건은 08-10/08-05/08-15/… → **09-09→08-05 단조 감소**로 바뀌었다. 전체보기는 고정 쪽과 **같은 장치**를 공유한다(같은 `← Key Notes`, 같은 `.keynote-pinned-grid`, 같은 `KeynoteCardList`) — **새 CSS 0**. 상태는 boolean → `"pinned" \| "priority" \| null` 하나로(둘 다 true인 상태를 없애려고). DB column·migration **0** |
| `bfe3318` | **모바일 Monthly 메모 제목 깜빡임 — 기존 버그(회귀 아님).** 자동 제목(메모1·메모2…) 메모를 열었다 나오면 제목만 **2,023ms** 사라졌다 돌아왔다. 원인은 타이밍이 아니라 **계약 불일치**: 낙관적 `patchLocalMemo`가 `title: ""`를 목록에 써 넣는데 서버는 빈 title을 버려서(actions/memo.ts:99) refresh가 와야 진짜 제목이 돌아왔다. **모바일 전용이었던 이유는 `openPostitView`가 모바일에서만 바로 편집으로 들어가서**(Dashboard:603-606) ‹가 항상 저장 분기를 타기 때문이다 — 데스크톱은 읽기 전용 보기라 그 분기를 안 탄다. 낙관적 패치는 `bf75c14`(2026-08-26)에서 들어왔고 `f2962aa`보다 앞선다. 수정은 호출부가 아니라 **공유 지점 `patchLocalMemo` 한 곳**(handlePostitBack·handleMemoDialogBack 동시 해결) + `handleSaveMemo`의 오버레이 병합 한 줄. 자동저장 경로는 **이미 같은 가드를 갖고 있었다**(:222). 실측 5회 반복 0건 |
| `1458df9` | **Fast Track ④ — Monthly MEMO 다이얼로그 본문 분리.** `.dialog-inner` 203줄을 `monthly-memo-dialog.tsx`(286줄)로. Dashboard 2,740→2,578(−162). props **62개를 명시적으로** 넘긴다(전수 대조 SAME 62 · DIFFERENT 0) — Context·giant object·reducer 만들지 않았다(사용자 지시). 타입은 두 훅 반환에서 `Pick`으로 파생. 🔴 `<dialog>`와 형제 노드 넷(postitViewNode·bigEditorNode·모바일 시트·confirmDialogNode)은 **마운트 위치가 곧 계약**이라 Dashboard 잔류 |
| `e479bb9` | **Fast Track ③ — 선택→메모 저장 추출.** state 3·ref 1·함수 12·effect 1을 `useSelectionToMemo`(255줄)로, 오버레이 JSX 80줄을 `selection-overlays.tsx`로. Dashboard 2,970→2,740(−230). **의존성 5 · 반환 키 14 · 비-JSX 외부 참조 0.** 🔴 옛 C 판정("ref injection 필요")은 오분류였다 — ref 4개를 고르는 건 `activeMemoEditorRef`+`insertPendingAtCursor`고 여기는 `setPendingInsert` 하나만 부른다. **두 클러스터를 다시 합치지 마라** |

경위·수치는 git 로그와 Notion Decision Log에 있다. 여기 옮겨 적지 마라.
(2026-09-10에 운영 규칙 6·8에 맞춰 오래된 17행을 걷었다: `a1d4ad8` · `f8a69cf` · `a59f602` · `76e7b8e` · `b8668aa` · `3f999da` · (검증) · `454a362` · (조사) · `50cdf8e` · `e805191` · `8fe11c0` · `f2962aa` · (조사) · (조사) · (문서) · `00f7756` · `7973e3e`. 전부 종료된 건이고 `git log`에 있다. Projects·Briefing 등의 **살아 있는 경계 설명은 4-2·4-2-1절에 그대로 있다** — 거기서 읽어라. 새 행을 넣을 때 오래된 행을 같이 걷어라.)

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
| 5 | Today's Focus | A | ✅ `a59f602` (훅 40줄. `openFocusMemo`는 **콜백 주입이 아니라 Dashboard 유지**) |
| **6** | **Projects** | B | ✅ `f8a69cf` — 재측정 결과 **비-JSX 밖 참조 3개**(옛 "27"은 JSX 포함 값) |
| 7 | 카드 7개 + 헤더 (JSX) | A | ✅ `615cdf4` — Component만, 소유권 이동 0 |
| 8 | 선택→메모 저장 | A | ✅ `e479bb9` — 옛 C 판정이 **오분류**였다(비-JSX 참조 0) |
| 9 | Monthly MEMO 다이얼로그 (JSX) | B | ✅ `1458df9` — Component만, props 62 명시(SAME 62 · DIFF 0) |

**🎉 훅 후보 6개 + JSX 축 4단계 완료. 새 후보는 없다.** C 등급 8개는 아래 문단대로 후보가 아니다 —
줄 수를 더 줄이려고 억지로 손대지 마라. 새 지시가 있을 때만 재평가한다.

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

- **JSX는 Dashboard가 소유한다.** 훅은 `.ts`이고 JSX를 담지 않는다 — JSX 덩어리가 쓰는 값을
  훅이 반환하는 쪽으로 푼다(`.tsx`로 바꾸지 마라). Idea Build가 이 경계의 기준 사례다.
- **dialog에 안 가는 값은 spread에서 빼라** — rest 분해로 갈라낸다(`openMyPage`, Idea의 JSX 전용 11개).
- **훅 호출 위치로 훅 호출 순서를 보존한다.** 위치를 옮겨야 하면 그 위에서 쓰는 코드가 0인지 먼저 재라.
- **옮긴 본문은 바이트 단위로 diff해서 rename 0을 증명한다.**

## 4-1-1. 🛑 여기서 멈춘다 — 절대 분리하지 않을 KEEP 영역

**현재 2,578줄 실측**(Fast Track 후 재측정): JSX **829(32.1%)** · 로직 **897(34.8%)** ·
주석 **796(30.9%)** · 빈줄 57. Fast Track 전 3,347줄 시점의 A/B/C 분해로는
bridge/orchestration 1,107 · JSX 조립 1,369 · **순수 feature logic 309**였고, 이번에 빠져나간
것은 대부분 그 중 "JSX 조립" 몫이다.

🟡 **2,100~2,300줄이라는 하한은 3,347줄 시점 Audit의 참고 추정이지 재실측한 확정값이 아니다.**
새 작업 착수 기준으로 쓰지 마라. 다만 **아래 표의 영역을 깨지 않고서는 크게 더 줄지 않는다**는
방향은 유효하다.

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
  🔴 **①을 클라이언트에서 다시 정렬하지 마라** — 정렬 규칙이 두 벌이 되고 한쪽만 바뀐다.
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

**마지막 정적 검사** (`3e6fd43` 기준 · tsc 0 · `npm run check` exit 0 · eslint e25 w8 = baseline, 신규 0)

**2026-09-10 마이그레이션 적용 후 확인 (사용자가 SQL Editor에서 실행 · 코드 변경 0)**
- `memo_day_order` 생성 확인(컬럼 5개). 사용자가 실제로 드래그한 순서가 운영 DB에 들어와 있다 —
  09-02 6건 `sort_order 0~5` · 09-10 3건 `0~2`, **날짜별로 연속·중복 0**.
- 화면 대조: 09-10 `버그잡기 → 메모색상? → 피곤해...`가 **저장값과 정확히 일치**(새로고침 후에도).
  09-02 6건도 저장 순서 그대로. 👉 **저장·재진입 유지가 실데이터로 확인됐다.**
- 🔴 **날짜 독립성 실증**: 기간 메모 `버그잡기`(09-10~09-15)가 **09-10에만** 순서 행을 갖고
  09-11 목록에서는 기본 순서로 나온다.
- ⚠️ **내 계측 실수 하나**: 날짜를 옮기자마자(≈1.3초) 읽어서 09-02가 "저장 순서와 다르다"고
  한 번 잘못 판정했다. 그 창은 **fetch 전이라 일부러 빈 맵을 쓰는 구간**이다(옛 날짜 순서가
  새 날짜에 새는 것을 막는 장치). 다시 재니 300ms~5초 전 구간에서 저장값과 일치했다.

**2026-09-10 세션 ③ — 정렬 마감 감사/검증 (로컬 · 사용자 메모 write 0 · 테스트 메모 4건 전량 삭제)**
- **상태 전이 4종 실측**: 일반 중요(pin_order=5) → 정상 저장 → **pin_order 유지**(가드는 해제에만 건다) /
  Pin → 중요 해제 → important·pinned·pinned_at·pin_order **전부 null** / 재승격 → pin_order null 유지 +
  Key Notes 날짜 기본 블록 **맨 뒤**(12/12) / **Pin만 해제 → 중요 유지 + pin_order null**
  (옛 Pin 순서가 일반 중요 그룹으로 새지 않는다).
- **필터 게이트는 대조군을 양쪽에 두고 쟀다**: 필터 없음 승격 O → 검색 중 승격 X → 해제 후 승격 O.
  ⚠️ 처음엔 hold를 700ms만 줘서 **양쪽 다 승격 0**이 나왔다 — 브라우저 패널이 가려지면 타이머가
  throttle돼 320ms 홀드가 안 익는다. **대조군 없이 "승격 0"을 게이트 근거로 쓰면 거짓 양성이다.**
- **Monthly 저장 경로**: `reorderMemosForDay`는 단일 `upsert(rows)` = INSERT … ON CONFLICT 한 문장,
  요청 1회 → **부분 쓰기 없음**. 마이그레이션 전이라 저장은 실패하는데, 그때 **알림 + 이전 순서 복구**를
  확인했고 테이블이 없으므로 DB에 쓰인 것도 0이다.
- **기본 정렬 결정성**: 09-06의 4건이 `created_at DESC` 예측과 일치하고 **새로고침 5회 전부 동일**
  (매 라운드 ISO가 2026-09-06인지 확인하고 비교했다).
  ⚠️ 처음엔 월 이동 왕복으로 재려다 `navigatingRef` 가드에 클릭이 먹혀 **다른 날짜를 비교**하고 있었다.
- 제목 flicker 5회 재확인 공백 0 · 달력 `.cal-cell`/`.memo-chip` drag 배선 0 ·
  빠른 스와이프 승격 0·탭 0(세로 스크롤 보존).

**2026-09-10 세션 ② 검증 (정렬 3건 · 로컬 · 사용자 메모 write 0)**
- **Key Notes 수동 순서**: 화면 순서가 운영 DB `pin_order` 0~10과 **정확히 일치**.
  합성 hold-drag로 승격·재배열까지 확인했고 `pointercancel`로 끝내 **서버 저장은 일부러 안 태웠다**
  (실측 재확인: pin_order 값 전부 그대로). 새 중요 메모(pin_order null)는 수동 블록 **뒤에**
  날짜순으로 붙는 것을 실제로 확인했다(ZZTEST_A가 12번째).
- **동률 순서**: 09-01의 메모1·메모3을 월 이동으로 **5회 재조회 — 5/5 동일**(전에는 뒤바뀌었다).
  예측(`created_at DESC`)과도 일치.
- **Monthly 드래그**: 기본 정렬 A B C D(= created_at DESC 예측과 일치) → C를 맨 위로 →
  즉시 C A B D. 저장 실패 시 **알림 + 이전 순서 복구**. 빠른 스와이프(320ms 전 80px)는
  승격 0 · 탭 0 → **세로 스크롤 보존**. 선택 모드에서는 꾹 눌러도 승격 0. 별 토글 정상.
- **경계**: 달력 `.cal-cell`·`.memo-chip`의 drag 배선 **0개**. 기간 메모(09-04~09-05)가
  두 날짜 하단 목록에 모두 표시되는 것을 확인 — 날짜별 테이블이 필요한 이유의 실측 근거다.
- **제목 flicker(`bfe3318`) 재확인**: 5회 반복 — 공백 0 · 제목 mutation 0.
- **테스트 데이터**: 테스트 메모 5건만 만들어 쓰고 **전량 삭제**(잔존 0).
  사용자 메모는 최신 `updated_at`이 전부 09-09 이전 = **이번 세션 write 0**.

**2026-09-09/10 세션 ① 검증 (로컬 · 실제 DOM MutationObserver)**
- **제목 깜빡임**: 수정 전 공백 **1회 2,023ms**(`Free Note메모1` → `Free Note` → 복귀) →
  수정 후 **375에서 5회 반복 0건 · 430에서 2회 반복 0건**, console error 0.
  비회귀로 **실제 제목을 입력하고 나가면 목록에 즉시 반영**되는 것을 확인했다(낙관적 갱신 유지).
  데스크톱 1280은 `editPage=false`·읽기 전용 오버레이로 원래 이 분기를 안 탄다.
- **Key Notes**: 중요 전체보기 진입/11건/정렬 유지/뒤로/✕ 한 단계 복귀/재열기 초기화 ·
  **Pin 전체보기 회귀 0**(10건 순서 동일) · 모바일 375 버튼 안 잘림(right 360 < 375) ·
  2열 그리드(기존 CSS) · `.dialog-inner` 스크롤 정상 · 데스크톱 1280 3열(345px×3) ·
  **같은 메모 id로 main↔전체보기 computed color·gradient 동일**(다크 팔레트 `data-memo-theme` 유지).
- 주변 회귀 smoke: 월 이동/Today/날짜 선택 · News·Jobs·Trend·Projects·Key Notes 열기/닫기 —
  전부 정상, console error 0.
- **DB write**: 테스트 메모 **2건만** 만들어 썼고 **둘 다 삭제**했다(잔존 0 — 09-04·09-05 빈 날 확인,
  월 chip 수가 착수 전과 같은 11로 복귀). 🔴 **다만 주변 smoke에서 사용자 메모(09-01 "메모1") 하나를
  모바일로 열었다 나오며 `updateMemo` 1회가 나갔다** — 값은 로드된 그대로라 내용 변경은 없고
  `updated_at`만 올라갔다. 모바일 ‹는 구조상 항상 저장하므로 **다음부터는 smoke도 테스트 메모로 해라.**

**무변화 근거**: bodyEditor 확장 경로가 합성 클릭에서 draft를 비운 채 열렸는데,
  `git stash`로 되돌린 **baseline이 모든 필드에서 동일한 값**을 냈다 → **회귀 아님**
  (내 계측의 한계이지 코드 차이가 아니다).

**무변화 근거** (다음 후보에도 같은 절차를 써라)
- 옮긴 본문을 원본과 **바이트 단위로 diff**했다: My Page 154/154 · Idea Build 118/118 ·
  Projects 238/238 · **카드7+헤더 434/434** · **선택→메모 153/153**(주석 제외 코드 줄) ·
  **오버레이 17/17·63/63** · **Monthly 203/203** · rename 0.

> 2026-09-10에 `ba78b0c` 정적검사 · Fast Track 4단계 · Projects 추출 · POSTFLIGHT 재검증의
> **상세 수치표를 걷었다**(운영 규칙 3·8). 전부 종료된 건이고 근거는 그 커밋 메시지와 Notion에 있다.

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
