import { createAdminClient } from "@/lib/supabase/admin";
import { tavilySearch } from "./tavily";
import type { ExtractedJobFields } from "./extract-fields";
import { fetchWantedJobDetail } from "./wanted";
import { fetchJumpitJobDetail, fetchJumpitPositions } from "./jumpit";
import { roleFitScore } from "./filter";
import { JOB_SITES, MAX_SEARCH_RESULTS_PER_SITE, MAX_EXTRACT_ATTEMPTS_PER_SITE, WIDE_SEARCH_RESULTS_PER_SITE } from "./sources";
import { JOB_ROLE_CONFIG, DAILY_JOB_LIMIT, getDailyRoleQuota, validateInterestedJobRoles, type JobRole } from "./roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { notifyApiFailure } from "./notify";

// 원티드·점핏은 페이지 안에 필드가 그대로 구조화돼 있어 직접 파싱한다(wanted.ts/jumpit.ts).
async function extractCandidateFields(url: string, domain: string): Promise<ExtractedJobFields | null> {
  if (domain === "wanted.co.kr") return fetchWantedJobDetail(url);
  if (domain === "jumpit.saramin.co.kr") return fetchJumpitJobDetail(url);
  return null;
}

export type CollectedJob = { url: string; site: string; fields: ExtractedJobFields; role: JobRole; fit: number };

function candidateText(f: ExtractedJobFields): string {
  return `${f.title} ${f.role} ${f.responsibilities} ${f.required_text} ${f.preferred_text}`;
}

// ponytail: 같은 (날짜, 직무) 수집 결과를 프로세스 메모리에만 캐시한다 — 한 서버 인스턴스가 사는 동안
// Tavily/파싱 중복 호출을 막는 게 목적이고, 인스턴스가 여러 개거나 재시작하면 다시 수집한다.
// 회원 수가 늘어 중복 수집이 실제 비용이 되면 job_candidates(date, role, ...) 테이블로 옮긴다.
const candidateCache = new Map<string, Promise<CollectedJob[]>>();

// 한 직무에 대해 원티드+점핏에서 적합 후보를 모은다. 마감/비공고 페이지는 여기서 걸러낸다.
// limit — 하루 4건 quota를 못 채운 직무를 WIDE_SEARCH_RESULTS_PER_SITE로 다시 부를 때 쓴다.
// 적합도 기준(roleFitScore/MIN_SCORE, 마감 제외)은 안 건드리고 탐색 범위만 넓힌다.
export function collectJobCandidates(role: JobRole, localDate: string, limit: number = MAX_SEARCH_RESULTS_PER_SITE): Promise<CollectedJob[]> {
  const key = `${localDate}:${role}:${limit}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const perSite = await Promise.allSettled(
      JOB_SITES.map(async (site) => {
        // 점핏은 Tavily 인덱스가 마감 공고를 올려보내는 문제가 있어 점핏 자체 목록 API로 직접 받는다.
        // 원티드는 기존 그대로 Tavily 검색 결과를 쓴다.
        const candidates =
          site.domain === "jumpit.saramin.co.kr"
            ? await fetchJumpitPositions(role, limit)
            : await tavilySearch(JOB_ROLE_CONFIG[role].searchQuery, site.domain, limit);
        // 검색 스니펫 기준으로 관련도 높은 후보를 먼저 시도
        const ranked = [...candidates].sort(
          (a, b) => roleFitScore(`${b.title} ${b.content}`, role) - roleFitScore(`${a.title} ${a.content}`, role)
        );
        const out: CollectedJob[] = [];
        for (const candidate of ranked.slice(0, limit === MAX_SEARCH_RESULTS_PER_SITE ? MAX_EXTRACT_ATTEMPTS_PER_SITE : limit)) {
          const fields = await extractCandidateFields(candidate.url, site.domain);
          if (!fields || !fields.is_job_posting) continue;
          if (fields.deadline && fields.deadline < localDate) continue; // 마감된 공고 제외
          const fit = roleFitScore(candidateText(fields), role);
          if (fit === 0) continue; // 단순 키워드 스침은 적합 공고로 보지 않는다
          out.push({ url: candidate.url, site: site.name, fields, role, fit });
        }
        return out;
      })
    );
    return perSite.flatMap((r) => {
      if (r.status === "rejected") {
        notifyApiFailure("점핏/원티드", r.reason instanceof Error ? r.reason : new Error(String(r.reason)));
      }
      return r.status === "fulfilled" ? r.value : [];
    });
  })();

  candidateCache.set(key, task);
  task.catch(() => candidateCache.delete(key)); // 실패한 수집은 캐시에 남기지 않는다
  return task;
}

function byFitThenRecency(a: CollectedJob, b: CollectedJob): number {
  if (b.fit !== a.fit) return b.fit - a.fit;
  return (b.fields.posted_at ?? "").localeCompare(a.fields.posted_at ?? "");
}

// 추천 순환(신규 우선 → 과거 활성 공고 재추천)에 쓰는 이 사용자의 과거 saved_job 전체.
// 전체 DB가 아니라 user_id로 이미 좁혀서 조회한다.
type PreviousJobRow = {
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

function isUnseen(url: string, previousByUrl: Map<string, PreviousJobRow>): boolean {
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

function previousJobFit(row: PreviousJobRow): number {
  if (!row.matched_role) return 0;
  const text = `${row.title} ${row.role ?? ""} ${row.responsibilities ?? ""} ${row.required_text ?? ""} ${row.preferred_text ?? ""}`;
  return roleFitScore(text, row.matched_role as JobRole);
}

// 오래 안 보여준 것 우선(job_date ASC) → 적합도 → 최신 게시순. "오래 안 보여준 괜찮은 공고"가 먼저 돌아온다.
function byOldestThenFit(a: PreviousJobRow, b: PreviousJobRow): number {
  if (a.job_date !== b.job_date) return a.job_date < b.job_date ? -1 : 1;
  const diff = previousJobFit(b) - previousJobFit(a);
  if (diff !== 0) return diff;
  return (b.posted_at ?? "").localeCompare(a.posted_at ?? "");
}

// 과거 활성 공고를 재추천하기 전에 가능하면 실제 페이지를 다시 확인한다 — 이미 내려간 공고를 그대로
// 재추천하지 않기 위함. 확인 자체가 실패(네트워크 등)하면 죽었다고 단정하지 않고 기존 저장값을 그대로 쓴다.
async function reverifyStillActive(url: string, localDate: string): Promise<ExtractedJobFields | null | "unknown"> {
  const domain = url.includes("wanted.co.kr") ? "wanted.co.kr" : url.includes("jumpit.saramin.co.kr") ? "jumpit.saramin.co.kr" : null;
  if (!domain) return "unknown";
  try {
    const fields = await extractCandidateFields(url, domain);
    if (!fields || !fields.is_job_posting) return null; // 명확히 마감/삭제됨
    if (fields.deadline && fields.deadline < localDate) return null;
    return fields;
  } catch {
    return "unknown";
  }
}

type DailyJobsRunRow = { status: string; last_attempt_at: string };
type RunStatus = "processing" | "success" | "partial" | "failed";

// processing이 이 시간보다 오래됐으면 죽은 시도(서버 크래시 등)로 보고 다른 요청이 이어받을 수 있게 한다.
const PROCESSING_STALE_MS = 12 * 60 * 1000;
// 과거 공고 fallback — 부족분 상세 재검증은 필요한 개수 + 여유분만, 이 개수씩 소수 병렬로.
const FALLBACK_VERIFY_BUFFER = 2;
const FALLBACK_VERIFY_BATCH_SIZE = 3;

// daily_jobs_run(user_id, job_date)는 PRIMARY KEY다(day11_migration.sql) — 중복 insert는 Postgres가
// 23505(unique_violation)로 거부하고, 이게 곧 "다른 요청이 먼저 이 슬롯을 점유했다"는 확실한 신호다.
// 그 외 에러 코드(권한 오류, 네트워크, 컬럼 제약 위반 등)는 경쟁과 무관한 진짜 DB 오류이므로 삼키지 않고
// 그대로 던져서 기존 caller의 에러 로깅/핸들링(get-jobs.ts catch, cron의 Promise.allSettled 등)으로 넘긴다.
const UNIQUE_VIOLATION = "23505";

// (user_id, job_date) 행을 원자적으로 "내가 지금 수집 중"으로 점유한다.
// row가 없으면 새로 insert(PK 유니크 제약이 곧 락) — 23505만 "다른 요청이 먼저 잡음"으로 처리.
// row가 processing으로 stale이면 그 시점 값을 조건으로 건 낙관적 update로만 넘겨받는다 — 조건이 하나도
// 안 맞아 0행이 바뀌면 그사이 다른 요청이 이미 이어받은 것(진짜 경쟁 패배, 에러 아님). update 자체가
// 에러를 반환하면 그건 경쟁이 아니라 진짜 DB 오류다. claimedAt은 이후 finalize에서 "내가 아직 이 시도의
// 주인인지" 재확인하는 토큰으로 그대로 재사용한다(뒤늦게 끝난 낡은 시도가 최신 결과를 덮어쓰지 않도록).
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
    if (error.code === UNIQUE_VIOLATION) return null; // 확실한 경쟁 패배
    throw error; // 그 외는 진짜 DB 오류 — 빈 batch로 위장하지 않는다
  }
  const { data, error } = await supabase
    .from("daily_jobs_run")
    .update({ status: "processing", last_attempt_at: claimedAt, role_snapshot: roles })
    .eq("user_id", userId).eq("job_date", localDate)
    .eq("status", "processing").eq("last_attempt_at", existing.last_attempt_at)
    .select("user_id");
  if (error) throw error; // 조건부 update 자체의 실패는 경쟁 패배가 아니라 진짜 DB 오류
  return (data?.length ?? 0) > 0 ? claimedAt : null; // 0행 = 조건 불일치 = 다른 요청이 이미 이어받음(경쟁 패배, 에러 아님)
}

// 이 시도(claimedAt)가 여전히 이 (user_id, job_date)의 주인일 때만 최종 상태를 쓴다 — 조건이 안 맞으면
// (다른 시도가 이미 최종 상태를 썼다는 뜻) 그냥 조용히 아무 것도 안 한다. success를 뒤늦은 실패가
// 덮어쓰는 것과, 낡은 시도가 최신 성공을 덮어쓰는 것 둘 다 이 방식으로 막힌다.
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

// 예약 생성과 최초 접속 fallback이 모두 이 함수 하나만 호출한다.
// 오늘 상태가 success/processing/partial/failed 중 하나라도 있으면 여기서 곧장 반환하고 외부 수집을
// 새로 시작하지 않는다 — "오늘 이미 시도했다"는 사실 자체를 남겨서 방문할 때마다 Tavily/원티드/점핏을
// 다시 두드리지 않게 하는 게 핵심이다(수동 "지금 업데이트"만 이 guard를 의도적으로 우회한다 — actions/jobs.ts 참고).
// 반환값은 호출부(get-jobs.ts, cron)에서 쓰지 않는다 — 이 함수는 DB를 채우는 부수효과가 전부다.
export async function assembleDailyJobs(
  userId: string,
  selectedRoles: JobRole[],
  localDate: string = todayKSTDateString()
): Promise<CollectedJob[]> {
  const roles = validateInterestedJobRoles(selectedRoles);
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
      if (staleMs < PROCESSING_STALE_MS) return []; // 다른 요청이 지금 처리 중
      takeoverTarget = existingRow; // stale — 이어받기 시도
    } else {
      return []; // partial/failed — 자동 경로는 재수집하지 않는다(수동 "지금 업데이트"만 우회)
    }
  }

  const claimedAt = await claimProcessingSlot(supabase, userId, localDate, roles, takeoverTarget);
  if (!claimedAt) return []; // 경쟁에서 짐 — 다른 요청이 먼저 처리 중

  const quota = getDailyRoleQuota(roles, localDate);
  const previousJobs = await loadPreviouslyRecommendedJobs(supabase, userId);
  const previousByUrl = new Map(previousJobs.map((j) => [j.url, j]));

  const perRole = await Promise.all(roles.map((role) => collectJobCandidates(role, localDate)));

  const chosen: CollectedJob[] = [];
  const usedUrls = new Set<string>();
  const leftovers: CollectedJob[] = [];

  // STEP D — 신규(미노출) 후보만 대상으로 직무 quota를 채운다.
  roles.forEach((role, i) => {
    const sorted = perRole[i].filter((job) => isUnseen(job.url, previousByUrl)).sort(byFitThenRecency);
    for (const job of sorted) {
      if (usedUrls.has(job.url)) continue;
      if (chosen.filter((c) => c.role === role).length < quota[role]) {
        chosen.push(job);
        usedUrls.add(job.url);
      } else {
        leftovers.push(job);
      }
    }
  });

  // 부족분 보충 — 사용자가 선택한 다른 직무의 아직 선택되지 않은 신규 적합 공고만 공통 pool로 쓴다.
  for (const job of leftovers.sort(byFitThenRecency)) {
    if (chosen.length >= DAILY_JOB_LIMIT) break;
    if (usedUrls.has(job.url)) continue;
    chosen.push(job);
    usedUrls.add(job.url);
  }

  // STEP E — 그래도 4건 미달이면, roleFitScore/마감 기준은 그대로 두고 선택한 직무 안에서만 더 넓게
  // (WIDE_SEARCH_RESULTS_PER_SITE) 다시 수집해서 채운다. 여기서도 신규(미노출) 후보만 쓴다.
  if (chosen.length < DAILY_JOB_LIMIT) {
    const widePerRole = await Promise.all(roles.map((role) => collectJobCandidates(role, localDate, WIDE_SEARCH_RESULTS_PER_SITE)));
    const widePool = widePerRole.flat().filter((job) => isUnseen(job.url, previousByUrl) && !usedUrls.has(job.url));
    for (const job of widePool.sort(byFitThenRecency)) {
      if (chosen.length >= DAILY_JOB_LIMIT) break;
      if (usedUrls.has(job.url)) continue;
      chosen.push(job);
      usedUrls.add(job.url);
    }
  }

  // STEP F/G — 신규 공고로도 부족하면 과거에 추천했던 활성 공고를 순환 재추천한다. deadline으로 먼저
  // 걸러(네트워크 없이) 오래 안 보여준 순으로 정렬한 뒤, 실제 필요한 개수(+여유분)만 소수 병렬로 상세를
  // 다시 확인한다 — fallback pool 전체를 매번 파싱하지 않는다.
  if (chosen.length < DAILY_JOB_LIMIT) {
    const needed = DAILY_JOB_LIMIT - chosen.length;
    const fallbackPool = previousJobs
      .filter((row) => row.matched_role && (roles as string[]).includes(row.matched_role))
      .filter((row) => !usedUrls.has(row.url))
      .filter((row) => !(row.deadline && row.deadline < localDate))
      .sort(byOldestThenFit)
      .slice(0, needed + FALLBACK_VERIFY_BUFFER);

    for (let i = 0; i < fallbackPool.length && chosen.length < DAILY_JOB_LIMIT; i += FALLBACK_VERIFY_BATCH_SIZE) {
      const batch = fallbackPool.slice(i, i + FALLBACK_VERIFY_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((row) => reverifyStillActive(row.url, localDate)));
      batch.forEach((row, idx) => {
        if (chosen.length >= DAILY_JOB_LIMIT || usedUrls.has(row.url)) return;
        const settled = results[idx];
        const verified = settled.status === "fulfilled" ? settled.value : "unknown"; // 요청 자체 실패 = 기존 데이터 신뢰
        if (verified === null) return; // 다시 확인해보니 이미 마감/삭제된 공고
        const fields = verified === "unknown" ? rowToFields(row) : verified;
        chosen.push({ url: row.url, site: row.source_site ?? "", fields, role: row.matched_role as JobRole, fit: previousJobFit(row) });
        usedUrls.add(row.url);
      });
    }
  }

  // STEP H — 정확히 4건을 확보했을 때만 오늘 배치로 확정한다. 그전까지 chosen은 메모리 안에만 있고
  // saved_job/daily_jobs_run 어디에도 반영되지 않는다 — partial 후보가 추천 이력(최근 추천/NEW 판정)을
  // 오염시키지 않기 위함.
  if (chosen.length < DAILY_JOB_LIMIT) {
    await finalizeAttempt(supabase, userId, localDate, claimedAt, {
      status: chosen.length > 0 ? "partial" : "failed",
      job_count: chosen.length,
    });
    return [];
  }

  const { error } = await supabase.from("saved_job").upsert(
    chosen.map((job) => ({
      user_id: userId,
      company: job.fields.company,
      title: job.fields.title,
      role: job.fields.role,
      url: job.url,
      source_site: job.site,
      matched_role: job.role,
      job_date: localDate,
      responsibilities: job.fields.responsibilities,
      required_text: job.fields.required_text,
      preferred_text: job.fields.preferred_text,
      career_requirement: job.fields.career_requirement,
      deadline: job.fields.deadline,
      posted_at: job.fields.posted_at,
      date_confidence: job.fields.date_confidence,
      // 처음 추천되는 URL만 오늘 날짜로 — 이미 추천한 적 있는 URL은 최초 추천일을 그대로 보존한다(NEW 배지 판단 기준).
      first_recommended_date: previousByUrl.get(job.url)?.first_recommended_date ?? localDate,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,url" }
  );
  if (error) {
    await finalizeAttempt(supabase, userId, localDate, claimedAt, { status: "failed", job_count: 0 });
    throw error;
  }

  await finalizeAttempt(supabase, userId, localDate, claimedAt, {
    status: "success",
    job_count: DAILY_JOB_LIMIT,
    selected_urls: chosen.map((j) => j.url),
    generated_at: new Date().toISOString(),
  });

  return chosen;
}
