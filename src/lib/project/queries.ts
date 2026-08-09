import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectIdea } from "./types";

// 7.3절 — 수정일순 정렬
export async function getProjectIdeas(supabase: SupabaseClient, userId: string): Promise<ProjectIdea[]> {
  const { data, error } = await supabase
    .from("project_idea")
    .select("id, title, summary, status, content_md, content_format, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as ProjectIdea[];
}
