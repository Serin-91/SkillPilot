"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export type ProjectIdeaInput = {
  title: string;
  status: string;
  summary: string;
  content_md: string;
};

// 7.1절 — 제목/상태값/한 줄 요약/Markdown 상세 메모만 다룬다
export async function saveProjectIdea(id: string | null, input: ProjectIdeaInput) {
  const user = await requireUser();
  const supabase = await createClient();

  if (!input.title.trim()) return { error: "제목을 입력해주세요." };

  // 본문은 항상 MemoRichEditor(Tiptap)가 만든 HTML이므로 저장 시 명시적으로 'rich_html'로 기록한다.
  // (문자열을 보고 서식 유무를 추측하지 않기 위함 — day13_migration.sql 참고)
  if (id) {
    const { error } = await supabase
      .from("project_idea")
      .update({ title: input.title, status: input.status, summary: input.summary, content_md: input.content_md, content_format: "rich_html" })
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("project_idea").insert({
      user_id: user.id,
      title: input.title,
      status: input.status,
      summary: input.summary,
      content_md: input.content_md,
      content_format: "rich_html",
    });
    if (error) throw error;
  }

  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteProjectIdea(id: string) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("project_idea").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/");
}
