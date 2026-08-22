// 자체 점검: `npx tsx src/lib/jobs/generate.check.ts`로 돌린다 — generate.ts가 "@/lib/..." 경로 별칭을
// import해서 plain node로는(경로 별칭을 못 풂) 못 돌린다.
// 2026-08-13 3소스 재구축 — dedupCandidates가 exact URL과 회사+공고명 identity 둘 다로 중복을
// 제거하는지 검증한다(17절). 이게 깨지면 같은 포지션이 소스가 다르다는 이유로 중복 추천될 수 있다.
import assert from "node:assert/strict";
import {
  collectVerifiedFallback, dedupCandidates, isUnseenUrl, firstRecommendedDateFor, buildPreviousIdentityMap,
  orderVerifiedByPriority,
  type Candidate, type PreviousJobRow, type ActiveCheck,
} from "./generate.ts";
import type { JobRole } from "./roles.ts";

function candidate(url: string, company: string, title: string, opts: Partial<Candidate["fields"]> = {}): Candidate {
  const roles: JobRole[] = ["llm_ai_agent"];
  return {
    url, site: "테스트", primaryRole: "llm_ai_agent", careerTier: "unknown",
    roleScores: { llm_ai_agent: 20, applied_ai_ml: 0, ai_platform_mlops: 0, ai_service_backend: 0 },
    eligibleRoles: roles,
    fields: {
      is_job_posting: true, company, title, role: "", responsibilities: "", required_text: "",
      preferred_text: "", career_requirement: "", deadline: null, posted_at: null, date_confidence: "unknown",
      ...opts,
    },
  };
}

// 같은 URL은 하나만 남는다(exact dedup).
const sameUrl = [candidate("https://a", "회사A", "AI Agent Engineer"), candidate("https://a", "회사A", "AI Agent Engineer")];
assert.equal(dedupCandidates(sameUrl).length, 1, "같은 url은 dedup되어야 함");

// 다른 source(다른 URL)라도 회사+공고명이 사실상 같으면 하나로 합친다 — "[신입]" 같은 모집 decorator만
// 제거하고 비교한다(17-2절).
const crossSource = [
  candidate("https://wanted/1", "테크컴퍼니", "[신입] AI Agent Engineer"),
  candidate("https://jobkorea/1", "테크컴퍼니", "AI Agent Engineer"),
];
assert.equal(dedupCandidates(crossSource).length, 1, "같은 회사+공고명은 소스가 달라도 하나로 합쳐야 함");

// 회사가 같아도 실제로 다른 포지션(다른 의미 토큰)이면 합치지 않는다 — false merge가 더 위험하다.
const differentPositions = [
  candidate("https://a", "테크컴퍼니", "AI Agent Engineer"),
  candidate("https://b", "테크컴퍼니", "AI Platform Backend Engineer"),
];
assert.equal(dedupCandidates(differentPositions).length, 2, "다른 포지션은 합치면 안 됨");

// identity dedup 시 더 완결된(본문이 더 긴) 후보를 남긴다(17-3절 completeness 우선).
const richer = candidate("https://rich", "테크컴퍼니", "AI Agent Engineer", { responsibilities: "매우 긴 상세 업무 설명입니다".repeat(5) });
const thinner = candidate("https://thin", "테크컴퍼니", "AI Agent Engineer", { responsibilities: "짧음" });
const merged = dedupCandidates([thinner, richer]);
assert.equal(merged.length, 1);
assert.equal(merged[0].url, "https://rich", "더 완결된 후보가 남아야 함");

// ── P0 회귀 — cross-source identity edge case ──────────────────────────────────────────────
// 어제 Wanted URL A(ABC/AI Agent Engineer)를 추천했고, 오늘 그 URL이 죽고 JobKorea URL B(같은 포지션,
// active)가 새로 발견된 상황. seenIdentity ≠ candidateReject: B는 여전히 candidate pool에 남아야 하고
// (isUnseenUrl이 URL만 본다), NEW만 false가 되도록 first_recommended_date는 어제 값을 승계해야 한다.
function previousRow(p: Partial<PreviousJobRow>): PreviousJobRow {
  return {
    url: "https://wanted/A", job_date: "2026-08-12", first_recommended_date: "2026-08-12", deadline: null,
    matched_role: "llm_ai_agent", company: "ABC", title: "AI Agent Engineer", role: null, source_site: "원티드",
    responsibilities: null, required_text: null, preferred_text: null, career_requirement: null,
    posted_at: null, date_confidence: null,
    ...p,
  };
}
const previousJobs = [previousRow({})];
const previousByUrl = new Map(previousJobs.map((j) => [j.url, j]));
const previousByIdentity = buildPreviousIdentityMap(previousJobs);

// 오늘 URL B는 URL 기준으로는 처음 보는 것이므로 candidate pool에 남아야 한다.
assert.equal(isUnseenUrl("https://jobkorea/B", previousByUrl), true, "새 source URL은 candidate pool에서 제외되면 안 됨");
// 옛 URL A 자체가 다시 나오면(진짜 재노출) STEP F/G가 담당하므로 STEP D/E pool에서는 seen 처리.
assert.equal(isUnseenUrl("https://wanted/A", previousByUrl), false);

// NEW 판정은 identity로 — 어제 first_recommended_date를 그대로 승계해야 오늘 날짜로 새로 찍히지 않는다.
const inherited = firstRecommendedDateFor({ company: "ABC", title: "AI Agent Engineer" }, "https://jobkorea/B", "2026-08-13", previousByUrl, previousByIdentity);
assert.equal(inherited, "2026-08-12", "cross-source 재발견이어도 first_recommended_date는 과거 identity를 승계해야 함");

// 완전히 새로운 포지션(identity도 처음)은 오늘 날짜를 받아야 한다.
const brandNew = firstRecommendedDateFor({ company: "XYZ", title: "MLOps Engineer" }, "https://jobkorea/C", "2026-08-13", previousByUrl, previousByIdentity);
assert.equal(brandNew, "2026-08-13");

// 같은 회사의 다른 포지션은 identity가 다르므로 승계되면 안 된다(false merge 방지, 17-2절과 동일 원칙).
const differentPosition = firstRecommendedDateFor({ company: "ABC", title: "AI Platform Engineer" }, "https://jobkorea/D", "2026-08-13", previousByUrl, previousByIdentity);
assert.equal(differentPosition, "2026-08-13", "같은 회사라도 다른 포지션이면 identity 승계하면 안 됨");

// ── P1 회귀 — previous+active가 previous+unknown보다 항상 먼저 온다 ────────────────────────────
function checkFields(): ActiveCheck {
  return { state: "active", fields: {
    is_job_posting: true, company: "c", title: "t", role: "", responsibilities: "", required_text: "",
    preferred_text: "", career_requirement: "", deadline: null, posted_at: null, date_confidence: "unknown",
  } };
}
const verifiedMixed: { row: PreviousJobRow; check: ActiveCheck }[] = [
  { row: previousRow({ url: "https://a-unknown" }), check: { state: "unknown" } },
  { row: previousRow({ url: "https://b-active" }), check: checkFields() },
  { row: previousRow({ url: "https://c-unknown", deadline: "2020-01-01" }), check: { state: "unknown" } }, // 지난 deadline은 unknown이어도 제외
  { row: previousRow({ url: "https://d-active" }), check: checkFields() },
];
const ordered = orderVerifiedByPriority(verifiedMixed, "2026-08-13");
assert.deepEqual(ordered.map((v) => v.row.url), ["https://b-active", "https://d-active", "https://a-unknown"], "active가 먼저, deadline 지난 unknown은 제외되어야 함");

// tsx가 이 파일을 CJS로 변환하므로 top-level await을 쓸 수 없다 — async IIFE로 감싼다.
void (async () => {
  // ── 2026-08-22 회귀 — 맨 앞 6건이 전부 만료여도 그날 배치가 0건이 되면 안 된다 ─────────────────
  // 실제 사고: admin 계정은 살아있는 과거 공고가 64건이었는데 결과가 failed 0건이었다.
  // 과거 공고 정렬이 "오래 안 보여준 순"이라 맨 앞에 오는 게 곧 가장 오래된 공고이고, 그건 만료돼
  // 있을 확률이 가장 높은 것들이다. 그때 검증 대상을 needed+2건으로 잘라두고 있어서, 그 6건이 전부
  // 만료면 나머지는 확인조차 안 하고 하루가 통째로 비었다.
  const expiredHead = Array.from({ length: 6 }, (_, i) => previousRow({ url: `https://expired-${i}` }));
  const liveTail = Array.from({ length: 4 }, (_, i) => previousRow({ url: `https://live-${i}` }));
  const probed: string[] = [];
  const fakeVerify = async (url: string): Promise<ActiveCheck> => {
    probed.push(url);
    return url.startsWith("https://expired-") ? { state: "closed" } : checkFields();
  };
  const deepened = await collectVerifiedFallback([...expiredHead, ...liveTail], "2026-08-22", 4, fakeVerify);
  const usableUrls = orderVerifiedByPriority(deepened, "2026-08-22").map((v) => v.row.url);
  assert.equal(usableUrls.length, 4, "만료된 앞부분을 지나 살아있는 공고까지 내려가야 한다");
  assert.deepEqual(usableUrls, ["https://live-0", "https://live-1", "https://live-2", "https://live-3"]);
  assert.ok(probed.length > 6, `앞 6건에서 멈추면 안 된다 (실제 확인: ${probed.length}건)`);

  // 반대로 앞에서 바로 채워지면 더 파고들지 않는다 — 네트워크 비용을 낭비하지 않는다.
  const probedShallow: string[] = [];
  const allLive = Array.from({ length: 20 }, (_, i) => previousRow({ url: `https://ok-${i}` }));
  await collectVerifiedFallback(allLive, "2026-08-22", 4, async (url) => { probedShallow.push(url); return checkFields(); });
  assert.ok(probedShallow.length <= 6, `충분히 모이면 멈춘다 (실제 확인: ${probedShallow.length}건)`);

  console.log("generate.check.ts OK");
})();
