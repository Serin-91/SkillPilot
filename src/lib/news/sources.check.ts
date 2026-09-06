// 자체 점검: `node src/lib/news/sources.check.ts` (filter.check.ts와 같은 방식, Node 24 type stripping).
// 소스를 추가하거나 상수를 조정했을 때 distributeByScore의 점수 백필이 죽는 걸 여기서 잡는다.
import assert from "node:assert/strict";
import {
  NEWS_SOURCES, MAX_CANDIDATES, PER_SOURCE_INITIAL, PER_SOURCE_MAX,
  SOURCE_LOOKBACK_DAYS, FALLBACK_ENGLISH_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS, FALLBACK_LOOKBACK_DAYS,
} from "./sources.ts";

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

// 🔴🔴 lookback 천장 — **"오늘의 브리핑"에 열흘 된 기사가 실리는 경로를 막는다** (2026-09-06).
//
// 09-06에 Ars Technica의 8/27 기사(9.5일 전)가 최종 4건에 실렸다. 버그가 아니라 그때
// FALLBACK_ENGLISH_LOOKBACK_DAYS가 14였고 `lookbackFor()`가 그대로 쓴 것이다.
// 이 검사는 "누가 이 값을 다시 올리면 즉시 실패"하게 만든다 — 코드 리뷰로는 몇 번이고 지나간다.
const maxPerSource = Math.max(...Object.values(SOURCE_LOOKBACK_DAYS));
assert.ok(
  FALLBACK_ENGLISH_LOOKBACK_DAYS <= maxPerSource,
  `FALLBACK_ENGLISH_LOOKBACK_DAYS(${FALLBACK_ENGLISH_LOOKBACK_DAYS})가 소스별 상한(${maxPerSource})을 넘는다 — ` +
    `fallback 회차에 그만큼 오래된 기사가 최종 선정될 수 있다(09-06 실측: 9.5일 된 기사가 실렸다). ` +
    `정말 넓혀야 하면 SOURCE_LOOKBACK_DAYS를 같이 올리고 그 근거를 남길 것.`
);
// 그 상한 자체도 천장을 둔다 — 소스별 값을 올리는 것으로 위 검사를 우회할 수 있기 때문이다.
const ABSOLUTE_MAX_AGE_DAYS = 7;
assert.ok(
  maxPerSource <= ABSOLUTE_MAX_AGE_DAYS,
  `소스별 lookback 최대값(${maxPerSource})이 ${ABSOLUTE_MAX_AGE_DAYS}일을 넘는다. ` +
    `"오늘의 AI·개발 핵심 브리핑"이 일주일 넘은 기사를 실으면 제품 약속이 깨진다.`
);
// 1차 → 부족 시 확장 순서가 뒤집히면 fallback이 오히려 좁아진다.
assert.ok(MAX_LOOKBACK_DAYS <= FALLBACK_LOOKBACK_DAYS, "1차 lookback이 fallback보다 넓으면 확장이 무의미하다");

console.log(
  `sources.check 통과 — 소스 ${NEWS_SOURCES.length}개, 선점 ${preempted}건 + 점수 백필 ${backfillSlots}건 = 정원 ${MAX_CANDIDATES}건 · ` +
  `lookback 1차 ${MAX_LOOKBACK_DAYS}일 → 부족 시 ${FALLBACK_LOOKBACK_DAYS}일, 영문 소스 상한 ${maxPerSource}일(fallback ${FALLBACK_ENGLISH_LOOKBACK_DAYS}일)`
);
