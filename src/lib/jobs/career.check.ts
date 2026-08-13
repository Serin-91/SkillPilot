// 자체 점검: `node src/lib/jobs/career.check.ts`로 돌린다(Node 24 type stripping).
// 신입·주니어 Soft Priority(SkillPilot 채용공고 — 신입·주니어 우선 추천 추가 지침) 14절 테스트 체크리스트.
import assert from "node:assert/strict";
import { classifyCareerTier } from "./career.ts";

function fields(p: Partial<{ career_requirement: string | null; required_text: string; title: string; role: string }>) {
  return { career_requirement: null, required_text: "", title: "", role: "", ...p };
}

// career_requirement(최우선 신뢰도) 기준
assert.equal(classifyCareerTier(fields({ career_requirement: "경력 3년 이상" })), "experienced");
assert.equal(classifyCareerTier(fields({ career_requirement: "신입/경력" })), "entry");
assert.equal(classifyCareerTier(fields({ career_requirement: "경력무관" })), "entry");
assert.equal(classifyCareerTier(fields({ career_requirement: "1~2년" })), "junior");
assert.equal(classifyCareerTier(fields({ career_requirement: "0~1년" })), "entry");
assert.equal(classifyCareerTier(fields({ career_requirement: "2년 이하" })), "junior");
assert.equal(classifyCareerTier(fields({ career_requirement: "인턴" })), "entry");

assert.equal(classifyCareerTier(fields({ career_requirement: "0년" })), "entry");

// 지시서에 예시로 없는 숫자도 같은 규칙(3+ = experienced)으로 일반화되는지
assert.equal(classifyCareerTier(fields({ career_requirement: "6년 이상" })), "experienced");
// "10년 이상"/"14년 이상" 안의 "0년"/"4년"이 entry 오탐(substring false-positive)을 일으키지 않는지
assert.equal(classifyCareerTier(fields({ career_requirement: "10년 이상" })), "experienced");
assert.equal(classifyCareerTier(fields({ career_requirement: "14년 이상" })), "experienced");
assert.equal(classifyCareerTier(fields({ career_requirement: "20년 이상" })), "experienced");

// required_text — career_requirement가 없을 때만 본다
assert.equal(classifyCareerTier(fields({ required_text: "자격요건: 관련 개발 경력 3년 이상" })), "experienced");

// preferred_text는 아예 안 본다 — "우대"에만 연차 숫자가 있어도 hard 판정 금지(4절 핵심)
assert.equal(
  classifyCareerTier({ career_requirement: null, required_text: "", title: "Backend Engineer", role: "", preferred_text: "관련 프로젝트 경험 3년 이상 우대" } as never),
  "unknown"
);

// title/role의 명시적 Senior/Lead/Principal만 최후 수단으로 신뢰
assert.equal(classifyCareerTier(fields({ title: "Senior AI Engineer" })), "experienced");
assert.equal(classifyCareerTier(fields({ title: "AI Platform Lead" })), "experienced");

// 아무 신호도 없으면 unknown — 자동으로 entry 취급하지 않는다(11절)
assert.equal(classifyCareerTier(fields({})), "unknown");
assert.equal(classifyCareerTier(fields({ required_text: "AI 서비스 백엔드 개발 업무" })), "unknown");

console.log("career.check.ts OK");
