// 기획안 4.1절 — 공식 RSS 5개 (우선순위 순)
// ZDNet Korea만 IT 뉴스 전반이 섞이는 종합 소스라 넓은 AI 관련성 키워드 필터를 적용한다.
// 나머지는 이미 AI 전문/전용 피드라 키워드 필터를 걸지 않는다(뉴스 선정 로직 수정요청서 1절) —
// 화이트리스트에 없는 단어만 썼다는 이유로 명백히 AI 기사인데 탈락하는 문제를 막기 위함.
export const NEWS_SOURCES = [
  { name: "AI타임스", url: "https://www.aitimes.com/rss/allArticle.xml", keywordFilter: false },
  { name: "ZDNet Korea", url: "https://zdnet.co.kr/feed/", keywordFilter: true },
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/", keywordFilter: false },
  { name: "MIT News AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2", keywordFilter: false },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/", keywordFilter: false },
] as const;

// 2026-08-10 — 최종 선정(MAX_SELECTED=4)까지 못 가고 1~2건만 나오는 일이 잦아 후보 풀 자체를
// 넓혔다(품질 기준은 그대로 두고 Gemini가 고를 재료만 늘림) — RSS 소스는 실제로 하루 수십 건씩
// 올라오는데 예전 값(12/3/5)은 그중 일부만 후보로 넘겨서 좋은 기사가 있어도 탈락한 채였다.
export const MAX_CANDIDATES = 18;
export const MAX_LOOKBACK_DAYS = 3;
// 최근 3일 후보가 이 개수보다 적으면 5일까지 넓혀서 다시 모은다(요청서 8절) — 오래된 기사로
// 억지로 채우진 않고, 넓혀도 부족하면 부족한 채로 둔다.
export const FALLBACK_LOOKBACK_DAYS = 5;
export const MIN_CANDIDATES_BEFORE_FALLBACK = 6;
// 소스별 선점 개수(요청서 6절)와, 잔여 슬롯 백필 시 한 소스가 가질 수 있는 최종 상한(요청서 7절) —
// 이 둘이 있어야 활발한 소스 하나가 후보를 독점하지 않는다.
export const PER_SOURCE_INITIAL = 4;
export const PER_SOURCE_MAX = 6;
export const MAX_SELECTED = 4;
// 최종 선정 단계에서 동일 출처가 가질 수 있는 상한(요청서 9절)
export const MAX_SELECTED_PER_SOURCE = 2;

// AI Trend Briefing — 개발 생태계 데이터 소스. RSS/JSON을 일반 코드로만 파싱한다 (요청서 5·25절)
export const GITHUB_CHANGELOG_FEED = "https://github.blog/changelog/feed/";
export const HF_BLOG_FEED = "https://huggingface.co/blog/feed.xml";
export const HF_TRENDING_MODELS_API =
  "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=40";
// changelog·블로그는 매일 올라오지 않으므로 뉴스보다 조회 기간을 넉넉히 잡는다
export const DEV_LOOKBACK_DAYS = 7;
// Gemini에 넘기는 소스별 후보 상한 — 전체 목록을 보내지 않는다 (요청서 9·25절)
export const MAX_DEV_ITEMS_PER_SOURCE = 6;
