// 관심 직무 4종의 단일 source of truth — 화면 label과 저장용 slug를 분리한다(JOB_INTEREST_SPEC).
// 검색 query / 분류 키워드까지 여기 한 곳에서만 정의하고, 수집·분류·UI가 전부 이걸 참조한다.
// 2026-08-13 AI 중심 개편(SkillPilot_AI_Job_Rebuild) — 기존 backend/frontend/ai_ml/data_engineer는
// LEGACY_JOB_ROLES로만 남기고 신규 저장값에서는 완전히 폐기했다.

export const JOB_ROLE_ORDER = ["llm_ai_agent", "applied_ai_ml", "ai_platform_mlops", "ai_service_backend"] as const;
export type JobRole = (typeof JOB_ROLE_ORDER)[number];

// 기존 사용자 감지·과거 DB row 안전 처리용으로만 남긴다 — 신규 옵션에 넣지 않고 UI에 노출하지 않는다.
export const LEGACY_JOB_ROLES = ["backend", "frontend", "ai_ml", "data_engineer"] as const;
export type LegacyJobRole = (typeof LEGACY_JOB_ROLES)[number];

export const JOB_ROLE_CONFIG: Record<JobRole, {
  label: string;
  description: string;
  skills: string[];
  skillsBreakBefore?: string;
  searchQuery: string;
  keywords: string[];
}> = {
  llm_ai_agent: {
    label: "LLM·AI Agent Engineer",
    description: "LLM, RAG, AI Agent를 활용해 생성형 AI\n서비스와 에이전트 워크플로를 개발하는 직무",
    skills: ["LLM", "RAG", "AI Agent", "LangGraph", "MCP"],
    searchQuery:
      '"LLM 엔지니어" OR "AI Agent Engineer" OR "AI 에이전트" OR "Agentic AI" OR "생성형 AI 개발자" OR "RAG 개발자" 채용',
    keywords: [
      "LLM", "Generative AI", "GenAI", "생성형 AI", "AI Agent", "Agentic AI", "Multi-Agent", "AI 에이전트",
      "RAG", "GraphRAG", "Embedding", "Vector DB", "LangChain", "LangGraph", "LlamaIndex", "MCP",
      "Tool Calling", "Function Calling", "Prompt Engineering", "Context Engineering", "Agent Workflow",
      "Orchestration", "Langfuse", "LangSmith", "Fine-tuning", "LoRA", "PEFT", "LLM Evaluation",
    ],
  },
  applied_ai_ml: {
    label: "Applied AI·ML Engineer",
    description: "머신러닝·딥러닝 모델과 AI 기술을 실제\n제품과 서비스 문제에 적용하는 직무",
    skills: ["Python", "PyTorch", "ML·DL", "NLP·CV", "Fine-tuning"],
    searchQuery:
      '"AI Engineer" OR "AI/ML Engineer" OR "Machine Learning Engineer" OR "ML Engineer" OR "Applied AI" OR "Applied Machine Learning" 채용',
    keywords: [
      "AI Engineer", "AI/ML Engineer", "Machine Learning Engineer", "ML Engineer", "Applied AI",
      "Applied Machine Learning", "Machine Learning", "Deep Learning", "머신러닝", "딥러닝", "PyTorch",
      "TensorFlow", "JAX", "Transformers", "Hugging Face", "Model Training", "모델 학습", "Fine-tuning",
      "Inference", "NLP", "Computer Vision", "Recommendation", "Ranking", "Forecasting",
      "Feature Engineering", "Model Evaluation",
    ],
  },
  ai_platform_mlops: {
    label: "AI Platform·MLOps Engineer",
    description: "AI 모델과 Agent의 배포·서빙·운영을 위한\n플랫폼과 MLOps 인프라를 개발하는 직무",
    skills: ["MLOps", "LLMOps", "Model Serving", "Docker·K8s", "MLflow"],
    searchQuery:
      '"AI Platform Engineer" OR "ML Platform Engineer" OR "MLOps Engineer" OR "LLMOps Engineer" OR "Model Serving" OR "AI 인프라" 채용',
    keywords: [
      "AI Platform Engineer", "ML Platform Engineer", "MLOps Engineer", "LLMOps Engineer", "MLOps", "LLMOps",
      "AI Infrastructure", "ML Infrastructure", "AI 인프라", "Model Serving", "Inference Serving",
      "Model Deployment", "Training Pipeline", "Inference Pipeline", "MLflow", "Kubeflow", "Kubernetes",
      "Docker", "Ray", "vLLM", "SGLang", "Triton", "SageMaker", "Observability", "GPU", "Model Monitoring",
    ],
  },
  ai_service_backend: {
    label: "AI Service·Backend Engineer",
    description: "AI 모델과 LLM 기능을 API·백엔드\n시스템에 연결해 실제 AI 서비스를 구현하는 직무",
    skills: ["Python", "FastAPI", "API", "AI Integration", "PostgreSQL"],
    searchQuery:
      '"AI Backend Engineer" OR "AI Service Backend Engineer" OR "AI 서비스 개발자" OR "AI 서비스 백엔드" OR "LLM Backend Engineer" 채용',
    keywords: [
      "AI Backend Engineer", "AI Service Backend Engineer", "AI 서비스 개발자", "AI 서비스 백엔드",
      "LLM Backend Engineer", "AI Integration", "AI API", "AI Service Architecture", "LLM API", "Model API",
      // backend/service 하위 term — ai_service_backend AND gate에서 "AI core 통과 + 아래 term 존재"를 함께 요구한다.
      "Python Backend", "FastAPI", "Django", "REST API", "Async Processing", "Queue", "Worker",
      "PostgreSQL", "Redis", "Service Integration",
    ],
  },
};

// 잡코리아 검색(stext) discovery query — role별 검색이며, 사이트 카테고리(AI잡스 등)는 discovery 힌트일 뿐
// 최종 분류 근거로 쓰지 않는다(4-3절). Wanted처럼 정확한 phrase 매칭 연산자를 지원하지 않아 공백 구분
// 키워드 조합으로 충분하다(실제 검색으로 확인함). Primary — identity 중심.
export const JOBKOREA_SEARCH_QUERY: Record<JobRole, string> = {
  llm_ai_agent: "AI Agent Engineer LLM RAG",
  applied_ai_ml: "AI ML Engineer PyTorch NLP",
  ai_platform_mlops: "MLOps AI Platform Engineer Kubernetes",
  ai_service_backend: "AI Backend Engineer FastAPI",
};

// 2026-08-13 보완(P1) — Primary discovery만으로는 "AI Agent Engineer" 같은 identity 문구가 title에
// 없는 공고(예: "Backend Engineer"인데 본문에 RAG/LangGraph가 있는 경우)를 못 찾는다. Expansion은
// role/title 자체보다 넓은 상위 직군 + 핵심 기술 키워드 조합으로 검색해 그런 공고를 추가로 발견한다.
// Primary로 role target을 채우면 호출하지 않는다(generate.ts) — 직무당 최대 2단계만 쓴다.
export const WANTED_EXPANSION_QUERY: Record<JobRole, string> = {
  llm_ai_agent:
    '"AI Engineer" OR "Backend Engineer" OR "Platform Engineer" LLM RAG LangGraph "Agentic AI" 채용',
  applied_ai_ml:
    '"AI Engineer" "Deep Learning" NLP "Computer Vision" Recommendation Ranking "model training" 채용',
  ai_platform_mlops:
    '"Backend Engineer" OR "Platform Engineer" "Model Serving" Inference GPU MLflow Kubeflow 채용',
  ai_service_backend:
    '"Backend Engineer" OR "Python Backend" LLM RAG Agent FastAPI "AI Platform" 채용',
};

export const JOBKOREA_EXPANSION_QUERY: Record<JobRole, string> = {
  llm_ai_agent: "AI Engineer Backend Platform LLM RAG LangGraph Agentic AI",
  applied_ai_ml: "AI Engineer Deep Learning NLP Computer Vision Recommendation model training",
  ai_platform_mlops: "Backend Platform Engineer Model Serving Inference GPU MLflow Kubeflow",
  ai_service_backend: "Backend Engineer Python Backend LLM RAG Agent FastAPI AI Platform",
};

// 2026-08-13 3소스 재구축(SkillPilot_AI_Job_Rebuild_2) — role별 semantic group scoring(10/11절).
// 이전 AI_CORE_TERMS 단일 공통 게이트 + backendSignalTerms AND gate는 role별 gate로 대체되어 폐기했다.
// group마다 weight를 두고, 같은 group 안 term이 여러 번 매칭돼도 group 점수는 한 번만 낸다(filter.ts).
export type SemanticGroup = { id: string; weight: number; terms: string[] };
export type RoleScoringSpec = { identity: SemanticGroup; groups: SemanticGroup[] };

export const ROLE_SCORING_SPEC: Record<JobRole, RoleScoringSpec> = {
  llm_ai_agent: {
    identity: { id: "identity", weight: 4, terms: [
      "LLM Engineer", "AI Agent Engineer", "Generative AI Engineer", "생성형 AI 개발자", "RAG Engineer", "AI 에이전트 개발자",
    ] },
    groups: [
      // "AI 에이전트"는 지시서 11절 원문 목록에는 없지만, 실제 잡코리아 라이브 공고("AI Agent 엔지니어",
      // 본문 "AI 에이전트 설계/구축")로 채점해보니 이 한글 표기가 없으면 0점 처리되는 것을 확인해 추가했다
      // (30절 live smoke, 옛 keywords 목록에도 있던 term — 새 spec으로 옮기며 누락됐던 것).
      { id: "agent", weight: 3, terms: ["AI Agent", "AI 에이전트", "Agentic AI", "Multi-Agent", "A2A", "LangGraph", "Agent Workflow", "Agent Orchestration"] },
      { id: "retrieval", weight: 3, terms: ["RAG", "GraphRAG", "Embedding", "Vector DB", "Vector Database", "Retrieval", "Hybrid Search"] },
      { id: "orchestration", weight: 2, terms: ["MCP", "Model Context Protocol", "Tool Calling", "Function Calling", "LangChain", "LlamaIndex", "LangFlow"] },
      // bare "LLM"도 마찬가지로 옛 keywords에는 있었는데 새 spec 11절 원문 목록에서 빠졌다 — weight 1로
      // 보수적으로 추가한다(단독으로는 약한 신호지만 완전히 무시하면 실제 LLM 공고를 놓친다, 30절 live smoke).
      { id: "llmEngineering", weight: 1, terms: ["LLM", "LLM Evaluation", "Langfuse", "LangSmith", "Prompt Engineering", "Context Engineering", "LoRA", "PEFT", "LLM Fine-tuning"] },
    ],
  },
  applied_ai_ml: {
    identity: { id: "identity", weight: 4, terms: [
      "AI/ML Engineer", "Machine Learning Engineer", "ML Engineer", "Applied AI", "Applied Machine Learning", "AI Engineer",
    ] },
    groups: [
      // "머신러닝"/"딥러닝" 한글 표기도 옛 keywords에 있던 term — 새 spec 11절 원문에서 빠져 있었다.
      { id: "modelDev", weight: 3, terms: ["Machine Learning", "머신러닝", "Deep Learning", "딥러닝", "model training", "모델 학습", "Fine-tuning", "training model", "학습 파이프라인"] },
      { id: "appliedDomain", weight: 3, terms: ["NLP", "Computer Vision", "CV", "Recommendation", "Ranking", "Forecasting", "Speech", "TTS", "STT", "Object Detection", "Multimodal"] },
      { id: "framework", weight: 2, terms: ["PyTorch", "TensorFlow", "JAX", "Transformers", "Hugging Face", "Scikit-Learn"] },
      { id: "evaluation", weight: 1, terms: ["Model Evaluation", "모델 평가", "Feature Engineering", "Hyperparameter", "Inference", "Experiment Tracking"] },
    ],
  },
  ai_platform_mlops: {
    identity: { id: "identity", weight: 4, terms: [
      "MLOps Engineer", "LLMOps Engineer", "AI Platform Engineer", "ML Platform Engineer", "AI Infrastructure Engineer", "ML Infrastructure Engineer",
    ] },
    groups: [
      { id: "serving", weight: 3, terms: ["Model Serving", "Inference Serving", "vLLM", "SGLang", "Triton", "BentoML", "GPU Serving"] },
      { id: "pipeline", weight: 3, terms: ["MLOps", "LLMOps", "Model Deployment", "ML Pipeline", "Training Pipeline", "Inference Pipeline", "MLflow", "Kubeflow"] },
      { id: "infra", weight: 2, terms: ["Kubernetes", "Docker", "GPU", "Ray", "SageMaker", "ArgoCD", "Helm"] },
      { id: "operations", weight: 1, terms: ["Model Monitoring", "Observability", "OpenTelemetry", "Grafana", "Monitoring"] },
    ],
  },
  ai_service_backend: {
    identity: { id: "identity", weight: 4, terms: [
      "AI Backend Engineer", "AI Service Backend Engineer", "AI 서비스 개발자", "AI 서비스 백엔드", "LLM Backend Engineer", "AI Application Backend",
    ] },
    groups: [
      { id: "aiIntegration", weight: 3, terms: ["LLM API", "Model API", "AI API", "AI Integration", "Model Integration", "RAG API", "Agent API", "LLM Service", "AI Service"] },
      { id: "backendApi", weight: 3, terms: ["FastAPI", "Django", "Flask", "REST API", "RESTful API", "Python Backend", "Backend API", "gRPC"] },
      { id: "runtimeData", weight: 2, terms: ["PostgreSQL", "Redis", "Queue", "Worker", "Celery", "Kafka", "Async Processing", "Background Job"] },
      { id: "architecture", weight: 1, terms: ["Service Integration", "AI Service Architecture", "Microservice", "Backend Architecture"] },
    ],
  },
};

export const DAILY_JOB_LIMIT = 4;

export function isJobRole(value: unknown): value is JobRole {
  return typeof value === "string" && (JOB_ROLE_ORDER as readonly string[]).includes(value);
}

export function isLegacyJobRole(value: unknown): value is LegacyJobRole {
  return typeof value === "string" && (LEGACY_JOB_ROLES as readonly string[]).includes(value);
}

export function hasLegacyJobRoles(value: unknown): boolean {
  return Array.isArray(value) && value.some(isLegacyJobRole);
}

// Job Description에 재설정 안내를 보여줄지 판단하는 유일한 기준 — legacy slug가 하나라도 남아있으면 true.
// mixed(legacy+new) 상태도 true. 빈 배열/깨진 값은 여기서 다루지 않는다(별도 onboarding 정책).
export function needsJobRoleReset(value: unknown): boolean {
  return hasLegacyJobRoles(value);
}

// 허용 slug만, 중복 제거, 1~4개. 클라이언트와 서버 양쪽에서 같은 함수를 쓴다.
// canonical order로 재정렬한다 — "선택 집합"을 다룰 때만 쓴다(우선순위 순서가 필요하면 validatePriorityOrder).
export function validateInterestedJobRoles(value: unknown): JobRole[] | null {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value)].filter(isJobRole);
  if (unique.length === 0 || unique.length > JOB_ROLE_ORDER.length) return null;
  return JOB_ROLE_ORDER.filter((r) => unique.includes(r));
}

// validateInterestedJobRoles와 동일한 검증(허용 slug만/중복 제거/1~4개)이지만 입력 순서를 보존한다 —
// quota가 우선순위(index 0 = 1순위)를 그대로 써야 하므로 canonical 재정렬로 순서를 파괴하면 안 된다.
export function validatePriorityOrder(value: unknown): JobRole[] | null {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value)].filter(isJobRole);
  if (unique.length === 0 || unique.length > JOB_ROLE_ORDER.length) return null;
  return unique;
}

// 관심 직무 우선순위 — interested_job_roles와 별도 컬럼(job_role_priority)에 순서만 저장한다.
// 배열의 인덱스가 곧 priority이므로 숫자 필드를 따로 두지 않는다.
// selectedRoles에 없는 직무는 버리고(체크 해제분), selectedRoles에는 있지만 저장된 순서에 없는 직무는
// 끝에 붙인다(새로 체크했거나 priority가 아예 없던 기존 사용자) — 그래서 이 함수 하나로
// "불러올 때 기본값 채우기"와 "저장할 때 클라이언트 입력값 검증" 둘 다 처리한다.
export function reconcilePriority(selectedRoles: JobRole[], storedPriority: unknown): JobRole[] {
  const stored = Array.isArray(storedPriority) ? storedPriority.filter(isJobRole) : [];
  const kept = stored.filter((r) => selectedRoles.includes(r));
  const missing = selectedRoles.filter((r) => !kept.includes(r));
  return [...kept, ...missing];
}

// 3·4순위 교대에 쓰는 "날짜 번호". 연중 일수(1~365)가 아니라 에포크 기준 통산 일수를 쓴다 —
// 연중 일수는 12/31(365)과 1/1(1)이 둘 다 홀수라 해가 바뀔 때 짝수/홀수가 반복되고, 그 하루는
// 같은 트랙이 이틀 연속 뽑히면서 반대쪽이 건너뛰어진다(윤년이면 366→1로 반대 방향의 같은 문제).
// 통산 일수는 언제나 1씩 늘어나므로 패리티가 끊기지 않는다.
function dayNumber(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// 하루 총 4개를 "우선순위" 기준으로 배분한다(priorityRoles[0]이 1순위). 순서를 canonical로 재정렬하면
// 우선순위 정보가 파괴되므로 validatePriorityOrder로만 검증한다.
// 1개:4 / 2개:3+1 / 3개:2+1+1 / 4개:2+1+1+0(3·4순위는 날짜마다 교대) — 1순위는 항상 최소 2개 이상을 받는다.
export function getDailyRoleQuota(priorityRoles: JobRole[], localDate: string): Record<string, number> {
  const roles = validatePriorityOrder(priorityRoles) ?? [];
  const quota: Record<string, number> = {};
  roles.forEach((r) => (quota[r] = 0));
  if (roles.length === 0) return quota;

  if (roles.length === 1) {
    quota[roles[0]] = 4;
  } else if (roles.length === 2) {
    quota[roles[0]] = 3;
    quota[roles[1]] = 1;
  } else if (roles.length === 3) {
    quota[roles[0]] = 2;
    quota[roles[1]] = 1;
    quota[roles[2]] = 1;
  } else {
    quota[roles[0]] = 2;
    quota[roles[1]] = 1;
    // 3·4순위 중 하루 1개만 — 날짜 기준으로 교대(짝/홀로 두 트랙을 번갈아 준다)
    const winnerIdx = 2 + (dayNumber(localDate) % 2);
    quota[roles[winnerIdx]] = 1;
  }
  return quota;
}
