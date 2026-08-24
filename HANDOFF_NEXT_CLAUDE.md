# SkillPilot 다크모드 이식 — 다음 세션 인계 문서

최종 갱신: 2026-08-24 (KST). **Phase 1~4 완료, Phase 5 부분.** 진행 상황과 이번 세션의 함정은 11절에 있다.
(초판은 2026-08-21 작성 — 감사 완료 + Phase 0 결정 완료, 코드 변경 0줄 시점. 4절의 감사 수치는 그때 값이고,
 **그중 틀린 것 4가지를 11-1에 정정해뒀다 — 4절만 읽고 착수하지 마라.**)
이 문서 하나만 읽으면 다크모드 이식을 바로 시작할 수 있게 작성함.

> **초판에서 정정된 것 2건** (같은 실수를 반복하지 않도록 남긴다):
> - "모바일 다크를 따로 만들어야 한다" → **틀렸다.** 다크 규칙은 미디어쿼리 밖에 한 번 쓰면
>   전 폭에 적용된다(특이도 근거는 §4-3). 신규 색 지정이 필요한 건 130개가 아니라 **67개**다.
> - "`data-memo-theme`은 선택적 부가 기능" → **정반대다.** §13 메모 8종 팔레트 전체가 이 속성에
>   걸려 있어 **없으면 다크 메모지가 아예 적용되지 않는다**(§4-5-2).
>
> 교훈: 셀렉터 **개수**만 세고 **선언 내용**을 안 읽으면 작업량과 필수성을 둘 다 오판한다.

> **이 문서는 "모바일 이식" 인계문서를 대체하지 않는다.**
> 이전 문서(455줄, 모바일 이식 전체 기록)는 `git show 4fd9e54:HANDOFF_NEXT_CLAUDE.md`로 온전히 읽을 수 있다.
> 워킹트리에서 삭제(`D`)됐을 뿐 유실된 게 아니다. **모바일 관련 버그를 만나면 반드시 그 문서를 먼저 읽어라** —
> 이 문서 12절에 핵심만 옮겨놨지만 원문에는 개별 버그의 실측 수치와 원인이 전부 남아 있다.
> (`git show 4fd9e54:CODEX_HANDOFF.md` 600줄도 같이 살아 있다.)

---

## 1. 지금 상태 — 이것부터 확인

```bash
cd "C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot"
git log --oneline -5
git status --short
npx tsc --noEmit
```

### 1-0. 착수 전 상태 확인 (동시 편집은 종료됨)

이 문서를 쓰는 동안 다른 세션이 같은 저장소에서 작업 중이었으나 **2026-08-21 중 완료됐다.**
그 작업분은 커밋 2건으로 정리됐다:

```
2f6945b Fix news briefing skip-gap, admin coverage display, weather hover, and misc bugs
2b69da1 Remove leftover Codex handoff/log files      ← CODEX_HANDOFF.md 삭제 확정됨
4fd9e54 모바일 이식. 지독하다                          ← 모바일 이식 기준선
```

**단, 문서 작성 종료 시점에도 미커밋 수정이 남아 있었다** (`package.json`, `package-lock.json`,
`src/app/layout.tsx`, `src/app/Dashboard.tsx`, `src/lib/actions/memo.ts`, `src/lib/cron-runs.ts`,
`src/lib/news/get-briefing.ts`, `src/proxy.ts`) — **전부 남의 작업이고 다크모드와 무관하다.**

**Phase 1 착수 전 이것만 하라:**

```bash
git log --oneline -3
git status --short
npx tsc --noEmit
```

1. 위 7개 파일이 아직 `M`으로 남아 있으면 → **사용자에게 "먼저 커밋할까요?"를 물어라.**
   같은 파일(`layout.tsx`, `Dashboard.tsx`)을 다크모드가 또 고치므로, 섞이면 §12-6(변경 성격 분리)이
   깨져 나중에 테마만 선별 추출하는 게 불가능해진다. 이 프로젝트가 과거에 크게 당한 사고다.
2. **`layout.tsx`에 이미 `<Analytics />` / `<SpeedInsights />`가 있다 — 지우지 마라.**
   FOUC 스크립트는 `<head>`, Analytics는 `<body>` 끝 → 서로 다른 자리라 공존한다.
3. **`Dashboard.tsx`의 `router.refresh()` 제거 작업분을 되돌리지 마라** (성능 최적화, 다크모드 무관).

### 1-0-1. 작성 시점 기준선

| 항목 | 값 |
|---|---|
| HEAD | `2f6945b` (branch `master`) |
| `npx tsc --noEmit` | **exit 0** (남의 미커밋 작업 포함 상태에서 확인) |
| `dashboard.css` 줄 수 | **6,005** (§4의 5,998은 감사 시점 값, 남의 커밋으로 +7) |
| 모바일 이식분 | `4fd9e54`로 커밋 완료 |

**이 문서를 만든 세션이 건드린 파일은 2개뿐이다:** `HANDOFF_NEXT_CLAUDE.md`(이 문서) +
`scripts/audit-dark-coverage.py`(신규 감사 스크립트). **소스 코드는 0줄.**

> ✅ **master 줄번호 재검증 완료 (HEAD `2f6945b` 기준):** 이 문서가 인용한 7개 위치
> (`header-icon-btn` 3246·3256, `data-memo-theme` 부착 2925·3592·3966·4177·4983)는
> **전부 여전히 유효하다.** 그래도 Phase 1이 `Dashboard.tsx`를 고치는 순간 밀리므로
> **작업 시작할 때 `grep -n`으로 한 번 다시 확인하는 습관은 유지하라.**

### 1-1. `CODEX_HANDOFF.md` — 삭제 확정 (사용자 결정 완료)

`CODEX_HANDOFF.md`는 모바일 이식 때 쓴 문서이고 **사용자가 의도적으로 삭제했다. 복원하지 마라.**
**커밋 `2b69da1`으로 삭제 확정 완료 — 더 할 일 없다.** 내용이 필요하면
`git show 4fd9e54:CODEX_HANDOFF.md`(600줄)로 언제든 읽을 수 있다.

### 1-2. `mobile-responsive` 참고본("3001")은 폴더가 없어졌지만 브랜치는 살아 있다

```bash
git worktree list
# .../skillpilot-mobile-responsive  5123975 [mobile-responsive] prunable   ← 폴더 삭제됨
```

폴더가 사라져 worktree가 `prunable` 상태다. **하지만 브랜치 `mobile-responsive`는 그대로 있어서
파일 내용은 전부 읽을 수 있다:**

```bash
git show mobile-responsive:src/app/dashboard.css | wc -l   # 6054
git show mobile-responsive:src/app/Dashboard.tsx
```

- **localhost:3001 dev 서버는 이제 못 띄운다** (폴더 없음). 루트 `.claude/launch.json`의
  `"skillpilot-mobile-ref"` 항목은 죽은 설정이다 — `preview_start`로 3001을 붙이려 하면 실패한다.
- 3001 대조가 필요하면 **`git show mobile-responsive:<path>`로 텍스트 비교**하면 된다.
  이전 세션의 가장 신뢰도 높은 디버깅 수단이었으니 이 방법을 기억할 것.
- `git worktree prune`은 사용자 승인 없이 실행하지 마라(폴더를 복구할 계획이 있을 수 있다).

### 1-3. `.next` 캐시 손상 (이전 문서에서 이어짐)

`Failed to open database / Loading persistence directory failed / invalid digit found in string` →
코드 문제 아니고 Turbopack 캐시 손상이다. `rm -rf .next` 후 재빌드.

---

## 2. 두 개의 "안티그래비티지침서" — 중복 관계 확정

`SkillPilot-darkmode-lab/` 안에 두 개가 있다. 실제로 비교해봤다:

| 파일 | 줄 수 | 정체 |
|---|---|---|
| `안티그래비티지침서 (1).md` | 147 | **구버전. 읽을 필요 없다.** |
| `안티그래비티지침서.md` | 287 | **최신 완전판. 이것만 보면 된다.** |

- `(1).md`의 §1~§11은 `안티그래비티지침서.md`의 §1~§11에 **완전히 포함**된다(문장 단위로 같거나 더 자세함).
- 287줄판에만 있는 것 = **§4 "라이트모드 토큰화 시 시각값 변경 절대 금지"**, **§6 테마 결정 우선순위**,
  **§8-2 인터랙션 상태 체크리스트 / §8-3 Portal 누락 방지**, **§12 재발방지 8대 원칙**,
  **§13 다크모드 디자인 자산 레퍼런스(메모 8종 컬러 스펙 표 포함)** — 전부 이번 이식에 필수인 내용이다.
- `(1).md`에만 있는 고유 지침은 **없다.** 삭제해도 손실 없지만, 사용자 승인 없이 지우지 말 것.

**작업 규범은 `SkillPilot-darkmode-lab/안티그래비티지침서.md` 287줄판을 유일 기준으로 삼는다.**
아래 이 문서에서 `§N`은 모두 그 파일의 절 번호다.

---

## 3. 아키텍처 & Source of Truth (§12-4)

| 역할 | 원천 |
|---|---|
| 기능 / API / DB / state / handler / 라우팅 / **모바일 레이아웃** | **`skillpilot` (master) — 유일한 진실** |
| 다크 테마 CSS / 색상 팔레트 / 토큰 / 시각 자산 | **`SkillPilot-darkmode-lab` — 디자인 레퍼런스 (READ-ONLY)** |
| 검증된 모바일 CSS 값 | `git show mobile-responsive:...` (읽기 전용) |

- **작업 대상은 `skillpilot`뿐이다.** `SkillPilot-darkmode-lab`은 절대 수정하지 마라.
- **§12-5 전체 파일 덮어쓰기 절대 금지.** lab의 `dashboard.css`를 master로 복사하는 순간
  모바일 이식분 71개 미디어쿼리 블록과 커밋 `4fd9e54`의 작업이 전부 날아간다.
  (실측: lab dashboard.css 4,484줄 / master 5,998줄 — **lab이 1,514줄 더 적다.** lab은 낡은 스냅샷이다.)
- lab에는 `mobile-preview/page.tsx`, `WeatherTempTrigger.tsx`, `news/rss.check.ts`가 **없다** —
  master에만 있는 최신 파일들이다. 반대로 lab에는 `" (1)"` 접미사 중복 파일 43개가 살아 있다
  (master에서는 이전 세션에 사용자 승인 받고 삭제 완료했다. **lab의 `(1)` 파일은 전부 무시하라.**)
- 로컬 dev: `localhost:3000` = skillpilot(master). 루트 `.claude/launch.json`
  (`C:\Users\ipre_\Desktop\미니프로젝트3\.claude\launch.json` — **skillpilot 하위가 아니다**) 의
  `"skillpilot"` 항목을 쓴다.
- 테스트 계정: `skillpilot.dev.admin@gmail.com` — **비밀번호를 Claude가 직접 입력하는 것은 금지 규칙이다. 절대 하지 말 것.**

---

## 4. 감사 결과 — 실측 수치 (이 문서의 핵심)

전부 실제로 grep/파싱해서 센 값이다. 추정치 아니다.

> **줄번호 주의**: **lab 파일은 READ-ONLY라 줄번호가 영구히 안전하다.**
> **master 파일 줄번호는 Phase 1을 시작하는 순간 밀린다** — master 쪽 위치는 반드시
> `grep -n`으로 다시 찾아라. 이 문서의 master 줄번호는 "작성 시점" 값일 뿐이다.
> (초판에 `header-icon-btn`을 3212/3222로 잘못 적었다가 실제 3246/3256으로 정정한 적 있다.)

### 4-1. 다크 자산 규모와 위치 (추출은 쉽다)

| | LAB | MASTER |
|---|---|---|
| `dashboard.css` 총 줄 | 4,484 | 5,998 |
| `dashboard.css` `data-theme` 등장 줄 | **568** | **0** |
| `dashboard.css` `data-memo-theme` 등장 줄 | **147** | **0** |
| `auth.css` `data-theme` 등장 줄 | **21** | **0** |
| `globals.css` `data-theme` 등장 줄 | 2 | 0 |

**다크 CSS는 흩어져 있지 않고 파일 끝에 한 덩어리로 붙어 있다** (gap>60줄 기준 클러스터 1개):

- `LAB/src/app/dashboard.css` **약 2647줄~EOF(4484)** — 약 1,838줄.
  시작 지점은 `grep -n 'SkillPilot Dark Theme System'`로 찾아라(배너 주석).
  내부가 `/* 1. 메인 셸 & 배경 */` ~ `/* 17. Tiptap Rich Editor 툴바 & 팝오버 */`로 번호 섹션화돼 있어
  **섹션 단위 선별 이식이 그대로 가능하다** (§12-3 Extraction에 딱 맞는 구조).
- `LAB/src/app/auth.css` **224~320줄** (약 97줄). `[data-theme="dark"] { --sp-bg-left: #181133; ... }`부터 EOF.
- master `dashboard.css`는 5,998줄에서 끝나고 마지막 섹션이 `(21-j)`류 날짜별 섹션이다 →
  **다크 블록은 파일 끝에 새 섹션으로 append**하면 특이도·순서 문제가 가장 적다.

### 4-2. 라이트모드 회귀 위험: `:root`는 완전히 동일 ✅

```
diff <(lab :root 블록) <(master :root 블록)  →  차이 0
```

**lab은 라이트 토큰을 단 한 글자도 안 건드렸다.** 다크 작업이 100% 순수 추가(`[data-theme="dark"]` 접두)로만
되어 있다는 뜻 — §4의 "라이트 토큰화 시 시각값 변경 금지"를 lab이 이미 지켰다.
**따라서 이식 시 `:root`를 손댈 이유가 전혀 없다. 만지면 그게 곧 회귀다.**

### 4-3. 모바일 다크 — "따로 만드는" 게 아니라 "빠진 컴포넌트를 채우는" 일이다

| | LAB | MASTER |
|---|---|---|
| `dashboard.css` `@media` 총 개수 | 12 | **94** |
| 그중 `max-width: 720` (모바일) | 4 | **71** |
| **모바일 `@media` 블록 안에 있는 다크 규칙 줄** | **0 / 568** | — |
| `auth.css` 모바일 다크 규칙 줄 | **0 / 21** | — |

lab의 568줄 다크 규칙 중 모바일 미디어쿼리 안에 있는 건 0개다. lab에는 애초에 모바일 레이아웃이
거의 없었다(4개 블록 vs master 71개).

**그런데 이게 "모바일 다크 테마를 별도로 만들어야 한다"는 뜻은 아니다. 실측으로 확인한 결론:**

> **다크 규칙은 미디어쿼리 밖에 한 번만 쓰면 웹·모바일 양쪽에 동시 적용된다.**
> `[data-theme="dark"] .foo`의 특이도는 **(0,2,0)** — 속성 셀렉터 1 + 클래스 1.
> master의 모바일 라이트 규칙은 대부분 `.foo`(0,1,0) 또는 `.a .b`(0,2,0)이고,
> **미디어쿼리는 특이도를 올리지 않는다.** 따라서 파일 끝에 append한 다크 규칙이 자연히 이긴다.
> 실측 예: `.mobile-options-sheet`의 라이트 배경은 `background: rgba(250,249,255,.98)`
> (dashboard.css:3430, `!important` 없음) → `[data-theme="dark"] .mobile-options-sheet`가 이긴다.

**따라서 이 이식에 "모바일 전용 다크 블록"은 원칙적으로 필요 없다.** §4-8이 실제 작업량이다.

⚠️ 예외 두 가지만 기억하라:
1. **`!important` 라이트 규칙** — `dashboard.css`에 `!important`가 총 487개, 그중 색/배경/보더 관련이
   **105개**다. 이 요소들은 다크 규칙에도 `!important`가 필요하고, 같은 `!important`끼리는
   특이도 → 소스 순서로 결정되므로 **파일 끝에 쓰면 이긴다.** 미디어쿼리는 여전히 불필요.
2. **웹과 모바일에 서로 다른 다크 *값*을 주고 싶을 때만** 모바일 블록을 새로 연다
   (예: 모바일에서만 blur를 줄여 성능 확보). §1 "톤 일관" 원칙상 이런 경우는 드물어야 한다.

### 4-4. 셀렉터 드리프트: 291개 중 287개 생존 (98.6%) ✅

lab 다크 규칙이 참조하는 클래스 291개를 master에서 전수 확인:

- **287개는 master `dashboard.css`에 그대로 존재** → 셀렉터 수정 없이 이식 가능.
- **죽은 클래스 4개만 개별 처리 필요:**

| lab 클래스 | lab 위치 | master 상태 | 처리 방법 |
|---|---|---|---|
| `.job-title` | 2773-2774 | **CSS·TSX 양쪽에 없음.** Job UI가 `.job-card` / `.job-card-actions` 구조로 재작성됨 | master의 실제 job 카드 제목 요소를 찾아 **셀렉터 재타겟**. 그대로 옮기면 무효 규칙이 된다 |
| `.mini-date-today` | 4093 | 없음. master는 **`.mini-date-day.today`** (Dashboard.tsx:494에서 조건부 부여) | `.mini-date-day.today`로 재작성. `.selected`/`.sunday`/`.saturday`도 다크 대비 확인 |
| `.mini-date-footer` | 4092 | 없음 (master MiniDatePicker에서 제거됨) | **규칙 폐기** |
| `.memo-theme-toggle` | 260, 277, 282, 3003 | 없음 — **lab에만 있는 신규 UI** | 버튼 UI는 **만들지 않는다**(§4-5-2). 단 `data-memo-theme` 속성 자체는 필수 |

### 4-5. master에 없는 lab 전용 UI 2종

§9는 "기능 삭제 또는 추가" 금지인데, 다크모드는 본질적으로 토글 UI가 필요하다.

1. **글로벌 테마 토글** (`.header-icon-btn.theme-toggle-btn`, lucide `Sun`/`Moon` 17px) — **필수**
   - lab: `Dashboard.tsx` 2715, 2734 — **2군데** (데스크톱 헤더 + 모바일 헤더)
   - master: `.header-icon-btn`이 CSS 3회 / TSX 2회 존재 —
     **`grep -n 'header-icon-btn' src/app/Dashboard.tsx` → 2곳** (작성 시점 3246·3256, 데스크톱/모바일)
     — 두 곳 모두 "도움말" 버튼이다.
   - → **lab의 2개 : master의 2개가 정확히 대응한다.** 도움말 버튼 옆에 같은 클래스로 붙이면
     기존 헤더 디자인을 해치지 않는다(§6 "최소한의 형태"). 붙일 자리는 확보돼 있다.
2. **`data-memo-theme` 속성 — 옵션이 아니라 §5·§13의 유일한 통로다 (필수)**

   > 🔴 **여기서 착각하지 마라.** `data-memo-theme`을 "포스트잇만 라이트로 보는 부가 기능"으로
   > 오해하기 쉬운데, **실제로는 다크 메모 8종 팔레트 전체가 이 속성에 걸려 있다.**
   > lab의 모든 다크 메모 규칙이 이 형태다:
   > ```css
   > [data-theme="dark"] [data-memo-theme="dark"] .keynote-sticky,
   > [data-theme="dark"] [data-memo-theme="dark"] .postit,
   > [data-theme="dark"] .postit-overlay[data-memo-theme="dark"] .postit,
   > [data-theme="dark"] [data-memo-theme="dark"] .postit.big-postit { ... }
   > ```
   > **`data-memo-theme`을 안 붙이면 §13의 리퀴드 프로스티드 글래스 팔레트가 단 한 줄도 적용되지
   > 않는다** — 메모지가 다크 배경 위에 라이트 색으로 그대로 남아 §5·§10 검증이 통째로 실패한다.

   - 147줄 분포: **`="dark"` 117줄** (= §13 8종 팔레트 본체) / **`="light"` 30줄**
     (= 글로벌 다크에서 포스트잇만 라이트로 보는 변형)
   - **🔴 부착 지점은 클래스만 보고 찾으면 틀린다.** `.postit-overlay open`은 **양쪽 파일에 각각 5번**
     나오는데 **그중 1곳만** 속성을 받는다. 나머지에 붙이면 프로젝트 템플릿 팝업·전체저장 확인 팝업까지
     메모지 스타일을 먹는다. **`ref`/`onClick` 핸들러로 식별하라** (master 줄번호는 작성 시점 값):

     | # | 식별 기준 (이걸로 찾아라) | master | lab | 부착 |
     |---|---|---|---|---|
     | 1 | `.postit-overlay open` + `onClick={postitEditMode === "detail" ? ...}` | 2925 | 2444 | ✅ |
     | 2 | `.panel.keynotes-panel` (파일에 1곳뿐) | 3592 | 3062 | ✅ |
     | 3 | `.glass-dialog.big.tonedown` + `ref={memoRef}` | 3966 | 3438 | ✅ |
     | 4 | `.glass-dialog.big.tonedown` + `ref={keynotesRef}` | 4177 | 3617 | ✅ |
     | 5 | `.glass-dialog.postit-only` + `ref={postitOnlyRef}` | 4983 | 4346 | ✅ |
     | — | `.postit-overlay open` + `setProjTemplatePrompt` / `closeBigEditor` / `setMemoPicker` / `setPendingSave` | 2068·3024·3153·3194 | — | ❌ **붙이지 마라** |
     | — | `.glass-dialog.big.tonedown` + `ref={projectsRef}` | 4297 | 3736 | ❌ lab도 안 붙였다 |

   - ⚠️ **3번은 master에서 구조가 바뀌었다.** lab은 문자열 리터럴이지만 master는 템플릿 리터럴로
     `monthly-memo-dialog`와 `memo-compose-color-${formColor}`가 덧붙는다
     (모바일 이식분). `data-memo-theme`은 별개 JSX 속성이라 그냥 추가하면 되지만,
     **`className` 문자열을 lab 것으로 되돌리지 마라 — 모바일이 깨진다.**
   - **최소 구현(권장): `data-memo-theme={theme}`로 글로벌 테마를 그대로 따라가게 한다.**
     별도 state·localStorage·토글 UI 없이 파생값 한 줄이면 끝이고, 147줄 규칙을 전부 살릴 수 있다.
     (다크면 다크 메모지, 라이트면 기존 라이트 메모지 — 사용자가 기대하는 기본 동작이다.)
   - `.memo-theme-toggle` **버튼 UI만 진짜 옵션이다.** 나중에 원하면 파생값을 state로 바꾸고
     lab `Dashboard.tsx:3067`/`3630`을 참고해 버튼 2개를 붙이면 된다(약 10줄, `localStorage`
     키는 `skillpilot_memo_theme`). **지금은 만들지 마라 — §9 "요청하지 않은 기능 추가 금지".**

### 4-6. `globals.css` — OS 다크 감지 3줄 제거 (결정 완료)

```diff
  /* LAB */                          /* MASTER (현재) */
- :root, [data-theme="light"] {      :root {
-   ...                                ...
- }                                  }
- [data-theme="dark"] {              @media (prefers-color-scheme: dark) {
-   --background: #0b0d19;             :root {
-   --foreground: #f0f3ff;               --background: #0a0a0a;   ← 순수 검정
- }                                      --foreground: #ededed;
                                       }
                                     }
```

master에는 **`@media (prefers-color-scheme: dark)` 블록이 살아 있어서, OS를 다크로 쓰는 사용자는
저장된 테마 설정이 없어도 `--background`가 `#0a0a0a`(순수 검정)으로 이미 바뀐다.**
이건 §6의 `[!CAUTION]` "저장값 없을 때 다크로 강제 시작 금지"와 §9 마지막 항목을 정면으로 위반하는
기존 동작이고, 동시에 §3의 "단순히 검게 만들지 말 것"과도 반대다(Next.js 기본 템플릿 잔재로 보인다).

**사용자 결정: OS 설정은 아예 고려하지 않는다. 테마는 웹 안에서만 사용자가 고른다.**
따라서 `prefers-color-scheme` 판별은 어디에도 넣지 않는다 — 이 3줄은 제거 대상이다.
영향 범위 실측 = 매우 좁다:

`--background` / `--foreground`의 실사용처는 프로젝트 전체에서 **4곳뿐이고 전부 `globals.css` 안**이다:

```
globals.css:9   --color-background: var(--background);   ← @theme inline (Tailwind 토큰 등록)
globals.css:10  --color-foreground: var(--foreground);
globals.css:23  body { background: var(--background); }  ← 실제 렌더에 영향 주는 유일한 곳
globals.css:24  body { color: var(--foreground); }
```

즉 이 3줄 블록이 바꾸는 건 **`<body>`의 배경·글자색 하나뿐**이다. `dashboard.css`/`auth.css`는 자체
토큰으로 자기 배경을 그리므로 실제 화면에서 거의 보이지 않는다(스크롤 오버슈트·빈 여백 정도).
Next.js `create-next-app` 기본 템플릿 잔재로 판단된다.

**처리:** `@media (prefers-color-scheme: dark)` 블록을 삭제하고 lab처럼
`:root, [data-theme="light"]` / `[data-theme="dark"] { --background:#0b0d19; --foreground:#f0f3ff; }`
구조로 바꾼다. **`--background`를 `#0a0a0a`(순수 검정)로 두지 마라** — §3 "단순히 검게 만들지 말 것"
위반이고 심해 네이비 `#0b0d19`가 정답이다.

### 4-7. `layout.tsx` — FOUC 방지 스크립트 (그대로 이식 가능)

lab이 master보다 6줄 많고, 차이는 딱 두 가지다:

1. `<html>`에 `suppressHydrationWarning` 추가
2. `<head>` 안 인라인 스크립트:
   ```js
   (function(){try{var t=localStorage.getItem('skillpilot_theme');
   if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}
   else{document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();
   ```

**저장값이 없으면 `'light'`** — §6의 우선순위(사용자 선택 > light 기본 > 시스템테마는 강제 안 함)를
정확히 지키고 있다. **그대로 옮겨라. 여기에 `prefers-color-scheme` 판별을 끼워 넣지 마라.**

### 4-8. 🔴 실제 작업량: 다크 색을 새로 지정해야 하는 컴포넌트 **67개**

master의 모바일 `@media` 블록이 참조하는 클래스는 513개, 그중 **130개는 lab CSS에 아예 없다**
(모바일 이식 세션에 새로 만들어진 것들 — 다크 색이 정의된 적이 없다).

**130개를 선언 내용까지 파싱해서 분류했다:**

| 분류 | 개수 | 조치 |
|---|---|---|
| `background`/`color`/`border`/`box-shadow`/`backdrop-filter` 선언이 있음 | **67** | **다크 규칙 신규 작성 필요** |
| 크기·위치·정렬·`display`만 다룸 (색 선언 0개) | **63** | **손댈 필요 없음** |

63개는 `proj-top-cluster`, `proj-summary-row`, `job-card`, `memo-create-mobile`, `mobile-color-dot`,
`selectable-content`, `weather-temp-item` 등 순수 레이아웃 클래스다 — **다크모드에서 건드릴 이유가 없다.**
(특히 `proj-top-cluster` / `proj-top-cluster-left`는 `display:contents` 트릭이 걸려 있어
**배경·보더를 주면 모바일 레이아웃이 깨진다.** 12절 마지막 항목 참고.)

**67개는 §4-3에 따라 미디어쿼리 밖에 쓰면 웹·모바일이 한 번에 해결된다.**
공통 토큰(글래스 배경 + 반투명 보더 + `--ink`/`--muted`)으로 묶으면 실제 규칙 그룹은 8~10개 정도다.

**클래스 목록은 이 문서에 박아두지 않는다** (매 세션 토큰 낭비 + 코드가 바뀌면 즉시 낡는다).
전체 목록과 67/63 분류가 필요하면 프로젝트 루트(`미니프로젝트3`)에서:

```bash
python skillpilot/scripts/audit-dark-coverage.py
```

> ⚠️ 출력의 `tsx`, `sm`, `glass-dialog??` 같은 항목은 CSS 주석·한글에서 잘못 잡힌 잡음이다.
> 셀렉터로 착각해서 쫓아가지 마라.

**작업 순서용 그룹 요약** (Phase 3에서 이 순서로 진행):
바텀시트 `mobile-options-*`(12) → 리치 툴바 `mobile-toolbar-*`/`mobile-font-size-*` →
selection 레이어 `mobile-selection-*` → Idea 픽커 `idea-save-overlay`/`idea-source-picker-anchor`/`idea-picker-back` →
support·feedback `support-*`/`feedback-helper-*` → 나머지(`mobile-color-panel`, `mobile-cal-total`,
`mobile-project-summary-popover`, `project-back-btn`, `calendar-open` 등)

---

## 5. 이식 계획 (§12-8 5단계 절차에 맞춤)

권장 순서. **각 단계마다 커밋을 끊어라** (§12-6 변경 성격 분리, §12-7 체크포인트).

**Phase 0 — 사용자 결정: ✅ 완료 (2026-08-21)**
1. `globals.css` `prefers-color-scheme` 블록 → **제거 확정** (§4-6, 영향은 `<body>` 한 곳뿐)
2. `data-memo-theme` → **필수, 포함 확정.** `data-memo-theme={theme}` 파생값으로 부착.
   `.memo-theme-toggle` 버튼 UI는 만들지 않는다 (§4-5-2)
3. `CODEX_HANDOFF.md` → **삭제 확정** (§1-1)

**Phase 1 — 테마 배관 (Plumbing)**
- `layout.tsx`: FOUC 스크립트 + `suppressHydrationWarning` (§4-7 그대로)
- `Dashboard.tsx`: `theme` state + `toggleTheme` + `localStorage('skillpilot_theme')`
  (lab `Dashboard.tsx`에서 `grep -n 'skillpilot_theme'`로 찾아라), 헤더 토글 버튼 2개
  (master에서 `grep -n 'header-icon-btn'` → 2곳, 그 옆에 붙인다)
- `Dashboard.tsx`: `data-memo-theme={theme}` 5곳 부착 (§4-5-2의 부착 지점 목록)
- `globals.css`: `@media (prefers-color-scheme: dark)` 3줄 **삭제** →
  `[data-theme="dark"] { --background:#0b0d19; --foreground:#f0f3ff; }`로 교체.
  **OS 설정은 어디서도 읽지 않는다** (사용자 명시 결정)
- **여기서 커밋.** 이 시점에 다크는 아직 안 예뻐도 정상이다. 라이트 무변경만 확인.

**Phase 2 — 데스크톱 다크 이식 (섹션 단위)**
- lab `dashboard.css`의 다크 영역(`grep -n 'SkillPilot Dark Theme System'` ~ EOF)을
  **번호 섹션(1~17) 단위로 하나씩** master 파일 끝에 append.
- 통째로 붙이지 말고 섹션마다 (a) 셀렉터가 master에 있는지, (b) master에 나중에 추가된 `!important`
  override가 그 값을 덮지 않는지 확인. §4-4의 죽은 4개는 재타겟/폐기.
- lab `auth.css` 224~320도 같은 방식으로.
- **여기서 커밋.**

**Phase 3 — 🔴 모바일 이식분 컴포넌트 67개 다크 색 지정 (진짜 작업량)**
- §4-8의 **67개**를 성격 그룹별로 진행 (레이아웃 전용 63개는 건너뛴다). 그룹 하나 = 커밋 하나.
- **미디어쿼리 밖에 쓴다** (§4-3). 기존 모바일 블록 71개를 열지 않으므로 모바일 라이트 회귀 위험이
  구조적으로 0이다. 색/배경 라이트 규칙이 `!important`인 105개 경우만 다크도 `!important`를 붙인다.
- 데스크톱에서 이미 확정된 다크 토큰(`--ink: #f0f3ff`, `--muted: #9cb0db`, 심해 네이비 `#0b0d19~#101426`,
  §13의 메모 8종 팔레트)을 **재사용**해라. 모바일용 색을 새로 발명하지 마라 — §1 "톤 일관".
- 순서 권장: 바텀시트 계열(12개, 가장 크고 눈에 잘 띔) → 리치 툴바 → selection 레이어 →
  Idea 픽커 → support/feedback → 나머지.

**Phase 4 — Portal / 인터랙션 상태 (§8-2, §8-3)**
- §8-3: Portal로 렌더되는 것(dropdown, date-picker, tooltip, popover, emoji picker, bottom sheet)이
  테마를 따라가는지. **컴포넌트는 다크인데 팝업만 라이트로 남는 상태를 절대 허용하지 마라.**
- §8-2 전수: `hover`/`active`/`focus-visible`/`disabled`/`readonly`/`selected`/`checked`/
  `placeholder`/`autofill`(`-webkit-autofill` 투명 처리)/`scrollbar`/`::selection`/
  `tooltip`/`popover`/`dialog::backdrop`/에디터 툴바 active
- ⚠️ **스크롤바는 이미 커스텀 규칙이 있다** — 이전 세션에 `.rich-editor-body-wrap` 등에
  `scrollbar-width:thin` + `::-webkit-scrollbar{width:10px}` + `border:3px solid transparent`를 넣었다
  (`dashboard.css` (22)절). **다크 스크롤바는 그 규칙을 덮어쓰는 게 아니라 색만 바꿔라.**

**Phase 5 — 회귀 검증 (§10)**
- 아래 6절 체크리스트 전수.

---

## 6. 완료 검증 체크리스트 (§10 + 모바일 확장)

### 라이트 테마 — 100% 무변경 (가장 중요)
- [ ] `:root` 블록 diff 0줄
- [ ] 기존 모바일 `@media` 블록 71개 diff 0줄 (다크는 새 블록에만 추가)
- [ ] Dashboard / 카드 / 모달 / 폼 시각 비교 동일
- [ ] gradient / shadow / border / layout 회귀 0건
- [ ] **웹 = 모바일 + 2px 폰트 규칙 유지** (`--memo-base-font`, 아래 12절 참고)

### 다크 테마 — 웹
- [ ] Dashboard 패널 Liquid Glass 톤 유지 (단순 검정 아님)
- [ ] News / Job / Trend / Projects 카드
- [ ] dialog / modal + `::backdrop`
- [ ] input / button / dropdown / select
- [ ] Monthly MEMO 8종 전부 구분됨, **`.c6 black` / `.c7 darkgray`가 배경에 묻히지 않음** (§5, §13 표)
- [ ] 메모 상세 / 퀵 에디터 / Tiptap 확장 에디터
- [ ] calendar / MiniDatePicker (**`.mini-date-day.today` / `.selected` / `.sunday` / `.saturday` 대비**)
- [ ] 상태 badge + 칩 필터 (프로젝트 4종 토큰: Idea `#FACC15` / Planning `#A78BFA` / Developing `#60A5FA` / Completed `#34D399`)
- [ ] Projects 테이블 / 마크다운 뷰
- [ ] **Auth 라우트** (login / signup / onboarding / forgot-password / reset-password) — §13-1 "적용 라우트 스코프"에 포함
- [ ] 커스텀 스크롤바 다크 톤

### 다크 테마 — 모바일 (🔴 신규 작성분, 전수 확인)
- [ ] 모바일 헤더 + 테마 토글 버튼
- [ ] 모바일 바텀시트 전체 (`mobile-options-sheet` 계열 12개)
- [ ] 모바일 리치 툴바 + 폰트크기 메뉴 + 색상 패널 + 이모지
- [ ] 텍스트 드래그 → `mobile-selection-layer` → 미니달력 → 메모 선택 전체 흐름
- [ ] 모바일 상세 헤더 5종 (News / Job / AI Trend / Key Notes / My Page)
- [ ] `.big-postit` 전체화면 메모 (다크 + `has-insert-banner` 변형)
- [ ] Idea Build 두 픽커(바텀시트) + `.confirm-panel` 예외(292px 가운데 팝업 유지)
- [ ] 프로젝트 입력/수정 + `mobile-project-summary-popover` + `proj-coming-soon`(모바일은 숨김이 정상)
- [ ] 도움말 / 의견·버그 신고 (`feedback-helper-*`, `support-*`)
- [ ] Job 탭 / 카드 / 상세
- [ ] 캘린더 모바일 (`mobile-cal-preview`, `cal-more-indicator`, 날짜별 카운트 뱃지)

### 공통 시스템
- [ ] `npx tsc --noEmit` 통과 (기준선: 현재 exit 0)
- [ ] `npx next build` 통과
- [ ] 새 console warning / error 0건
- [ ] FOUC 없음 (새로고침 시 라이트→다크 깜빡임 없음)
- [ ] 새로고침 후 선택 테마 유지
- [ ] 저장값 없는 신규 방문자 = **라이트로 시작** (§6 CAUTION)
- [ ] 기능 로직 / DOM 구조 임의 변경 0건

---

## 7. 검증 방법 (헤드리스 환경 — 이전 세션에서 이어짐, 다크모드용으로 갱신)

- **세션 시작 시 스크린샷이 되는지 먼저 한 번 찍어봐라.** 세션마다 다르다. 지난 Opus 5 세션엔
  전혀 안 됐다(`Screenshot timed out... not compositing frames`). **다크모드는 "색"이 결과물이라
  스크린샷이 안 되면 검증이 크게 불편하다** — 안 되면 아래 대체 수단을 써라.
- **스크린샷 없이 색을 검증하는 방법:**
  ```js
  // 실제 적용된 색을 계산값으로 읽는다 — 다크모드 검증의 1차 수단
  const el = document.querySelector('dialog[open] .some-target');
  const s = getComputedStyle(el);
  ({bg: s.backgroundColor, color: s.color, border: s.borderColor,
    shadow: s.boxShadow, bdf: s.backdropFilter, img: s.backgroundImage});
  ```
  `document.documentElement.dataset.theme`로 현재 테마를 확인하고,
  `setAttribute('data-theme','dark')`로 즉시 전환해 before/after를 같은 셀렉터로 두 번 재라.
- **대비(contrast) 검증**: 텍스트와 배경의 computed color를 뽑아 직접 상대휘도 비를 계산하라.
  "묻히지 않는다"를 눈대중이 아니라 수치로 확인할 수 있다 —
  특히 §5의 `.c6 black` / `.c7 darkgray` 메모가 여기에 해당한다.
- ⚠️ **`.big-postit`은 `postitPop` 애니메이션(`from{transform:scale(.86)}`)이 헤드리스에서 멈춰
  `getBoundingClientRect()`가 실제보다 14% 작게 나온다.** 측정 전에 무조건
  `*{animation:none!important;transition:none!important}`를 주입하라. 판별법: rect 높이와
  `getComputedStyle(el).height`가 다르면 스케일 아티팩트다.
- **다이얼로그 쿼리는 `dialog[open]`으로 스코프하라.** Today's Focus와 Idea Build는 **둘 다
  `.ai-direction-dialog`**다. `document.querySelector('.ai-modal-header')`는 닫힌 쪽(rect 전부 0)을 잡는다.
- **모바일 액션은 합성 `.click()`으로 테스트하지 마라.** outside-press 리스너가 안 걸려서
  "정상"이라는 거짓 결론이 난다. 실제 이벤트 시퀀스:
  ```js
  function tap(el){
    var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    var po={bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y};
    var mo={bubbles:true,cancelable:true,clientX:x,clientY:y};
    el.dispatchEvent(new PointerEvent('pointerdown',po));
    el.dispatchEvent(new MouseEvent('mousedown',mo));   // 이게 document 리스너를 실제로 태운다
    el.dispatchEvent(new PointerEvent('pointerup',po));
    el.dispatchEvent(new MouseEvent('mouseup',mo));
    el.dispatchEvent(new MouseEvent('click',mo));
  }
  ```
- **모바일 다크 확인은 `resize_window` preset `mobile`(375x812) 후 반드시 새로고침.**
  로드 시점 디바이스 게이트가 다시 돌아야 한다. `/mobile-preview` 라우트(dev 전용, 375/390/430 폭)도 쓸 수 있다.
- **React 상태 + 서버 액션이 끼면 1.6초로는 부족하다.** "안 열렸다"고 결론내기 전에 폴링으로 더 기다려라.
- `npx next build`까지 통과시키는 걸 최종 단계로 삼아라. typecheck만으로는 못 잡는 게 있다.

---

## 8. 절대 하지 말 것 (§9 + 이번 이식 특화)

- ❌ lab의 `dashboard.css` / `auth.css` / `Dashboard.tsx`를 **파일 단위로 복사** — 모바일 이식분 전멸
- ❌ `:root` 라이트 토큰 수정 (현재 lab==master, 손댈 이유 없음)
- ❌ master의 기존 모바일 `@media` 블록 71개 안의 **라이트 값 수정**
- ❌ 저장값 없을 때 다크로 시작 / `prefers-color-scheme`를 기본 판별로 사용
- ❌ 검은 메모(`.c6`)를 다른 색으로 교체
- ❌ 브랜드 보라/핑크 포인트 컬러 임의 교체
- ❌ API / DB / state / handler / 라우팅 변경
- ❌ 레이아웃·컴포넌트 구조 대규모 변경
- ❌ 다크모드와 무관한 코드 정리 / 전체 포맷팅
- ❌ 새 라이브러리 설치 (lucide-react는 이미 있다)
- ❌ 폰트 크기를 숫자로 직접 박기 → 반드시 `var(--memo-base-font)`
- ❌ `SkillPilot-darkmode-lab` 폴더 수정
- ❌ **다크 규칙을 기존 모바일 `@media` 블록 안에 끼워 넣기** — 파일 끝에 쓰면 이긴다(§4-3).
  기존 블록을 열면 그 순간 모바일 라이트 회귀 위험이 생긴다
- ❌ **`data-memo-theme`을 `.postit-overlay open` 5곳 전부에 붙이기** — 1곳만이다(§4-5-2 표).
  나머지에 붙이면 프로젝트 템플릿·확인 팝업이 메모지 스타일을 먹는다
- ❌ **`proj-top-cluster` / `proj-top-cluster-left`에 background·border·shadow 주기** —
  `display:contents` 트릭이 걸려 있어 모바일 레이아웃이 깨진다
- ❌ master `Dashboard.tsx`의 `className` 템플릿 리터럴을 lab의 문자열로 되돌리기
  (`monthly-memo-dialog`, `memo-compose-color-*`가 사라져 모바일이 깨진다)
- ❌ `git worktree prune` / `mobile-responsive` 브랜치 삭제 (사용자 승인 없이)

---

## 9. 라이트 회귀를 기계적으로 잡는 방법 (§10 "100% 동일" 증명)

눈으로 비교하면 놓친다. **다크 작업 전에 라이트 기준값을 덤프해두고 나중에 diff하라:**

```js
// 라이트모드에서 실행 → JSON 저장
const keys=['backgroundColor','color','borderColor','boxShadow','backgroundImage',
            'opacity','backdropFilter','fontSize','padding','margin','borderRadius'];
JSON.stringify([...document.querySelectorAll('*')].slice(0,4000).map(el=>{
  const s=getComputedStyle(el);
  return [el.className&&String(el.className).slice(0,60), ...keys.map(k=>s[k])];
}));
```

Phase 2~4를 끝낸 뒤 `data-theme="light"`에서 같은 스크립트를 돌려 diff가 비면 §10의 첫 항목이 증명된다.
**데스크톱과 모바일(375px) 두 폭에서 각각 떠라** — 모바일 회귀가 이 이식의 최대 위험이다.

---

## 10. §13 다크 디자인 자산 — 이식 시 그대로 써야 하는 값

`SkillPilot-darkmode-lab/안티그래비티지침서.md` §13에 전체 스펙 표가 있다. **색을 새로 만들지 말고 그 표를 따라라.**

- 배경: 심해 네이비/바이올렛 `#0b0d19` ~ `#101426`
- 텍스트: `--ink: #f0f3ff`, `--muted: #9cb0db`, `color-scheme: dark`
- 프로젝트 4종: Idea `#FACC15` / Planning `#A78BFA` / Developing `#60A5FA` / Completed `#34D399`
  (각 soft/border 값은 §13 표)
- 메모 8종: 135° 대각 유리 광택 sheen + 1.5px 상단 엣지 하이라이트 + 18px backdrop-blur(saturate 140%)
  + 카우스틱 섀도우. Yellow / Pink(.c1) / Green(.c2) / Sky(.c3) / Lavender(.c4) / White(.c5) /
  Black(.c6) / DarkGray(.c7) — **각 gradient·텍스트색·inset·border·shadow 값이 §13 표에 전부 적혀 있다.**
- `.c6`/`.c7`은 배경 묻힘 방지용 특수 처리(더 강한 border/shadow)가 이미 스펙에 반영돼 있다.
- 실제 CSS 구현체는 lab `dashboard.css` 3142~3600 부근 (`/* Yellow (기본 다크 메모) */` ~
  `/* Black/Dark Gray (.c6, .c7) 전용 오버라이드 */`).

---

## 11. 진행 상황

| Phase | 상태 |
|---|---|
| 감사 (Scope & Audit, §12-8-1) | ✅ **완료** — 이 문서 4절이 결과물 |
| 분류 (Classification, §12-8-2) | ✅ 완료 — 4-1(A. 순수 테마 자산) / 4-4~4-5(C. 혼합) / 4-6(B. 과거 일반 웹 변경) |
| Phase 0 사용자 결정 3건 | ✅ **완료** (2026-08-21) |
| Phase 1 테마 배관 | ✅ **완료** (2026-08-24, `a5c66bb`) |
| Phase 2 데스크톱 다크 이식 | ✅ **완료** (2026-08-24, `a5c66bb`) |
| Phase 3 모바일 컴포넌트 다크 색 지정 | ✅ **완료** (2026-08-24, `fdd2a0e` + 3b) |
| Phase 4 Portal / 인터랙션 상태 | ✅ **완료** (2026-08-24, `49cedce`) |
| Phase 5 회귀 검증 | ✅ **완료** (2026-08-24 (3)) — 로그인 상태에서 dialog 13개 전수 대비 실측, 잔여 10건 수정. 아래 11-6 |

---

## 11-1. 2026-08-24 세션에서 실제로 한 것

**커밋 5건** (전부 master):

| 커밋 | 내용 |
|---|---|
| `a5c66bb` | Phase 1 배관 + Phase 2 데스크톱 다크 이식(1,812줄 + auth 98줄) |
| `fdd2a0e` | Phase 3 + 3b, 중요메모 드래그, `memoPreview` 캐시 |
| `a13ed4a` | 상태 드롭다운 포털화, 가로줄 overflow 축 명시, 작은 카드 blur 해제, 도움말 폭 |
| `d658644` | 드롭다운 좌표계 수정, `content-visibility`, 필드 라벨 20px |
| `49cedce` | Phase 4 인터랙션 상태 3건 |

### 문서(4절)에서 **틀렸던 것** — 다음 세션은 이걸 믿지 마라

- **§4-6 `globals.css`의 `prefers-color-scheme` 제거는 이미 돼 있었다.** PWA 작업 중 다른 이유로
  걷어냈다(다크 아이폰에서 `.sp-body`가 못 덮는 영역이 `#0a0a0a`로 칠해지던 버그). 할 일 없었다.
- **§4-2 "`:root` 블록이 lab==master"는 표현이 틀렸다.** 토큰은 `:root`가 아니라 **`.sp-body`**에 있다.
  실제 diff는 master에 `--memo-base-font` 하나가 추가된 것뿐이라 결론(회귀 위험 0)은 맞았다.
  lab이 `[data-theme="dark"] .sp-body`로 (0,2,0) 대 (0,1,0)으로 이기게 써놔서 그대로 작동한다.
- **§4-4의 죽은 셀렉터 4개 중 `.mini-date-today`는 재타겟이 아니라 폐기가 맞다.** lab에
  `[data-theme="dark"] .mini-date-day.today` 규칙이 이미 따로 있다(lab 4089). `.mini-date-today`와
  `.mini-date-footer`는 그냥 지우면 되고, 실제 재타겟이 필요했던 건 `.job-title` 하나
  (→ master의 `.job-role-title`, `Dashboard.tsx`의 h4)다.
- **§4-5-1 "토글 버튼 2곳 = 데스크톱 헤더 + 모바일 헤더"는 틀렸다.** 헤더는 하나고, 두 곳은
  `isLoggedIn` 삼항의 **로그인/비로그인 분기**다. 결과적으로 붙일 자리 2곳인 건 맞다.

### 문서에 **없던 것** — PWA 때문에 새로 생긴 요구사항

- **`color-scheme: light`가 두 곳에 못박혀 있다**: `globals.css`(신규, PWA 검은화면 수정 때 들어옴)와
  `dashboard.css`의 `.sp-body`. 후자는 lab이 이미 이기지만, **전자는 `:root`와 `[data-theme="dark"]`가
  특이도 (0,1,0) 동률**이라 소스 순서로 갈린다. 그래서 다크 선언을 **`globals.css` 안, `:root` 바로
  뒤**에 뒀다. 다른 파일에 두면 번들 순서에 운을 맡기게 된다.
- **PWA standalone 상태바**: `manifest.ts`의 `theme_color`는 설치 시점에 박혀 런타임에 안 바뀐다.
  실제로 색을 따라가는 건 `<head>`의 `<meta name="theme-color">`이고, FOUC 스크립트와 `toggleTheme`이
  같이 갈아끼운다(`#d9cbff` ↔ `#0b0d19`). **Next의 `viewport.themeColor`로 옮기지 마라** — 그 export를
  두는 순간 기본 viewport meta가 안 나가고, 조건부 값은 `prefers-color-scheme`뿐이라 이 앱에선 못 쓴다.
- **iOS 스플래시/상태바는 범위에서 뺐다(사용자 승인).** iOS는 `theme-color`를 무시하고, 해법인
  `black-translucent`는 `viewport-fit=cover`와 한 덩어리라 이미 보류된 건이다. 실기기 확인 항목.

### 새로 만든 자산

- **다크 전용 토큰 레이어** (`dashboard.css`, Phase 2 블록 안): `--dk-surface` / `-hover` / `-strong`,
  `--dk-sheet`, `--dk-well` / `-hover`, `--dk-border` / `-soft`, `--dk-shadow`, `--dk-blur`, `--dk-accent`.
  **규칙: 앞으로 추가되는 다크 규칙은 헥스를 직접 쓰지 말고 이 토큰을 쓴다.**
  lab 이식분 1,800여 줄은 헥스 하드코딩 그대로 뒀다 — 검증된 코드를 건드리는 순수 churn이라서다.
  `--dk-surface`(흰색을 얹는 면)와 `--dk-well`(배경보다 어두운, 파내는 면)의 구분이 핵심이다.
- `scripts/audit-dark-coverage.py` — 미커버 클래스 재측정용. 여전히 유효(67/65).

---

## 11-2. 🔴 이번 세션에서 실제로 시간을 태운 함정 3가지

문서 12절에 이미 비슷한 항목이 있지만, **다크모드에서 어떻게 나타나는지**가 달라서 따로 남긴다.

### (1) 특이도 역전 — "다크 규칙을 썼는데 연회색으로 남는다"

먼슬리메모 하단 목록과 프로젝트 목록이 계속 연회색이었다. 규칙이 없어서가 아니었다:

```
라이트  dialog.tonedown .memo-row      (0,2,1)   ← 이김
다크    [data-theme="dark"] .memo-row  (0,2,0)   ← 무시됨
```

두 다이얼로그가 **`glass-dialog big tonedown`**이라 그 안에서는 라이트가 이긴다. 파일 뒤쪽이어도
특이도가 낮으면 진다. 같은 유형이 `.proj-table` / `.memo-search` / `.proj-search` / taskList 체크박스까지
5건 있었다. **해법은 다크도 같은 컨테이너를 타서 (0,3,1)로 올리는 것.** `!important`는 쓰지 마라 —
라이트가 `!important`가 아니라 특이도만으로 충분하고, 뿌려두면 다음 사람이 아무것도 못 이긴다.

전수 검사 방법(다음에도 그대로 써라): 라이트/다크 규칙을 셀렉터별로 파싱해 **마지막 클래스 + 속성**이
같은 조합을 찾고, 라이트 특이도가 모든 다크 규칙보다 높으면 출력한다. 21건이 나왔고 그중 손대면
안 되는 것(`.big-postit.c6/.c7` 하위, `memo-compose-color-black` 하위)이 16건이었다 —
**검정/진회색 메모지는 라이트에서도 이미 어두운 카드라 밝은 글자를 쓴다. 덮으면 §5가 깨진다.**

### (2) 스캔 임계값이 대상을 통째로 누락시켰다

Phase 3 대상을 뽑을 때 "밝은 배경"을 **휘도 0.80 + 알파 0.55 이상**으로 걸렀다.
`.memo-row`는 `rgba(255,255,255,.45)`라 **알파 컷오프에 걸려 조용히 빠졌다.**
0.20으로 내려 다시 뽑아야 했다. 목록·개수는 손으로 세지 말라는 CLAUDE.md 규칙의 다른 얼굴이다 —
**뽑는 조건 자체가 틀리면 자동화도 똑같이 틀린다.**

### (3) `backdrop-filter`는 fixed 자식의 containing block을 만든다

상태 드롭다운을 포털로 빼고 `position: fixed` + 뷰포트 좌표로 띄웠더니 **웹에서만** 엉뚱한 곳에 떴다.
`dialog.glass-dialog`에 `backdrop-filter: blur(30px)`가 있어서 그 요소가 fixed의 기준이 된다.
실측: 다이얼로그가 (113,399)에 있으면 fixed의 (0,0)이 화면 (114,400)에 그려진다.
**모바일이 멀쩡했던 건 다이얼로그가 전체화면(0,0)이라 어긋남이 0이었기 때문**이고, 그래서
"모바일은 되는데 웹만 이상하다"로 보였다. → **host 기준 상대좌표 + `position: absolute`**로 해결.

포털에는 대가가 하나 더 있다: **조상 클래스에 의존하는 CSS가 전부 죽는다.**
이 경우 10개 규칙(`.proj-detail-editing .proj-filter-panel{width:98px !important}` 등)이 걸려 있었다.
→ 조상 클래스 체인을 **`display: contents` 래퍼**로 재현했다. 셀렉터 매칭에만 참여하고 상자는 안 만든다.
CSS를 10곳 고쳐 포털용 셀렉터를 덧붙이는 것보다 낫다(두 벌을 영원히 맞춰 써야 하므로).
폭은 인라인 `width` 대신 **`--anchor-w` 변수**로 넘겨야 한다 — 인라인 width는 더 구체적인 CSS 규칙까지
이겨버려서 모바일 크기를 깨뜨린다.

---

## 11-5. 2026-08-24 (2) 성능·버그 세션 — 커밋 `fce8918`~`24e73d8`

### 제일 중요한 것: 태평양 왕복

Supabase는 **AWS 서울(ap-northeast-2)**, Vercel 함수는 **iad1(워싱턴DC)**이었다.
근거: `db.<ref>.supabase.co` → `2406:da12:1f1:f800::` → AWS `ip-ranges.json`의 `2406:da12::/36`.
`/` 한 번에 태평양을 **4번 직렬**로 건넌다(proxy `getUser` → page.tsx `getUser` **중복** →
`getProfile` → 6쿼리 배치). 왕복 200ms면 렌더 시작 전 ~800ms. Speed Insights FCP 5.2s /
LCP 6.42s에서 둘 간격이 1.2s뿐이었던 게 이것이다(렌더블로킹 CSS는 51KB gzip으로 문제 아님).

🔴 **아직 안 됐다.** `vercel.json`에 `"regions": ["icn1"]`을 넣었다가 되돌렸다(`ab45fd5`) —
플랜이 거부하면 배포가 통째로 실패하는데, 그걸 **사용자가 테스트할 수정들 사이에 끼워 넣어서**
`66f2cfe`~`2083b6b`가 전부 배포되지 않았다. 사용자는 "왜 수정이 안 되냐"를 두 번 물었고 원인이 이거였다.
→ **Project Settings → Functions → Function Region → icn1** 로 설정해야 한다. vercel.json에 다시 넣지 말 것.

### 고친 것

| 증상 | 진짜 원인 |
|---|---|
| 아이디어빌드 저장 팝업이 "맨 위로 스크롤해야 보임" | `.idea-save-overlay` 3개가 `.ai-direction-modal` 안에 있었다. 그 모달의 `backdrop-filter`(1963줄)가 `position:fixed`의 containing block이 되어 fixed가 absolute처럼 굴었다. dialog 직속으로 옮김 |
| 상세 헤더 4곳(뉴스/채용/AI트렌드/먼슬리) 다크에서 연회색 | 3240줄 sticky 배경 `rgba(250,249,255,.9)`에 다크 오버라이드가 없었다. **같은 `@media` 안에** 추가(밖에 두면 데스크톱 다크에 없던 배경이 생긴다) |
| 채용공고 수집 최악 900초 | 3소스가 똑같은 순차 for 루프. `extractCandidatesFrom` 하나로 합치고 동시성 5 파도 + 20초 예산. **조기 종료가 없어서**(항상 `slice(0,cap)` 전량) 병렬화해도 URL·개수·순서 불변 |
| 상세 페이지 1건 타임아웃 → 그 사이트 수집 전체 폐기 | `fetchWantedJobDetail`이 fetch를 try로 안 감싸 throw가 바깥 try까지 올라갔다. URL별 catch |
| `/api/air-quality`, `/api/weather-warnings` 무한 대기 가능 | `AbortSignal` 없음(weather.ts가 `f0f7066`에서 이미 배운 버그). 4초 + warnings는 `withDeadline` 6초 |
| 날씨가 통째로 null 되는 구간 | 실황·예보를 순차 await → 최악 4회 직렬 16초가 6초 데드라인 초과. 두 체인 `Promise.all` |
| 모바일 선택 핸들로 범위 조정 시 마지막 조정이 사라짐 | `selectionchange` 이펙트에 **의존성 배열이 없었다.** cleanup의 `clearTimeout`이 자기가 유발한 렌더로 다음 디바운스를 죽였다. `[]` |
| "최근 추천" 탭이 영구히 빈 채 굳음 | `cancelled`/`catch` 없음(형제 이펙트 둘은 있다). 세션 만료 시 `jobsRecent`가 `null`에 갇히고 재조회 조건이 `null`이라 재시도 불가 |
| 메모 "기간" 필터가 이전 범위 결과를 보여줌 | 취소 가드 없음 + 한쪽 날짜만 찬 구간 미처리. 후자는 파생값으로 |
| 관리자 아이디어빌드 2회 제한 | 게이트가 **두 군데**. `actions/ai.ts:50`은 admin 통과인데 버튼 `disabled`/배지/문구 3곳이 인라인 계산으로 `isAdmin`을 빼먹었다. `ideaExhausted` 하나로 통합 |
| "지금 업데이트" 무반응 | `retryJobs`가 DB 행만 지웠다. `generate.ts`의 `candidateCache`가 살아서 **같은 후보를 그대로 반환** → 배치 동일, `view.stale`도 false라 에러조차 안 떴다. `clearCandidateCacheFor(today)` |

UI: `✦ IDEA · nn` 배지 다크 대비, 웹 추천방향 20px / 섹션제목 18px(모바일 불변),
5개 섹션 문장 단위 줄바꿈(`splitSentences` + `SentenceLines`, `<li>` 때문에 `<p>` 대신 block span),
모바일 다크 프로젝트 입력칸 3개 경계 제거, 관리자에게 `n/n` 카운터 숨김.

### 🔴 이 세션에서 태운 함정 (같은 실수 반복 금지)

1. **크롬 반응형 375px은 실기기와 다르다.** 저장 팝업 버그를 프로브까지 넣어 "라이트/다크 ×
   생성전/결과 4조합 전부 뷰포트 기준(0,0)"으로 실측하고 **정상이라 판단해 수정을 되돌렸다.**
   그 환경에서는 `.ai-direction-modal`의 `backdrop-filter`가 `none`으로 계산된다. 실기기에서만 터진다.
   사용자의 "스크롤해서 올라가야 뜬다"는 말이 유일한 결정적 증거였다.
2. **입력칸만 재고 감싼 상자를 안 쟀다.** 모바일 다크 경계를 두 번 "고쳤다"고 보고했는데
   정작 거슬리는 건 `.proj-body-input`(프로젝트 내용, 345x374)이었다. 스캔 범위를 **폭 180px 이상
   상자**로 넓히자 한 번에 나왔다. `<input>`만 쿼리하지 말고 폼 전체를 훑어라.
3. **특이도 동일 + 파일 뒤쪽 = 다크가 이긴다.** 모바일 경계 제거가 세 번 실패한 공통 원인.
   `.proj-detail-editing .proj-body-input`(0,2,0)과 `[data-theme="dark"] .proj-body-input`(0,2,0)이
   같은데 다크가 뒤에 있어 이긴다. `[data-theme="dark"]`를 앞에 붙여 (0,3,0)으로 올리면 `!important` 불필요.
   `#proj-title`/`#proj-summary`는 ID라 (1,1,0) — 여기만 `!important`가 필수다.
4. **"제일 심각하다"고 말한 걸 안 고치면 신뢰를 잃는다.** 채용공고 N+1을 "크롤 횟수가 바뀐다"는
   **틀린 이유**로 미뤘다(루프에 조기 종료가 없어서 안 바뀐다). 사용자가 화냈고 정당했다.

### 점검 인프라

`focus.check.ts`와 `idea-text.check.ts`가 **어떤 npm script에도 안 묶여 한 번도 안 돌고 있었다** —
`generate.check.ts` 헤더가 경고한 바로 그 함정. `check:ai` + 우산 `npm run check` 추가.
**세션 끝에 `npm run check` 한 번 돌려라** (현재 12개 전부 통과).
새 점검: `extractCandidatesFrom` 4항목(전량 요청/순서 보존/동시성 최대치 실측/throw 격리),
`splitSentences` 6항목(소수점·버전 미분할 + 알려진 한계 명시).

### 🔴 남은 것

- ~~**Function Region → icn1**~~ ✅ **2026-08-24 (3)에 설정 완료.** 유료 아니었다 — 11-6 참조. 재배포 필요.
- **`ADMIN_EMAILS`는 Vercel Production 환경변수에 있어야 한다.** `.env.local`은 gitignore라
  배포에 안 올라간다 — 로컬은 되고 배포는 안 되는 게 정상 동작이다. 사용자가 추가 완료했다고 확인함.
- 🔴 **2026-08-25: 배포에서 "지금 업데이트" → "채용공고 수집에 실패했습니다" (원인 미확정).**
  `view.stale`이니 오늘 배치가 0건이라는 뜻이다. **로컬은 정상이다** — Tavily 검색(7.4초, 3건),
  wanted/jumpit/jobkorea 상세 fetch 전부 성공을 실측했다. 배포에서만 실패한다.
  세 소스의 catch(generate.ts 176/245/280)는 **전부 `tavilySearch` 실패를 잡는 자리**라,
  Tavily 하나가 죽으면 3소스가 동시에 0건이 되고 곧바로 stale이 된다 — 가장 유력한 단일 원인이다.
  리전을 icn1으로 바꾼 것이 유일한 새 변수이고, IP 차단/왕복 증가 어느 쪽도 **증명하지 못했다.**
  → **`recordCollectError`를 넣어 실제 사유를 팝업에 같이 띄우게 했다.** 다음에 재현되면
  팝업 문구 자체가 원인을 말해준다(`원티드 — TimeoutError: ...` 형태). 추측으로 값을 조정하지 마라.
  `notifyApiFailure`가 `elf.serin91@gmail.com`으로 **실패 메일도 보낸다** — 메일함이 더 빠른 증거다.
- 채용공고 수집을 **실제 크롤로는 못 재봤다.** 20초 예산/동시성 5는 코드상 상한이지 실측값이 아니다.
  예산이 너무 타이트하면 후보가 줄어 `partial`이 늘 수 있다 — 배포 후 실제 건수를 봐야 한다.
- `page.tsx`의 `getUser()` 중복(proxy에서 이미 함) 제거 미실행. icn1 적용 후엔 왕복 10ms라 이득이 작다.
- 이 세션 UI 수정 전부 **실기기 미검증**.

---

## 11-3. 남은 것 / 미검증 (다음 세션이 먼저 볼 것)

- ✅ **다이얼로그·모달 내부 다크 전수 확인 — 2026-08-24 (3) 세션에서 완료.** 사용자가 로그인해준
  브라우저에서 dialog 13개를 전부 `showModal()`로 열어 대비 실측했다. 결과는 11-6.
- ✅ **프로젝트 입력/수정의 상태 인풋창 — 실물 확인 완료 (2026-08-24 (3)).** 드롭다운을 실제로 열어
  트리거·패널·옵션 4행을 전부 쟀다: 패널 141px / 옵션 123px / `white-space:nowrap` / `scrollWidth==clientWidth`,
  **넘침 0건.** 스크린샷으로도 4개 옵션이 칸 안에 들어간 것을 확인했다. 패널 위치도 트리거 바로 아래
  정렬(11-2-3의 좌표계 버그 재발 없음). 참고: 이 트리거는 (25)절에서 테두리·배경·좌우 패딩이 전부
  제거돼 있어 다른 필드와 달리 "칸"이 안 보인다 — 증상 설명이 어긋나기 쉬운 지점이다.
- **성능**: 배포 기준 키노트 다이얼로그 열기 156ms(첫) / 63ms(재열기). 로컬 dev는 2282/2380ms인데
  **dev는 StrictMode 이중 렌더 + 비최적화라 15배 느리다 — 로컬 수치로 판단하지 마라.**
  드래그 순서 state는 `KeynoteCardList`(`memo()`)로 내려 Dashboard 전체 재렌더를 끊었고,
  카드에 `content-visibility: auto`를 걸어 화면 밖 카드를 건너뛴다(36장 스크롤 134.3ms → 12.3ms).
  가로스크롤 체감은 **아직 사용자 확인 대기**.
- **Notion 동기화 대기** (CLAUDE.md §0-1) — MCP 미인증이라 이 세션에서 못 했다. 사용자가 나중에 일괄 처리 예정.

---

## 11-6. 2026-08-24 (3) Phase 5 마무리 — 대비 실측으로 잔여 10건

### 🔴 Vercel Function Region — 해결 (11-5의 "남은 것" 1번)

**유료 결제는 필요 없었다.** Hobby도 **단일 리전 변경은 가능**하고, Pro가 필요한 건 리전을 2개 이상
쓸 때다([문서](https://vercel.com/docs/functions/configuring-functions/region): Hobby=Single region /
Pro=5). 사용자가 본 유료 안내는 iad1을 켠 채 icn1을 추가해 2개가 됐기 때문이었다.
→ **iad1 해제 후 icn1만 체크**로 설정 완료. `vercel.json`에는 넣지 않는다(`ab45fd5` 사고 재발 방지).
⚠️ 설정만으로는 기존 배포에 안 붙는다 — **재배포해야 적용된다.**

### 검증 방법 — 다음 세션도 이걸 써라

**감사 스크립트의 "다크 규칙 없음"은 버그 목록이 아니다.** `audit-dark-coverage.py`가 지목한 27개 중
실제로 깨진 건 소수였다 — 나머지는 `var(--ink)`/`var(--muted)`/`transparent`/`currentColor`라
다크 토큰을 이미 따라간다. **셀렉터 유무가 아니라 실제 대비율을 재야 한다.**

브라우저에서 돌린 스캐너(다음에도 재사용할 것):
1. 요소별 `color`와 **합성 배경색**(조상을 타고 올라가며 알파 합성, `linear-gradient`는 색 stop 평균으로 근사)의 **WCAG 대비율**을 계산해 3.0 미만을 뽑는다.
2. 동시에 **다크에서 밝게 남은 면**(자기 배경 휘도 > 0.6, 면적 > 600px²)을 뽑는다. 대비만 보면 "흰 배경 + 검은 글씨"를 못 잡는다.
3. `dialog` 13개를 순차로 `showModal()` → 스캔 → `close()`. **닫힌 dialog도 DOM에 마운트돼 있다.**
4. `.postit`/`.big-postit`/`.keynote-sticky` 하위는 **제외한다** — 메모지는 다크에서도 밝은 유리 카드고 글자가 어두운 게 정답이라 전부 거짓양성(첫 스캔에서 68건 중 64건이 이것이었다).
5. `gradient` 조상을 만나면 스킵하는 초기 버전은 **78개를 통째로 누락**시켰다(`.sp-body`가 gradient라 거의 전부 스킵). 11-2-2와 같은 실패 — **거르는 조건이 틀리면 자동화도 똑같이 틀린다.**

**스크린샷이 이 세션에서는 됐다.** 브라우저 패널이 화면에 보이면 된다. 세션 시작에 한 번 찍어봐라.
(단 이 환경은 페이지를 ~0.3배로 그리고 `zoom` region crop은 미지원 — 클릭 좌표는 스크린샷 좌표계다.)

### 고친 것 — `dashboard.css` 파일 끝 새 섹션 9개 + `auth.css` 1개

전부 `[data-theme="dark"]` 접두 = **라이트 회귀 구조적으로 0**(라이트에서 10개 셀렉터 재측정, 원래 값 유지 확인).
전부 **미디어쿼리 밖** = 웹·모바일 동시. 새 색은 만들지 않고 `--dk-*` 토큰만 썼다.

| # | 대상 | 라이트 값 | 증상 |
|---|---|---|---|
| 1 | 🔴 `dialog.glass-dialog.body-editor .dialog-head` | `rgba(248,249,255,.94)` | **"본문 작성" 전체화면 에디터 헤더가 흰 띠**로 남아 그 위 제목·닫기버튼(흰 글자)이 **대비 1.05 — 사실상 안 보였다.** `3259`줄이 상세헤더 3곳을 고칠 때 이 하나가 빠졌다 |
| 2 | `.copy-picker-date-row` | `rgba(255,255,255,.45)` | 저장/복사 날짜 줄이 흰 판때기 |
| 3 | `.support-feature-option` hover/선택 | `rgba(214,222,255,.48)` | 밝은 라벤더 |
| 4 | `.feedback-helper-example` | `#8991ac` | 대비 부족 |
| 5 | `.cal-more-indicator` | `#6d58ed` | 대비 부족 |
| 6 | `.job-tabs` / `.job-detail-content` | `rgba(78,86,145,.12)` | 어두운 보더라 선이 사라짐 |
| 7 | `.mobile-memo-color-dot` / `-current` | `rgba(35,35,45,.24)` | 거의 검은 테두리 |
| 8 | `.mypage-field-label em` | `rgba(66,78,129,.62)` | "(변경 불가)" 대비 1.58 |
| 9 | `.idea-direction-box-icon` | `#6654d9` | 대비 2.57 |
| 10 | `.role-card-check` (**`auth.css`**) | `rgba(255,255,255,.7)` | 미선택 체크 원이 흰 점으로 튐. 선택 상태(`--sp-focus`)는 안 건드림 |

### 🔴 다크 포스트잇 수정화면 입력칸 경계 — 특이도로 지고 있었다

사용자 지적: "웹에서 포스트잇 기본+전체메모 수정 시 입력칸 경계 있음."
**규칙이 없어서가 아니었다.** 이미 두 곳이 경계를 걷어내고 있었는데 다크 규칙에 지고 있었다:

| 규칙 | 특이도 | |
|---|---|---|
| `5784` `.big-postit .rich-editor-content` (웹) | (0,2,0) `!important` | 짐 |
| `4190` 같은 셀렉터 (모바일) | (0,2,0) `!important` | 짐 |
| `7256` `[data-theme="dark"] .rich-editor-content.color-input-white` | (0,3,0) `!important` | **이김** |

**같은 `!important`끼리는 특이도가 먼저다.** 그래서 라이트는 매끈한데 다크만 사각형이 남았다.
입력칸이 포스트잇과 거의 같은 색인데 **알파만 더 진하고**(.98/.95 vs .95/.89) 135° sheen이
입력칸 안에서 **다시 시작**해서, "같은 색인데 사각형만 보이는" 상태였다.
→ 파일 끝에 (0,3,0)으로 다시 써서 순서로 이긴다. 미디어쿼리 밖이라 웹·모바일 동시.
라이트 스크린샷과 나란히 비교해 **다크가 라이트와 같아진 것**을 확인했다(기본/전체메모 둘 다).

⚠️ 남겨둔 것: 제목 밑줄(`.big-title-input` `border-bottom`)과 날짜 버튼(`.mini-date-trigger`)의
테두리·배경은 **라이트에도 똑같이 있다.** 클릭 컨트롤이라 경계가 필요하고, 지우면 라이트와 달라진다.

### 🔴 2026-08-25 후속 — 같은 특이도 역전이 세 군데 더 있었다

사용자가 "아직 경계있는데?"라고 다시 지적했다. **내가 본문만 고치고 나머지를 "컨트롤이라 경계가
필요하다"고 판단해 남겨둔 게 원인이었다** — 사용자가 지우라고 한 건 그 컨트롤들이었다.
CLAUDE.md의 "같은 지적이 3번 반복되면 값이 아니라 문제 정의를 의심하라"가 여기 해당한다.

| 화면 | 지고 있던 규칙 | 이긴 규칙 | 증상 |
|---|---|---|---|
| Create(`.memo-compose-open`) | `5395` (0,3,0) `!important` | `7206` `[data-theme="dark"] .rich-editor-content.color-input-*` (0,3,0) `!important`, 파일 뒤 | 본문 판때기 |
| Create 제목·본문 글자 | — | `7823`/`7833` `[data-theme="dark"] .memo-form input` `color:var(--ink)` | **노란 메모지에 흰 글자 = 안 보임** |
| 모바일 헤더 액션 | — | `3619` `.mobile-editor-head-actions button { color: var(--ink) }` | 라이트에선 어두웠는데 다크에서 흰색이 되어 묻힘 |
| 모바일 헤더 상자 | — | `8260` `--dk-surface` 배경 + `--dk-border` | 버튼 묶음에 회색 상자 |

**글자색은 색을 새로 정하지 않고 `color: inherit`으로 넘겼다.** `.memo-form.open`(웹 5383) /
`.dialog-inner`(모바일 3829)가 이미 메모 8종별 color를 갖고 있어서, 검정·진회색은 `#f5f5f5`,
나머지는 각자의 어두운 색이 **자동으로** 따라온다. 여기에 색을 박으면 8종을 두 벌로 관리하게 된다.

⚠️ **`.close-btn`(뒤로가기 ‹)만 구조가 다르다.** `::before`가 `color: var(--ink)`를 직접 쓰고
(3140줄) 버튼 본문 "✕"는 `color: transparent`로 숨겨져 있다. `color: inherit` + `font-size: 0`으로
되돌리고 `::before`가 상속받게 했다(`::before`는 자기 font-size 선언이 있어 0을 안 물려받는다).
**이 블록은 반드시 `@media (max-width: 720px)` 안에 있어야 한다** — 데스크톱의
`.big-postit .close-btn`은 `::before` 없이 "✕" 글자를 그대로 쓰므로, 밖에 두면 닫기 버튼이 사라진다.

`.mobile-important-btn.active`(별표 활성 `#d89b05`)를 덮지 않도록 `:not(.active)`로 뺐다.

**의도적으로 안 고친 것** (다음 세션이 "버그"로 오해하지 마라):
- `memo-compose-color-*` 8종 — 11-2-1의 "덮으면 §5가 깨지는 16건"
- `.row-logo-box.wanted-logo` `rgba(245,248,255,.92)` — 채용 사이트 로고를 담는 44px 흰 박스. 흰 배경이 로고 표시에 맞다
- `.trend-core` / `.trend-bubble` — gradient 배경 위 어두운 글자. 실측 대비 통과

### 최종 상태

| 검사 | 결과 |
|---|---|
| 다크 1280 (페이지 + dialog 13개) | **0건** |
| 다크 375 (페이지 + dialog 13개) | **0건** |
| 라이트 회귀 (수정 10개 셀렉터 재측정) | **0건** |
| `npx tsc --noEmit` | exit 0 |
| `npm run check` | exit 0 (11 OK) |

**미검증:** 실기기(iOS/Android) 미확인. `npx next build` 미실행. 조건부 렌더라 DOM에 없어
자동 스캔이 못 연 화면 일부(도움말 기능 선택 패널, 저장/복사 날짜 줄, 모바일 색상 패널) —
2·3·7번은 라이트 CSS 값만 보고 고쳤고 **화면으로는 확인 못 했다.**

---

## 11-4. 검증 도구 — 이 세션에서 실제로 통한 것

- **라이트 회귀는 눈이 아니라 멀티셋 비교로 증명한다.** 요소별 computed style을 `태그#클래스` 키로
  묶고 값 배열을 **정렬해서** 비교하면 순서 변화(SVG·무클래스 버튼이 한 버킷에 뭉치는 것)를 무시하고
  실제 회귀만 남는다. 인덱스 기준 diff는 73·56·4건의 **전부 거짓양성**이었다. 이 방법으로
  375px 273키 / 1280px 301키에서 **회귀 0건, 사라진 요소 0건**을 확인했다.
- **다크 규칙이 "안 먹을" 때 순서**: (a) 규칙이 있나 → (b) 특이도로 지고 있나(11-2-1) →
  (c) 클래스가 마크업에 실제로 붙나. `!important` 프로브(`[data-theme="dark"] .x{...!important}`를
  주입해도 안 바뀌면 규칙이 파싱조차 안 된 것)도 유용하다.
- ⚠️ **브라우저 페인이 화면에 안 보이면 컴포지팅을 안 한다.** 스크린샷이 타임아웃하고,
  **더 고약하게는 JS로 테마를 토글한 직후 `getComputedStyle`이 갱신 전 값을 준다.**
  `.header-icon-btn`이 다크에서 라이트로 보인다고 15분을 헛짚었는데 CSS는 처음부터 정상이었다.
  **다크 색 검증은 `localStorage.setItem('skillpilot_theme','dark')` 후 리로드로 하라.**
- **페인트 비용은 이 환경에서 못 잰다.** 강제 레이아웃(`offsetWidth`)만 측정되므로
  "레이아웃은 싼데 느리다"까지가 한계다. 그 이상은 사용자 실측이 필요하다.

---

## 12. 재발 방지 — 이전 세션들에서 누적된 교훈 (원문: `git show 4fd9e54:HANDOFF_NEXT_CLAUDE.md`)

**다크모드 작업에도 그대로 적용되는 것만 옮겼다. 개별 버그의 실측 수치는 원문 참고.**

- **"규칙이 적용 안 되는" 경우는 세 가지다.** (a) 규칙이 없다, (b) 규칙이 있는데 뒤의 규칙이 덮어쓴다,
  (c) **규칙은 정확한데 그 규칙이 기대하는 클래스가 마크업에 아예 안 붙어 있다.**
  (c)가 "프로젝트에 저장 팝업"이 6번이나 안 고쳐진 진짜 이유였다(`.idea-save-overlay`가 CSS엔 있고 JSX엔 0개).
  **→ 다크모드 이식에서 이게 가장 위험하다.** §4-4에서 291개를 CSS 기준으로 셌으니,
  안 먹는 규칙이 나오면 **JSX에서도 그 클래스 개수를 세라.**
- **특이도(specificity) 역전도 "덮어쓰기"다.** 파일 뒤쪽이어도 클래스 1개 규칙은 앞쪽의 클래스 2개 규칙을
  못 이긴다. `[data-theme="dark"] .big-postit`(속성1+클래스1)이 `.big-postit.has-insert-banner`(클래스2)에
  질 수 있다 — **`getComputedStyle`로 실제 적용값을 확인하고 값을 손대라.**
- **이 코드베이스는 파일 끝에 `(N) 무슨무슨 수정` 식 날짜별 섹션이 계속 쌓이는 구조다.**
  grep으로 셀렉터를 찾았으면 **파일 안에 몇 번 나오는지 개수를 세고 순서대로 다 읽어라.**
  `!important`로 뒤에서 다시 정의된 경우가 매우 많다.
- **"작성"과 "수정"은 대부분 다른 DOM/다른 CSS 클래스다.** `.memo-form.open`(작성) vs `.big-postit`(수정).
  겉보기엔 같은 기능인데 마크업이 완전히 분리된 화면이 여러 곳 있다 — **다크 규칙도 양쪽에 다 필요하다.**
- **outside-press(document mousedown) 패턴 컴포넌트는 "CSS로 숨겨진 형제 컴포넌트"까지 의심하라.**
  `display:none`으로 숨겨진 데스크톱 컴포넌트가 같은 트리에 마운트돼 리스너를 갖고 있는 경우가
  최소 2건 있었다(`RadialSelectionMenu`, `LinkPopover`).
- **합성 클릭(`.click()`)으로 "정상 확인"이라고 결론내지 마라.** 두 번의 치명적 버그가 이렇게 숨었다.
- **"코드에 원인이 없다"와 "버그가 없다"는 다르다.** 사선/이탤릭 버그는 코드 스캔 0건이었지만
  실제로는 폰트 렌더링 문제였다 — 스크린샷으로 실물을 보기 전엔 성급히 결론내지 마라.
- **`mobile-responsive`(3001) 대조는 양방향으로 봐라**: (a) 3001엔 있는데 master엔 없는 것(누락),
  (b) master에만 나중에 붙은 override가 3001 값을 되돌리는 것(회귀). 한쪽만 보고 끝내지 마라.
- **폰트 크기는 무조건 `--memo-base-font`를 거쳐야 한다.** 웹 18px(`dashboard.css:23`) /
  모바일 16px(파일 뒤쪽 재정의). **사용자가 "웹/모바일 2px 차이"를 명시 요청했으므로 두 값을
  같게 만들지 마라.** 새 다크 규칙에 본문 폰트가 들어가면 `var(--memo-base-font)`를 써라.
- **레이아웃 무변경이 필요한 곳에서 위치만 옮길 땐 `transform: translateX()`.**
  margin/padding은 flex 형제의 폭 예산을 바꿔 제목 잘림 같은 과거 버그를 되살린다.
- **글로우/그림자가 옆 텍스트를 뿌옇게 만드는 건 페인트 순서 문제일 수 있다.** `position:relative`
  요소의 box-shadow는 static 형제 **위에** 그려진다. **다크모드는 glow를 훨씬 많이 쓰므로 이 함정이
  더 자주 나온다** — 해결은 텍스트에 `position:relative;z-index:1`(레이아웃 무변경).
- **같은 지적이 3번 반복되면 값을 또 조정하지 말고 "내가 목적을 잘못 구현하고 있는가"를 봐라.**
  Coming Soon 패널이 4번 지적받은 뒤 원인이 "값이 작아서"가 아니라 "영역을 잘못 잡아서"였다.
- **이 프로젝트의 예쁜 UI 레퍼런스는 `.help-hero` / `.feedback-helper-panel` / `.help-feature-card`다.**
  새 장식 UI가 필요하면 여기서 토큰을 가져와라 (사용자가 직접 알려준 것).
- **테스트로 사용자의 실제 데이터를 건드렸으면 반드시 되돌려라.** 자동저장이 걸린 화면이 많다.
- **`display:contents` 트릭 주의**: `.proj-top-cluster` / `.proj-top-cluster-left`는 모바일에서
  `display:contents`로 박스를 지워 flex `order` 트릭을 살리고 있다.
  **다크 규칙에서 이 두 wrapper에 background/border/shadow를 주면 모바일 레이아웃이 깨진다.**

---

## 13. 사용자 성향 메모 (누적)

- **한국어로 대화.** 피드백은 번호를 매겨 몰아서 준다. "치명적 버그"로 명시한 건 최우선.
- **작업 시작 전 "수정 예정 파일 + 구현 계획"을 짧게 보고하고 시작할 것** (§11 명시 요구사항).
- **작업 완료 후 보고는 5항목만**: ① 수정한 파일 ② 추가한 theme token ③ 다크모드 주요 디자인 결정
  ④ 확인한 주요 화면 및 인터랙션 상태 ⑤ 남아 있는 문제. **장문 설명 금지.**
- **같은 문제를 반복 지적하면 실제로 원인이 안 잡힌 것이다.** "이번엔 진짜 고쳤다"는 자기 확신보다
  실측(computed style / 좌표 / 실제 이벤트)이 항상 먼저다.
- **강한 표현(욕설 포함)으로 불만을 표시하면 그 항목이 여러 번 반복 실패한 것이다.**
  값을 또 조정하는 건 다음 실패로 가는 길 — `getComputedStyle`로 "이 규칙이 정말 적용되고 있는가"를 먼저 확인.
- **스크린샷/이미지를 첨부하면 그게 가장 정확한 증거다.** 텍스트 설명만으로 판단하지 마라.
- **토큰/속도에 예민하다.** 확신 있는 수정 위주로 빠르게, 라이브 검증 횟수를 아껴 써라.
- **커밋은 사용자가 명시적으로 요청하기 전엔 하지 않는다.** 단 §12-7은 체크포인트를 요구하므로,
  Phase가 끝날 때마다 **"커밋할까요?"를 물어라** (수천 줄 미커밋 방치가 이 프로젝트의 과거 사고 원인이다).
- **세션 끝나기 전 이 문서 갱신을 항상 기대한다.** 매 세션 종료 시 기본 작업으로 여겨라.
- 비밀번호/OAuth처럼 Claude가 대신 할 수 없는 요청은 이 환경(non-interactive)의 구조적 제약을
  담백하게 설명하고 대안을 제시할 것. 거절이 맞는 판단이다.
- 요청 목록에 "뉴스/채용공고 등"이라고 쓰면 **AI Trend Briefing도 포함**이다. 세 화면은 거의 항상
  같은 코드 경로를 공유하니 하나 고칠 때 셋 다 확인하라.
- **Supabase / Notion / Vercel MCP 서버는 현재 미인증 상태다.** 비대화형 세션에서 Claude가 OAuth를
  띄우는 건 불가능하다 — 필요하면 사용자가 직접 인증해야 한다.
