// 자체 점검: `npx tsx src/lib/news/article-body.check.ts` — 네트워크 불필요.
// 본문 추출의 **경계 판정**만 검사한다. 이게 깨지면 요약이 조용히 300자로 되돌아가는데
// 화면에는 "좀 짧네" 말고 아무 증상이 없다 — 그래서 검사로 붙잡는다.
import assert from "node:assert/strict";
import { __extractBodyForTest as extract, fetchArticleBody } from "./article-body.ts";

const long = (n: number) => "본문 문장입니다. ".repeat(n);
const page = (inner: string) =>
  `<html><body><div class="article-body"><!-- contents //-->` +
  `<article id="article-view-content-div" class="article-veiw-body view-page" itemprop="articleBody">${inner}</article>` +
  `</div><footer><p>${long(30)}</p></footer></body></html>`;

// ① 정상 — 선언된 경계 안의 <p>만 모은다. 경계 **밖**(footer)은 안 들어온다.
{
  const body = extract(page(`<p>${long(26)}</p><p>${long(26)}</p>`));
  assert.ok(body, "정상 문서에서 본문이 나와야 한다");
  assert.equal(body.split("\n").length, 2, "문단 2개");
  assert.equal(/footer/.test(body), false, "경계 밖 내용이 섞이면 안 된다");
}

// ②🔴 기자 서명은 본문이 아니다 — 실측 8/8건 전부 마지막 문단이 이 형태였다
{
  const body = extract(page(`<p>${long(30)}</p><p>박찬 기자 cpark@aitimes.com</p>`))!;
  assert.equal(body.includes("@aitimes.com"), false, "기자 서명이 남으면 안 된다");
  assert.equal(body.split("\n").length, 1);
}

// ③🔴 사진 설명·표·TTS 위젯은 문장 사이에 섞인다 — 본문에 들어오면 안 된다
{
  const body = extract(page(
    `<figure><figcaption><p>사진설명입니다 ${long(5)}</p></figcaption></figure>` +
    `<div id="audio-tts-container"><p>${long(5)} 음성으로 듣기</p></div>` +
    `<table><tr><td><p>표 안 문장 ${long(5)}</p></td></tr></table>` +
    `<p>${long(26)}</p>`
  ))!;
  assert.equal(body.split("\n").length, 1, "본문 문단 1개만 남아야 한다");
  assert.equal(/사진설명|음성으로 듣기|표 안 문장/.test(body), false, `잡티가 섞였다: ${body.slice(0, 80)}`);
}

// ④ 중첩 <article>이 있어도 첫 </article>에서 자르지 않는다(깊이를 센다)
{
  const body = extract(page(`<p>${long(26)}</p><article><p>${long(12)}</p></article><p>${long(26)}</p>`))!;
  assert.equal(body.split("\n").length, 3, "중첩 뒤 문단까지 살아야 한다");
}

// ⑤🔴 껍데기만 온 문서는 null — 호출부가 RSS 요약으로 되돌아간다.
//    실측: "[9월3일] 순천 AI 영상 뉴스"가 본문 57자(기자 서명뿐)였다.
assert.equal(extract(page(`<p>주영효 기자 society@aitimes.com</p>`)), null, "서명만 있으면 null");
assert.equal(extract(page(`<p>짧다.</p>`)), null, "상한 미만이면 null");
assert.equal(extract("<html><body><p>경계 선언이 없는 문서</p></body></html>"), null, "경계가 없으면 null");
assert.equal(extract("<article itemprop=\"articleBody\"><p>닫는 태그가 없다</p>"), null, "닫는 태그가 없으면 null");

// ⑥ 엔티티·태그 정제가 stripHtml 하나로 통일돼 있다
{
  const body = extract(page(`<p>해상도 832&times;480 &lsquo;테스트&rsquo; ${long(26)}</p>`))!;
  assert.ok(body.includes("832×480"), `&times;가 디코딩돼야 한다: ${body.slice(0, 50)}`);
  assert.ok(body.includes("'테스트'"), "&lsquo;/&rsquo;도 디코딩돼야 한다");
  assert.equal(/&[a-z]+;/.test(body), false, "미디코딩 엔티티가 남으면 안 된다");
}

// ⑦🔴🔴 robots.txt 판단이 코드에 박혀 있어야 한다 — TechCrunch는 anthropic-ai/ClaudeBot/GPTBot 등
//        13종에 Disallow: / 를 명시했다. 목록에 조용히 추가되는 것을 이 검사가 막는다.
async function blockedSourcesMakeNoRequest() {
  const called: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request) => { called.push(String(u)); throw new Error("호출되면 안 된다"); }) as typeof fetch;
  try {
    assert.equal(await fetchArticleBody("TechCrunch", "https://techcrunch.com/x"), null, "TechCrunch는 본문을 받지 않는다");
    assert.equal(await fetchArticleBody("ZDNet Korea", "https://zdnet.co.kr/x"), null, "허용 목록 밖은 받지 않는다");
    assert.equal(await fetchArticleBody("MIT News AI", "https://news.mit.edu/x"), null);
    assert.deepEqual(called, [], "허용 목록 밖 소스에는 요청 자체가 나가면 안 된다");
  } finally { globalThis.fetch = origFetch; }
}

blockedSourcesMakeNoRequest().then(() => console.log("article-body.check.ts OK"));
