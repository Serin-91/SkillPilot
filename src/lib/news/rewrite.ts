import { Type } from "@google/genai";
import { getGenAIClient } from "../ai/client.ts";
import { SYSTEM_PROMPT, looksUntranslated, type SelectedNewsItem } from "./select.ts";
import type { Candidate } from "./rss.ts";

// 🔴🔴 2026-09-02 — **최종 4건만 상향 모델로 다시 쓴다(2단계).** 선정·분류는 flash-lite 그대로다.
//
// 왜: Gemini에 본문이 들어가게 된 뒤(rss.ts pickRicherText, 최대 2000자)에도 요약이 안 길어졌다.
// 프롬프트로 문장 예산을 올리는 시도를 3회 했고 **3회 다 같거나 더 짧아졌다**(4~7문장 허용 / 흐름
// 템플릿 7칸 / 전면 재작성 — 마지막 것은 줄바꿈까지 잃었다). 그래서 프롬프트가 아니라 **작성 모델의
// 성향 한계**로 판정했다. 프롬프트는 그 뒤로 안 건드린다.
//
// 모델 비교(동일 기사 6건·동일 스키마·현행 SYSTEM_PROMPT·모델만 교체, 2026-09-02):
//   flash-lite 1-call(현행)  336자 5.0문장 수치 7   형식붕괴 0
//   3.5-flash                372자 3.3문장 수치 8   형식붕괴 4  ← 줄바꿈을 버린다. 게다가 제일 비싸다
//   **3.6-flash**            358자 4.3문장 수치 8   형식붕괴 **0**  ← 유일하게 전 구간 형식 준수
//   3.7-flash                374자 5.0문장 수치 8   형식붕괴 2 + **파싱 실패 1건**(기사 누락 위험)
//   2.5-pro                  410자 4.7문장 수치 11  형식붕괴 2, 비용 2배
// 진짜 환각은 전 모델 0건이었다(2.5-pro의 자동탐지 2건은 3B→30억 단위 환산 오탐).
// 👉 정보량 최고는 2.5-pro지만 **형식이 깨진다.** 하루 4건이라 비용차($0.41 vs $0.92/월)는 작지만,
//    줄바꿈이 깨지면 화면에서 문단이 사라진다 — 그래서 **3.6-flash**를 고른다.
// 3.6-flash 편차(같은 기사 6건 × 3회): 273/290/281자 · 4.2~4.5문장 · 존댓말 0/6 · 형식붕괴 0 · 환각 0 · 실패 0.
const WRITER_MODEL = "gemini-3.6-flash";

// 🔴 **정체성 필드는 절대 모델에게 다시 받지 않는다.** url·source·published_at·importance·topic_group은
//    1단계 결과를 그대로 유지한다 — reconcileWithCandidates가 세운 원칙과 같다(모델이 URL을 지어내
//    죽은 링크가 나간 사고가 있었다). 여기서는 **글만** 다시 받는다.
const REWRITE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    related_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    reason_selected: { type: Type.STRING },
    uncertainty: { type: Type.STRING, nullable: true },
  },
  required: ["title", "summary", "related_concepts", "reason_selected"],
};

// 한 건이라도 이상하면 **그 건만** 1단계 결과로 되돌린다(fail-open). 뉴스가 통째로 사라지는 것보다
// 낫고, 상향 모델이 죽어도 제품은 어제와 같은 품질로 계속 돈다.
export function usable(o: unknown, before: SelectedNewsItem): boolean {
  const x = o as Partial<SelectedNewsItem>;
  if (!x || typeof x.summary !== "string" || typeof x.title !== "string") return false;
  if (x.summary.trim().length < 40) return false;            // 빈손·한 줄짜리 응답
  if (looksUntranslated(x.title)) return false;              // 번역 관문(1단계와 같은 판정기)
  if (!Array.isArray(x.related_concepts) || x.related_concepts.length === 0) return false;
  if (typeof x.reason_selected !== "string" || !x.reason_selected.trim()) return false;
  void before;
  return true;
}

export async function rewriteSelectedNews(
  items: SelectedNewsItem[],
  candidates: Candidate[]
): Promise<SelectedNewsItem[]> {
  if (items.length === 0) return items;
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const ai = getGenAIClient();
  let ok = 0;
  const out: SelectedNewsItem[] = [];
  for (const item of items) {
    const src = byUrl.get(item.url);
    // 후보 본문을 못 찾으면 다시 쓸 재료가 없다 — 1단계 결과를 그대로 둔다.
    if (!src) { out.push(item); continue; }
    try {
      const prompt =
        `${SYSTEM_PROMPT}\n\n[이번 호출은 **선정이 끝난 기사 한 건을 쓰는 것**이다. 고르지 말고 아래 기사만 작성한다.]\n` +
        `출처: ${src.source}\n제목: ${src.title}\n<<<기사본문 1 시작>>>\n${src.summary}\n<<<기사본문 1 끝>>>`;
      const res = await ai.models.generateContent({
        model: WRITER_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: REWRITE_SCHEMA },
      });
      const parsed = JSON.parse(res.text ?? "{}");
      if (!usable(parsed, item)) { out.push(item); continue; }
      // 글만 덮어쓴다. 정체성 필드는 1단계 값을 유지한다.
      out.push({ ...item, title: parsed.title, summary: parsed.summary,
        related_concepts: parsed.related_concepts, reason_selected: parsed.reason_selected,
        uncertainty: parsed.uncertainty ?? null });
      ok += 1;
    } catch (e) {
      console.error(`[news-rewrite] ${WRITER_MODEL} 실패 — 1단계 결과 유지:`, item.url, e);
      out.push(item);
    }
  }
  console.log(`[news-rewrite] ${WRITER_MODEL}: ${items.length}건 중 ${ok}건 재작성, ${items.length - ok}건은 1단계 유지`);
  return out;
}
