// 자체 점검: `node src/lib/jobs/jobkorea.check.ts`로 돌린다(Node 24 type stripping, 실제 API 왕복함).
// 2026-08-13 3소스 재구축 신규 — 검색이 실제 GI_Read URL을 반환하는지, 상세 파싱이 최소 필드를
// 채우는지, 마감 판정이 "마감" substring이 아니라 실제 메타 마감일 값으로 되는지 확인한다(6-3절 P0).
import assert from "node:assert/strict";
import { searchJobKorea, fetchJobKoreaJobDetail } from "./jobkorea.ts";

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
