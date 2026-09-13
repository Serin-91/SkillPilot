import type { Candidate } from "./rss.ts";

// 한글·영문 키워드 1차 필터
//
// 2026-08-22에 목록을 크게 넓혔다. 이 필터를 전 소스에 걸기로 하면서(아래 matchesKeywords 주석),
// 좁은 목록 그대로 두면 진짜 AI 기사까지 떨어져 나갔기 때문이다 — 실측으로 확인한 탈락 예:
// "Anthropic's Opus 4.6 is a smut-machine", "Grok keeps sending gibberish responses",
// "익명 'Ox 알파' 등장…코딩 성능·100조 토큰", "엔비디아, NPU 스타트업 리벨리온 인수 협상 중".
// 전부 이 서비스가 정확히 다뤄야 할 기사다.
//
// 회사·모델 이름을 넣은 이유: 아래 HIGH_VALUE_TERMS(점수 가중치)는 "이름 언급만으로 가점 없음"이
// 원칙이지만, 그건 순위 얘기고 여기는 "이 기사가 AI 분야인가"를 가르는 관문이다. 헤드라인에
// 앤트로픽·엔비디아·그록이 있으면 AI 기사가 맞다.
const NEWS_KEYWORDS_EN = [
  "AI", "LLM", "agent", "agentic", "model", "API", "RAG", "embedding",
  "Copilot", "Gemini", "GPT", "Claude", "security", "inference", "deployment",
  // 회사·제품·모델
  "anthropic", "openai", "nvidia", "deepseek", "grok", "opus", "codex", "chatgpt",
  "openrouter", "hugging face", "mistral", "llama", "gemma",
  // 개발·인프라 어휘
  "coding", "code", "token", "chatbot", "prompt", "dataset", "benchmark",
  "neural", "machine learning", "npu", "gpu", "data center", "datacenter", "chip",
];

const NEWS_KEYWORDS_KO = [
  "AI", "인공지능", "생성형 AI", "LLM", "거대언어모델", "에이전트", "Agent", "에이전틱",
  "RAG", "검색 증강 생성", "API", "모델", "추론", "배포", "보안",
  "GPT", "Gemini", "Claude", "Copilot",
  // 회사·제품·모델
  "앤트로픽", "오픈AI", "엔비디아", "딥시크", "그록", "챗GPT", "코덱스",
  // 🔴 2026-08-31 전수조사 — **한글 음차 표기가 통째로 빠져 있었다.** 위 줄은 영문 목록의
  // 일부만 옮겨온 상태였고, 정작 국내 매체가 제일 자주 쓰는 표기가 없었다. 라이브 피드 실측
  // (169건 수집 / 3일 이내 93건) 결과 **주제 키워드에서 탈락한 42건 중 5건이 정확히 이 서비스가
  // 다뤄야 할 기사**였고, 전부 제목이 한글 음차였다:
  //   · "허깅페이스, 55만원짜리 오픈소스 로봇 '마이크로덕' 공개"        (점수 10 — 그날 후보 1위였을 기사)
  //   · "클로드 테스트 중 700GB 홈 디렉터리 삭제..."                    (6)
  //   · "'클로드 코드' 주간 한도 25% 인상…실제 17% 감소에 개발자 발끈"  (3)
  //   · "구글, 구매한 전자책과 '제미나이 노트북' 연결"                  (2)
  //   · "구글, '제미나이 3.8 플래시' 내부 테스트 포착"                  (1)
  // 영문 목록에는 "hugging face"·"claude"·"gemini"가 다 있는데 제목이 한글이라 못 걸렸다.
  // ⚠️ 같은 실측에서 **오탈락 구제분에 잡음이 0건**이었다(살아난 5건 전부 AI 기사).
  // ⚠️ "라마"는 일부러 뺐다 — 드라마·파노라마가 부분일치로 같이 걸린다("센터"를 뺀 것과 같은 이유).
  "클로드", "제미나이", "제미니", "허깅페이스", "허깅 페이스", "코파일럿", "미스트랄",
  "앤스로픽", "퍼플렉시티",
  // 개발·인프라 어휘
  "코딩", "토큰", "챗봇", "프롬프트", "데이터셋", "벤치마크",
  "신경망", "머신러닝", "딥러닝", "데이터센터", "반도체", "칩", "NPU", "GPU", "젬마", "생성",
];

const ALL_KEYWORDS = [...NEWS_KEYWORDS_EN, ...NEWS_KEYWORDS_KO].map((k) => k.toLowerCase());

// 제목만 본다. 예전엔 본문(summary) 전체를 같이 검사했는데, ZDNet Korea는 IT 전용이 아니라
// PRNewswire 보도자료·유통·헬스케어까지 섞인 종합 와이어라 1000자 본문 어딘가에 "AI"가 한 번만
// 나와도 통과했다 — 배터리 ESS 기사의 "AI 산업 등 새로운 전력 수요", 영어 문장의 "cl(ai)m" 같은
// 부분일치까지 전부 통과했다(실측 30건 중 23건 통과). 종합 와이어에서 그 기사가 AI 기사인지는
// 헤드라인이 결정한다. 같은 피드로 재실측하니 23 → 10건이 됐고, 걸러진 13건은 무신사 베트남 진출,
// 바디프랜드 헬스케어로봇 체험, 자율주행 광산트럭, 세금 환급 같은 것들이었다(2026-08-21).
// 이제 이 필터는 다섯 소스 전부에 적용된다. 예전엔 ZDNet 한 곳만 걸렀는데, "AI 전문지"로 분류해 둔
// AI타임스가 실제로는 지역 소식까지 그대로 내보내는 통신사형 매체였다 — 최근 3일 후보 50건 중
// "여수 보건사업 추경 36억", "목포어울림도서관 독서의 달", "순천 외식업소 위생 컨설팅",
// "삼성전자 주주환원 110조", "[내면 지도 그리기]"가 전부 무필터로 통과해 Gemini에게 넘길 후보
// 18칸을 차지했다. 그래서 정작 고를 만한 AI 기사가 몇 건 안 남았고 하루 4건을 못 채웠다(2026-08-22).
export function matchesKeywords(title: string): boolean {
  const text = title.toLowerCase();
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
  // 🔴 2026-08-31 — "콘퍼런스"가 빠져 있었다. 목록에는 "컨퍼런스"만 있는데 실제 기사 표기는
  // **국립국어원 표기인 "콘퍼런스"** 쪽이 흔하다. 그래서 "LG전자, 북미 테크 콘퍼런스 개최…
  // 피지컬 AI 비전 제시 및 R&D 인재 영입"이 감점 0으로 통과해 최종 4건에 실렸다(실측).
  // 표기가 갈리는 낱말은 **양쪽 다** 넣어야 한다 — 한쪽만 있으면 없는 것과 같다.
  "행사", "세미나", "컨퍼런스", "콘퍼런스", "수상", "인증", "채용", "인재 영입",
] as const;

// 🔴 기관 자체 성과 발표 — **위 주석이 "관찰되면 그때 추가한다"고 예고한 바로 그 사례다**(2026-08-30).
//
// 신고: "뉴스에 갑자기 숭실대, 전북대 이런 게 뜨는 이유는 뭐지". 실제로 뜬 것:
//   · "숭실대 AI안전성연구센터, … 사이버짐 공개 리더보드 등재"
//   · "전북대 피지컬AI 기술 실증랩, 자동차 부품 제조 공정 자동화 성과 공개"
// 왜 상위에 올라왔나: 둘 다 HIGH_VALUE_TERMS("에이전트", "보안 취약", "로보틱스" 등)에 여러 번
// 걸려 +점을 받는데, **MILD_DEMOTE에는 이 부류를 가리키는 단어가 하나도 없어서 감점이 0이었다.**
// 협약·수상·행사는 있는데 "연구센터 / 실증랩 / 개소 / 과제 선정 / 등재"는 빠져 있었다.
//
// 감점을 -8로 세게 잡는 이유: HIGH_VALUE가 히트당 +4라 이 기사들은 보통 +8~12를 먼저 받는다.
// -3(MILD)로는 순위가 거의 안 밀린다. 실제로 안 밀려서 후보 상위에 그대로 남았다.
// ⚠️ **제거가 아니라 감점이다** — 요청서 §10 "Hard Filter 최소화" 원칙을 지킨다. 대학이 낸
//    것이라도 모델·데이터셋·논문처럼 실제 산출물이 공개되면 다른 가점이 이 감점을 넘어선다.
// ⚠️ "센터"를 단독으로 넣지 마라 — "데이터센터"(정당한 AI 인프라 뉴스)가 같이 걸린다.
const INSTITUTIONAL_PR_TERMS = [
  "연구센터", "연구소 개소", "실증랩", "실증사업", "실증 사업",
  "개소", "출범", "착수", "현판", "간담회", "시연회", "설명회",
  "과제 선정", "국책", "지원사업", "지원 사업", "공모전", "산학협력", "산학 협력",
  "컨소시엄", "업무협약", "등재", "선정됐다", "선정됐고", "선정되었다",
] as const;

function countHits(text: string, terms: readonly string[]): number {
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
}

// 신선 구간 — 이 안에서는 최신성이 **보조 점수**다(요청서 4절). 중요도가 최신성을 이길 수 있어야
// 하고, 그 불변식이 filter.check.ts에 있다("중요도가 최신성보다 우선해야 한다": 어제 Agent 기사 >
// 오늘 평범한 기사). 그래서 이 구간의 계산은 예전 그대로 둔다.
const FRESH_WINDOW_DAYS = 3;
// 🔴🔴 2026-09-08 — 신선 구간 **밖**에는 감점을 준다. 이 값이 없어서 "오늘의 뉴스"에 지난주
// 기사가 올랐다.
//
// 산수가 원인이었다: `recencyBonus`의 최대값이 **+3**인데 HIGH_VALUE_TERMS 한 번 적중이 **+4**다.
// 즉 **키워드 하나가 신선도 전체를 이긴다.** 3일이 넘으면 감점이 아니라 그냥 +0이었으므로
// 나이는 그 뒤로 아무 비용이 없었다.
//
// 실제 피해(Supabase 실측, 2026-09-08): 크론은 매일 정상이었고 stale도 아니었는데 고른 기사가
//   briefing 2026-09-08 → 기사 게시일 09-08, 09-07, **09-04, 09-03**
//   briefing 2026-09-06 → 기사 게시일 09-06, 09-04, **08-27**   ← 10일 전
// 사용자 신고 "오늘 9월8일인데 9월3일/9월5일 뉴스 들어오고 난리도 아님"이 정확히 이것이다.
//
// 👉 **하드 컷오프를 쓰지 않는다.** 요청서 §10 "Hard Filter 최소화"이고, 더 실용적인 이유가 있다:
//    신선한 AI/Tech 기사가 부족한 날(주말·연휴)에 컷오프면 칸이 비어버린다. 감점은 그때
//    **가장 덜 오래된 것이 자동으로 1위**가 되어 스스로 degrade한다 — 빈 화면이 나오지 않는다.
// 👉 하루당 12점. HIGH_VALUE_TERMS 적중이 보통 1~3회(=+4~+12)이므로, 4일 지난 기사는 그 가점을
//    통째로 상쇄당한다. "압도적으로 더 중요하면 그래도 오른다"는 여지는 남기되 기본은 최신이다.
//    ⚙️ 이 숫자가 이번 조정의 유일한 손잡이다. 더 엄격하게 하려면 올리고, 주말에 칸이 비는 느낌이면
//       내린다. 창(FRESH_WINDOW_DAYS)을 줄이는 쪽이 아니라 이 값을 만지는 쪽이 안전하다 —
//       창을 줄이면 위 불변식(어제 기사)이 깨진다.
const STALE_PENALTY_PER_DAY = 12;
function recencyBonus(publishedAt: Date): number {
  const daysAgo = Math.floor((Date.now() - publishedAt.getTime()) / (24 * 60 * 60 * 1000));
  if (daysAgo <= FRESH_WINDOW_DAYS) return FRESH_WINDOW_DAYS - daysAgo;
  return -STALE_PENALTY_PER_DAY * (daysAgo - FRESH_WINDOW_DAYS);
}

// 점수는 순위 조정용일 뿐 — 이 값이 낮다고 후보에서 제거하지 않는다(요청서 3·10절)
export function scoreArticle(candidate: Candidate): number {
  const text = `${candidate.title} ${candidate.summary}`.toLowerCase();
  let score = countHits(text, HIGH_VALUE_TERMS) * 4;
  score -= countHits(text, STRONG_DEMOTE_TERMS) * 8;
  const isMA = MA_EXCEPTION_TERMS.some((t) => text.includes(t));
  if (!isMA) score -= countHits(text, MILD_DEMOTE_TERMS) * 3;
  score -= countHits(text, INSTITUTIONAL_PR_TERMS) * 8;
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
