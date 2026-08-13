// 원티드·점핏·잡코리아 셋 다 페이지 자체에 구조화된 필드가 있어 직접 파싱한다(wanted.ts/jumpit.ts/jobkorea.ts) —
// 이 타입만 셋의 공용 반환 스키마로 남기고, Gemini로 뽑던 나머지 사이트 지원은 뺐다(무료 할당량 안 쓰는 쪽으로 정리).
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
  // 2026-08-13 AI 중심 개편(3소스 재구축) — 기존 필드는 그대로 두고 source별로 있을 때만 채우는
  // optional 필드만 추가한다(5절). 없는 source는 그냥 undefined로 둔다.
  tech_skills?: string[];
  employment_type?: string | null; // 고용형태 — training hard filter가 최우선으로 보는 필드(7-1절)
  source_status?: string | null; // 원티드 status 원문("active"/"close" 등, 실제 조회로 확인함)
  source_category?: string | null; // 잡코리아/점핏 카테고리 — scoring에는 절대 안 쓴다(discovery 힌트 전용)
  source_job_id?: string | null;
};
