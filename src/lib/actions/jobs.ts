"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { getJobsForUser, getRecentJobs, type JobsView, type SavedJobRow } from "@/lib/jobs/get-jobs";
import { validateInterestedJobRoles } from "@/lib/jobs/roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";
import { peekManualRefreshAvailable, recordManualRefreshSuccess } from "./manual-refresh-limit";

// 대시보드 SSR을 막지 않기 위해 Job Description은 페이지 로드 후 클라이언트에서 이 액션으로 따로
// 조회한다 — getJobsForUser 자체(캐시/fallback 생성/일일 실행 기록 정책)는 그대로 재사용한다.
export async function getJobsView(roles: string[]): Promise<JobsView> {
  const user = await requireUser();
  const supabase = await createClient();
  const validRoles = validateInterestedJobRoles(roles) ?? [];
  return getJobsForUser(supabase, user.id, validRoles);
}

// "최근 추천" 탭 — 처음 진입 시 필요 없으므로 탭을 열 때만 지연 조회한다.
// excludeUrls는 현재 "추천 공고" 탭에 떠 있는 정확한 4개 URL(jobs.jobs.map(j => j.url))을 그대로 넘겨받는다.
export async function getJobsRecentView(excludeUrls: string[]): Promise<SavedJobRow[]> {
  const user = await requireUser();
  const supabase = await createClient();
  return getRecentJobs(supabase, user.id, excludeUrls);
}

// 채용공고 "지금 업데이트" 전용 — KST 11:01 이후 오늘 정상 4건이 없을 때만 노출되는 조건부 복구 버튼이다.
// assembleDailyJobs는 오늘 daily_jobs_run 행이 있으면(success든 processing이든 partial/failed든) 자동
// 경로에서는 재수집을 건너뛴다 — "지금 업데이트"는 그 guard를 사용자가 명시적으로 우회하는 유일한 경로라
// 먼저 오늘 행을 지우고 처음부터 다시 시도한다. Tavily 수집 + 상세 파싱이 매번 도는 비용성 동작이라
// 하루 상한(manual-refresh-limit.ts)을 걸고, 성공(오늘 batch가 실제로 확정됐을 때)에만 횟수를 차감한다.
export async function retryJobs(roles: string[]): Promise<{ error: string } | { ok: true; view: JobsView }> {
  const user = await requireUser();
  const supabase = await createClient();
  const validRoles = validateInterestedJobRoles(roles) ?? [];
  const today = todayKSTDateString();
  return withRetryGuard(`jobs:${user.id}`, async () => {
    const admin = createAdminClient();
    const gate = await peekManualRefreshAvailable(admin, user.id, "jobs", today);
    if (!gate.ok) return { error: gate.error };

    const { data: current } = await admin.from("daily_jobs_run").select("status").eq("user_id", user.id).eq("job_date", today).maybeSingle();
    if (current?.status === "processing") return { error: "지금 채용공고를 수집하는 중입니다. 잠시 후 다시 시도해주세요." };
    if (current?.status === "success") return { error: "이미 오늘 채용공고 수집이 완료되었습니다." };

    await admin.from("daily_jobs_run").delete().eq("user_id", user.id).eq("job_date", today);
    let view: JobsView;
    try {
      view = await getJobsForUser(supabase, user.id, validRoles);
    } catch (e) {
      // 실패했을 땐 오늘 사용 횟수를 기록하지 않는다 — 사용자가 다시 시도할 수 있어야 한다.
      return { error: e instanceof Error ? e.message : "업데이트에 실패했습니다. 잠시 후 다시 시도해주세요." };
    }
    // 정상 완료 = 오늘(jobDate===today) 배치가 실제로 확정됐을 때뿐이다. partial/failed로 끝나
    // stale(과거 batch를 그대로 보여주는 상태)이면 실패로 취급한다.
    if (view.stale) return { error: "채용공고 수집에 실패했습니다. 잠시 후 다시 시도해주세요." };
    await recordManualRefreshSuccess(admin, user.id, "jobs", today);
    return { ok: true as const, view };
  });
}
