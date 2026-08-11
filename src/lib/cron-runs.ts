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
