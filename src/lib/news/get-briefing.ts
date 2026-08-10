import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBriefingFor } from "./generate";
import { todayKSTDateString, recentKSTDateStrings, isPastDailyGenerationTime } from "./kst";
import type { SelectedNewsItem } from "./select";
import type { TrendBriefResult } from "./trend-brief";

export type BriefingView = {
  selectedNews: SelectedNewsItem[];
  trendBrief: TrendBriefResult | null;
  generatedAt: string | null;
  briefingDate: string;
  stale: boolean; // 오늘 결과가 아니라 이전 결과를 보여주는 중(이유는 pending으로 구분)
  pending: boolean; // stale인 이유가 "아직 오늘 생성 시각(10:10) 전"일 때만 true — 실제 생성 실패와 구분
};

const FIELDS = "selected_news, trend_brief, generated_at, briefing_date";

// 1순위: 오늘 briefing 재사용 → 2순위: 없으면 즉시 생성 → 3순위: 그것도 실패하면 최근 briefing (4.2.1절)
export async function getTodayBriefing(supabase: SupabaseClient, userId: string): Promise<BriefingView> {
  const today = todayKSTDateString();

  const { data: todayRow } = await supabase
    .from("briefing")
    .select(FIELDS)
    .eq("user_id", userId)
    .eq("briefing_date", today)
    .maybeSingle();

  if (todayRow) {
    return {
      selectedNews: todayRow.selected_news ?? [],
      trendBrief: todayRow.trend_brief ?? null,
      generatedAt: todayRow.generated_at,
      briefingDate: todayRow.briefing_date,
      stale: false,
      pending: false,
    };
  }

  // 예약 생성 시각(KST 10:10) 전에는 최초 접속 fallback도 생성하지 않는다 — 자정 직후 접속만으로
  // 바로 생성돼버리면 cron 시각을 옮긴 의미가 없어진다. 그 전까지는 어제 결과를 stale로 보여준다.
  const pastGenerationTime = isPastDailyGenerationTime();
  if (pastGenerationTime) {
    try {
      const result = await generateBriefingFor([userId]);
      return {
        selectedNews: result.selectedNews, trendBrief: result.trendBrief,
        generatedAt: new Date().toISOString(), briefingDate: result.briefingDate, stale: false, pending: false,
      };
    } catch {
      // 생성 실패 — 아래 stale fallback으로 이어진다
    }
  }

  const { data: latestRow } = await supabase
    .from("briefing")
    .select(FIELDS)
    .eq("user_id", userId)
    .order("briefing_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // pastGenerationTime이 false면 생성 시도 자체를 안 한 것(아직 10:10 전)이라 "실패"가 아니다 —
  // true인데 여기까지 왔으면 위 try에서 실제로 예외가 났다는 뜻.
  if (latestRow) {
    return {
      selectedNews: latestRow.selected_news ?? [],
      trendBrief: latestRow.trend_brief ?? null,
      generatedAt: latestRow.generated_at,
      briefingDate: latestRow.briefing_date,
      stale: true,
      pending: !pastGenerationTime,
    };
  }
  return { selectedNews: [], trendBrief: null, generatedAt: null, briefingDate: today, stale: true, pending: !pastGenerationTime };
}

export type BriefingHistoryDay = { date: string; selectedNews: SelectedNewsItem[] };

// 오늘은 메인에서 이미 보여주므로 제외 — 어제/그저께 중 실제로 생성된 날짜만 돌려준다.
export async function getBriefingHistory(supabase: SupabaseClient, userId: string, days = 2): Promise<BriefingHistoryDay[]> {
  const dates = recentKSTDateStrings(days);
  const { data, error } = await supabase
    .from("briefing")
    .select("selected_news, briefing_date")
    .eq("user_id", userId)
    .in("briefing_date", dates)
    .order("briefing_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({ date: row.briefing_date as string, selectedNews: (row.selected_news ?? []) as SelectedNewsItem[] }));
}
