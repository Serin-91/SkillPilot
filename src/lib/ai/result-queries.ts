import type { SupabaseClient } from "@supabase/supabase-js";
import { todayKSTDateString } from "@/lib/news/kst";

export type AiFeature = "focus" | "idea";
export type AiResultRow = {
  id: string;
  version: number;
  result_json: unknown;
  status: "processing" | "done" | "error";
  saved_memo_id: string | null;
  created_at: string;
  input_hash: string | null;
};

const FIELDS = "id, version, result_json, status, saved_memo_id, created_at, input_hash";

export async function getTodayAiResults(supabase: SupabaseClient, userId: string, feature: AiFeature): Promise<AiResultRow[]> {
  const { data, error } = await supabase
    .from("ai_result")
    .select(FIELDS)
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("result_date", todayKSTDateString())
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AiResultRow[];
}

// 8.6절 — processing 중 유니크 인덱스 위반이면 이미 생성 중이라는 뜻
export async function startAiResult(
  supabase: SupabaseClient,
  userId: string,
  feature: AiFeature,
  inputHash: string | null,
  version: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_result")
    .insert({ user_id: userId, feature, version, result_date: todayKSTDateString(), input_hash: inputHash, result_json: {}, status: "processing" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  return data.id as string;
}

export async function finishAiResult(supabase: SupabaseClient, id: string, resultJson: unknown): Promise<void> {
  const { error } = await supabase.from("ai_result").update({ result_json: resultJson, status: "done" }).eq("id", id);
  if (error) throw error;
}

export async function failAiResult(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("ai_result").update({ status: "error" }).eq("id", id);
}

// ponytail: 서버리스 타임아웃/강제종료로 catch가 못 돌면 processing row가 그날 자정(KST)까지 유니크 인덱스를
// 영구히 점유해 "이미 생성 중입니다"만 반환한다. 정상 요청이 이 시간을 넘길 일은 없으므로 오래된 processing은
// 죽은 요청으로 보고 실패 처리한다 — 재시도 큐 등 정교한 복구는 필요해지면 추가한다.
const STALE_PROCESSING_MS = 5 * 60 * 1000;

export async function reapStaleProcessing(supabase: SupabaseClient, rows: AiResultRow[]): Promise<void> {
  const stale = rows.find((r) => r.status === "processing" && Date.now() - new Date(r.created_at).getTime() > STALE_PROCESSING_MS);
  if (stale) await failAiResult(supabase, stale.id);
}
