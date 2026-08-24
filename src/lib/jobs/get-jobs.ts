import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleDailyJobs, recordCollectError } from "./generate";
import { DAILY_JOB_LIMIT, type JobRole } from "./roles";
import { todayKSTDateString, toKSTDateString, isPastDailyGenerationTime } from "@/lib/news/kst";
// NEW 배지 판정은 new-badge.ts 한 곳에서만 정의한다 — 예전엔 이 파일(is_new)과 generate.ts
// (first_recommended_date)에 나뉘어 있었고 두 곳의 처리가 어긋나 배지가 잘못 붙었다(2026-08-21).
import { NEW_BADGE_DAYS, isNewBadge } from "./new-badge";

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
  // 추천 로직은 이 값을 전혀 참고하지 않는다(순수 UI 표시용) — new-badge.ts의 isNewBadge가 정한다.
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
// incomplete — 오늘 배치는 맞지만 목표치(DAILY_JOB_LIMIT)에 못 미친다(partial). stale과 구분해야
// 하는 이유: partial도 이제 화면에 뜨므로 stale=false인데, 그렇다고 "정상"은 아니라서 재시도
// 버튼은 계속 보여줘야 한다. 이 플래그가 없으면 3건인 날 복구 수단이 통째로 사라진다.
export type JobsView = {
  jobs: SavedJobRow[]; lastUpdated: string | null; jobDate: string;
  stale: boolean; incomplete: boolean; todayProcessing: boolean; pending: boolean;
};

const SELECT_FIELDS =
  "id, company, title, role, url, source_site, matched_role, responsibilities, required_text, preferred_text, career_requirement, deadline, analysis_result, updated_at, job_date, first_recommended_date";

// 이 날짜 이상이면 NEW. NEW_BADGE_DAYS=1이면 오늘 날짜 자신이 된다.
function newBadgeCutoff(): string {
  return toKSTDateString(new Date(Date.now() - (NEW_BADGE_DAYS - 1) * 24 * 60 * 60 * 1000));
}

// 예전 판정은 `first_recommended_date === job_date`였다. job_date는 그 공고가 배치에 들어갈 때마다
// 오늘로 갱신되는 값이라, 배치 안에서는 얼추 맞았지만 "최근 추천"에서는 완전히 틀렸다 —
// 거기 뜨는 공고들은 오늘 배치에 없어서 job_date가 과거에 멈춰 있고, 딱 한 번만 추천된 공고는
// first_recommended_date === job_date가 영원히 참이라 몇 달 뒤에도 NEW가 붙어 있었다
// (2026-08-21: 한 계정은 최근 추천 전체에 NEW가 달려 있었다 — 전부 한 번씩만 추천된 공고였다).
// job_date를 기준으로 삼는 것 자체가 틀렸다. NEW는 "언제 처음 추천됐는가" 하나로만 정해야 한다.
function toSavedJobRow(r: SavedJobRawRow, cutoff: string): SavedJobRow {
  const { job_date, first_recommended_date, ...rest } = r;
  void job_date; // 더 이상 NEW 판정에 쓰지 않는다
  return { ...rest, is_new: isNewBadge(first_recommended_date, cutoff) };
}

// 정상 batch가 생기기 전(legacy row, selected_urls 컬럼이 없던 시절 success)에 대한 호환 — job_date로
// 그 배치의 URL을 복원한다. 예전엔 "정확히 4개"가 아니면 통째로 버렸는데, 이제 배치 크기가 1~4로
// 달라질 수 있으므로 상한만 본다(4를 넘으면 여러 배치가 섞인 것이라 신뢰할 수 없다).
async function legacyUrlsForBatch(supabase: SupabaseClient, userId: string, jobDate: string): Promise<string[]> {
  const { data, error } = await supabase.from("saved_job").select("url").eq("user_id", userId).eq("job_date", jobDate);
  if (error) throw error;
  const urls = (data ?? []).map((r) => r.url as string);
  return urls.length > 0 && urls.length <= DAILY_JOB_LIMIT ? urls : [];
}

// 현재 화면에 보여줄 batch — daily_jobs_run에서 가장 최근 success/partial 행의 selected_urls를
// source of truth로 쓴다(saved_job.job_date는 재추천되면 덮어써지므로 신뢰하지 않는다). 순서도
// selected_urls 배열 순서를 그대로 따른다(SQL IN() 반환 순서에 의존하지 않는다).
//
// partial(1~3건)도 오늘 배치로 인정한다 — 예전엔 status='success'이면서 크기가 정확히 4일 때만
// 배치로 쳤다. 그런데 generate.ts는 4건을 못 채우면 모은 것을 저장조차 하지 않았으므로, 3건인 날은
// 화면에 어제 배치가 stale로 뜨고 "지금 업데이트"를 눌러도 같은 결과가 반복됐다. 목표치(4)에
// 못 미친 사실은 JobsView.incomplete로 따로 알려 재시도 버튼을 계속 노출한다.
async function getCurrentBatch(
  supabase: SupabaseClient,
  userId: string
): Promise<{ jobDate: string; generatedAt: string; rows: SavedJobRow[] } | null> {
  const { data: batchRow, error } = await supabase
    .from("daily_jobs_run")
    .select("job_date, generated_at, selected_urls")
    .eq("user_id", userId)
    .in("status", ["success", "partial"])
    .order("job_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!batchRow) return null;

  const storedUrls = batchRow.selected_urls as string[] | null;
  const urls =
    Array.isArray(storedUrls) && storedUrls.length > 0 && storedUrls.length <= DAILY_JOB_LIMIT
      ? storedUrls
      : await legacyUrlsForBatch(supabase, userId, batchRow.job_date as string);
  if (urls.length === 0) return null; // selected_urls도 legacy 복원도 못 했다 — 보여줄 배치가 없다

  const { data: rows, error: rowsError } = await supabase.from("saved_job").select(SELECT_FIELDS).eq("user_id", userId).in("url", urls);
  if (rowsError) throw rowsError;
  const byUrl = new Map(((rows ?? []) as SavedJobRawRow[]).map((r) => [r.url, r]));
  const ordered = urls.map((u) => byUrl.get(u)).filter((r): r is SavedJobRawRow => !!r);
  if (ordered.length === 0) return null; // row가 전부 사라졌다 — 배치로 취급하지 않는다

  const cutoff = newBadgeCutoff();
  return { jobDate: batchRow.job_date as string, generatedAt: batchRow.generated_at as string, rows: ordered.map((r) => toSavedJobRow(r, cutoff)) };
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
  priorityRoles: JobRole[],
  // "지금 업데이트"(retryJobs) 전용. 자동 경로의 시간 게이트를 사용자가 명시적으로 우회한다.
  //
  // 🔴 이게 없어서 버튼이 눌리지 않았다. retryJobs는 daily_jobs_run 행까지 지우고 재수집하는
  // "guard를 우회하는 유일한 경로"인데, 정작 여기 시간 게이트(KST 10:10)는 못 넘었다.
  // 버튼 노출 기준은 MANUAL_REFRESH_MIN(11:30)이라 정상 흐름에서는 안 겹치지만, 자정을 넘겨
  // 열어둔 화면이나 10:10 이전 접속에서는 **버튼은 보이는데 눌러도 아무 일이 없는** 상태가 됐다.
  // 남용 방지는 시간이 아니라 manual-refresh-limit(하루 상한)이 담당한다.
  opts?: { force?: boolean }
): Promise<JobsView> {
  const today = todayKSTDateString();
  const pastGenerationTime = isPastDailyGenerationTime();

  if (priorityRoles.length > 0 && (pastGenerationTime || opts?.force)) {
    try {
      await assembleDailyJobs(userId, priorityRoles, today);
    } catch (e) {
      // 🔴 이 catch가 마지막 침묵 지점이었다. assembleDailyJobs 안쪽은 모든 갈래가
      // recordCollectError를 남기지만, 함수가 **throw로 빠져나오면** 그 기록을 남길 새도 없이
      // 여기서 삼켜진다 — 사용자에겐 "수집은 돌았지만 못 찾았습니다"(collectErrors가 빈
      // fallback 문구)만 뜨고, 메일도 소스 catch를 안 거쳤으니 안 온다. 정확히 그 증상이었다.
      console.error("[jobs] 채용공고 수집 실패", e);
      recordCollectError("수집예외", e);
    }
  } else {
    // 조건이 막아서 수집을 아예 시작하지 않은 경우도 구분해서 남긴다.
    recordCollectError("수집안함", `관심직무 ${priorityRoles.length}개 / 생성시각(KST 10:10) 지남=${pastGenerationTime} / force=${opts?.force === true}`);
  }

  const [batch, todayProcessing] = await Promise.all([
    getCurrentBatch(supabase, userId),
    isTodayProcessing(supabase, userId, today),
  ]);

  if (!batch) {
    return { jobs: [], lastUpdated: null, jobDate: today, stale: true, incomplete: false, todayProcessing, pending: !pastGenerationTime };
  }
  const isToday = batch.jobDate === today;

  // 오늘 수집이 목표치를 못 채웠어도 추천 목록은 항상 DAILY_JOB_LIMIT건으로 보여준다.
  // 2026-08-22에 한 계정은 2건만, 다른 계정은 수집 자체가 실패해 0건이었다. 수집이 부실한 날은
  // 앞으로도 생기는데, 그때마다 화면이 2건으로 쪼그라들면 기능이 비어 보인다. 남은 자리는 최근에
  // 추천했던 공고로 채운다 — getRecentJobs가 이미 마감 지난 공고 제외·중복 URL 제외·최신순 정렬을
  // 하고 있어 그대로 쓴다.
  //
  // 채워 넣은 공고에는 NEW 배지가 붙지 않는다. is_new는 first_recommended_date로만 정해지고 그
  // 날짜는 과거이기 때문이다 — "오늘 새로 들어온 것"과 "자리를 메운 것"이 화면에서 구분된다.
  const filler =
    batch.rows.length < DAILY_JOB_LIMIT
      ? await getRecentJobs(supabase, userId, batch.rows.map((r) => r.url), DAILY_JOB_LIMIT - batch.rows.length)
      : [];

  return {
    jobs: [...batch.rows, ...filler],
    lastUpdated: batch.generatedAt,
    jobDate: batch.jobDate,
    stale: !isToday,
    // 과거 배치를 보여주는 중이면 그건 stale로 이미 표현된다 — incomplete는 "오늘 건데 모자람"만 뜻한다.
    // 채워 넣은 공고는 여기 계산에서 뺀다 — 자리를 메웠다고 해서 오늘 수집이 성공한 게 아니고,
    // 재시도 버튼이 사라지면 그날은 복구할 방법이 없어진다.
    incomplete: isToday && batch.rows.length < DAILY_JOB_LIMIT,
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
  const cutoff = newBadgeCutoff();
  return ((data ?? []) as SavedJobRawRow[]).map((r) => toSavedJobRow(r, cutoff));
}
