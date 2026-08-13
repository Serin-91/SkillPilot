import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleDailyJobs } from "./generate";
import { DAILY_JOB_LIMIT, type JobRole } from "./roles";
import { todayKSTDateString, isPastDailyGenerationTime } from "@/lib/news/kst";

export type SavedJobRow = {
  id: string;
  company: string;
  title: string;
  role: string | null;
  url: string;
  source_site: string | null;
  matched_role: string | null;
  responsibilities: string | null;
  required_text: string | null;
  preferred_text: string | null;
  career_requirement: string | null;
  deadline: string | null;
  analysis_result: { bullets: string[]; insight: string } | null;
  // 추천 로직은 이 값을 전혀 참고하지 않는다(순수 UI 표시용) — first_recommended_date === job_date일 때만 true.
  is_new: boolean;
};

type SavedJobRawRow = {
  id: string; company: string; title: string; role: string | null; url: string;
  source_site: string | null; matched_role: string | null;
  responsibilities: string | null; required_text: string | null; preferred_text: string | null;
  career_requirement: string | null; deadline: string | null;
  analysis_result: { bullets: string[]; insight: string } | null;
  updated_at: string; job_date: string; first_recommended_date: string | null;
};

// failed 대신 "한 번도 정상 성공(4건)한 적이 없다"로 표현한다: lastUpdated가 null이면 그 뜻이다.
// stale — 지금 보여주는 batch의 날짜(jobDate)가 오늘이 아니다(오늘 아직 success 없음).
// todayProcessing — 오늘 상태가 processing이면 "지금 업데이트" 버튼을 비활성/숨김 처리하는 데 쓴다.
// pending — 아직 오늘 예약 생성 시각(10:10) 전이라 자동 시도 자체를 안 한 상태.
export type JobsView = {
  jobs: SavedJobRow[]; lastUpdated: string | null; jobDate: string;
  stale: boolean; todayProcessing: boolean; pending: boolean;
};

const SELECT_FIELDS =
  "id, company, title, role, url, source_site, matched_role, responsibilities, required_text, preferred_text, career_requirement, deadline, analysis_result, updated_at, job_date, first_recommended_date";

function toSavedJobRow(r: SavedJobRawRow): SavedJobRow {
  const { job_date, first_recommended_date, ...rest } = r;
  return { ...rest, is_new: first_recommended_date !== null && first_recommended_date === job_date };
}

// 정상 batch가 생기기 전(legacy row, selected_urls 컬럼이 없던 시절 success)에 대한 호환 — job_date로
// 그 배치의 4개 URL을 복원한다. 정확히 4개가 아니면 신뢰할 수 없는 데이터로 보고 빈 배열을 돌려준다.
async function legacyUrlsForBatch(supabase: SupabaseClient, userId: string, jobDate: string): Promise<string[]> {
  const { data, error } = await supabase.from("saved_job").select("url").eq("user_id", userId).eq("job_date", jobDate);
  if (error) throw error;
  const urls = (data ?? []).map((r) => r.url as string);
  return urls.length === DAILY_JOB_LIMIT ? urls : [];
}

// 현재 화면에 보여줄 정상 batch — daily_jobs_run에서 가장 최근 status='success' 행의 selected_urls를
// source of truth로 쓴다(saved_job.job_date는 재추천되면 덮어써지므로 신뢰하지 않는다). 순서도
// selected_urls 배열 순서를 그대로 따른다(SQL IN() 반환 순서에 의존하지 않는다).
async function getCurrentBatch(
  supabase: SupabaseClient,
  userId: string
): Promise<{ jobDate: string; generatedAt: string; rows: SavedJobRow[] } | null> {
  const { data: successRow, error } = await supabase
    .from("daily_jobs_run")
    .select("job_date, generated_at, selected_urls")
    .eq("user_id", userId)
    .eq("status", "success")
    .order("job_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!successRow) return null;

  const storedUrls = successRow.selected_urls as string[] | null;
  const urls =
    Array.isArray(storedUrls) && storedUrls.length === DAILY_JOB_LIMIT
      ? storedUrls
      : await legacyUrlsForBatch(supabase, userId, successRow.job_date as string);
  if (urls.length !== DAILY_JOB_LIMIT) return null; // 신뢰할 수 없는 legacy 데이터 — 정상 batch로 취급하지 않는다

  const { data: rows, error: rowsError } = await supabase.from("saved_job").select(SELECT_FIELDS).eq("user_id", userId).in("url", urls);
  if (rowsError) throw rowsError;
  const byUrl = new Map(((rows ?? []) as SavedJobRawRow[]).map((r) => [r.url, r]));
  const ordered = urls.map((u) => byUrl.get(u)).filter((r): r is SavedJobRawRow => !!r);
  if (ordered.length !== DAILY_JOB_LIMIT) return null; // row 소실 등 불일치 — 정상 batch로 취급하지 않는다

  return { jobDate: successRow.job_date as string, generatedAt: successRow.generated_at as string, rows: ordered.map(toSavedJobRow) };
}

async function isTodayProcessing(supabase: SupabaseClient, userId: string, today: string): Promise<boolean> {
  const { data } = await supabase.from("daily_jobs_run").select("status").eq("user_id", userId).eq("job_date", today).maybeSingle();
  return data?.status === "processing";
}

// 예약 생성이 primary, 당일 최초 접속이 fallback — 둘 다 assembleDailyJobs 한 경로만 호출한다.
// assembleDailyJobs 자체가 "오늘 이미 시도했는지"를 daily_jobs_run.status로 판단해 중복 수집을 막으므로
// 여기서는 그냥 호출하고, 실제 화면은 항상 getCurrentBatch(최신 성공 batch)로 별도 조회한다.
// priorityRoles[0]이 1순위다 — quota 배분에 그대로 쓰이므로 canonical 순서로 정규화하지 않고 그대로 넘긴다.
export async function getJobsForUser(
  supabase: SupabaseClient,
  userId: string,
  priorityRoles: JobRole[]
): Promise<JobsView> {
  const today = todayKSTDateString();
  const pastGenerationTime = isPastDailyGenerationTime();

  if (priorityRoles.length > 0 && pastGenerationTime) {
    try {
      await assembleDailyJobs(userId, priorityRoles, today);
    } catch (e) {
      console.error("[jobs] 채용공고 수집 실패", e);
    }
  }

  const [batch, todayProcessing] = await Promise.all([
    getCurrentBatch(supabase, userId),
    isTodayProcessing(supabase, userId, today),
  ]);

  if (!batch) {
    return { jobs: [], lastUpdated: null, jobDate: today, stale: true, todayProcessing, pending: !pastGenerationTime };
  }
  return {
    jobs: batch.rows,
    lastUpdated: batch.generatedAt,
    jobDate: batch.jobDate,
    stale: batch.jobDate !== today,
    todayProcessing,
    pending: !pastGenerationTime,
  };
}

// "최근 추천" 탭 — 현재 추천 4건의 정확한 URL을 제외한 이전 추천 공고를 최신순으로. DB 조회만 하고
// 원티드/점핏 상세 페이지를 다시 파싱하지 않는다(그건 assembleDailyJobs의 부족분 fallback에서만 한다).
export async function getRecentJobs(
  supabase: SupabaseClient,
  userId: string,
  excludeUrls: string[],
  limit = 8
): Promise<SavedJobRow[]> {
  const today = todayKSTDateString();
  let query = supabase
    .from("saved_job")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("job_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (excludeUrls.length > 0) {
    const list = excludeUrls.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
    query = query.not("url", "in", `(${list})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as SavedJobRawRow[]).map(toSavedJobRow);
}
