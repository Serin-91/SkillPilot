// 원티드·점핏 둘 다 페이지 자체에 구조화된 필드가 있어 직접 파싱한다(wanted.ts/jumpit.ts) — 이 타입만
// 그 둘의 공용 반환 스키마로 남기고, Gemini로 뽑던 나머지 사이트 지원은 뺐다(무료 할당량 안 쓰는 쪽으로 정리).
export type ExtractedJobFields = {
  is_job_posting: boolean;
  company: string;
  title: string;
  role: string;
  responsibilities: string;
  required_text: string;
  preferred_text: string;
  career_requirement: string;
  deadline: string | null;
  posted_at: string | null;
  date_confidence: "high" | "medium" | "low" | "unknown";
};
