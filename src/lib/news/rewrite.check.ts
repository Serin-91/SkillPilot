// 실행: node src/lib/news/rewrite.check.ts
// 🔴 2단계 재작성의 **fail-open 판정**만 검사한다(네트워크·모델 없음).
//    이 판정이 느슨하면 빈 요약·영어 제목이 그대로 화면에 나가고, 빡빡하면 상향 모델이 무력해진다.
//
// 2026-09-03 — 계약이 바뀌었다: `summary`/`reason_selected` 문자열 하나 → **문단 배열**
// (`summary_paras` / `why_paras`). 개수를 프롬프트로 요구하는 시도가 3회 실패한 뒤,
// 이 저장소의 원칙("카운팅 제약은 코드가 센다")대로 스키마 + 이 판정기가 센다.
// 그리고 **칸 수는 재료 길이가 정한다** — 재료가 300자뿐인 소스(AI타임스·TechCrunch가 후보의 77%)에
// 더 쓰라고 요구하면 지어내라는 뜻이 된다. 그래서 usable()의 세 번째 인자가 재료 길이다.
import assert from "node:assert/strict";
import { usable } from "./rewrite.ts";
import type { SelectedNewsItem } from "./select.ts";

const before = { title: "원래 제목", summary: "원래 요약", related_concepts: ["LLM"], reason_selected: "원래 이유" } as SelectedNewsItem;
const para = (n: number) => "가".repeat(n);             // 12자 이상이어야 한 칸으로 인정된다
const paras = (count: number, len = 45) => Array.from({ length: count }, () => para(len));
const good = (sCount: number, wCount = 2) => ({
  title: "새 제목", summary_paras: paras(sCount), related_concepts: ["RAG"], why_paras: paras(wCount),
});

const THIN = 300;   // AI타임스 실측 중앙값 — 재료가 적은 쪽
const RICH = 1900;  // ZDNet 실측 중앙값 — 재료가 많은 쪽

// ── 재료가 적으면 3~4칸 ─────────────────────────────────────────────
assert.equal(usable(good(3), before, THIN), true, "재료가 적을 때 3칸이 거부됐다");
assert.equal(usable(good(4), before, THIN), true, "재료가 적을 때 4칸이 거부됐다");
assert.equal(usable(good(2), before, THIN), false, "2칸을 통과시켰다");
assert.equal(usable(good(5), before, THIN), false, "재료가 적은데 5칸을 통과시켰다");

// ── 재료가 많으면 4~6칸(더 요구한다) ────────────────────────────────
assert.equal(usable(good(4), before, RICH), true, "재료가 많을 때 4칸이 거부됐다");
assert.equal(usable(good(6), before, RICH), true, "재료가 많을 때 6칸이 거부됐다");
assert.equal(usable(good(3), before, RICH), false,
  "재료가 많은데 3칸을 통과시켰다 — 여유가 있는 기사에서 분량이 안 늘어난다");

// ── 칸을 채우기만 한 응답은 거부한다 ────────────────────────────────
assert.equal(usable({ ...good(3), summary_paras: ["가.", "나.", "다."] }, before, THIN), false,
  "12자 미만짜리로 칸만 채운 것을 통과시켰다");
assert.equal(usable({ ...good(3), summary_paras: paras(3, 20) }, before, THIN), false,
  "칸은 3개인데 통째로 120자 미만인 것을 통과시켰다");
assert.equal(usable({ ...good(3), summary_paras: "문자열" }, before, THIN), false,
  "배열이 아닌 summary_paras를 통과시켰다");

// ── why는 재료와 무관하게 2~3칸 ─────────────────────────────────────
assert.equal(usable(good(3, 3), before, THIN), true, "why 3칸이 거부됐다");
assert.equal(usable(good(3, 1), before, THIN), false, "why 1칸을 통과시켰다");
assert.equal(usable(good(3, 4), before, THIN), false, "why 4칸을 통과시켰다");
assert.equal(usable({ ...good(3), why_paras: [] }, before, THIN), false, "빈 why를 통과시켰다");

// ── 1단계와 같은 관문들 ─────────────────────────────────────────────
// 번역 관문 — looksUntranslated를 그대로 쓴다. 한글이 없으면 미번역이다.
assert.equal(usable({ ...good(3), title: "Anthropic ships Claude" }, before, THIN), false, "영어 제목을 통과시켰다");
assert.equal(usable({ ...good(3), related_concepts: [] }, before, THIN), false, "빈 관련개념을 통과시켰다");
assert.equal(usable(null, before, THIN), false, "null을 통과시켰다");
assert.equal(usable({}, before, THIN), false, "빈 객체를 통과시켰다");

console.log("rewrite.check.ts OK");
