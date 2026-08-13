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

function diffDays(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function dDayLabel(endDate: string, today: string): string {
  const d = diffDays(endDate, today);
  if (d < 0) return `기한초과 D+${-d}`;
  if (d === 0) return "D-Day";
  return `D-${d}`;
}

// Today's Focus 우선순위 최종안 — 기한초과(날짜 상태)와 status(사용자 작업 상태)는 별도 개념이다.
// "기한초과"는 status와 무관하게 순수 날짜 계산이고, status는 사용자가 직접 바꾸지 않으면 시스템이
// 자동으로 바꾸지 않는다(예: 예정 상태로 마감을 넘겨도 진행중으로 자동 전환하지 않음).
type ReasonType = "DUE_TODAY" | "DUE_TOMORROW" | "DUE_IN_2_DAYS" | "OVERDUE_IN_PROGRESS" | "IN_PROGRESS" | "OVERDUE_PLANNED" | "PLANNED";

// S(0~3) < A(4~5) < B(6) — 배열 순서 자체가 전체 우선순위다.
const REASON_ORDER: ReasonType[] = [
  "DUE_TODAY", "DUE_TOMORROW", "DUE_IN_2_DAYS", "OVERDUE_IN_PROGRESS", "IN_PROGRESS", "OVERDUE_PLANNED", "PLANNED",
];

// 문장 사이 \n — focus-reason-text가 white-space: pre-line으로 문장마다 줄바꿈해 보여준다.
const REASON_TEXT: Record<ReasonType, string> = {
  DUE_TODAY: "⏰ 오늘이 마감일이에요.\n가장 먼저 확인해 보세요.",
  DUE_TOMORROW: "🚨 마감까지 하루 남았어요.\n오늘 처리해 두는 게 좋아요.",
  DUE_IN_2_DAYS: "⏳ 마감이 이틀 앞으로 다가왔어요.\n미리 진행해 보세요.",
  OVERDUE_IN_PROGRESS: "🔥 진행 중인 작업이 기한을 넘겼어요.\n우선 마무리해 보세요.",
  IN_PROGRESS: "▶️ 이미 진행 중인 작업이에요.\n흐름이 끊기지 않게 이어가 보세요.",
  OVERDUE_PLANNED: "⚠️ 아직 시작하지 않은 작업인데 기한이 지났어요.\n계속할지 확인해 보세요.",
  PLANNED: "📌 시작일이 된 예정 작업이에요.\n여유가 있을 때 진행해 보세요.",
};

// 판정 순서가 중요하다 — 날짜 임박(오늘/D-1/D-2) 검사를 status 판정보다 먼저 해야 "진행중 + 오늘 마감"이
// IN_PROGRESS가 아니라 DUE_TODAY로 분류된다.
function classify(todo: TodoRow, today: string): ReasonType {
  const status = todo.status ?? "planned";
  const d = diffDays(todo.end_date, today);
  if (d === 0) return "DUE_TODAY";
  if (d === 1) return "DUE_TOMORROW";
  if (d === 2) return "DUE_IN_2_DAYS";
  if (d < 0 && status === "in_progress") return "OVERDUE_IN_PROGRESS";
  if (status === "in_progress") return "IN_PROGRESS";
  if (d < 0 && status === "planned") return "OVERDUE_PLANNED";
  return "PLANNED";
}

// 같은 reasonType 내부의 2차 정렬 키 — 값이 작을수록 앞선다.
// 기한초과 그룹은 "최근에 초과된 것"이 우선이라 오래 방치된 Todo가 계속 상단을 독점하지 않는다.
function subRank(todo: TodoRow, reason: ReasonType, today: string): number {
  const d = diffDays(todo.end_date, today);
  if (reason === "OVERDUE_IN_PROGRESS" || reason === "OVERDUE_PLANNED") return -d;
  if (reason === "IN_PROGRESS" || reason === "PLANNED") return d;
  return 0; // DUE_TODAY/TOMORROW/IN_2_DAYS는 같은 reasonType 안에서 날짜가 전부 동일하다
}

// 완료되지 않았고 시작일이 된 Todo가 후보다 — end_date는 여기서 거르지 않는다(마감을 넘겨도 미완료면 후보 유지).
export async function fetchFocusCandidates(supabase: SupabaseClient, userId: string, today: string): Promise<TodoRow[]> {
  const { data, error } = await supabase
    .from("memo")
    .select("id, title, status, start_date, end_date, is_important, updated_at")
    .eq("user_id", userId)
    .eq("memo_type", "todo")
    .neq("status", "completed")
    .lte("start_date", today);
  if (error) throw error;
  return (data ?? []) as TodoRow[];
}

// 재생성 가능 여부를 판단하는 입력 해시 (Pin 여부는 제외)
export function hashFocusInput(candidates: TodoRow[]): string {
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((t) => `${t.id}:${t.status}:${t.start_date}:${t.end_date}:${t.is_important}`).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function buildFocusResult(candidates: TodoRow[], today: string): FocusResult {
  const ranked = candidates
    .map((t) => ({ todo: t, reason: classify(t, today) }))
    .sort((a, b) => {
      const orderDiff = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
      if (orderDiff !== 0) return orderDiff;
      const subDiff = subRank(a.todo, a.reason, today) - subRank(b.todo, b.reason, today);
      if (subDiff !== 0) return subDiff;
      // 동일 조건일 때만 적용하는 tie-breaker — is_important는 등급 자체를 뒤집지 않는다.
      if (a.todo.is_important !== b.todo.is_important) return a.todo.is_important ? -1 : 1;
      const startDiff = a.todo.start_date.localeCompare(b.todo.start_date);
      if (startDiff !== 0) return startDiff;
      return b.todo.updated_at.localeCompare(a.todo.updated_at);
    })
    .slice(0, 3);

  return {
    items: ranked.map(({ todo, reason }, i) => ({
      rank: i + 1,
      title: (todo.is_important ? "★ " : "") + todo.title,
      meta: `Todo · ${STATUS_LABEL[todo.status ?? "planned"]} · ${dDayLabel(todo.end_date, today)}`,
      reason: REASON_TEXT[reason],
      memoId: todo.id,
      endDate: todo.end_date,
    })),
  };
}
