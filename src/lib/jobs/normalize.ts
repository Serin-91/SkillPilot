import type { ExtractedJobFields } from "./extract-fields";
import {
  parseConfidence, flattenForCompare, isDegenerateSection, MIN_REAL_BODY_LENGTH, type BodySections,
} from "./section-quality.ts";

// ── 섹션 파싱 실패 공고의 LLM 재추출 ────────────────────────────────────────────────────────
// 잡코리아 상세는 섹션 경계가 **선언되지 않는다**(ld+json의 description은 91자짜리 SEO 템플릿이고,
// __NEXT_DATA__도 API도 시맨틱 마크업도 없다 — 라이브 81건 전수조사). 그래서 라벨 휴리스틱이
// 실패하는 공고가 남고, 실측에서 71건 중 36건이 responsibilities 한 칸에 본문을 통째로 담고 있었다.
//
// 🔴 이 단계는 **passesHardFilter / roleFitScore보다 먼저** 돈다(generate.ts extractCandidatesFrom).
//    채점이 responsibilities/required_text/preferred_text를 필드 가중치로 읽기 때문에, 정규화를
//    upsert 직전에 두면 화면 표시만 좋아지고 **선정 결과는 통짜 본문 기준 그대로**다.
//
// 🔴 추출 전용이다. 모델이 만든 문장은 전부 버린다 — 출력 각 줄이 원문의 부분문자열이어야만 통과한다.
//    (공백만 지우고 비교한다. 모델이 줄바꿈·들여쓰기를 다시 붙이는 건 정상이고, 그걸로 버리면
//     정상 추출까지 전멸한다.)
// 🔴 fail-closed. 모델 오류·타임아웃·검증 실패·빈 결과는 전부 **기존 파서 결과 그대로**로 끝난다.
//    어떤 경로로도 기존 값을 빈 문자열로 덮지 않는다.

export type NormalizeTally = { candidates: number; low: number; calls: number; accepted: number; rejected: number };
export function newNormalizeTally(): NormalizeTally {
  return { candidates: 0, low: 0, calls: 0, accepted: 0, rejected: 0 };
}
export function formatNormalizeTally(t: NormalizeTally): string {
  return `후보 ${t.candidates} / 저신뢰 ${t.low} / LLM호출 ${t.calls} / 채택 ${t.accepted} / 기각 ${t.rejected}`;
}

// 입력 상한. 8,000자면 실측 최장 공고(4,000자 × 3섹션 상한)를 자르지 않고 담으면서 토큰이 튀지 않는다.
const MAX_INPUT_CHARS = 8_000;
const CALL_TIMEOUT_MS = 15_000;

const PROMPT = `너는 채용공고 본문에서 문장을 **골라내는** 도구다. 새 문장을 쓰지 마라.

규칙:
1. 아래 본문에 실제로 있는 줄만 **글자 그대로** 옮긴다. 요약·번역·재작성·합치기 전부 금지다.
2. 각 줄을 세 갈래 중 하나에 넣는다. 어디에도 안 맞으면 버린다.
   - responsibilities: 담당업무 / 주요업무 / 하게 될 일
   - requirements: 자격요건 / 필수사항 / 지원자격
   - preferred: 우대사항 / 있으면 좋은 경험
3. 회사소개·복리후생·근무조건·전형절차·접수방법은 세 갈래 어디에도 넣지 않는다.
4. 해당하는 줄이 없는 갈래는 빈 배열로 둔다. 추측해서 채우지 마라.

[본문]
`;

export type LlmCall = (prompt: string) => Promise<string>;

// 뉴스 파이프라인과 같은 클라이언트·모델을 쓴다(src/lib/ai/client.ts, gemini-3.5-flash-lite).
// 🔴 import를 함수 안으로 넣은 이유: 이 모듈이 오프라인 자체 점검에서 그대로 import되기 때문이다.
//    top-level import면 테스트가 스텁을 넣어도 @google/genai가 매번 로드된다.
const geminiCall: LlmCall = async (prompt) => {
  const [{ getGenAIClient }, { Type }] = await Promise.all([import("../ai/client"), import("@google/genai")]);
  const response = await getGenAIClient().models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
          requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
          preferred: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["responsibilities", "requirements", "preferred"],
      },
    },
  });
  return response.text ?? "";
};

// 모델 출력 한 갈래 → 원문에 실재하는 줄만 남긴 문자열.
function keepOnlyQuoted(lines: unknown, flatSource: string): string {
  if (!Array.isArray(lines)) return "";
  const kept: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const line = raw.trim();
    const flat = flattenForCompare(line);
    if (flat.length < 2) continue;
    if (!flatSource.includes(flat)) continue; // 🔴 환각 줄은 여기서 죽는다
    kept.push(line);
  }
  return kept.join("\n");
}

export function bodyTextOf(fields: Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text">): string {
  return [fields.responsibilities, fields.required_text, fields.preferred_text].filter(Boolean).join("\n").trim();
}

export async function normalizeJobFields(
  fields: ExtractedJobFields,
  tally: NormalizeTally,
  call: LlmCall = geminiCall
): Promise<ExtractedJobFields> {
  tally.candidates++;
  const sections: BodySections = {
    responsibilities: fields.responsibilities ?? "",
    required_text: fields.required_text ?? "",
    preferred_text: fields.preferred_text ?? "",
  };
  const body = bodyTextOf(sections);
  if (parseConfidence(sections, body) === "high") return fields;
  tally.low++;
  // 🔴 이미지 공고(본문 텍스트가 사실상 없음)는 절대 부르지 않는다. 뽑을 글자가 없으니 호출이
  //    전부 낭비고, 모델이 뭘 주든 부분문자열 검증에서 어차피 전멸한다. OCR은 하지 않는다.
  if (body.length < MIN_REAL_BODY_LENGTH) return fields;

  tally.calls++;
  const source = body.slice(0, MAX_INPUT_CHARS);
  let parsed: { responsibilities?: unknown; requirements?: unknown; preferred?: unknown };
  try {
    const text = await Promise.race([
      call(PROMPT + source),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CALL_TIMEOUT_MS)),
    ]);
    parsed = JSON.parse(text || "{}");
  } catch {
    tally.rejected++;
    return fields; // fail-closed — 기존 파서 결과를 그대로 둔다
  }

  const flatSource = flattenForCompare(source);
  const next = {
    responsibilities: keepOnlyQuoted(parsed.responsibilities, flatSource),
    required_text: keepOnlyQuoted(parsed.requirements, flatSource),
    preferred_text: keepOnlyQuoted(parsed.preferred, flatSource),
  };
  // 주요업무가 비면 이 결과로는 카드가 빈 카드다 — 통째로 기각하고 기존 값을 지킨다.
  if (isDegenerateSection(next.responsibilities)) {
    tally.rejected++;
    return fields;
  }
  tally.accepted++;
  // 비어 나온 갈래는 **덮지 않는다.** 정규화가 기존 값을 지우는 경로를 아예 만들지 않는다.
  return {
    ...fields,
    responsibilities: next.responsibilities,
    required_text: next.required_text || sections.required_text,
    preferred_text: next.preferred_text || sections.preferred_text,
  };
}
