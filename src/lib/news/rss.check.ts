// 자체 점검: `node src/lib/news/rss.check.ts` (filter.check.ts와 같은 방식, Node 24 type stripping).
// stripHtml 수정 2건 — 십육진 엔티티(&#x27;) 디코딩, "<속보>"류 한글 대괄호 제목이 진짜 HTML 태그로
// 오인돼 지워지지 않아야 한다는 것 — 이 둘이 깨지면 여기서 터진다.
import assert from "node:assert/strict";
import { stripHtml } from "./rss.ts";

assert.equal(stripHtml("&#x27;AI 모델링&#x27; 채용"), "'AI 모델링' 채용", "십육진 엔티티(&#x27;)도 디코딩되어야 한다");
assert.equal(stripHtml("&#39;AI&#39;"), "'AI'", "십진 엔티티(&#39;)는 계속 디코딩되어야 한다");

assert.equal(stripHtml("<속보> AI 대전환"), "<속보> AI 대전환", "한글로 시작하는 <속보>는 태그가 아니라 제목 문구라 그대로 남아야 한다");
assert.equal(stripHtml("[단독] AI 소식"), "[단독] AI 소식", "대괄호류는 애초에 태그 패턴이 아니므로 그대로 남아야 한다");

assert.equal(stripHtml("실제 <b>강조</b> 문구"), "실제 강조 문구", "실제 HTML 태그(<b>)는 여전히 제거되어야 한다");
assert.equal(stripHtml('링크 <a href="https://x.com">텍스트</a> 입니다'), "링크 텍스트 입니다", "속성이 있는 태그도 제거되어야 한다");

console.log("rss.check.ts OK");
