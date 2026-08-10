"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { type BriefingView } from "@/lib/news/get-briefing";
import { generateBriefingFor } from "@/lib/news/generate";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";
import { consumeManualRefresh } from "./manual-refresh-limit";

// 뉴스/AI Trend Briefing "지금 업데이트" 전용 — 무조건 오늘 행을 지우고 처음부터 다시 만든다.
// 상태를 먼저 확인해서 "비었을 때만" 재생성하는 방식은, 오늘 행에 내용이 있으면(그게 새벽에 잘못
// 생성된 것이든 뭐든) 그대로 통과시켜버려 "지금 업데이트"라는 사용자의 명시적 의도를 못 지킨다.
// RSS 수집 + Gemini 호출이 매번 도는 비용성 동작이라 하루 상한(manual-refresh-limit.ts)을 건다.
export async function retryBriefing(): Promise<{ error: string } | { ok: true; view: BriefingView }> {
  const user = await requireUser();
  return withRetryGuard(`briefing:${user.id}`, async () => {
    const admin = createAdminClient();
    const today = todayKSTDateString();
    const gate = await consumeManualRefresh(admin, user.id, "briefing", today);
    if (!gate.ok) return { error: gate.error };

    await admin.from("briefing").delete().eq("user_id", user.id).eq("briefing_date", today);
    const result = await generateBriefingFor([user.id], true); // skipDedup — 수동 재시도는 최근 사용 URL도 다시 후보로 본다
    return {
      ok: true as const,
      view: {
        selectedNews: result.selectedNews,
        trendBrief: result.trendBrief,
        generatedAt: new Date().toISOString(),
        briefingDate: result.briefingDate,
        stale: false,
      },
    };
  });
}
