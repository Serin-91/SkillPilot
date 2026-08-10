"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { getJobsForUser, type JobsView } from "@/lib/jobs/get-jobs";
import { validateInterestedJobRoles } from "@/lib/jobs/roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";

// 채용공고 "지금 업데이트" 전용.
// assembleDailyJobs는 daily_jobs_run에 (user_id, job_date) 행이 있으면 결과가 0건이었어도 그대로
// 건너뛴다 — 오늘 수집이 실패해 비어 있는 채 끝났다면 그 기록을 지우고 강제로 다시 수집한다.
export async function retryJobs(roles: string[]): Promise<{ error: string } | { ok: true; view: JobsView }> {
  const user = await requireUser();
  const supabase = await createClient();
  const validRoles = validateInterestedJobRoles(roles) ?? [];
  return withRetryGuard(`jobs:${user.id}`, async () => {
    const current = await getJobsForUser(supabase, user.id, validRoles);
    if (current.jobs.length === 0) {
      const admin = createAdminClient();
      await admin.from("daily_jobs_run").delete().eq("user_id", user.id).eq("job_date", todayKSTDateString());
    }
    const view = await getJobsForUser(supabase, user.id, validRoles);
    return { ok: true as const, view };
  });
}
