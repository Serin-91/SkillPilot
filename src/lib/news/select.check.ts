// 자체 점검: `node src/lib/news/select.check.ts` (filter.check.ts와 같은 방식).
// 2026-08-09 실제 사고 재현 — Gemini가 "동일 출처 최대 2건" 프롬프트 지시를 무시하고
// 한 출처에서 4건을 전부 고른 사례가 나왔다. 코드 검증(violatesSourceCap)과 강제 보정
// (enforceSourceCap)이 깨지면 같은 사고가 조용히 재발한다.
import assert from "node:assert/strict";
import { violatesSourceCap, enforceSourceCap, reconcileWithCandidates, looksUntranslated, hasUntranslatedTitle, type SelectedNewsItem } from "./select.ts";
import type { Candidate } from "./rss.ts";

const mk = (source: string, importance: number): SelectedNewsItem => ({
  title: `${source} 기사 ${importance}`, summary: "요약", importance, related_concepts: [],
  reason_selected: "이유", published_at: new Date().toISOString(), uncertainty: null, source, url: `https://x/${source}-${importance}`,
});

// 실제 사고 사례 — 한 출처에서 4건 전부
const allSameSource = [mk("AI타임스", 9), mk("AI타임스", 8), mk("AI타임스", 7), mk("AI타임스", 6)];
assert.equal(violatesSourceCap(allSameSource), true);

const capped = enforceSourceCap(allSameSource);
assert.equal(capped.length, 2, "소스당 상한(2)을 넘는 항목은 버린다 — 최종 개수가 4보다 적어질 수 있다");
assert.deepEqual(capped.map((i) => i.importance), [9, 8], "importance가 높은 순으로 남긴다");

// 정상 분산은 그대로 통과해야 한다
const diverse = [mk("AI타임스", 9), mk("TechCrunch", 8), mk("ZDNet Korea", 7), mk("TechCrunch", 6)];
assert.equal(violatesSourceCap(diverse), false);
assert.deepEqual(enforceSourceCap(diverse).length, 4);

// 상한 이하로 여러 출처에 걸쳐 있으면 위반이 아니다
const exactlyAtCap = [mk("AI타임스", 9), mk("AI타임스", 8), mk("TechCrunch", 7)];
assert.equal(violatesSourceCap(exactlyAtCap), false);

// ── reconcileWithCandidates — Gemini가 돌려준 출처 정보를 코드가 다시 검증한다 ──────────────
const cand = (source: string, url: string): Candidate => ({
  title: "후보 제목", summary: "후보 요약", url, source, publishedAt: new Date("2026-08-20T01:00:00.000Z"),
});
const candidates = [cand("AI타임스", "https://aitimes.com/a/1"), cand("TechCrunch", "https://techcrunch.com/b/2")];

const withUrl = (url: string, source: string): SelectedNewsItem => ({ ...mk(source, 5), url });

// 지어낸 URL은 죽은 링크가 되므로 버린다
const hallucinated = reconcileWithCandidates([withUrl("https://aitimes.com/does-not-exist", "AI타임스")], candidates);
assert.equal(hallucinated.length, 0, "후보에 없는 URL은 제외해야 한다");

// 후보에 있으면 살리되, 출처 필드는 후보 원본으로 덮어쓴다(모델이 source를 잘못 적어도 화면은 정확해야 한다)
const wrongSource = reconcileWithCandidates([withUrl("https://aitimes.com/a/1", "TechCrunch")], candidates);
assert.equal(wrongSource.length, 1);
assert.equal(wrongSource[0].source, "AI타임스", "source는 후보 원본으로 교정한다");
assert.equal(wrongSource[0].published_at, "2026-08-20T01:00:00.000Z", "published_at도 후보 원본을 따른다");

// 추적 파라미터만 다른 같은 기사도 같은 후보로 인식해야 한다(normalizeUrl 경유)
const tracked = reconcileWithCandidates([withUrl("https://aitimes.com/a/1?utm_source=x", "AI타임스")], candidates);
assert.equal(tracked.length, 1, "utm_* 파라미터가 붙어도 같은 후보로 매칭돼야 한다");
assert.equal(tracked[0].url, "https://aitimes.com/a/1", "저장되는 URL은 후보 원본이다");

// 같은 기사를 두 번 돌려주면 하나만 남긴다
const dup = reconcileWithCandidates(
  [withUrl("https://aitimes.com/a/1", "AI타임스"), withUrl("https://aitimes.com/a/1", "AI타임스")], candidates);
assert.equal(dup.length, 1, "중복 반환은 하나로 합친다");

// 본문 텍스트는 Gemini가 쓴 그대로 보존한다
const keep = reconcileWithCandidates([{ ...withUrl("https://techcrunch.com/b/2", "TechCrunch"), summary: "모델이 쓴 요약" }], candidates);
assert.equal(keep[0].summary, "모델이 쓴 요약", "본문은 건드리지 않는다");

// ── 2026-08-22 실제 사고 재현 — 같은 본문이 서로 다른 두 URL로 왔다 ────────────────────────
// 사용자 화면에 똑같아 보이는 카드가 두 장 떴고, DB를 열어보니 URL이 idxno=214238(딥시크)과
// idxno=214231(포티투마루)로 달랐다. 즉 Gemini가 딥시크 기사 본문을 쓰면서 URL만 전혀 다른
// 기사 것을 붙였고, "url/source를 후보 값으로 되돌린다"는 기존 동작이 그 잘못된 짝을 확정했다.
// 결과적으로 카드 한 장은 본문과 아무 상관 없는 기사로 링크가 걸렸다 — 단순 중복이 아니다.
const DEEPSEEK_URL = "https://www.aitimes.com/news/articleView.html?idxno=214238";
const FORTY2_URL = "https://www.aitimes.com/news/articleView.html?idxno=214231";
const realCandidates: Candidate[] = [
  { title: "딥시크, 멀티모달 에이전트 'V4-플래시-비전' 공개...'오퍼스 4.8'에 도전",
    summary: "요약", url: DEEPSEEK_URL, source: "AI타임스", publishedAt: new Date("2026-08-22T10:08:55.000Z") },
  { title: "포티투마루, 화성시 '민원 행정 AI 플랫폼' 구축한다",
    summary: "요약", url: FORTY2_URL, source: "AI타임스", publishedAt: new Date("2026-08-21T16:05:00.000Z") },
];
// Gemini가 실제로 돌려준 모양 — 두 항목 모두 딥시크 본문인데 URL만 다르다.
const deepseekBody = "딥시크, 멀티모달 에이전트 'V4-플래시-비전' 공개";
const mismatched: SelectedNewsItem[] = [
  { ...mk("AI타임스", 9), title: deepseekBody, url: FORTY2_URL },     // 잘못된 짝이 먼저 온 경우
  { ...mk("AI타임스", 8), title: deepseekBody, url: DEEPSEEK_URL },
];
const fixed = reconcileWithCandidates(mismatched, realCandidates);
assert.equal(fixed.length, 1, "같은 본문이 두 URL로 오면 카드는 한 장만 남아야 한다");
assert.equal(fixed[0].url, DEEPSEEK_URL, "본문과 실제로 들어맞는 후보(딥시크)의 URL을 남겨야 한다");

// 순서가 반대여도 결과가 같아야 한다 — 먼저 온 것을 무조건 남기면 링크가 틀린 쪽이 살아남는다.
const reversed = reconcileWithCandidates([mismatched[1], mismatched[0]], realCandidates);
assert.equal(reversed.length, 1);
assert.equal(reversed[0].url, DEEPSEEK_URL, "도착 순서와 무관하게 맞는 짝을 남긴다");

// 서로 다른 기사는 제목이 달라 그대로 둘 다 남아야 한다(과잉 제거 방지).
const distinct = reconcileWithCandidates(
  [{ ...mk("AI타임스", 9), title: "딥시크 V4 공개", url: DEEPSEEK_URL },
   { ...mk("AI타임스", 8), title: "포티투마루 화성시 플랫폼 구축", url: FORTY2_URL }],
  realCandidates);
assert.equal(distinct.length, 2, "제목이 다른 별개 기사는 둘 다 남긴다");

console.log("select.check.ts OK");

// ── 제목 번역 검증 (2026-08-27 실제 사고) ─────────────────────────────────────────
// 테크크런치 기사 제목이 영어 원문 그대로 화면에 떴다. 프롬프트에는 "원문이 영어 기사여도
// 한국어로 번역해서 작성한다"가 있었지만 LLM instruction following은 확률적이라 그냥 통과했다.
// 출처 상한에는 코드 검증이 있었고 언어에는 없었던 것이 차이의 전부였다.

// 영어 원문 제목 = 번역 안 됨
assert.equal(looksUntranslated("OpenAI launches new agent framework for developers"), true);
assert.equal(looksUntranslated("Nvidia's Q3 earnings beat expectations"), true);

// 정상 한국어 제목 — 고유명사가 많아도 조사·서술어에 한글이 있다
assert.equal(looksUntranslated("엔비디아, '그로크 3 LPX' 본격 양산…초고속 추론 에이전트 시장 타깃"), false);
assert.equal(looksUntranslated("솔트룩스 '구버', 1분 만에 나만의 AI 에이전트 만든다"), false);
assert.equal(looksUntranslated("하이퍼엑셀, 포브스 아시아 '100 투 워치' 선정"), false);
// 영어 비중이 압도적이어도 한글이 있으면 번역된 것이다 — 비율로 재면 이런 걸 잘못 잡는다
assert.equal(looksUntranslated("MLOps / AI Agent 개발자"), false);

// 빈 값은 번역 실패로 보지 않는다(다른 검증이 잡을 몫이다)
assert.equal(looksUntranslated(""), false);
assert.equal(looksUntranslated("   "), false);

const enTitle = (t: string): SelectedNewsItem => ({ ...mk("TechCrunch", 8), title: t });
assert.equal(hasUntranslatedTitle([mk("AI타임스", 9), enTitle("Anthropic ships Claude update")]), true,
  "한 건이라도 영어면 재시도 대상이다");
assert.equal(hasUntranslatedTitle([mk("AI타임스", 9), mk("ZDNet Korea", 8)]), false,
  "전부 한국어면 재시도하지 않는다");
assert.equal(hasUntranslatedTitle([]), false, "빈 목록은 위반이 아니다");

// 🔴 2026-09-02 — 주제 다양성. **재배열이지 삭제가 아니다**(개수가 줄면 8월의 실패 모양이다).
{
  const { enforceTopicDiversity, MAX_MODEL_RESEARCH } = await import("./select.ts");
  const mk = (g: string, n: number) => ({ title: `${g}${n}`, topic_group: g } as never);
  const g = (a: readonly unknown[]) => a.map((x) => (x as { topic_group?: string }).topic_group || "?").join("");

  // ① A가 넘치고 대체군이 있으면 A는 2건까지만 앞자리를 갖는다
  const many = [mk("A",1),mk("A",2),mk("A",3),mk("A",4),mk("C",1),mk("D",1)];
  assert.equal(g(enforceTopicDiversity(many,4)).slice(0,4), "ACDA",
    `A 상한이 안 걸렸다 — ${g(enforceTopicDiversity(many,4))}`);
  assert.equal(enforceTopicDiversity(many,4).length, many.length, "재배열인데 개수가 줄었다");

  // ② 풀에 A밖에 없으면 억지로 만들지 않고 품질 순서 그대로 (품질 우선 fallback)
  const onlyA = [mk("A",1),mk("A",2),mk("A",3),mk("A",4),mk("A",5)];
  assert.equal(g(enforceTopicDiversity(onlyA,4)).slice(0,4), "AAAA",
    "대체군이 없는데 A를 밀어냈다 — 억지 충원 금지 원칙 위반");

  // ③ 서로 다른 군이 있으면 3개 이상이 앞자리에 온다
  const mixed = [mk("B",1),mk("B",2),mk("B",3),mk("A",1),mk("C",1)];
  const top = g(enforceTopicDiversity(mixed,4)).slice(0,4);
  assert.ok(new Set(top).size >= 3, `주제군이 ${new Set(top).size}개뿐이다 — ${top}`);

  // ④ 분류 불명(?)은 A로 취급하지 않는다 — 잘못된 값으로 A 상한이 엉뚱하게 걸리면 안 된다
  assert.equal(g(enforceTopicDiversity([mk("",1),mk("",2),mk("",3),mk("",4)],4)).slice(0,4), "????",
    "분류 불명이 A 상한에 걸렸다");
  assert.equal(MAX_MODEL_RESEARCH, 2);
  console.log("select 주제 다양성 OK");
}
