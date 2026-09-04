// 자체 점검: `npm run check:jobs` — 이 폴더 check 파일 전부를 맞는 러너로 돌린다.
// 이 파일만 tsx가 필요하다: generate.ts가 "@/lib/..." 경로 별칭을 쓰는데 plain node는 그걸 못 푼다.
// (상대경로로 바꿔보니 node ESM이 모든 import에 .ts 확장자를 요구해서 파일 전체로 연쇄됐다 —
//  테스트 편의로 프로덕션 import를 줄줄이 바꿀 일은 아니라 별칭을 그대로 뒀다.)
// 반대로 jobkorea/jumpit은 top-level await 때문에 tsx(esbuild cjs)에서 죽고 node로만 돈다.
// 러너를 손으로 고르면 이 파일만 조용히 빠진 채 "전부 통과"로 읽힌다 — 그래서 script로 묶었다.
// 2026-08-13 3소스 재구축 — dedupCandidates가 exact URL과 회사+공고명 identity 둘 다로 중복을
// 제거하는지 검증한다(17절). 이게 깨지면 같은 포지션이 소스가 다르다는 이유로 중복 추천될 수 있다.
import assert from "node:assert/strict";
import {
  collectVerifiedFallback, dedupCandidates, isUnseenUrl, firstRecommendedDateFor, buildPreviousIdentityMap,
  orderVerifiedByPriority, assignFromPool, extractCandidatesFrom, DETAIL_POOL, DETAIL_BUDGET_MS, byPriorityThenOldest,
  type Candidate, type PreviousJobRow, type ActiveCheck, type AssignmentState,
} from "./generate.ts";
import type { JobRole } from "./roles.ts";
import type { CareerTier } from "./career.ts";

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

  
// ── 신입·주니어 Soft Priority(20절) ─────────────────────────────────────────────────────────
// 여기가 "왜 고경력 공고만 들어왔지"에 답하는 부분이다. 경력직을 제외하는 필터가 아니라, 하루
// 최대 PROMOTION_LIMIT(2)건까지 신입·주니어를 점수 역전으로 끌어올리는 가점 규칙이다. 그래서
// 나머지 슬롯과, floor를 못 넘는 날은 경력직이 그대로 올라온다 — 그게 설계대로인지 여기서 고정한다.
function scored(url: string, score: number, tier: CareerTier): Candidate {
  const c = candidate(url, `회사${url}`, `공고${url}`);
  return { ...c, careerTier: tier, roleScores: { ...c.roleScores, llm_ai_agent: score } };
}
function assign(pool: Candidate[], quotaCount: number) {
  const state: AssignmentState = { chosen: [], usedUrls: new Set(), promotionUsed: 0 };
  assignFromPool(pool, ["llm_ai_agent"], { llm_ai_agent: quotaCount }, state);
  return state;
}

// 1) 점수가 낮아도 floor(최고점의 75%) 위이고 22점 이상이면 경력직을 앞지른다.
{
  const state = assign([scored("exp", 40, "experienced"), scored("new", 32, "entry")], 1);
  assert.equal(state.chosen[0].url, "new", "floor 안의 신입은 더 높은 점수의 경력직을 앞질러야 한다");
  assert.equal(state.promotionUsed, 1);
}

// 2) floor 미달(40*0.75=30 미만)이면 promotion이 안 걸리고 경력직이 그대로 뽑힌다.
//    오늘 두 계정에서 신입 0건이 나온 경로가 이것이다 — 버그가 아니라 이 규칙이다.
{
  const state = assign([scored("exp", 40, "experienced"), scored("new", 29, "entry")], 1);
  assert.equal(state.chosen[0].url, "exp", "floor 미달 신입은 promotion 대상이 아니다");
  assert.equal(state.promotionUsed, 0);
}

// 3) 22점(PROMOTION_MIN_SCORE) 미달이면 floor를 넘더라도 promotion 안 된다.
{
  const state = assign([scored("exp", 24, "experienced"), scored("new", 21, "entry")], 1);
  assert.equal(state.chosen[0].url, "exp", "22점 미달 신입은 promotion 대상이 아니다");
  assert.equal(state.promotionUsed, 0);
}

// 4) 하루 상한 2건 — 신입 후보가 넘쳐도 3건째부터는 점수순으로 돌아간다.
{
  const state = assign(
    [scored("e1", 40, "experienced"), scored("n1", 39, "entry"), scored("n2", 38, "junior"), scored("n3", 37, "entry")],
    4
  );
  assert.equal(state.promotionUsed, 2, "promotion은 하루 2건까지다");
  assert.equal(state.chosen.length, 4);
}

// 5) junior도 entry와 같이 우선 대상이다(isEntryFriendly).
{
  const state = assign([scored("exp", 40, "experienced"), scored("jr", 31, "junior")], 1);
  assert.equal(state.chosen[0].url, "jr");
}

// 6) unknown은 신입으로 취급하지 않는다(11절) — 신호가 없으면 가점 없이 점수순이다.
{
  const state = assign([scored("exp", 40, "experienced"), scored("unk", 32, "unknown")], 1);
  assert.equal(state.chosen[0].url, "exp", "unknown은 promotion 대상이 아니다");
  assert.equal(state.promotionUsed, 0);
}

// ── extractCandidatesFrom — 상세 추출을 순차 for에서 파도 병렬로 바꿨다. 바꾸면서 지켜야 할 것 4가지. ──
{
  // buildCandidate를 실제로 통과하는 필드여야 한다 — 신호가 없으면 classifyJobRoles가 전부 떨궈
  // out이 빈 배열이 되고, 순서 검증이 아무것도 검증하지 못한다(filter.check.ts:23의 통과 케이스와 같은 조합).
  const fields = (company: string) => ({
    is_job_posting: true, company, title: "AI Agent Engineer", role: "",
    responsibilities: "LangGraph, MCP 기반 워크플로 설계",
    required_text: "RAG 파이프라인 구축 경험",
    preferred_text: "", career_requirement: "경력무관", deadline: null,
    posted_at: null, date_confidence: "unknown" as const,
  });
  const urls = Array.from({ length: 12 }, (_, i) => `u${i}`);

  // 1) 순서 보존 + 전량 처리. 파도로 쪼개도 out 순서는 입력 순서 그대로여야 한다 —
  //    깨지면 quota 배정(assignFromPool)이 보는 후보 순위가 조용히 달라진다.
  {
    const seen: string[] = [];
    const out = await extractCandidatesFrom(urls, "테스트", "2026-08-24", ["llm_ai_agent"], async (url) => {
      seen.push(url);
      return fields(url);
    });
    assert.equal(seen.length, 12, "cap 안의 URL은 전부 요청해야 한다(조기 종료 없음)");
    assert.deepEqual(out.map((c) => c.url), urls, "출력 순서가 입력 순서와 같아야 한다");
  }

  // 2) 동시성은 DETAIL_POOL로 묶인다 — 열어두면 한 사이트에 15개를 동시에 때려 차단을 부른다.
  {
    let inFlight = 0, peak = 0;
    await extractCandidatesFrom(urls, "테스트", "2026-08-24", ["llm_ai_agent"], async (url) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return fields(url);
    });
    assert.equal(peak, DETAIL_POOL, `동시 요청이 ${DETAIL_POOL}을 넘지 않아야 한다 (실측 ${peak})`);
  }

  // 3) URL 하나가 throw해도 그 한 건만 빠진다. 예전엔 바깥 try까지 올라가 사이트 수집 전체가 []였다.
  {
    const out = await extractCandidatesFrom(urls, "테스트", "2026-08-24", ["llm_ai_agent"], async (url) => {
      if (url === "u3" || url === "u7") throw new Error("상세 페이지 타임아웃");
      return fields(url);
    });
    assert.deepEqual(out.map((c) => c.url), urls.filter((u) => u !== "u3" && u !== "u7"),
      "실패한 URL만 빠지고 나머지는 살아야 한다");
  }

  // 4) 예산을 넘기면 다음 파도를 띄우지 않는다 — 진행 중인 fetch를 버리는 게 아니라 스케줄링만 멈춘다.
  //    (버리면 daily_jobs_run이 processing으로 남아 12분간 사용자가 아무것도 못 한다.)
  {
    let calls = 0;
    const slow = DETAIL_BUDGET_MS / 2 + 20; // 두 파도만 돌면 예산 초과
    const out = await extractCandidatesFrom(urls, "테스트", "2026-08-24", ["llm_ai_agent"], async (url) => {
      calls++;
      await new Promise((r) => setTimeout(r, slow));
      return fields(url);
    });
    assert.ok(calls < urls.length, `예산 초과 후에는 더 요청하지 않아야 한다 (요청 ${calls}/${urls.length})`);
    assert.ok(out.length === calls, "예산에 걸려 멈춰도 그때까지 모은 결과는 그대로 반환해야 한다");
  }
}

// ── STEP F 재추천 정렬: 직무 우선순위 > career tier > 오래된 순 ─────────────────────────────
// 2026-09-04 — 신입·주니어가 "한 번 추천됐다"는 이유로 영구히 밀리던 것을 여기서 되돌린다.
// 세 축의 **순위 관계**를 고정한다. 하나라도 뒤집히면 그날의 증상이 그대로 돌아온다.
{
  const ROLES: JobRole[] = ["llm_ai_agent", "ai_service_backend"];
  const sortBy = byPriorityThenOldest(ROLES);
  const row = (p: Partial<PreviousJobRow>) => previousRow(p);

  // ① 같은 직무 안에서는 신입·주니어가 경력직보다 먼저 — 이번 수정의 핵심.
  //    ⚠️ 경력직 쪽을 **더 오래된** 날짜로 둔다. tier가 없으면 oldest 규칙에 따라 경력직이 이겼을 것이다.
  const 신입 = row({ url: "https://entry", job_date: "2026-09-01", career_requirement: "신입" });
  const 경력 = row({ url: "https://exp", job_date: "2026-08-01", career_requirement: "경력 5년 이상" });
  assert.deepStrictEqual([경력, 신입].sort(sortBy).map((r) => r.url), ["https://entry", "https://exp"],
    "같은 직무라면 더 오래된 경력직보다 신입이 먼저 재추천돼야 한다");

  // ② 그래도 **직무 우선순위가 1순위**다 — 사용자가 정한 트랙을 tier가 뒤집으면 안 된다.
  const 뒷직무신입 = row({ url: "https://b-entry", matched_role: "ai_service_backend", career_requirement: "신입" });
  const 앞직무경력 = row({ url: "https://a-exp", matched_role: "llm_ai_agent", career_requirement: "경력 5년 이상" });
  assert.deepStrictEqual([뒷직무신입, 앞직무경력].sort(sortBy).map((r) => r.url), ["https://a-exp", "https://b-entry"],
    "직무 우선순위가 career tier보다 앞선다");

  // ③ 같은 tier 안에서는 오래된 순이 유지된다 — 같은 신입 공고만 반복 추천되는 것을 막는 순환 원칙.
  const 새신입 = row({ url: "https://new", job_date: "2026-09-03", career_requirement: "신입" });
  const 헌신입 = row({ url: "https://old", job_date: "2026-08-13", career_requirement: "신입" });
  assert.deepStrictEqual([새신입, 헌신입].sort(sortBy).map((r) => r.url), ["https://old", "https://new"],
    "같은 tier면 오래 안 보여준 것이 먼저다(반복 추천 방지)");

  // ④ junior도 experienced보다 먼저다(entry 전용 규칙이 아니다).
  // ⚠️ "경력 2년"만 쓰면 career.ts가 unknown으로 본다("이상"·범위·"이하"가 있어야 연차를 읽는다).
  //    실제 데이터도 "경력 2년 이상" / "경력 1~5년" 형태다.
  const 주니어 = row({ url: "https://junior", job_date: "2026-09-03", career_requirement: "경력 2년 이상" });
  const 경력2 = row({ url: "https://exp2", job_date: "2026-08-01", career_requirement: "경력 7년 이상" });
  assert.deepStrictEqual([경력2, 주니어].sort(sortBy).map((r) => r.url), ["https://junior", "https://exp2"],
    "junior도 experienced보다 먼저 재추천된다");
}

console.log("generate.check.ts OK");
})();
