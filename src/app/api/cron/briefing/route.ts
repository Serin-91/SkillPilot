import { NextResponse } from "next/server";
import { allProfileUserIds, allProfilesWithRoles, briefingExistsForToday, generateBriefingFor } from "@/lib/news/generate";
import { assembleDailyJobs } from "@/lib/jobs/generate";
import { validateInterestedJobRoles, reconcilePriority } from "@/lib/jobs/roles";
import { todayKSTDateString } from "@/lib/news/kst";
import { recordRunStart, recordRunEnd } from "@/lib/cron-runs";

const JOB_NAME = "briefing";

// 매일 KST 오전 10:10(UTC 01:10) Vercel Cron이 호출.
// scheduled generation = primary, 당일 최초 접속 fallback = secondary. 뉴스/채용 둘 다 같은 원칙이다.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runId = await recordRunStart(JOB_NAME, "vercel_cron");

  try {
    const today = todayKSTDateString();

    let news: string | number = "already-generated";
    let aiTrendOk: boolean | undefined;
    if (!(await briefingExistsForToday())) {
      const userIds = await allProfileUserIds();
      if (userIds.length === 0) {
        news = "no-users";
      } else {
        const result = await generateBriefingFor(userIds);
        news = result.selectedNews.length;
        aiTrendOk = result.trendBrief !== null;
      }
    }

    // 채용공고는 관심 직무별로 개인화되므로 회원 단위로 돈다. assembleDailyJobs가 (user_id, date)
    // guard를 갖고 있어서 이미 오늘 생성된 회원은 즉시 건너뛴다.
    // validateInterestedJobRoles는 canonical 순서로 재정렬하므로 그대로 넘기면 quota가 우선순위를
    // 무시하게 된다 — reconcilePriority로 실제 저장된 순서(job_role_priority)를 복원해서 넘긴다
    // (getProfile이 대시보드 조회 때 하는 것과 같은 방식, get-jobs.ts 101절 계약과 동일하게 맞춘다).
    const profiles = await allProfilesWithRoles();
    const jobRuns = await Promise.allSettled(
      profiles.map((p) => {
        const roles = validateInterestedJobRoles(p.interested_job_roles);
        if (!roles) return Promise.resolve([]); // legacy 전용 등 — cron에서 건드리지 않는다
        const priorityRoles = reconcilePriority(roles, p.job_role_priority);
        return assembleDailyJobs(p.user_id, priorityRoles, today);
      })
    );
    const jobFailures = jobRuns.filter((r) => r.status === "rejected").length;

    await recordRunEnd(runId, "success", { details: { news, aiTrendOk, jobUsers: profiles.length, jobFailures } });
    return NextResponse.json({ status: "ok", news, jobUsers: profiles.length, jobFailures });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
    await recordRunEnd(runId, "failed", { errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
