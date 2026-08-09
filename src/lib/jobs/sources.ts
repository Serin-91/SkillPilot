// 수집 소스는 그대로 원티드 + 점핏. 둘 다 페이지 자체에 필드가 구조화돼 있어 Gemini 없이 직접
// 파싱한다(wanted.ts/jumpit.ts). 사람인(본문이 로그인 후에만 채워짐)·잡코리아(구조가 느슨해 Gemini 필요)·
// 로켓펀치(크롤링 명시적 금지)는 다 확인해보고 뺐다.
// 원티드는 Tavily 검색으로 후보 URL을 찾고, 점핏은 자체 목록 API(jumpit.ts)로 직접 받는다(generate.ts에서 분기).
// 검색 query는 더 이상 고정 문자열이 아니라 관심 직무별로 roles.ts에서 온다.
export const JOB_SITES = [
  { name: "원티드", domain: "wanted.co.kr" },
  { name: "점핏", domain: "jumpit.saramin.co.kr" },
] as const;

// 원티드: Tavily 검색 인덱스가 마감된 공고를 상위로 자주 올려서 후보를 넉넉히 봐야 유효한 공고가 나온다.
// 점핏: 자체 API가 이미 최신순 + 채용중만 주므로 그냥 한 페이지 분량 한도로 쓴다.
export const MAX_SEARCH_RESULTS_PER_SITE = 10;
export const MAX_EXTRACT_ATTEMPTS_PER_SITE = 10; // 둘 다 무료 할당량을 안 써서 부담 없음
