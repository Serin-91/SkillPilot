"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getTodayBriefing, type BriefingView } from "@/lib/news/get-briefing";
import { regenerateTrendBriefFor } from "@/lib/news/generate";
import { withRetryGuard } from "./retry-guard";

// 뉴스/AI Trend Briefing 오류 화면의 [다시 시도] 전용.
// - 오늘 뉴스 자체가 없으면(진짜 생성 실패) getTodayBriefing으로 전체를 다시 시도한다.
// - 오늘 뉴스는 이미 있는데 trend_brief만 비어 있으면(트렌드만 실패) 뉴스는 그대로 두고 트렌드만 다시 만든다.
// 둘 다 횟수 개념이 없어 차감할 것도 없다.
export async function retryBriefing(): Promise<{ error: string } | { ok: true; view: BriefingView }> {
  const user = await requireUser();
  const supabase = await createClient();
  return withRetryGuard(`briefing:${user.id}`, async () => {
    const current = await getTodayBriefing(supabase, user.id);
    if (current.generatedAt && !current.trendBrief) {
      try {
        const trendBrief = await regenerateTrendBriefFor(supabase, user.id, current.selectedNews);
        return { ok: true as const, view: { ...current, trendBrief } };
      } catch (e) {
        console.error("[briefing] 트렌드 재시도 실패", e);
        return { ok: true as const, view: current };
      }
    }
    const view = await getTodayBriefing(supabase, user.id);
    return { ok: true as const, view };
  });
}
