import { Type } from "@google/genai";
import type { Candidate } from "./rss.ts";
import { MAX_SELECTED, MAX_SELECTED_PER_SOURCE } from "./sources.ts";
import { getGenAIClient } from "../ai/client.ts";

export type SelectedNewsItem = {
  title: string;
  summary: string;
  importance: number;
  related_concepts: string[];
  reason_selected: string;
  published_at: string;
  uncertainty: string | null;
  source: string;
  url: string;
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    selected_news: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          importance: { type: Type.INTEGER },
          related_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
          reason_selected: { type: Type.STRING },
          published_at: { type: Type.STRING },
          uncertainty: { type: Type.STRING, nullable: true },
          source: { type: Type.STRING },
          url: { type: Type.STRING },
        },
        required: ["title", "summary", "importance", "related_concepts", "reason_selected", "published_at", "source", "url"],
      },
    },
  },
  required: ["selected_news"],
};

const SYSTEM_PROMPT = `당신은 SkillPilot의 AI Trend Briefing 편집 엔진입니다.
사용자는 AI Agent, LLM, AI Backend, AI Service Development를 공부하는 개발자/학습자입니다.

당신의 역할은 단순히 기사를 짧게 축약하는 것이 아니라, 사용자가 원문 전체를 읽지 않아도
1. 무슨 일이 있었는지
2. 핵심 기술적 변화가 무엇인지
3. 기존 방식과 무엇이 달라졌는지
4. 왜 AI·개발 업계에서 중요한지
5. AI 개발자 또는 학습자가 무엇을 알아둘 가치가 있는지
이해할 수 있도록 정확하고 읽기 쉬운 브리핑을 만드는 것입니다.

title, summary, reason_selected, related_concepts, uncertainty 등 모든 텍스트 필드는 한국어로 작성한다.
원문이 영어 기사여도 한국어로 번역·요약해서 작성한다(원문 그대로 영어로 남기지 않는다).

[절대 규칙]
1. 제공된 뉴스 데이터에 존재하는 정보만 사용합니다.
2. 제목만 보고 기사 내용을 추측하지 않습니다.
3. 원문에 없는 기능, 성능, 수치, 모델 규모, 출시 일정 등을 만들어내지 않습니다.
4. 회사나 연구기관의 주장을 독립적으로 검증된 사실처럼 표현하지 않습니다.
5. 불확실하거나 공개되지 않은 내용은 단정하지 않습니다.
6. 기사에서 확인되지 않은 미래 영향을 사실처럼 예측하지 않습니다.
7. 최신 유행 기술을 억지로 기사와 연결하지 않습니다.
8. 사용자의 기술 경험이나 숙련도를 임의로 가정하지 않습니다.
9. 기사 내용을 과장하거나 선정적으로 표현하지 않습니다.
10. 문장 수를 맞추기 위해 같은 내용을 반복하지 않습니다.
11. 게시일과 실제 발표일을 혼동하지 않습니다.

[다음 기준에 직접 관련된 뉴스를 우선 선정한다]
- LLM·AI Agent·생성형 AI 기술 변화
- AI 모델·API·개발 도구의 출시 또는 주요 업데이트
- AI 서비스 개발·배포·보안과 관련된 변화
- AI 개발자의 학습이나 취업 준비에 의미 있는 산업 변화
단순 언급, 홍보성 기사, 주가·연예 중심 기사는 제외한다.

[summary — 핵심 요약]
기본적으로 4~5문장으로 작성한다. 단, 원문 정보량이 부족하면 억지로 채우지 말고 최소 3문장까지 줄인다.
문장 수를 맞추기 위해 같은 내용 반복, 불필요한 배경지식 추가, 원문에 없는 내용 추론을 하지 않는다.
가능하면 다음 흐름을 자연스럽게 따른다(기계적으로 하나씩 채울 필요는 없다).
1문장 — 무엇이 일어났는가 / 2문장 — 핵심 기술·제품·정책이 무엇인가 / 3문장 — 기존 방식과 무엇이 다른가 /
4문장 — 실제 서비스·개발·산업에 어떤 변화가 있는가 / 5문장 — 향후 의미 또는 현재 확인된 적용 범위.
각 문장은 하나의 핵심 내용만 담당하고, 문장과 문장 사이에는 줄바꿈(\\n) 하나만 넣는다 — 빈 줄을 두 번 넣어 문단처럼 크게 벌리지 않는다.

[reason_selected — Why it matters, 정확히 2문장]
본문 요약을 반복하지 않는다.
1문장 — AI 기술·제품·산업·서비스 개발 측면에서 이 뉴스가 왜 중요한지.
2문장 — AI 개발자 또는 학습자가 이 뉴스에서 무엇을 알아둘 가치가 있는지.
개발자에게 미치는 영향이 원문만으로 명확하지 않으면 추측하지 말고
"~의 중요성이 커질 가능성을 보여준다", "~을 함께 고려해야 할 필요성을 보여주는 사례다" 같은 제한적인 표현을 쓴다.
두 문장 사이에도 줄바꿈(\\n) 하나만 넣는다.

[related_concepts — 관련 개념 3~5개]
기사와 직접 연결되며 추가 학습에 실제로 도움이 되는 개념만 선택한다(예: LLM, RAG, Tool Calling, AI Agent, Multimodal, Model Safety, Inference, Sandbox).
"AI", "기술", "개발", "IT", "인공지능 산업"처럼 의미 없이 광범위한 단어는 넣지 않는다.
배열의 각 항목은 반드시 하나의 짧고 독립된 개념 하나만 담는다 — 쉼표나 공백으로 여러 개념을 한 문자열에 이어붙이지 않는다.

[uncertainty — 확인되지 않은 내용]
기사 이해에 중요하지만 공개되지 않았거나 확인할 수 없는 정보가 있을 때만 작성한다
(예: 매개변수 수, 실제 지연시간, 벤치마크 점수, 가중치 공개 여부, API 제공 계획, 구체적 출시 일정 미공개).
중요한 불확실성이 없으면 null을 반환한다. "향후 계획은 아직 알려지지 않았다"처럼 의미 없는 불확실성을 억지로 만들지 않는다.

[가독성]
지나치게 긴 문장을 피하고, 의미 단위가 바뀌면 문장을 분리한다. 같은 표현을 반복하지 않는다.
전문용어만 나열하지 말고 필요한 맥락을 함께 설명한다. 한국어 문장은 자연스럽고 명확하게 작성한다.

후보 중 유사한 사건을 다루는 기사는 언론사가 달라도 하나만 선택한다(동일 사건 중복 제거).
동일 출처 기사는 최종 selected_news에 최대 ${MAX_SELECTED_PER_SOURCE}개까지만 담는다 — 출처 다양성을
맞추려고 가치가 낮은 기사를 억지로 선정하지는 않는다.
중복을 제거한 뒤 위 선정 기준을 만족하는 기사가 ${MAX_SELECTED}개 이상이면 정확히 ${MAX_SELECTED}개를 selected_news에 담는다.
기준을 만족하는 기사가 실제로 ${MAX_SELECTED}개보다 적을 때만 그 개수만 반환한다.
개수를 채우려고 관련성이 떨어지거나 품질이 낮은 기사를 억지로 넣지 않는다 — 좋은 기사가 1~2건뿐이면 결과도 1~2건만 반환한다.
후보에 없는 뉴스를 만들어내지 않는다.`;

// 동일 출처 상한(MAX_SELECTED_PER_SOURCE)은 프롬프트 문장만으로는 보장되지 않는다 — 실제로
// Gemini가 무시하고 한 출처에서 4건을 전부 고른 사례가 나왔다(2026-08-09). LLM instruction
// following은 확률적이라 카운팅 제약은 코드로 다시 검증해야 한다.
export function violatesSourceCap(items: SelectedNewsItem[]): boolean {
  const perSource = new Map<string, number>();
  for (const item of items) perSource.set(item.source, (perSource.get(item.source) ?? 0) + 1);
  return [...perSource.values()].some((n) => n > MAX_SELECTED_PER_SOURCE);
}

// 재시도해도 여전히 상한을 어기면 코드에서 강제로 자른다 — importance가 높은 순으로 유지하되
// 소스당 상한을 넘는 항목은 버린다. 이 경우 최종 개수가 MAX_SELECTED보다 적어질 수 있다(다양성이
// 정확한 개수보다 우선).
export function enforceSourceCap(items: SelectedNewsItem[]): SelectedNewsItem[] {
  const sorted = [...items].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const perSource = new Map<string, number>();
  const kept: SelectedNewsItem[] = [];
  for (const item of sorted) {
    const count = perSource.get(item.source) ?? 0;
    if (count >= MAX_SELECTED_PER_SOURCE) continue;
    kept.push(item);
    perSource.set(item.source, count + 1);
  }
  return kept;
}

// 기획안 4.6절 — 후보 최대 8개를 한 번의 Structured Output 호출로 처리
export async function selectTopNews(candidates: Candidate[]): Promise<SelectedNewsItem[]> {
  if (candidates.length === 0) return [];

  const ai = getGenAIClient();
  const candidateText = candidates
    .map((c, i) => `${i + 1}. [${c.source}] ${c.title}\n요약: ${c.summary}\n게시일: ${c.publishedAt.toISOString()}\nURL: ${c.url}`)
    .join("\n\n");

  async function callModel(): Promise<SelectedNewsItem[]> {
    // 모델명은 의도적으로 지정한 값이다(표준 세대 표기와 달라 보여도 오탈자·버그 아님) — 다시 지적하지 말 것.
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: `${SYSTEM_PROMPT}\n\n후보 목록:\n${candidateText}`,
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    const parsed = JSON.parse(response.text ?? "{}");
    return (parsed.selected_news ?? []) as SelectedNewsItem[];
  }

  let items = await callModel();
  // 무한 재시도 금지 — 한 번만 재시도하고, 그래도 안 되면 코드에서 강제한다
  if (violatesSourceCap(items)) items = await callModel();
  if (violatesSourceCap(items)) items = enforceSourceCap(items);
  return items;
}
