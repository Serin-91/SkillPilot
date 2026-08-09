// 자체 점검: `node src/lib/news/select.check.ts` (filter.check.ts와 같은 방식).
// 2026-08-09 실제 사고 재현 — Gemini가 "동일 출처 최대 2건" 프롬프트 지시를 무시하고
// 한 출처에서 4건을 전부 고른 사례가 나왔다. 코드 검증(violatesSourceCap)과 강제 보정
// (enforceSourceCap)이 깨지면 같은 사고가 조용히 재발한다.
import assert from "node:assert/strict";
import { violatesSourceCap, enforceSourceCap, type SelectedNewsItem } from "./select.ts";

const mk = (source: string, importance: number): SelectedNewsItem => ({
  title: `${source} 기사 ${importance}`, summary: "요약", importance, related_concepts: [],
  reason_selected: "이유", published_at: new Date().toISOString(), uncertainty: null, source, url: `https://x/${source}-${importance}`,
});

// 실제 사고 사례 — 한 출처에서 4건 전부
const allSameSource = [mk("AI타임스", 9), mk("AI타임스", 8), mk("AI타임스", 7), mk("AI타임스", 6)];
assert.equal(violatesSourceCap(allSameSource), true);

const capped = enforceSourceCap(allSameSource);
assert.equal(capped.length, 2, "소스당 상한(2)을 넘는 항목은 버린다 — 최종 개수가 4보다 적어질 수 있다");
assert.deepEqual(capped.map((i) => i.importance), [9, 8], "importance가 높은 순으로 남긴다");

// 정상 분산은 그대로 통과해야 한다
const diverse = [mk("AI타임스", 9), mk("TechCrunch", 8), mk("ZDNet Korea", 7), mk("TechCrunch", 6)];
assert.equal(violatesSourceCap(diverse), false);
assert.deepEqual(enforceSourceCap(diverse).length, 4);

// 상한 이하로 여러 출처에 걸쳐 있으면 위반이 아니다
const exactlyAtCap = [mk("AI타임스", 9), mk("AI타임스", 8), mk("TechCrunch", 7)];
assert.equal(violatesSourceCap(exactlyAtCap), false);

console.log("select.check.ts OK");
