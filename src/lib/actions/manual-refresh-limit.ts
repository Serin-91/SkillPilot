import type { SupabaseClient } from "@supabase/supabase-js";

// 뉴스/채용공고 "지금 업데이트" 버튼의 하루 상한 — 매번 RSS/Tavily 수집 + Gemini 호출이 도는
// 비용성 동작이라, 자유롭게 여러 번 누를 수 있으면 토큰 과지출로 이어진다.
export const MANUAL_REFRESH_MAX = 1;

async function usedCount(
  admin: SupabaseClient,
  userId: string,
  feature: "briefing" | "jobs",
  date: string
): Promise<number> {
  const { data } = await admin
    .from("manual_refresh_log")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("refresh_date", date)
    .maybeSingle();
  return data?.count ?? 0;
}

// 실제 갱신을 시작하기 전 확인만 한다 — 여기서는 아직 사용 횟수를 올리지 않는다.
// 갱신이 실패해도 이 호출만으로는 오늘 사용 횟수가 소모되지 않는다(성공 시에만 recordManualRefreshSuccess를 부른다).
// unlimited=true면 상한 자체를 보지 않는다 — 관리자 계정 전용(운영 중 뉴스/채용을 여러 번 돌려봐야
// 하는데 하루 1회로는 검증이 불가능하다). 호출부에서 isAdminEmail로 판정해 넘긴다.
export async function peekManualRefreshAvailable(
  admin: SupabaseClient,
  userId: string,
  feature: "briefing" | "jobs",
  date: string,
  unlimited = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (unlimited) return { ok: true };
  const used = await usedCount(admin, userId, feature, date);
  if (used >= MANUAL_REFRESH_MAX) {
    return { ok: false, error: `오늘 "지금 업데이트"를 이미 ${MANUAL_REFRESH_MAX}회 사용했습니다. 내일 다시 시도해주세요.` };
  }
  return { ok: true };
}

// 갱신이 실제로 성공했을 때만 호출한다 — 실패한 시도는 이 함수를 부르지 않아 오늘 사용 횟수가 그대로 남는다.
export async function recordManualRefreshSuccess(
  admin: SupabaseClient,
  userId: string,
  feature: "briefing" | "jobs",
  date: string,
  unlimited = false
): Promise<void> {
  if (unlimited) return; // 차감할 상한이 없으므로 기록도 남기지 않는다
  const used = await usedCount(admin, userId, feature, date);
  const { error } = await admin
    .from("manual_refresh_log")
    .upsert({ user_id: userId, feature, refresh_date: date, count: used + 1 }, { onConflict: "user_id,feature,refresh_date" });
  if (error) throw error;
}
