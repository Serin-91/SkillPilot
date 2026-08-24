// 자체 점검: `node src/lib/memo/rich-text.check.ts` (다른 *.check.ts와 같은 방식, Node 24 type stripping).
// memoPreview는 Key Notes 카드 본문에 쓰이는 캐시다. 캐시가 틀리면 "메모를 수정했는데 카드에는
// 옛 내용이 남는다"는 조용한 버그가 되고, 잘라내기가 틀리면 카드에 안 보이는 본문을 세션 내내
// 메모리에 들고 있게 된다. 둘 다 눈으로는 안 잡히니 여기서 잡는다.
import assert from "node:assert/strict";
import { memoPreview, MEMO_PREVIEW_MAX, htmlToPlainText } from "./rich-text.ts";

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
