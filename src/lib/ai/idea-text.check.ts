// 자체 점검: `node src/lib/ai/idea-text.check.ts` (Node 24 type stripping, roles.check.ts와 같은 방식).
// Idea Build 결과 스키마가 확장되면서 구 row(requiredTechnologies가 string[], 신규 필드 없음)와
// 신 row가 섞여 있다 — 둘 다 복사/저장 텍스트가 깨지지 않아야 한다.
import assert from "node:assert/strict";
import { ideaTechList, ideaResultToText } from "./idea-text.ts";
import type { IdeaResult } from "./idea.ts";

const base = {
  projectId: "p1", projectTitle: "SkillPilot", projectStatus: "개발중",
  selectionMode: "specific" as const,
  recommendationTitle: "Request Guard 추가",
  reason: "상세 내용이 템플릿 문구뿐이다",
};

const fresh: IdeaResult = {
  ...base,
  whatToBuild: "호출 전에 입력을 검사한다",
  developmentSteps: ["검증 함수 정의", "정규식으로 템플릿 문구 검사", "400 응답 반환"],
  implementationFlow: ["Idea ON", "입력 검증", "Gemini 호출"],
  requiredTechnologies: [{ name: "Next.js", reason: "API Route에서 검증" }],
  completionCriteria: ["빈 입력이면 호출되지 않는다", "정상 입력이면 결과가 생성된다"],
};

// 구 row — 신규 필드가 아예 없고 기술이 string[]이다
const legacy = {
  ...base,
  developmentSteps: ["단계1", "단계2"],
  requiredTechnologies: ["HTML", "CSS"],
} as unknown as IdeaResult;

// 기술 정규화 — 새 모양은 그대로, 구 string[]은 {name, reason:""}로
assert.deepEqual(ideaTechList(fresh), [{ name: "Next.js", reason: "API Route에서 검증" }]);
assert.deepEqual(ideaTechList(legacy), [{ name: "HTML", reason: "" }, { name: "CSS", reason: "" }]);
// 값이 비면 렌더링에서 빈 칩이 생기므로 걸러낸다
assert.deepEqual(ideaTechList({ ...legacy, requiredTechnologies: [""] } as unknown as IdeaResult), []);
assert.deepEqual(ideaTechList({ ...legacy, requiredTechnologies: undefined } as unknown as IdeaResult), []);

const freshText = ideaResultToText(fresh);
for (const section of ["무엇을 만들면 되나요?", "핵심 구현:", "구현 흐름:", "예상 필요 기술:", "완료 기준:"]) {
  assert.ok(freshText.includes(section), `신규 결과에 "${section}" 블록이 있어야 한다`);
}
assert.ok(freshText.includes("1. 검증 함수 정의"), "핵심 구현은 번호가 붙는다");
assert.ok(freshText.includes("- Next.js: API Route에서 검증"), "기술은 이유와 함께 나온다");
assert.ok(freshText.includes("Idea ON\n↓\n입력 검증"), "구현 흐름은 ↓로 이어진다");

// 구 row는 없는 섹션을 만들지 않고, 이유 없는 기술은 이름만 출력한다
const legacyText = ideaResultToText(legacy);
for (const absent of ["무엇을 만들면 되나요?", "구현 흐름:", "완료 기준:"]) {
  assert.ok(!legacyText.includes(absent), `구 결과에 "${absent}" 블록이 없어야 한다`);
}
assert.ok(legacyText.includes("- HTML\n- CSS"), "이유가 없으면 기술명만 나온다");
assert.ok(legacyText.includes("직접 선택 · 개발중 · SkillPilot"), "머리말은 그대로 유지된다");

console.log("idea-text.check.ts OK");
