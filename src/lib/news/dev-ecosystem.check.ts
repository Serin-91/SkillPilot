// 자체 점검: `npx tsx src/lib/news/dev-ecosystem.check.ts` — 네트워크 불필요.
//
// HF 블로그 본문 추출의 **경계 판정**만 검사한다. 이게 깨지면 blog 항목이 조용히 제목만 남고
// 화면에는 아무 증상이 없다 — 역량 시그널이 "재료 부족"으로 0건이 될 뿐이라 며칠 뒤에야
// 발견된다(실제로 09-03~05 사흘을 그렇게 보냈다). 그래서 검사로 붙잡는다.
import assert from "node:assert/strict";
import { extractHfBlogBody as extract } from "./dev-ecosystem.ts";

const long = (n: number) => "This is a real sentence of the article body. ".repeat(n);

// 실제 HF 페이지의 껍데기를 그대로 본뜬다(2026-09-06 실측 마크업).
// 🔴 `<article class="overview-card-wrapper">`는 **관련 글 카드**다 — 본문이 아니다.
const page = (inner: string) =>
  `<html><body>` +
  `<article class="overview-card-wrapper group/repo  "><p>${long(20)} RELATED CARD</p></article>` +
  `<div class="max-lg:overflow-hidden">` +
  `<div class="blog-content copiable-code-container [&amp;_h1]:mr-0! prose mx-auto mb-8 lg:prose-lg">${inner}</div>` +
  `</div><footer><p>${long(20)} FOOTER</p></footer></body></html>`;

// ① 정상 — 선언된 경계(class="blog-content") 안의 블록만 모은다. 경계 밖은 안 들어온다.
{
  const body = extract(page(`<p>${long(6)}</p><p>${long(6)}</p>`));
  assert.ok(body, "정상 문서에서 본문이 나와야 한다");
  assert.equal(body.split("\n").length, 2, "문단 2개");
  assert.equal(/FOOTER/.test(body), false, "경계 밖(footer)이 섞이면 안 된다");
  assert.equal(/RELATED CARD/.test(body), false, "관련 글 카드가 섞이면 안 된다 — <article>은 본문이 아니다");
}

// ②🔴🔴 Tailwind 속성값 안의 raw ">" — 이번 작업에서 실제로 밟은 지뢰다.
//     `[^>]*`로 태그를 매칭하면 `[&>a]:hidden`의 ">"에서 끊겨 **남은 속성 문자열이 본문으로 샌다**
//     (실측: 첫 블록이 `a]:hidden">Give Your Coding Agents…`였다).
{
  const body = extract(page(`<h1 class="text-2xl [&>a]:hidden">Real Title Here</h1><p>${long(6)}</p>`))!;
  assert.ok(body.startsWith("Real Title Here"), `속성 잔해가 본문 앞에 붙었다: ${JSON.stringify(body.slice(0, 60))}`);
  assert.equal(/hidden"|\]:/.test(body), false, "CSS 클래스 조각이 본문에 남으면 안 된다");
}

// ③🔴 코드블록·그림·표는 서술이 아니다 — 통째로 들어오면 2000자 컷을 코드가 다 먹는다
{
  const body = extract(page(
    `<pre><code>import torch; MODEL_CODE_BLOCK</code></pre>` +
    `<figure><figcaption><p>FIGURE CAPTION ${long(2)}</p></figcaption></figure>` +
    `<table><tr><td><p>TABLE CELL ${long(2)}</p></td></tr></table>` +
    `<p>${long(6)}</p>`
  ))!;
  assert.equal(body.split("\n").length, 1, "본문 문단 1개만 남아야 한다");
  assert.equal(/MODEL_CODE_BLOCK|FIGURE CAPTION|TABLE CELL/.test(body), false, `잡티가 섞였다: ${body.slice(0, 80)}`);
}

// ④ 중첩 <div>가 있어도 첫 </div>에서 자르지 않는다(깊이를 센다) — HF 본문에는 중첩이 많다
{
  const body = extract(page(`<p>${long(6)}</p><div class="wrap"><p>${long(6)}</p></div><p>${long(6)}</p>`))!;
  assert.equal(body.split("\n").length, 3, "중첩 뒤 문단까지 살아야 한다");
}

// ⑤ h1~h6·li도 본문이다 — HF 블로그는 소제목과 목록이 서술의 큰 몫을 차지한다
{
  const body = extract(page(`<h2>Section Heading</h2><li>${long(3)}</li><p>${long(4)}</p>`))!;
  assert.ok(body.includes("Section Heading"), "소제목이 빠지면 안 된다");
  assert.equal(body.split("\n").length, 3);
}

// ⑥🔴 껍데기만 온 문서는 null — 호출부가 "제목만"으로 되돌아간다(fallback 보장)
assert.equal(extract(page(`<p>Too short.</p>`)), null, "상한 미만이면 null");
assert.equal(extract(`<html><body><p>${long(20)}</p></body></html>`), null, "경계 선언이 없으면 null");
assert.equal(extract(`<div class="blog-content"><p>${long(20)}</p>`), null, "닫는 태그가 없으면 null");
assert.equal(extract(""), null, "빈 문서는 null");

// ⑦ 엔티티·태그 정제가 stripHtml 하나로 통일돼 있다
{
  const body = extract(page(`<p>Resolution 832&times;480 &lsquo;test&rsquo; ${long(6)}</p>`))!;
  assert.ok(body.includes("832×480"), `&times;가 디코딩돼야 한다: ${body.slice(0, 50)}`);
  assert.equal(/&[a-z]+;/.test(body), false, "미디코딩 엔티티가 남으면 안 된다");
}

// ⑧🔴🔴 전역 정규식의 lastIndex가 호출 사이에 남으면 **두 번째 호출부터 조용히 앞부분을 놓친다.**
//     모듈 상수로 둔 /g 정규식의 고전적 함정이라 연속 호출로 직접 확인한다.
{
  const doc = page(`<p>${long(6)}</p><p>${long(6)}</p>`);
  const a = extract(doc);
  const b = extract(doc);
  assert.deepEqual(a, b, "같은 입력을 두 번 넣으면 같은 결과여야 한다(lastIndex 오염 없음)");
}

console.log("dev-ecosystem.check.ts (HF 블로그 본문 경계) OK");
