// 2026-08-13 3소스 재구축 — 잡코리아를 추가했다(구조가 느슨해 Gemini가 필요하다고 봤던 예전 판단을
// 재검증: 실제로는 상세페이지 안에 __next_f RSC 스트림 + GI_Read_Comt_Ifrm iframe에 필요한 필드가
// 텍스트로 그대로 있어 Gemini 없이 직접 파싱 가능했다, jobkorea.ts). 사람인(본문이 로그인 후에만 채워짐)·
// 로켓펀치(크롤링 명시적 금지)는 여전히 뺀다.
// 원티드는 Tavily 검색으로 후보 URL을 찾고, 점핏/잡코리아는 자체 검색/목록 API로 직접 받는다(generate.ts에서 분기).
// 검색 query는 더 이상 고정 문자열이 아니라 관심 직무별로 roles.ts에서 온다.
export const JOB_SITES = [
  { name: "원티드", domain: "wanted.co.kr" },
  { name: "점핏", domain: "jumpit.saramin.co.kr" },
  { name: "잡코리아", domain: "jobkorea.co.kr" },
] as const;

// 점핏 jobCategory id — /api/common/code-initialize 실제 응답으로 확인함(2026-08-13, 28절 P0 — 추측 금지).
// 8(인공지능/머신러닝)만 core discovery, 나머지는 AI Service/Platform 후보가 숨어 있을 수 있는 expansion bucket(2-2/4-2절).
export const JUMPIT_CATEGORY = {
  AI_ML: 8,
  BACKEND: 1,
  DEVOPS_SYSTEM: 9,
  DATA_ENGINEER: 19,
} as const;

// 원티드: Tavily 검색 인덱스가 마감된 공고를 상위로 자주 올려서 후보를 넉넉히 봐야 유효한 공고가 나온다.
// 점핏: 자체 API가 이미 최신순 + 채용중만 주므로 그냥 한 페이지 분량 한도로 쓴다.
// 2026-08-10 — 뉴스 쪽처럼 "선정 로직이 소극적으로 덜 고르는" 문제는 아니지만, 하루 4건 목표를
// 못 채울 여지를 줄이는 안전장치로 후보 폭 자체를 넉넉히 늘렸다. 무료 API라 비용 부담이 없다.
export const MAX_SEARCH_RESULTS_PER_SITE = 15;
export const MAX_EXTRACT_ATTEMPTS_PER_SITE = 15;
// 하루 4건 quota를 못 채운 직무만 이 폭으로 한 번 더 수집한다(generate.ts) — 적합도 기준은 그대로 두고
// 탐색 범위만 넓힌다.
export const WIDE_SEARCH_RESULTS_PER_SITE = 30;

// 점핏 backend/devops/data-engineer expansion bucket — AI/ML(8)처럼 전량을 AI 공고로 인정하지 않고
// 최근 N건만 훑어 실제 AI 신호가 있는 것만 role scoring으로 건진다(4-2절, 무제한 pagination 금지).
export const JUMPIT_EXPANSION_RESULTS_PER_CATEGORY = 20;

// 잡코리아: role별 검색 discovery 결과 상한 — Wanted와 동일한 폭으로 시작한다(16절 "무한 검색 금지").
export const JOBKOREA_SEARCH_RESULTS_PER_ROLE = 15;

// 상세/목록 요청에 쓰는 User-Agent.
//
// 예전 값은 "Mozilla/5.0 (SkillPilot job collector)"였다. 세 사이트 모두 공식 API가 없어 공개
// 페이지를 직접 읽는데, UA에 "collector"를 박아두면 봇 판정 룰에 그대로 걸린다. 실제 브라우저가
// 보내는 값과 같은 형식으로 맞춘다.
//
// ⚠️ UA를 바꾼다고 요청량이 줄지는 않는다. 한 사이트를 동시에 때리는 개수(DETAIL_POOL)와
// 재시도 상한은 별도로 얌전하게 유지할 것 — 차단은 대개 UA가 아니라 속도 때문에 걸린다.
export const COLLECTOR_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
