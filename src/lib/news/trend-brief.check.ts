// 자체 점검: `npx tsx src/lib/news/trend-brief.check.ts`
// 실무 적용의 **근거 대조**(groundTakeaways)만 검사한다. 네트워크·Gemini 불필요.
//
// 왜 이 검사가 필요한가 (실측 2026-09-03, DB 27일):
//   프롬프트에 "근거가 없으면 빈 배열을 반환하세요"가 이미 있었는데 0개인 날이 **0일**이었다.
//   지시로는 안 걸리므로 코드가 대조한다 — 그 대조가 깨지면 여기서 터진다.
import assert from "node:assert/strict";
import { groundTakeaways, groundSkillSignals, evidenceTitlesOf, evidenceSourcesOf,
  type EvidenceSource, type TrendSkillSignal } from "./trend-brief.ts";

const POOL: EvidenceSource[] = [
  { title: "MS, 사업 부문 2개로 재편…‘애저’ 분기 매출 첫 공개", source: "AI타임스" },
  { title: "Copilot code review can now approve pull requests", source: "GitHub" },
  { title: "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp", source: "Hugging Face" },
];
const ok = (action: string, why: string, evidence_title: string) => ({ action, why_today: why, evidence_title });

// ① 근거가 입력에 있으면 통과하고, 문자열 하나로 합쳐진다(UI가 string[]을 읽는다)
{
  const r = groundTakeaways(
    [ok("코드리뷰 자동 승인 게이트를 CI에 붙여본다.", "오늘 Copilot 코드리뷰가 PR 승인까지 하게 됐다.", "Copilot code review can now approve pull requests")],
    POOL
  );
  assert.equal(r.takeaways.length, 1, "근거가 대조되면 채택돼야 한다");
  assert.equal(r.dropped.length, 0);
  assert.equal(typeof r.takeaways[0], "string", "출력은 문자열이어야 한다 — UI·메모 저장이 string[]을 읽는다");
  assert.ok(r.takeaways[0].includes("(근거: GitHub · Copilot code review"), `근거 표기가 붙어야 한다: ${r.takeaways[0]}`);
}

// ②🔴 핵심 — 입력에 없는 제목을 대면 **버린다**. 범용 조언이 걸러지는 지점이다.
{
  const r = groundTakeaways(
    [ok("PoC를 만들어 성능과 비용을 비교해본다.", "일반적으로 유용하기 때문이다.", "AI 에이전트 시장 전망 보고서")],
    POOL
  );
  assert.equal(r.takeaways.length, 0, "오늘 입력에 없는 근거는 통과하면 안 된다");
  assert.equal(r.dropped.length, 1);
  assert.ok(r.dropped[0].reason.includes("오늘 입력에 없음"), r.dropped[0].reason);
}

// ③ 근거가 하나도 안 맞으면 빈 배열이 정상이다(억지로 채우지 않는다 — 요구사항 4)
assert.deepEqual(groundTakeaways([ok("아무 행동이나 한다.", "아무 이유나 댄다.", "없는 제목입니다")], POOL).takeaways, []);
assert.deepEqual(groundTakeaways([], POOL).takeaways, [], "빈 입력은 빈 배열");
assert.deepEqual(groundTakeaways(undefined, POOL).takeaways, [], "필드가 없어도 터지지 않는다");

// ④ 모델이 스키마를 무시하고 **문자열**을 돌려주면 근거가 없다는 뜻이라 버린다
{
  const r = groundTakeaways(["AI를 적극 활용하세요"], POOL);
  assert.equal(r.takeaways.length, 0, "문자열 항목은 근거 필드가 없으므로 버려야 한다");
}

// ⑤ 제목을 옮기며 따옴표·공백이 바뀌어도 정상 항목을 버리면 안 된다(대조는 정규화 후에 한다)
{
  const r = groundTakeaways(
    [ok("애저 매출 공개를 인프라 비용 추정에 반영해본다.", "오늘 MS가 애저 분기 매출을 처음 공개했다.", "MS, 사업 부문 2개로 재편… '애저' 분기 매출 첫 공개")],
    POOL
  );
  assert.equal(r.takeaways.length, 1, "따옴표 표기 차이로 정상 항목이 버려지면 안 된다");
}

// ⑥ HF 모델 id에서 조직명을 빼고 써도 대조된다(부분 일치, 양쪽 다 충분히 길 때만)
{
  const r = groundTakeaways(
    [ok("8-bit 양자화 배포본을 추론 비용 비교에 넣어본다.", "오늘 트렌딩에 8-bit 태그 비전 모델이 올라왔다.", "DeepSeek-V4-Flash-Vision-Exp")],
    POOL
  );
  assert.equal(r.takeaways.length, 1, "조직명을 뺀 모델 id도 대조돼야 한다");
}

// ⑦ 짧은 근거 문자열로 아무 항목에나 걸리면 안 된다(포함 판정의 하한)
assert.equal(groundTakeaways([ok("무언가를 해본다.", "이유를 댄다.", "MS")], POOL).takeaways.length, 0,
  "2글자 근거로 포함 판정이 되면 대조가 무의미해진다");

// ⑧ 상한 3개 · 한 브리핑 안 중복 제거
{
  const many = [1, 2, 3, 4].map((i) => ok(`서로 다른 행동 ${i}번을 해본다.`, `이유 ${i}번이다. 오늘 확인됐다.`, "Copilot code review can now approve pull requests"));
  assert.equal(groundTakeaways(many, POOL).takeaways.length, 3, "상한은 3개다");
  const dup = [ok("같은 행동을 똑같이 해본다.","이유 A다. 오늘 확인됐다.", "Copilot code review can now approve pull requests"),
               ok("같은 행동을 똑같이 해본다.","이유 B다. 오늘 확인됐다.", "Copilot code review can now approve pull requests")];
  assert.equal(groundTakeaways(dup, POOL).takeaways.length, 1, "같은 브리핑 안에서 같은 행동을 반복하지 않는다");
}

// ⑨ action/why_today가 빈 칸 채우기면 버린다
assert.equal(groundTakeaways([ok("그렇다.", "그렇다.", "Copilot code review can now approve pull requests")], POOL).takeaways.length, 0);

// ─────────────────────────────────────────────────────────────────────────────
// 역량 시그널 v2 (2026-09-05) — v1은 근거 **하나**만 대조해서 기사 한 건의 세부 기술이
// 그대로 역량명이 됐다(실제 출력 "웹 GPU 커널 활용 최적화"). v2가 막는 것은 셋이다:
//   ① 서로 다른 입력 항목 2개 이상이 가리켜야 통과   ② 역량명에 고유명사 금지
//   ③ 너무 일반적인 역량명 금지                      (+ v1의 채용시장 주장 차단 유지)
const sig = (skill: string, why: string, prepare: string, evidence_titles: string[]) =>
  ({ skill, why_now: why, prepare_focus: prepare, evidence_titles });

const WHY = "오늘 여러 자료에서 같은 방향의 흐름이 함께 확인됐습니다.";
const PREP = "구조를 이해하고 직접 설계하며 어떤 선택을 했는지 설명할 수 있어야 합니다.";
const T_GH = "Copilot code review can now approve pull requests";
const T_MS = "MS, 사업 부문 2개로 재편…‘애저’ 분기 매출 첫 공개";
const T_HF = "deepseek-ai/DeepSeek-V4-Flash-Vision-Exp";

// ⑩ 정상 — 서로 다른 근거 2개면 통과하고, 입력 제목으로 정규화돼 배열로 저장된다
{
  const r = groundSkillSignals([sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH, T_MS])], POOL);
  assert.equal(r.signals.length, 1, `근거 2개면 채택돼야 한다: ${JSON.stringify(r.dropped)}`);
  assert.deepEqual(r.signals[0].evidence_titles, [T_GH, T_MS], "대조에 성공한 **입력 제목**을 저장해야 한다");
  assert.deepEqual(r.signals[0].evidence_sources, ["GitHub", "AI타임스"]);
}

// ⑪🔴🔴 v2 핵심 — 근거가 **하나뿐이면 버린다**(기사 하나의 세부 주제로 본다)
{
  const r = groundSkillSignals([sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH])], POOL);
  assert.equal(r.signals.length, 0, "근거 1개짜리는 통과하면 안 된다");
  assert.ok(r.dropped[0].reason.includes("2개 미만"), r.dropped[0].reason);
}
// 같은 항목을 두 번 대는 것도 1개다 — 개수만 채우는 것을 막는다
{
  const r = groundSkillSignals([sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH, T_GH])], POOL);
  assert.equal(r.signals.length, 0, "같은 근거를 두 번 대면 1개로 세야 한다");
}
// 두 번째 근거를 지어내면 **signal 전체**를 버린다(하나만 살리지 않는다)
{
  const r = groundSkillSignals([sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH, "AI 에이전트 시장 전망 보고서"])], POOL);
  assert.equal(r.signals.length, 0, "없는 근거가 섞이면 항목 전체를 버려야 한다");
  assert.ok(r.dropped[0].reason.includes("오늘 입력에 없음"), r.dropped[0].reason);
}

// ⑫🔴 역량명 규칙 — 고유명사(제품·모델·라이브러리)와 지나친 일반화를 코드가 막는다
for (const [name, why] of [
  ["WebGPU 커널 최적화", "고유명사"], ["Claude 메모리 기능 활용", "고유명사"],
  ["PyTorch 추론 튜닝", "고유명사"], ["GPT-6 프롬프트 제어", "고유명사"],
  ["AI 활용 역량", "일반적"], ["생성형 AI 이해", "일반적"], ["개발 능력 향상", "일반적"],
] as const) {
  const r = groundSkillSignals([sig(name, WHY, PREP, [T_GH, T_MS])], POOL);
  assert.equal(r.signals.length, 0, `${why} 역량명이 통과했다: ${name}`);
}
// 반대로 사용자가 제시한 좋은 예는 **전부 통과해야 한다**(과잉 차단 방지 — 음성 대조)
for (const good of [
  "에이전트 상태·메모리 관리", "에이전트 실행 추적·디버깅", "LLM 평가·관찰 가능성",
  "RAG 검색 품질 설계", "구조화 출력·데이터 계약 설계", "Tool/API 연동과 실패 처리",
  "멀티에이전트 오케스트레이션", "멀티모달 AI 파이프라인 설계",
  "모델 선택과 추론 성능·비용 최적화", "AI 서비스 보안·권한 설계",
]) {
  const r = groundSkillSignals([sig(good, WHY, PREP, [T_GH, T_MS])], POOL);
  assert.equal(r.signals.length, 1, `정상 역량명이 버려졌다: ${good} — ${JSON.stringify(r.dropped)}`);
}

// ⑬🔴 회귀 fixture — 2026-09-05 v1이 실제로 내놓은 3개. 의도한 판정이 나와야 한다.
{
  // (1) 에이전트 메모리 설계 — 근거가 2개면 살아남는다(상위 역량이므로 이름 자체는 정상)
  assert.equal(groundSkillSignals([sig("에이전트 메모리 설계", WHY, PREP, [T_GH, T_HF])], POOL).signals.length, 1,
    "반복 근거가 있는 상위 역량은 살아남아야 한다");
  // (2) 로컬 멀티모달 추론 제어 — 근거가 1개면 탈락한다
  assert.equal(groundSkillSignals([sig("로컬 멀티모달 추론 제어", WHY, PREP, [T_HF])], POOL).signals.length, 0,
    "근거 1개짜리 세부 주제는 탈락해야 한다");
  // (3)🔴 웹 GPU 커널 활용 최적화 — **근거가 2개여도** 이름이 고유명사라 탈락한다
  const r3 = groundSkillSignals([sig("웹 GPU 커널 활용 최적화", WHY, PREP, [T_GH, T_HF])], POOL);
  assert.equal(r3.signals.length, 0, "단일 세부 기술명은 근거가 충분해도 탈락해야 한다");
  assert.ok(r3.dropped[0].reason.includes("고유명사"), r3.dropped[0].reason);
}

// ⑭🔴 채용시장 주장 차단(v1에서 유지) — 근거 제목이 맞아도 버린다
for (const bad of [
  sig("에이전트 실행 추적·디버깅", "이 역량의 채용 수요가 증가하고 있습니다.", PREP, [T_GH, T_MS]),
  sig("구조화 출력·데이터 계약 설계", WHY, "취업에 필수적인 역량이므로 반드시 익혀야 합니다.", [T_GH, T_MS]),
]) {
  const r = groundSkillSignals([bad], POOL);
  assert.equal(r.signals.length, 0, `채용시장 주장이 통과했다: ${bad.skill}`);
  assert.ok(r.dropped[0].reason.includes("채용시장 주장 금지어"), r.dropped[0].reason);
}

// ⑮ 상한 2개 · 0개 허용 · 중복 제거 · 문자열 항목 · 긴 역량명
{
  const many = [1, 2, 3].map((i) => sig(`서로 다른 역량 ${i}단계 설계`, WHY, PREP, [T_GH, T_MS]));
  assert.equal(groundSkillSignals(many, POOL).signals.length, 2, "상한은 2개다");
  assert.deepEqual(groundSkillSignals([], POOL).signals, [], "빈 입력은 빈 배열 — 억지로 채우지 않는다");
  assert.deepEqual(groundSkillSignals(undefined, POOL).signals, [], "필드가 없어도 터지지 않는다");
  const dup = [sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH, T_MS]), sig("에이전트 상태·메모리 관리", WHY, PREP, [T_GH, T_HF])];
  assert.equal(groundSkillSignals(dup, POOL).signals.length, 1, "같은 역량을 반복하지 않는다");
  assert.equal(groundSkillSignals(["AI 역량이 중요합니다"], POOL).signals.length, 0, "문자열 항목은 버린다");
  const long = "에이전트를 운영하는 팀은 실행 추적과 디버깅 역량을 반드시 갖춰야 하며 이는 매우 중요하다";
  assert.equal(groundSkillSignals([sig(long, WHY, PREP, [T_GH, T_MS])], POOL).signals.length, 0, "역량명 자리의 긴 문장은 버린다");
}

// ⑯ v1 행 호환 — 단일 `evidence_title`로 저장된 과거 데이터를 화면이 배열로 읽는다
{
  const v1: TrendSkillSignal = {
    skill: "에이전트 상태·메모리 관리", why_now: WHY, prepare_focus: PREP,
    evidence_titles: [], evidence_sources: [], evidence_title: T_GH, evidence_source: "GitHub",
  };
  assert.deepEqual(evidenceTitlesOf(v1), [T_GH], "v1 행도 배열로 읽혀야 한다");
  assert.deepEqual(evidenceSourcesOf(v1), ["GitHub"]);
  const v2: TrendSkillSignal = {
    skill: "x", why_now: "y", prepare_focus: "z",
    evidence_titles: [T_GH, T_MS], evidence_sources: ["GitHub", "GitHub"],
  };
  assert.deepEqual(evidenceTitlesOf(v2), [T_GH, T_MS]);
  assert.deepEqual(evidenceSourcesOf(v2), ["GitHub"], "출처는 중복을 제거한다");
}

console.log("trend-brief.check.ts OK (실무 적용 grounding + 역량 시그널 v2: 복수근거·역량명 규칙·채용주장 차단)");
