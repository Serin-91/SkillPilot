import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleDailyJobs } from "./generate";
import { DAILY_JOB_LIMIT, type JobRole } from "./roles";
import { todayKSTDateString, recentKSTDateStrings } from "@/lib/news/kst";

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
};

// failed — 오늘 수집 시도가 실패했다는 뜻. jobs가 비어있을 때만 오류 화면 트리거로 쓴다
// (부분적으로라도 이미 저장된 공고가 있으면 그걸 그대로 보여주고 굳이 오류로 취급하지 않는다).
export type JobsView = { jobs: SavedJobRow[]; lastUpdated: string | null; jobDate: string; failed: boolean };

const SELECT_FIELDS =
  "id, company, title, role, url, source_site, matched_role, responsibilities, required_text, preferred_text, career_requirement, deadline, analysis_result, updated_at";

// 예약 생성이 primary, 당일 최초 접속이 fallback — 둘 다 assembleDailyJobs 한 경로만 호출한다.
// 오늘 결과가 이미 있으면 관심 직무가 바뀌었더라도 그대로 재사용한다(설정 변경이 오늘 캐시를 지우지 않는다).
export async function getJobsForUser(
  supabase: SupabaseClient,
  userId: string,
  interestedRoles: JobRole[]
): Promise<JobsView> {
  const today = todayKSTDateString();

  // 수집 자체가 실패해도(Tavily/파싱 오류 등) 페이지 전체가 500으로 죽지 않도록 news.ts와 같은 방식으로 격리한다.
  let failed = false;
  if (interestedRoles.length > 0) {
    try {
      await assembleDailyJobs(userId, interestedRoles, today); // 오늘 이미 돌았으면 내부 guard가 즉시 반환
    } catch (e) {
      console.error("[jobs] 채용공고 수집 실패", e);
      failed = true;
    }
  }

  // 저장 시점엔 마감 전이었어도 같은 날 안에 마감일이 지날 수 있으니 조회 시점에도 한 번 더 거른다
  // (deadline이 없는 상시채용은 그대로 둔다) — collection-time 필터(generate.ts)와 같은 KST 기준.
  const { data, error } = await supabase
    .from("saved_job")
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .eq("job_date", today)
    .or(`deadline.is.null,deadline.gte.${today}`)
    .order("updated_at", { ascending: false })
    .limit(DAILY_JOB_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as (SavedJobRow & { updated_at: string })[];
  const lastUpdated = rows.reduce<string | null>((max, r) => (!max || r.updated_at > max ? r.updated_at : max), null);
  return { jobs: rows, lastUpdated, jobDate: today, failed };
}

export type JobsHistoryDay = { date: string; jobs: SavedJobRow[] };

// 오늘은 메인에서 이미 보여주므로 제외 — 어제/그저께 중 실제로 수집된 날짜만 돌려준다.
export async function getJobsHistory(supabase: SupabaseClient, userId: string, days = 2): Promise<JobsHistoryDay[]> {
  const dates = recentKSTDateStrings(days);
  const { data, error } = await supabase
    .from("saved_job")
    .select(`${SELECT_FIELDS}, job_date`)
    .eq("user_id", userId)
    .in("job_date", dates)
    .order("job_date", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (SavedJobRow & { job_date: string })[];
  const byDate = new Map<string, SavedJobRow[]>();
  for (const r of rows) {
    if (!byDate.has(r.job_date)) byDate.set(r.job_date, []);
    byDate.get(r.job_date)!.push(r);
  }
  return dates.filter((d) => byDate.has(d)).map((d) => ({ date: d, jobs: byDate.get(d)!.slice(0, DAILY_JOB_LIMIT) }));
}
