# 규칙 — 기능 동결 목록

**여기 있는 것은 사용자가 명시적으로 잠근 결정이다.** 더 나은 안이 보여도 먼저 물어라.
추가할 것이 생기면 HANDOFF가 아니라 이 목록에 넣는다.

기술적 이유와 세부는 각 도메인 규칙에 있다 — 여기는 **무엇이 잠겼는지**만 센다.

## AI Trend / 뉴스

- **모델·프롬프트·스키마 변경 금지** — `gemini-3.5-flash-lite` / SYSTEM_PROMPT / 합니다체 /
  `RESPONSE_SCHEMA` / `groundTakeaways` / `groundSkillSignals` / fresh-first / evidence 검증 / `MAX_SIGNALS`.
- 문체를 정규식 후처리로 고치지 마라.
- `rewrite.ts`의 문단 수·임계값·요약 프롬프트는 **원인 확정 전에 건드리지 마라.**
  (원인 없이 `RICH_MATERIAL`을 키웠다가 총량이 줄어 폐기한 적이 있다 — `docs/incidents.md`.)

## Jobs

- **추천·선정 로직 · Soft Reserve · source별 crawler/parser · `parseJobTextSections` ·
  NEW 판정 · career 판정 · DB schema · 잡코리아 `?` 처리 · CSS 디자인 조정 — 전부 금지.**

## 모바일 편집 구조 (→ `ui-layout.md` · `editor-memo.md`)

- `.proj-edit-page` / `.memo-edit-page`의 포지셔닝 4조건
- `.proj-edit-page .mobile-rich-toolbar`의 `top`
- `.body-editor`의 `--kb-inset`
- `body` 배경 인라인
- `close(); show()`로 `<dialog>` 모달만 풀기
- `--app-vh`의 정의
- 본문 확장(`.expand-btn`)을 모바일 검증 항목에 넣기

위 일곱은 전부 **시도했다가 되돌린 것**이다. 다시 하려면 근거를 들고 먼저 물어라.

## 구조 / 리팩토링

- **"옮기면서 고치기" 금지.** 이동과 동작 변경을 같은 커밋에 섞지 않는다.
- **버그 수정과 구조 리팩터링을 같은 커밋에 섞지 않는다.**
- **theme을 Context로 분리하지 마라** — 종결된 결정이고 `data-memo-theme`이 load-bearing이다.
- **`Dashboard.tsx`는 thin orchestration shell이다.** feature 전용 상태·effect를 다시 넣지 마라.
  셸 종료 핸들러의 부수 저장(`handlePostitBack`·`handleMemoDialogBack`)은 **의도된 KEEP**이다 —
  0으로 만들려고 훅에 넣지 마라.
- Dashboard ownership Roadmap은 **종료됐다.** 재개하지 마라.

## 검증 절차

- 운영 DB 안전 규칙은 `CLAUDE.md` 2절이 정본이다.
- **`next dev`를 두 번 띄우려 하지 마라** — 같은 디렉터리면 포트를 바꿔도 거부한다.
