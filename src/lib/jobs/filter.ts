import { JOB_ROLE_CONFIG, JOB_ROLE_ORDER, ROLE_SCORING_SPEC, type JobRole, type RoleScoringSpec, type SemanticGroup } from "./roles.ts";
import type { ExtractedJobFields } from "./extract-fields";

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

// ── 1) 교육/국비/부트캠프/비개발 Hard Filter (지시서 7절) — Role Scoring보다 먼저 실행한다 ──────────
// 고용형태 exact match(7-1) — 가장 신뢰도 높은 신호. 짧고 강한 단어라도 여기(고용형태 필드 하나)에서만 본다.
const TRAINING_EMPLOYMENT_TERMS = ["연수생", "교육생", "훈련생", "수강생"];

// 제목/모집분야의 강한 training signal(7-2) — title/role/source_category에서만 본다. preferred_text나
// 본문 전체에서 보면 "교육비 지원" 같은 정상 복지 문구까지 걸려서 정상 개발공고를 오탈락시킨다(7-4).
const TRAINING_IDENTITY_TERMS = [
  "국비지원", "국비 전액", "전액국비", "전액무료", "무료교육", "교육생 모집", "연수생 모집", "훈련생 모집",
  "수강생 모집", "취업교육", "취업과정", "취업지원과정", "부트캠프", "K-Digital", "KDT", "아카데미 과정",
  "개발자 양성과정", "교육과정 모집",
];
// "국비"는 위 "국비지원"/"국비 전액"보다 짧아 오탐 폭이 넓다 — title/role/source_category에서만 쓰는 건
// 동일하지만 별도 목록으로 분리해 둔다(28절 — 짧고 강한 단어는 identity 필드에서만).
const TRAINING_IDENTITY_SHORT_TERMS = ["국비"];

// 비개발 교육직(7-3) — 강사/운영/상담/컨설턴트는 AI 키워드가 아무리 많아도 개발 직무가 아니다.
const NON_DEV_TRAINING_TITLE_TERMS = [
  "AI 강사", "IT 강사", "교강사", "교·강사", "부트캠프 강사", "교육운영", "교육상담", "교육행정",
  "부트캠프 운영", "커리어 컨설턴트", "취업 컨설턴트",
];

export function isTrainingOrNonJob(fields: ExtractedJobFields): boolean {
  const employment = fields.employment_type ?? "";
  if (TRAINING_EMPLOYMENT_TERMS.some((t) => containsTerm(employment, t))) return true;

  // identity 필드만 — preferred_text/본문 전체의 "교육비 지원" 같은 정상 문구를 절대 섞지 않는다(7-4 금지).
  const identityText = [fields.title, fields.role, fields.source_category ?? ""].join(" ");
  if (TRAINING_IDENTITY_TERMS.some((t) => containsTerm(identityText, t))) return true;
  if (TRAINING_IDENTITY_SHORT_TERMS.some((t) => containsTerm(identityText, t))) return true;
  if (NON_DEV_TRAINING_TITLE_TERMS.some((t) => containsTerm(identityText, t))) return true;
  return false;
}

// ── 2) Non-target Developer Hard Filter(8절) — Frontend/PM/기획/디자인/QA/마케팅/영업/HR ─────────
// title/role만 본다 — 본문에 React가 한 번 언급된다고 reject하지 않는다.
const NON_TARGET_TITLE_TERMS = [
  "Frontend Engineer", "Front-end Engineer", "프론트엔드", "React Developer", "Next.js Developer",
  "Web Frontend", "UI Engineer", "Web Publisher",
  "Product Manager", "PM", "PO", "서비스기획", "AI기획", "Product Designer", "UX/UI Designer",
  "QA", "Tester", "마케팅", "영업", "HR", "Recruiter",
];
export function isNonTargetTitle(fields: ExtractedJobFields): boolean {
  const text = `${fields.title} ${fields.role}`;
  return NON_TARGET_TITLE_TERMS.some((t) => containsTerm(text, t));
}

// generate.ts가 Role Scoring 전에 먼저 호출하는 결합 Hard Filter(3절 파이프라인 순서).
export function passesHardFilter(fields: ExtractedJobFields): boolean {
  return !isTrainingOrNonJob(fields) && !isNonTargetTitle(fields);
}

// ── 3) Role Semantic Scoring(10/11/12절) ────────────────────────────────────────────────────
type ScoringField = "title" | "responsibilities" | "required_text" | "preferred_text" | "tech_skills";
const FIELD_WEIGHT: Record<ScoringField, number> = {
  title: 6, responsibilities: 4, required_text: 3, preferred_text: 1, tech_skills: 1,
};
// gate 판정에는 preferred_text를 절대 넣지 않는다 — "LLM 경험 우대" 한 줄만으로 통과시키지 않기 위함(11절 각 Gate 공통).
const GATE_BODY_FIELDS: ScoringField[] = ["responsibilities", "required_text", "tech_skills"];

function fieldValue(fields: ExtractedJobFields, field: ScoringField): string {
  if (field === "tech_skills") return (fields.tech_skills ?? []).join(" ");
  return fields[field] as string;
}

// group 안 term이 한 field에서 여러 번 매칭돼도, 그 field가 기여하는 값은 FIELD_WEIGHT 한 번뿐이다.
// "그 group이 매칭된 field 중 가장 높은 fieldWeight" 하나만 취해 group.weight를 곱한다(10-2 keyword stuffing 방지).
function scoreGroup(fields: ExtractedJobFields, group: SemanticGroup): number {
  let strongestFieldWeight = 0;
  for (const field of Object.keys(FIELD_WEIGHT) as ScoringField[]) {
    if (group.terms.some((t) => containsTerm(fieldValue(fields, field), t))) {
      strongestFieldWeight = Math.max(strongestFieldWeight, FIELD_WEIGHT[field]);
    }
  }
  return strongestFieldWeight * group.weight;
}

function scoreRole(fields: ExtractedJobFields, spec: RoleScoringSpec): number {
  return scoreGroup(fields, spec.identity) + spec.groups.reduce((sum, g) => sum + scoreGroup(fields, g), 0);
}

function groupMatchedInBody(fields: ExtractedJobFields, group: SemanticGroup): boolean {
  return GATE_BODY_FIELDS.some((f) => group.terms.some((t) => containsTerm(fieldValue(fields, f), t)));
}
function titleHasIdentity(fields: ExtractedJobFields, spec: RoleScoringSpec): boolean {
  return spec.identity.terms.some((t) => containsTerm(fields.title, t));
}

// ── Role Gate(11절) — 각 role의 "단순 언급"과 "실제 업무 신호"를 구분한다 ────────────────────────
function llmAgentGate(fields: ExtractedJobFields, spec: RoleScoringSpec): boolean {
  const [agent, retrieval, orchestration, llmEngineering] = spec.groups;
  const hasAgent = groupMatchedInBody(fields, agent);
  const hasRetrieval = groupMatchedInBody(fields, retrieval);
  const hasOrchestration = groupMatchedInBody(fields, orchestration);
  const hasLlmEngineering = groupMatchedInBody(fields, llmEngineering);
  if (titleHasIdentity(fields, spec) && (hasAgent || hasRetrieval || hasOrchestration || hasLlmEngineering)) return true;
  const matchedGroupCount = [hasAgent, hasRetrieval, hasOrchestration, hasLlmEngineering].filter(Boolean).length;
  return matchedGroupCount >= 2 && (hasAgent || hasRetrieval);
}

function appliedAiMlGate(fields: ExtractedJobFields, spec: RoleScoringSpec): boolean {
  const [modelDev, appliedDomain, framework, evaluation] = spec.groups;
  const hasModelDev = groupMatchedInBody(fields, modelDev);
  const hasAppliedDomain = groupMatchedInBody(fields, appliedDomain);
  const hasFramework = groupMatchedInBody(fields, framework);
  const hasEvaluation = groupMatchedInBody(fields, evaluation);
  // Python/PyTorch(framework) 하나만으로는 통과 못 한다 — 두 경로 모두 modelDev 또는 appliedDomain을 요구한다.
  if (titleHasIdentity(fields, spec) && (hasModelDev || hasAppliedDomain)) return true;
  return hasModelDev && (hasAppliedDomain || hasFramework || hasEvaluation);
}

function mlopsGate(fields: ExtractedJobFields, spec: RoleScoringSpec): boolean {
  const [serving, pipeline, infra, operations] = spec.groups;
  const hasServing = groupMatchedInBody(fields, serving);
  const hasPipeline = groupMatchedInBody(fields, pipeline);
  const hasInfra = groupMatchedInBody(fields, infra);
  const hasOperations = groupMatchedInBody(fields, operations);
  if (titleHasIdentity(fields, spec) && (hasServing || hasPipeline || hasInfra)) return true;
  // 일반 DevOps(Docker+K8s+AWS+CI/CD만)는 infra/operations만 있고 serving/pipeline이 없어 여기서 걸린다.
  return (hasServing || hasPipeline) && (hasInfra || hasOperations);
}

function aiServiceBackendGate(fields: ExtractedJobFields, spec: RoleScoringSpec): boolean {
  const [aiIntegration, backendApi] = spec.groups;
  const aiSide = titleHasIdentity(fields, spec) || groupMatchedInBody(fields, aiIntegration);
  const backendSide = groupMatchedInBody(fields, backendApi);
  // 반드시 AND — 일반 FastAPI/Django/PostgreSQL backend는 AI 신호 없으면 aiSide가 false라 제외된다.
  return aiSide && backendSide;
}

const ROLE_GATES: Record<JobRole, (fields: ExtractedJobFields, spec: RoleScoringSpec) => boolean> = {
  llm_ai_agent: llmAgentGate,
  applied_ai_ml: appliedAiMlGate,
  ai_platform_mlops: mlopsGate,
  ai_service_backend: aiServiceBackendGate,
};

// role별 전체 semantic score가 이 값 미만이면 "단순 언급"으로 보고 적합 공고로 인정하지 않는다(10-3절).
const MIN_ROLE_SCORE = 18;

export type RoleClassification = {
  primaryRole: JobRole | null;
  roleScores: Record<JobRole, number>;
  eligibleRoles: JobRole[];
};

// 공고 상세 필드 기준으로 4개 role 전부를 채점한다(13절) — score >= 18 AND role gate 둘 다 통과해야 eligible.
// 호출 전에 반드시 passesHardFilter로 교육/비개발 공고를 먼저 걸러야 한다(파이프라인 순서, 3절).
export function classifyJobRoles(fields: ExtractedJobFields, allowed: readonly JobRole[] = JOB_ROLE_ORDER): RoleClassification {
  const roleScores = {} as Record<JobRole, number>;
  const eligibleRoles: JobRole[] = [];
  for (const role of JOB_ROLE_ORDER) {
    if (!allowed.includes(role)) { roleScores[role] = 0; continue; }
    const spec = ROLE_SCORING_SPEC[role];
    const score = scoreRole(fields, spec);
    roleScores[role] = score;
    if (score >= MIN_ROLE_SCORE && ROLE_GATES[role](fields, spec)) eligibleRoles.push(role);
  }
  // eligibleRoles는 이미 JOB_ROLE_ORDER 순서로 쌓였으므로, 엄격한 ">" 비교만으로 동점 시 canonical
  // order의 앞선 role이 자동으로 유지된다(13절 "동점이면 기존 JOB_ROLE_ORDER").
  let primaryRole: JobRole | null = null;
  for (const role of eligibleRoles) {
    if (!primaryRole || roleScores[role] > roleScores[primaryRole]) primaryRole = role;
  }
  return { primaryRole, roleScores, eligibleRoles };
}

// 특정 직무 기준 적합도 — quota 배분 시 직무별 정렬/backfill/과거 공고 재순환 점수에 쓴다(gate 미통과면 0).
export function roleFitScore(fields: ExtractedJobFields, role: JobRole): number {
  const { roleScores, eligibleRoles } = classifyJobRoles(fields, [role]);
  return eligibleRoles.includes(role) ? roleScores[role] : 0;
}

function matchedKeywordCount(text: string, keywords: string[]): number {
  return keywords.filter((k) => containsTerm(text, k)).length;
}

// 검색 스니펫(title+content) 랭킹 전용 — 상세 파싱 전이라 구조화된 필드가 없다. 최종 분류(classifyJobRoles)와는
// 무관하게 "어떤 후보를 먼저 상세 조회할지"만 대략 정렬하는 용도라 단순 keyword count로 충분하다(27절 TASK2).
export function snippetFitScore(text: string, role: JobRole): number {
  return matchedKeywordCount(text, JOB_ROLE_CONFIG[role].keywords);
}
