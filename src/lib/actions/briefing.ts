"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { isAdminEmail } from "@/lib/auth/admin";
import { getTodayBriefing, type BriefingView } from "@/lib/news/get-briefing";
import { generateBriefingFor } from "@/lib/news/generate";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";
import { recordRunStart, recordRunEnd } from "@/lib/cron-runs";
import { peekManualRefreshAvailable, recordManualRefreshSuccess } from "./manual-refresh-limit";

// 대시보드 SSR을 막지 않기 위해 News/AI Trend Briefing은 페이지 로드 후 클라이언트에서 이 액션으로
// 따로 조회한다 — getTodayBriefing 자체(캐시/fallback 생성 정책)는 그대로 재사용, 새로 만들지 않는다.
export async function getBriefingView(): Promise<BriefingView> {
  const user = await requireUser();
  const supabase = await createClient();
  return getTodayBriefing(supabase, user.id);
}

// 뉴스/AI Trend Briefing "지금 업데이트" 전용 — 무조건 오늘 행을 지우고 처음부터 다시 만든다.
// 상태를 먼저 확인해서 "비었을 때만" 재생성하는 방식은, 오늘 행에 내용이 있으면(그게 새벽에 잘못
// 생성된 것이든 뭐든) 그대로 통과시켜버려 "지금 업데이트"라는 사용자의 명시적 의도를 못 지킨다.
// RSS 수집 + Gemini 호출이 매번 도는 비용성 동작이라 하루 상한(manual-refresh-limit.ts)을 건다.
export async function retryBriefing(): Promise<{ error: string } | { ok: true; view: BriefingView }> {
  const user = await requireUser();
  // 관리자 계정은 하루 상한을 받지 않는다 — 운영 중 결과를 여러 번 돌려봐야 검증이 된다.
  const unlimited = isAdminEmail(user.email);
  return withRetryGuard(`briefing:${user.id}`, async () => {
    const admin = createAdminClient();
    const today = todayKSTDateString();
    const gate = await peekManualRefreshAvailable(admin, user.id, "briefing", today, unlimited);
    if (!gate.ok) return { error: gate.error };

    await admin.from("briefing").delete().eq("user_id", user.id).eq("briefing_date", today);
    // 🔴🔴 "지금 업데이트"도 **실행 기록을 남긴다**(2026-08-30). 예전엔 안 남겼고, 그게
    // 관리자 패널을 조용히 거짓말하게 만들었다: 패널의 뉴스 파싱 수치는
    // `cron_runs.details.newsStats`를 읽는데(admin-status.ts) 그걸 **크론만** 썼다.
    // 그래서 수동으로 몇 번을 다시 돌려도 화면은 **아침 크론 값을 그대로** 보여줬고,
    // 파이프라인 상수를 바꿔가며 검증하는 내내 "후보 18건"이 안 변해서 수정이 안 먹는 줄 알았다
    // (실제로는 그 수치가 새 실행의 것이 아니었다). 검증 수단이 검증 대상을 안 보고 있었다.
    // 👉 "지금 업데이트"는 결과를 확인하려고 누르는 버튼이다. 그 버튼이 자기가 한 일을
    //    기록하지 않으면 확인 자체가 불가능하다.
    const runId = await recordRunStart("briefing", "manual");
    let result;
    try {
      result = await generateBriefingFor([user.id], true); // skipDedup — 수동 재시도는 최근 사용 URL도 다시 후보로 본다
    } catch (e) {
      const msg = e instanceof Error ? e.message : "업데이트에 실패했습니다. 잠시 후 다시 시도해주세요.";
      await recordRunEnd(runId, "failed", { errorMessage: msg });
      // 실패했을 땐 오늘 사용 횟수를 기록하지 않는다 — 사용자가 다시 시도할 수 있어야 한다.
      return { error: msg };
    }
    await recordRunEnd(runId, "success", { details: { newsStats: result.newsStats } });
    await recordManualRefreshSuccess(admin, user.id, "briefing", today, unlimited);
    return {
      ok: true as const,
      view: {
        selectedNews: result.selectedNews,
        trendBrief: result.trendBrief,
        generatedAt: new Date().toISOString(),
        briefingDate: result.briefingDate,
        stale: false,
        pending: false,
      },
    };
  });
}
