// 자체 점검: `node src/lib/jobs/jobkorea.check.ts`로 돌린다(Node 24 type stripping, 실제 API 왕복함).
// 2026-08-13 3소스 재구축 신규 — 검색이 실제 GI_Read URL을 반환하는지, 상세 파싱이 최소 필드를
// 채우는지, 마감 판정이 "마감" substring이 아니라 실제 메타 마감일 값으로 되는지 확인한다(6-3절 P0).
import assert from "node:assert/strict";
import { searchJobKorea, fetchJobKoreaJobDetail, extractDescriptionSections } from "./jobkorea.ts";

const results = await searchJobKorea("AI Agent Engineer LLM RAG", 5);
assert.ok(results.length > 0, "검색 결과가 0건이면 stext 검색 구조가 깨진 것");
for (const r of results) {
  assert.match(r.url, /^https:\/\/www\.jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+$/, `URL 형식 이상 - ${r.url}`);
}

const detail = await fetchJobKoreaJobDetail(results[0].url);
assert.ok(detail, `상세 파싱 실패 - ${results[0].url}`);
if (detail) {
  assert.ok(detail.company.length > 0, "company 비어있음");
  assert.ok(detail.title.length > 0, "title 비어있음");
  // "마감일은 기업의 사정으로..." 같은 안내문 때문에 정상 공고가 마감으로 오판되지 않아야 한다.
  assert.notEqual(detail.is_job_posting, false);

  // 고용형태에 HTML 태그 조각이 leak되면 안 된다(2026-08-13 domTextAfterLabel 버그 회귀 방지 — 실제
  // "/span>" 같은 조각이 값에 섞였던 적이 있다).
  if (detail.employment_type) assert.doesNotMatch(detail.employment_type, /[<>]/, `employment_type에 태그 조각 leak - "${detail.employment_type}"`);

  // 본문 필드에 메인 페이지의 "AI추천공고" 사이드바/추천목록 텍스트가 섞이면 안 된다(TASK6 P0) —
  // 본문은 GI_Read_Comt_Ifrm iframe 응답에서만 오고, 그 iframe에는 이 마커들이 아예 없다(실제 조회로 확인).
  const bodyText = `${detail.responsibilities} ${detail.required_text} ${detail.preferred_text}`;
  for (const leakMarker of ["AI추천공고", "이상 찜한 기업", "기업정보 더보기"]) {
    assert.ok(!bodyText.includes(leakMarker), `본문에 parent page 텍스트 leak 의심 - "${leakMarker}"`);
  }
}

console.log("jobkorea.check.ts OK");

// ────────────────────────────────────────────────────────────────────────────
// 오프라인 파싱 회귀 — 2026-08-30 ㈜나인이즈 공고("주요업무만 들어온다" 신고)
//
// 예전 구현은 <b>/</b>를 같은 마커로 바꿔 split한 뒤 "홀수=라벨, 짝수=본문" 위치 가정으로 읽었다.
// 그런데 여는 정규식이 `/<b>/g`라 **속성이 붙은 <b style="...">를 못 잡아** 마커 개수가 홀수가 되고,
// 짝이 밀려 `자격요건`이 짝수 자리로 떨어져 alias 검사조차 못 받았다.
// 아래 HTML은 그 공고의 태그 시퀀스를 그대로 옮긴 것이다(속성 있는 <b> 3개 + 없는 것 2개).
// 라이브 API가 아니라 문자열이므로 네트워크 없이 항상 돈다.
{
  const html = [
    "<p><b>㈜나인이즈</b></p>",
    "<p><b>AI 연구개발 팀원</b>",
    "회사 소개문입니다. 포지션 및 자격요건 안내를 포함한 긴 문단이라 라벨로 오인되기 쉽다.</p>",
    "<p><b style=\"letter-spacing: 0px;\">담당업무</b><br>",
    "ㆍAI 서비스 및 Agent 개발<br>- LLM 기반 AI Agent 설계 및 개발</p>",
    "<p><b style=\"letter-spacing: 0px;\"><br></b></p>",
    "<p><b style=\"letter-spacing: 0px;\">자격요건</b><br>",
    "ㆍ학력 : 학사이상<br>ㆍ경력 : 3년이상</p>",
    "<p><b>우대사항</b><br>ㆍPython, LangChain 경험자</p>",
  ].join("");

  const got = extractDescriptionSections(html);
  assert.ok(got.responsibilities.includes("AI 서비스 및 Agent 개발"), `주요업무 파싱 실패 — "${got.responsibilities}"`);
  // 🔴 이 두 줄이 이번 버그의 회귀 방지다. 예전 구현에서는 둘 다 빈 문자열이었다.
  assert.ok(got.required_text.includes("학사이상"), `자격요건이 비었다(parity 회귀) — "${got.required_text}"`);
  assert.ok(got.preferred_text.includes("LangChain"), `우대사항이 비었다 — "${got.preferred_text}"`);
  // 회사 소개문(긴 문단)이 라벨로 오인돼 자격요건을 덮으면 안 된다.
  assert.ok(!got.required_text.includes("회사 소개문"), `긴 문단이 라벨로 오인됐다 — "${got.required_text}"`);
  // 빈 라벨 <b><br></b>이 alias에 붙으면 안 된다(a.includes("")가 항상 true인 함정).
  assert.ok(got.preferred_text.length > 0 && !got.preferred_text.startsWith("자격요건"), "빈 라벨이 섹션을 가로챘다");
  console.log("jobkorea 오프라인 파싱 회귀 OK");
}
