@AGENTS.md

# SkillPilot — 작업 규칙

## 1. 이 프로젝트

AI 뉴스·채용공고·프로젝트 아이디어를 하나의 대시보드에서 다루는 Next.js 앱이다.
제품 repo는 이 폴더(`skillpilot/`) 하나이고, 부모 `미니프로젝트3/`는 workspace다
(`_reference/` 참고자료 · `_archive/` 과거자료).

- **Web / Mobile browser / PWA는 하나의 기능 범위다.** 셋 중 하나만 보고 고치면 나머지 둘이 깨진다.
  환경별 코드를 따로 만드는 게 목적이 아니다 — 공통 로직·공통 컴포넌트·반응형 CSS를 먼저 쓰고,
  **실제 동작이나 플랫폼 제약이 다를 때만** 분기한다.
- **`src/app/Dashboard.tsx`는 thin orchestration shell이다.** feature 전용 `useState`·effect를
  여기 다시 넣지 마라. 기능 상태는 `src/lib/dashboard/use*.ts` 훅이, 표현은
  `src/components/dashboard/*`가 갖는다.
- 사용자는 코드를 직접 짜지 않는다. 전문용어를 던지고 끝내지 마라.

**정본이 어디인지**

| 질문 | 정본 |
|---|---|
| 지금 제품이 어떤 상태인가 | **Notion CURRENT** (읽기만 — 쓰기 금지는 `AGENTS.md`) |
| 무엇을 어떻게 구현했나 | **git history** |
| 지금 어디까지 했고 다음은 무엇인가 | **`HANDOFF_NEXT_CLAUDE.md`** |
| 왜 이 규칙이 생겼나 (실측·경위) | **`docs/incidents.md`** |
| 어느 문서에 무엇을 쓰나 | **`AGENTS.md`** (이 파일 첫 줄이 매 세션 불러온다) |

## 2. 절대 규칙

**시작하기 전에**

- **되던 게 깨진 거면 회귀다. 문서가 아니라 git이 답을 갖고 있다.**
  코드를 읽기 전에 먼저 묻는다 — "예전에는 됐나? 언제부터 안 됐나? 뭐 추가하고 나서인가?"
  ```bash
  git log --oneline -S "<클래스명/함수명>" -- <파일>
  git show <커밋> -- <파일> | grep "^[-+].*<셀렉터>"
  ```
- **이번 변경과 직접 관련된 코드만 읽고 고친다.** 전체 탐색 금지.
- 재사용할 수 있는 로직·UI·패턴이 이미 있는지 먼저 본다. **기존 owner를 재사용한다.**
- 공용 컴포넌트나 공용 CSS를 건드린다면 **어느 화면들에서 쓰는지 먼저 grep**한다.
  화면 하나를 고치려고 전역 스타일을 바꾸지 않는다.
- 한 작업에 관계없는 리팩터링을 섞지 않는다. 이동과 동작 변경도 같은 커밋에 섞지 않는다.

**고칠 때**

- **UI 체감 신고("이상하다/빈약하다/잘린다")에 상수부터 만지지 마라.**
  ① 스크린샷·실제 DOM으로 무엇이 그렇게 보이는지 확정 → ② 후보를 전수로 세서 원인 1개로 좁힘
  → ③ 그 다음에 코드. **②를 건너뛰면 ③은 추측이다.**
- **어느 규칙이 이기는지를 `grep`으로 고르지 마라.** grep은 "규칙이 있나"만 답한다.
  열어놓고 computed value를 읽어라.
- **내가 바꾼 것을 재는 건 검증이 아니다.** 계측이 "매칭 0건"을 내면 계측부터 의심하고,
  기준선을 만들었으면 **양성 대조와 음성 대조**를 먼저 세워라.
- ref·editor mount·저장 순서처럼 다른 곳이 의지하는 계약은 보존한다.
  값이 아니라 **그 값의 소유자**를 봐라.
- 같은 증상을 2번 이상 고쳤는데 또 나오면 값을 또 만지지 말고 `/debug-hard`를 쓴다.

**운영 안전**

- 🔴 **`.env.local`은 운영 Supabase다.** 로컬 크론 호출 금지. 검증 중 타이핑·저장·삭제·드래그 금지.
  Jobs "지금 업데이트"도 누르지 마라. 안전한 예외는 저장되지 않는 **새 항목**뿐이다.
- Notion은 **읽기만** 한다(`AGENTS.md`).

## 3. 명령

```bash
npx tsc --noEmit        # 타입
npm run check           # 전체 자체검사 (memo/layout/weather/news/ai/jobs/dashboard)
npm run check:layout    # 레이아웃 불변식만
npm run lint            # eslint — 개수와 규칙 분포를 변경 전후로 비교한다
git diff --check        # 공백/충돌 마커
```

- `npm run dev`는 하나만 띄운다. 같은 디렉터리면 포트를 바꿔도 거부한다.
- 실제 화면 불변식은 `layout-invariants.ts`의 `measureEditor()`/`judge()`를 콘솔에서 부른다
  (상시 진단 패널은 없다).
- eslint는 **NEW/GONE으로 판정**한다. 총계만 보지 말고 규칙별 분포를 비교해라.
  에러가 **줄어들면 의심해라** — React Compiler는 분석을 포기해도 조용하다.

## 4. 경로

```
src/app/Dashboard.tsx        thin shell — 조립만
src/app/*.css                dashboard.css가 거대하다. 같은 셀렉터를 전부 grep하고 최종 승자를 확인
src/components/dashboard/    표현 (presentational.tsx · widgets.tsx · dashboard-cards.tsx)
src/components/memo/         에디터
src/lib/dashboard/use*.ts    기능 상태 owner
src/lib/{news,jobs,ai,memo}/ 도메인 로직 + *.check.ts 자체검사
src/lib/layout-invariants.ts 레이아웃 불변식 — 편집 껍데기 목록의 정본
supabase/                    schema.sql + dayN_migration.sql
docs/incidents.md            사고 근거 (실측·경위·헛짚은 가설)
HANDOFF_NEXT_CLAUDE.md       현재 상태 / OPEN / 다음 작업
```

## 5. 보고

- **한국어로, 최대 8줄.** `원인 1~2줄 / 변경 1~2줄 / 검증 2~3줄 / 남은 문제 1줄`.
  표·코드블록으로 도망가지 마라. 8줄에 안 들어가면 덜 중요한 것을 버려라.
  (사용자가 표·워크스루를 **명시적으로 요청**하면 요청한 만큼 쓴다.)
- **작은 수정마다 승인 요청하지 마라.** 안전하게 되돌릴 수 있는 범위는 검증까지 끝낸 뒤 한 번에 보고한다.
- **용어를 쓰면 그 자리에서 한 번 풀어라.** "특이도(= 어느 CSS 규칙이 이기는지 정하는 점수)".
- **실측 수치는 무엇과 비교한 값인지 같이 적어라.** `차=+4`가 아니라
  "메모지 아랫변이 보이는 화면 밑변보다 4px 아래".
- **검증한 것과 못 한 것을 반드시 나눠 쓴다.** 실기기 iPhone/Android/설치형 PWA는 여기서 실행할 수 없다.
  추측으로 "수정 완료"라고 쓰지 않는다.
  ```
  Web:              브라우저에서 직접 확인 완료
  Mobile viewport:  로컬 확인 완료
  iOS 키보드:       코드 검토만 — 실기기 확인 필요
  PWA standalone:   구조상 대응 — 설치 환경 확인 필요
  ```
- 완료 보고에는 **변경 / 검증 / 미검증 / commit**을 구분한다.

## 6. 필요할 때 읽는다

| 무엇을 만지나 | 읽을 것 |
|---|---|
| 레이아웃·뷰포트·키보드·스크롤·특이도 | `.claude/rules/ui-layout.md` |
| 편집기·캐럿·ref·메모지 색 | `.claude/rules/editor-memo.md` |
| 서버 액션·파싱·프롬프트·배치·운영 DB | `.claude/rules/data-server.md` |
| **무엇이든 — 잠긴 결정인지 먼저 확인** | `.claude/rules/frozen-features.md` |

| 상황 | 절차 |
|---|---|
| 같은 버그를 2~3번 고쳤는데 또 나온다 | `/debug-hard` |
| "스크롤이 안 된다 / 잠긴다" 신고 | `/scroll-lock` |

과거 회귀·실측 근거가 필요하면 `docs/incidents.md`를 검색한다.
이 파일의 옛 상세 지뢰표(434줄본)는 `git show a6558d3:CLAUDE.md`로 꺼낼 수 있다.
