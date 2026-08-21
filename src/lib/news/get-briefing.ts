import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBriefingFor, briefingExistsForToday, backfillMissingBriefingRows } from "./generate";
import { todayKSTDateString, recentKSTDateStrings, isPastDailyGenerationTime } from "./kst";
import { recordRunStart, recordRunEnd, isRunInFlight } from "@/lib/cron-runs";
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

type BriefingRow = {
  selected_news: SelectedNewsItem[] | null;
  trend_brief: TrendBriefResult | null;
  generated_at: string | null;
  briefing_date: string;
};

function toView(row: BriefingRow, stale: boolean, pending: boolean): BriefingView {
  return {
    selectedNews: row.selected_news ?? [],
    trendBrief: row.trend_brief ?? null,
    generatedAt: row.generated_at,
    briefingDate: row.briefing_date,
    stale,
    pending,
  };
}

async function readTodayRow(supabase: SupabaseClient, userId: string, today: string) {
  const { data } = await supabase
    .from("briefing")
    .select(FIELDS)
    .eq("user_id", userId)
    .eq("briefing_date", today)
    .maybeSingle();
  return (data as BriefingRow | null) ?? null;
}

// 1순위: 오늘 내 briefing 재사용 → 2순위: 오늘자 콘텐츠가 이미 있으면 그걸 내 행으로 백필 →
// 3순위: 아직 없고 생성 중도 아니면 직접 생성 → 4순위: 그것도 안 되면 최근 briefing (4.2.1절)
export async function getTodayBriefing(supabase: SupabaseClient, userId: string): Promise<BriefingView> {
  const today = todayKSTDateString();

  const todayRow = await readTodayRow(supabase, userId, today);
  if (todayRow) return toView(todayRow, false, false);

  // 예약 생성 시각(KST 10:10) 전에는 최초 접속 fallback도 생성하지 않는다 — 자정 직후 접속만으로
  // 바로 생성돼버리면 cron 시각을 옮긴 의미가 없어진다. 그 전까지는 어제 결과를 stale로 보여준다.
  const pastGenerationTime = isPastDailyGenerationTime();
  if (pastGenerationTime) {
    // 뉴스는 전 회원 공유 콘텐츠다(크론은 한 payload를 전원에게 뿌린다). 그런데 이 fallback은
    // generateBriefingFor([userId])로 "자기 것만" 만들어서, 두 회원이 거의 동시에 접속하면 각자
    // 독립 생성을 돌려 같은 날 서로 다른 뉴스를 보게 됐다 — 게다가 skipDedup=false라 두 번째 실행은
    // 첫 실행이 방금 source_article에 넣은 기사를 중복으로 걸러내 더 낮은 순위 기사를 받았다.
    // 그래서 생성 전에 두 단계를 먼저 본다: (1) 오늘자 콘텐츠가 이미 있으면 크론의 else 분기와 똑같이
    // 백필로 복사한다, (2) 없지만 다른 요청이 생성 중이면 이번엔 어제 것을 보여주고 물러난다
    // (다음 접속이 (1)에서 오늘 것을 받는다). RSS+Gemini 2콜이 9초 안에 끝날 수 없어서 실제로
    // 관측된 9초 간격 중복은 (2)에서 걸린다.
    try {
      if (await briefingExistsForToday()) {
        await backfillMissingBriefingRows([userId]);
        const copied = await readTodayRow(supabase, userId, today);
        if (copied) return toView(copied, false, false);
      }
    } catch (e) {
      // 백필 실패는 치명적이지 않다 — 아래 생성 경로로 그대로 이어진다(기존 동작).
      console.error("[briefing] 오늘자 콘텐츠 백필 실패", e);
    }

    // 자기 자신의 started 행을 보고 물러나면 아무도 생성하지 않으니 recordRunStart보다 먼저 본다.
    const alreadyGenerating = await isRunInFlight("briefing");
    if (!alreadyGenerating) {
      const runId = await recordRunStart("briefing", "fallback");
      try {
        const result = await generateBriefingFor([userId]);
        await recordRunEnd(runId, "success", { details: { newsCount: result.selectedNews.length, aiTrendOk: result.trendBrief !== null } });
        return {
          selectedNews: result.selectedNews, trendBrief: result.trendBrief,
          generatedAt: new Date().toISOString(), briefingDate: result.briefingDate, stale: false, pending: false,
        };
      } catch (e) {
        await recordRunEnd(runId, "failed", { errorMessage: e instanceof Error ? e.message : String(e) });
        // 생성 실패 — 아래 stale fallback으로 이어진다
      }
    }
  }

  const { data: latestRow } = await supabase
    .from("briefing")
    .select(FIELDS)
    .eq("user_id", userId)
    .order("briefing_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // pastGenerationTime이 false면 생성 시도 자체를 안 한 것(아직 10:10 전)이라 "실패"가 아니다.
  // true인데 여기까지 왔으면 둘 중 하나다 — 생성이 실제로 예외를 냈거나, 다른 요청이 생성 중이라
  // 중복을 피해 물러났거나(둘 다 "어제 것을 stale로 보여준다"로 처리가 같아서 구분하지 않는다.
  // 어느 쪽인지는 cron_runs에 남는다).
  if (latestRow) return toView(latestRow as BriefingRow, true, !pastGenerationTime);
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
