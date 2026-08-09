// 관심 직무 4종의 단일 source of truth — 화면 label과 저장용 slug를 분리한다(JOB_INTEREST_SPEC).
// 검색 query / 분류 키워드까지 여기 한 곳에서만 정의하고, 수집·분류·UI가 전부 이걸 참조한다.

export const JOB_ROLE_ORDER = ["backend", "frontend", "ai_ml", "data_engineer"] as const;
export type JobRole = (typeof JOB_ROLE_ORDER)[number];

export const JOB_ROLE_CONFIG: Record<JobRole, {
  label: string;
  description: string;
  skills: string[];
  skillsBreakBefore?: string;
  searchQuery: string;
  keywords: string[];
}> = {
  backend: {
    label: "백엔드 개발자",
    // 회원가입 화면 카드에서 두 줄로 보이도록 줄바꿈을 데이터에 직접 넣는다(검색/분류 로직은 이 필드를 쓰지 않는다)
    description: "서버, API, 데이터베이스와 서비스의\n핵심 로직을 개발하는 직무",
    skills: ["Java", "Spring", "Python", "API", "SQL"],
    searchQuery: "백엔드 개발자 OR 서버 개발자 OR Java Spring 개발자 OR API 개발자 채용",
    keywords: ["백엔드", "서버 개발", "Spring", "Spring Boot", "JPA", "REST API", "API 개발", "MSA", "RDBMS", "MySQL", "PostgreSQL", "Node.js", "NestJS", "Django", "FastAPI"],
  },
  frontend: {
    label: "프론트엔드 개발자",
    description: "사용자가 직접 이용하는 웹 화면과\n인터랙션을 개발하는 직무",
    skills: ["JavaScript", "TypeScript", "React", "Next.js"],
    searchQuery: "프론트엔드 개발자 OR React 개발자 OR 웹 프론트엔드 채용",
    keywords: ["프론트엔드", "프론트 엔드", "React", "Next.js", "Vue", "TypeScript", "JavaScript", "웹 퍼블", "UI 개발", "브라우저", "CSS", "상태관리", "Redux"],
  },
  ai_ml: {
    label: "AI·ML 엔지니어",
    description: "AI 모델과 LLM을 활용하여 AI 기능 및 서비스를 개발하는 직무",
    skills: ["Python", "LLM", "RAG", "PyTorch", "AI Agent"],
    skillsBreakBefore: "AI Agent",
    searchQuery: "LLM 엔지니어 OR 생성형 AI 개발자 OR AI Agent OR RAG 개발자 OR ML 엔지니어 OR AI 서비스 개발자 채용",
    keywords: ["LLM", "생성형 AI", "Generative AI", "AI Agent", "RAG", "Vector DB", "Embedding", "LangChain", "LangGraph", "Prompt", "머신러닝", "딥러닝", "PyTorch", "TensorFlow", "모델 학습", "MLOps", "AI 서비스", "챗봇"],
  },
  data_engineer: {
    label: "데이터 엔지니어",
    description: "데이터를 수집·가공·저장하는 데이터\n파이프라인과 인프라를 개발하는 직무",
    skills: ["Python", "SQL", "ETL", "Airflow", "Spark"],
    searchQuery: "데이터 엔지니어 OR 데이터 파이프라인 개발자 OR ETL 개발자 채용",
    keywords: ["데이터 엔지니어", "데이터 파이프라인", "ETL", "ELT", "Airflow", "Spark", "Hadoop", "Kafka", "데이터 웨어하우스", "DW", "데이터 레이크", "dbt", "BigQuery", "Snowflake"],
  },
};

export const DAILY_JOB_LIMIT = 4;

// 허용 slug만, 중복 제거, 1~4개. 클라이언트와 서버 양쪽에서 같은 함수를 쓴다.
export function validateInterestedJobRoles(value: unknown): JobRole[] | null {
  if (!Array.isArray(value)) return null;
  const unique = [...new Set(value)].filter((v): v is JobRole => JOB_ROLE_ORDER.includes(v as JobRole));
  if (unique.length === 0 || unique.length > JOB_ROLE_ORDER.length) return null;
  // canonical order로 정규화 — 선택 순서에는 의미를 두지 않는다
  return JOB_ROLE_ORDER.filter((r) => unique.includes(r));
}

// 관심 직무 우선순위 — interested_job_roles와 별도 컬럼(job_role_priority)에 순서만 저장한다.
// 배열의 인덱스가 곧 priority이므로 숫자 필드를 따로 두지 않는다.
// selectedRoles에 없는 직무는 버리고(체크 해제분), selectedRoles에는 있지만 저장된 순서에 없는 직무는
// 끝에 붙인다(새로 체크했거나 priority가 아예 없던 기존 사용자) — 그래서 이 함수 하나로
// "불러올 때 기본값 채우기"와 "저장할 때 클라이언트 입력값 검증" 둘 다 처리한다.
export function reconcilePriority(selectedRoles: JobRole[], storedPriority: unknown): JobRole[] {
  const stored = Array.isArray(storedPriority)
    ? storedPriority.filter((r): r is JobRole => JOB_ROLE_ORDER.includes(r as JobRole))
    : [];
  const kept = stored.filter((r) => selectedRoles.includes(r));
  const missing = selectedRoles.filter((r) => !kept.includes(r));
  return [...kept, ...missing];
}

function dayOfYear(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// 하루 총 4개 배분 — 1개:4 / 2개:2+2 / 3개:2+1+1(추가 1개는 매일 순환) / 4개:1+1+1+1
export function getDailyRoleQuota(selectedRoles: JobRole[], localDate: string): Record<string, number> {
  const roles = validateInterestedJobRoles(selectedRoles) ?? [];
  const quota: Record<string, number> = {};
  const base = Math.floor(DAILY_JOB_LIMIT / roles.length);
  roles.forEach((r) => (quota[r] = base));
  let extra = DAILY_JOB_LIMIT - base * roles.length;
  // 3개 선택일 때만 남는 1개 — day-of-year로 매일 다른 직무가 받는다
  let cursor = dayOfYear(localDate) % roles.length;
  while (extra > 0) {
    quota[roles[cursor % roles.length]] += 1;
    cursor += 1;
    extra -= 1;
  }
  return quota;
}
