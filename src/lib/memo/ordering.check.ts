// 자체 점검: `npx tsx src/lib/memo/ordering.check.ts`
//
// 지키는 것: **수동 순서를 날짜가 덮어쓰지 않는다.**
// 2026-09-10에 정확히 이 실수를 되돌렸다 — 52b42b2가 일반 중요 메모를 start_date DESC로 강제
// 정렬해서, 사용자가 드래그로 정해 둔 순서(pin_order 0~10, 실데이터 11건 전부 존재)가
// 다시 열 때마다 날짜순으로 되돌아갔다. 세 번째가 오지 않게 실측 근거를 테스트로 굳힌다.
import assert from "node:assert/strict";
import { compareMemoDefault, comparePriorityMemos, compareByDayOrder } from "@/lib/memo/ordering";
import type { Memo } from "@/lib/memo/types";

let cases = 0;
const m = (p: Partial<Memo> & { id: string }): Memo => {
  cases++;
  return {
    start_date: "2026-09-01", end_date: "2026-09-01", created_at: "2026-09-01T00:00:00Z",
    pin_order: null, is_pinned: false, is_important: true, title: p.id, ...p,
  } as Memo;
};
const ids = (list: Memo[], cmp: (a: Memo, b: Memo) => number) => [...list].sort(cmp).map((x) => x.id).join(" ");

// ── ① 일반 중요 메모: 수동 순서가 최우선 ──────────────────────────────
const manual = [
  m({ id: "c", pin_order: 2, start_date: "2026-09-09" }),
  m({ id: "a", pin_order: 0, start_date: "2026-08-05" }),
  m({ id: "b", pin_order: 1, start_date: "2026-09-02" }),
];
assert.equal(ids(manual, comparePriorityMemos), "a b c",
  "pin_order가 있으면 날짜와 무관하게 그 순서를 지켜야 한다 — 이게 깨지면 드래그가 되돌아간다");

// ② 수동 순서가 없으면 날짜 최신순이 기본값
const fresh = [
  m({ id: "old", start_date: "2026-08-05" }),
  m({ id: "new", start_date: "2026-09-09" }),
  m({ id: "mid", start_date: "2026-09-02" }),
];
assert.equal(ids(fresh, comparePriorityMemos), "new mid old", "수동 순서가 없으면 start_date 최신순");

// ③ 같은 날짜면 created_at 최신순, 그래도 같으면 id로 확정
const sameDay = [
  m({ id: "b2", created_at: "2026-09-01T10:00:00Z" }),
  m({ id: "a1", created_at: "2026-09-01T10:00:00Z" }),
  m({ id: "z9", created_at: "2026-09-01T12:00:00Z" }),
];
assert.equal(ids(sameDay, comparePriorityMemos), "z9 a1 b2", "동률은 created_at DESC → id ASC로 확정");

// ④ 수동 순서가 있는 것과 없는 것이 섞이면, 수동 쪽이 앞이고 나머지는 날짜순으로 뒤에 붙는다
//    (서버 getImportantMemos의 nullsFirst:false와 같은 의미다)
const mixed = [
  m({ id: "newest", start_date: "2026-09-09" }),
  m({ id: "ordered1", pin_order: 1, start_date: "2026-01-01" }),
  m({ id: "older", start_date: "2026-08-01" }),
  m({ id: "ordered0", pin_order: 0, start_date: "2026-02-02" }),
];
assert.equal(ids(mixed, comparePriorityMemos), "ordered0 ordered1 newest older",
  "수동 순서가 최우선이고, 아직 순서가 없는 새 중요 메모만 날짜 최신순으로 뒤에 붙는다");

// ── ⑤ Monthly 기본 순서: start_date ASC → created_at DESC → id ─────────
const monthly = [
  m({ id: "later", start_date: "2026-09-11" }),
  m({ id: "sameB", start_date: "2026-09-10", created_at: "2026-09-01T01:00:00Z" }),
  m({ id: "sameA", start_date: "2026-09-10", created_at: "2026-09-01T09:00:00Z" }),
];
assert.equal(ids(monthly, compareMemoDefault), "sameA sameB later",
  "같은 날짜 안에서 순서가 확정돼야 한다 — DB 반환 순서에 맡기면 새로고침마다 바뀐다");

// ── ⑥ Monthly 날짜별 수동 순서 ────────────────────────────────────────
const day = [m({ id: "A" }), m({ id: "B" }), m({ id: "C" }), m({ id: "D" })];
const d10 = new Map([["C", 0], ["A", 1], ["D", 2], ["B", 3]]);
assert.equal(ids(day, compareByDayOrder(d10)), "C A D B", "그 날짜에 저장된 순서를 그대로 따른다");

// ⑦ **날짜 독립성** — 같은 메모 집합이라도 다른 날짜 맵이면 다른 순서가 나온다
const d11 = new Map([["B", 0], ["C", 1], ["A", 2]]);
assert.equal(ids(day, compareByDayOrder(d11)), "B C A D",
  "한 날짜의 순서가 다른 날짜를 강제하면 안 된다 — 기간 메모가 여러 날에 걸릴 때의 핵심 계약");

// ⑧ 순서가 없는 메모(새로 생긴 것)는 뒤에 기본 순서로 붙는다
assert.equal(ids(day, compareByDayOrder(new Map([["D", 0]]))), "D A B C",
  "저장된 순서가 없는 메모는 fallback 기본 순서로 뒤에 붙는다(DB 반환 순서 아님)");

// ⑨ 빈 맵이면 전부 기본 순서 — 마이그레이션 전/드래그 안 한 날짜의 동작
assert.equal(ids(monthly, compareByDayOrder(new Map())), ids(monthly, compareMemoDefault),
  "저장된 날짜 순서가 하나도 없으면 기본 순서와 완전히 같아야 한다(graceful fallback)");

console.log(`ordering.check.ts OK — 메모 ${cases}건으로 9가지 정렬 계약 확인 (수동순서 우선 / 날짜 fallback / 날짜별 독립)`);
