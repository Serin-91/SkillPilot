// 자체 점검: `node src/lib/jobs/jumpit.check.ts`로 돌린다(Node 24 type stripping).
// 점핏 내부 API는 비공식이라 스펙이 바뀌면 조용히 깨질 수 있다 — 4개 직무 모두 실제로
// 후보를 받아오는지, URL 형식이 fetchJumpitJobDetail이 기대하는 형태인지 여기서 바로 터진다.
import assert from "node:assert/strict";
import { fetchJumpitPositions } from "./jumpit.ts";
import { JOB_ROLE_ORDER } from "./roles.ts";

for (const role of JOB_ROLE_ORDER) {
  const positions = await fetchJumpitPositions(role, 5);
  assert.ok(positions.length > 0, `${role}: 후보가 0건이면 jobCategory 매핑 또는 API 응답 구조가 깨진 것`);
  for (const p of positions) {
    assert.match(p.url, /^https:\/\/jumpit\.saramin\.co\.kr\/position\/\d+$/, `${role}: URL 형식 이상 - ${p.url}`);
    assert.ok(p.title.length > 0, `${role}: title 비어있음 - ${p.url}`);
  }
}

console.log("jumpit.check.ts OK");
