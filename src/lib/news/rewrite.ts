import { Type } from "@google/genai";
import { getGenAIClient } from "../ai/client.ts";
import { SYSTEM_PROMPT, looksUntranslated, type SelectedNewsItem } from "./select.ts";
import { pickRicherText, type Candidate } from "./rss.ts";
import { fetchArticleBody } from "./article-body.ts";

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
//
// 🔴🔴 2026-09-03 — **문장 수를 프롬프트로 요구하지 않는다. 스키마가 센다.**
// 위 주석이 적은 대로 "문장 예산을 프롬프트로 올리는" 시도는 3회 전부 실패했다(같거나 더 짧아졌다).
// 그래서 4번째 프롬프트 시도를 하지 않고, 이 저장소가 이미 세운 원칙으로 돌아간다 —
// **"카운팅 제약은 프롬프트가 아니라 코드가 센다"**(select.ts의 violatesSourceCap·topic_group 주석).
// `summary`를 문자열 하나가 아니라 **항목 배열**로 받으면 개수는 스키마의 minItems가 강제하고,
// 모델은 "몇 문장 쓸까"가 아니라 "이 칸을 채울까"를 판단하게 된다. 아래 usable()이 다시 센다.
//
// 부수 효과 하나가 더 있다: 화면이 **LLM이 넣은 `\n`에 의존하지 않게 된다.**
// (기존엔 `.editorial-summary { white-space: pre-line }`이 모델의 줄바꿈을 그대로 믿고 있었다.
//  모델이 줄바꿈을 빼먹으면 한 덩어리가 됐고, 그게 3.5-flash를 탈락시킨 "형식붕괴"의 정체다.)
// 🔴 **칸 수를 재료 길이가 정한다.** 실측(2026-09-03, 이 파이프라인 그대로 1회):
//     재료  299자 → 요약 223자 (재료의 75%)   ← 더 쓸 게 없다
//     재료  299자 → 요약 237자 (79%)
//     재료 1291자 → 요약 291자 (23%)          ← 여유가 남는다
//     재료 1996자 → 요약 384자 (19%)          ← 여유가 남는다
// 소스별 재료 중앙값: AI타임스 300(RSS가 300에서 자름) · TechCrunch 147 · Ars 1264 · ZDNet 1941 · MIT 2000.
// 후보 57건 중 44건이 앞의 두 소스다 — 거기서 분량을 늘리라고 요구하면 **지어내라는 뜻**이 된다.
// 그래서 재료가 많은 기사에만 칸을 더 요구한다. 판단은 프롬프트가 아니라 이 함수가 한다.
//
// 💀💀 2026-09-03 — **1500으로 올려봤고 되돌렸다. 다시 시도하지 마라(실측 근거 아래).**
// 사용자 신고: "줄바꿈이 왜 이렇게 부자연스럽냐"(Ars 기사, 재료 1,291자 → 4문단 65/56/83/77자).
// 가설: 이 임계가 재료 **길이**를 정보 **밀도**의 대리값으로 쓰는 탓에, 짧은 속보가 rich로 판정돼
//       4칸 하한을 받고 한 문단이 한 문장으로 쪼개진다 → 임계를 올려 3~4칸으로 내리면 된다.
// A/B 실측(같은 기사·같은 재료·**3회씩**, 소스명이 아니라 재료 길이 구간으로 판정):
//     재료 1,264자   문단 4→3 · 총량 295→241 (**-18%**) · 문단평균 74→80
//     재료 1,291자   문단 4→3 · 총량 299→275 (** -8%**) · 문단평균 75→84
//     재료 1,493자   문단 4→4 · 총량 305→330 (  +8%)   · 문단평균 77→83
//     재료   702자   문단 4→3 · 총량 305→232 (**-24%**) · 문단평균 76→77  ← 개선 0, 손실만
//     재료   945자   문단 4→3 · 총량 357→347 (  -3%)   · 문단평균 89→87
//   대조군(>=1500이라 임계 변경의 영향을 받을 수 없는 구간): 323→312(-3%) · 334→327(-2%)
//   👉 **대조군 편차가 ±3%다.** 그러니 -8%·-18%·-24%는 노이즈가 아니라 실측 감소다.
// 결론: 이건 버그 수정이 아니라 **교환**이다 — 문단 밀도 +8~12% ↔ 총량 -8~24%.
//   그리고 700~1,000자 구간은 밀도 개선이 **0**인데 총량만 깎인다(702자 사례).
//   재료 1,291자에서 요약 ~300자는 이미 천장이다(위 표의 23%). 300자를 4칸에 담으면 75자씩,
//   3칸에 담으면 84자씩인데 **3칸으로 가면 총량도 같이 줄어든다** — 밀도를 분량으로 사는 셈이다.
// 🔴 문단이 짧아 보이는 것은 **표시 문제**로 남긴다(대시보드 `.editorial-para` 간격 10px /
//    `.editorial-summary` line-height 1.9). 값을 다시 만지기 전에 **스크린샷으로 무엇이
//    부자연스러운지 먼저 확정해라** — 나는 그걸 확정하지 않고 임계값부터 만졌다.
const RICH_MATERIAL = 700;
function schemaFor(materialLength: number) {
  const rich = materialLength >= RICH_MATERIAL;
  return {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      summary_paras: {
        type: Type.ARRAY, items: { type: Type.STRING },
        minItems: rich ? "4" : "3", maxItems: rich ? "6" : "4",
      },
      related_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
      why_paras: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "2", maxItems: "3" },
      uncertainty: { type: Type.STRING, nullable: true },
    },
    required: ["title", "summary_paras", "related_concepts", "why_paras"],
  };
}
// usable()이 셀 때 쓰는 같은 판정 — 두 곳이 어긋나면 정상 응답을 되돌려버린다.
function summaryRange(materialLength: number): [number, number] {
  return materialLength >= RICH_MATERIAL ? [4, 6] : [3, 4];
}

// 이 호출에만 붙는 지시. 🔴 `SYSTEM_PROMPT`는 **선정 호출과 공유**하므로 절대 건드리지 않는다 —
// 거기 손대면 "무엇을 고를지"가 같이 바뀐다(사용자가 금지한 것).
const WRITER_SUFFIX = `
[이번 호출의 출력 형식 — summary_paras / why_paras]
summary_paras: 3~5개 항목. 각 항목은 1~2문장이고 **서로 다른 정보**를 담는다.
  · 무엇이 발표·발생했는가 (주체와 대상을 명확히)
  · 구체적으로 무엇이 바뀌었는가 (기능·수치·조건 등 기사에 적힌 것)
  · 이전 상황과 비교해 무엇이 다른가
  · 기사에 적혀 있다면: 어디에 적용되는가 / 언제부터인가 / 무엇이 아직 아닌가
why_paras: 2~3개 항목. 각 항목 1~2문장. summary_paras의 문장을 **다시 쓰지 않는다.**
  · 왜 중요한 변화인가 / 산업·기업에 어떤 영향을 줄 수 있는가 /
    AI·개발 생태계에서 왜 주목할 만한가 중 **기사에 근거가 있는 것만**
🔴 칸을 채우려고 만들지 않는다. 기사에 없는 전망·수치·기업 계획·시장 영향을 쓰지 않는다.
   근거가 되는 정보가 부족하면 **항목 수를 최소(summary 3개 / why 2개)로 줄인다.**
   같은 내용을 말만 바꿔 반복하는 것은 항목을 채운 것이 아니다.
🔴 배열의 각 항목 안에는 줄바꿈을 넣지 않는다 — 항목 하나가 곧 한 문단이다.`;

// 한 건이라도 이상하면 **그 건만** 1단계 결과로 되돌린다(fail-open). 뉴스가 통째로 사라지는 것보다
// 낫고, 상향 모델이 죽어도 제품은 어제와 같은 품질로 계속 돈다.
// 🔴 스키마에 minItems를 걸어도 **코드가 다시 센다.** 이 저장소의 원칙이고(개수를 프롬프트/스키마
//    한쪽만 믿었다가 두 번 실패했다), 실패하면 그 건만 1단계 결과로 되돌아가 화면은 어제 품질을 유지한다.
const PARA_MIN = 12; // 항목 하나의 최소 길이 — "그렇다." 같은 빈 칸 채우기를 걸러낸다
function paras(v: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const cleaned = v.filter((s): s is string => typeof s === "string" && s.trim().length >= PARA_MIN)
    .map((s) => s.replace(/\s+/g, " ").trim());
  if (cleaned.length < min || cleaned.length > max) return null;
  return cleaned;
}

export function usable(o: unknown, before: SelectedNewsItem, materialLength = 0): boolean {
  const x = o as Record<string, unknown>;
  if (!x || typeof x.title !== "string") return false;
  if (looksUntranslated(x.title)) return false;              // 번역 관문(1단계와 같은 판정기)
  if (!Array.isArray(x.related_concepts) || x.related_concepts.length === 0) return false;
  const [lo, hi] = summaryRange(materialLength);
  const s = paras(x.summary_paras, lo, hi);
  const w = paras(x.why_paras, 2, 3);
  if (!s || !w) return false;
  if (s.join(" ").length < 120) return false;                // 칸을 다 채웠어도 통째로 짧으면 되돌린다
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
      // 🔴 2026-09-03 — **최종 선정된 이 4건에만** 원문 본문을 받아 재료를 늘린다(article-body.ts).
      //    AI타임스는 `content:encoded`가 0/50건이라 RSS가 300자에서 자른 요약이 재료의 전부였다.
      //    ⚠️ 무조건 본문을 쓰지 않는다 — `pickRicherText`로 **긴 쪽**을 고르고 상한(2000자)까지 자른다.
      //       실측에서 영상 뉴스 한 건이 본문 57자 < RSS 56자였다(기자 서명만 있는 기사). 소스 목록이
      //       아니라 길이가 판정하므로, 본문이 빈약한 기사는 자동으로 RSS 요약이 이긴다.
      //    실패하면 fetchArticleBody가 null을 주고 여기서 즉시 기존 RSS 요약으로 되돌아간다.
      const text = pickRicherText(src.summary, (await fetchArticleBody(src.source, src.url)) ?? "");
      const prompt =
        `${SYSTEM_PROMPT}\n\n[이번 호출은 **선정이 끝난 기사 한 건을 쓰는 것**이다. 고르지 말고 아래 기사만 작성한다.]\n` +
        `${WRITER_SUFFIX}\n` +
        `출처: ${src.source}\n제목: ${src.title}\n<<<기사본문 1 시작>>>\n${text}\n<<<기사본문 1 끝>>>`;
      const material = text.length;
      const res = await ai.models.generateContent({
        model: WRITER_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: schemaFor(material) },
      });
      const parsed = JSON.parse(res.text ?? "{}");
      if (!usable(parsed, item, material)) { out.push(item); continue; }
      // 글만 덮어쓴다. 정체성 필드는 1단계 값을 유지한다.
      // summary/reason_selected는 **join한 문자열로 계속 채운다** — trend-brief의 formatNews,
      // 메모 전체저장(newsFullBlockHtml), 과거 데이터 렌더가 전부 이 두 필드를 읽는다.
      // 화면은 배열(summary_paras/why_paras)을 우선 쓰고, 없으면 이 문자열로 되돌아간다.
      const [lo, hi] = summaryRange(material);
      const sp = paras(parsed.summary_paras, lo, hi)!;
      const wp = paras(parsed.why_paras, 2, 3)!;
      out.push({ ...item, title: parsed.title,
        summary: sp.join("\n"), summary_paras: sp,
        related_concepts: parsed.related_concepts,
        reason_selected: wp.join("\n"), why_paras: wp,
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
