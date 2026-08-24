<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SkillPilot — Notion 상태 동기화 완료 게이트

Notion MCP가 연결된 상태를 기본 전제로 한다. 코드·디자인·DB·API·운영을 실제로 변경하는 작업은
**구현과 검증뿐 아니라 관련 Notion 문서의 상태·본문·검증 증거까지 같은 작업에서 갱신해야 완료다.**

- 작업 전: [SkillPilot Product Workspace](https://app.notion.com/p/3c565d3c830981759c32c0775d7e1996)에서 관련 Feature, PRD/Feature Spec, Roadmap, Verification, ADR, Decision Log를 검색·조회하고 현재 상태를 확인한다.
- 작업 후: 실제 코드 경로와 symbol, migration/환경 변수, 사용자 동작, 실행한 검증 명령과 결과, 미검증 영역을 관련 페이지 본문에 반영한다.
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
