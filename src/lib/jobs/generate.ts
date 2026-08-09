import { createAdminClient } from "@/lib/supabase/admin";
import { tavilySearch } from "./tavily";
import type { ExtractedJobFields } from "./extract-fields";
import { fetchWantedJobDetail } from "./wanted";
import { fetchJumpitJobDetail, fetchJumpitPositions } from "./jumpit";
import { roleFitScore } from "./filter";
import { JOB_SITES, MAX_SEARCH_RESULTS_PER_SITE, MAX_EXTRACT_ATTEMPTS_PER_SITE } from "./sources";
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
export function collectJobCandidates(role: JobRole, localDate: string): Promise<CollectedJob[]> {
  const key = `${localDate}:${role}`;
  const cached = candidateCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const perSite = await Promise.allSettled(
      JOB_SITES.map(async (site) => {
        // 점핏은 Tavily 인덱스가 마감 공고를 올려보내는 문제가 있어 점핏 자체 목록 API로 직접 받는다.
        // 원티드는 기존 그대로 Tavily 검색 결과를 쓴다.
        const candidates =
          site.domain === "jumpit.saramin.co.kr"
            ? await fetchJumpitPositions(role, MAX_SEARCH_RESULTS_PER_SITE)
            : await tavilySearch(JOB_ROLE_CONFIG[role].searchQuery, site.domain, MAX_SEARCH_RESULTS_PER_SITE);
        // 검색 스니펫 기준으로 관련도 높은 후보를 먼저 시도
        const ranked = [...candidates].sort(
          (a, b) => roleFitScore(`${b.title} ${b.content}`, role) - roleFitScore(`${a.title} ${a.content}`, role)
        );
        const out: CollectedJob[] = [];
        for (const candidate of ranked.slice(0, MAX_EXTRACT_ATTEMPTS_PER_SITE)) {
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

// 예약 생성과 최초 접속 fallback이 모두 이 함수 하나만 호출한다.
// (user_id, local_date) guard를 먼저 확인하므로 같은 날 두 번 생성되지 않는다. 결과 0건도 정상 캐시.
export async function assembleDailyJobs(
  userId: string,
  selectedRoles: JobRole[],
  localDate: string = todayKSTDateString()
): Promise<CollectedJob[]> {
  const roles = validateInterestedJobRoles(selectedRoles);
  if (!roles) return [];

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("daily_jobs_run")
    .select("user_id")
    .eq("user_id", userId)
    .eq("job_date", localDate)
    .maybeSingle();
  if (existing) return []; // 오늘 이미 생성됨 — 덮어쓰지 않는다

  const quota = getDailyRoleQuota(roles, localDate);
  const perRole = await Promise.all(roles.map((role) => collectJobCandidates(role, localDate)));

  const chosen: CollectedJob[] = [];
  const usedUrls = new Set<string>();
  const leftovers: CollectedJob[] = [];

  roles.forEach((role, i) => {
    const sorted = [...perRole[i]].sort(byFitThenRecency);
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

  // 부족분 보충 — 사용자가 선택한 다른 직무의 아직 선택되지 않은 적합 공고만 공통 pool로 쓴다.
  // 적합 공고가 모자라면 무관한 공고를 억지로 넣지 않고 실제 확보한 수만 저장한다.
  for (const job of leftovers.sort(byFitThenRecency)) {
    if (chosen.length >= DAILY_JOB_LIMIT) break;
    if (usedUrls.has(job.url)) continue;
    chosen.push(job);
    usedUrls.add(job.url);
  }

  if (chosen.length > 0) {
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
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,url" }
    );
    if (error) throw error;
  }

  // 생성 도중 profile이 바뀌어도 오늘 결과는 시작 시점 snapshot으로 일관되게 마감한다
  await supabase.from("daily_jobs_run").upsert({
    user_id: userId,
    job_date: localDate,
    role_snapshot: roles,
    job_count: chosen.length,
  });

  return chosen;
}
