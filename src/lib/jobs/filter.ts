import { AI_CORE_TERMS, JOB_ROLE_CONFIG, JOB_ROLE_ORDER, backendSignalTerms, type JobRole } from "./roles.ts";
import type { ExtractedJobFields } from "./extract-fields";

// 2026-08-13 AI 중심 개편 — 단순 keyword-includes count를 구조화 필드 weighted scoring으로 교체했다.
// title/role이 본문(우대사항)보다 반드시 강하게 반영되도록 필드별 가중치를 둔다(9절).
const FIELD_WEIGHTS: [keyof ExtractedJobFields, number][] = [
  ["title", 5],
  ["role", 4],
  ["responsibilities", 2],
  ["required_text", 1.5],
  ["preferred_text", 1],
];

// AI core gate에는 preferred_text를 넣지 않는다 — "LLM 경험 우대" 한 줄만으로 AI 직군 통과시키지 않기 위함(14/30절).
const GATE_FIELDS: (keyof ExtractedJobFields)[] = ["title", "role", "responsibilities", "required_text"];

// 4글자 이하 영문/숫자 keyword(AI, ML, RAG, NLP, CV 등)는 단어 경계를 확인해 무관한 단어 일부에 우연히
// 붙는 오탐을 막는다. 그 외(한글, 긴 구문)는 기존처럼 단순 부분일치로 충분하다.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function containsTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  if (/^[a-z0-9+#.\-]+$/i.test(term) && term.length <= 4) {
    const escaped = escapeRegExp(needle);
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
  }
  return haystack.includes(needle);
}

function matchedKeywordCount(text: string, keywords: string[]): number {
  return keywords.filter((k) => containsTerm(text, k)).length;
}

function weightedScore(fields: ExtractedJobFields, keywords: string[]): number {
  return FIELD_WEIGHTS.reduce((sum, [field, weight]) => sum + weight * matchedKeywordCount(fields[field] as string, keywords), 0);
}

function hasAiCoreSignal(fields: ExtractedJobFields): boolean {
  const gateText = GATE_FIELDS.map((f) => fields[f] as string).join(" ");
  return AI_CORE_TERMS.some((term) => containsTerm(gateText, term));
}

// 직무명 자체가 프론트엔드면 팀/제품 이름에 "MLOps"/"AI Platform" 같은 문구가 붙어 있어도 무조건 제외한다
// (14절 — "Frontend Engineer (MLOps, Vision AI Platform)"처럼 title에 AI core term이 우연히 섞여도
// 실제 업무가 React/UI라면 통과시키면 안 된다. 회사가 AI라는 이유만으로 포함하지 않는다).
const FRONTEND_TITLE_EXCLUDE_TERMS = [
  "Frontend Engineer", "Front-end Engineer", "프론트엔드", "React Developer", "Next.js Developer",
  "Web Frontend", "UI Engineer", "Web Publisher",
];
function isGenericFrontendTitle(fields: ExtractedJobFields): boolean {
  const text = `${fields.title} ${fields.role}`;
  return FRONTEND_TITLE_EXCLUDE_TERMS.some((term) => containsTerm(text, term));
}

// role별 전체 weighted score가 이 값 미만이면 "단순 언급"으로 보고 적합 공고로 인정하지 않는다.
const MIN_SCORE = 4;
// ai_service_backend AND gate — AI core를 통과해도 backend/service 신호가 이 값 미만이면 제외한다(1절 P0).
const BACKEND_MIN_SCORE = 2;

function passesRoleGate(fields: ExtractedJobFields, role: JobRole, score: number): boolean {
  if (score < MIN_SCORE) return false;
  if (role === "ai_service_backend") {
    const backendScore = weightedScore(fields, backendSignalTerms(role));
    if (backendScore < BACKEND_MIN_SCORE) return false;
  }
  return true;
}

// 공고 상세 필드 기준으로 가장 잘 맞는 직무를 고른다. AI core gate를 통과 못 하면(제목/직무/업무/자격요건
// 어디에도 AI 핵심 신호가 없으면) 무조건 null — 일반 Frontend/Backend/Data 공고가 여기서 걸러진다.
export function classifyJobRole(fields: ExtractedJobFields, allowed: readonly JobRole[] = JOB_ROLE_ORDER): { role: JobRole; score: number } | null {
  if (isGenericFrontendTitle(fields)) return null;
  if (!hasAiCoreSignal(fields)) return null;
  let best: { role: JobRole; score: number } | null = null;
  for (const role of allowed) {
    const score = weightedScore(fields, JOB_ROLE_CONFIG[role].keywords);
    if (!passesRoleGate(fields, role, score)) continue;
    if (!best || score > best.score) best = { role, score };
  }
  return best;
}

// 특정 직무 기준 적합도 — quota 배분 시 직무별 정렬/backfill에 쓴다(gate 미통과면 0).
export function roleFitScore(fields: ExtractedJobFields, role: JobRole): number {
  if (isGenericFrontendTitle(fields)) return 0;
  if (!hasAiCoreSignal(fields)) return 0;
  const score = weightedScore(fields, JOB_ROLE_CONFIG[role].keywords);
  return passesRoleGate(fields, role, score) ? score : 0;
}

// 검색 스니펫(title+content) 랭킹 전용 — 상세 파싱 전이라 구조화된 필드가 없다. 최종 분류와는 무관하게
// "어떤 후보를 먼저 상세 조회할지"만 대략 정렬하는 용도라 기존처럼 단순 keyword count로 충분하다.
export function snippetFitScore(text: string, role: JobRole): number {
  return matchedKeywordCount(text, JOB_ROLE_CONFIG[role].keywords);
}
