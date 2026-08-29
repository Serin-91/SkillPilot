export type MemoType = "todo" | "dev_note" | "free_note";
export type TodoStatus = "planned" | "in_progress" | "completed";
export type SourceType = "news" | "job" | "manual" | "ai_smart_direction";
export type MemoColor = "yellow" | "pink" | "green" | "blue" | "purple" | "white" | "black" | "darkgray";
// 새로 만드는 메모의 기본 메모지 색(사용자 요청 2026-08-30). 생성 경로가 둘이라 — 클라이언트의
// `openCreateMemoForm`(먼슬리 +Create)과 서버의 `saveBlockToMemo`(뉴스·채용·AI트렌드 "메모로
// 저장" → + 새 메모 생성) — 값을 여기 한 벌만 두고 양쪽이 참조한다. 두 벌이면 한쪽만 바뀐다.
export const DEFAULT_MEMO_COLOR: MemoColor = "black";
export type ContentFormat = "plain" | "rich_html";
export type ContentMode = "quick" | "document";

export type Memo = {
  id: string;
  title: string;
  content: string | null;
  content_format: ContentFormat;
  content_mode: ContentMode;
  emoji: string | null;
  memo_type: MemoType;
  status: TodoStatus | null;
  start_date: string;
  end_date: string;
  color: MemoColor;
  is_important: boolean;
  is_pinned: boolean;
  pinned_at: string | null;
  pin_order: number | null;
  auto_number: number | null;
  is_auto_title: boolean;
  created_at: string;
  updated_at: string;
};

export type MemoSource = {
  id: string;
  memo_id: string;
  source_type: SourceType;
  source_id: string | null;
  source_title: string | null;
  source_url: string | null;
  selected_text: string;
  added_at: string;
};
