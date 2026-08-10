"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { getJobsForUser, type JobsView } from "@/lib/jobs/get-jobs";
import { validateInterestedJobRoles } from "@/lib/jobs/roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";

// 채용공고 "지금 업데이트" 전용 — 무조건 오늘자 수집 기록을 지우고 다시 수집한다.
// assembleDailyJobs는 daily_jobs_run에 (user_id, job_date) 행이 있으면 그 안 내용과 무관하게(0건이었든,
// 새벽에 잘못 생성됐든) 그대로 건너뛴다 — "비었을 때만" 지우는 조건부 방식은 내용이 있으면 통과시켜버려
// 사용자가 명시적으로 누른 "지금"이라는 의도를 못 지킨다.
export async function retryJobs(roles: string[]): Promise<{ error: string } | { ok: true; view: JobsView }> {
  const user = await requireUser();
  const supabase = await createClient();
  const validRoles = validateInterestedJobRoles(roles) ?? [];
  const today = todayKSTDateString();
  return withRetryGuard(`jobs:${user.id}`, async () => {
    const admin = createAdminClient();
    await admin.from("daily_jobs_run").delete().eq("user_id", user.id).eq("job_date", today);
    await admin.from("saved_job").delete().eq("user_id", user.id).eq("job_date", today);
    const view = await getJobsForUser(supabase, user.id, validRoles);
    return { ok: true as const, view };
  });
}
