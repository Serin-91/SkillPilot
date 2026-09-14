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
| 항상 적용되는 **운영 계약** (매 세션 로드) | **`CLAUDE.md`** | 영역별 세부 규칙 · commit hash · 날짜 · px 실측 · 일회성 TODO |
| 특정 영역에서만 적용할 **영구 규칙** | **`.claude/rules/`** — 레이아웃·뷰포트·스크롤 `ui-layout.md` / 편집기·캐럿·ref `editor-memo.md` / 서버·파싱·프롬프트 `data-server.md` / 잠긴 결정 `frozen-features.md` | commit hash · 날짜 · px 실측 · 이번 조사 단계 |
| 순서가 있는 **반복 절차** | **`.claude/skills/`** — `/debug-hard` · `/scroll-lock` | 일회성 조사 · 특정 버그 서사 |
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

# 🔴 Notion 쓰기 금지 (2026-09-10 사용자 지시 — 이전 "완료 게이트" 정책을 폐기한다)

**Claude는 Notion을 절대 수정하지 않는다.** 예전 이 자리에 있던
"코드 변경 후 Notion까지 갱신해야 완료"라는 게이트는 사용자가 명시적으로 폐기했다.

- **Notion write 금지.** 페이지·DB·Feature·PRD·CURRENT의 생성·수정·상태변경 전부 금지다.
- Notion MCP는 **필요할 때 read-only 조회만** 허용한다.
- Notion 최신화는 **사용자 또는 ChatGPT가** 담당한다.
- **Notion을 수정하지 않았다는 이유로 작업을 미완료로 처리하지 않는다.**
  `Notion 동기화 대기` 같은 표기도 쓰지 않는다.
- 코드 변경 후 Claude가 갱신할 문서는 **repo canonical 문서뿐**이다:
  현재 인계 필요 → `HANDOFF_NEXT_CLAUDE.md` / 영구 규칙 변경 → `CLAUDE.md` /
  사고 증거 필요 → `docs/incidents.md`. (위 canonical 역할 표가 정본이다.)
