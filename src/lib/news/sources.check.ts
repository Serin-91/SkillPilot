// 자체 점검: `node src/lib/news/sources.check.ts` (filter.check.ts와 같은 방식, Node 24 type stripping).
// 소스를 추가하거나 상수를 조정했을 때 distributeByScore의 점수 백필이 죽는 걸 여기서 잡는다.
import assert from "node:assert/strict";
import { NEWS_SOURCES, MAX_CANDIDATES, PER_SOURCE_INITIAL, PER_SOURCE_MAX } from "./sources.ts";

// 소스별 선점이 정원을 다 먹으면 distributeByScore의 백필 루프가 한 번도 돌지 않는다 — 점수가
// 후보 선정에 아무 영향을 못 주고, 각 소스의 상위 N건이 점수와 무관하게 그대로 후보가 된다.
// 실제로 PER_SOURCE_INITIAL=4 / 소스 5개 / MAX_CANDIDATES=18 조합에서 이 사고가 났다(2026-08-21).
const preempted = NEWS_SOURCES.length * PER_SOURCE_INITIAL;
assert.ok(
  preempted < MAX_CANDIDATES,
  `소스별 선점(${NEWS_SOURCES.length}개 × ${PER_SOURCE_INITIAL} = ${preempted})이 MAX_CANDIDATES(${MAX_CANDIDATES}) 이상이면 ` +
    `점수 기반 백필이 한 건도 실행되지 않는다. PER_SOURCE_INITIAL을 낮추거나 MAX_CANDIDATES를 올릴 것.`
);

// 백필이 "구색 맞추기"가 아니라 실제로 후보 구성을 좌우할 만큼 남아야 한다 — 정원의 1/3 이상.
const backfillSlots = MAX_CANDIDATES - preempted;
assert.ok(
  backfillSlots >= Math.ceil(MAX_CANDIDATES / 3),
  `점수 백필 슬롯이 ${backfillSlots}건뿐이다(정원 ${MAX_CANDIDATES}). 좋은 기사가 소스 쿼터에 막혀 탈락한다.`
);

// 선점값이 최종 상한을 넘으면 앞뒤가 안 맞는다(선점 단계에서 이미 상한 초과 상태로 들어간다).
assert.ok(PER_SOURCE_INITIAL <= PER_SOURCE_MAX, "PER_SOURCE_INITIAL은 PER_SOURCE_MAX를 넘을 수 없다");

// 한 소스가 상한까지 채워도 최소 두 소스는 남아야 "출처 다양성" 자체가 성립한다.
assert.ok(PER_SOURCE_MAX * 2 <= MAX_CANDIDATES, "한 소스가 정원의 절반을 넘게 가져갈 수 있으면 다양성 보장이 무의미하다");

console.log(
  `sources.check 통과 — 소스 ${NEWS_SOURCES.length}개, 선점 ${preempted}건 + 점수 백필 ${backfillSlots}건 = 정원 ${MAX_CANDIDATES}건`
);
