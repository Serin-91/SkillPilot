"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { isAdminEmail } from "@/lib/auth/admin";
import { getTodayBriefing, stripDevInput, type BriefingView } from "@/lib/news/get-briefing";
import { generateBriefingFor, buildBriefingPayload, runStatusFor } from "@/lib/news/generate";
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

// 🔴🔴 관리자 **테스트 생성(미리보기)** — 2026-09-06.
//
// `retryBriefing`("운영 업데이트")과 **의미가 다르다**:
//   · 운영 업데이트 = 사용자가 보는 오늘 콘텐츠를 실제로 갈아엎는다(사용자 기능, 그대로 유지한다)
//   · 테스트 생성   = **DB를 한 줄도 건드리지 않고** 결과만 돌려준다(관리자 검증 전용)
//
// 예전에는 관리자가 결과를 보려면 `retryBriefing`밖에 없었고, 그것이 운영 `briefing` 행을
// 지우고 다시 만들었다. 그 결과 새벽 테스트 한 번이 그날 크론을 통째로 막았고(09-05 사고,
// HANDOFF 38절), 테스트 결과가 다음 날 `recentlyUsedUrls`·`recentTakeawayEvidence`의
// "과거 데이터"로 취급됐다. 이 액션은 그 고리를 끊는다.
//
// ✅ **생성 로직은 크론과 완전히 같은 한 벌이다** — `buildBriefingPayload`를 그대로 부른다.
//    News 선정·AI Trend·dev 입력·grounding·skill_signals·practical_takeaways가 전부 동일하고,
//    `skipDedup=false`라 **입력 후보도 크론과 같다**(사용자 조건 6).
// 🔴 다른 것은 **저장뿐**이다: `persist=false`로 `source_article` 적재를 끄고,
//    `briefing` upsert(=`generateBriefingFor`)를 **아예 호출하지 않는다.**
// 🔴 `cron_runs`에도 기록하지 않는다 — 관리자 페이지의 `newsStats`가 테스트 값으로 덮이면
//    "오늘 크론이 무엇을 했나"를 못 읽게 된다(그 화면이 거짓말한 전례가 있다, briefing.ts 37절 주석).
// 🔴 하루 상한(manual-refresh-limit)도 쓰지 않는다 — 샘플링 편차를 보려면 여러 번 돌려야 한다.
export type BriefingPreview =
  | { error: string }
  | {
      ok: true;
      at: string;
      elapsedMs: number;
      selectedNews: BriefingView["selectedNews"];
      trendBrief: BriefingView["trendBrief"];
      newsStats: unknown;
      devInput: { source: string; title: string; ageDays: number; chars: number }[];
    };

export async function previewBriefing(): Promise<BriefingPreview> {
  const user = await requireUser();
  // 관리자 외에는 파이프라인을 돌리지도 않는다 — RSS·Gemini 호출이 드는 동작이다.
  if (!isAdminEmail(user.email)) return { error: "관리자 권한이 필요합니다." };

  const admin = createAdminClient();
  const startedAt = Date.now();
  try {
    // ⬇️ 크론이 부르는 것과 **같은 함수**다. 세 번째 인자만 다르다(persist=false).
    const { selectedNews, trendBrief, dev, newsStats } = await buildBriefingPayload(admin, false, false);

    // dev 입력은 그대로 내려보내면 payload가 커진다(실측 12~19KB) — 화면에 필요한 요약만 만든다.
    const devInput = [...dev.github, ...dev.huggingface].map((d) => ({
      source: d.source,
      title: d.title,
      ageDays: Number(((startedAt - new Date(d.published_at).getTime()) / 86400000).toFixed(1)),
      chars: (d.description ?? "").trim().length,
    }));

    return {
      ok: true as const,
      at: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      selectedNews,
      // 생성 결과의 trendBrief에는 dev_input 스냅샷이 없다(withDevInput은 저장 직전에만 붙인다).
      // 그래도 계약을 한곳으로 모으려고 화면 경로와 같은 함수를 통과시킨다.
      trendBrief: stripDevInput(trendBrief),
      newsStats,
      devInput,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[briefing-preview] 테스트 생성 실패", e);
    return { error: msg.split("\n")[0].slice(0, 300) };
  }
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
    // 크론·fallback과 같은 판정을 쓴다(runStatusFor) — 경로별로 기준이 갈리면 안 된다.
    await recordRunEnd(runId, runStatusFor(result.selectedNews.length, result.trendBrief !== null, result.newsStats), {
      details: { newsStats: result.newsStats },
    });
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
