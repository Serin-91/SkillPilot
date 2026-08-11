"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { isAdminEmail } from "@/lib/auth/admin";
import { todayKSTDateString, recentKSTDateStrings, toKSTDateString } from "@/lib/news/kst";

type RunDetails = { news?: string | number; newsCount?: number; jobUsers?: number; jobFailures?: number; aiTrendOk?: boolean } | null;

type CronRunRow = {
  status: "started" | "success" | "failed";
  trigger_source: "vercel_cron" | "fallback" | "manual";
  error_message: string | null;
  details: RunDetails;
  started_at: string;
  finished_at: string | null;
};

export type DayStatusLabel = "정상" | "일부 실패" | "실패" | "실패 후 복구" | "기록 없음";

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
  aiTrendOk: boolean | null;
  jobUsers: number | null;
  jobFailures: number | null;
  errorMessage: string | null;
};

export type SystemStatusResponse =
  | { ok: true; days: DayStatus[]; fetchedAt: string }
  | { error: string; reason: "forbidden" | "query_failed"; at: string };

// cron 성공(+ 채용 일부 실패 없음) → 정상 / cron 실패했지만 fallback이 살려냄 → 실패 후 복구,
// 운영자는 최종 결과 유무와 별개로 "아침 예약이 실패했었다"는 사실을 반드시 구분해서 봐야 한다 (지침 §7).
function deriveLabel(cronRun: CronRunRow | undefined, fallbackRun: CronRunRow | undefined): DayStatusLabel {
  if (!cronRun && !fallbackRun) return "기록 없음";
  if (cronRun?.status === "success") {
    return (cronRun.details?.jobFailures ?? 0) > 0 ? "일부 실패" : "정상";
  }
  if (fallbackRun?.status === "success") return "실패 후 복구";
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
  let briefRows: { briefing_date: string; generated_at: string }[];
  try {
    const [runsRes, briefRes] = await Promise.all([
      admin
        .from("cron_runs")
        .select("status, trigger_source, error_message, details, started_at, finished_at")
        .eq("job_name", "briefing")
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      admin.from("briefing").select("briefing_date, generated_at").in("briefing_date", dates).order("generated_at", { ascending: true }),
    ]);
    if (runsRes.error) throw runsRes.error;
    if (briefRes.error) throw briefRes.error;
    runs = (runsRes.data ?? []) as CronRunRow[];
    briefRows = (briefRes.data ?? []) as { briefing_date: string; generated_at: string }[];
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

  const days: DayStatus[] = dates.map((date) => {
    const dayRuns = runsByDate.get(date) ?? [];
    const cronRun = dayRuns.find((r) => r.trigger_source === "vercel_cron");
    const fallbackRun = dayRuns.find((r) => r.trigger_source === "fallback");
    const news = cronRun?.details?.news ?? fallbackRun?.details?.newsCount;

    return {
      date,
      label: deriveLabel(cronRun, fallbackRun),
      cronStartedAt: cronRun?.started_at ?? null,
      cronFinishedAt: cronRun?.finished_at ?? null,
      fallbackAt: fallbackRun?.started_at ?? null,
      finalGeneratedAt: finalGeneratedByDate.get(date) ?? null,
      newsOk: cronRun ? cronRun.status === "success" : fallbackRun ? fallbackRun.status === "success" : null,
      newsCount: typeof news === "number" ? news : null,
      newsSkipped: cronRun?.details?.news === "already-generated",
      aiTrendOk: cronRun?.details?.aiTrendOk ?? fallbackRun?.details?.aiTrendOk ?? null,
      jobUsers: cronRun?.details?.jobUsers ?? null,
      jobFailures: cronRun?.details?.jobFailures ?? null,
      errorMessage: cronRun?.error_message ?? fallbackRun?.error_message ?? null,
    };
  });

  return { ok: true, days, fetchedAt: new Date().toISOString() };
}
