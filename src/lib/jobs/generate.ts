import { createAdminClient } from "@/lib/supabase/admin";
import { tavilySearch } from "./tavily";
import type { ExtractedJobFields } from "./extract-fields";
import { fetchWantedJobDetail } from "./wanted";
import { fetchJumpitJobDetail, fetchJumpitPositions } from "./jumpit";
import { fetchJobKoreaJobDetail, searchJobKorea } from "./jobkorea";
import { passesHardFilter, classifyJobRoles, roleFitScore, snippetFitScore } from "./filter";
import { normalizeJobFields, newNormalizeTally, formatNormalizeTally } from "./normalize";
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
import { resetCollectErrors, takeCollectErrors, recordCollectError } from "./collect-trace.ts";

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

// ── 상세 페이지 추출 ───────────────────────────────────────────────────────────────────────
// 원티드/점핏/잡코리아가 글자만 다른 **같은 순차 for 루프**를 각각 들고 있었다. 하나로 합친다.
//
// 왜 순차가 문제였나: 각 상세 fetch는 AbortSignal.timeout(15_000)을 갖고 있는데(wanted.ts:35 등)
// 루프가 한 건씩 await해서 사이트당 15건이 **직렬**로 쌓였다. expansion까지 30건, STEP E의 wide
// pass까지 겹치면 한 체인 최대 60건 = 최악 900초. 전체 상한은 아무 데도 없었고, 이 경로는
// getJobsView를 통해 **대시보드 마운트마다** 불린다.
//
// 병렬화가 결과를 바꾸지 않는 이유: 이 루프에는 조기 종료가 없다 — 항상 slice(0, cap) 전체를 돈다.
// 그래서 fetch 대상 URL 집합도, out에 쌓이는 순서도 그대로다(파도 순서 + 파도 안 순서 모두 보존).
// Tavily/검색 호출량도 변하지 않는다(여기선 상세 페이지만 받는다).
//
// 동시성을 15로 열지 않고 5로 묶는 이유: 한 채용 사이트에 15개를 동시에 때리면 rate limit이나
// 차단을 부른다. 5면 임계 경로가 3분의 1이 되면서도 충분히 얌전하다.
// ponytail: 고정 풀 5 + 파도 단위 예산. 사이트별로 다르게 줘야 할 이유가 생기면 인자로 뺄 것.
export const DETAIL_POOL = 5;
// 파도를 **새로 띄우기 전에만** 검사하는 예산이라, 진행 중인 fetch를 버리지 않는다 —
// withDeadline처럼 결과만 포기하고 작업이 계속 도는 방식이면 daily_jobs_run이 processing으로
// 남는다(PROCESSING_STALE_MS 12분 복구가 있지만 그 12분 동안 사용자는 아무것도 못 한다).
// 여기서는 스케줄링을 멈출 뿐이라 함수가 정상 종료하고 지금까지 모은 결과를 그대로 쓴다.
export const DETAIL_BUDGET_MS = 20_000;

export async function extractCandidatesFrom(
  urls: string[],
  site: string,
  localDate: string,
  allowedRoles: readonly JobRole[],
  fetchDetail: (url: string) => Promise<ExtractedJobFields | null>
): Promise<Candidate[]> {
  const startedAt = Date.now();
  const out: Candidate[] = [];
  // 0건으로 끝났을 때 "어느 단계에서 사라졌는지"를 세어 둔다. 이게 없으면 아래 catch(() => null)이
  // 상세 fetch 실패를 통째로 삼켜서, 검색은 성공했는데 후보가 0건인 상황의 원인을 알 수 없다
  // (배포에서 실제로 이 상태가 나왔다 — 소스 catch는 한 번도 안 걸렸고 실패 메일도 안 왔다).
  let attempted = 0, fetchFailed = 0, notPosting = 0, expired = 0, rejected = 0;
  // LLM 정규화 집계 — 로그가 없으면 "왜 이 공고가 안 떴나"를 사후에 절대 답할 수 없다
  // (뉴스 stopReason에서 같은 것을 겪었다). 결정마다 숫자를 남긴다.
  const normalizeTally = newNormalizeTally();
  let firstError = "";
  let budgetHit = false;

  for (let i = 0; i < urls.length; i += DETAIL_POOL) {
    if (Date.now() - startedAt > DETAIL_BUDGET_MS) { budgetHit = true; break; }
    const wave = urls.slice(i, i + DETAIL_POOL);
    // URL별 catch가 핵심이다. 상세 fetch는 실패 시 throw하고(wanted.ts:33은 fetch를 try로 감싸지
    // 않는다) 예전엔 그게 바깥 try까지 올라가 notifyApiFailure + return [] 로 끝났다 —
    // **상세 페이지 한 건이 타임아웃되면 그 사이트 수집 전체가 버려졌다.** 이제 그 한 건만 건너뛴다.
    // (검색·목록 단계의 실패는 여전히 호출부 try가 잡아 notifyApiFailure로 보고한다.)
    const fetched = await Promise.all(wave.map((url) => fetchDetail(url).catch((e) => {
      if (!firstError) firstError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      return null;
    })));

    // ① 싼 사전필터 — **본문을 전혀 안 보는 신호만** 쓴다(공고 여부 / 마감일 / 제목·모집분야·고용형태).
    //    passesHardFilter가 정확히 그 셋만 읽는다(filter.ts: title/role/source_category/employment_type).
    //    여기서 떨어질 공고에 LLM을 쓰면 어차피 버릴 것에 호출을 태우는 셈이다. 기준을 새로 만들지
    //    않고 **어차피 buildCandidate가 맨 처음 돌리는 그 관문을 앞으로 당겨 온 것**뿐이라, 통과/탈락
    //    집합은 정규화가 없을 때와 동일하다(passesHardFilter는 본문을 안 보므로 정규화에 불변이다).
    const survivors: { url: string; fields: ExtractedJobFields }[] = [];
    for (let k = 0; k < wave.length; k++) {
      attempted++;
      const fields = fetched[k];
      if (!fields) { fetchFailed++; continue; }
      if (!fields.is_job_posting) { notPosting++; continue; }
      if (fields.deadline && fields.deadline < localDate) { expired++; continue; }
      // 🔴🔴 **본문을 비우고 평가한다.** `passesHardFilter`는 본문 비의존이 **아니다** —
      //    `isTrainingOrNonJob`이 responsibilities/required_text/preferred_text를 훑는다.
      //    원본 그대로 여기서 거르면, 본문이 뭉개진 공고(= 정규화가 구제할 대상)가 그 뭉개진
      //    텍스트 때문에 탈락해 **정규화 기회를 영영 잃는다.** 사용자가 "정규화 이후 필드를
      //    passesHardFilter에 써라"고 지시한 것이 정확히 이 경우다.
      //    ✅ 안전한 이유: 이 함수는 `!isTrainingOrNonJob && !isNonTargetTitle`로 **둘 다 제외
      //       판정**이다. 본문을 비우면 매칭이 줄어 **더 관대해질 뿐**이라 거짓 탈락이 구조적으로
      //       불가능하다. 그리고 여기서 떨어지는 것은 **제목만으로** 탈락한 건인데, 정규화는
      //       제목을 바꾸지 않으므로 어차피 ③에서도 떨어진다. 즉 집합이 보존된다.
      //    → 남는 것은 사용자가 지정한 본문 비의존 신호뿐이다(제목 / 날짜 / 고용형태 / 공고 여부).
      const titleOnly = { ...fields, responsibilities: "", required_text: "", preferred_text: "" };
      if (!passesHardFilter(titleOnly)) { rejected++; continue; }
      survivors.push({ url: wave[k], fields });
    }
    // ② 파싱 신뢰도가 낮은 건만 LLM 재추출(normalize.ts). 🔴 **채점보다 반드시 먼저**다 —
    //    roleFitScore/classifyJobRoles가 responsibilities/required_text/preferred_text를 필드
    //    가중치로 읽기 때문에, 이걸 upsert 직전에 두면 화면만 좋아지고 선정 결과는 통짜 본문
    //    기준 그대로 남는다. 신뢰도가 높으면 호출 없이 그대로 통과한다(fail-closed).
    const normalized = await Promise.all(survivors.map((s) => normalizeJobFields(s.fields, normalizeTally)));
    // ③ 정규화된 필드로 채점(passesHardFilter + classifyJobRoles).
    for (let k = 0; k < survivors.length; k++) {
      const built = buildCandidate(survivors[k].url, site, normalized[k], allowedRoles);
      if (built) out.push(built); else rejected++;
    }
  }

  // ⚠️ urls.length === 0도 반드시 기록한다. 예전엔 `&& urls.length > 0` 조건을 달았다가,
  // 검색 단계가 에러 없이 빈 배열을 준 경우가 통째로 침묵해서 "수집은 돌았는데 원인 없음"이 됐다.
  if (normalizeTally.candidates > 0) {
    console.log(`[job-normalize] ${site}: ${formatNormalizeTally(normalizeTally)}`);
  }

  if (out.length === 0) {
    recordCollectError(site, urls.length === 0
      ? "검색/목록 0건 (에러 없이 빈 결과)"
      : `검색 ${urls.length}건 → 시도 ${attempted} / fetch실패 ${fetchFailed}` +
        ` / 공고아님 ${notPosting} / 마감 ${expired} / 필터탈락 ${rejected}` +
        (budgetHit ? ` / 예산초과(${DETAIL_BUDGET_MS / 1000}s)` : "") +
        (firstError ? ` | ${firstError}` : ""));
  }
  return out;
}

// ponytail: 같은 (날짜, 사이트[, 직무]) 수집 결과를 프로세스 메모리에만 캐시한다 — 한 서버 인스턴스가 사는 동안
// 중복 호출을 막는 게 목적이고, 인스턴스가 여러 개거나 재시작하면 다시 수집한다.
const candidateCache = new Map<string, Promise<Candidate[]>>();

// "지금 업데이트"(retryJobs)는 사용자가 오늘 실행 guard를 명시적으로 우회하는 유일한 경로다.
// 그런데 DB의 daily_jobs_run 행만 지우고 재수집하면 **이 메모리 캐시가 아까와 똑같은 후보를
// 그대로 돌려줘서** 결과가 한 글자도 안 바뀐다 — 버튼을 눌러도 "아무 변화가 없는" 이유가 이것이다.
// 키가 `${localDate}:...`로 시작하므로 오늘 것만 골라 지운다(다른 날짜 캐시는 건드리지 않는다).
export function clearCandidateCacheFor(localDate: string): number {
  let cleared = 0;
  for (const key of [...candidateCache.keys()]) {
    if (key.startsWith(`${localDate}:`)) { candidateCache.delete(key); cleared++; }
  }
  return cleared;
}

// 소스 수집이 실패하면 지금까지는 notifyApiFailure(메일) + console.error 뿐이었다. 사용자 화면에는
// "잠시 후 다시 시도해주세요"만 떠서, 배포에서 왜 0건인지 알아내려면 메일함이나 Vercel 로그를
// 봐야 했다. 세 소스의 catch는 전부 tavilySearch 실패를 잡는 자리라 Tavily 하나가 죽으면 3소스가
// 동시에 0건이 되고 곧바로 stale이 된다 — 사용자가 보는 증상과 실제 원인의 거리가 가장 먼 지점이다.
// 그래서 "지금 업데이트"(사용자가 직접 누른 경로)에서만 실제 사유를 같이 보여준다.
// 같은 요청 안에서 retryJobs -> getJobsForUser -> assembleDailyJobs가 이어지므로 같은 인스턴스다.
// ponytail: 모듈 스코프 배열. 동시 요청이 섞일 수 있지만 진단용이고 stale일 때만 읽는다.
// 진단 기록은 collect-trace.ts로 옮겼다(fetcher들도 남겨야 해서 순환 import를 피한다).
// 기존 호출부(actions/jobs.ts, get-jobs.ts)가 여기서 import하고 있어 그대로 다시 내보낸다.
export { resetCollectErrors, takeCollectErrors, recordCollectError };


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
      const extractCap = limit === MAX_SEARCH_RESULTS_PER_SITE ? MAX_EXTRACT_ATTEMPTS_PER_SITE : limit;
      return extractCandidatesFrom(
        ranked.slice(0, extractCap).map((c) => c.url),
        WANTED_SITE.name, localDate, allowedRoles, fetchWantedJobDetail
      );
    } catch (err) {
      recordCollectError("원티드", err);
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
      return extractCandidatesFrom(
        ranked.slice(0, extractCap).map((c) => c.url),
        JUMPIT_SITE.name, localDate, allowedRoles, fetchJumpitJobDetail
      );
    } catch (err) {
      recordCollectError("점핏", err);
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
      return extractCandidatesFrom(
        candidates.slice(0, extractCap).map((c) => c.url),
        JOBKOREA_SITE.name, localDate, allowedRoles, fetchJobKoreaJobDetail
      );
    } catch (err) {
      recordCollectError("잡코리아", err);
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
// 🔴🔴 2026-09-04 — STEP F(과거 공고 재추천)에 **career tier 우선순위**를 넣는다.
//
// 왜: 신규 후보를 거르는 `isUnseenUrl`은 "한 번 추천한 URL"을 영구히 제외한다. 그런데 신입·주니어
// 공고는 상시 모집이 많아 **한 번 추천되면 재고가 소진되고 다시는 신규로 안 잡힌다.** 반면 경력직은
// 매일 새 URL이 올라온다. 그래서 시간이 갈수록 STEP D/E는 경력직만 남기고, 신입은 과거 이력에만
// 쌓인다. 실측(2026-09-04): 그날 수집 19건 중 18건이 이미 추천분이라 걸러졌고, **신입·주니어 8건이
// 전원 거기 포함**돼 최종 4건이 전부 경력직이 됐다. promotion은 pool에 신입이 0건이라 발동조차
// 못 했다 — 즉 PROMOTION_* 상수는 이 증상의 원인이 아니다.
//
// 여기(과거 재추천)가 그 재고를 다시 꺼낼 수 있는 유일한 자리다. 실측: 이 사용자의 STEP F 후보
// 67건 = entry 10 · junior 13 · experienced 44 · unknown 0.
//
// ⚠️ 기존 원칙은 그대로 둔다 — **직무 우선순위가 여전히 1순위**이고(사용자가 정한 트랙),
//    tier는 그 **안에서만** 갈린다. 그리고 tier 안에서는 `byOldestThenFit`(오래 안 보여준 순)이
//    그대로 돌아 **같은 신입 공고만 반복 추천되는 것을 막는다.**
const CAREER_TIER_RANK: Record<CareerTier, number> = { entry: 0, junior: 1, experienced: 2, unknown: 3 };
// unknown을 맨 뒤에 두는 이유: career.ts가 세운 "신호가 없으면 신입으로 취급하지 않는다"와 같은
// 방향이다(근거 없이 앞으로 당기지 않는다). 위 실측에서 unknown은 0건이라 당장 영향은 없다.
const tierCache = new WeakMap<PreviousJobRow, CareerTier>();
function tierOf(row: PreviousJobRow): CareerTier {
  let t = tierCache.get(row);
  if (!t) { t = classifyCareerTier(rowToFields(row)); tierCache.set(row, t); }
  return t;
}
export function byPriorityThenOldest(priorityRoles: JobRole[]) {
  return (a: PreviousJobRow, b: PreviousJobRow) => {
    const diff = priorityRoles.indexOf(a.matched_role as JobRole) - priorityRoles.indexOf(b.matched_role as JobRole);
    if (diff !== 0) return diff;
    const tierDiff = CAREER_TIER_RANK[tierOf(a)] - CAREER_TIER_RANK[tierOf(b)];
    return tierDiff !== 0 ? tierDiff : byOldestThenFit(a, b);
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

// 쓸 만한(active, 또는 마감일이 안 지난 unknown) 과거 공고가 needed+BUFFER건 모일 때까지 배치 단위로
// 검증을 이어간다. 한 번에 전부 확인하지 않는 이유는 상세 페이지를 다시 긁는 네트워크 비용 때문이고,
// FALLBACK_VERIFY_MAX에서 멈추는 이유는 그 비용에 상한이 있어야 하기 때문이다.
// verify를 인자로 받는 건 순전히 검증용이다 — 네트워크 없이 자체 점검을 돌릴 수 있어야 한다.
export async function collectVerifiedFallback(
  rows: PreviousJobRow[],
  localDate: string,
  needed: number,
  verify: (url: string, localDate: string) => Promise<ActiveCheck>
): Promise<{ row: PreviousJobRow; check: ActiveCheck }[]> {
  const want = needed + FALLBACK_VERIFY_BUFFER;
  const verified: { row: PreviousJobRow; check: ActiveCheck }[] = [];
  let usable = 0;
  const limit = Math.min(rows.length, FALLBACK_VERIFY_MAX);
  for (let i = 0; i < limit && usable < want; i += FALLBACK_VERIFY_BATCH_SIZE) {
    const batch = rows.slice(i, Math.min(i + FALLBACK_VERIFY_BATCH_SIZE, limit));
    const results = await Promise.allSettled(batch.map((row) => verify(row.url, localDate)));
    batch.forEach((row, idx) => {
      const settled = results[idx];
      const check: ActiveCheck = settled.status === "fulfilled" ? settled.value : { state: "unknown" };
      verified.push({ row, check });
      // orderVerifiedByPriority가 실제로 남길 것들만 센다 — 만료로 판정된 건 세면 안 된다.
      if (check.state === "active" || (check.state === "unknown" && !(row.deadline && row.deadline < localDate))) usable++;
    });
  }
  return verified;
}

// ── STEP I — 신입·주니어 1칸 Soft Reserve (2026-09-04) ──────────────────────────────────────
// 왜 필요한가: 479절과 **같은 원인**의 나머지 절반이다. `isUnseenUrl`이 "한 번 추천한 URL"을 영구
// 제외하는데 신입 공고는 상시 모집이 많아 한 번 나가면 재고가 소진되고 다시 신규로 안 잡힌다.
// 479절은 그 재고를 STEP F **안에서** 앞으로 당겼지만, STEP F는 **신규가 4칸을 못 채운 날에만**
// 돈다 — 신규가 4칸을 다 채우면 재고에 active 신입이 남아 있어도 발동조차 하지 않는다.
// 즉 문제는 STEP F의 정렬이 아니라 **발동 조건**이었다.
//
// 실측(2026-09-04, 세린 계정 14일 replay): 신입·주니어 0건인 날 **4/14일(29%)**, 그 4일 전부
// 신규가 4칸을 채워 STEP F가 안 돌았다. 같은 날 STEP F 후보를 전수 재검증하니 **active인
// 신입·주니어가 16/19건** 있었다. 재고가 없는 게 아니라 꺼낼 자리가 없었다.
//
// 🔴🔴 promotion 상수는 이 증상의 원인이 **아니다.** dry-run 실측: `PROMOTION_RELATIVE_FLOOR`를
//   0.75 → 0.65로 내려도 **최종 4건이 1건도 바뀌지 않았다**(floor에 걸린 2건조차 URL 제외가 먼저
//   걸린다). 604~616절이 남긴 *"계속 0건이면 floor를 0.6~0.65로 낮추는 것을 먼저 검토한다"*는
//   후속은 **이 실측으로 반증됐다 — 내리지 마라.** 원인은 점수가 아니라 후보 풀이다.
//
// 정책(14일 replay로 검증한 그대로):
//   ① 최종 4건에 entry/junior가 1건이라도 있으면 **아무것도 하지 않는다**(완전 무변경).
//   ② 0건일 때만 과거 추천 이력에서 active인 entry/junior를 **정확히 1건** 찾아 교체한다.
//   ③ 교체는 **같은 matched_role 안에서만** 한다 — role quota를 이동시키지 않는다. replay에서
//      같은-role 교체만으로 0건인 4일이 전부 해결됐으므로 더 공격적인 fallback은 넣지 않는다.
//      같은 role에 후보가 없으면 기존 신규 4건을 그대로 둔다.
//   ④ 후보 정렬·active 판정·회전은 **STEP F 경로를 그대로 재사용**한다(`byPriorityThenOldest` /
//      `collectVerifiedFallback` / `orderVerifiedByPriority`). 평행 메커니즘을 만들지 않는다 —
//      그래서 479절의 정렬(role > entry > junior > experienced > unknown > oldest)과
//      "오래 안 보여준 순" 회전이 공짜로 따라온다.
//   ⑤ `identityKey`로 중복을 막는다. pool에 회사+공고명이 같고 **URL만 다른 쌍이 실제로 있다**
//      (실측: 에이티씨아이 2건). 안 막으면 이틀 연속 사실상 같은 공고가 나간다.
//
// NEW 배지는 손대지 않는다 — upsert가 쓰는 `firstRecommendedDateFor`가 `previousByUrl`에서 과거
// 날짜를 그대로 가져오므로 재투입해도 NEW가 붙지 않는다(new-badge.ts 42절). 여기서
// first_recommended_date를 계산하거나 덮어쓰지 마라.
//
// 교체로 빠진 신규 공고는 saved_job에 **쓰이지 않는다** → URL이 "본 것"으로 남지 않아 다음 날
// 다시 후보가 된다(영구 손실이 아니다).
export async function applyEntrySoftReserve(
  chosen: SelectedJob[],
  previousJobs: PreviousJobRow[],
  roles: JobRole[],
  localDate: string,
  verify: (url: string, localDate: string) => Promise<ActiveCheck>
): Promise<{ inUrl: string; outUrl: string; role: JobRole } | null> {
  // ① 이미 신입·주니어가 있으면 손대지 않는다.
  if (chosen.some((job) => isEntryFriendly(job.careerTier))) return null;

  // ③ 같은 role 안에서만 교체하므로 experienced가 실제로 들어 있는 role만 대상이다.
  //    (unknown tier는 교체 대상이 아니다 — 신입일 수도 있는 것을 빼내면 손해가 될 수 있다.)
  const swappableRoles = new Set(chosen.filter((job) => job.careerTier === "experienced").map((job) => job.assignedRole));
  if (swappableRoles.size === 0) return null;

  const usedUrls = new Set(chosen.map((job) => job.url));
  const usedIdentities = new Set(chosen.map((job) => identityKey(job.fields)));

  // STEP F(850절)의 후보 필터와 같은 조건 + tier·role·identity 제약만 더한다.
  const pool = previousJobs
    .filter((row) => isJobRole(row.matched_role) && swappableRoles.has(row.matched_role))
    .filter((row) => !usedUrls.has(row.url))
    .filter((row) => !(row.deadline && row.deadline < localDate))
    .filter((row) => isEntryFriendly(tierOf(row)))
    // ⑤ 최종 batch에 이미 같은 회사+공고명이 있으면 후보에서 뺀다.
    .filter((row) => !usedIdentities.has(identityKey(row)))
    .sort(byPriorityThenOldest(roles));

  // ⑤ pool 안의 동일 identity(URL만 다른 쌍)는 정렬 후 앞선 것만 남긴다 — 회전 순서를 존중한다.
  const seenIdentity = new Set<string>();
  const deduped = pool.filter((row) => {
    const key = identityKey(row);
    if (seenIdentity.has(key)) return false;
    seenIdentity.add(key);
    return true;
  });
  if (deduped.length === 0) return null;

  // ④ active 확인도 STEP F와 같은 함수로 한다(needed=1). closed는 여기서 걸러지고,
  //    orderVerifiedByPriority가 active를 unknown보다 앞에 둔다.
  const verified = await collectVerifiedFallback(deduped, localDate, 1, verify);
  const usable = orderVerifiedByPriority(verified, localDate);
  if (usable.length === 0) return null;

  const { row, check } = usable[0];
  const role = row.matched_role as JobRole;
  const fields = check.state === "active" ? check.fields : rowToFields(row);

  // OUT — 같은 role의 experienced 중 ① fit 최저 ② 동점이면 freshness가 더 오래된 것
  //        ③ 그래도 동점이면 배열 안정 정렬(= 그 batch에 담긴 순서)에 맡긴다.
  //   ②는 새 기준이 아니라 `byRoleFitThenRecency`(최신 우선)의 **부호를 뒤집은 것**이다.
  //   posted_at이 없으면 ""이라 가장 오래된 것으로 취급된다 — 날짜를 모르는 공고의 freshness를
  //   신뢰하지 않는다는 뜻이고, 이쪽이 먼저 빠지는 것이 맞다.
  const outSlot = chosen
    .map((job, idx) => ({ job, idx }))
    .filter((x) => x.job.assignedRole === role && x.job.careerTier === "experienced")
    .sort((a, b) =>
      (a.job.assignedFit - b.job.assignedFit) ||
      (a.job.fields.posted_at ?? "").localeCompare(b.job.fields.posted_at ?? "")
    )[0];
  if (!outSlot) return null;

  const outUrl = outSlot.job.url;
  chosen[outSlot.idx] = {
    url: row.url, site: row.source_site ?? "", fields,
    assignedRole: role, assignedFit: previousJobFit(row), careerTier: tierOf(row),
  };
  // ② 정확히 1건. 루프가 없으므로 구조적으로 2건 이상 올라올 수 없다.
  return { inUrl: row.url, outUrl, role };
}

type DailyJobsRunRow = { status: string; last_attempt_at: string };
type RunStatus = "processing" | "success" | "partial" | "failed";

const PROCESSING_STALE_MS = 12 * 60 * 1000;
const FALLBACK_VERIFY_BUFFER = 2;
const FALLBACK_VERIFY_BATCH_SIZE = 3;
// 과거 공고를 최대 몇 건까지 다시 확인해볼지. 예전엔 needed+BUFFER(=6)만 확인하고 끝냈는데,
// 정렬이 "오래 안 보여준 순"이라 맨 앞에 오는 게 곧 가장 오래된 공고다 — 즉 만료돼 있을 확률이
// 가장 높은 것들만 확인하고 나머지는 쳐다보지도 않았다. 그 6건이 전부 만료면 살아있는 공고가
// 수십 건 남아 있어도 그날 배치가 0건이 됐다(2026-08-22 admin 계정: 살아있는 과거 공고 64건,
// 결과 failed 0건). 이제 쓸 만한 게 needed만큼 나올 때까지 배치 단위로 더 들어간다.
const FALLBACK_VERIFY_MAX = 24;
const UNIQUE_VIOLATION = "23505";

// ── 신입·주니어 Soft Priority(20절) ─────────────────────────────────────────────────────────
// 이건 **필터가 아니라 가점**이다. 경력직을 제외하지 않는다. 하루 DAILY_JOB_LIMIT(4)건 중
// 최대 PROMOTION_LIMIT(2)건까지만 신입·주니어를 점수 역전으로 끌어올리고, 남은 슬롯은 경력을
// 아예 보지 않고 직무적합도+최신순으로 뽑는다. 그래서 경력직이 섞이는 건 정상 동작이다.
//
// 세 조건을 **모두** 만족해야 promotion 대상이다(assignFromPool 참고):
//   isEntryFriendly(tier)  — entry 또는 junior. unknown은 아니다(11절: 신호 없으면 신입 취급 금지)
//   roleScores >= PROMOTION_MIN_SCORE
//   roleScores >= (그날 그 role 최고점) * PROMOTION_RELATIVE_FLOOR
//
// ── 두고 볼 것 (2026-08-24 기준) ────────────────────────────────────────────────────────────
// 2026-08-24: 두 계정 모두 4건 전부 경력직이 나왔다. 로직 버그가 아니라 세 번째 조건에 걸린
// 것이다 — 신입 공고 점수가 그날 최고점의 75%에 못 미치면 promotion이 발동조차 하지 않는다.
// 신입 공고 자체가 적은 시장 상황이라 이 조건에 걸리는 날이 자주 생긴다.
//
// 판단 기준: 하루 1~2건은 신입·주니어가 나오는 게 정상 기대치다. 며칠 관찰해서
//   - 계속 0건이면 → PROMOTION_RELATIVE_FLOOR를 0.6~0.65로 낮추는 것을 먼저 검토한다
//     (점수는 좀 낮아도 신입 공고가 올라오게 된다. LIMIT을 올리는 것보다 효과가 직접적이다 —
//      슬롯이 남아도 floor를 못 넘으면 promotion이 안 걸리기 때문이다)
//   - 신입은 나오는데 직무 적합도가 떨어지면 → floor를 되돌리고 PROMOTION_MIN_SCORE를 올린다
//   - `experienced` 하드 제외는 **분포를 세기 전에는 하지 말 것.** classifyCareerTier가 신호
//     없으면 unknown을 주고 unknown은 신입 취급을 안 한다. unknown 비율을 모르고 하드 필터를
//     켜면 하루 0건이 나는 날이 생긴다.
//
// 상수를 바꾸면 `npx tsx src/lib/jobs/generate.check.ts`가 6개 assertion으로 잡는다.
// 값을 의도적으로 바꾼 거라면 그 assertion도 같이 고칠 것 — 통과시키려고 지우지는 말 것.
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
export type AssignmentState = { chosen: SelectedJob[]; usedUrls: Set<string>; promotionUsed: number };

function byRoleFitThenRecency(role: JobRole) {
  return (a: Candidate, b: Candidate) => {
    const diff = b.roleScores[role] - a.roleScores[role];
    return diff !== 0 ? diff : (b.fields.posted_at ?? "").localeCompare(a.fields.posted_at ?? "");
  };
}

// role별 quota를 채운다 — 한 후보가 여러 role에 eligible해도 실제로는 한 slot만 차지한다(usedUrls로 보장).
// promotion quality floor(bestScore)는 그 role 처리 시작 시점의 pool로 한 번만 고정한다 — 상위 후보가
// 먼저 빠져나간 뒤 baseline이 흔들리면 이후 promotion 판정이 왜곡되기 때문이다.
export function assignFromPool(pool: Candidate[], roles: JobRole[], quota: Record<string, number>, state: AssignmentState): void {
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
// 크론 전용 — 오늘 예약 시각(KST 10:10)보다 이르게 만들어진 오늘 배치를 지운다.
//
// 관리자 계정은 "지금 업데이트"에서 시간 게이트와 하루 상한을 전부 우회한다(retryJobs의 unlimited).
// 그래서 아침 크론 전에 테스트로 한 번 누르면 그 배치가 오늘 success 행이 되고, 크론은 위 guard의
// "오늘 이미 success 행이 있어 수집을 건너뛰었다"에 걸려 채용을 전원 스킵한다 — 뉴스만 갱신되고
// 채용은 새벽 결과가 하루 종일 남는다(2026-08-25 실측: 01:36·01:38 생성, 10:29 크론이 스킵).
//
// 새벽 테스트를 막는 대신 크론이 그 배치를 갈아엎게 한다. 기준은 generated_at < 오늘 예약 시각 —
// 크론이 만든 행은 항상 예약 시각 이후이므로 같은 날 크론이 두 번 돌아도 자기 결과는 안 지운다.
// job_count/selected_urls가 없는 실패·미완 행(generated_at null)도 크론이 다시 시도해야 하므로 함께 지운다.
//
// 🔴 daily_jobs_run만 지우면 안 된다. 그 배치가 saved_job에 새로 삽입한 row가 남아 있으면
// loadPreviouslyRecommendedJobs가 그걸 "이미 추천한 URL"로 읽어 STEP D의 미노출 후보에서 빼버린다 —
// 재수집이 그날의 신규 공고를 통째로 건너뛰고 STEP F(과거 재추천)로 떨어진다. 실제로 2026-08-25에
// 그렇게 됐다: 새벽 배치가 찾은 신규 2건(점핏)이 후보에서 배제된 채 어느 배치에도 안 속한 고아 row로
// 남고, 12:05 재수집은 8/15~17 공고 4건으로 채워져 NEW 배지가 하나도 안 붙었다. 그 2건은 URL이
// 영구히 "본 것"으로 남아 다시는 추천되지 않는다. 갈아엎으려면 삽입까지 되돌려야 한다.
export async function clearPreCronBatches(localDate: string, cutoffISO: string): Promise<number> {
  const supabase = createAdminClient();

  // saved_job을 먼저 되돌린다 — 순서가 반대면 saved_job 삭제가 실패했을 때 daily_jobs_run만 사라져
  // 위 증상(신규 후보 배제)이 그대로 남는다.
  //
  // 대상 = 오늘 KST 00:00 ~ 예약 시각 사이에 처음 생성된 row. saved_job row는 assembleDailyJobs만
  // 만들기 때문에 이 구간의 created_at은 곧 "예약 전 배치가 새로 삽입한 것"과 같다. 재추천으로 들어온
  // row는 created_at이 과거이고 updated_at만 갱신되므로 걸리지 않는다(그건 되돌릴 삽입이 아니다).
  const dayStartISO = `${localDate}T00:00:00+09:00`;
  const { error: savedError } = await supabase
    .from("saved_job")
    .delete()
    .gte("created_at", dayStartISO)
    .lt("created_at", cutoffISO)
    // 북마크한 공고는 배치와 무관하게 사용자가 보관한 것이다 — 지우면 데이터 손실이다.
    .not("is_bookmarked", "is", true);
  if (savedError) throw savedError;

  const { data, error } = await supabase
    .from("daily_jobs_run")
    .delete()
    .eq("job_date", localDate)
    .or(`generated_at.is.null,generated_at.lt.${cutoffISO}`)
    // 진행 중인 수집은 건드리지 않는다 — 지우면 그 실행이 finalizeAttempt에서 갱신할 행을 잃는다.
    .neq("status", "processing")
    .select("user_id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function assembleDailyJobs(
  userId: string,
  priorityRoles: JobRole[],
  localDate: string = todayKSTDateString()
): Promise<SelectedJob[]> {
  const roles = validatePriorityOrder(priorityRoles);
  if (!roles) { recordCollectError("게이트", `관심 직무 순서가 유효하지 않다: ${JSON.stringify(priorityRoles).slice(0, 80)}`); return []; }

  const supabase = createAdminClient();
  const { data: existingRow } = await supabase
    .from("daily_jobs_run")
    .select("status, last_attempt_at")
    .eq("user_id", userId).eq("job_date", localDate)
    .maybeSingle<DailyJobsRunRow>();

  let takeoverTarget: DailyJobsRunRow | null = null;
  if (existingRow) {
    // 이 세 갈래는 전부 "수집을 아예 시작하지 않고 끝낸" 경우다. retryJobs가 오늘 행을 지우고
    // 부르므로 정상적으로는 안 걸리지만, 걸렸다면 그게 곧 실패 원인이라 반드시 남긴다.
    if (existingRow.status === "success") { recordCollectError("게이트", "오늘 이미 success 행이 있어 수집을 건너뛰었다"); return []; }
    if (existingRow.status === "processing") {
      const staleMs = Date.now() - new Date(existingRow.last_attempt_at).getTime();
      if (staleMs < PROCESSING_STALE_MS) { recordCollectError("게이트", `다른 수집이 ${Math.round(staleMs / 1000)}초째 processing 중이라 건너뛰었다`); return []; }
      takeoverTarget = existingRow;
    } else {
      recordCollectError("게이트", `오늘 행이 ${existingRow.status} 상태라 수집을 건너뛰었다`);
      return [];
    }
  }

  const claimedAt = await claimProcessingSlot(supabase, userId, localDate, roles, takeoverTarget);
  if (!claimedAt) { recordCollectError("게이트", "processing 슬롯을 잡지 못했다(동시 실행)"); return []; }

  const quota = getDailyRoleQuota(roles, localDate);
  const previousJobs = await loadPreviouslyRecommendedJobs(supabase, userId);
  const previousByUrl = new Map(previousJobs.map((j) => [j.url, j]));
  const previousByIdentity = buildPreviousIdentityMap(previousJobs);

  const state: AssignmentState = { chosen: [], usedUrls: new Set(), promotionUsed: 0 };

  // STEP D — 3소스 신규(미노출 URL) 후보 pool 확보 → quota 배정 → backfill. identity가 과거에 있어도
  // URL이 새것이면(cross-source 재발견) 여기 들어온다 — NEW 여부는 저장 시 firstRecommendedDateFor가 따로 정한다.
  // 0건으로 끝났을 때 어느 STEP에서 비었는지 남긴다 — 소스별 기록만으로는 "신규는 0인데 과거
  // 재추천도 0"인 상황(= 검색과 상세 fetch가 동시에 죽은 상태)을 구분할 수 없다.
  const trace: string[] = [];
  const freshPool = await collectAllCandidates(roles, localDate, quota);
  const freshUnseen = freshPool.filter((c) => isUnseenUrl(c.url, previousByUrl));
  assignFromPool(freshUnseen, roles, quota, state);
  backfillRemaining(freshUnseen, roles, state);
  trace.push(`D: pool ${freshPool.length}/미노출 ${freshUnseen.length}→선택 ${state.chosen.length}`);

  // STEP E — 그래도 부족하면 더 넓게(WIDE_SEARCH_RESULTS_PER_SITE) 다시 수집해서 채운다.
  if (state.chosen.length < DAILY_JOB_LIMIT) {
    const widePool = await collectAllCandidates(roles, localDate, quota, WIDE_SEARCH_RESULTS_PER_SITE);
    const wideUnseen = widePool.filter((c) => isUnseenUrl(c.url, previousByUrl) && !state.usedUrls.has(c.url));
    assignFromPool(wideUnseen, roles, quota, state);
    backfillRemaining(wideUnseen, roles, state);
    trace.push(`E: pool ${widePool.length}/미노출 ${wideUnseen.length}→선택 ${state.chosen.length}`);
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
      .sort(byPriorityThenOldest(roles));

    const verified = await collectVerifiedFallback(fallbackPool, localDate, needed, reverifyStillActive);
    // 여기가 핵심 분기점이다. fallbackPool은 DB에서 오므로 네트워크와 무관하게 채워지는데,
    // verified가 0이면 재검증(상세 페이지 재fetch)이 전부 실패했다는 뜻 — 신규 수집 0건과 겹치면
    // "채용 사이트 직접 접근 자체가 막혔다"로 좁혀진다(Tavily는 미국 API라 살아 있을 수 있다).
    trace.push(`F: 과거 ${previousJobs.length}/후보 ${fallbackPool.length}→검증통과 ${verified.length}`);

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

  // STEP I — 신입·주니어 1칸 Soft Reserve. 🔴 위 STEP들이 4칸을 **다 채웠어도** 돌아야 한다 —
  // "신규가 4칸을 채우면 STEP F가 발동조차 않는다"가 이 정책이 고치려는 바로 그 조건이다.
  // ①의 조기 반환이 있어 STEP F가 이미 신입을 넣은 날에는 네트워크를 한 번도 쓰지 않는다.
  const reserved = await applyEntrySoftReserve(state.chosen, previousJobs, roles, localDate, reverifyStillActive);
  trace.push(reserved ? `I: soft-reserve ${reserved.role} 교체 1건` : "I: soft-reserve 미발동");
  if (reserved) console.log(`[jobs] soft-reserve ${reserved.role} IN ${reserved.inUrl} / OUT ${reserved.outUrl}`);

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
    recordCollectError("단계", trace.join(" | "));
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
