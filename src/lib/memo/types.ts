export type MemoType = "todo" | "dev_note" | "free_note";
export type TodoStatus = "planned" | "in_progress" | "completed";
export type SourceType = "news" | "job" | "manual" | "ai_smart_direction";
export type MemoColor = "yellow" | "pink" | "green" | "blue" | "purple" | "white" | "black" | "darkgray";

// 🔴 메모지 색 8종의 **정본**. 예전엔 이 목록이 코드에 세 벌이었다:
//   ① 위 MemoColor 유니온  ② Dashboard.tsx의 문자열 배열(ColorSwatches용)
//   ③ MemoRichEditor.tsx의 {value,hex,label} 배열(모바일 툴바 팔레트용)
// 색을 하나 늘리면 세 곳을 같이 고쳐야 했고, 이 프로젝트가 반복해서 밟은 함정이 정확히 그거다
// (CLAUDE.md 지뢰표 "메모지 색은 세 벌이다"). 순서·집합을 여기 한 벌만 두고 둘이 참조한다.
//
// ⚠️ hex는 **라이트 테마 값**이고 모바일 툴바 팔레트 dot에만 쓰인다. 실제 메모지 색은
//    dashboard.css의 `.postit.cN` / `.swatch.<name>`(라이트 8-A · 다크 8-B)가 그린다 —
//    여기 hex를 고쳐도 메모지 색은 안 바뀐다. 메모지 색을 바꾸려면 CSS를 봐라.
export const MEMO_COLOR_OPTIONS: readonly { value: MemoColor; hex: string; label: string }[] = [
  { value: "yellow", hex: "#fbe9b8", label: "노랑" },
  { value: "pink", hex: "#ffd6ea", label: "분홍" },
  { value: "green", hex: "#d3ecc9", label: "초록" },
  { value: "blue", hex: "#c9deff", label: "파랑" },
  { value: "purple", hex: "#ddd0ff", label: "보라" },
  { value: "white", hex: "#f6f6f6", label: "흰색" },
  { value: "black", hex: "#17171a", label: "검정" },
  { value: "darkgray", hex: "#3a3a40", label: "진회색" },
];
export const MEMO_COLORS: readonly MemoColor[] = MEMO_COLOR_OPTIONS.map((c) => c.value);
// 새로 만드는 메모의 기본 메모지 색(사용자 요청 2026-08-30). 생성 경로가 둘이라 — 클라이언트의
// `openCreateMemoForm`(먼슬리 +Create)과 서버의 `saveBlockToMemo`(뉴스·채용·AI트렌드 "메모로
// 저장" → + 새 메모 생성) — 값을 여기 한 벌만 두고 양쪽이 참조한다. 두 벌이면 한쪽만 바뀐다.
// **테마에 따라 다르다** — 다크에서는 블랙, 라이트에서는 예전 그대로 노랑이다.
//
// 🔴 테마는 `localStorage('skillpilot_theme')`에만 있어서 **서버는 못 읽는다**(layout.tsx 인라인
// 스크립트가 그 값으로 <html data-theme>을 칠한다). 그래서 서버 생성 경로(`saveBlockToMemo` —
// 뉴스·채용·AI트렌드 "메모로 저장 → + 새 메모 생성")는 **클라이언트가 색을 실어 보낸다.**
// 서버 기본값은 예전 값(yellow)으로 남겨 색이 안 실려 온 호출을 안전하게 받는다.
export function defaultMemoColor(theme: "light" | "dark"): MemoColor {
  return theme === "dark" ? "black" : "yellow";
}
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
