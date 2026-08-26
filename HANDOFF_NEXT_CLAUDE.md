# SkillPilot 다크모드 이식 — 다음 세션 인계 문서

> # 🛑 이 문서는 처음부터 읽는 문서가 아니다
>
> **다 읽지 마라.** 다 읽어봤자 "아는 것 같은 기분"만 늘고 실측은 줄어든다 —
> 그 상태로 태운 라운드가 최소 30번이다.
>
> ## 필수는 이 4줄뿐이다
>
> **1. 먼저 묻는다 — "예전에는 됐나? 언제부터? 뭐 추가하고 나서?"**
> 되던 게 깨졌으면 **회귀**고, 회귀는 문서가 아니라 **git이 답을 갖고 있다.**
> ```bash
> git log --oneline -S "<클래스명/함수명>" -- <파일>    # 10초
> git show <커밋> -- <파일> | grep "^[-+].*<셀렉터>"     # 뭐가 같이 딸려 왔나
> ```
> **2026-08-26: 이 질문 하나를 안 해서 10라운드·7시간을 태웠다.** 9라운드째에 사용자가
> "위로가기 생기면서 이지랄난 것 같은데"라고 했고, `git log -S` 한 번에 원인 줄이 나왔다.
> 그 9라운드 동안 나는 **코드를 읽고 있었다.**
>
> **2. [CLAUDE.md](CLAUDE.md) 3절 지뢰 표를 "읽지" 말고 grep해라.**
> 건드리는 단어(에디터·스크롤·포커스·viewport·overflow·`!important`·`:has()`)로 검색해서
> **내 diff에 해당하는 줄만** 꺼내 읽어라. 통독은 적용이 아니다.
>
> **3. "재현 안 됨"은 결론이 아니다.** 못 쟀다는 뜻일 때가 많다.
> 브라우저 패널이 화면에 안 떠 있으면 `rAF`가 **6900ms에 1번** 돈다(실측) — 스크롤·애니메이션은
> 아예 측정 불가고, 그 상태의 "정상"은 거짓 음성이다. 잘 돌아가는 **형제 화면과 나란히 비교**해라.
>
> **4. 규칙을 눈으로 읽고 순위를 매기지 마라. computed value를 실측해라.**
> 지뢰 표 자체가 틀리게 적혀 있던 적이 있다(2026-08-26 `--kb-inset`).
>
> ## 어디에 뭐가 있나 (전부 "grep 대상"이지 읽을거리가 아니다)
>
> | 찾는 것 | 어디 |
> |---|---|
> | **규칙**("하지 마라") | **[CLAUDE.md](CLAUDE.md) 3절 지뢰 표** — 정본 |
> | **사건 기록**(왜 그 규칙이 생겼나, 실측 수치) | **[docs/incidents.md](docs/incidents.md)** ← 11-1~11-10 전부 여기로 |
> | 지금 상태·미검증 항목 | 이 문서 **1절** + incidents **11-3** |
> | 다크모드 값·감사 수치 | 이 문서 **3·4·10절** (실측 원본, 지우지 말 것) |
> | 검증 도구 | 이 문서 **7절** + incidents **11-4** |
> | 모바일 스크롤/키보드 전체 경위 | [docs/mobile-pwa-postmortem.md](docs/mobile-pwa-postmortem.md) |
>
> ## 기록 의무 (사용자 명시 요구)
>
> - **같은 증상을 2번 이상 고쳤는데 또 나오면** → 값을 또 만지지 말고 기록한다.
>   무엇을 쟀고 · **무엇을 안 쟀고** · 왜 내 측정이 사용자가 보는 것을 못 봤는지까지.
> - **고쳤을 때도 기록한다.** "고쳤다"가 아니라 **어떻게** — 진짜 원인 · 실측(전/후) · **미검증 경로**.
>   셋 중 하나라도 빠지면 다음 세션이 같은 지뢰를 다시 밟는다.
> - 새 사건은 **[docs/incidents.md](docs/incidents.md) 끝에 짧게** 붙이고, 규칙 1줄은
>   **CLAUDE.md 3절 표**에 넣는다. 서사 말고 **원인 1줄 + 실측 수치 + 미검증** 형식으로.
>   (11-10절이 그 형식의 기준 예시다.)

최종 갱신: 2026-08-26 (KST). 최신 작업은 **[docs/incidents.md](docs/incidents.md) 11-10절**.
이전 갱신: 2026-08-24 (KST). **Phase 1~4 완료, Phase 5 부분.** 진행 상황과 함정은 incidents 11절에 있다.
(초판은 2026-08-21 작성 — 감사 완료 + Phase 0 결정 완료, 코드 변경 0줄 시점. 4절의 감사 수치는 그때 값이고,
 **그중 틀린 것 4가지를 [incidents.md](docs/incidents.md) 11-1에 정정해뒀다 — 4절만 읽고 착수하지 마라.**)
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
| `안티그래비티지침서 (1).md.obsolete` | 147 | **구버전. 2026-08-26에 `.obsolete`로 이름만 바꿔 비활성화했다.** 그 폴더는 git 저장소가 아니라 하드 삭제하면 복구가 안 돼서 지우지 않았다 — 되살리려면 확장자만 떼면 된다. |
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

## 11. 진행 상황 · 사건 기록 → **[docs/incidents.md](docs/incidents.md)** 로 분리했다

11절(11-1 ~ 11-10)이 이 문서의 **66%(1,416줄)**를 차지하고 있었다. 목적이 다른 두 문서가
한 파일에 있던 것이다 — 이 문서는 **다크모드 이식 인계**이고, 11절은 **사건 기록**이다.

- 사건 기록: **[docs/incidents.md](docs/incidents.md)** — 절 번호(11-1 ~ 11-10)는 그대로 유지했다.
- **한 줄도 지우지 않았다.** 통째로 이동만 했다.
- 쓰는 법: 통독하지 말고 **증상 단어로 grep**해라.
  `grep -n "스크롤 잠김\|캐럿\|kb-inset\|로고" docs/incidents.md`

작업 시작 시 확인할 "지금 상태 / 미검증 항목"은 위 **1절**과 incidents의 **11-3절**에 있다.

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
