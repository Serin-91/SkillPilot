import { createAdminClient } from "@/lib/supabase/admin";
import { tavilySearch } from "./tavily";
import type { ExtractedJobFields } from "./extract-fields";
import { fetchWantedJobDetail } from "./wanted";
import { fetchJumpitJobDetail, fetchJumpitPositions } from "./jumpit";
import { fetchJobKoreaJobDetail, searchJobKorea } from "./jobkorea";
import { passesHardFilter, classifyJobRoles, roleFitScore, snippetFitScore } from "./filter";
import { classifyCareerTier, isEntryFriendly, type CareerTier } from "./career";
import {
  JOB_SITES, MAX_SEARCH_RESULTS_PER_SITE, MAX_EXTRACT_ATTEMPTS_PER_SITE, WIDE_SEARCH_RESULTS_PER_SITE,
  JUMPIT_CATEGORY, JUMPIT_EXPANSION_RESULTS_PER_CATEGORY,
} from "./sources";
import {
  JOB_ROLE_CONFIG, JOBKOREA_SEARCH_QUERY, WANTED_EXPANSION_QUERY, JOBKOREA_EXPANSION_QUERY,
  DAILY_JOB_LIMIT, getDailyRoleQuota, validatePriorityOrder, isJobRole, type JobRole,
} from "./roles";
import { todayKSTDateString } from "@/lib/news/kst";
// NEW 배지 관련 순수 로직은 new-badge.ts 한 곳에 모아 두었다(별칭 없는 모듈이라 자체 점검이 직접 돌린다).
import { identityKey, firstRecommendedDateFor } from "./new-badge";
// generate.check.ts가 여기서 import하고 있어 그대로 다시 내보낸다(호출부 변경 없이 위치만 옮겼다).
export { firstRecommendedDateFor };
import { notifyApiFailure } from "./notify";

const WANTED_SITE = JOB_SITES.find((s) => s.domain === "wanted.co.kr")!;
const JUMPIT_SITE = JOB_SITES.find((s) => s.domain === "jumpit.saramin.co.kr")!;
const JOBKOREA_SITE = JOB_SITES.find((s) => s.domain === "jobkorea.co.kr")!;

// 원티드·점핏·잡코리아 모두 페이지 안에 필드가 구조화돼 있어 직접 파싱한다(wanted.ts/jumpit.ts/jobkorea.ts).
async function extractCandidateFields(url: string, domain: string): Promise<ExtractedJobFields | null> {
  if (domain === "wanted.co.kr") return fetchWantedJobDetail(url);
  if (domain === "jumpit.saramin.co.kr") return fetchJumpitJobDetail(url);
  if (domain === "jobkorea.co.kr") return fetchJobKoreaJobDetail(url);
  return null;
}

// 2026-08-13 3소스 재구축 — 한 공고가 여러 SkillPilot role에 동시에 eligible할 수 있어(복합 직무 공고,
// 13절) 예전처럼 "검색에 쓴 role" 하나로 버킷을 나누지 않는다. roleScores/eligibleRoles를 전부 들고 있다가
// 최종 배정(assignFromPool) 단계에서만 assignedRole 하나로 확정한다.
export type Candidate = {
  url: string; site: string; fields: ExtractedJobFields;
  roleScores: Record<JobRole, number>; eligibleRoles: JobRole[]; primaryRole: JobRole; careerTier: CareerTier;
};

// 최종 선택 결과 — matched_role에는 primaryRole이 아니라 이 assignedRole을 저장한다(13-1절 P0:
// "이번 추천 배치에서 이 공고가 어떤 SkillPilot role 슬롯으로 추천되었는가").
export type SelectedJob = {
  url: string; site: string; fields: ExtractedJobFields;
  assignedRole: JobRole; assignedFit: number; careerTier: CareerTier;
};

// Hard Filter(교육/비개발) → 4 role 채점 → gate 통과 role이 하나도 없으면 후보 탈락(3절 파이프라인 순서).
function buildCandidate(url: string, site: string, fields: ExtractedJobFields, allowedRoles: readonly JobRole[]): Candidate | null {
  if (!passesHardFilter(fields)) return null;
  const { primaryRole, roleScores, eligibleRoles } = classifyJobRoles(fields, allowedRoles);
  if (!primaryRole) return null;
  return { url, site, fields, roleScores, eligibleRoles, primaryRole, careerTier: classifyCareerTier(fields) };
}

// ponytail: 같은 (날짜, 사이트[, 직무]) 수집 결과를 프로세스 메모리에만 캐시한다 — 한 서버 인스턴스가 사는 동안
// 중복 호출을 막는 게 목적이고, 인스턴스가 여러 개거나 재시작하면 다시 수집한다.
const candidateCache = new Map<string, Promise<Candidate[]>>();

// role별 quota+2(quota 0인 트랙은 2) — "충분한 비교 pool" 목표치. 이 개수를 못 채우면 expansion을 부른다(P1/16절).
function roleTarget(role: JobRole, quota: Record<string, number>): number {
  const q = quota[role] ?? 0;
  return q > 0 ? q + 2 : 2;
}

// 원티드 — role별 검색으로 후보를 찾은 뒤(discovery), 상세 필드는 allowedRoles 전체 기준으로 다시 채점한다.
// query/variant를 분리한 건 primary/expansion이 서로 다른 검색 의미를 갖기 때문이다(P1 — "검색 깊이 확대
// ≠ 검색 의미 확대"). variant는 캐시 key에도 들어가 같은 role이라도 primary/expansion 결과가 섞이지 않는다.
function collectWantedCandidates(
  role: JobRole,
  localDate: string,
  allowedRoles: readonly JobRole[],
  query: string,
  variant: "primary" | "expansion",
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const key = `${localDate}:wanted:${role}:${variant}:${limit}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    try {
      const candidates = await tavilySearch(query, WANTED_SITE.domain, limit);
      const ranked = [...candidates].sort(
        (a, b) => snippetFitScore(`${b.title} ${b.content}`, role) - snippetFitScore(`${a.title} ${a.content}`, role)
      );
      const out: Candidate[] = [];
      for (const candidate of ranked.slice(0, limit === MAX_SEARCH_RESULTS_PER_SITE ? MAX_EXTRACT_ATTEMPTS_PER_SITE : limit)) {
        const fields = await fetchWantedJobDetail(candidate.url);
        if (!fields || !fields.is_job_posting) continue;
        if (fields.deadline && fields.deadline < localDate) continue;
        const built = buildCandidate(candidate.url, WANTED_SITE.name, fields, allowedRoles);
        if (built) out.push(built);
      }
      return out;
    } catch (err) {
      notifyApiFailure("원티드", err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  })();

  candidateCache.set(key, task);
  task.catch(() => candidateCache.delete(key));
  return task;
}

// primary discovery 후 role target을 못 채웠을 때만 expansion을 1회 더 부른다(직무당 최대 2단계, P1절).
// wide pass(limit이 기본값이 아님)에서는 expansion을 부르지 않는다 — 이미 폭을 넓힌 마지막 단계라
// primary 자체를 넓게 부르는 쪽이 낫고, expansion까지 겹치면 호출량이 불필요하게 늘어난다.
async function collectWantedForRole(
  role: JobRole,
  localDate: string,
  allowedRoles: readonly JobRole[],
  quota: Record<string, number>,
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const primary = await collectWantedCandidates(role, localDate, allowedRoles, JOB_ROLE_CONFIG[role].searchQuery, "primary", limit);
  if (limit !== MAX_SEARCH_RESULTS_PER_SITE || primary.length >= roleTarget(role, quota)) return primary;
  const expansion = await collectWantedCandidates(role, localDate, allowedRoles, WANTED_EXPANSION_QUERY[role], "expansion", limit);
  const seen = new Set(primary.map((c) => c.url));
  return [...primary, ...expansion.filter((c) => !seen.has(c.url))];
}

// 점핏 — "인공지능/머신러닝"(8) 핵심 카테고리는 항상, Backend/DevOps/Data 계열은 expansion으로 소량만
// 더 훑는다(2-2/4-2절 — 그 카테고리 전량을 AI 공고로 인정하지 않고 실제 role gate로 다시 거른다).
// wide pass(limit !== 기본값)에서는 expansion을 건너뛰고 core만 폭을 넓힌다 — 이미 부족분을 메우는
// 마지막 단계라 카테고리를 더 늘리기보다 핵심 카테고리 폭 확대가 비용 대비 효율적이다.
function collectJumpitCandidates(
  localDate: string,
  allowedRoles: readonly JobRole[],
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const key = `${localDate}:jumpit:${limit}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const isWide = limit !== MAX_SEARCH_RESULTS_PER_SITE;
  const task = (async () => {
    try {
      const corePositions = await fetchJumpitPositions(limit, JUMPIT_CATEGORY.AI_ML);
      const expansionLists = isWide
        ? []
        : await Promise.all(
            [JUMPIT_CATEGORY.BACKEND, JUMPIT_CATEGORY.DEVOPS_SYSTEM, JUMPIT_CATEGORY.DATA_ENGINEER].map((cat) =>
              fetchJumpitPositions(JUMPIT_EXPANSION_RESULTS_PER_CATEGORY, cat)
            )
          );
      const seenUrls = new Set<string>();
      const merged = [...corePositions, ...expansionLists.flat()].filter((p) => {
        if (seenUrls.has(p.url)) return false;
        seenUrls.add(p.url);
        return true;
      });
      const ranked = [...merged].sort(
        (a, b) =>
          Math.max(...allowedRoles.map((r) => snippetFitScore(`${b.title} ${b.content}`, r))) -
          Math.max(...allowedRoles.map((r) => snippetFitScore(`${a.title} ${a.content}`, r)))
      );
      const extractCap = isWide ? limit : MAX_EXTRACT_ATTEMPTS_PER_SITE;
      const out: Candidate[] = [];
      for (const candidate of ranked.slice(0, extractCap)) {
        const fields = await fetchJumpitJobDetail(candidate.url);
        if (!fields || !fields.is_job_posting) continue;
        if (fields.deadline && fields.deadline < localDate) continue;
        const built = buildCandidate(candidate.url, JUMPIT_SITE.name, fields, allowedRoles);
        if (built) out.push(built);
      }
      return out;
    } catch (err) {
      notifyApiFailure("점핏", err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  })();

  candidateCache.set(key, task);
  task.catch(() => candidateCache.delete(key));
  return task;
}

// 잡코리아 — role별 검색(stext)으로 후보를 찾은 뒤 실제 상세페이지에서 검증한다(9절 discovery).
// 검색 결과 자체가 이미 잡코리아의 관련도 정렬을 따르므로 별도 snippet 랭킹 없이 순서 그대로 쓴다.
// Wanted와 동일하게 query/variant를 분리해 primary/expansion 캐시가 섞이지 않게 한다(P1절).
function collectJobKoreaCandidates(
  role: JobRole,
  localDate: string,
  allowedRoles: readonly JobRole[],
  query: string,
  variant: "primary" | "expansion",
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const key = `${localDate}:jobkorea:${role}:${variant}:${limit}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    try {
      const candidates = await searchJobKorea(query, limit);
      const extractCap = limit === MAX_SEARCH_RESULTS_PER_SITE ? MAX_EXTRACT_ATTEMPTS_PER_SITE : limit;
      const out: Candidate[] = [];
      for (const candidate of candidates.slice(0, extractCap)) {
        const fields = await fetchJobKoreaJobDetail(candidate.url);
        if (!fields || !fields.is_job_posting) continue;
        if (fields.deadline && fields.deadline < localDate) continue;
        const built = buildCandidate(candidate.url, JOBKOREA_SITE.name, fields, allowedRoles);
        if (built) out.push(built);
      }
      return out;
    } catch (err) {
      notifyApiFailure("잡코리아", err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  })();

  candidateCache.set(key, task);
  task.catch(() => candidateCache.delete(key));
  return task;
}

async function collectJobKoreaForRole(
  role: JobRole,
  localDate: string,
  allowedRoles: readonly JobRole[],
  quota: Record<string, number>,
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const primary = await collectJobKoreaCandidates(role, localDate, allowedRoles, JOBKOREA_SEARCH_QUERY[role], "primary", limit);
  if (limit !== MAX_SEARCH_RESULTS_PER_SITE || primary.length >= roleTarget(role, quota)) return primary;
  const expansion = await collectJobKoreaCandidates(role, localDate, allowedRoles, JOBKOREA_EXPANSION_QUERY[role], "expansion", limit);
  const seen = new Set(primary.map((c) => c.url));
  return [...primary, ...expansion.filter((c) => !seen.has(c.url))];
}

// ── Cross-source dedup(17절) ────────────────────────────────────────────────────────────────

// completeness 근사치 — responsibilities/required/preferred 길이 + posted_at/career 존재 여부(17-3절).
// 엄밀한 5단계 lexicographic 대신 단일 합산 점수로 근사한다(21절 "과도하게 복잡한 optimizer 불필요").
function candidateQuality(c: Candidate): number {
  const f = c.fields;
  let score = f.responsibilities.length + f.required_text.length + f.preferred_text.length;
  if (f.posted_at) score += 500;
  if (f.career_requirement && f.career_requirement !== "경력무관") score += 100;
  return score;
}
function betterCandidate(a: Candidate, b: Candidate): Candidate {
  return candidateQuality(b) > candidateQuality(a) ? b : a;
}

// exact URL dedup 먼저, 그다음 회사+공고명 identity dedup — 서로 다른 source의 같은 포지션을 하나로 합친다.
// fuzzy 유사도(Jaccard 등)는 쓰지 않는다 — 다른 공고를 잘못 합치는 게 중복노출보다 위험하다(17-2절 보수적 판정).
export function dedupCandidates(jobs: Candidate[]): Candidate[] {
  const byUrl = new Map<string, Candidate>();
  for (const job of jobs) {
    const existing = byUrl.get(job.url);
    byUrl.set(job.url, existing ? betterCandidate(existing, job) : job);
  }
  const byIdentity = new Map<string, Candidate>();
  for (const job of byUrl.values()) {
    const key = identityKey(job.fields);
    const existing = byIdentity.get(key);
    byIdentity.set(key, existing ? betterCandidate(existing, job) : job);
  }
  return [...byIdentity.values()];
}

async function collectAllCandidates(
  roles: JobRole[],
  localDate: string,
  quota: Record<string, number>,
  limit: number = MAX_SEARCH_RESULTS_PER_SITE
): Promise<Candidate[]> {
  const [wantedPerRole, jumpitShared, jobkoreaPerRole] = await Promise.all([
    Promise.all(roles.map((role) => collectWantedForRole(role, localDate, roles, quota, limit))),
    collectJumpitCandidates(localDate, roles, limit),
    Promise.all(roles.map((role) => collectJobKoreaForRole(role, localDate, roles, quota, limit))),
  ]);
  return dedupCandidates([...wantedPerRole.flat(), ...jumpitShared, ...jobkoreaPerRole.flat()]);
}

// 추천 순환(신규 우선 → 과거 활성 공고 재추천)에 쓰는 이 사용자의 과거 saved_job 전체.
export type PreviousJobRow = {
  url: string; job_date: string; first_recommended_date: string | null; deadline: string | null;
  matched_role: string | null; company: string; title: string; role: string | null; source_site: string | null;
  responsibilities: string | null; required_text: string | null; preferred_text: string | null;
  career_requirement: string | null; posted_at: string | null; date_confidence: string | null;
};

async function loadPreviouslyRecommendedJobs(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PreviousJobRow[]> {
  const { data, error } = await supabase
    .from("saved_job")
    .select("url, job_date, first_recommended_date, deadline, matched_role, company, title, role, source_site, responsibilities, required_text, preferred_text, career_requirement, posted_at, date_confidence")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as PreviousJobRow[];
}

// 같은 identity(회사+공고명)의 과거 row가 여럿이면 가장 이른 first_recommended_date를 가진 row를 남긴다 —
// "이 URL을 처음 봄"이 아니라 "이 채용 포지션을 처음 추천함"이 NEW의 의미이기 때문이다(18-1절).
export function buildPreviousIdentityMap(previousJobs: PreviousJobRow[]): Map<string, PreviousJobRow> {
  const map = new Map<string, PreviousJobRow>();
  for (const row of previousJobs) {
    const key = identityKey(row);
    const existing = map.get(key);
    const rowFirst = row.first_recommended_date ?? row.job_date;
    const existingFirst = existing ? (existing.first_recommended_date ?? existing.job_date) : null;
    if (!existing || (existingFirst && rowFirst < existingFirst)) map.set(key, row);
  }
  return map;
}

// 2026-08-13 보완 — identity(회사+공고명)가 과거에 존재한다는 이유로 candidate 자체를 pool에서 빼면
// 안 된다(P0). 어제 Wanted URL A가 죽고 오늘 JobKorea URL B(같은 포지션, 실제 active)가 새로 발견된
// 경우: seenIdentity ≠ candidateReject — B는 여전히 선택 가능해야 하고, 다만 NEW 배지와
// first_recommended_date만 과거 identity를 승계한다(firstRecommendedDateFor). 그래서 STEP D/E
// candidate pool 필터는 URL 기준으로만 판단한다 — 같은 URL을 이미 추천한 적 있으면(진짜 재노출) 그건
// STEP F/G 순환 로직이 별도로 담당하므로 여기서는 뺀다.
export function isUnseenUrl(url: string, previousByUrl: Map<string, PreviousJobRow>): boolean {
  return !previousByUrl.has(url);
}


function rowToFields(row: PreviousJobRow): ExtractedJobFields {
  return {
    is_job_posting: true,
    company: row.company,
    title: row.title,
    role: row.role ?? "",
    responsibilities: row.responsibilities ?? "",
    required_text: row.required_text ?? "",
    preferred_text: row.preferred_text ?? "",
    career_requirement: row.career_requirement ?? "",
    deadline: row.deadline,
    posted_at: row.posted_at,
    date_confidence: (row.date_confidence as ExtractedJobFields["date_confidence"]) ?? "unknown",
  };
}

// matched_role이 legacy slug(backend/frontend/ai_ml/data_engineer)나 그 외 값이면 현재 role 체계에서
// 채점할 수 없으므로 0 — 과거 legacy 추천이 재순환/랭킹에 섞이지 않는다(24절 안전 처리).
function previousJobFit(row: PreviousJobRow): number {
  if (!isJobRole(row.matched_role)) return 0;
  return roleFitScore(rowToFields(row), row.matched_role);
}

function byOldestThenFit(a: PreviousJobRow, b: PreviousJobRow): number {
  if (a.job_date !== b.job_date) return a.job_date < b.job_date ? -1 : 1;
  const diff = previousJobFit(b) - previousJobFit(a);
  if (diff !== 0) return diff;
  return (b.posted_at ?? "").localeCompare(a.posted_at ?? "");
}
function byPriorityThenOldest(priorityRoles: JobRole[]) {
  return (a: PreviousJobRow, b: PreviousJobRow) => {
    const diff = priorityRoles.indexOf(a.matched_role as JobRole) - priorityRoles.indexOf(b.matched_role as JobRole);
    return diff !== 0 ? diff : byOldestThenFit(a, b);
  };
}

// 2026-08-13 보완(P1) — active/closed/unknown을 명시적으로 구분한다(24절). 세 곳의 판정 근거:
//   - closed: fetcher가 null을 준 경우(마감/삭제/파싱 실패 — 각 fetcher가 이미 그렇게 확정) 또는
//     저장된 deadline이 지난 경우.
//   - unknown: 네트워크 타임아웃 등 "확인 자체가 실패"한 경우만 — 확실히 죽었다고 단정하지 않는다.
//   - active: 정상 파싱 + deadline 유효.
// fetcher 각각이 "HTTP 오류/필수 필드 없음/마감"을 전부 null 하나로 합쳐 반환하는 기존 구조는 그대로
// 둔다(대규모 리팩터링 금지) — 이 타입은 그 세 갈래를 감싸는 얇은 wrapper일 뿐, 판정 로직 자체는 안 바꿨다.
export type ActiveCheck =
  | { state: "active"; fields: ExtractedJobFields }
  | { state: "closed" }
  | { state: "unknown" };

async function reverifyStillActive(url: string, localDate: string): Promise<ActiveCheck> {
  const domain = url.includes("wanted.co.kr") ? "wanted.co.kr"
    : url.includes("jumpit.saramin.co.kr") ? "jumpit.saramin.co.kr"
    : url.includes("jobkorea.co.kr") ? "jobkorea.co.kr"
    : null;
  if (!domain) return { state: "unknown" };
  try {
    const fields = await extractCandidateFields(url, domain);
    if (!fields || !fields.is_job_posting) return { state: "closed" }; // 명확히 마감/삭제됨
    if (fields.deadline && fields.deadline < localDate) return { state: "closed" };
    return { state: "active", fields };
  } catch {
    return { state: "unknown" };
  }
}

// previous+active가 previous+unknown보다 항상 먼저 오도록 정렬한다(3절 우선순위) — 각 묶음 안에서는
// 검증 전 순서(우선순위 트랙 → 오래 안 보여준 순)를 그대로 보존한다. 이미 저장된 deadline이 지났으면
// unknown이어도 쓰지 않는다.
export function orderVerifiedByPriority(
  verified: { row: PreviousJobRow; check: ActiveCheck }[],
  localDate: string
): { row: PreviousJobRow; check: ActiveCheck }[] {
  const activeFirst = verified.filter((v) => v.check.state === "active");
  const unknownLast = verified.filter((v) => v.check.state === "unknown" && !(v.row.deadline && v.row.deadline < localDate));
  return [...activeFirst, ...unknownLast];
}

type DailyJobsRunRow = { status: string; last_attempt_at: string };
type RunStatus = "processing" | "success" | "partial" | "failed";

const PROCESSING_STALE_MS = 12 * 60 * 1000;
const FALLBACK_VERIFY_BUFFER = 2;
const FALLBACK_VERIFY_BATCH_SIZE = 3;
const UNIQUE_VIOLATION = "23505";

// 신입·주니어 Soft Priority(20절) — 하루 최대 2건, quality floor 둘 다 만족해야 promotion 대상이다.
const PROMOTION_LIMIT = 2;
const PROMOTION_MIN_SCORE = 22;
const PROMOTION_RELATIVE_FLOOR = 0.75;

async function claimProcessingSlot(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  localDate: string,
  roles: JobRole[],
  existing: DailyJobsRunRow | null
): Promise<string | null> {
  const claimedAt = new Date().toISOString();
  if (!existing) {
    const { error } = await supabase
      .from("daily_jobs_run")
      .insert({ user_id: userId, job_date: localDate, role_snapshot: roles, job_count: 0, status: "processing", last_attempt_at: claimedAt });
    if (!error) return claimedAt;
    if (error.code === UNIQUE_VIOLATION) return null;
    throw error;
  }
  const { data, error } = await supabase
    .from("daily_jobs_run")
    .update({ status: "processing", last_attempt_at: claimedAt, role_snapshot: roles })
    .eq("user_id", userId).eq("job_date", localDate)
    .eq("status", "processing").eq("last_attempt_at", existing.last_attempt_at)
    .select("user_id");
  if (error) throw error;
  return (data?.length ?? 0) > 0 ? claimedAt : null;
}

async function finalizeAttempt(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  localDate: string,
  claimedAt: string,
  patch: { status: RunStatus; job_count: number; selected_urls?: string[]; generated_at?: string }
): Promise<void> {
  await supabase
    .from("daily_jobs_run")
    .update(patch)
    .eq("user_id", userId).eq("job_date", localDate)
    .eq("status", "processing").eq("last_attempt_at", claimedAt);
}

// ── 최종 배정(13/20/21절) ────────────────────────────────────────────────────────────────────
type AssignmentState = { chosen: SelectedJob[]; usedUrls: Set<string>; promotionUsed: number };

function byRoleFitThenRecency(role: JobRole) {
  return (a: Candidate, b: Candidate) => {
    const diff = b.roleScores[role] - a.roleScores[role];
    return diff !== 0 ? diff : (b.fields.posted_at ?? "").localeCompare(a.fields.posted_at ?? "");
  };
}

// role별 quota를 채운다 — 한 후보가 여러 role에 eligible해도 실제로는 한 slot만 차지한다(usedUrls로 보장).
// promotion quality floor(bestScore)는 그 role 처리 시작 시점의 pool로 한 번만 고정한다 — 상위 후보가
// 먼저 빠져나간 뒤 baseline이 흔들리면 이후 promotion 판정이 왜곡되기 때문이다.
function assignFromPool(pool: Candidate[], roles: JobRole[], quota: Record<string, number>, state: AssignmentState): void {
  const remainingQuota: Record<string, number> = { ...quota };
  for (const job of state.chosen) {
    if (remainingQuota[job.assignedRole] !== undefined) remainingQuota[job.assignedRole]--;
  }
  const available = () => pool.filter((c) => !state.usedUrls.has(c.url));

  for (const role of roles) {
    const initialPool = available().filter((c) => c.eligibleRoles.includes(role));
    if (initialPool.length === 0) continue;
    const bestScore = Math.max(...initialPool.map((c) => c.roleScores[role]));

    while (remainingQuota[role] > 0) {
      const pool2 = available().filter((c) => c.eligibleRoles.includes(role));
      if (pool2.length === 0) break;

      const promotable = state.promotionUsed < PROMOTION_LIMIT
        ? pool2.filter(
            (c) => isEntryFriendly(c.careerTier) && c.roleScores[role] >= PROMOTION_MIN_SCORE && c.roleScores[role] >= bestScore * PROMOTION_RELATIVE_FLOOR
          )
        : [];
      const isPromotion = promotable.length > 0;
      const pick = [...(isPromotion ? promotable : pool2)].sort(byRoleFitThenRecency(role))[0];
      if (isPromotion) state.promotionUsed++;

      state.chosen.push({ url: pick.url, site: pick.site, fields: pick.fields, assignedRole: role, assignedFit: pick.roleScores[role], careerTier: pick.careerTier });
      state.usedUrls.add(pick.url);
      remainingQuota[role]--;
    }
  }
}

// quota를 다 채우고도 남은 슬롯을 leftover 후보로 채운다(23절 backfill) — 사용자가 선택한 role 우선순위
// 트랙 순서대로, 그 후보가 eligible한 가장 앞선 role에 배정한다.
function backfillRemaining(pool: Candidate[], roles: JobRole[], state: AssignmentState): void {
  if (state.chosen.length >= DAILY_JOB_LIMIT) return;
  const leftovers = pool
    .filter((c) => !state.usedUrls.has(c.url))
    .map((c) => {
      const role = roles.find((r) => c.eligibleRoles.includes(r));
      return role ? { c, role, priorityIdx: roles.indexOf(role) } : null;
    })
    .filter((x): x is { c: Candidate; role: JobRole; priorityIdx: number } => x !== null)
    .sort((a, b) => {
      if (a.priorityIdx !== b.priorityIdx) return a.priorityIdx - b.priorityIdx;
      const diff = b.c.roleScores[b.role] - a.c.roleScores[a.role];
      return diff !== 0 ? diff : (b.c.fields.posted_at ?? "").localeCompare(a.c.fields.posted_at ?? "");
    });

  for (const { c, role } of leftovers) {
    if (state.chosen.length >= DAILY_JOB_LIMIT) break;
    if (state.usedUrls.has(c.url)) continue;
    state.chosen.push({ url: c.url, site: c.site, fields: c.fields, assignedRole: role, assignedFit: c.roleScores[role], careerTier: c.careerTier });
    state.usedUrls.add(c.url);
  }
}

// 예약 생성과 최초 접속 fallback이 모두 이 함수 하나만 호출한다. priorityRoles[0]이 1순위다.
export async function assembleDailyJobs(
  userId: string,
  priorityRoles: JobRole[],
  localDate: string = todayKSTDateString()
): Promise<SelectedJob[]> {
  const roles = validatePriorityOrder(priorityRoles);
  if (!roles) return [];

  const supabase = createAdminClient();
  const { data: existingRow } = await supabase
    .from("daily_jobs_run")
    .select("status, last_attempt_at")
    .eq("user_id", userId).eq("job_date", localDate)
    .maybeSingle<DailyJobsRunRow>();

  let takeoverTarget: DailyJobsRunRow | null = null;
  if (existingRow) {
    if (existingRow.status === "success") return [];
    if (existingRow.status === "processing") {
      const staleMs = Date.now() - new Date(existingRow.last_attempt_at).getTime();
      if (staleMs < PROCESSING_STALE_MS) return [];
      takeoverTarget = existingRow;
    } else {
      return [];
    }
  }

  const claimedAt = await claimProcessingSlot(supabase, userId, localDate, roles, takeoverTarget);
  if (!claimedAt) return [];

  const quota = getDailyRoleQuota(roles, localDate);
  const previousJobs = await loadPreviouslyRecommendedJobs(supabase, userId);
  const previousByUrl = new Map(previousJobs.map((j) => [j.url, j]));
  const previousByIdentity = buildPreviousIdentityMap(previousJobs);

  const state: AssignmentState = { chosen: [], usedUrls: new Set(), promotionUsed: 0 };

  // STEP D — 3소스 신규(미노출 URL) 후보 pool 확보 → quota 배정 → backfill. identity가 과거에 있어도
  // URL이 새것이면(cross-source 재발견) 여기 들어온다 — NEW 여부는 저장 시 firstRecommendedDateFor가 따로 정한다.
  const freshPool = await collectAllCandidates(roles, localDate, quota);
  const freshUnseen = freshPool.filter((c) => isUnseenUrl(c.url, previousByUrl));
  assignFromPool(freshUnseen, roles, quota, state);
  backfillRemaining(freshUnseen, roles, state);

  // STEP E — 그래도 부족하면 더 넓게(WIDE_SEARCH_RESULTS_PER_SITE) 다시 수집해서 채운다.
  if (state.chosen.length < DAILY_JOB_LIMIT) {
    const widePool = await collectAllCandidates(roles, localDate, quota, WIDE_SEARCH_RESULTS_PER_SITE);
    const wideUnseen = widePool.filter((c) => isUnseenUrl(c.url, previousByUrl) && !state.usedUrls.has(c.url));
    assignFromPool(wideUnseen, roles, quota, state);
    backfillRemaining(wideUnseen, roles, state);
  }

  // STEP F/G — 신규 공고로도 부족하면 과거에 추천했던 활성 공고를 순환 재추천한다(legacy row는
  // previousJobFit/isJobRole 가드로 배제). 필요한 개수(+여유분)만 소수 병렬로 상세를 다시 확인한다.
  //
  // 2026-08-13 보완(P1) — "previous+active"가 "previous+unknown"보다 항상 먼저 채워지도록 두 단계로
  // 나눈다: 먼저 fallbackPool 전체를 검증만 하고(끊지 않고 끝까지), active/unknown으로 나눈 뒤
  // active를 다 채우고도 남을 때만 unknown을 쓴다. 이렇게 안 하면(끊어가며 순서대로 push) 앞쪽 배치의
  // unknown이 뒤쪽 배치의 active보다 먼저 뽑혀 우선순위가 뒤집힐 수 있다.
  if (state.chosen.length < DAILY_JOB_LIMIT) {
    const needed = DAILY_JOB_LIMIT - state.chosen.length;
    const fallbackPool = previousJobs
      .filter((row) => isJobRole(row.matched_role) && roles.includes(row.matched_role))
      .filter((row) => !state.usedUrls.has(row.url))
      .filter((row) => !(row.deadline && row.deadline < localDate))
      .sort(byPriorityThenOldest(roles))
      .slice(0, needed + FALLBACK_VERIFY_BUFFER);

    const verified: { row: PreviousJobRow; check: ActiveCheck }[] = [];
    for (let i = 0; i < fallbackPool.length; i += FALLBACK_VERIFY_BATCH_SIZE) {
      const batch = fallbackPool.slice(i, i + FALLBACK_VERIFY_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((row) => reverifyStillActive(row.url, localDate)));
      batch.forEach((row, idx) => {
        const settled = results[idx];
        verified.push({ row, check: settled.status === "fulfilled" ? settled.value : { state: "unknown" } });
      });
    }

    for (const { row, check } of orderVerifiedByPriority(verified, localDate)) {
      if (state.chosen.length >= DAILY_JOB_LIMIT || state.usedUrls.has(row.url)) continue;
      const fields = check.state === "active" ? check.fields : rowToFields(row);
      state.chosen.push({
        url: row.url, site: row.source_site ?? "", fields,
        assignedRole: row.matched_role as JobRole, assignedFit: previousJobFit(row), careerTier: classifyCareerTier(fields),
      });
      state.usedUrls.add(row.url);
    }
  }

  const chosen = state.chosen;

  // STEP H — DAILY_JOB_LIMIT은 목표치이지 통과 조건이 아니다.
  //
  // 예전엔 4건을 못 채우면 status만 partial/failed로 적고 `return []` 했다 — 어렵게 모은 1~3건을
  // saved_job에 쓰지도 않고 통째로 버렸다는 뜻이다. 그러면 사용자 화면엔 어제 배치가 stale로 남고,
  // "지금 업데이트"를 눌러도 같은 파이프라인이 같은 3건을 모아 또 버려서 하루 1회 상한만 소모됐다.
  // 관심 직무가 좁거나 그날 신규 공고가 적으면 구조적으로 빠져나올 수 없는 상태였다.
  // (뉴스 쪽 "억지로 채우지 않는다"와도 방향이 정반대였다 — 뉴스는 3건이라도 보여준다.)
  //
  // 이제 1건이라도 모였으면 그대로 저장하고 오늘 배치로 확정한다. 4건이면 success, 그 미만이면
  // partial로 기록해 "오늘 건 맞지만 목표엔 못 미쳤다"를 구분한다 — get-jobs가 partial도 화면에
  // 띄우고, JobsView.incomplete로 재시도 버튼을 계속 노출한다. 0건일 때만 failed다.
  if (chosen.length === 0) {
    await finalizeAttempt(supabase, userId, localDate, claimedAt, { status: "failed", job_count: 0 });
    return [];
  }
  // 방어적 상한선 — 위 STEP들이 quota를 정확히 지켰다면 이미 4건이어야 한다.
  if (chosen.length > DAILY_JOB_LIMIT) {
    chosen.sort((a, b) => roles.indexOf(a.assignedRole) - roles.indexOf(b.assignedRole) || b.assignedFit - a.assignedFit);
    chosen.length = DAILY_JOB_LIMIT;
  }

  const { error } = await supabase.from("saved_job").upsert(
    chosen.map((job) => ({
      user_id: userId,
      company: job.fields.company,
      title: job.fields.title,
      role: job.fields.role,
      url: job.url,
      source_site: job.site,
      matched_role: job.assignedRole,
      job_date: localDate,
      responsibilities: job.fields.responsibilities,
      required_text: job.fields.required_text,
      preferred_text: job.fields.preferred_text,
      career_requirement: job.fields.career_requirement,
      deadline: job.fields.deadline,
      posted_at: job.fields.posted_at,
      date_confidence: job.fields.date_confidence,
      first_recommended_date: firstRecommendedDateFor(job.fields, job.url, localDate, previousByUrl, previousByIdentity),
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,url" }
  );
  if (error) {
    await finalizeAttempt(supabase, userId, localDate, claimedAt, { status: "failed", job_count: 0 });
    throw error;
  }

  await finalizeAttempt(supabase, userId, localDate, claimedAt, {
    status: chosen.length === DAILY_JOB_LIMIT ? "success" : "partial",
    job_count: chosen.length,
    selected_urls: chosen.map((j) => j.url),
    generated_at: new Date().toISOString(),
  });

  return chosen;
}
