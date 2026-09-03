// 자체 점검: `npx tsx src/lib/news/generate.check.ts`
// dev 입력 스냅샷(withDevInput)의 세 갈래만 검사한다. 네트워크·DB·Gemini 불필요.
//
// 왜 이 검사가 필요한가: 이 스냅샷은 **재현용 보존**이고, 깨져도 화면에는 아무 증상이 없다.
// 조용히 안 저장되면 며칠 뒤 "또 재생 불가"를 만나게 된다 — 그래서 검사로 붙잡는다.
import assert from "node:assert/strict";
import { withDevInput } from "./generate.ts";
import { stripDevInput } from "./get-briefing.ts";
import type { DevEcosystem } from "./dev-ecosystem.ts";
import type { TrendBriefResult } from "./trend-brief.ts";

const dev: DevEcosystem = {
  github: [{ title: "Copilot code review can now approve PRs", description: "설명", published_at: "2026-09-02T00:00:00.000Z", url: "https://github.blog/x", source: "GitHub" }],
  huggingface: [{ title: "deepseek-ai/X", description: "태스크: text-generation", published_at: "2026-09-01T00:00:00.000Z", url: "https://huggingface.co/deepseek-ai/X", source: "Hugging Face" }],
};
const brief: TrendBriefResult = {
  industry_impact: { content: "흐름", points: ["흐름"] },
  tool_update: null, developer_trend: null,
  practical_takeaways: ["무언가를 해본다. 오늘 바뀌었기 때문이다. (근거: GitHub · X)"],
};

// ① 정상 — dev_input이 붙고 나머지 필드는 그대로다
{
  const stored = withDevInput(brief, dev);
  assert.ok(stored && "dev_input" in stored);
  assert.deepEqual(stored.dev_input, dev, "가공 없이 그대로 저장해야 한다 — 가공하면 '모델이 본 것'과 어긋난다");
  assert.deepEqual(stripDevInput(stored), brief, "벗기면 생성 결과와 완전히 같아야 한다");
}

// ②🔴 brief가 null이면 null을 유지한다 — 스냅샷 때문에 null이 객체가 되면
//     화면이 "AI Trend 있음"으로 오판해 빈 섹션을 그린다
assert.equal(withDevInput(null, dev), null, "생성 실패한 날을 스냅샷이 되살리면 안 된다");

// ③ 상한을 넘으면 스냅샷만 버리고 브리핑은 정상 저장한다
{
  const huge: DevEcosystem = { github: Array.from({ length: 400 }, () => ({ ...dev.github[0], description: "가".repeat(400) })), huggingface: [] };
  const stored = withDevInput(brief, huge);
  assert.ok(stored, "상한을 넘어도 브리핑 자체는 살아야 한다");
  assert.equal("dev_input" in stored, false, "상한 초과 시 스냅샷은 빠진다");
  assert.deepEqual(stored, brief);
}

// ④ 하위 호환 — dev_input이 없는 옛 행은 손대지 않는다
assert.deepEqual(stripDevInput(brief), brief, "옛 행은 그대로 통과해야 한다");
assert.equal(stripDevInput(null), null);

console.log("generate.check.ts (dev 입력 스냅샷) OK");
