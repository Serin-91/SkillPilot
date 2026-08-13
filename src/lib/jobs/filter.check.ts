// 자체 점검: `node src/lib/jobs/filter.check.ts`로 돌린다(Node 24 type stripping).
// 2026-08-13 AI 중심 개편 — weighted structured classifier(AI core gate + ai_service_backend AND gate)가
// 지시서 30/38절의 positive/negative 시나리오를 그대로 통과하는지 여기서 바로 확인한다.
import assert from "node:assert/strict";
import { classifyJobRole, roleFitScore } from "./filter.ts";
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

function classified(p: Partial<ExtractedJobFields>): JobRole | null {
  return classifyJobRole(fields(p))?.role ?? null;
}

// ── 30절 positive ──────────────────────────────────────────────
assert.equal(classified({ title: "AI Agent Engineer", responsibilities: "LangGraph, MCP, RAG" }), "llm_ai_agent");
assert.equal(classified({ title: "Machine Learning Engineer", responsibilities: "PyTorch, 모델 학습, 평가, 추천" }), "applied_ai_ml");
assert.equal(classified({ title: "AI Platform Engineer", responsibilities: "Kubernetes, MLflow, model serving, GPU" }), "ai_platform_mlops");
assert.equal(classified({ title: "AI Backend Engineer", responsibilities: "LLM API, FastAPI, AI 서비스 통합" }), "ai_service_backend");

// ── 30절 negative ──────────────────────────────────────────────
assert.equal(classified({ title: "Frontend Engineer (AI Platform)", responsibilities: "React, TypeScript, UI, 디자인 시스템" }), null, "일반 Frontend는 회사가 AI라도 제외");
assert.equal(classified({ title: "Backend Engineer", responsibilities: "Spring Boot, JPA, REST API, MySQL" }), null, "일반 Backend 제외");
assert.equal(classified({ title: "Python Backend Developer", responsibilities: "FastAPI, PostgreSQL, CRUD API" }), null, "일반 FastAPI CRUD 제외");
assert.equal(classified({ title: "Backend Engineer", preferred_text: "LLM 경험 우대" }), null, "AI가 우대사항에만 있으면 AI 직군 분류 금지");

// ── 38절 regression 시나리오 C~F ───────────────────────────────
// C — AI 회사의 일반 Frontend
assert.equal(classified({ title: "Frontend Engineer (MLOps, Vision AI Platform)", responsibilities: "React / TypeScript / UI / Design System" }), null);
// D — AI Platform Backend → ai_platform_mlops
assert.equal(classified({ title: "Backend Engineer (AI Platform)", responsibilities: "model serving / Kubernetes / MLOps / Agent platform" }), "ai_platform_mlops");
// E — AI Service Backend
assert.equal(classified({ title: "AI Backend Engineer", responsibilities: "LLM API / FastAPI / DB / async workflow / AI service integration" }), "ai_service_backend");
// F — Agent + Backend hybrid, Agent 신호가 강하면 backend 기술이 많아도 llm_ai_agent 우선
assert.equal(classified({ title: "Agentic AI Backend Engineer", responsibilities: "LangGraph / RAG / Tool Calling / FastAPI" }), "llm_ai_agent");

// ── short token 오탐 방지 ───────────────────────────────────────
// "RAG"가 무관한 영단어 일부(dragon)에 우연히 매칭되면 안 된다 — AI core 신호가 전혀 없으므로 gate에서 걸러진다
assert.equal(classified({ title: "Backend Engineer", responsibilities: "우리 서비스 마스코트는 dragon입니다" }), null);
// 짧은 키워드라도 실제 단어로 등장하면 정상 매칭되어야 한다
assert.ok(roleFitScore(fields({ title: "AI Platform Engineer", responsibilities: "GPU 클러스터 운영, model serving, MLOps 파이프라인" }), "ai_platform_mlops") > 0);

// ── allowed roles로 제한하면 그 안에서만 분류한다(사용자가 선택하지 않은 track은 최종 pool에서 배제) ──
assert.equal(classifyJobRole(fields({ title: "AI Agent Engineer", responsibilities: "LangGraph, RAG" }), ["applied_ai_ml"]), null);

console.log("filter.check.ts OK");
