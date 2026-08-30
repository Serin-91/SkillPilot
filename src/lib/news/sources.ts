// 기획안 4.1절 — 공식 RSS 5개 (우선순위 순)
// 키워드 필터(filter.ts의 matchesKeywords)는 이제 다섯 소스 전부에 걸린다. 예전엔 ZDNet만 걸렀는데,
// "AI 전문지"로 분류해 둔 AI타임스가 실제로는 지역 소식까지 그대로 내보내는 매체였다 — 그 무필터
// 통과분이 후보 슬롯을 차지해 정작 고를 AI 기사가 남지 않았다(2026-08-22). 대신 명백한 AI 기사가
// 화이트리스트에 없는 단어를 썼다는 이유로 탈락하지 않도록 키워드 목록을 회사·모델·인프라 어휘까지
// 넓혔다(filter.ts 주석 참고).
export const NEWS_SOURCES = [
  { name: "AI타임스", url: "https://www.aitimes.com/rss/allArticle.xml" },
  { name: "ZDNet Korea", url: "https://zdnet.co.kr/feed/" },
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "MIT News AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2" },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/" },
] as const;

// 2026-08-10 — 최종 선정(MAX_SELECTED=4)까지 못 가고 1~2건만 나오는 일이 잦아 후보 풀 자체를
// 넓혔다(품질 기준은 그대로 두고 Gemini가 고를 재료만 늘림) — RSS 소스는 실제로 하루 수십 건씩
// 올라오는데 예전 값(12/3/5)은 그중 일부만 후보로 넘겨서 좋은 기사가 있어도 탈락한 채였다.
// 🔴 2026-08-30: 18 → 30. 실기기 판독이 병목을 그대로 보여줬다 —
//   `수집 169건 → 필터 통과 62건 → 후보 18건 → AI 선별 3건`
//   즉 **통과한 62건 중 44건이 AI에게 도달조차 못 했다.** "기사가 그렇게 많은데 4건을 못
//   가져온다"의 직접적인 원인이다. 정원이 18이면 그중 10이 소스별 선점(5×2)이라 점수가
//   실제로 고르는 자리는 8뿐이고, 그 8로는 62건 중 좋은 것이 들어올 확률이 낮다.
//   30으로 올리면 선점 10 + 점수 백필 20이 되어 점수가 정원의 2/3을 결정한다.
//   ⚠️ 품질 기준(SYSTEM_PROMPT의 1~5)은 **하나도 안 건드렸다.** 재료만 늘린 것이고,
//      2026-08-10에 12→18로 올렸던 것과 같은 성격의 변경이다.
export const MAX_CANDIDATES = 30;
export const MAX_LOOKBACK_DAYS = 3;
// 최근 3일 후보가 이 개수보다 적으면 5일까지 넓혀서 다시 모은다(요청서 8절) — 오래된 기사로
// 억지로 채우진 않고, 넓혀도 부족하면 부족한 채로 둔다.
export const FALLBACK_LOOKBACK_DAYS = 5;
export const MIN_CANDIDATES_BEFORE_FALLBACK = 6;
// 소스별 선점 개수(요청서 6절)와, 잔여 슬롯 백필 시 한 소스가 가질 수 있는 최종 상한(요청서 7절) —
// 이 둘이 있어야 활발한 소스 하나가 후보를 독점하지 않는다.
//
// 불변식: NEWS_SOURCES.length * PER_SOURCE_INITIAL < MAX_CANDIDATES 여야 한다.
// 예전 값(4)은 소스 5개 × 4 = 20 ≥ 18이라 선점만으로 정원이 꽉 찼고, distributeByScore의 점수
// 백필 루프가 단 한 건도 실행되지 못했다(라이브 피드 실측: 선점 18 + 백필 0). 그 결과 hardFilter를
// 94건이 통과해도 각 소스의 상위 4건만 후보가 됐다 — AI타임스 50건 중 46건(GLM-5.3 API 공개,
// 세레브라스 CS-4, 구글-마벨 TPU 등)이 점수와 무관하게 탈락하고, 대신 1~3점짜리가 18건 중 8건을
// 차지했다. Gemini가 기준 1~4로 고를 게 없어 4건을 못 채우던 진짜 원인이다(2026-08-21).
// 2로 낮추면 선점 10 + 점수 백필 8이 되어, 다양성 최소 보장(소스당 2건)은 그대로 두고 나머지
// 슬롯은 점수가 실제로 결정한다 — 같은 피드에서 3점 이하가 8건 → 4건으로 줄었다.
// 소스를 추가하면 이 불변식을 다시 확인할 것. sources.check.ts가 자동으로 검증한다.
export const PER_SOURCE_INITIAL = 2;
// 🔴🔴 6 → 14. **여기가 진짜 병목이었다.** MAX_CANDIDATES를 18→30으로 올렸는데도 실측 후보가
//   18 그대로였다(2026-08-30 라이브 재실행). 이유: 이 상한은 "한 소스가 후보 풀에 넣을 수 있는
//   최대"인데, 이 피드 구성에서는 **한국 소스 둘(AI타임스·ZDNet)이 통과분의 대부분**을 갖고
//   영문 셋(TechCrunch·MIT·Ars)은 주제/기간 필터에서 거의 다 떨어진다.
//   그래서 상한 8이면 8 + 8 + α ≈ 18에서 천장을 친다 — 정원을 30으로 올려도 채울 재료가
//   상한에 막혀 안 올라온다. 실측: 수집 169 → 통과 62 → **후보 18**(= 8+8+2).
//   14로 올리면 14 + 10 + α ≈ 26으로, 통과 62건 중 AI가 보는 양이 18 → 26으로 늘어난다.
//   ⚠️ 출력 다양성은 여기가 아니라 **MAX_SELECTED_PER_SOURCE(2)** 가 지킨다 — 후보 풀이
//      한쪽으로 기울어도 최종 4건에는 한 소스가 2건까지만 들어간다. 둘을 헷갈리지 마라.
//   불변식(sources.check): 14 × 2 = 28 ≤ 30 이라 한 소스가 정원의 절반을 넘지 못한다.
export const PER_SOURCE_MAX = 14;
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
