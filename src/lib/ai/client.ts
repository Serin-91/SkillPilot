import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

// Claude API 키 인증 — 환경변수 ANTHROPIC_API_KEY (로컬 .env.local · Vercel 환경변수).
// SDK 기본 재시도 2회(408/409/429/5xx) — 순간 429 한 번에 하루 뉴스가 통째로 사라졌던 일(2026-10-08) 대비는 그대로 유지된다.
export const AI_MODEL = "claude-sonnet-5-5";

let client: Anthropic | undefined;

// 예전 @google/genai `Type`과 같은 이름 — 스키마 정의는 손대지 않고 JSON Schema 타입명만 바꾼다.
export const Type = {
  OBJECT: "object",
  ARRAY: "array",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
} as const;

type Schema = { [key: string]: unknown };

// Gemini식 표기(nullable · 문자열 숫자 "2")를 표준 JSON Schema로. 남는 미지원 제약(maxItems 등)은
// SDK 변환이 설명(description)으로 옮긴다 — 개수 보장은 각 호출부의 기존 검증이 계속 맡는다.
export function toJsonSchema(s: Schema): Schema {
  const out: Schema = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "nullable") continue;
    if (k === "properties") out[k] = Object.fromEntries(Object.entries(v as Record<string, Schema>).map(([p, ps]) => [p, toJsonSchema(ps)]));
    else if (k === "items") out[k] = toJsonSchema(v as Schema);
    else if ((k === "minItems" || k === "maxItems") && typeof v === "string") out[k] = Number(v);
    else out[k] = v;
  }
  return s.nullable ? { anyOf: [out, { type: "null" }] } : out;
}

// 정해진 모양(JSON)으로 답을 받아 그 문자열을 돌려준다. 빈 응답은 "" — 호출부의 빈 응답 처리를 그대로 탄다.
export async function generateJson(prompt: string, schema: Schema): Promise<string> {
  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 안전 거절 시 서버가 다른 모델로 다시 시도
    output_config: { effort: "medium", format: jsonSchemaOutputFormat(toJsonSchema(schema) as { type: "object" }) },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return "";
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
