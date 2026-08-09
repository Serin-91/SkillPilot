import type { ContentFormat } from "@/lib/memo/types";

// 31절 — 상세 보기 전용 읽기 전용 렌더러. content는 항상 Tiptap 에디터 자신이 만든 HTML이거나
// 서버가 직접 구성한 고정 템플릿(sourceBlockHtml)뿐이라 스키마 밖 태그가 섞일 여지가 없다.
export function RichMemoContent({ content, format, emptyText, className }: {
  content: string | null;
  format: ContentFormat;
  emptyText?: string;
  className?: string;
}) {
  if (!content) return <div className={className}>{emptyText ?? "(내용 없음)"}</div>;
  if (format === "plain") {
    return <div className={className} style={{ whiteSpace: "pre-wrap" }}>{content}</div>;
  }
  return <div className={`${className ?? ""} rich-content-view`} dangerouslySetInnerHTML={{ __html: content }} />;
}
