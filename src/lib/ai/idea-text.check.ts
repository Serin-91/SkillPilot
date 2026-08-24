// 자체 점검: `node src/lib/ai/idea-text.check.ts` (Node 24 type stripping, roles.check.ts와 같은 방식).
// Idea Build 결과 스키마가 확장되면서 구 row(requiredTechnologies가 string[], 신규 필드 없음)와
// 신 row가 섞여 있다 — 둘 다 복사/저장 텍스트가 깨지지 않아야 한다.
import assert from "node:assert/strict";
import { ideaTechList, ideaResultToText, splitSentences } from "./idea-text.ts";
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

// ── splitSentences — 화면에서 문장마다 줄을 바꾸는 데 쓴다. 잘못 끊으면 숫자가 두 줄로 갈린다. ──
assert.deepEqual(
  splitSentences("첫 문장이다. 두 번째 문장이다. 세 번째는 물음인가? 마지막!"),
  ["첫 문장이다.", "두 번째 문장이다.", "세 번째는 물음인가?", "마지막!"]
);
// 소수점·버전 표기는 뒤에 공백이 없어서 문장 경계가 아니다 — 이게 이 정규식의 존재 이유다.
assert.deepEqual(
  splitSentences("응답이 3.5배 빨라진다. GPT-4.0과 v1.2를 함께 쓴다."),
  ["응답이 3.5배 빨라진다.", "GPT-4.0과 v1.2를 함께 쓴다."]
);
// 괄호로 닫힌 문장은 통째로 한 문장이다.
assert.deepEqual(
  splitSentences("여기서 끝난다. (확인됨.) 다음으로 간다."),
  ["여기서 끝난다.", "(확인됨.)", "다음으로 간다."]
);
// ponytail: 알려진 한계 — 문장 **중간**에 인용된 마침표는 문장 경계로 오인한다.
//   아래처럼 '"끝났다."' 뒤에서 한 번 더 끊긴다. 입력이 Gemini가 쓴 프로젝트 아이디어 산문이라
//   이 형태가 드물고, 틀려도 줄이 한 번 일찍 갈릴 뿐 내용이 손상되지 않아서 그대로 둔다.
//   고치려면 인용 구간을 상태로 추적해야 하는데 이 화면 하나를 위해 그럴 값이 아니다.
assert.deepEqual(
  splitSentences('그는 "끝났다." 라고 했다.'),
  ['그는 "끝났다."', "라고 했다."]
);
// 마침표 없는 한 줄, 빈 문자열, 개행만 있는 입력이 깨지지 않는다.
assert.deepEqual(splitSentences("마침표가 없는 한 줄"), ["마침표가 없는 한 줄"]);
assert.deepEqual(splitSentences(""), []);
assert.deepEqual(splitSentences("   \n  "), []);
// 원문을 잃지 않는다 — 합치면 공백 정규화만 다르고 내용은 그대로여야 한다.
{
  const src = "하나다. 둘이다. 셋이다.";
  assert.equal(splitSentences(src).join(" "), src);
}

console.log("idea-text.check.ts OK");
