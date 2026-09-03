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

// 🔴 2026-09-03 — GitHub Changelog 항목마다 앞에 붙던 106자 DOCTYPE 선언. `<!`는 `<` 다음이
// 알파벳이 아니라 아래 태그 정규식에 안 걸렸고, dev-ecosystem이 설명을 400자에서 자르므로
// **재료의 26.5%가 쓰레기였다**(실측: 프롬프트에 들어간 GitHub 6건 전부가 이걸로 시작).
assert.equal(
  stripHtml('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w3.org/TR/REC-html40/loose.dtd"> You can now set your preferred model'),
  "You can now set your preferred model",
  "DOCTYPE 선언은 제거되어야 한다 — 안 지우면 재료 400자 중 106자를 먹는다"
);
assert.equal(stripHtml("앞 <!-- 주석 --> 뒤"), "앞 뒤", "HTML 주석도 제거되어야 한다");
assert.equal(stripHtml("<속보> 3<5 라는 표기"), "<속보> 3<5 라는 표기", "DOCTYPE 규칙을 넓게 잡아 한글 제목·부등호를 지우면 안 된다");

// 이름 표기 엔티티 — AI타임스 본문에 실제로 이 형태로 들어온다(숫자 표기만 있어서 그대로 남았다)
assert.equal(stripHtml("&lsquo;제미나이&rsquo; 폐기"), "'제미나이' 폐기", "&lsquo;/&rsquo;도 디코딩되어야 한다");
assert.equal(stripHtml("상담&middot;시술&middot;환자관리"), "상담·시술·환자관리", "&middot;도 디코딩되어야 한다");
assert.equal(stripHtml("&ldquo;인용&rdquo;&hellip;"), '"인용"…', "&ldquo;/&rdquo;/&hellip;도 디코딩되어야 한다");

console.log("rss.check.ts OK");

// 🔴 2026-09-02 — content:encoded는 **무조건 우선하지 않는다.** 둘 다 같은 정리를 거친 뒤
//    실제 글자 수가 많은 쪽을 쓰고, 마지막에 상한을 건다.
{
  const { pickRicherText, MAX_SUMMARY_LENGTH } = await import("./rss.ts");
  assert.equal(pickRicherText("짧은 요약", "훨씬 더 긴 본문 전체가 여기에 들어온다"), "훨씬 더 긴 본문 전체가 여기에 들어온다",
    "content:encoded가 더 길면 그쪽을 써야 한다");
  assert.equal(pickRicherText("이쪽이 더 길고 정보가 많은 설명이다", "짧음"), "이쪽이 더 길고 정보가 많은 설명이다",
    "content:encoded가 더 짧으면(껍데기·푸터만 온 피드) description이 이겨야 한다");
  assert.equal(pickRicherText("설명만 있다", ""), "설명만 있다",
    "content:encoded가 없는 소스(AI타임스·TechCrunch)는 description이 그대로 남아야 한다");
  assert.equal(pickRicherText("가".repeat(5000), "나".repeat(9000)).length, MAX_SUMMARY_LENGTH,
    "상한을 넘기면 안 된다 — 후보 30건이면 무제한은 244,647자(≈111k 토큰)였다");
  console.log("rss pickRicherText OK");
}
