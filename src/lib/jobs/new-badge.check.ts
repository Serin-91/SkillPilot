// 자체 점검: `node src/lib/jobs/new-badge.check.ts` (filter.check.ts와 같은 방식, Node 24 type stripping).
// 2026-08-21 실제 사고 재현 — 계정 A는 최근 추천에 며칠째 본 공고가 NEW였고, 계정 B는 추천공고에
// 어제 본 공고가 NEW + 최근 추천 전체가 NEW였다. 원인이 서로 다른 두 개라 각각 재현해 둔다.
import assert from "node:assert/strict";
import { firstRecommendedDateFor, isNewBadge, identityKey, NEW_BADGE_DAYS, type RecommendedBefore } from "./new-badge.ts";

const before = (over: Partial<RecommendedBefore> = {}): RecommendedBefore => ({
  job_date: "2026-08-20", first_recommended_date: "2026-08-10", ...over,
});
const fields = { company: "회사", title: "공고" };
const none = new Map<string, RecommendedBefore>();
const byUrl = (r: RecommendedBefore) => new Map([["https://x/1", r]]);

// ── 사고 ①: first_recommended_date가 null인 구 row가 "오늘 처음"으로 되살아났다 ─────────────
assert.equal(
  firstRecommendedDateFor(fields, "https://x/1", "2026-08-21", byUrl(before({ first_recommended_date: null })), none),
  "2026-08-20",
  "값이 null이면 job_date로 대체한다 — 오늘로 리셋되면 어제 본 공고에 NEW가 다시 붙는다"
);
// 값이 있으면 그대로 유지
assert.equal(firstRecommendedDateFor(fields, "https://x/1", "2026-08-21", byUrl(before()), none), "2026-08-10");
// url 매칭과 identity 매칭이 다르면 더 이른 쪽 — NEW의 정의는 "이 포지션을 처음 추천한 날"이다
assert.equal(
  firstRecommendedDateFor(
    fields, "https://x/1", "2026-08-21",
    byUrl(before({ first_recommended_date: "2026-08-18" })),
    new Map([[identityKey(fields), before({ first_recommended_date: "2026-08-05" })]])
  ),
  "2026-08-05"
);
// 과거 이력이 전혀 없으면 오늘이 맞다(진짜 신규)
assert.equal(firstRecommendedDateFor(fields, "https://new", "2026-08-21", none, none), "2026-08-21");
// 회사명 표기가 달라도 같은 포지션으로 본다((주)·㈜·주식회사 제거)
assert.equal(identityKey({ company: "(주)회사", title: "공고" }), identityKey({ company: "회사", title: "공고" }));

// ── 사고 ②: 한 번만 추천된 공고가 "최근 추천"에서 영원히 NEW였다 ────────────────────────────
// 예전 판정은 first_recommended_date === job_date였다. 아래 row는 그 조건이 영원히 참이지만,
// 처음 추천된 날이 오늘이 아니므로 NEW여선 안 된다.
const today = "2026-08-21";
assert.equal(isNewBadge("2026-08-10", today), false, "열흘 전 처음 추천된 공고는 NEW가 아니다");
assert.equal(isNewBadge(today, today), true, "오늘 처음 추천된 공고만 NEW다");
assert.equal(isNewBadge(null, today), false, "이력이 없으면 NEW를 붙이지 않는다");
// 배지 기간을 늘리면(NEW_BADGE_DAYS) 그만큼만 늘어나야 한다 — 상수만 바꿔 조정 가능한지 확인
assert.equal(NEW_BADGE_DAYS >= 1, true);
assert.equal(isNewBadge("2026-08-20", "2026-08-20"), true, "cutoff와 같은 날은 포함(경계 포함)");
assert.equal(isNewBadge("2026-08-19", "2026-08-20"), false, "cutoff 하루 전은 제외");

console.log("new-badge.check.ts OK");
