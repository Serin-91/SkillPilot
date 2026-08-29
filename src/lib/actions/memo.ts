"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getNextMemoNumber, RESERVED_AUTO_TITLE_PATTERN } from "@/lib/memo/auto-number";
import { getMemosForDate, getMemosForMonth, getMemosForRange } from "@/lib/memo/queries";
import { sourceBlockHtml, newsFullBlockHtml, jobFullBlockHtml, trendFullBlockHtml, toEditableHtml, htmlToPlainText } from "@/lib/memo/rich-text";
import type { ContentFormat, ContentMode, Memo, MemoColor, MemoType, SourceType, TodoStatus } from "@/lib/memo/types";


export type CreateMemoInput = {
  title: string;
  content: string;
  content_format: ContentFormat;
  content_mode: ContentMode;
  emoji?: string | null;
  memo_type: MemoType;
  status: TodoStatus | null;
  start_date: string;
  end_date: string;
  color: MemoColor;
  is_important: boolean;
};

// 6.3절 자동 번호 부여까지 포함한 메모 생성
async function insertMemo(input: CreateMemoInput) {
  const user = await requireUser();
  const supabase = await createClient();

  const title = input.title.trim();
  if (title && RESERVED_AUTO_TITLE_PATTERN.test(title)) {
    return { error: "메모1, 메모2 형식은 자동 생성 전용입니다. 다른 제목을 입력해주세요." };
  }

  let finalTitle = title;
  let autoNumber: number | null = null;
  let isAutoTitle = false;

  if (!title) {
    const { data: sameDay, error: qErr } = await supabase
      .from("memo")
      .select("auto_number, is_auto_title")
      .eq("user_id", user.id)
      .eq("start_date", input.start_date)
      .eq("end_date", input.end_date)
      .eq("is_auto_title", true)
      .not("auto_number", "is", null);
    if (qErr) throw qErr;
    autoNumber = getNextMemoNumber(
      (sameDay ?? []).map((m) => ({ autoNumber: m.auto_number, isAutoTitle: m.is_auto_title }))
    );
    finalTitle = `메모${autoNumber}`;
    isAutoTitle = true;
  }

  const { data, error } = await supabase
    .from("memo")
    .insert({
      user_id: user.id,
      title: finalTitle,
      content: input.content || null,
      content_format: input.content_format,
      content_mode: input.content_mode,
      emoji: input.emoji || null,
      memo_type: input.memo_type,
      status: input.memo_type === "todo" ? input.status : null,
      start_date: input.start_date,
      end_date: input.end_date,
      color: input.color,
      is_important: input.is_important,
      auto_number: autoNumber,
      is_auto_title: isAutoTitle,
    })
    .select("id")
    .single();
  if (error) throw error;

  return { ok: true as const, id: data.id as string };
}

export async function createMemo(input: CreateMemoInput) {
  const result = await insertMemo(input);
  revalidatePath("/");
  return result;
}

export async function updateMemo(id: string, patch: Partial<CreateMemoInput>) {
  await requireUser();
  const supabase = await createClient();

  if (patch.title !== undefined && patch.title.trim() && RESERVED_AUTO_TITLE_PATTERN.test(patch.title.trim())) {
    return { error: "메모1, 메모2 형식은 자동 생성 전용입니다. 다른 제목을 입력해주세요." };
  }

  const update: Record<string, unknown> = { ...patch };
  if (patch.title !== undefined) {
    // 빈 제목 = "그대로 둔다"는 뜻(자동 생성 제목 편집창은 일부러 빈 값으로 채워둔다) — title 컬럼을 덮어쓰지 않는다
    if (patch.title.trim()) update.is_auto_title = false;
    else delete update.title;
  }
  if (patch.memo_type && patch.memo_type !== "todo") update.status = null;

  const { error } = await supabase.from("memo").update(update).eq("id", id);
  if (error) throw error;
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteMemo(id: string) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("memo").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/");
}

// ☆ ↔ ★ (먼슬리 메모 목록용 — 고정은 여기서 다루지 않는다. 중요 해제 시 고정도 함께 해제, 6.6절 제약과 일치)
export async function toggleImportant(id: string) {
  await requireUser();
  const supabase = await createClient();

  const { data: memo, error: readError } = await supabase.from("memo").select("is_important").eq("id", id).single();
  if (readError) throw readError;

  const update = memo.is_important
    ? { is_important: false, is_pinned: false, pinned_at: null }
    : { is_important: true };

  const { error } = await supabase.from("memo").update(update).eq("id", id);
  if (error) throw error;
  revalidatePath("/");
}

// Key Notes 상세 팝업의 고정(📌) 토글 — 해제 시 ☆까지 내려가지 않고 ★(중요)로만 내려간다.
// 새로 고정되는 메모는 현재 Pin 목록의 마지막 순서(pin_order)로 들어간다.
export async function setMemoPinned(id: string, pinned: boolean) {
  const user = await requireUser();
  const supabase = await createClient();

  if (pinned) {
    const { data: last, error: readError } = await supabase
      .from("memo")
      .select("pin_order")
      .eq("user_id", user.id)
      .eq("is_pinned", true)
      .order("pin_order", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    const nextOrder = (last?.pin_order ?? -1) + 1;

    const { error } = await supabase
      .from("memo")
      .update({ is_important: true, is_pinned: true, pinned_at: new Date().toISOString(), pin_order: nextOrder })
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("memo").update({ is_pinned: false, pinned_at: null, pin_order: null }).eq("id", id);
    if (error) throw error;
  }
  revalidatePath("/");
}

// Key Notes 상세의 Pin 영역 Drag & Drop 재정렬 — 드롭 후 확정된 순서를 그대로 pin_order에 저장한다.
// is_pinned=true인 내 메모만 대상으로 하여, 실수로 다른 메모나 다른 사용자의 메모에 영향을 주지 않는다.
// pinned=false로 부르면 고정이 아닌 중요 메모(★)의 순서를 저장한다. 컬럼은 pin_order를 그대로
// 쓴다 — getImportantMemos가 이미 is_pinned → pin_order → pinned_at → start_date 순으로 정렬하므로
// 비고정 메모에도 pin_order가 그대로 정렬 키로 먹는다(마이그레이션도 새 컬럼도 필요 없다).
// is_pinned 필터는 유지한다: 고정/비고정은 화면에서 서로 다른 목록이라, 한쪽 순서를 저장하다가
// 다른 쪽 pin_order를 덮어쓰면 나갔다 들어올 때 순서가 뒤섞인다.
export async function reorderPinnedMemos(orderedIds: string[], pinned = true) {
  const user = await requireUser();
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("memo").update({ pin_order: index }).eq("id", id).eq("user_id", user.id).eq("is_pinned", pinned)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  revalidatePath("/");
}

export type CopyToMemoInput = {
  date: string;
  memoId: string | null; // null이면 새 메모 생성
  sourceType: SourceType;
  sourceTitle: string;
  sourceUrl: string;
  selectedText: string;
  color?: MemoColor;   // 새 메모를 만들 때만 쓰인다(기존 메모에 이어붙일 때는 무시)
};

// 뉴스/채용공고 → 메모 저장 공통 로직 — HTML block을 기존 메모에 이어붙이거나 새 메모로 생성하고
// memo_source에 출처를 남긴다. 드래그한 문장 하나(copySelectionToMemo)든 기사 전체(copyFull*ToMemo)든
// 결과가 "블록 HTML 하나"라는 점은 같아서 이 저장 단계는 공유한다.
async function saveBlockToMemo(
  supabase: SupabaseClient,
  date: string, memoId: string | null, block: string,
  source: { type: SourceType; title: string; url: string; text: string },
  color?: MemoColor
) {
  let id = memoId;

  if (id) {
    // 기존 메모가 간단 메모(quick)면 plain text로, 상세 메모(document)면 rich HTML block으로 이어붙인다 (44절)
    const { data: memo, error: readError } = await supabase.from("memo").select("content, content_format, content_mode").eq("id", id).single();
    if (readError) throw readError;
    if (memo.content_mode === "quick") {
      const plainBlock = htmlToPlainText(block);
      const baseText = memo.content ?? "";
      const { error } = await supabase
        .from("memo")
        .update({ content: baseText ? `${baseText}\n${plainBlock}` : plainBlock })
        .eq("id", id);
      if (error) throw error;
    } else {
      const baseHtml = toEditableHtml(memo.content, memo.content_format as ContentFormat);
      const { error } = await supabase
        .from("memo")
        .update({ content: baseHtml + block, content_format: "rich_html" })
        .eq("id", id);
      if (error) throw error;
    }
  } else {
    const created = await insertMemo({
      title: "",
      content: block,
      content_format: "rich_html",
      content_mode: "document",
      memo_type: "free_note",
      status: null,
      start_date: date,
      end_date: date,
      // 🔴 색은 **클라이언트가 실어 보낸다** — 테마는 localStorage에만 있어서 서버가 못 읽는다
      // (types.ts의 defaultMemoColor 주석). 안 실려 오면 예전 기본값 yellow로 안전하게 받는다.
      color: color ?? "yellow",
      is_important: false,
    });
    if ("error" in created) return created;
    id = created.id;
  }

  const { error: sourceError } = await supabase.from("memo_source").insert({
    memo_id: id,
    source_type: source.type,
    source_title: source.title,
    source_url: source.url,
    selected_text: source.text,
  });
  if (sourceError) throw sourceError;

  return { ok: true as const, memoId: id };
}

// 6.2절 — 드래그한 문장을 기존 메모에 이어붙이거나 새 메모로 생성
export async function copySelectionToMemo(input: CopyToMemoInput) {
  await requireUser();
  const supabase = await createClient();
  const block = sourceBlockHtml(input.sourceType, input.sourceTitle, input.sourceUrl, input.selectedText);
  const result = await saveBlockToMemo(supabase, input.date, input.memoId, block, {
    type: input.sourceType, title: input.sourceTitle, url: input.sourceUrl, text: input.selectedText,
  }, input.color);
  revalidatePath("/");
  return result;
}

export type CopyFullNewsInput = {
  date: string; memoId: string | null;
  sourceTitle: string; sourceUrl: string; summary: string; reason: string; tags: string[];
  color?: MemoColor;
};

// 뉴스 카드 "전체 저장" — 드래그 없이 제목/요약/추천이유/키워드를 통째로 메모에 옮긴다
export async function copyFullNewsToMemo(input: CopyFullNewsInput) {
  await requireUser();
  const supabase = await createClient();
  const block = newsFullBlockHtml(input.sourceTitle, input.sourceUrl, input.summary, input.reason, input.tags);
  const result = await saveBlockToMemo(supabase, input.date, input.memoId, block, {
    type: "news", title: input.sourceTitle, url: input.sourceUrl, text: input.summary,
  }, input.color);
  revalidatePath("/");
  return result;
}

export type CopyFullJobInput = {
  date: string; memoId: string | null;
  title: string; company: string; sourceSite: string; career: string; deadline: string; sourceUrl: string;
  categories: { label: string; groups: { heading: string | null; bullets: string[] }[] }[];
  color?: MemoColor;
};

// 채용공고 카드 "전체 저장" — 주요업무/자격요건/우대사항까지 포함해 공고 전체를 메모에 옮긴다
export async function copyFullJobToMemo(input: CopyFullJobInput) {
  await requireUser();
  const supabase = await createClient();
  const block = jobFullBlockHtml(input.title, input.company, input.sourceSite, input.career, input.deadline, input.sourceUrl, input.categories);
  const result = await saveBlockToMemo(supabase, input.date, input.memoId, block, {
    type: "job", title: `${input.company} / ${input.title}`, url: input.sourceUrl, text: input.title,
  }, input.color);
  revalidatePath("/");
  return result;
}

export type CopyFullTrendInput = {
  date: string; memoId: string | null;
  label: string; title: string | null; body: string; bullets: string[] | null; source: string | null; url: string | null;
  color?: MemoColor;
};

// AI Trend Briefing 항목 "전체 저장" — 뉴스/채용공고와 동일한 흐름, source_type만 ai_smart_direction으로 기록
export async function copyFullTrendToMemo(input: CopyFullTrendInput) {
  await requireUser();
  const supabase = await createClient();
  const block = trendFullBlockHtml(input.label, input.title, input.body, input.bullets, input.source, input.url);
  const result = await saveBlockToMemo(supabase, input.date, input.memoId, block, {
    type: "ai_smart_direction", title: input.title ?? input.label, url: input.url ?? "", text: input.body,
  }, input.color);
  revalidatePath("/");
  return result;
}

// 기존 메모에 뉴스/채용공고 출처만 기록 — 본문은 사용자가 수정창에서 직접 원하는 위치에 넣는다 (6~10절)
export async function recordMemoSource(
  memoId: string, sourceType: SourceType, sourceTitle: string, sourceUrl: string, selectedText: string
) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("memo_source").insert({
    memo_id: memoId, source_type: sourceType, source_title: sourceTitle, source_url: sourceUrl, selected_text: selectedText,
  });
  if (error) throw error;
  revalidatePath("/");
}

export async function getMemosForDateAction(date: string): Promise<Memo[]> {
  const user = await requireUser();
  const supabase = await createClient();
  return getMemosForDate(supabase, user.id, date);
}

// 6.4절 — 달력 이전/다음 달 이동
export async function getMemosForMonthAction(year: number, month0: number): Promise<Memo[]> {
  const user = await requireUser();
  const supabase = await createClient();
  return getMemosForMonth(supabase, user.id, year, month0);
}

// Monthly MEMO 날짜 범위 필터 — "기간"(start/end 지정) / "전체 기간"(둘 다 null)
export async function getMemosForRangeAction(start: string | null, end: string | null): Promise<Memo[]> {
  const user = await requireUser();
  const supabase = await createClient();
  return getMemosForRange(supabase, user.id, start, end);
}

// getImportantMemosAction은 삭제했다 — 호출자가 없는 죽은 코드였다. "router.refresh()를 빼고 Key
// Notes만 따로 받아오기" 최적화를 시도했다가 되돌렸을 때 남은 잔해인데, 그 최적화 자체가 불필요했다:
// 메모 액션들이 revalidatePath("/")를 부르므로 액션 응답의 재렌더가 importantMemos prop을 이미
// 갱신해준다(Dashboard.tsx refreshAfterMemoChange 주석 참고). 같은 시도를 반복하지 않기 위해 남긴다.
