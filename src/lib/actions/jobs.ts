"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { isAdminEmail } from "@/lib/auth/admin";
import { getJobsForUser, getRecentJobs, type JobsView, type SavedJobRow } from "@/lib/jobs/get-jobs";
import { clearCandidateCacheFor, resetCollectErrors, takeCollectErrors } from "@/lib/jobs/generate";
import { validatePriorityOrder } from "@/lib/jobs/roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";
import { peekManualRefreshAvailable, recordManualRefreshSuccess } from "./manual-refresh-limit";

// 대시보드 SSR을 막지 않기 위해 Job Description은 페이지 로드 후 클라이언트에서 이 액션으로 따로
// 조회한다 — getJobsForUser 자체(캐시/fallback 생성/일일 실행 기록 정책)는 그대로 재사용한다.
// roles는 jobRolePriority(우선순위 순서)를 그대로 받는다 — canonical 재정렬 없이 quota에 그대로 쓰인다.
export async function getJobsView(roles: string[]): Promise<JobsView> {
  const user = await requireUser();
  const supabase = await createClient();
  const priorityRoles = validatePriorityOrder(roles) ?? [];
  return getJobsForUser(supabase, user.id, priorityRoles);
}

// "최근 추천" 탭 — 처음 진입 시 필요 없으므로 탭을 열 때만 지연 조회한다.
// excludeUrls는 현재 "추천 공고" 탭에 떠 있는 정확한 4개 URL(jobs.jobs.map(j => j.url))을 그대로 넘겨받는다.
export async function getJobsRecentView(excludeUrls: string[]): Promise<SavedJobRow[]> {
  const user = await requireUser();
  const supabase = await createClient();
  return getRecentJobs(supabase, user.id, excludeUrls);
}

// 채용공고 "지금 업데이트" 전용 — KST 11:30(MANUAL_REFRESH_MIN) 이후 오늘 정상 4건이 없을 때만
// 노출되는 조건부 복구 버튼이다.
// assembleDailyJobs는 오늘 daily_jobs_run 행이 있으면(success든 processing이든 partial/failed든) 자동
// 경로에서는 재수집을 건너뛴다 — "지금 업데이트"는 그 guard를 사용자가 명시적으로 우회하는 유일한 경로라
// 먼저 오늘 행을 지우고 처음부터 다시 시도한다. Tavily 수집 + 상세 파싱이 매번 도는 비용성 동작이라
// 하루 상한(manual-refresh-limit.ts)을 걸고, 성공(오늘 batch가 실제로 확정됐을 때)에만 횟수를 차감한다.
export async function retryJobs(roles: string[]): Promise<{ error: string } | { ok: true; view: JobsView }> {
  const user = await requireUser();
  const supabase = await createClient();
  const priorityRoles = validatePriorityOrder(roles) ?? [];
  const today = todayKSTDateString();
  // 관리자 계정은 하루 상한도, "이미 오늘 완료" 차단도 받지 않는다(briefing 쪽과 같은 이유).
  const unlimited = isAdminEmail(user.email);
  return withRetryGuard(`jobs:${user.id}`, async () => {
    const admin = createAdminClient();
    const gate = await peekManualRefreshAvailable(admin, user.id, "jobs", today, unlimited);
    if (!gate.ok) return { error: gate.error };

    const { data: current } = await admin.from("daily_jobs_run").select("status").eq("user_id", user.id).eq("job_date", today).maybeSingle();
    // 수집 중 차단은 관리자도 그대로 받는다 — 상한이 아니라 동시 실행 방지라 우회하면 안 된다.
    if (current?.status === "processing") return { error: "지금 채용공고를 수집하는 중입니다. 잠시 후 다시 시도해주세요." };
    if (current?.status === "success" && !unlimited) return { error: "이미 오늘 채용공고 수집이 완료되었습니다." };

    await admin.from("daily_jobs_run").delete().eq("user_id", user.id).eq("job_date", today);
    // DB 행만 지우면 안 된다 — generate.ts의 candidateCache가 같은 인스턴스에 살아 있으면 아까와
    // 똑같은 후보를 그대로 돌려줘서 재수집 결과가 하나도 안 바뀐다("지금 업데이트"가 무반응인 원인).
    clearCandidateCacheFor(today);
    resetCollectErrors();
    let view: JobsView;
    try {
      // force: 사용자가 직접 누른 경로라 자동 생성 시각(KST 10:10) 게이트를 우회한다.
      view = await getJobsForUser(supabase, user.id, priorityRoles, { force: true });
    } catch (e) {
      // 실패했을 땐 오늘 사용 횟수를 기록하지 않는다 — 사용자가 다시 시도할 수 있어야 한다.
      return { error: e instanceof Error ? e.message : "업데이트에 실패했습니다. 잠시 후 다시 시도해주세요." };
    }
    // 정상 완료 = 오늘 배치가 실제로 확정됐을 때다. 한 건도 못 건져 과거 batch를 그대로 보여주는
    // 상태(stale)면 실패로 보고 오늘 사용 횟수를 차감하지 않는다.
    // partial(1~3건)은 이제 실패가 아니다 — 그 결과가 실제로 저장되고 화면에도 뜨기 때문이다.
    // 목표치에 못 미친 건 view.incomplete로 남아 재시도 버튼이 계속 보인다.
    if (view.stale) {
      // 원인이 메일과 서버 로그에만 남아 있으면 사용자는 "실패했다"만 보고 다시 누르는 것 말고 할 게
      // 없다 — 사용자가 직접 누른 경로에서만 실제 사유를 같이 보여준다.
      // (세 소스가 전부 tavilySearch를 탄다고 적어뒀던 건 틀렸다. 원티드만 Tavily고 점핏은 자체 API,
      //  잡코리아는 자체 크롤이라 경로가 셋 다 다르다.)
      const why = takeCollectErrors();
      return { error: why.length ? `채용공고 수집에 실패했습니다 — ${why.join(" / ")}` : "채용공고 수집에 실패했습니다. 수집은 돌았지만 조건에 맞는 공고를 한 건도 못 찾았습니다." };
    }
    await recordManualRefreshSuccess(admin, user.id, "jobs", today, unlimited);
    return { ok: true as const, view };
  });
}
