// 자체 점검: `node src/lib/jobs/normalize.check.ts` (Node 24 type stripping).
// 🔴 네트워크도 실제 LLM 호출도 없다. normalizeJobFields의 세 번째 인자로 스텁을 넣는다 —
//    normalize.ts가 @google/genai를 **함수 안에서 동적으로** import하는 이유가 이것이다.
import assert from "node:assert/strict";
import { parseConfidence, isDegenerateSection, hasUsableBody } from "./section-quality.ts";
import { normalizeJobFields, newNormalizeTally, bodyTextOf, type LlmCall } from "./normalize.ts";
import type { ExtractedJobFields } from "./extract-fields";

const base: ExtractedJobFields = {
  is_job_posting: true, company: "㈜테스트", title: "AI 엔지니어", role: "AI 엔지니어",
  responsibilities: "", required_text: "", preferred_text: "",
  career_requirement: "경력무관", deadline: null, posted_at: null, date_confidence: "unknown",
};
const withBody = (r: string, q = "", p = ""): ExtractedJobFields =>
  ({ ...base, responsibilities: r, required_text: q, preferred_text: p });
const conf = (r: string, q = "", p = "") => {
  const s = { responsibilities: r, required_text: q, preferred_text: p };
  return parseConfidence(s, bodyTextOf(withBody(r, q, p)));
};

// ── parseConfidence 분기 ────────────────────────────────────────────────────────────────────
{
  // ① 세 필드 전부 빈 값(이미지 공고)
  assert.equal(conf("", "", ""), "low", "빈 세 필드가 high로 나왔다");

  // ② 불릿만 남은 퇴화 필드 — 실측에서 "ㆍ" 한 글자짜리 섹션이 실제로 저장돼 있었다.
  const healthyR = "ㆍLLM 기반 AI Agent 설계 및 개발\nㆍRAG 파이프라인 구축과 운영";
  const healthyP = "ㆍLangChain / LlamaIndex 실무 경험\nㆍ대규모 서비스 운영 경험";
  assert.equal(conf(healthyR, "ㆍ", healthyP), "low", '"ㆍ"만 남은 자격요건이 high로 나왔다');
  assert.ok(isDegenerateSection("ㆍ") && isDegenerateSection("· ·") && isDegenerateSection(""), "장식 전용 판정 실패");

  // ③ 한 섹션이 본문의 90% 이상을 삼킨 경우(텍스트 공고 71건 중 36건이 이 상태였다)
  const swallow = "ㆍ주요 업무 내용이 통째로 한 칸에 들어간 경우다. ".repeat(20);
  assert.equal(conf(swallow, "ㆍ학력 : 학사 이상 필요", "ㆍPython 실무 경험자 우대"), "low", "90% 삼킴을 못 잡았다");

  // ④ 주요업무가 비면(다른 필드가 멀쩡해도) LOW — 카드가 사실상 빈 카드다.
  assert.equal(conf("", "ㆍ학력 : 학사 이상 필요", healthyP), "low", "주요업무 공백을 못 잡았다");

  // ⑤ 건강한 3섹션 — 여기서 LOW가 나오면 정상 공고 전체에 LLM을 태우게 된다.
  const healthyQ = "ㆍPython 3년 이상 실무 경험\nㆍ학사 이상 또는 그에 준하는 경력";
  assert.equal(conf(healthyR, healthyQ, healthyP), "high", "건강한 3섹션이 low로 나왔다");

  assert.ok(hasUsableBody({ responsibilities: healthyR }), "본문 있는 공고를 이미지 공고로 봤다");
  assert.ok(!hasUsableBody({ responsibilities: "ㆍ", required_text: "", preferred_text: "" }), "장식만 있는 공고를 본문 있음으로 봤다");
  console.log("parseConfidence 분기 OK");
}

// ── 이미지 공고는 절대 호출하지 않는다 ──────────────────────────────────────────────────────
{
  const tally = newNormalizeTally();
  const boom: LlmCall = async () => { throw new Error("불려서는 안 된다"); };
  const fields = withBody("ㆍ"); // 본문 200자 미만
  const got = await normalizeJobFields(fields, tally, boom);
  assert.equal(tally.calls, 0, "이미지 공고에 LLM을 불렀다");
  assert.equal(tally.low, 1);
  assert.deepEqual(got, fields);
  console.log("이미지 공고 무호출 OK");
}

// ── 부분문자열 가드레일 — 환각 줄은 버린다 ──────────────────────────────────────────────────
const swallowed =
  "ㆍLLM 기반 AI Agent 설계 및 개발\n" +
  "ㆍRAG 파이프라인 구축과 운영\n" +
  "ㆍPython 3년 이상 실무 경험\n" +
  "ㆍ학사 이상 또는 그에 준하는 경력\n" +
  "ㆍLangChain 실무 경험자 우대\n" +
  "이 공고는 섹션 라벨이 없어 본문 전체가 주요업무 한 칸에 들어간 상태를 재현한 것이다. ".repeat(4);

{
  const tally = newNormalizeTally();
  const stub: LlmCall = async () => JSON.stringify({
    responsibilities: [
      "ㆍLLM 기반 AI Agent 설계 및 개발",          // 원문에 있다
      "ㆍKubernetes 클러스터 운영 및 비용 최적화", // 🔴 원문에 없는 환각
    ],
    requirements: ["ㆍPython 3년 이상 실무 경험"],
    preferred: ["ㆍLangChain 실무 경험자 우대"],
  });
  const got = await normalizeJobFields(withBody(swallowed), tally, stub);
  assert.equal(tally.calls, 1);
  assert.equal(tally.accepted, 1);
  assert.ok(got.responsibilities.includes("AI Agent 설계"), "원문 줄이 버려졌다");
  assert.ok(!got.responsibilities.includes("Kubernetes"), "🔴 환각 줄이 통과했다");
  assert.equal(got.required_text, "ㆍPython 3년 이상 실무 경험");
  assert.equal(got.preferred_text, "ㆍLangChain 실무 경험자 우대");
  console.log("부분문자열 가드레일 OK");
}

// ── fail-closed — 오류/타임아웃/검증 실패는 기존 파서 결과를 절대 지우지 않는다 ────────────
{
  const original = withBody(swallowed, "ㆍ");
  for (const [name, stub] of [
    ["모델 에러", (async () => { throw new Error("500"); }) as LlmCall],
    ["JSON 아님", (async () => "not json") as LlmCall],
    ["빈 응답", (async () => "{}") as LlmCall],
    ["전부 환각", (async () => JSON.stringify({ responsibilities: ["원문에 없는 문장"], requirements: [], preferred: [] })) as LlmCall],
  ] as [string, LlmCall][]) {
    const tally = newNormalizeTally();
    const got = await normalizeJobFields(original, tally, stub);
    assert.deepEqual(got, original, `${name}: 기존 파서 결과가 바뀌었다`);
    assert.equal(tally.rejected, 1, `${name}: 기각 집계 누락`);
    assert.equal(tally.accepted, 0, `${name}: 잘못 채택됐다`);
  }
  console.log("fail-closed OK");
}

// 신뢰도 HIGH면 호출 자체가 없다(비용 관문).
{
  const tally = newNormalizeTally();
  const boom: LlmCall = async () => { throw new Error("불려서는 안 된다"); };
  const healthy = withBody(
    "ㆍLLM 기반 AI Agent 설계 및 개발\nㆍRAG 파이프라인 구축과 운영",
    "ㆍPython 3년 이상 실무 경험\nㆍ학사 이상 또는 그에 준하는 경력",
    "ㆍLangChain / LlamaIndex 실무 경험\nㆍ대규모 서비스 운영 경험"
  );
  assert.deepEqual(await normalizeJobFields(healthy, tally, boom), healthy);
  assert.equal(tally.low, 0);
  assert.equal(tally.calls, 0);
  console.log("HIGH 무호출 OK");
}

console.log("normalize.check.ts OK");
