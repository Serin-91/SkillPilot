// 자체 점검: `npx tsx src/lib/news/trend-brief.check.ts`
// 실무 적용의 **근거 대조**(groundTakeaways)만 검사한다. 네트워크·Gemini 불필요.
//
// 왜 이 검사가 필요한가 (실측 2026-09-03, DB 27일):
//   프롬프트에 "근거가 없으면 빈 배열을 반환하세요"가 이미 있었는데 0개인 날이 **0일**이었다.
//   지시로는 안 걸리므로 코드가 대조한다 — 그 대조가 깨지면 여기서 터진다.
import assert from "node:assert/strict";
import { groundTakeaways, type EvidenceSource } from "./trend-brief.ts";

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

console.log("trend-brief.check.ts OK");
