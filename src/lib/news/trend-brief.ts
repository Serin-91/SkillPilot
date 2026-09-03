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
  practical_takeaways: string[];
};

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
    practical_takeaways: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: "3" },
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
위 내용을 종합해 AI 개발자가 프로젝트 설계·구현에서 참고할 실무 포인트를 **2~3개** 쓰세요.
각 항목에 ① 실제로 무엇을 시도해볼 수 있는지 ② 왜 유용한지를 **둘 다** 담으세요.
시스템 설계 관점을 우선하고 구체적으로 쓰세요. 예: "단순 분류·추출은 로컬 소형 모델로 내려보면
호출 비용과 지연을 줄일 수 있다"
"AI를 적극 활용하세요", "최신 기술을 공부하세요" 같은 일반론은 금지입니다.
🔴 위 입력 자료에서 근거를 찾을 수 없는 실무 팁은 만들지 마세요. 근거가 있는 것이 2개면 2개만,
   없으면 빈 배열을 반환하세요.

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

  const parsed = JSON.parse(response.text ?? "{}") as Partial<TrendBriefResult>;

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
    practical_takeaways: (parsed.practical_takeaways ?? []).filter((t) => t?.trim()).slice(0, 3),
  };
}
