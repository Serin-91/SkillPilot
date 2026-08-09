"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getJobsForUser, type JobsView } from "@/lib/jobs/get-jobs";
import { validateInterestedJobRoles } from "@/lib/jobs/roles";
import { withRetryGuard } from "./retry-guard";

// 채용공고 오류 화면의 [다시 시도] 전용 — getJobsForUser와 완전히 같은 경로를 다시 탄다.
// assembleDailyJobs 내부의 (user_id, job_date) guard 덕분에 이미 오늘 결과가 있으면 즉시 반환된다.
export async function retryJobs(roles: string[]): Promise<{ error: string } | { ok: true; view: JobsView }> {
  const user = await requireUser();
  const supabase = await createClient();
  const validRoles = validateInterestedJobRoles(roles) ?? [];
  return withRetryGuard(`jobs:${user.id}`, async () => {
    const view = await getJobsForUser(supabase, user.id, validRoles);
    return { ok: true as const, view };
  });
}
