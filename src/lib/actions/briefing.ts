"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { getTodayBriefing, type BriefingView } from "@/lib/news/get-briefing";
import { regenerateTrendBriefFor, generateBriefingFor } from "@/lib/news/generate";
import { todayKSTDateString } from "@/lib/news/kst";
import { withRetryGuard } from "./retry-guard";

// 뉴스/AI Trend Briefing "지금 업데이트" 전용.
// - 오늘 결과가 비었거나(생성 실패로 빈 값만 저장됨) 어제 결과(stale)를 보고 있으면, 오늘 행을 지우고
//   완전히 다시 생성한다 — getTodayBriefing만 다시 부르면 "오늘 이미 있음" 캐시에 걸려 그대로 반환되고 끝난다.
// - 뉴스는 이미 있는데 트렌드 분석만 비어 있으면 뉴스는 그대로 두고 트렌드만 다시 만든다(더 가벼운 부분 재시도).
// 둘 다 횟수 개념이 없어 차감할 것도 없다.
export async function retryBriefing(): Promise<{ error: string } | { ok: true; view: BriefingView }> {
  const user = await requireUser();
  const supabase = await createClient();
  return withRetryGuard(`briefing:${user.id}`, async () => {
    const current = await getTodayBriefing(supabase, user.id);

    if (current.stale || current.selectedNews.length === 0) {
      const admin = createAdminClient();
      await admin.from("briefing").delete().eq("user_id", user.id).eq("briefing_date", todayKSTDateString());
      const result = await generateBriefingFor([user.id]);
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
    }

    if (!current.trendBrief) {
      try {
        const trendBrief = await regenerateTrendBriefFor(supabase, user.id, current.selectedNews);
        return { ok: true as const, view: { ...current, trendBrief } };
      } catch (e) {
        console.error("[briefing] 트렌드 재시도 실패", e);
        return { ok: true as const, view: current };
      }
    }

    return { ok: true as const, view: current };
  });
}
