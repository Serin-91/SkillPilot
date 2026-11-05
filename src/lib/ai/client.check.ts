// 자체 점검: Gemini식 스키마 변환 + Claude 요청 모양(모델·effort·fallbacks·형식) + 응답 텍스트 추출. 네트워크 없음.
import assert from "node:assert/strict";
import { Type, toJsonSchema, generateJson } from "./client.ts";

const s = toJsonSchema({
  type: Type.OBJECT,
  properties: { u: { type: Type.STRING, nullable: true }, p: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "2", maxItems: "3" } },
  required: ["p"],
});
assert.deepEqual(s, {
  type: "object",
  properties: { u: { anyOf: [{ type: "string" }, { type: "null" }] }, p: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 } },
  required: ["p"],
});

async function main() {
process.env.ANTHROPIC_API_KEY = "test";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 요청 본문을 그대로 들여다보는 점검
let body: any, beta: string | null = null;
let reply: Record<string, unknown> = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: '{"p":["a","b"]}' }] };
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  body = JSON.parse(String(init.body));
  beta = new Headers(init.headers).get("anthropic-beta");
  return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...reply }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

assert.equal(await generateJson("hi", { type: Type.OBJECT, properties: { p: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: "3" } } }), '{"p":["a","b"]}');
assert.equal(body.model, "claude-sonnet-5-5");
assert.equal(body.fallbacks, "default");
assert.equal(body.output_config.effort, "medium");
assert.equal(body.output_config.format.type, "json_schema");
assert.equal(body.output_config.format.schema.additionalProperties, false);
assert.equal(body.output_config.format.schema.properties.p.maxItems, undefined); // 미지원 제약은 설명으로 옮겨진다
assert.match(body.output_config.format.schema.properties.p.description, /maxItems: 3/);
assert.equal("temperature" in body, false);
assert.match(beta ?? "", /server-side-fallback-2026-07-01/);

reply = { stop_reason: "refusal", content: [] };
assert.equal(await generateJson("hi", { type: Type.OBJECT, properties: {} }), ""); // 거절 → 빈 응답(호출부가 실패로 처리)
console.log("ai/client.check: OK — 스키마 변환 · 요청 모양 · 텍스트 추출 · 거절");
}
main().catch((e) => { console.error(e); process.exit(1); });
