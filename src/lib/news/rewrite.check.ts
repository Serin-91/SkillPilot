// 실행: node src/lib/news/rewrite.check.ts
// 🔴 2단계 재작성의 **fail-open 판정**만 검사한다(네트워크·모델 없음).
//    이 판정이 느슨하면 빈 요약·영어 제목이 그대로 화면에 나가고, 빡빡하면 상향 모델이 무력해진다.
import assert from "node:assert/strict";
import { usable } from "./rewrite.ts";
import type { SelectedNewsItem } from "./select.ts";

const before = { title: "원래 제목", summary: "원래 요약", related_concepts: ["LLM"], reason_selected: "원래 이유" } as SelectedNewsItem;
const good = { title: "새 제목", summary: "가".repeat(60), related_concepts: ["RAG"], reason_selected: "왜 중요한지" };

assert.equal(usable(good, before), true, "정상 응답이 거부됐다");
assert.equal(usable({ ...good, summary: "너무 짧음" }, before), false, "40자 미만 요약을 통과시켰다");
assert.equal(usable({ ...good, summary: "   " }, before), false, "공백 요약을 통과시켰다");
// 번역 관문 — 1단계와 같은 판정기(looksUntranslated)를 쓴다. 한글이 없으면 미번역이다.
assert.equal(usable({ ...good, title: "Anthropic ships Claude" }, before), false, "영어 제목을 통과시켰다");
assert.equal(usable({ ...good, related_concepts: [] }, before), false, "빈 관련개념을 통과시켰다");
assert.equal(usable({ ...good, reason_selected: "" }, before), false, "빈 Why를 통과시켰다");
assert.equal(usable(null, before), false, "null을 통과시켰다");
assert.equal(usable({}, before), false, "빈 객체를 통과시켰다");
console.log("rewrite.check.ts OK");
