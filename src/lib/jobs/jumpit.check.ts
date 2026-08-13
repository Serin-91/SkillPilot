// 자체 점검: `node src/lib/jobs/jumpit.check.ts`로 돌린다(Node 24 type stripping, 실제 API 왕복함).
// 2026-08-13 AI 중심 개편 — role별 카테고리 매핑이 사라지고 "인공지능/머신러닝" 카테고리 하나만 공통
// 수집하므로, role 루프 대신 단일 호출 결과가 정상 모양인지만 확인한다.
import assert from "node:assert/strict";
import { fetchJumpitPositions } from "./jumpit.ts";

const positions = await fetchJumpitPositions(5);
assert.ok(positions.length > 0, "후보가 0건이면 jobCategory=8(AI/ML) 매핑 또는 API 응답 구조가 깨진 것");
for (const p of positions) {
  assert.match(p.url, /^https:\/\/jumpit\.saramin\.co\.kr\/position\/\d+$/, `URL 형식 이상 - ${p.url}`);
  assert.ok(p.title.length > 0, `title 비어있음 - ${p.url}`);
}

console.log("jumpit.check.ts OK");
