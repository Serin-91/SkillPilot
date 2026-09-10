import type { SupabaseClient } from "@supabase/supabase-js";
import type { Memo } from "./types";

const MEMO_FIELDS =
  "id, title, content, content_format, content_mode, emoji, memo_type, status, start_date, end_date, color, is_important, is_pinned, pinned_at, pin_order, auto_number, is_auto_title, created_at, updated_at";

// 기획안 6.4·6.7절 — 해당 월과 겹치는(기간 메모 포함) 모든 메모
export async function getMemosForMonth(
  supabase: SupabaseClient,
  userId: string,
  year: number,
  month0: number // 0-indexed
): Promise<Memo[]> {
  const monthStart = `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
  const monthEndDate = new Date(year, month0 + 1, 0).getDate();
  const monthEnd = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(monthEndDate).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("memo")
    .select(MEMO_FIELDS)
    .eq("user_id", userId)
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart)
    .order("start_date", { ascending: true })
    // 🔴 tie-break 없이 start_date 하나로만 정렬하면 같은 날짜 메모의 순서가 **조회할 때마다**
    //   달라진다(OPEN-MONTHLY-TIE-ORDER: 새로고침 전후로 메모1·메모3 자리가 바뀌었다).
    //   DB 반환 순서에 맡기지 않는다. 상위 grouping인 start_date 오름차순은 그대로 두고
    //   그 **안쪽만** created_at 최신순 → id로 확정한다(ordering.ts compareMemoDefault와 같은 규칙).
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw error;
  return data as Memo[];
}

// 기획안 6.6절 — 중요 메모: Pin 우선, Pin끼리는 드래그로 정한 pin_order, 나머지는 날짜순
export async function getImportantMemos(supabase: SupabaseClient, userId: string): Promise<Memo[]> {
  const { data, error } = await supabase
    .from("memo")
    .select(MEMO_FIELDS)
    .eq("user_id", userId)
    .eq("is_important", true)
    .order("is_pinned", { ascending: false })
    .order("pin_order", { ascending: true, nullsFirst: false })
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data as Memo[];
}

// 날짜 범위 필터(기간/전체 기간) — start/end가 null이면 그 경계 없이 조회한다(둘 다 null이면 전체 기간).
export async function getMemosForRange(
  supabase: SupabaseClient,
  userId: string,
  start: string | null,
  end: string | null
): Promise<Memo[]> {
  let query = supabase.from("memo").select(MEMO_FIELDS).eq("user_id", userId);
  if (end) query = query.lte("start_date", end);
  if (start) query = query.gte("end_date", start);
  const { data, error } = await query
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true }); // 위와 같은 이유 — 동률 순서를 DB에 맡기지 않는다
  if (error) throw error;
  return data as Memo[];
}

// 6.2절 — 특정 날짜에 걸치는 메모 목록 (드래그 복사 시 기존 메모 선택지)
export async function getMemosForDate(supabase: SupabaseClient, userId: string, date: string): Promise<Memo[]> {
  const { data, error } = await supabase
    .from("memo")
    .select(MEMO_FIELDS)
    .eq("user_id", userId)
    .lte("start_date", date)
    .gte("end_date", date)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true }); // 동률 확정(위와 같은 이유)
  if (error) throw error;
  return data as Memo[];
}
