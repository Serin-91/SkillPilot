import { Type } from "@google/genai";
import type { Candidate } from "./rss.ts";
import { MAX_SELECTED, MAX_SELECTED_PER_SOURCE } from "./sources.ts";
import { getGenAIClient } from "../ai/client.ts";
import { normalizeUrl } from "./filter.ts";

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

[다음 기준에 관련된 뉴스를 선정한다 — 1~4는 직접 관련, 5는 슬롯이 남을 때만 채우는 보조 기준이다]
1. LLM·AI Agent·생성형 AI 기술 변화
2. AI 모델·API·개발 도구의 출시 또는 주요 업데이트
3. AI 서비스 개발·배포·보안과 관련된 변화
4. AI 개발자의 학습이나 취업 준비에 의미 있는 산업 변화
5. (보조) AI 관련 정책·규제·투자·채용 시장 동향, 빅테크의 AI 사업 방향 발표 — 1~4로 ${MAX_SELECTED}개를
   못 채울 때만 고려한다. 단순 언급, 홍보성 기사, 주가·연예 중심 기사는 5로도 인정하지 않는다.

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
중복을 제거한 뒤 1~4 기준을 만족하는 기사가 ${MAX_SELECTED}개 이상이면 정확히 ${MAX_SELECTED}개를 selected_news에 담는다.
1~4만으로 ${MAX_SELECTED}개가 안 되면, 5(보조 기준)를 만족하는 후보로 남은 슬롯을 채운다.
1~5 기준을 만족하는 후보가 그래도 ${MAX_SELECTED}개에 못 미치면 억지로 채우지 않고 그 수만큼만 반환한다 —
기준에 못 미치는 기사를 추가하지 않는다.
후보에 없는 뉴스를 만들어내지 않는다.`;

// Gemini가 돌려준 url/source/published_at은 그대로 DB에 저장돼 뉴스 카드의 링크가 된다. 프롬프트에
// "입력값을 그대로 복사하라"고 적어둬도 LLM은 확률적이라 URL을 잘라먹거나 지어낼 수 있고, 그러면
// 사용자는 죽은 링크를 받는다 — 화면에서 티가 안 나서 알아채기도 어렵다. 아래 violatesSourceCap이
// 세운 원칙("카운팅 제약은 코드로 다시 검증한다")을 URL에도 똑같이 적용한다.
// 후보 목록에 없는 항목은 버리고, 남은 항목의 url/source/published_at은 후보 쪽 값으로 덮어쓴다.
// 제목을 비교용 키로 정규화한다 — 대소문자·문장부호·공백 차이를 지우고 글자/숫자만 남긴다.
export function storyKey(title: string): string {
  return (title ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// 두 제목이 공유하는 낱말 수. 같은 이야기를 가리키는지 가늠하는 데만 쓴다(절대 기준이 아니라
// "후보 A와 B 중 어느 쪽이 이 본문의 주인인가"를 고르는 상대 비교용이다).
function titleOverlap(a: string, b: string): number {
  const toWords = (s: string) =>
    new Set((s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length >= 2));
  const wa = toWords(a);
  const wb = toWords(b);
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  return hit;
}

export function reconcileWithCandidates(items: SelectedNewsItem[], candidates: Candidate[]): SelectedNewsItem[] {
  const byUrl = new Map(candidates.map((c) => [normalizeUrl(c.url), c]));
  const seen = new Set<string>();
  // 같은 이야기를 두 번 담지 않기 위한 제목 색인 — out 배열에서의 위치를 들고 있다가, 더 나은
  // 짝이 나오면 그 자리를 교체한다.
  const byStory = new Map<string, number>();
  const out: SelectedNewsItem[] = [];
  for (const item of items) {
    const key = normalizeUrl(item.url ?? "");
    const candidate = byUrl.get(key);
    if (!candidate) {
      console.error("[news-select] 후보에 없는 기사를 반환해 제외한다 —", item.url);
      continue;
    }
    if (seen.has(key)) continue; // 같은 기사를 두 번 돌려준 경우
    seen.add(key);
    // 본문(title/summary/reason_selected 등)은 Gemini가 쓴 그대로 두고, 출처를 특정하는 필드만
    // 후보 원본으로 되돌린다.
    const merged: SelectedNewsItem = {
      ...item,
      url: candidate.url,
      source: candidate.source,
      published_at: candidate.publishedAt.toISOString(),
    };

    // URL이 다르면 다른 기사라고 믿었는데, 실제로는 그렇지 않았다(2026-08-22).
    // Gemini가 딥시크 기사 본문을 쓰면서 URL만 다른 기사(포티투마루) 것을 붙여 돌려줬고, 위에서
    // url/source를 "후보 값으로 되돌리는" 동작이 그 잘못된 짝을 오히려 확정해버렸다 — 화면에는
    // 똑같아 보이는 카드가 두 장 떴고, 그중 하나는 본문과 전혀 상관없는 기사로 링크가 걸렸다.
    //
    // 그래서 URL뿐 아니라 "이야기"로도 한 번 더 본다. 같은 제목이 두 번 나오면 둘 중 본문과 후보
    // 제목이 실제로 겹치는 쪽을 남긴다 — 위 예에서는 딥시크 본문 ↔ 딥시크 후보가 남고, 딥시크 본문에
    // 엉뚱하게 붙은 포티투마루 후보가 떨어진다. 겹침 수는 중복 그룹 안에서만 상대 비교에 쓰므로,
    // 영어 기사를 한국어로 번역하면서 겹치는 낱말이 없어지는 경우에도 멀쩡한 기사를 잃지 않는다.
    const story = storyKey(merged.title);
    const existingAt = story ? byStory.get(story) : undefined;
    if (existingAt === undefined) {
      if (story) byStory.set(story, out.length);
      out.push(merged);
      continue;
    }
    const incumbent = out[existingAt];
    const incumbentCandidate = byUrl.get(normalizeUrl(incumbent.url));
    const better =
      titleOverlap(merged.title, candidate.title) >
      titleOverlap(incumbent.title, incumbentCandidate?.title ?? "");
    console.error(
      `[news-select] 같은 내용이 두 URL로 왔다 — ${better ? incumbent.url : merged.url} 를 버린다 (남길 것: ${better ? merged.url : incumbent.url})`
    );
    if (better) out[existingAt] = merged;
  }
  return out;
}

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

// 🔴🔴 "한국어로 써라"도 프롬프트만으로는 보장되지 않는다 — 바로 위 violatesSourceCap 주석이
// 말하는 것과 **정확히 같은 종류의 실패**다. 2026-08-27: 테크크런치 기사 제목이 영어 원문 그대로
// 화면에 떴다. 프롬프트에는 "원문이 영어 기사여도 한국어로 번역·요약해서 작성한다(원문 그대로
// 영어로 남기지 않는다)"가 분명히 있는데, LLM instruction following은 확률적이라 그냥 통과했다.
// 출처 상한에는 코드 검증이 있었고 언어에는 없었다 — 그 차이가 그대로 사용자 화면에 나왔다.
//
// 판정은 **한글이 한 글자도 없으면 번역 안 된 것**으로 아주 보수적으로 잡는다. 정상적인 한국어
// 제목은 고유명사가 아무리 많아도 조사·서술어에서 한글이 반드시 나온다
// (예: "엔비디아, '그로크 3 LPX' 본격 양산…초고속 추론 에이전트 시장 타깃").
// 비율로 재면 "MLOps / AI 에이전트 개발자"처럼 고유명사가 대부분인 멀쩡한 제목을 잘못 잡는다.
export function looksUntranslated(text: string): boolean {
  return text.trim().length > 0 && !/[가-힣]/.test(text);
}

export function hasUntranslatedTitle(items: SelectedNewsItem[]): boolean {
  return items.some((i) => looksUntranslated(i.title));
}
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

// 부족분 채우기를 최대 몇 라운드까지 돌릴지. Gemini 호출 비용이 붙으므로 상한을 둔다.
const TOP_UP_ROUNDS = 2;

// 기획안 4.6절 — 후보 최대 8개를 한 번의 Structured Output 호출로 처리
export async function selectTopNews(candidates: Candidate[]): Promise<SelectedNewsItem[]> {
  if (candidates.length === 0) return [];

  const ai = getGenAIClient();
  const toCandidateText = (list: Candidate[]) =>
    list.map((c, i) => `${i + 1}. [${c.source}] ${c.title}\n요약: ${c.summary}\n게시일: ${c.publishedAt.toISOString()}\nURL: ${c.url}`).join("\n\n");

  async function callModel(prompt: string, tag: string): Promise<SelectedNewsItem[]> {
    // 모델명은 의도적으로 지정한 값이다(표준 세대 표기와 달라 보여도 오탈자·버그 아님) — 다시 지적하지 말 것.
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    const parsed = JSON.parse(response.text ?? "{}");
    const raw = (parsed.selected_news ?? []) as SelectedNewsItem[];
    // 모든 호출 경로(1차·재시도·부족분 채우기)가 이 한 곳을 지나므로 여기서 한 번만 검증하면 된다.
    const out = reconcileWithCandidates(raw, candidates);
    // 🔴 이 한 줄이 "모델이 적게 줬다"와 "코드가 깎았다"를 가른다. 예전엔 둘을 구분할 방법이
    // 아예 없어서 "뉴스가 3건뿐"이라는 신고를 코드만 읽고는 절대 진단할 수 없었다
    // (깎는 지점 13개 중 로그가 있던 것은 3개뿐이었다). 지우지 마라.
    console.log(`[news-select] ${tag}: 모델 ${raw.length}건 → 검증 후 ${out.length}건 (목표 ${MAX_SELECTED})`);
    return out;
  }

  const initialPrompt = `${SYSTEM_PROMPT}\n\n후보 목록:\n${toCandidateText(candidates)}`;
  let items = await callModel(initialPrompt, "1차");
  // 무한 재시도 금지 — 한 번만 재시도하고, 그래도 안 되면 코드에서 강제한다.
  // 🔴 언어 위반도 같은 재시도에 태운다(2026-08-27 테크크런치 제목이 영어로 나온 건). 상한 위반과
  // 달리 코드로 "강제 번역"할 방법은 없으므로, 재시도까지 실패하면 기사를 버리지 않고 그대로 두되
  // **조용히 넘기지 않고 로그를 남긴다** — 뉴스가 아예 안 뜨는 것보다는 영어 제목이 낫다.
  if (violatesSourceCap(items) || hasUntranslatedTitle(items)) {
    // ⚠️ 이 재시도는 items를 **통째로 교체**한다 — 1차가 4건이어도 2차가 3건이면 3건이 된다.
    //    예전엔 재시도가 일어났다는 사실조차 로그에 안 남아서 그 경로를 의심할 수조차 없었다.
    console.log(`[news-select] 재시도: 상한위반=${violatesSourceCap(items)} 미번역=${hasUntranslatedTitle(items)} (현재 ${items.length}건)`);
    items = await callModel(initialPrompt, "재시도");
  }
  if (violatesSourceCap(items)) {
    const before = items.length;
    items = enforceSourceCap(items);
    console.log(`[news-select] 소스상한 강제: ${before}건 → ${items.length}건`);
  }
  for (const i of items) {
    if (looksUntranslated(i.title)) console.error("[news-select] 제목이 번역되지 않았다(재시도 후에도) —", i.source, i.title);
  }

  // 1차 선정이 목표 개수에 못 미치면, 아직 안 보여준 후보만 다시 넘겨 부족분을 채운다.
  // 한 번만 시도하던 것을 두 라운드까지 늘렸다 — 후보 풀은 넉넉한데(하루 50건 이상) 하루 3건에서
  // 멈추는 일이 반복됐고, 실제로 1차에서 빠진 자리를 채울 만한 기사가 남아 있었다(2026-08-22).
  // 부족할 때만 도는 경로라 정상적인 날에는 추가 호출이 0회다.
  for (let round = 0; round < TOP_UP_ROUNDS && items.length < MAX_SELECTED; round++) {
    const chosenUrls = new Set(items.map((i) => i.url));
    // reconcileWithCandidates의 중복 제거(URL·이야기 둘 다)는 호출 1회 안에서만 동작한다.
    // 호출 사이의 중복은 여기서 막는다 — 안 막으면 같은 기사가 카드 두 장으로 뜬다.
    const chosenStories = new Set(items.map((i) => storyKey(i.title)).filter(Boolean));
    // 🔴 **이미 소스 상한(2건)을 채운 출처는 후보에서 뺀다.** 안 빼면 이런 일이 벌어진다:
    //    모델에게 그 출처 기사를 보여준다 → 모델이 그걸 4번째로 고른다 → 아래 enforceSourceCap이
    //    그 자리에서 삭제한다 → items.length는 3 그대로 → 다음 라운드도 같은 걸 고른다.
    //    **두 라운드가 통째로 헛돌고 결과는 3건**이고, 그 사이 아무 로그도 안 남았다.
    //    (2026-08-30 "뉴스 3건(목표 4건)" 신고의 유력 원인. 후보는 18건이나 남아 있었다.)
    const perSource = new Map<string, number>();
    for (const i of items) perSource.set(i.source, (perSource.get(i.source) ?? 0) + 1);
    const remaining = candidates.filter(
      (c) => !chosenUrls.has(c.url) && (perSource.get(c.source) ?? 0) < MAX_SELECTED_PER_SOURCE
    );
    const need = MAX_SELECTED - items.length;
    if (remaining.length === 0) {
      console.log(`[news-select] 부족분 채우기 중단: 상한 안 찬 출처에 남은 후보가 없다 (${items.length}건에서 종료)`);
      break;
    }

    // 문구가 1차 프롬프트와 다르다. SYSTEM_PROMPT는 "억지로 채우지 않는다"를 세 번 반복하는데,
    // 그 톤을 그대로 물려주면 모델이 남은 후보를 훑고도 빈손으로 돌아온다. 여기서는 이미 한 번
    // 걸러진 후보만 남았다는 사실을 알려주고 "관련성이 높은 순서대로 고르라"로 방향을 바꾼다.
    // 그래도 마지막 문장으로 명백히 무관한 기사는 계속 거부할 수 있게 남겨둔다.
    const topUpPrompt = `${SYSTEM_PROMPT}\n\n지금까지 ${items.length}건을 선정했다. 목표는 ${MAX_SELECTED}건인데 ${need}건이 모자란다.
아래는 아직 고르지 않은 나머지 후보이며, 이미 AI 관련성 필터를 통과한 것들이다.
이 중에서 기준 1~5에 가장 잘 맞는 순서로 ${need}건을 고른다.
이미 선정한 기사와 같은 사건을 다루는 후보는 고르지 않는다.
🔴 다만 **개수를 맞추려고 기준을 낮추지는 않는다.** 아래는 ${need}건이 모자라도 고르지 않는다:
- 대학·연구소·기관·기업의 **보도자료성 발표**(센터 설립, 실증랩 개소, 협약·MOU, 공모전, 수상, 행사 안내)
- 특정 조직의 홍보에 가까운 기사, 개발자·실무자가 얻어갈 기술적 내용이 없는 기사
이 조건을 걸러내고 남은 것이 ${need}건에 못 미치면 있는 만큼만 반환한다.
정말로 AI·개발과 무관한 기사밖에 없다면 그때만 빈 배열을 반환한다.

나머지 후보 목록:\n${toCandidateText(remaining)}`;
    try {
      const topUp = (await callModel(topUpPrompt, `채우기${round + 1}`))
        .filter((i) => !chosenUrls.has(i.url) && !chosenStories.has(storyKey(i.title)))
        .slice(0, need);
      if (topUp.length === 0) {
        console.log(`[news-select] 부족분 채우기 ${round + 1}라운드: 모델이 빈손 — 중단 (${items.length}건)`);
        break; // 더 줄 게 없다는 뜻 — 같은 요청을 한 번 더 하지 않는다
      }
      const before = items.length;
      items = enforceSourceCap([...items, ...topUp]);
      // 위에서 상한 찬 출처를 걸렀으므로 여기서 깎이면 안 된다. 깎였다면 거르는 쪽이 새는 것이다.
      if (items.length < before + topUp.length) {
        console.log(`[news-select] ⚠️ 채우기 ${round + 1}라운드에서 상한에 깎였다: ${before}+${topUp.length} → ${items.length}`);
      }
    } catch (e) {
      console.error("[news-select] 부족분 채우기 실패 — 지금까지 결과만 사용", e);
      break;
    }
  }

  // 여기서 items가 MAX_SELECTED에 못 미쳐도 코드가 강제로 채우지 않는다.
  // 예전엔 scoreArticle 순으로 남은 후보를 골라 "적합성 판단 없이 작성만 하라"고 Gemini에 넘겼는데,
  // ZDNet Korea 피드가 IT 전용이 아니라 PRNewswire 보도자료·생활/건강 기사까지 섞인 종합 와이어라
  // (본문 어딘가에 "AI"·"모델"이 한 번만 나와도 matchesKeywords를 통과한다 — 실측 18/30 통과)
  // Gemini가 기준 1~5로 이미 탈락시킨 기사가 그 단계에서 되살아났다. 전자담배·건강 기사가 AI
  // 브리핑에 실린 원인이 이것이다(2026-08-21). 4건을 억지로 채우는 것보다 2~3건이라도 관련 기사만
  // 내보내는 쪽이 맞다 — 프롬프트가 세 번 반복해 명시한 "억지로 채우지 않는다"와도 이제 일치한다.
  return items;
}
