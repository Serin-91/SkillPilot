export type MemoType = "todo" | "dev_note" | "free_note";
export type TodoStatus = "planned" | "in_progress" | "completed";
export type SourceType = "news" | "job" | "manual" | "ai_smart_direction";
export type MemoColor = "yellow" | "pink" | "green" | "blue" | "purple" | "white" | "black" | "darkgray";
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
