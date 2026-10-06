import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBriefingFor, briefingExistsForToday, backfillMissingBriefingRows, runStatusFor } from "./generate";
import { todayKSTDateString, recentKSTDateStrings, isPastDailyGenerationTime, isPastManualRefreshWindow } from "./kst";
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

// 🔴 2026-09-03 — `trend_brief.dev_input`은 **그날 Gemini가 받은 dev 입력의 재현용 스냅샷**이다
// (generate.ts의 withDevInput 주석에 이유가 있다). 화면에는 필요 없고, 두면 대시보드를 열 때마다
// 실측 5KB가 클라이언트 payload에 실려 내려간다 — 여기서 벗겨서 **화면 동작과 payload를 무변경으로 둔다.**
// 옛 행에는 이 필드가 없으므로 그때는 아무 일도 하지 않는다(하위 호환).
// export는 검증이 **화면이 실제로 쓰는 이 함수**를 직접 돌려보기 위한 것이다.
export function stripDevInput(brief: TrendBriefResult | null): TrendBriefResult | null {
  if (!brief || !("dev_input" in brief)) return brief ?? null;
  const { dev_input: _snapshot, ...rest } = brief as TrendBriefResult & { dev_input?: unknown };
  void _snapshot;
  return rest;
}

function toView(row: BriefingRow, stale: boolean, pending: boolean): BriefingView {
  return {
    selectedNews: row.selected_news ?? [],
    trendBrief: stripDevInput(row.trend_brief),
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

    // 🔴🔴 2026-09-08 — **이 생성은 크론이 "늦은" 동안이 아니라 "실패했을 때만" 돌아야 한다.**
    //
    // 신고: "처음에 뉴스랑 채용공고 불러오는 시간이 너무 긴데". 원인은 이 줄이 렌더 경로에서
    // RSS + Gemini를 **동기로** 돌기 때문이고, 실제 소요는 추측이 아니라 cron_runs에 남아 있다
    // (2026-09-08 실측): 11.8s / 23.4s / 31.6s / 65.8s / **107.2s**.
    //
    // 그런데 그 대기가 생기는 구간은 "크론이 실패한 날"이 아니라 **매일 오는 28분 창**이었다:
    //     fallback 게이트 열림   10:10 (CRON_SCHEDULED_MIN)
    //     크론 실제 발화         10:38 (Hobby 플랜은 예약 +최대 1시간, 실측 매일 01:38Z)
    //   → 그 사이 첫 접속자가 크론이 곧 만들 것을 **혼자 다시 만들면서** 30~107초를 기다린다.
    //     실측 증거: 09-08 01:15Z `trigger_source=fallback` 31.6s 행이 그 사람이다.
    //
    // 👉 그래서 생성만 **11:30**으로 미룬다. 이 파일이 새 숫자를 만드는 게 아니라, kst.ts가 이미
    //    "예약 + Hobby 지연 상한 + 생성 소요 = 최악 완료 11:15"에 15분 여유를 두고 정해둔
    //    `MANUAL_REFRESH_MIN`을 그대로 재사용한다. 그 시각을 넘겼는데도 오늘 것이 없으면
    //    그때는 크론이 **진짜 실패한** 것이고, 그 판정이 이 상수의 원래 정의다.
    // ⚠️ 위 백필(briefingExistsForToday → 복사)은 **10:10 게이트에 그대로 둔다.** 그건 이미 만들어진
    //    행을 복사하는 값싼 경로라 미룰 이유가 없다. 미루는 것은 비싼 생성 하나뿐이다.
    // ⚠️ `pending` 플래그도 10:10 기준(`pastGenerationTime`)을 그대로 쓴다 — "아직 생성 시각 전"이라는
    //    표시의 뜻이 바뀌면 안 된다. 10:10~11:30에는 어제 것을 stale로 보여주고, 10:38에 크론이
    //    오늘 것을 만들면 다음 접속이 위 백필에서 즉시 받는다.
    // 💀 "지금 업데이트" 버튼은 이 경로가 아니라 별도 수동 트리거다 — 사용자가 스스로 기다리기를
    //    택한 것이므로 여기 게이트와 무관하다. 즉 급하면 여전히 즉시 받을 수 있다.
    //
    // 자기 자신의 started 행을 보고 물러나면 아무도 생성하지 않으니 recordRunStart보다 먼저 본다.
    const alreadyGenerating = await isRunInFlight("briefing");
    if (!alreadyGenerating && isPastManualRefreshWindow()) {
      const runId = await recordRunStart("briefing", "fallback");
      try {
        const result = await generateBriefingFor([userId]);
        // newsStats는 크론(route.ts)이 남기는 것과 **같은 객체**다 — 이 경로가 그날 콘텐츠를
        // 실제로 만든 날(09-04·09-08)에 관리자 페이지의 뉴스 funnel이 "-"로 비어 있었다.
        // admin-status.ts는 진작 fallbackRun.details.newsStats를 읽고 있었고 쓰는 쪽만 빠져 있었다.
        // 상태 판정은 크론·수동과 **같은 함수**를 쓴다 — 경로마다 기준이 갈리면 같은 장애가
        // 어디서 났느냐에 따라 다르게 기록된다(newsStats writer 3경로와 같은 이유, generate.check ⑨).
        const trendOk = result.trendBrief !== null;
        await recordRunEnd(runId, runStatusFor(result.selectedNews.length, trendOk, result.newsStats), {
          details: { newsCount: result.selectedNews.length, aiTrendOk: trendOk, trendError: result.trendError, newsStats: result.newsStats },
        });
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

// 🔴 `trendBrief`는 **News와 같은 행에 이미 저장돼 있다** — AI Trend 최근 3일 열람이 새 테이블도
//    새 질의도 없이 되는 이유다(2026-09-06). 날짜 선택 상태는 News와 AI Trend가 각자 갖는다.
export type BriefingHistoryDay = {
  date: string;
  selectedNews: SelectedNewsItem[];
  trendBrief: TrendBriefResult | null;
};

// 오늘은 메인에서 이미 보여주므로 제외 — 어제/그저께 중 실제로 생성된 날짜만 돌려준다.
export async function getBriefingHistory(supabase: SupabaseClient, userId: string, days = 2): Promise<BriefingHistoryDay[]> {
  const dates = recentKSTDateStrings(days);
  const { data, error } = await supabase
    .from("briefing")
    .select("selected_news, trend_brief, briefing_date")
    .eq("user_id", userId)
    .in("briefing_date", dates)
    .order("briefing_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.briefing_date as string,
    selectedNews: (row.selected_news ?? []) as SelectedNewsItem[],
    // 🔴 오늘 경로(toView)와 **같은 처리**를 쓴다 — 스냅샷은 화면에 필요 없고, 두면 대시보드를 열 때마다
    //    과거 행 몫까지 클라이언트 payload에 실린다(실측 5KB/행). `?? []`처럼 뭉개지 않으므로
    //    `skill_signals`의 `[]`(신규·0건)와 `undefined`(과거 행)는 그대로 구분돼서 넘어간다.
    trendBrief: stripDevInput((row.trend_brief ?? null) as TrendBriefResult | null),
  }));
}
