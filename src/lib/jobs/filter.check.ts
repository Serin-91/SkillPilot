// 자체 점검: `npx tsx src/lib/jobs/filter.check.ts`로 돌린다.
// 2026-08-13 3소스 재구축 — semantic group scoring(10/11절) + training/non-target hard filter(7/8절)가
// 지시서 29절의 positive/negative 시나리오를 그대로 통과하는지 여기서 확인한다.
import assert from "node:assert/strict";
import { classifyJobRoles, isTrainingOrNonJob, isNonTargetTitle, passesHardFilter } from "./filter.ts";
import type { JobRole } from "./roles.ts";
import type { ExtractedJobFields } from "./extract-fields.ts";

function fields(p: Partial<ExtractedJobFields>): ExtractedJobFields {
  return {
    is_job_posting: true, company: "테스트", title: "", role: "", responsibilities: "",
    required_text: "", preferred_text: "", career_requirement: "경력무관",
    deadline: null, posted_at: null, date_confidence: "unknown",
    ...p,
  };
}

function primaryRoleOf(p: Partial<ExtractedJobFields>): JobRole | null {
  return classifyJobRoles(fields(p)).primaryRole;
}

// ── 30절 positive — required_text에도 신호를 둬 gate의 body-field 요구를 만족시킨다 ──────────────
assert.equal(primaryRoleOf({ title: "AI Agent Engineer", responsibilities: "LangGraph, MCP 기반 워크플로 설계", required_text: "RAG 파이프라인 구축 경험" }), "llm_ai_agent");
assert.equal(primaryRoleOf({ title: "Machine Learning Engineer", responsibilities: "PyTorch로 모델 학습, 평가", required_text: "NLP, Computer Vision 프로젝트 경험" }), "applied_ai_ml");
assert.equal(primaryRoleOf({ title: "AI Platform Engineer", responsibilities: "Kubernetes, MLflow 기반 model serving", required_text: "GPU 클러스터 운영, ML Pipeline 구축" }), "ai_platform_mlops");
assert.equal(primaryRoleOf({ title: "AI Backend Engineer", responsibilities: "LLM API 연동, AI Service 개발", required_text: "FastAPI 기반 REST API 설계" }), "ai_service_backend");

// ── 30절 negative ──────────────────────────────────────────────
assert.equal(primaryRoleOf({ title: "Frontend Engineer (AI Platform)", responsibilities: "React, TypeScript, UI, 디자인 시스템" }), null, "일반 Frontend는 회사가 AI라도 제외");
assert.equal(primaryRoleOf({ title: "Backend Engineer", responsibilities: "Spring Boot, JPA, REST API, MySQL" }), null, "일반 Backend 제외");
assert.equal(primaryRoleOf({ title: "Python Backend Developer", responsibilities: "FastAPI, PostgreSQL, CRUD API" }), null, "일반 FastAPI CRUD 제외");
assert.equal(primaryRoleOf({ title: "Backend Engineer", preferred_text: "LLM 경험 우대" }), null, "AI가 우대사항에만 있으면 AI 직군 분류 금지");

// ── 29-2 Non-target ────────────────────────────────────────────
assert.equal(isNonTargetTitle(fields({ title: "Frontend Engineer (MLOps, Vision AI Platform)" })), true);
assert.equal(isNonTargetTitle(fields({ title: "AI Product Manager" })), true);
assert.equal(isNonTargetTitle(fields({ title: "Backend Engineer (AI Platform)" })), false, "AI Platform Backend는 title만으로 reject하지 않는다");
assert.equal(isNonTargetTitle(fields({ title: "Python Backend Engineer" })), false);

// ── 29-1 Training/비개발 교육직 — REJECT ─────────────────────────
assert.equal(isTrainingOrNonJob(fields({ title: "[국비지원 무료교육] AI Agent 서비스 개발자 교육생 모집" })), true);
assert.equal(isTrainingOrNonJob(fields({ title: "채용연계형 AI 부트캠프" })), true);
assert.equal(isTrainingOrNonJob(fields({ title: "AI Agent Engineer", employment_type: "연수생/교육생" })), true);
assert.equal(isTrainingOrNonJob(fields({ title: "AI & IT 국비 교육 커리어 컨설턴트" })), true);
assert.equal(isTrainingOrNonJob(fields({ title: "AI 강사" })), true);
// ── 29-1 PASS — 정상 복지 문구는 hard reject 사유가 아니다(7-4절) ───
assert.equal(isTrainingOrNonJob(fields({ title: "MLOps Engineer", preferred_text: "교육비 지원, 부트캠프 수료자 우대" })), false);
assert.equal(isTrainingOrNonJob(fields({ title: "AI Agent Engineer", responsibilities: "직무교육 지원 프로그램 운영" })), false);

// ── 29-3 LLM Agent ──────────────────────────────────────────────
assert.equal(primaryRoleOf({ title: "AI Agent Engineer", responsibilities: "MCP, LangGraph 기반 Agent 개발" }), "llm_ai_agent");
assert.equal(primaryRoleOf({ title: "Backend Engineer", responsibilities: "RAG 파이프라인 구축", required_text: "LangGraph 기반 Multi-Agent 오케스트레이션" }), "llm_ai_agent", "generic backend title이라도 본문에 Agent/Retrieval 신호 2개면 통과");
assert.equal(primaryRoleOf({ title: "Backend Engineer", preferred_text: "LLM 경험 우대" }), null);

// ── 29-4 Applied AI ML ──────────────────────────────────────────
assert.equal(primaryRoleOf({ title: "ML Engineer", responsibilities: "모델 학습 파이프라인 구축", required_text: "PyTorch 기반 개발" }), "applied_ai_ml");
assert.equal(primaryRoleOf({ title: "AI Engineer", responsibilities: "REST API 개발, DB 설계" }), null, "AI Engineer title이라도 실제 업무가 REST API뿐이면 제외");
assert.equal(primaryRoleOf({ title: "Backend Engineer", required_text: "Python, PyTorch 사용 가능자" }), null, "PyTorch 단순 나열만으로 통과 금지");

// ── 29-5 MLOps ──────────────────────────────────────────────────
assert.equal(primaryRoleOf({ title: "MLOps Engineer", responsibilities: "model serving, Kubernetes 운영" }), "ai_platform_mlops");
assert.equal(primaryRoleOf({ title: "DevOps Engineer", responsibilities: "Docker, Kubernetes, AWS, CI/CD 파이프라인 운영" }), null, "일반 DevOps는 MLOps가 아니다");

// ── 29-6 AI Service Backend ───────────────────────────────────────
assert.equal(primaryRoleOf({ title: "Backend Engineer", responsibilities: "LLM API 연동", required_text: "FastAPI 기반 서버 개발" }), "ai_service_backend");
assert.equal(primaryRoleOf({ title: "Backend Engineer", required_text: "FastAPI, Redis, PostgreSQL 사용" }), null, "AI 신호 없는 일반 FastAPI backend 제외");

// ── 29-7 semantic score — keyword stuffing/중복 가중치 방지 ─────────
const stuffed = classifyJobRoles(fields({
  title: "AI Agent Engineer",
  responsibilities: "LLM LLM LLM Generative AI 생성형 AI Generative AI 생성형 AI",
  required_text: "RAG",
})).roleScores.llm_ai_agent;
const notStuffed = classifyJobRoles(fields({
  title: "AI Agent Engineer",
  responsibilities: "LLM",
  required_text: "RAG",
})).roleScores.llm_ai_agent;
assert.equal(stuffed, notStuffed, "같은 group 반복 매칭이 점수를 계속 올리면 안 된다");

// title === role이어도 이중 가중치가 없다 — role은 아예 scoring field가 아니다(10-1절)
const withRoleDup = classifyJobRoles(fields({ title: "AI Agent Engineer", role: "AI Agent Engineer", responsibilities: "RAG" })).roleScores.llm_ai_agent;
const withoutRoleDup = classifyJobRoles(fields({ title: "AI Agent Engineer", role: "", responsibilities: "RAG" })).roleScores.llm_ai_agent;
assert.equal(withRoleDup, withoutRoleDup);

// ── allowed roles로 제한하면 그 안에서만 분류한다 ──
assert.equal(classifyJobRoles(fields({ title: "AI Agent Engineer", responsibilities: "LangGraph, RAG" }), ["applied_ai_ml"]).primaryRole, null);

// ── passesHardFilter 결합 ──
assert.equal(passesHardFilter(fields({ title: "국비지원 AI 개발자 교육생 모집" })), false);
assert.equal(passesHardFilter(fields({ title: "AI Agent Engineer" })), true);

console.log("filter.check.ts OK");
