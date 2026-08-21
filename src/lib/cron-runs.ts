import { createAdminClient as adminClient } from "@/lib/supabase/admin";

export type TriggerSource = "vercel_cron" | "fallback" | "manual";

// Vercel Cron(vercel_cron)과 최초 접속 fallback(fallback) 양쪽에서 공유 — System Status 화면이
// 같은 날 "10:10 vercel_cron 실패 → 12:30 fallback 성공" 흐름을 구분해서 보여줄 수 있게 한다.
// 기록 자체가 실패해도 실제 생성 동작에는 영향 없게 조용히 삼킨다.
export async function recordRunStart(jobName: string, triggerSource: TriggerSource): Promise<string | null> {
  try {
    const { data, error } = await adminClient()
      .from("cron_runs")
      .insert({ job_name: jobName, status: "started", trigger_source: triggerSource })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (e) {
    console.error("[cron_runs] started 기록 실패", e);
    return null;
  }
}

// 같은 job의 생성이 아직 돌고 있는지 — 비싼 생성 작업(RSS + Gemini 2콜)을 중복으로 돌리지 않기 위한
// in-flight 판정. 두 회원이 거의 동시에 접속하면 각자 "오늘 거 없네" 판단으로 독립 생성을 돌렸다.
// STALE_MS를 넘긴 started 행은 크래시로 finished_at을 못 남긴 것으로 보고 무시한다 — 그러지 않으면
// 한 번의 크래시가 그날 이후 생성을 영구히 막는다.
// ponytail: started 행 조회 기반이라 원자적 락이 아니다(수 ms의 TOCTOU 창이 남는다). 실제 관측된
// 중복은 9초 간격이라 이걸로 잡힌다. 완전히 막아야 하면 jobs의 claimProcessingSlot(daily_jobs_run)처럼
// cron_runs에 run_date 컬럼 + status='started' 부분 유니크 인덱스를 걸고 insert 유니크 위반(23505)으로
// 경쟁을 판정한다.
const IN_FLIGHT_STALE_MS = 10 * 60 * 1000;

export async function isRunInFlight(jobName: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - IN_FLIGHT_STALE_MS).toISOString();
    const { data, error } = await adminClient()
      .from("cron_runs")
      .select("id")
      .eq("job_name", jobName)
      .eq("status", "started")
      .gte("started_at", since)
      .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  } catch (e) {
    // 조회 실패로 뉴스 생성을 막지는 않는다 — fail-open이라 최악이 기존 동작(중복 생성)이다.
    console.error("[cron_runs] in-flight 조회 실패", e);
    return false;
  }
}

export async function recordRunEnd(
  runId: string | null,
  status: "success" | "failed",
  opts: { errorMessage?: string; details?: Record<string, unknown> } = {}
): Promise<void> {
  if (!runId) return;
  try {
    const { error } = await adminClient()
      .from("cron_runs")
      .update({
        status,
        error_message: opts.errorMessage ?? null,
        details: opts.details ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (error) throw error;
  } catch (e) {
    console.error("[cron_runs] 종료 기록 실패", e);
  }
}
