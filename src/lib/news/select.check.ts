// 자체 점검: `node src/lib/news/select.check.ts` (filter.check.ts와 같은 방식).
// 2026-08-09 실제 사고 재현 — Gemini가 "동일 출처 최대 2건" 프롬프트 지시를 무시하고
// 한 출처에서 4건을 전부 고른 사례가 나왔다. 코드 검증(violatesSourceCap)과 강제 보정
// (enforceSourceCap)이 깨지면 같은 사고가 조용히 재발한다.
import assert from "node:assert/strict";
import { violatesSourceCap, enforceSourceCap, reconcileWithCandidates, type SelectedNewsItem } from "./select.ts";
import type { Candidate } from "./rss.ts";

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

// ── reconcileWithCandidates — Gemini가 돌려준 출처 정보를 코드가 다시 검증한다 ──────────────
const cand = (source: string, url: string): Candidate => ({
  title: "후보 제목", summary: "후보 요약", url, source, publishedAt: new Date("2026-08-20T01:00:00.000Z"),
});
const candidates = [cand("AI타임스", "https://aitimes.com/a/1"), cand("TechCrunch", "https://techcrunch.com/b/2")];

const withUrl = (url: string, source: string): SelectedNewsItem => ({ ...mk(source, 5), url });

// 지어낸 URL은 죽은 링크가 되므로 버린다
const hallucinated = reconcileWithCandidates([withUrl("https://aitimes.com/does-not-exist", "AI타임스")], candidates);
assert.equal(hallucinated.length, 0, "후보에 없는 URL은 제외해야 한다");

// 후보에 있으면 살리되, 출처 필드는 후보 원본으로 덮어쓴다(모델이 source를 잘못 적어도 화면은 정확해야 한다)
const wrongSource = reconcileWithCandidates([withUrl("https://aitimes.com/a/1", "TechCrunch")], candidates);
assert.equal(wrongSource.length, 1);
assert.equal(wrongSource[0].source, "AI타임스", "source는 후보 원본으로 교정한다");
assert.equal(wrongSource[0].published_at, "2026-08-20T01:00:00.000Z", "published_at도 후보 원본을 따른다");

// 추적 파라미터만 다른 같은 기사도 같은 후보로 인식해야 한다(normalizeUrl 경유)
const tracked = reconcileWithCandidates([withUrl("https://aitimes.com/a/1?utm_source=x", "AI타임스")], candidates);
assert.equal(tracked.length, 1, "utm_* 파라미터가 붙어도 같은 후보로 매칭돼야 한다");
assert.equal(tracked[0].url, "https://aitimes.com/a/1", "저장되는 URL은 후보 원본이다");

// 같은 기사를 두 번 돌려주면 하나만 남긴다
const dup = reconcileWithCandidates(
  [withUrl("https://aitimes.com/a/1", "AI타임스"), withUrl("https://aitimes.com/a/1", "AI타임스")], candidates);
assert.equal(dup.length, 1, "중복 반환은 하나로 합친다");

// 본문 텍스트는 Gemini가 쓴 그대로 보존한다
const keep = reconcileWithCandidates([{ ...withUrl("https://techcrunch.com/b/2", "TechCrunch"), summary: "모델이 쓴 요약" }], candidates);
assert.equal(keep[0].summary, "모델이 쓴 요약", "본문은 건드리지 않는다");

console.log("select.check.ts OK");
