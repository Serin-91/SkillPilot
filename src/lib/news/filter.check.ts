// 자체 점검: `node src/lib/news/filter.check.ts` (roles.check.ts와 같은 방식, Node 24 type stripping).
// 뉴스 선정 로직 수정 — Hard Filter는 최소화, 순위는 점수로만 조정한다는 원칙이 깨지면 여기서 터진다.
import assert from "node:assert/strict";
import { matchesKeywords, needsKeywordFilter, scoreArticle } from "./filter.ts";
import type { Candidate } from "./rss.ts";

const mk = (over: Partial<Candidate>): Candidate => ({
  title: "제목", summary: "요약", url: "https://example.com/1", source: "AI타임스", publishedAt: new Date(),
  ...over,
});

// ZDNet만 키워드 필터 대상 — AI 전문 소스는 화이트리스트에 없는 단어를 써도 통과해야 한다
assert.equal(needsKeywordFilter("ZDNet Korea"), true);
assert.equal(needsKeywordFilter("AI타임스"), false);
assert.equal(needsKeywordFilter("TechCrunch"), false);
assert.equal(needsKeywordFilter("MIT News AI"), false);
assert.equal(needsKeywordFilter("Ars Technica AI"), false);
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

console.log("filter.check.ts OK");
