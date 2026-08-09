import { NEWS_SOURCES } from "./sources.ts";
import type { Candidate } from "./rss.ts";

// ZDNet Korea처럼 IT 뉴스 전반이 섞인 종합 소스에만 적용하는 넓은 AI 관련성 필터.
// AI타임스·TechCrunch·MIT News AI·Ars Technica AI는 이미 AI 전문 피드라 이 필터를 건너뛴다.
const KEYWORD_FILTER_SOURCES = new Set(NEWS_SOURCES.filter((s) => s.keywordFilter).map((s) => s.name as string));
export function needsKeywordFilter(source: string): boolean {
  return KEYWORD_FILTER_SOURCES.has(source);
}

// 기획안 4.5절 — 한글·영문 키워드 1차 필터
const NEWS_KEYWORDS_EN = [
  "AI", "LLM", "agent", "model", "API", "RAG", "embedding",
  "Copilot", "Gemini", "GPT", "Claude", "security", "inference", "deployment",
];

const NEWS_KEYWORDS_KO = [
  "AI", "인공지능", "생성형 AI", "LLM", "거대언어모델", "에이전트", "Agent",
  "RAG", "검색 증강 생성", "API", "모델", "추론", "배포", "보안",
  "GPT", "Gemini", "Claude", "Copilot",
];

const ALL_KEYWORDS = [...NEWS_KEYWORDS_EN, ...NEWS_KEYWORDS_KO].map((k) => k.toLowerCase());

export function matchesKeywords(title: string, summary: string): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  return ALL_KEYWORDS.some((k) => text.includes(k));
}

// 뉴스 선정 로직 수정요청서 3절 — 후보를 제거하지 않고 순위만 조정하는 Soft Ranking 가중치.
// 기업/모델명(OpenAI, Gemini 등)은 그 자체로는 점수를 주지 않는다 — 목록에 아예 넣지 않는 것으로
// "이름 언급만으로는 가점 없음" 규칙을 코드로 강제한다(사건과 결합됐는지는 키워드로 판별하기 어려워
// 여기서 정확히 흉내내지 않는다. ponytail: 이 구분은 결국 Gemini의 최종 판단에 맡긴다).
const HIGH_VALUE_TERMS = [
  "agent", "agentic", "에이전트",
  "mcp", "model context protocol",
  "tool calling", "tool use", "툴 콜링",
  "computer use",
  "coding agent", "ai ide",
  "rag", "검색 증강 생성",
  "embedding", "임베딩",
  "vector db", "벡터 db", "벡터db",
  "reasoning model", "추론 모델",
  "multimodal", "멀티모달", "vlm",
  "inference", "model serving", "모델 서빙",
  "fine-tuning", "파인튜닝",
  "distillation", "증류",
  "quantization", "양자화",
  "benchmark", "벤치마크", "eval", "evals",
  "guardrail", "가드레일",
  "ai security", "model safety", "모델 안전", "보안 취약",
  "prompt injection", "jailbreak", "탈옥",
  "ai infrastructure", "ai 인프라",
  "ai chip", "ai accelerator", "가속기",
  "on-device", "온디바이스",
  "open-weight", "오픈모델", "오픈소스 모델",
  "physical ai", "robotics", "로보틱스",
  "sdk", "개발 플랫폼",
  "api 변경", "api 업데이트",
  "저작권", "규제",
] as const;

// 강한 감점 — 투자/연예성 기사. M&A·전략적 투자는 예외로 둔다(요청서 5절 단서).
const STRONG_DEMOTE_TERMS = ["주가", "목표주가", "테마주", "투자의견", "열애", "결별", "이혼", "연예"] as const;
const MA_EXCEPTION_TERMS = ["인수합병", "인수", "m&a", "합병"] as const;
// 채용/행사/세미나/수상·인증 홍보 — 요청서 §2(Hard Filter 제거 대상)와 §5(Ranking 감점 대상)가
// 서로 다른 처리를 요구해 충돌했다. §10 "Hard Filter 최소화" 원칙을 우선해 감점으로 통일한다
// (2026-08-09 정책 확정). 애매한 홍보성 기사는 여기서 걸러지지 않고 점수만 낮아진 채 후보로 남는다.
// AI와 명백히 무관하거나 뉴스성이 거의 없는 순수 홍보 페이지를 걸러내는 별도 Hard Filter는 아직 없다 —
// 그런 사례가 실제로 통과되는 게 관찰되면 그때 추가한다(지금 감점만으로 충분히 밀려나고 있음).
const MILD_DEMOTE_TERMS = [
  "펀딩", "투자 유치", "시리즈 a", "시리즈 b", "시리즈 c",
  "도입했다", "도입한다", "협약", "mou",
  "행사", "세미나", "컨퍼런스", "수상", "인증", "채용",
] as const;

function countHits(text: string, terms: readonly string[]): number {
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
}

// 최신성은 보조 점수일 뿐이다 — 오늘 +3, 어제 +2, 2일 전 +1, 3일 이상 +0 (요청서 4절)
function recencyBonus(publishedAt: Date): number {
  const daysAgo = Math.floor((Date.now() - publishedAt.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, 3 - Math.min(daysAgo, 3));
}

// 점수는 순위 조정용일 뿐 — 이 값이 낮다고 후보에서 제거하지 않는다(요청서 3·10절)
export function scoreArticle(candidate: Candidate): number {
  const text = `${candidate.title} ${candidate.summary}`.toLowerCase();
  let score = countHits(text, HIGH_VALUE_TERMS) * 4;
  score -= countHits(text, STRONG_DEMOTE_TERMS) * 8;
  const isMA = MA_EXCEPTION_TERMS.some((t) => text.includes(t));
  if (!isMA) score -= countHits(text, MILD_DEMOTE_TERMS) * 3;
  score += recencyBonus(candidate.publishedAt);
  return score;
}

// 트래킹 파라미터 제거 후 동일 URL 판정 (4.4절)
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const dropPrefixes = ["utm_", "fbclid", "gclid", "ref", "ncid"];
    for (const key of [...url.searchParams.keys()]) {
      if (dropPrefixes.some((p) => key.toLowerCase().startsWith(p))) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}
