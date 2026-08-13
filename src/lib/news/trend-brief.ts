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
  industry_impact: { content: string } | null;
  tool_update: TrendToolUpdate | null;
  developer_trend: TrendDeveloperTrend | null;
  practical_takeaways: string[];
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    industry_impact: {
      type: Type.OBJECT,
      nullable: true,
      properties: { content: { type: Type.STRING } },
      required: ["content"],
    },
    tool_update: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        source: { type: Type.STRING },
        published_at: { type: Type.STRING, nullable: true },
        url: { type: Type.STRING, nullable: true },
      },
      required: ["title", "summary", "source"],
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
    practical_takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["industry_impact", "tool_update", "developer_trend", "practical_takeaways"],
};

const SYSTEM_PROMPT = `당신은 AI 개발자를 위한 기술 동향 분석기입니다.
아래 제공된 데이터만 사용해 "AI Trend Briefing"을 한국어로 생성하세요.

[industry_impact — 업계 영향]
"주요 AI 뉴스" 전체를 종합해 AI 산업·기업·개발 환경에서 나타나는 변화를 분석하세요.
개별 뉴스를 다시 요약하지 마세요. 여러 뉴스에서 공통으로 확인되는 흐름을 우선하세요.
서로 관련 없는 뉴스를 억지로 하나의 흐름으로 연결하지 마세요.
의미 있는 흐름이 여러 개면 가장 중요한 1~2개만 고르세요.
미래 영향은 확정 사실처럼 쓰지 말고 "~할 가능성이 있습니다", "~의 중요성이 커질 수 있습니다"처럼
분석임이 드러나는 표현을 쓰세요. 2~4문장.
뉴스가 없으면 null.

[tool_update — 도구·서비스]
"GitHub 공식 업데이트" 목록에서 AI 개발자가 실무적으로 알아둘 가치가 가장 높은 항목 하나를 고르세요.
title은 그 항목의 기능·서비스명을 명확히 담고, summary는 무엇이 바뀌었는지 설명하세요.
개발자에게 어떤 점이 유용한지 한 문장 이내로 덧붙일 수 있습니다.
title과 summary는 반드시 자연스러운 한국어 문장으로 쓰세요. 입력(GitHub Changelog 등)이 영어 원문이어도
그 문장을 그대로 옮기지 말고 한국어로 번역·설명하세요. 단 GitHub Copilot, Codespaces처럼 제품·기능·서비스
고유명사는 번역하지 않고 원문 그대로 둡니다. source/url/published_at은 고른 항목의 입력값을 그대로 복사하세요
(이 세 필드만 원문 값을 유지하고, title·summary처럼 새로 쓰는 문장에는 적용하지 않습니다).
시장 전망은 쓰지 마세요.
목록이 비었거나 알아둘 가치가 있는 항목이 없으면 null.

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
위 내용을 종합해 AI 개발자가 프로젝트 설계·구현에서 참고할 실무 의사결정 포인트를 2~4개 쓰세요.
짧고 구체적으로, 시스템 설계 관점을 우선하세요. 예: "단순 분류·추출 → 로컬 소형 모델 고려"
"AI를 적극 활용하세요", "최신 기술을 공부하세요" 같은 일반론은 금지입니다.
앞 내용과 무관한 조언, 새로 만들어낸 사실은 쓰지 마세요.
근거가 없으면 빈 배열.

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
  return {
    industry_impact: parsed.industry_impact?.content ? parsed.industry_impact : null,
    tool_update: parsed.tool_update?.title ? parsed.tool_update : null,
    developer_trend: parsed.developer_trend?.title ? parsed.developer_trend : null,
    practical_takeaways: (parsed.practical_takeaways ?? []).filter((t) => t?.trim()),
  };
}
