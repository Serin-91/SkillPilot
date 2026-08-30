"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { isAdminEmail } from "@/lib/auth/admin";
import { todayKSTDateString, recentKSTDateStrings, toKSTDateString, isBeforeDailyGenerationTime } from "@/lib/news/kst";
import { MAX_SELECTED } from "@/lib/news/sources";
import { DAILY_JOB_LIMIT, validateInterestedJobRoles } from "@/lib/jobs/roles";
import { storyKey } from "@/lib/news/select";
import type { NewsPipelineStats } from "@/lib/news/generate";

type RunDetails = {
  news?: string | number; newsCount?: number;
  newsMemberTotal?: number; newsMemberCovered?: number; // "N건/M명" 표시용 — 이 필드가 없는 과거 기록은 null로 처리한다
  jobUsers?: number; jobFailures?: number; aiTrendOk?: boolean;
  jobsPending?: number; jobsOverwritten?: number; // cron route에서 기록 — 이 필드 이전 기록은 undefined
  newsStats?: NewsPipelineStats; // 뉴스 단계별 통과/탈락. 이 필드 이전 기록과 '스킵한 날'은 undefined
} | null;

// 채용 결과를 회원별로 보는 통일 기준. 정상 회원은 절대 행으로 만들지 않고 숫자로만 센다 —
// 회원이 늘어도 화면 길이는 "이상 회원 수"에만 비례한다(상한 JOB_ISSUE_MAX).
//
// 예전엔 채용 결과가 날짜 단위 집계뿐이었다. 채용은 관심 직무별 개인화라 그 집계로는 원리적으로
// 어느 계정이 문제인지 읽을 수 없고, 실제로 두 번 대가를 치렀다: (1) cron이 legacy 프로필까지
// 분모에 넣어 "사용자 5명/실패 0명"으로 보고해 실제 대상이 2명인 걸 못 봤고, (2) 2026-08-25에
// 새벽 01:36·01:38 수동 배치가 그날을 차지해 아침 크론이 전원 스킵한 걸 화면에서 알 수 없었다.
// "재설정 대기"(legacy 직무)는 여기 안 들어간다 — 대상이 아니라 대기 상태이고, 수가 늘면
// JOB_ISSUE_MAX를 통째로 잡아먹어 정작 봐야 할 실패를 화면에서 밀어낸다. 숫자로만 센다(jobsPendingReset).
export type JobIssueKind = "실패" | "미달" | "미수집" | "예약 전 생성";
export type JobIssue = { who: string; kind: JobIssueKind; detail: string };

// 이상 회원이 이보다 많으면 잘라내고 남은 수만 알린다 — 조용히 자르면 "이게 전부"로 읽힌다.
const JOB_ISSUE_MAX = 20;

// "01:38" — 그날 몇 시에 확정됐는지만 보면 예약 시각(10:10)과 어긋난 걸 바로 읽는다.
function toKSTTimeLabel(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

type CronRunRow = {
  status: "started" | "success" | "failed";
  trigger_source: "vercel_cron" | "fallback" | "manual";
  error_message: string | null;
  details: RunDetails;
  started_at: string;
  finished_at: string | null;
};

// "점검 필요" — 실행은 끝까지 성공했는데 결과물이 기준에 못 미치는 날. 이 라벨이 없던 시절에는
// 뉴스가 3건에 그치고 그중 두 장이 같은 내용이며 한 계정은 채용 수집이 통째로 실패한 날조차
// "정상"으로 떴다(2026-08-22). 크론이 예외 없이 끝났다는 사실만 보고 있었기 때문이다.
export type DayStatusLabel = "정상" | "점검 필요" | "일부 실패" | "실패" | "실패 후 복구" | "기록 없음";

// 그날 실제로 만들어진 결과물을 검사한 값 — cron_runs의 자기 보고가 아니라 briefing/daily_jobs_run을
// 직접 읽어서 채운다. 자기 보고만 믿으면 "성공했다고 적혀 있으니 정상"이 되어버린다.
export type DayOutcome = {
  newsStored: number | null;      // briefing에 실제로 저장된 뉴스 건수
  newsDuplicates: number;         // 그중 같은 내용이 두 장 이상인 묶음 수
  jobsFailedUsers: number;        // 채용 수집이 0건으로 끝난 회원 수
  jobsPartialUsers: number;       // 목표치에 못 미친 회원 수
  // 그날 배치가 "새로 찾은 공고"인지 "과거 공고 재추천"인지. NEW 배지가 0건일 때 시장에 신규가
  // 없었던 건지 우리 수집이 부실했던 건지를 가르는 유일한 단서다(generate.ts STEP D/E vs STEP F).
  // saved_job.first_recommended_date로 계산하므로 새 컬럼 없이 과거 날짜까지 소급해서 나온다.
  jobsFresh: number | null;       // first_recommended_date == 그날 → 그날 처음 발견한 공고
  jobsReserved: number | null;    // 그 외 → 과거에 추천했던 공고를 다시 꺼낸 것
  // 통일 기준(JobIssue) — 정상 회원은 여기 안 들어온다. jobsEligible이 분모, jobsOk가 정상 수다.
  jobsEligible: number;           // 그날 수집 대상이었던 회원 수(legacy 재설정 대기 제외)
  jobsOk: number;                 // 그중 목표치를 채운 회원 수
  jobsPendingReset: number;       // 대상 아님 — legacy 직무라 화면에 "직무 재설정 필요"가 떠 있는 회원
  jobIssues: JobIssue[];          // 이상 회원만. 최대 JOB_ISSUE_MAX개
  jobIssuesOmitted: number;       // 상한에 걸려 잘린 수
  problems: string[];             // 화면에 그대로 보여줄 사람이 읽는 문장
};

export type DayStatus = {
  date: string;
  label: DayStatusLabel;
  cronStartedAt: string | null;
  cronFinishedAt: string | null;
  fallbackAt: string | null;
  finalGeneratedAt: string | null;
  newsOk: boolean | null;
  newsCount: number | null;
  newsSkipped: boolean; // 이미 오늘 briefing이 있어서 이번 실행에서는 생성 자체를 안 한 경우
  newsMemberTotal: number | null; // "N건/M명"의 M — 이 필드를 기록하기 전 과거 기록은 null
  newsMemberCovered: number | null; // "N건/M명"의 실제 커버된 회원 수
  aiTrendOk: boolean | null;
  jobUsers: number | null;
  jobFailures: number | null;
  jobsOverwritten: number | null; // 크론이 갈아엎은 "예약 전 생성" 배치 수 — 이 필드 이전 기록은 null
  // 뉴스 파싱 기록. null이면 그날은 이 값을 남기지 않았다(스킵했거나 기록 도입 전) — 화면에 "-"로 둔다.
  newsStats: NewsPipelineStats | null;
  errorMessage: string | null;
  outcome: DayOutcome;
};

export type SystemStatusResponse =
  | { ok: true; days: DayStatus[]; fetchedAt: string }
  | { error: string; reason: "forbidden" | "query_failed"; at: string };

// cron 성공(+ 채용 일부 실패 없음) → 정상 / cron 실패했지만 fallback이 살려냄 → 실패 후 복구,
// 운영자는 최종 결과 유무와 별개로 "아침 예약이 실패했었다"는 사실을 반드시 구분해서 봐야 한다 (지침 §7).
function deriveLabel(
  cronRun: CronRunRow | undefined,
  fallbackRun: CronRunRow | undefined,
  outcome: DayOutcome
): DayStatusLabel {
  if (!cronRun && !fallbackRun) return "기록 없음";
  if (cronRun?.status === "success") {
    if ((cronRun.details?.jobFailures ?? 0) > 0) return "일부 실패";
    // 실행이 성공해도 결과가 기준 미달이면 정상이 아니다 — 여기서 걸러야 관리자 페이지가 쓸모가 있다.
    return outcome.problems.length > 0 ? "점검 필요" : "정상";
  }
  if (fallbackRun?.status === "success") return outcome.problems.length > 0 ? "점검 필요" : "실패 후 복구";
  if (cronRun?.status === "failed" || fallbackRun?.status === "failed") return "실패";
  return "기록 없음"; // started만 있고 아직 끝나지 않음
}

// 민감정보(스택트레이스, 내부 경로 등)가 섞여있을 수 있는 원본 에러에서 한 줄 메시지만 뽑아 관리자
// 화면에 보여준다 — 전체 stack trace는 서버 로그에만 남긴다.
function sanitizeErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.split("\n")[0].slice(0, 300);
}

// My Page의 System Status 탭 전용 데이터. 관리자가 아니면 쿼리 자체를 실행하지 않는다.
// "상태 다시 확인" 버튼도 이 함수를 그대로 다시 호출한다 — 조회만 하고 cron/뉴스/채용 생성은 절대 건드리지 않는다.
export async function getSystemStatus(): Promise<SystemStatusResponse> {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    return { error: "관리자 권한이 필요합니다.", reason: "forbidden", at: new Date().toISOString() };
  }

  const admin = createAdminClient();
  const dates = [todayKSTDateString(), ...recentKSTDateStrings(6)];
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  let runs: CronRunRow[];
  let briefRows: { briefing_date: string; generated_at: string; selected_news: { title?: string }[] | null }[];
  let jobRuns: { job_date: string; status: string; job_count: number; user_id: string; generated_at: string | null }[];
  let savedJobs: { job_date: string; first_recommended_date: string | null }[];
  let profiles: { user_id: string; nickname: string; interested_job_roles: string[] | null }[];
  try {
    const [runsRes, briefRes, jobRes, savedRes, profRes] = await Promise.all([
      admin
        .from("cron_runs")
        .select("status, trigger_source, error_message, details, started_at, finished_at")
        .eq("job_name", "briefing")
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      // selected_news까지 읽는다 — 건수와 중복을 cron의 자기 보고가 아니라 저장된 결과로 판정한다.
      admin.from("briefing").select("briefing_date, generated_at, selected_news").in("briefing_date", dates).order("generated_at", { ascending: true }),
      // user_id/generated_at까지 읽는다 — 회원별 이상 판정(JobIssue)과 "예약 전 생성" 감지에 쓴다.
      admin.from("daily_jobs_run").select("job_date, status, job_count, user_id, generated_at").in("job_date", dates),
      // 신규 발견 vs 과거 재추천 비율 — 컬럼이 이미 있어서 마이그레이션 없이 계산된다.
      admin.from("saved_job").select("job_date, first_recommended_date").in("job_date", dates),
      // 분모(대상 회원)와 "미수집" 감지용 — daily_jobs_run 행이 아예 없는 회원은 행만 봐서는 안 보인다.
      admin.from("profiles").select("user_id, nickname, interested_job_roles"),
    ]);
    if (runsRes.error) throw runsRes.error;
    if (briefRes.error) throw briefRes.error;
    if (jobRes.error) throw jobRes.error;
    if (savedRes.error) throw savedRes.error;
    if (profRes.error) throw profRes.error;
    runs = (runsRes.data ?? []) as CronRunRow[];
    briefRows = (briefRes.data ?? []) as typeof briefRows;
    jobRuns = (jobRes.data ?? []) as typeof jobRuns;
    savedJobs = (savedRes.data ?? []) as typeof savedJobs;
    profiles = (profRes.data ?? []) as typeof profiles;
  } catch (e) {
    console.error("[admin-status] 조회 실패", e);
    return { error: sanitizeErrorMessage(e), reason: "query_failed", at: new Date().toISOString() };
  }

  // "최종 생성"은 그날 마지막으로 실제 생성이 일어난 시각이어야 한다(이름 그대로 latest) — query가
  // generated_at ascending이라 마지막에 덮어쓴 값이 항상 그날의 최신값이 된다.
  const finalGeneratedByDate = new Map<string, string>();
  for (const row of briefRows) finalGeneratedByDate.set(row.briefing_date, row.generated_at);

  const runsByDate = new Map<string, CronRunRow[]>();
  for (const row of runs) {
    const date = toKSTDateString(new Date(row.started_at));
    if (!runsByDate.has(date)) runsByDate.set(date, []);
    runsByDate.get(date)!.push(row);
  }

  // 뉴스는 전 회원 공유 콘텐츠라 날짜별로 아무 행이나 하나 보면 된다.
  const newsByDate = new Map<string, { title?: string }[]>();
  for (const row of briefRows) {
    if (!newsByDate.has(row.briefing_date)) newsByDate.set(row.briefing_date, row.selected_news ?? []);
  }
  const jobRunsByDate = new Map<string, typeof jobRuns>();
  for (const row of jobRuns) {
    if (!jobRunsByDate.has(row.job_date)) jobRunsByDate.set(row.job_date, []);
    jobRunsByDate.get(row.job_date)!.push(row);
  }

  function outcomeFor(date: string): DayOutcome {
    const news = newsByDate.get(date) ?? null;
    const runsForDay = jobRunsByDate.get(date) ?? [];
    // 같은 내용이 두 장 이상 실린 묶음 수. select.ts의 storyKey를 그대로 써서 판정 기준을 하나로 둔다.
    let duplicates = 0;
    if (news) {
      const counts = new Map<string, number>();
      for (const item of news) {
        const key = storyKey(item.title ?? "");
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      duplicates = [...counts.values()].filter((n) => n > 1).length;
    }
    const failed = runsForDay.filter((r) => r.status === "failed").length;
    const partial = runsForDay.filter((r) => r.status === "partial").length;

    // ── 회원별 이상 판정 ──────────────────────────────────────────────────────────
    // 대상 = 관심 직무를 신규 slug로 1개 이상 고른 회원. legacy 전용은 화면에 "직무 재설정 필요"가
    // 이미 떠 있어 수집 대상이 아니다(Dashboard.tsx hasLegacyRoles) — 분모에서 빼고 따로 센다.
    const runByUser = new Map(runsForDay.map((r) => [r.user_id, r]));
    const issues: JobIssue[] = [];
    let eligible = 0;
    let ok = 0;
    let pendingReset = 0;
    for (const p of profiles) {
      const who = p.nickname || p.user_id.slice(0, 8);
      if (validateInterestedJobRoles(p.interested_job_roles) === null) {
        // 관심 직무를 아예 안 고른 회원은 legacy 전환자가 아니라 온보딩 미완이므로 대상이 아니다.
        if ((p.interested_job_roles ?? []).length > 0) pendingReset += 1;
        continue;
      }
      eligible += 1;
      const run = runByUser.get(p.user_id);
      if (!run) { issues.push({ who, kind: "미수집", detail: "실행 기록 없음" }); continue; }
      if (run.status === "failed") { issues.push({ who, kind: "실패", detail: "0건" }); continue; }
      // 예약 시각(10:10) 전에 확정된 배치 = 크론이 만든 게 아니다. 그날 크론은 이 행 때문에
      // guard에 걸려 스킵했다는 뜻이라, 건수가 4건이어도 "정상"으로 볼 수 없다.
      if (run.generated_at && isBeforeDailyGenerationTime(run.generated_at)) {
        issues.push({ who, kind: "예약 전 생성", detail: toKSTTimeLabel(run.generated_at) });
        continue;
      }
      if (run.status === "partial" || run.job_count < DAILY_JOB_LIMIT) {
        issues.push({ who, kind: "미달", detail: `${run.job_count}건` });
        continue;
      }
      ok += 1;
    }

    // 그날 saved_job 행을 신규/재추천으로 가른다. 행이 없으면 null(판정 불가)로 둔다.
    const savedForDay = savedJobs.filter((r) => r.job_date === date);
    const jobsFresh = savedForDay.length === 0 ? null : savedForDay.filter((r) => r.first_recommended_date === date).length;
    const jobsReserved = savedForDay.length === 0 ? null : savedForDay.length - (jobsFresh ?? 0);

    const problems: string[] = [];
    if (news !== null && news.length < MAX_SELECTED) problems.push(`뉴스 ${news.length}건 (목표 ${MAX_SELECTED}건)`);
    if (duplicates > 0) problems.push(`뉴스에 같은 내용 중복 ${duplicates}건`);
    if (failed > 0) problems.push(`채용 수집 실패 ${failed}명`);
    if (partial > 0) problems.push(`채용 ${DAILY_JOB_LIMIT}건 미달 ${partial}명`);
    // 전부 재추천이면 그날 신규 후보가 하나도 없었다는 뜻이다 — 버그는 아니지만 계속 이러면
    // 수집(검색 폭·필터)을 봐야 한다. 판단 근거로 화면에 남긴다.
    if (jobsFresh === 0 && (jobsReserved ?? 0) > 0) problems.push(`채용 신규 0건 (전부 과거 재추천 ${jobsReserved}건)`);
    // 예약 전 생성은 위 failed/partial 집계에 안 잡힌다(상태는 success다) — 별도로 남긴다.
    const early = issues.filter((i) => i.kind === "예약 전 생성").length;
    if (early > 0) problems.push(`채용 예약 전 생성 ${early}명 (아침 크론이 스킵됨)`);
    const uncollected = issues.filter((i) => i.kind === "미수집").length;
    if (uncollected > 0) problems.push(`채용 미수집 ${uncollected}명`);

    return {
      newsStored: news === null ? null : news.length,
      newsDuplicates: duplicates,
      jobsFailedUsers: failed,
      jobsPartialUsers: partial,
      jobsFresh,
      jobsReserved,
      jobsEligible: eligible,
      jobsOk: ok,
      jobsPendingReset: pendingReset,
      jobIssues: issues.slice(0, JOB_ISSUE_MAX),
      jobIssuesOmitted: Math.max(0, issues.length - JOB_ISSUE_MAX),
      problems,
    };
  }

  const days: DayStatus[] = dates.map((date) => {
    const dayRuns = runsByDate.get(date) ?? [];
    const cronRun = dayRuns.find((r) => r.trigger_source === "vercel_cron");
    const fallbackRun = dayRuns.find((r) => r.trigger_source === "fallback");
    // "지금 업데이트"(retryBriefing)가 남기는 실행. 아래 newsStats가 이걸 최우선으로 읽는다.
    const manualRun = dayRuns.find((r) => r.trigger_source === "manual");
    // cron/route.ts와 get-briefing.ts(fallback)가 실제 생성 건수를 서로 다른 필드명(news vs
    // newsCount)에 담는다. 그날 이미 fallback이 먼저 생성해서(브리핑 존재) cron이 스킵하면
    // cronRun.details.news엔 숫자가 아니라 문자열 "already-generated"이 들어오는데, 예전엔 이게
    // `??`에서 "값이 있다"고 판정돼 fallbackRun의 진짜 건수(newsCount)로 안 넘어갔다 — 그래서
    // 실제로는 정상 생성됐는데도 관리자 페이지에 건수 없이 "정상"만 뜨는 날이 있었다.
    const cronNews = cronRun?.details?.news;
    const news = typeof cronNews === "number" ? cronNews : fallbackRun?.details?.newsCount;

    const outcome = outcomeFor(date);
    return {
      date,
      label: deriveLabel(cronRun, fallbackRun, outcome),
      cronStartedAt: cronRun?.started_at ?? null,
      cronFinishedAt: cronRun?.finished_at ?? null,
      fallbackAt: fallbackRun?.started_at ?? null,
      finalGeneratedAt: finalGeneratedByDate.get(date) ?? null,
      newsOk: cronRun ? cronRun.status === "success" : fallbackRun ? fallbackRun.status === "success" : null,
      newsCount: typeof news === "number" ? news : null,
      newsSkipped: cronRun?.details?.news === "already-generated",
      // fallback 경로(개별 회원 1명 처리)는 전체 회원 커버리지 개념이 없어 cronRun에서만 읽는다.
      // 이 필드가 생기기 전 과거 cron_runs 기록은 undefined이므로 자연히 null로 표시된다.
      newsMemberTotal: cronRun?.details?.newsMemberTotal ?? null,
      newsMemberCovered: cronRun?.details?.newsMemberCovered ?? null,
      aiTrendOk: cronRun?.details?.aiTrendOk ?? fallbackRun?.details?.aiTrendOk ?? null,
      // jobUsers는 cron의 자기 보고다 — 화면에서는 outcome.jobsEligible(실제 프로필로 다시 센 값)을
      // 분모로 쓰고, 이 값은 과거 기록 호환을 위해서만 남긴다.
      jobUsers: cronRun?.details?.jobUsers ?? null,
      jobFailures: cronRun?.details?.jobFailures ?? null,
      jobsOverwritten: cronRun?.details?.jobsOverwritten ?? null,
      // 🔴 **manual을 가장 먼저 본다.** "지금 업데이트"는 결과를 확인하려고 누르는 버튼인데,
      // 예전엔 이 줄이 cron/fallback만 읽어서 몇 번을 다시 돌려도 화면은 **아침 크론 수치**를
      // 그대로 보여줬다(2026-08-30: 파이프라인 상수를 바꿔가며 검증하는 내내 "후보 18건"이
      // 안 변해서 수정이 안 먹는 줄 알았는데, 그 수치가 새 실행의 것이 아니었다).
      // dayRuns는 started_at 내림차순이라 find가 곧 "그날의 가장 최근 manual 실행"이다.
      newsStats: manualRun?.details?.newsStats ?? cronRun?.details?.newsStats ?? fallbackRun?.details?.newsStats ?? null,
      errorMessage: cronRun?.error_message ?? fallbackRun?.error_message ?? null,
      outcome,
    };
  });

  return { ok: true, days, fetchedAt: new Date().toISOString() };
}
