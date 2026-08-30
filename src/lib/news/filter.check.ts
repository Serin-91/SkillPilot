// 자체 점검: `node src/lib/news/filter.check.ts` (roles.check.ts와 같은 방식, Node 24 type stripping).
// 뉴스 선정 로직 수정 — Hard Filter는 최소화, 순위는 점수로만 조정한다는 원칙이 깨지면 여기서 터진다.
import assert from "node:assert/strict";
import { matchesKeywords, scoreArticle } from "./filter.ts";
import type { Candidate } from "./rss.ts";

const mk = (over: Partial<Candidate>): Candidate => ({
  title: "제목", summary: "요약", url: "https://example.com/1", source: "AI타임스", publishedAt: new Date(),
  ...over,
});

// ZDNet만 키워드 필터 대상 — AI 전문 소스는 화이트리스트에 없는 단어를 써도 통과해야 한다
// 키워드 필터는 이제 소스를 가리지 않고 전부에 걸린다 — "AI 전문지"로 분류해 둔 AI타임스가
// 실제로는 지역 소식까지 내보내면서 후보 슬롯을 잠식했다(2026-08-22, sources.ts 주석 참고).
// 대신 명백한 AI 기사가 탈락하지 않도록 키워드 목록을 회사·모델·인프라 어휘까지 넓혔다.
assert.equal(matchesKeywords("여수, 보건사업 추경 36억 확보"), false, "지역 소식은 AI타임스에서 와도 걸러야 한다");
assert.equal(matchesKeywords("목포어울림도서관, 9월 독서의 달 개최"), false);
assert.equal(matchesKeywords("삼성전자, 사상 최대 110조 규모 주주환원 단행"), false);
assert.equal(matchesKeywords("테슬라, '도어 핸들 결함' 문제로 중국서 300만대 리콜"), false);
// 넓힌 키워드 덕에 살아남아야 하는 실제 기사들 — 좁은 목록이었다면 전부 탈락했다.
assert.equal(matchesKeywords("Anthropic's Opus 4.6 is a smut-machine"), true);
assert.equal(matchesKeywords("Grok keeps sending gibberish responses to users"), true);
assert.equal(matchesKeywords("익명 'Ox 알파' 등장…코딩 성능·100조 토큰 무상 제공에 '발칵'"), true);
assert.equal(matchesKeywords("엔비디아, 국내 NPU 스타트업 리벨리온과 인수 협상 중"), true);
assert.equal(matchesKeywords("로봇 팔이 스스로 학습한다"), false, "일반 로봇 기사는 제목에 AI 키워드가 없으면 ZDNet 필터에 안 걸린다");
assert.equal(matchesKeywords("에픽게임즈, UEFN에 '언리얼 MCP' 도입…AI 기반 차세대 UGC 생태계 연다"), true);
// 종합 와이어 사고 재현(2026-08-21) — 본문까지 검사하던 시절엔 본문에 "AI"가 한 번만 나와도
// 통과해서 배터리·안마의자·세금환급 기사가 AI 브리핑 후보로 올라왔다. 제목 기준이라 이제 걸러진다.
assert.equal(matchesKeywords("스탠다드에너지, 한양대에 '바나듐이온배터리' ESS 공급"), false, "본문에 'AI 산업'이 있어도 제목에 없으면 탈락");
assert.equal(matchesKeywords("무신사, IPPG와 협력…베트남 본격 진출"), false);
assert.equal(matchesKeywords("복싱하고 그림 그리고…갤럭시 로봇파크, 2만명 다녀갔다"), false);

// 고가치 키워드는 순위만 올리고, 감점 키워드는 순위만 내린다 — 둘 다 제거 사유가 아니다
const plain = mk({ title: "평범한 기업 소식", summary: "특별할 것 없는 내용" });
const agentNews = mk({ title: "새로운 AI Agent 프레임워크 공개", summary: "Tool Calling과 MCP를 지원한다" });
assert.ok(scoreArticle(agentNews) > scoreArticle(plain), "Agent/MCP/Tool Calling 언급 기사가 더 높은 점수를 받아야 한다");

const stockNews = mk({ title: "AI 테마주 목표주가 상향", summary: "투자의견 매수 유지" });
assert.ok(scoreArticle(stockNews) < scoreArticle(plain), "주가/테마주 기사는 감점되어야 한다");

const maNews = mk({ title: "엔비디아, AI 인프라 기업 인수합병 발표", summary: "대규모 투자 유치를 통한 인수" });
const fundingNews = mk({ title: "AI 스타트업 시리즈 A 펀딩 유치", summary: "투자 유치 소식" });
assert.ok(scoreArticle(maNews) > scoreArticle(fundingNews), "M&A는 단순 펀딩 감점의 예외라 더 높아야 한다");

// 최신성은 보조 신호일 뿐 — 어제 나온 고가치 기사가 오늘 나온 평범한 기사보다 높을 수 있어야 한다
const todayPlain = mk({ title: "오늘의 평범한 소식", publishedAt: new Date() });
const yesterdayAgent = mk({
  title: "어제 발표된 주요 AI Agent 플랫폼 업데이트", summary: "Reasoning Model과 Tool Use 지원",
  publishedAt: new Date(Date.now() - 26 * 3600 * 1000),
});
assert.ok(scoreArticle(yesterdayAgent) > scoreArticle(todayPlain), "중요도가 최신성보다 우선해야 한다");

// 회사/모델명 언급만으로는 가점이 없다 — HIGH_VALUE_TERMS에 없으니 plain과 동점이어야 한다
const justMentioned = mk({ title: "OpenAI, Anthropic 관련 행사 참석", summary: "Gemini와 Meta AI도 함께 언급됐다" });
assert.equal(scoreArticle(justMentioned) < scoreArticle(plain), true, "기업명 나열 + 행사 언급은 감점되어야지 가점이면 안 된다");

// ── 기관 자체 성과 발표는 밀려나야 한다 (2026-08-30 "뉴스에 왜 숭실대·전북대가 뜨냐" 신고) ──
// 이 부류는 AI 기술 용어가 많아 HIGH_VALUE로 +점을 먼저 받는다. 감점이 그걸 넘어서야
// 후보 상위에서 실제로 밀려난다 — 그래서 비교 대상은 plain이 아니라 **같은 기술 용어를 가진
// 진짜 기술 기사**다. 여기서 터지면 그 기사들이 다시 뉴스에 올라온다.
const realAgentNews = mk({
  title: "앤트로픽, AI Agent가 모델 정렬 오류를 자율 수정하는 연구 공개",
  summary: "Reasoning Model과 Tool Use를 활용한 에이전트 파이프라인",
});
const labPR = mk({
  title: "전북대 피지컬AI 기술 실증랩, 자동차 부품 제조 공정 자동화 성과 공개",
  summary: "로보틱스 기반 실증사업 성과를 공개했다",
});
const centerPR = mk({
  title: "숭실대 AI안전성연구센터, 멀티에이전트 취약점 분석 시스템 리더보드 등재",
  summary: "보안 취약 진단 에이전트로 국책 과제 선정 성과를 냈다",
});
assert.ok(scoreArticle(realAgentNews) > scoreArticle(labPR), "실증랩 성과 발표가 실제 기술 기사보다 높으면 안 된다");
assert.ok(scoreArticle(realAgentNews) > scoreArticle(centerPR), "연구센터 성과 발표가 실제 기술 기사보다 높으면 안 된다");
// 대학이 냈어도 **산출물이 있으면** 죽이지 않는다 — 이건 제거가 아니라 감점이라는 원칙(요청서 §10).
const uniWithArtifact = mk({
  title: "KAIST 연구팀, 오픈소스 멀티모달 모델과 벤치마크 데이터셋 공개",
  summary: "파인튜닝 코드와 임베딩 평가 결과를 함께 공개했다",
});
assert.ok(scoreArticle(uniWithArtifact) > scoreArticle(labPR), "산출물이 공개된 대학 발표는 단순 성과 발표보다 높아야 한다");

console.log("filter.check.ts OK");
