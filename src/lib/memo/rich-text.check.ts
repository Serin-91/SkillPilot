// 자체 점검: `node src/lib/memo/rich-text.check.ts` (다른 *.check.ts와 같은 방식, Node 24 type stripping).
// memoPreview는 Key Notes 카드 본문에 쓰이는 캐시다. 캐시가 틀리면 "메모를 수정했는데 카드에는
// 옛 내용이 남는다"는 조용한 버그가 되고, 잘라내기가 틀리면 카드에 안 보이는 본문을 세션 내내
// 메모리에 들고 있게 된다. 둘 다 눈으로는 안 잡히니 여기서 잡는다.
import assert from "node:assert/strict";
import { memoPreview, MEMO_PREVIEW_MAX, htmlToPlainText, hasRichFormatting, plainTextToHtml } from "./rich-text.ts";

const rich = (content: string | null) => ({ content, content_format: "rich_html" as const });
const plain = (content: string | null) => ({ content, content_format: "plain" as const });

// ── 평문 메모는 손대지 않는다 (변환도 잘라내기도 없음) ────────────────────────────────
assert.equal(memoPreview(plain("그냥 평문 <b>태그처럼 보이는 것</b>")), "그냥 평문 <b>태그처럼 보이는 것</b>");
assert.equal(memoPreview(plain(null)), "", "content가 null이면 빈 문자열이다");
assert.equal(memoPreview(rich(null)), "", "rich_html이라도 null이면 빈 문자열이다");

// 평문은 길어도 자르지 않는다 — 잘라내기는 리치 HTML 변환 결과를 캐시할 때만 하는 절약이고,
// 평문은 캐시하지 않으므로 원본을 그대로 넘겨야 한다(자르면 화면에 보이는 내용이 달라진다).
const longPlain = "가".repeat(MEMO_PREVIEW_MAX + 50);
assert.equal(memoPreview(plain(longPlain)).length, MEMO_PREVIEW_MAX + 50);

// ── 리치 HTML은 태그가 벗겨진다 ───────────────────────────────────────────────────
assert.equal(memoPreview(rich("<p>첫 줄</p><p>둘째 줄</p>")), htmlToPlainText("<p>첫 줄</p><p>둘째 줄</p>"));

// ── 캐시 키는 content다: 본문이 바뀌면 결과도 바뀌어야 한다 ─────────────────────────
// (키를 memo.id로 잡았다면 아래 두 번째 호출이 "수정 전" 값을 돌려준다 — 실제로 흔한 실수다.)
const before = memoPreview(rich("<p>수정 전</p>"));
const after = memoPreview(rich("<p>수정 후</p>"));
assert.equal(before, "수정 전");
assert.equal(after, "수정 후");
assert.notEqual(before, after, "본문이 다르면 미리보기도 달라야 한다 — 캐시가 id 기준이면 여기서 깨진다");

// 같은 본문을 다시 물어보면 같은 값이 나온다(캐시 히트여도 결과는 동일해야 한다)
assert.equal(memoPreview(rich("<p>수정 후</p>")), after);

// ── 잘라내기: MEMO_PREVIEW_MAX를 넘지 않는다 ──────────────────────────────────────
const big = "<p>" + "나".repeat(5000) + "</p>";
const cut = memoPreview(rich(big));
assert.equal(cut.length, MEMO_PREVIEW_MAX, `리치 본문 미리보기는 ${MEMO_PREVIEW_MAX}자로 잘린다`);
assert.ok(cut.startsWith("나나나"), "잘라내되 앞에서부터 남긴다");

// 경계값: 정확히 MEMO_PREVIEW_MAX면 자르지 않는다(off-by-one 방지)
const exact = memoPreview(rich("<p>" + "다".repeat(MEMO_PREVIEW_MAX) + "</p>"));
assert.equal(exact.length, MEMO_PREVIEW_MAX);

// ── 캐시가 300개를 넘어가면 통째로 비운다 — 그래도 결과는 계속 정확해야 한다 ──────────
for (let i = 0; i < 320; i++) memoPreview(rich(`<p>항목 ${i}</p>`));
assert.equal(memoPreview(rich("<p>항목 7</p>")), "항목 7", "캐시를 비운 뒤에도 다시 계산해서 정확한 값을 준다");

console.log("rich-text.check.ts OK");

// ── hasRichFormatting — 이 판정이 틀리면 **본문이 영구히 깨진다** ─────────────────────
// 잘못 false가 나오면: plain으로 저장 → Quick Edit로 열림 → htmlToPlainText로 납작해짐 →
// 자동저장이 그걸 덮어쓴다. 되돌릴 수 없다. 그래서 여기서 잡는다(2026-08-26 실제 사고).
// 예전 구현은 서식 태그를 나열했는데 `span`이 빠져 있었다 — 서식툴바의 글씨 크기·글자색이
// 정확히 span을 만든다. 나열식은 서식이 늘 때마다 또 뚫리므로 "p/br이 아니면 서식"으로 뒤집었다.

// plainTextToHtml이 만드는 것 = 서식 아님
assert.equal(hasRichFormatting(""), false, "빈 본문은 서식 없음");
assert.equal(hasRichFormatting("<p>그냥 한 줄</p>"), false, "<p>만 있으면 평문이다");
assert.equal(hasRichFormatting("<p>줄1</p><p><br></p><p>줄2</p>"), false, "<p>/<br> 조합은 평문이다");
assert.equal(hasRichFormatting(plainTextToHtml("여러\n줄\n\n빈 줄 포함")), false,
  "plainTextToHtml 결과는 정의상 항상 평문이어야 한다");

// 🔴 이번 사고의 재발 방지 — 서식툴바가 만드는 span
assert.equal(hasRichFormatting('<p><span style="font-size: 24px">크게</span></p>'), true,
  "글씨 크기(span)는 서식이다 — 여기가 뚫려서 본문이 날아갔다");
assert.equal(hasRichFormatting('<p><span style="color: #FF4040">빨강</span></p>'), true,
  "글자색(span)은 서식이다");

// 기존에 이미 잡히던 것들이 계속 잡히는지 (나열식 → 역방향으로 바꾸며 회귀 없어야 한다)
for (const html of [
  "<h1>제목</h1>", "<p><strong>굵게</strong></p>", "<p><em>기울임</em></p>", "<p><u>밑줄</u></p>",
  "<ul><li>목록</li></ul>", "<ol><li>번호</li></ol>", "<blockquote><p>인용</p></blockquote>",
  "<hr>", "<pre>코드</pre>", '<p><a href="https://example.com">링크</a></p>',
  '<ul data-type="taskList"><li data-checked="true"><p>할 일</p></li></ul>',
]) {
  assert.equal(hasRichFormatting(html), true, `서식으로 잡혀야 한다: ${html}`);
}

// <p>/<br>의 닫는 태그·자기닫음 형태에 속지 않는지
assert.equal(hasRichFormatting("<p>a</p><br/><p>b</p>"), false, "<br/> 자기닫음도 평문이다");
// 이름이 p/br로 **시작**하는 다른 태그는 서식이다(접두사 오탐 방지)
assert.equal(hasRichFormatting("<pre>x</pre>"), true, "pre는 p가 아니다");

// 🔴 반대 방향 유실 방지 — 간단 메모는 평문 textarea라 부등호를 그냥 칠 수 있다.
// 이걸 서식으로 오판하면 평문이 rich_html로 저장되고, 다시 열 때 에디터가 HTML로 파싱해
// `<b` 뒤가 통째로 사라진다. 그래서 닫는 `>`까지 있어야만 태그로 본다.
assert.equal(hasRichFormatting("a<b 이고 c>d 입니다"), false, "부등호 평문을 태그로 보면 안 된다");
assert.equal(hasRichFormatting("조건: x < y"), false, "꺾쇠 뒤 공백은 태그가 아니다");
assert.equal(hasRichFormatting("5<10"), false, "숫자 비교는 태그가 아니다");
