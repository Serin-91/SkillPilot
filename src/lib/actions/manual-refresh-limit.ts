import type { SupabaseClient } from "@supabase/supabase-js";

// 뉴스/채용공고 "지금 업데이트" 버튼의 하루 상한 — 매번 RSS/Tavily 수집 + Gemini 호출이 도는
// 비용성 동작이라, 자유롭게 여러 번 누를 수 있으면 토큰 과지출로 이어진다.
export const MANUAL_REFRESH_MAX = 2;

// admin 클라이언트로 호출한다 — 이 함수 자체는 requireUser()로 이미 인증된 user.id만 다루므로
// RLS를 우회해도 다른 사용자 데이터에 접근하지 않는다.
export async function consumeManualRefresh(
  admin: SupabaseClient,
  userId: string,
  feature: "briefing" | "jobs",
  date: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await admin
    .from("manual_refresh_log")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("refresh_date", date)
    .maybeSingle();

  const used = data?.count ?? 0;
  if (used >= MANUAL_REFRESH_MAX) {
    return { ok: false, error: `오늘 "지금 업데이트"를 이미 ${MANUAL_REFRESH_MAX}회 사용했습니다. 내일 다시 시도해주세요.` };
  }

  const { error } = await admin
    .from("manual_refresh_log")
    .upsert({ user_id: userId, feature, refresh_date: date, count: used + 1 }, { onConflict: "user_id,feature,refresh_date" });
  if (error) throw error;

  return { ok: true };
}
