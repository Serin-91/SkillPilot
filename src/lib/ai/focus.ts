import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export type FocusItem = { rank: number; title: string; meta: string; reason: string; memoId: string; endDate: string };
export type FocusResult = { items: FocusItem[] };

type TodoRow = {
  id: string;
  title: string;
  status: string | null;
  start_date: string;
  end_date: string;
  is_important: boolean;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = { planned: "예정", in_progress: "진행 중", completed: "완료" };
const GRADE_RANK = { S: 0, A: 1, B: 2 };

function diffDays(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function dDayLabel(endDate: string, today: string): string {
  const d = diffDays(endDate, today);
  if (d < 0) return `기한초과 D+${-d}`;
  if (d === 0) return "오늘";
  return `D-${d}`;
}

// 기획안 8.2.3 — S(마감 임박) > A(진행 중) > B(나머지)
function gradeOf(todo: TodoRow, today: string): "S" | "A" | "B" {
  if (diffDays(todo.end_date, today) <= 2) return "S";
  if (todo.status === "in_progress") return "A";
  return "B";
}

function reasonFor(todo: TodoRow, grade: "S" | "A" | "B", today: string): string {
  const daysLeft = diffDays(todo.end_date, today);
  if (grade === "S") {
    if (daysLeft < 0) return "기한을 초과한 미완료 Todo이며, 가장 먼저 확인이 필요합니다.";
    if (daysLeft === 0) return "오늘 마감되는 Todo입니다.";
    if (daysLeft === 1) return `내일 종료되는 미완료 Todo${todo.is_important ? "이며, 중요 메모로 지정되어" : ""} 우선 선정했습니다.`;
    return "종료일까지 이틀 남아 우선 선정했습니다.";
  }
  if (grade === "A") return "오늘 진행 중인 Todo로, 우선 확인이 필요합니다.";
  if (todo.start_date === today) return "오늘 날짜에 등록된 Todo입니다.";
  return todo.is_important ? "중요 메모로 지정된 Todo입니다." : "종료일이 가까워 선정했습니다.";
}

// 8.2.2 — 완료되지 않은 Todo 중 오늘이 기간에 포함된 것만 후보로 삼는다
export async function fetchFocusCandidates(supabase: SupabaseClient, userId: string, today: string): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("memo")
    .select("id, title, status, start_date, end_date, is_important, updated_at")
    .eq("user_id", userId)
    .eq("memo_type", "todo")
    .neq("status", "completed")
    .lte("start_date", today)
    .gte("end_date", today);
  if (error) throw error;
  return (data ?? []) as TodoRow[];
}

// 8.5.1 — 재생성 가능 여부를 판단하는 입력 해시 (Pin 여부는 제외)
export function hashFocusInput(candidates: TodoRow[]): string {
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((t) => `${t.id}:${t.status}:${t.start_date}:${t.end_date}:${t.is_important}`).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function buildFocusResult(candidates: TodoRow[], today: string): FocusResult {
  const ranked = candidates
    .map((t) => ({ todo: t, grade: gradeOf(t, today) }))
    .sort((a, b) => {
      if (GRADE_RANK[a.grade] !== GRADE_RANK[b.grade]) return GRADE_RANK[a.grade] - GRADE_RANK[b.grade];
      const daysDiff = diffDays(a.todo.end_date, today) - diffDays(b.todo.end_date, today);
      if (daysDiff !== 0) return daysDiff;
      if (a.todo.is_important !== b.todo.is_important) return a.todo.is_important ? -1 : 1;
      const startDiff = a.todo.start_date.localeCompare(b.todo.start_date);
      if (startDiff !== 0) return startDiff;
      return b.todo.updated_at.localeCompare(a.todo.updated_at);
    })
    .slice(0, 3);

  return {
    items: ranked.map(({ todo, grade }, i) => ({
      rank: i + 1,
      title: (todo.is_important ? "★ " : "") + todo.title,
      meta: `Todo · ${STATUS_LABEL[todo.status ?? "planned"]} · ${dDayLabel(todo.end_date, today)}`,
      reason: reasonFor(todo, grade, today),
      memoId: todo.id,
      endDate: todo.end_date,
    })),
  };
}
