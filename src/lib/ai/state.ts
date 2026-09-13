import type { SupabaseClient } from "@supabase/supabase-js";
import type { FocusResult } from "./focus";
import type { IdeaResult } from "./idea";
import { getTodayAiResults } from "./result-queries";

// Idea Build는 상위 품질 모델을 쓰는 대신 하루 횟수를 2회로 줄인다
export const IDEA_MAX = 2;

export type FocusView = {
  current: FocusResult | null;
  currentId: string | null;
  savedMemoId: string | null;
  updatedAt: string | null;
  history: { version: number; createdAt: string }[];
};

// Today's Focus는 API 호출 없이 Todo를 규칙 기반으로 계산한다 — 사용량 제한 없이 언제든 재생성 가능하다.
export async function getFocusView(supabase: SupabaseClient, userId: string): Promise<FocusView> {
  const rows = await getTodayAiResults(supabase, userId, "focus");
  const done = rows.filter((r) => r.status === "done");
  const latest = done[0] ?? null;

  return {
    current: latest ? (latest.result_json as FocusResult) : null,
    currentId: latest?.id ?? null,
    savedMemoId: latest?.saved_memo_id ?? null,
    updatedAt: latest?.created_at ?? null,
    history: done.map((r) => ({ version: r.version, createdAt: r.created_at })),
  };
}

export type IdeaView = {
  current: IdeaResult | null;
  currentId: string | null;
  savedMemoId: string | null;
  updatedAt: string | null;
  usedCount: number;
  maxCount: number;
  history: { version: number; createdAt: string }[];
};

export async function getIdeaView(supabase: SupabaseClient, userId: string): Promise<IdeaView> {
  const rows = await getTodayAiResults(supabase, userId, "idea");
  const done = rows.filter((r) => r.status === "done");
  const latest = done[0] ?? null;

  return {
    current: latest ? (latest.result_json as IdeaResult) : null,
    currentId: latest?.id ?? null,
    savedMemoId: latest?.saved_memo_id ?? null,
    updatedAt: latest?.created_at ?? null,
    usedCount: done.length,
    maxCount: IDEA_MAX,
    history: done.map((r) => ({ version: r.version, createdAt: r.created_at })),
  };
}
