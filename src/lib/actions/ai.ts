"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { todayKSTDateString } from "@/lib/news/kst";
import { fetchFocusCandidates, hashFocusInput, buildFocusResult } from "@/lib/ai/focus";
import { generateIdeaDirection, type IdeaGenerationMode, type IdeaResult } from "@/lib/ai/idea";
import { getTodayAiResults, startAiResult, finishAiResult, failAiResult, reapStaleProcessing } from "@/lib/ai/result-queries";
import { getFocusView, getIdeaView, IDEA_MAX, type FocusView, type IdeaView } from "@/lib/ai/state";

// Today's Focus는 API를 호출하지 않는 규칙 기반 계산이라 사용량 제한이 없다 — 언제든 재생성 가능하다.
export async function runFocus(): Promise<{ error: string } | { ok: true; view: FocusView }> {
  const user = await requireUser();
  const supabase = await createClient();

  const rows = await getTodayAiResults(supabase, user.id, "focus");

  const today = todayKSTDateString();
  const candidates = await fetchFocusCandidates(supabase, user.id, today);
  const inputHash = hashFocusInput(candidates);

  await reapStaleProcessing(supabase, rows);
  const nextVersion = rows.length > 0 ? Math.max(...rows.map((r) => r.version)) + 1 : 1;
  const id = await startAiResult(supabase, user.id, "focus", inputHash, nextVersion);
  if (!id) return { error: "이미 생성 중입니다." };

  try {
    await finishAiResult(supabase, id, buildFocusResult(candidates, today));
  } catch (e) {
    await failAiResult(supabase, id);
    throw e;
  }

  revalidatePath("/");
  return { ok: true, view: await getFocusView(supabase, user.id) };
}

// 기획안 11절 — 하루 최대 2회(직접 선택/Random 공유), 해시 기반 재생성 판단 없음
export async function runIdea(
  mode: IdeaGenerationMode = { kind: "random" }
): Promise<{ error: string; projectId?: string } | { ok: true; view: IdeaView }> {
  const user = await requireUser();
  const supabase = await createClient();

  const rows = await getTodayAiResults(supabase, user.id, "idea");
  const done = rows.filter((r) => r.status === "done");
  if (done.length >= IDEA_MAX) return { error: "오늘의 업데이트 횟수를 모두 사용했습니다." };

  // 재생성해도 같은 방향만 나오지 않도록, 오늘 이미 나온 추천 방향들을 프롬프트에 "이건 피해라"로 넘긴다
  const avoidHeadlines = done
    .map((r) => (r.result_json as IdeaResult | null)?.recommendationTitle)
    .filter((h): h is string => Boolean(h));
  // 기획안 22절 — 오늘 직전에 나온 결과와 같은 프로젝트가 Random에서 바로 다시 뽑히지 않게 한다
  const avoidProjectId = (done[0]?.result_json as IdeaResult | null)?.projectId ?? null;

  await reapStaleProcessing(supabase, rows);
  const nextVersion = rows.length > 0 ? Math.max(...rows.map((r) => r.version)) + 1 : 1;
  const id = await startAiResult(supabase, user.id, "idea", null, nextVersion);
  if (!id) return { error: "이미 생성 중입니다." };

  // Gemini 호출이 실패해도 어떤 프로젝트를 시도했는지 클라이언트에 돌려줘야 random 재시도를
  // 같은 프로젝트로 고정할 수 있다 — 실패해도 usage count에는 포함되지 않는다(failAiResult만 호출, done 아님).
  let resolvedProjectId: string | null = null;
  try {
    const result = await generateIdeaDirection(supabase, user.id, mode, avoidHeadlines, avoidProjectId, (p) => {
      resolvedProjectId = p.id;
    });
    if (!result) {
      await failAiResult(supabase, id);
      return { error: "Idea Build를 사용할 프로젝트가 없습니다." };
    }
    await finishAiResult(supabase, id, result);
  } catch (e) {
    await failAiResult(supabase, id);
    console.error("[idea] 생성 실패", e);
    return { error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", projectId: resolvedProjectId ?? undefined };
  }

  revalidatePath("/");
  return { ok: true, view: await getIdeaView(supabase, user.id) };
}

// 8.4절 — 다시보기: 횟수를 차감하지 않고 특정 버전을 그대로 보여준다
export async function getAiResultVersion(feature: "focus" | "idea", version: number) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_result")
    .select("id, result_json, saved_memo_id")
    .eq("user_id", user.id)
    .eq("feature", feature)
    .eq("result_date", todayKSTDateString())
    .eq("version", version)
    .eq("status", "done")
    .single();
  if (error) throw error;
  return { id: data.id as string, result: data.result_json, savedMemoId: data.saved_memo_id as string | null };
}
