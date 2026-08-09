import type { ContentFormat } from "@/lib/memo/types";

// UI 최종 지시서 0절 — 상태값 4종 확정 (검토중/보류 제거, 공백 혼용 금지)
export const PROJECT_STATUSES = ["아이디어", "기획안작성", "개발중", "완료"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectIdea = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  content_md: string | null;
  content_format: ContentFormat;
  created_at: string;
  updated_at: string;
};
