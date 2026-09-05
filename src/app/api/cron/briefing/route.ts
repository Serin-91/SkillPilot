import { NextResponse } from "next/server";
import { allProfileUserIds, allProfilesWithRoles, backfillMissingBriefingRows, briefingExistsForToday, clearPreCronBriefingRows, countTodaysBriefingRows, generateBriefingFor } from "@/lib/news/generate";
import { assembleDailyJobs, clearPreCronBatches } from "@/lib/jobs/generate";
import { validateInterestedJobRoles, reconcilePriority } from "@/lib/jobs/roles";
import { todayKSTDateString, dailyGenerationCutoffISO } from "@/lib/news/kst";
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

    const userIds = await allProfileUserIds();

    // 예약 시각 이전에 만들어진 오늘 briefing(관리자 새벽 테스트 등)은 크론이 갈아엎는다 — 아래
    // briefingExistsForToday()는 generated_at을 안 보므로, 이게 없으면 새벽 행 하나가 그날 콘텐츠를
    // 통째로 차지하고 크론은 backfill로 그걸 전 회원에게 복사한다(clearPreCronBriefingRows 주석의
    // 09-05 실측). 채용 쪽 clearPreCronBatches와 같은 규칙이고, 여기만 빠져 있었다.
    const briefingOverwritten = await clearPreCronBriefingRows(today, dailyGenerationCutoffISO());

    let news: string | number = "already-generated";
    let aiTrendOk: boolean | undefined;
    // 뉴스 파싱 기록(단계별 통과/탈락) — 이번 실행에서 실제로 생성했을 때만 값이 있다.
    // 이미 생성돼 있어 스킵한 날은 undefined로 남고 관리자 페이지가 "-"로 표시한다.
    let newsStats: Awaited<ReturnType<typeof generateBriefingFor>>["newsStats"] | undefined;
    if (!(await briefingExistsForToday())) {
      if (userIds.length === 0) {
        news = "no-users";
      } else {
        const result = await generateBriefingFor(userIds);
        news = result.selectedNews.length;
        aiTrendOk = result.trendBrief !== null;
        newsStats = result.newsStats;
      }
    } else {
      // 버그: 이 분기는 "오늘자 콘텐츠가 이미 있다"는 뜻일 뿐인데, 예전엔 여기서 전 회원 삽입을
      // 통째로 건너뛰었다 — 크론(10:10)보다 먼저 누군가 개별 접속으로 fallback을 트리거해 자기
      // 행 하나만 먼저 만들어두면, 그날은 그 한 명만 briefing 행을 갖고 나머지 전원은 히스토리가
      // 통째로 빈 채 넘어갔다(cron_runs엔 "성공"으로 남아 원인을 못 찾았다). 콘텐츠는 새로 만들지
      // 않되, 아직 오늘자 행이 없는 회원에게는 그대로 백필한다.
      await backfillMissingBriefingRows(userIds);
    }
    // 관리자 페이지 "N건/M명" 표시용 — 전체 회원 수 대비 오늘 실제로 briefing 행을 받은 회원 수.
    // status만 보면 "정상 스킵"과 "정상 전원 생성"을 구분 못 해 이번 버그가 숨어 있었다(위 주석) —
    // 숫자로 남겨두면 같은 종류의 회귀를 다음엔 관리자 페이지에서 바로 알아챌 수 있다.
    const newsMemberTotal = userIds.length;
    const newsMemberCovered = await countTodaysBriefingRows();

    // 채용공고는 관심 직무별로 개인화되므로 회원 단위로 돈다. assembleDailyJobs가 (user_id, date)
    // guard를 갖고 있어서 이미 오늘 생성된 회원은 즉시 건너뛴다.
    // validateInterestedJobRoles는 canonical 순서로 재정렬하므로 그대로 넘기면 quota가 우선순위를
    // 무시하게 된다 — reconcilePriority로 실제 저장된 순서(job_role_priority)를 복원해서 넘긴다
    // (getProfile이 대시보드 조회 때 하는 것과 같은 방식, get-jobs.ts 101절 계약과 동일하게 맞춘다).
    const profiles = await allProfilesWithRoles();

    // 예약 시각 이전에 만들어진 오늘 배치(관리자 새벽 테스트 등)는 크론이 갈아엎는다 — 이게 없으면
    // 그 배치가 오늘 success 행이라 아래 assembleDailyJobs가 전원 스킵한다. clearPreCronBatches 주석 참고.
    const jobsOverwritten = await clearPreCronBatches(today, dailyGenerationCutoffISO());

    // legacy 직무 전용 프로필은 대상이 아니다 — 화면에 "직무 재설정 필요" 안내가 이미 떠 있고
    // 사용자가 재설정할 때까지 수집할 근거가 없다(Dashboard.tsx hasLegacyRoles 3곳).
    // 예전엔 이걸 profiles.length에 섞어 "사용자 5명 / 실패 0명"으로 보고했는데, 그러면 실제 대상이
    // 2명뿐인 날도 5명 전원 정상으로 읽힌다 — 관리자 페이지가 볼 수 있는 분모를 나눠서 남긴다.
    const eligible = profiles.filter((p) => validateInterestedJobRoles(p.interested_job_roles) !== null);
    const jobsPending = profiles.length - eligible.length;

    const jobRuns = await Promise.allSettled(
      eligible.map((p) => {
        const roles = validateInterestedJobRoles(p.interested_job_roles)!;
        const priorityRoles = reconcilePriority(roles, p.job_role_priority);
        return assembleDailyJobs(p.user_id, priorityRoles, today);
      })
    );
    const jobFailures = jobRuns.filter((r) => r.status === "rejected").length;

    const jobSummary = { jobUsers: eligible.length, jobFailures, jobsPending, jobsOverwritten };
    await recordRunEnd(runId, "success", {
      details: { news, aiTrendOk, newsMemberTotal, newsMemberCovered, briefingOverwritten, newsStats, ...jobSummary },
    });
    return NextResponse.json({ status: "ok", news, newsMemberTotal, newsMemberCovered, briefingOverwritten, ...jobSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
    await recordRunEnd(runId, "failed", { errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
