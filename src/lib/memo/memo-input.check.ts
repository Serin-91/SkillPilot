import assert from "node:assert/strict";
import { buildMemoInput } from "./memo-input";
import { hasRichFormatting } from "./rich-text";

// `buildMemoInput()`이 **합치기 전 세 벌과 같은 값**을 내는지 고정한다.
// 아래 `legacy*`는 2026-09-12 이전 HEAD(795ffc1)의 세 payload를 **그대로 옮겨 적은 것**이다 —
// 이 파일을 고쳐서 통과시키지 마라. 어긋나면 `buildMemoInput`이 계약을 깬 것이다.

type Form = {
  formTitle: string; body: string;
  formContentMode: "quick" | "document";
  formEmoji: string | null;
  formType: "todo" | "dev_note" | "free_note";
  formStatus: "planned" | "in_progress" | "completed";
  formStartDate: string; formEndDate: string;
  formColor: "yellow" | "pink" | "green" | "blue" | "purple" | "white" | "black" | "darkgray";
  formImportant: boolean;
};

// 훅의 contentFormatFor와 같은 식(원본 그대로).
const contentFormatFor = (f: Form, body: string) =>
  f.formContentMode === "document" || hasRichFormatting(body) ? "rich_html" : "plain";

// ① handlePostitBack / ② handleMemoDialogBack — body를 한 번 읽어 재사용하던 원본
const legacyBackHandler = (f: Form) => ({
  title: f.formTitle,
  content: f.body,
  content_format: contentFormatFor(f, f.body),
  content_mode: f.formContentMode,
  emoji: f.formEmoji,
  memo_type: f.formType,
  status: f.formType === "todo" ? f.formStatus : null,
  start_date: f.formStartDate,
  end_date: f.formEndDate,
  color: f.formColor,
  is_important: f.formImportant,
});

// ③ handleSaveMemo — readFormBody()를 두 번 부르던 원본(동기 ref 읽기라 값은 같다)
const legacySaveMemo = (f: Form) => ({
  title: f.formTitle,
  content: f.body,
  content_format: contentFormatFor(f, f.body),
  content_mode: f.formContentMode,
  emoji: f.formEmoji,
  memo_type: f.formType,
  status: f.formType === "todo" ? f.formStatus : null,
  start_date: f.formStartDate,
  end_date: f.formEndDate,
  color: f.formColor,
  is_important: f.formImportant,
});

const call = (f: Form) => buildMemoInput({
  title: f.formTitle, body: f.body, contentMode: f.formContentMode, emoji: f.formEmoji,
  memoType: f.formType, status: f.formStatus,
  startDate: f.formStartDate, endDate: f.formEndDate,
  color: f.formColor, isImportant: f.formImportant,
});

const base: Form = {
  formTitle: "제목", body: "<p>본문</p>", formContentMode: "quick", formEmoji: null,
  formType: "free_note", formStatus: "planned",
  formStartDate: "2026-09-12", formEndDate: "2026-09-12",
  formColor: "yellow", formImportant: false,
};

const cases: Form[] = [
  base,
  // todo → status 유지
  { ...base, formType: "todo", formStatus: "in_progress" },
  // todo 아님 + status가 남아 있어도 null로 내려야 한다(세 호출부 공통 규칙)
  { ...base, formType: "dev_note", formStatus: "completed" },
  { ...base, formType: "free_note", formStatus: "completed" },
  // document 모드는 본문 모양과 무관하게 rich_html
  { ...base, formContentMode: "document", body: "그냥 텍스트" },
  // quick 모드 + 리치 태그 → rich_html
  { ...base, formContentMode: "quick", body: "<ul><li>항목</li></ul>" },
  // quick 모드 + p/br만 → plain
  { ...base, formContentMode: "quick", body: "<p>한 줄</p><br>" },
  { ...base, formContentMode: "quick", body: "" },
  // 나머지 필드 변형
  { ...base, formEmoji: "🔥", formColor: "black", formImportant: true },
  { ...base, formTitle: "", formStartDate: "2026-01-01", formEndDate: "2026-12-31" },
];

const FIELDS = [
  "title", "content", "content_format", "content_mode", "emoji",
  "memo_type", "status", "start_date", "end_date", "color", "is_important",
] as const;

for (const [i, f] of cases.entries()) {
  const got = call(f) as Record<string, unknown>;
  const a = legacyBackHandler(f) as Record<string, unknown>;
  const b = legacySaveMemo(f) as Record<string, unknown>;
  assert.deepEqual(got, a, `case ${i}: handlePostitBack/handleMemoDialogBack 원본과 다르다`);
  assert.deepEqual(got, b, `case ${i}: handleSaveMemo 원본과 다르다`);
  // 필드 수·이름까지 고정한다 — 하나가 빠지거나 늘면 DB input shape가 바뀐 것이다.
  assert.deepEqual(Object.keys(got).sort(), [...FIELDS].sort(), `case ${i}: 필드 집합이 11/11이 아니다`);
}

// 음성 대조 — 이 검사가 실제로 차이를 잡는지 도구 자신을 검사한다.
// (CLAUDE.md: "0이 나와야 한다" 검사에는 음성 대조를 같은 블록에 박아라)
{
  const todo: Form = { ...base, formType: "todo", formStatus: "completed" };
  const notTodo: Form = { ...todo, formType: "free_note" };
  assert.equal(call(todo).status, "completed");
  assert.equal(call(notTodo).status, null, "todo가 아니면 status는 null이어야 한다");
  assert.notDeepEqual(call(todo), call(notTodo), "검사가 차이를 못 잡고 있다");
}

console.log(`memo-input.check.ts OK — buildMemoInput 11/11 필드 × ${cases.length}케이스, 원본 3벌과 동일 + todo 규칙 음성대조`);
