<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SkillPilot — 문서 canonical 역할 (2026-09-09 사용자 지시)

**작업 하나가 끝났다고 문서 넷을 모두 고치지 않는다.** 새로 적을 내용마다 "이게 어느 질문에 대한
답인가"를 먼저 정하고 **한 곳에만** 쓴다. 나머지에서는 필요할 때 **짧게 참조**한다.

| 무엇 | 어디 | 넣지 않는 것 |
|---|---|---|
| 지금 어디까지 했고 다음에 무엇을 하나 (현재 상태) | **`HANDOFF_NEXT_CLAUDE.md`** | 끝난 작업의 긴 검증표 · 과거 조사 과정 · 영구 규칙 · commit 역사 |
| 앞으로 비슷한 작업에서 반복 적용할 **영구 규칙** | **`CLAUDE.md`** (3절 지뢰표 · 4-1 기능 동결) | commit hash · 날짜 · px 실측 · 이번 조사 단계 · 일회성 TODO |
| 특정 버그의 원인·재현·실측·헛짚은 가설 | **`docs/incidents.md`** | — (여기는 증거 보존용이라 구체 수치를 남긴다) |
| 에이전트·Notion·Git 전체 **운영정책** | **`AGENTS.md`** (이 파일) | 개별 기능 구현법 · UI 버그 해결법 · 현재 NEXT · 특정 incident 교훈 |
| Git으로 충분히 남는 세부 구현 증거 | **문서에 중복 기록하지 않는다** | |

**작업 종료 시 순서**: ① diff·결과 확정 → ② HANDOFF에 **다음 세션에 필요한 현재 상태만** 반영
→ ③ **일반화 가능한 교훈이 생겼을 때만** `CLAUDE.md` → ④ **조사 가치가 있는 실제 사고일 때만**
`docs/incidents.md` → ⑤ **운영 방식 자체가 바뀌었을 때만** 이 파일.
**"문서 변경 불필요"가 정상적인 결과다.** 일반 버그 수정 때문에 이 파일을 고치지 않는다.

- `HANDOFF`는 append가 아니라 **CURRENT overwrite**이고, **OPEN 식별자는 안정적이다**
  (설명형 이름 · 닫혀도 재번호·재사용 금지 — 코드 주석과 commit이 그 이름을 참조한다).
  **크기·압축 기준과 절 구성 등 상세 절차의 정본은 `HANDOFF_NEXT_CLAUDE.md` 맨 위 운영 규칙이다.**
- 같은 사건을 여러 문서에 길게 반복하지 않는다. 예: HANDOFF엔 "커밋 + 실기기 통과" 한 줄,
  `CLAUDE.md`엔 재사용 규칙 한 줄, `docs/incidents.md`엔 상세 증거, `AGENTS.md`는 변경 없음.

# SkillPilot — Notion 상태 동기화 완료 게이트

Notion MCP가 연결된 상태를 기본 전제로 한다. 코드·디자인·DB·API·운영을 실제로 변경하는 작업은
**구현과 검증뿐 아니라 관련 Notion 문서의 상태·본문·검증 증거까지 같은 작업에서 갱신해야 완료다.**

- 작업 전: [SkillPilot Product Workspace](https://app.notion.com/p/3c565d3c830981759c32c0775d7e1996)에서 관련 Feature, PRD/Feature Spec, Roadmap, Verification, ADR, Decision Log를 검색·조회하고 현재 상태를 확인한다.
- 작업 후: 일반 코드 변경·내부 리팩토링·검증 결과 변화는 [🎯 SkillPilot CURRENT](https://app.notion.com/p/3d565d3c830981f9bb8cd4481d685ac5)에 반영한다.
- 계약 문서 갱신 기준:
  - Feature: 사용자가 경험하는 동작 계약이 실제로 바뀐 경우에만 갱신한다.
  - PRD: 승인 요구사항이 바뀐 경우에만 갱신한다.
  - ADR: 설계 결정이 바뀐 경우에만 갱신한다.
  - 사고 원인·재발 방지 증거: Incident, Decision Log 또는 repo canonical 문서에 기록한다.
- 단순 내부 코드 변경마다 Feature 본문에 Change Log를 append하거나 `마지막 검토일`을 올리지 않는다.
- 상태 변경 기준:
  - Feature: `계획 → 부분 구현 → 구현 완료`; 필수 연결 또는 검증이 남으면 `부분 구현`이다.
  - PRD: `초안 → 검토 중 → 승인 → 구현 반영`; 실제 제품 동작에 반영된 뒤에만 `구현 반영`이다.
  - Roadmap: 착수 시 `예정 → 진행 중`, Definition of Done 충족 후에만 `완료`다.
  - Idea: 채택 후 실행 항목이 되면 `로드맵 이동`; 원본 아이디어는 삭제하지 않는다.
  - ADR: 기존 결정을 바꾸면 기존 항목을 `대체됨`으로 두고 새 결정을 `채택`으로 남긴다.
  - Decision Log: 실제 변경과 검증이 끝나면 `Change Log / 종료`; 남은 검증이나 후속 작업이 있으면 `후속 작업`이다.
- 화면·로직·저장·migration·필수 환경별 검증 중 하나라도 남으면 코드가 있어도 `완료`로 올리지 않는다.
- Notion 갱신 뒤 관련 페이지를 다시 조회하여 본문과 상태가 실제로 저장됐는지 확인한다. DB 항목 수나 상태 분포가 바뀌면 Product Home 요약도 함께 갱신한다.
- Notion 쓰기가 실패하거나 권한/MCP 문제로 검증하지 못하면 로컬 구현이 끝났더라도 전체 작업을 완료로 보고하지 않는다. `Notion 동기화 대기`라고 명시하고, 반영해야 할 페이지·상태·증거를 정확히 남긴다.
- 진단·리뷰·설명처럼 읽기 전용 요청은 사용자의 명시적 요청 없이 Notion을 변경하지 않는다. 실제 변경을 수행하는 build/change 작업에는 이 게이트가 기본 적용된다.
- 제품 승인이나 우선순위 결정은 추정해서 바꾸지 않는다. 열린 제품 결정이 있으면 기존 상태를 유지하고 사용자 판단이 필요한 항목으로 보고한다.
- 상세 절차는 [Workspace Maintenance Guide](https://app.notion.com/p/3c565d3c830981f7a074e3ad387aa6f6)와 [Developer Change Guide](https://app.notion.com/p/3c565d3c8309814baabeec6b85b921be)를 따른다.
