import { Type } from "@google/genai";
import type { SelectedNewsItem } from "./select";
import type { DevEcosystem, DevUpdate } from "./dev-ecosystem";
import { getGenAIClient } from "../ai/client";

// 요청서 16절 JSON Schema. 근거가 부족한 섹션은 null을 그대로 받는다 (17절)
export type TrendToolUpdate = {
  title: string;
  summary: string;
  source: string;
  published_at: string | null;
  url: string | null;
};

export type TrendDeveloperTrend = {
  title: string;
  summary: string;
  source: string;
  url: string | null;
};

export type TrendBriefResult = {
  // 🔴 2026-09-03 — `content`(문자열 하나)만 있던 것에 `points`를 더했다.
  // 업계 영향이 화면에서 한 덩어리로 보인 원인이 **두 겹**이었다:
  //   ① 데이터가 문자열 하나 ② `.trend-detail-body`에 `white-space: pre-line`이 없어서
  //      모델이 `\n`을 넣어도 브라우저가 접는다.
  // → 프롬프트에 "\n을 넣어라"로 고치면 UI가 LLM 문자열에 의존한다(사용자 금지). 항목으로 받는다.
  // `content`는 계속 채운다(points를 join) — 메모 전체저장·과거 데이터가 그 필드를 읽는다.
  industry_impact: { content: string; points?: string[] } | null;
  // `tool_update`(단일)은 과거 데이터 호환으로 남기고, 새 생성은 `tool_updates`(1~3건)를 채운다.
  // 화면은 `tool_updates ?? [tool_update]`로 읽어 둘 다 동작한다.
  tool_update: TrendToolUpdate | null;
  tool_updates?: TrendToolUpdate[];
  developer_trend: TrendDeveloperTrend | null;
  // 🔴 2026-09-03 — **저장·UI 타입은 `string[]` 그대로다.** 모델에게는 아래 스키마로 객체
  // (action / why_today / evidence_title)를 받지만, `groundTakeaways`가 근거를 대조한 뒤
  // 문자열로 합쳐서 이 필드에 넣는다. 화면(`<li>{t}</li>`)·메모 저장(`bullets`)·과거 데이터가
  // 전부 `string[]`을 읽으므로 **UI를 한 줄도 안 바꾸려고** 이 경계를 유지한다.
  practical_takeaways: string[];
};

// 실무 적용의 근거로 인정되는 입력 항목 — 프롬프트에 실제로 들어간 제목만 모은다.
export type EvidenceSource = { title: string; source: string };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 개수는 프롬프트가 아니라 스키마가 센다(select.ts가 세운 원칙 — 프롬프트만으로는 실패했다).
    industry_impact: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        points: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "2", maxItems: "3" },
      },
      required: ["points"],
    },
    // ⚠️ minItems를 걸지 않는다 — GitHub 목록이 빈약한 날 2건을 강제하면 모델이 없는 것을 만든다
    //    (사용자가 금지한 것). 상한만 걸고 "2~3개, 근거가 부족하면 있는 만큼만"은 프롬프트로 말한다.
    tool_updates: {
      type: Type.ARRAY,
      maxItems: "3",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          source: { type: Type.STRING },
          published_at: { type: Type.STRING, nullable: true },
          url: { type: Type.STRING, nullable: true },
        },
        required: ["title", "summary", "source"],
      },
    },
    developer_trend: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        source: { type: Type.STRING },
        url: { type: Type.STRING, nullable: true },
      },
      required: ["title", "summary", "source"],
    },
    // 🔴 문자열 → 객체. 근거(evidence_title)를 **필수 필드로** 받아야 코드가 대조할 수 있다.
    //    minItems는 걸지 않는다 — 빈 배열이 정상 출력이다(근거가 없는 날).
    practical_takeaways: {
      type: Type.ARRAY,
      maxItems: "3",
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          why_today: { type: Type.STRING },
          evidence_title: { type: Type.STRING },
        },
        required: ["action", "why_today", "evidence_title"],
      },
    },
  },
  required: ["industry_impact", "tool_updates", "developer_trend", "practical_takeaways"],
};

const SYSTEM_PROMPT = `당신은 AI 개발자를 위한 기술 동향 분석기입니다.
아래 제공된 데이터만 사용해 "AI Trend Briefing"을 한국어로 생성하세요.

[industry_impact — 업계 영향]
"주요 AI 뉴스" 전체를 종합해 AI 산업·기업·개발 환경에서 나타나는 **핵심 흐름 2~3개**를
points 배열에 담으세요. **배열 항목 하나가 곧 하나의 흐름이고 화면의 한 문단입니다.**
각 항목은 1~2문장으로 ① 어떤 흐름이 나타나는지 ② 왜 산업적으로 의미가 있는지를 함께 씁니다.
개별 뉴스를 다시 요약하지 마세요. 여러 뉴스에서 공통으로 확인되는 흐름을 우선하세요.
서로 관련 없는 뉴스를 억지로 하나의 흐름으로 연결하지 마세요.
🔴 흐름이 2개밖에 안 보이면 2개만 쓰세요. 칸을 채우려고 억지 흐름을 만들지 마세요.
미래 영향은 확정 사실처럼 쓰지 말고 "~할 가능성이 있습니다", "~의 중요성이 커질 수 있습니다"처럼
분석임이 드러나는 표현을 쓰세요.
🔴 항목 안에는 줄바꿈을 넣지 마세요. 문단 분리는 배열이 합니다.
뉴스가 없으면 null.

[tool_updates — 도구·서비스]
"GitHub 공식 업데이트" 목록에서 AI 개발자가 실무적으로 알아둘 가치가 높은 항목을 **2~3개** 고르세요.
각 항목은 title(기능·서비스명이 드러나는 제목)과 summary를 채우고, summary에는
① 무엇이 바뀌었는지 ② 그것이 개발자에게 어떤 의미가 있는지를 **둘 다** 씁니다.
제품명과 업데이트명을 나열하는 것으로 끝내지 마세요 — "무엇이 달라졌고 그래서 무엇을 할 수
있게 되었는가"가 없으면 그 항목은 쓸 이유가 없습니다.
🔴 알아둘 가치가 있는 항목이 2개뿐이면 2개, 1개면 1개만 담으세요. 목록을 채우려고
   사소한 항목이나 없는 내용을 넣지 마세요. 목록이 비었으면 빈 배열을 반환하세요.
title과 summary는 반드시 자연스러운 한국어 문장으로 쓰세요. 입력(GitHub Changelog 등)이 영어 원문이어도
그 문장을 그대로 옮기지 말고 한국어로 번역·설명하세요. 단 GitHub Copilot, Codespaces처럼 제품·기능·서비스
고유명사는 번역하지 않고 원문 그대로 둡니다. source/url/published_at은 고른 항목의 입력값을 그대로 복사하세요
(이 세 필드만 원문 값을 유지하고, title·summary처럼 새로 쓰는 문장에는 적용하지 않습니다).
시장 전망은 쓰지 마세요.

[developer_trend — 개발자 동향]
"Hugging Face 생태계 데이터"에서 단순 모델 출시 소식이 아니라
AI 개발 방식 또는 생태계가 어디로 움직이는지를 분석하세요.
"신모델이 나왔다" 수준에서 끝내지 말고, 그 항목이 보여주는 개발 방식의 변화를 쓰세요.
여러 항목에서 공통되는 흐름이 있으면 우선하세요.
입력에 근거가 없는 성능 평가나 모델 우열 판단은 하지 마세요.
title은 흐름을 요약한 짧은 제목, summary는 2~4문장.
title과 summary는 반드시 자연스러운 한국어로 쓰세요. 근거로 삼은 입력(Hugging Face 블로그 등)이 영어
원문이어도 그대로 옮기지 말고 한국어로 번역·설명하세요. 모델명·라이브러리명 등 고유명사는 번역하지 않습니다.
url은 근거로 삼은 항목의 입력값을 그대로 복사하고, 없으면 null.
의미 있는 흐름을 찾을 수 없으면 null.

[practical_takeaways — 실무 적용]
🔴 이 섹션은 **일반적인 AI 개발 팁을 쓰는 칸이 아닙니다.**
   **오늘 위에 제공된 자료에서 실제로 확인된 변화** 때문에 지금 개발자가 검토하거나 시험해볼
   가치가 생긴 행동만 씁니다.

항목마다 세 필드를 채웁니다.
· action        — 개발자가 실제로 해볼 수 있는 행동. 아래 다섯이 **모두** 드러나게 씁니다.
                  ① **누구에게 해당되는가** — 조건이 필요하면 "~를 쓰고 있다면"처럼 **조건으로** 씁니다.
                     🔴 읽는 사람의 환경을 **단정하지 마세요.** "기존에 사용하던 ~", "지금 쓰고 있는 ~"은
                        확인된 적이 없는 가정입니다. 조건문으로 바꿔 쓰세요.
                  ② **무엇을 해볼 것인가**
                  ③ **어떻게 실행할 것인가** — 대상과 범위를 구체적으로(어떤 작업에, 무엇과 무엇을)
                  ④ **무엇을 비교·검증할 것인가** — 눈으로 확인되는 기준(품질·속도·비용·실패율·출력 차이 등)
                  ⑤ **그래서 무엇을 판단하거나 알게 되는가**
                  🔴 **근거 문장을 명령형으로 바꾼 것은 실무 적용이 아닙니다.**
                     "X가 바뀐다" → "X를 바꿔 써본다"는 정보를 하나도 더하지 않습니다.
                     "써본다 / 확인해본다 / 적용해본다"로 끝났다면 ③④⑤가 빠진 것입니다.
                  🔴 근거 자료에 없는 도구·설정·수치·환경을 지어내지 마세요.
· why_today     — **왜 하필 오늘 해볼 가치가 있는가.** 근거 자료에서 확인된 변화를 짚어 씁니다.
                  "일반적으로 유용하다"는 이유가 되지 않습니다.
· evidence_title — 근거로 삼은 항목의 **제목을 위 입력에서 그대로 복사**합니다
                  (주요 AI 뉴스 / GitHub 공식 업데이트 / Hugging Face 생태계 데이터 중 하나의 제목).
                  🔴 입력에 없는 제목을 쓰면 **그 항목은 버려집니다.** 지어내지 마세요.
                  🔴 여러 자료를 묶었으면 그중 **가장 직접적인 근거 하나**의 제목을 씁니다.

🔴 **근거는 세 블록 어디서든 고릅니다 — 블록 사이에 우선순위가 없습니다.**
   "GitHub 공식 업데이트"가 행동으로 옮기기 쉬워 보여도 그것을 기본값으로 삼지 마세요.
   "주요 AI 뉴스"와 "Hugging Face 생태계 데이터"도 **동등한 근거 후보**입니다.
   입력 **전체**에서 가장 구체적이고 지금 시험해볼 가치가 큰 근거를 고르세요.

[근거를 행동으로 바꾸는 규칙 — 자료 종류를 가리지 않습니다]
입력에 새로운 모델·기법·아키텍처·API·성능/비용 수치·연구 결과가 있으면, 개발자가 그것을
**직접 재현·비교·측정·검증**하거나 **자기 환경에 적용 가능한지 확인**하는 행동으로 바꿀 수 있습니다.
"무엇이 발표됐다"에서 멈추지 말고 "그래서 무엇을 해보면 확인되는가"까지 가세요.
발표·연구 결과라서 행동으로 못 바꾼다고 미리 판단하지 마세요 — 바꿀 수 있는지 먼저 따져보세요.

🔴 개수는 **근거가 확실한 것만 1~3개**입니다. "2개는 채워야 한다"는 규칙은 없습니다.
   확실한 것이 1개면 1개만 쓰고, **하나도 없으면 빈 배열**을 반환하세요.
⚠️ 출처를 골고루 섞으려고 뉴스나 Hugging Face 항목을 **억지로 넣지 마세요.**
   근거가 약한 항목을 다양성 때문에 포함하는 것은 이 섹션의 실패입니다.
🔴 특정 자료에 붙지 않는 범용 조언을 쓰지 마세요. "PoC를 만들어본다", "프로젝트에 적용해본다",
   "성능과 비용을 비교한다", "최신 동향을 검토한다"처럼 **어느 날 갖다 놔도 말이 되는 문장**은
   전부 이 섹션의 실패입니다.
🔴 입력 자료에 없는 사실·사용법·수치를 외부 지식으로 만들어내지 마세요.

[반드시 지킬 것]
1. 입력 데이터에 있는 정보만 사실로 사용한다.
2. 입력에 없는 모델명·기능명·기업명·날짜를 만들지 않는다.
3. 입력에 없는 성능 수치나 벤치마크를 만들지 않는다.
4. 사실과 분석을 구분한다.
5. 충분한 근거가 없는 섹션은 null을 반환한다. 섹션을 채우려고 내용을 발명하지 않는다.
6. url·source·published_at은 입력값을 그대로 유지하고 임의로 바꾸지 않는다.
7. title·summary·industry_impact.content·practical_takeaways는 전부 자연스러운 한국어 문장으로 쓴다.
   입력 자료(GitHub Changelog, Hugging Face 블로그 등)가 영어 원문이어도 절대 그대로 옮기지 말고
   한국어로 번역·설명한다. 단 제품·서비스·모델 등 고유명사는 번역하지 않고 원문 그대로 둔다.
`;

// 🔴🔴 2026-09-03 — **근거 대조는 코드가 한다.** 이 저장소가 이미 세운 원칙("카운팅 제약은
// 프롬프트가 아니라 코드가 센다", select.ts·rewrite.ts)을 grounding에도 그대로 적용한 것이다.
//
// 왜 프롬프트만으로는 안 되나 (실측 2026-09-03, DB 27일):
//   "근거가 없으면 빈 배열을 반환하세요"가 이미 프롬프트에 있었는데 **0개인 날 0일 / 1개인 날 0일**,
//   최소가 항상 2였다. 대조군인 다른 세 섹션도 null·빈값이 27일 중 **0일**이다.
//   즉 "부족하면 비워라"는 지시는 27일 동안 한 번도 발동하지 않았다 — 지시로는 안 걸린다.
// 그래서 모델에게 **근거 제목을 대게 하고, 그 제목이 오늘 입력에 실제로 있는지 코드가 대조한다.**
// 범용 조언은 댈 자료가 없어서 통과 자체를 못 한다.
const TAKEAWAY_MIN = 12;   // rewrite.ts의 PARA_MIN과 같은 값 — "그렇다." 같은 빈 칸 채우기를 거른다
const MIN_KEY_LEN = 8;     // 대조 키 최소 길이. 짧은 키로 포함 판정을 하면 아무 데나 걸린다

// 대소문자·공백·구두점을 없애고 비교한다 — 모델이 제목을 옮기며 따옴표나 공백을 바꾸는 것까지
// 실패로 처리하면 정상 항목이 버려진다. 반대로 너무 느슨하면 근거 검증이 무의미해진다.
function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/["'`‘’“”·,.\-_/()[\]:]/g, "");
}

function matchEvidence(
  title: string,
  keyed: { title: string; source: string; key: string }[]
): { title: string; source: string } | null {
  const k = normKey(title);
  if (k.length < MIN_KEY_LEN) return null;
  const exact = keyed.find((p) => p.key === k);
  if (exact) return exact;
  // 부분 일치는 **양쪽 다 충분히 길 때만** 인정한다(HF 모델 id에서 조직명을 빼고 쓰는 경우 등).
  return keyed.find((p) => p.key.length >= MIN_KEY_LEN && (p.key.includes(k) || k.includes(p.key))) ?? null;
}

function shortTitle(t: string): string {
  return t.length <= 52 ? t : `${t.slice(0, 51)}…`;
}

// 근거가 대조되는 항목만 `string[]`으로 만들어 돌려준다. 하나도 없으면 빈 배열이 정상이다.
// export는 자체 점검(trend-brief.check.ts)이 이 판정을 직접 돌려보기 위한 것이다.
export function groundTakeaways(
  raw: unknown,
  pool: EvidenceSource[]
): { takeaways: string[]; dropped: { reason: string; text: string }[] } {
  const dropped: { reason: string; text: string }[] = [];
  if (!Array.isArray(raw)) return { takeaways: [], dropped };

  const keyed = pool
    .map((p) => ({ title: p.title, source: p.source, key: normKey(p.title) }))
    .filter((p) => p.key.length > 0);

  const takeaways: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    // 모델이 스키마를 무시하고 문자열을 돌려주면 근거가 없다는 뜻이다 — 버린다.
    if (!item || typeof item !== "object") {
      dropped.push({ reason: "객체가 아님(근거 필드 없음)", text: String(item).slice(0, 60) });
      continue;
    }
    const o = item as Record<string, unknown>;
    const action = typeof o.action === "string" ? o.action.replace(/\s+/g, " ").trim() : "";
    const why = typeof o.why_today === "string" ? o.why_today.replace(/\s+/g, " ").trim() : "";
    const ev = typeof o.evidence_title === "string" ? o.evidence_title : "";
    if (action.length < TAKEAWAY_MIN || why.length < TAKEAWAY_MIN) {
      dropped.push({ reason: "action/why_today가 비었거나 너무 짧음", text: action.slice(0, 60) });
      continue;
    }
    const hit = matchEvidence(ev, keyed);
    if (!hit) {
      dropped.push({ reason: `근거 제목이 오늘 입력에 없음: "${ev.slice(0, 50)}"`, text: action.slice(0, 60) });
      continue;
    }
    // 한 브리핑 안에서 같은 행동을 두 번 쓰지 않는다.
    const dk = normKey(action);
    if (seen.has(dk)) {
      dropped.push({ reason: "같은 브리핑 안 중복", text: action.slice(0, 60) });
      continue;
    }
    seen.add(dk);
    takeaways.push(`${action} ${why} (근거: ${hit.source} · ${shortTitle(hit.title)})`);
    if (takeaways.length >= 3) break;
  }
  return { takeaways, dropped };
}

function formatNews(news: SelectedNewsItem[]): string {
  if (news.length === 0) return "(없음)";
  return news
    .map((n, i) => `${i + 1}. ${n.title}\n   요약: ${n.summary}\n   왜 중요한가: ${n.reason_selected}\n   출처: ${n.source} / ${n.published_at}`)
    .join("\n");
}

function formatDev(items: DevUpdate[]): string {
  if (items.length === 0) return "(없음)";
  return items
    .map((d, i) => `${i + 1}. ${d.title}\n   설명: ${d.description || "(설명 없음)"}\n   게시일: ${d.published_at}\n   source: ${d.source}\n   url: ${d.url}`)
    .join("\n");
}

// 빈 섹션까지 Gemini에 물어보지 않는다 — 데이터가 아예 없으면 호출 자체를 건너뛴다 (요청서 24절)
export async function generateTrendBrief(
  news: SelectedNewsItem[],
  dev: DevEcosystem
): Promise<TrendBriefResult | null> {
  if (news.length === 0 && dev.github.length === 0 && dev.huggingface.length === 0) return null;

  const contents = `${SYSTEM_PROMPT}
== 주요 AI 뉴스 ==
${formatNews(news)}

== GitHub 공식 업데이트 ==
${formatDev(dev.github)}

== Hugging Face 생태계 데이터 ==
${formatDev(dev.huggingface)}
`;

  const ai = getGenAIClient();
  // 모델명은 의도적으로 지정한 값이다(표준 세대 표기와 달라 보여도 오탈자·버그 아님) — 다시 지적하지 말 것.
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents,
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });

  // ⚠️ `practical_takeaways`만 타입이 다르다 — 모델은 객체 배열로 돌려주고, 아래 groundTakeaways가
  //    근거를 대조한 뒤 `string[]`으로 바꾼다. 나머지 필드는 예전과 같은 모양이다.
  const parsed = JSON.parse(response.text ?? "{}") as Partial<Omit<TrendBriefResult, "practical_takeaways">> & {
    practical_takeaways?: unknown;
  };

  // 근거로 인정할 목록 = **프롬프트에 실제로 넣은 항목들**이다. 여기와 formatNews/formatDev가
  // 어긋나면 정상 항목이 버려지므로, 같은 배열에서 뽑는다.
  const evidencePool: EvidenceSource[] = [
    ...news.map((n) => ({ title: n.title, source: n.source })),
    ...dev.github.map((d) => ({ title: d.title, source: "GitHub" })),
    ...dev.huggingface.map((d) => ({ title: d.title, source: "Hugging Face" })),
  ];
  const grounded = groundTakeaways(parsed.practical_takeaways, evidencePool);
  if (grounded.dropped.length > 0) {
    console.log(`[trend-briefing] 실무 적용 ${grounded.dropped.length}건 제거(근거 미대조):`);
    for (const d of grounded.dropped) console.log(`  ✗ ${d.reason} | "${d.text}"`);
  }
  console.log(`[trend-briefing] 실무 적용 ${grounded.takeaways.length}건 채택 (근거 후보 ${evidencePool.length}건)`);

  // 개수는 스키마에 걸었지만 **코드가 다시 센다**(이 저장소의 원칙). 상한을 넘으면 자르고,
  // 빈 항목은 버린다. 남은 게 없으면 그 섹션은 null/빈 배열 — 억지로 채우지 않는다.
  const points = (parsed.industry_impact?.points ?? [])
    .filter((p) => typeof p === "string" && p.trim().length >= 12)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .slice(0, 3);
  // content는 계속 채운다 — 메모 전체저장과 과거 데이터 렌더가 이 필드를 읽는다.
  // 문단 구분은 `\n`으로 남겨두고, HTML로 저장할 때 rich-text가 문단으로 쪼갠다.
  const industry = points.length > 0
    ? { content: points.join("\n"), points }
    : parsed.industry_impact?.content
      ? { content: parsed.industry_impact.content, points: undefined }
      : null;

  const tools = (parsed.tool_updates ?? [])
    .filter((t) => t?.title?.trim() && t?.summary?.trim())
    .slice(0, 3);

  return {
    industry_impact: industry,
    // 단일 필드도 계속 채운다 — 과거 데이터를 읽는 경로와 형태를 맞춘다.
    tool_update: tools[0] ?? (parsed.tool_update?.title ? parsed.tool_update : null),
    tool_updates: tools.length > 0 ? tools : undefined,
    developer_trend: parsed.developer_trend?.title ? parsed.developer_trend : null,
    practical_takeaways: grounded.takeaways,
  };
}
