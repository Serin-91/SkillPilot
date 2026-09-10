// 자체 점검: `npx tsx src/lib/memo/ordering.check.ts`
//
// 지키는 것: **수동 순서를 날짜가 덮어쓰지 않는다.**
// 2026-09-10에 정확히 이 실수를 되돌렸다 — 52b42b2가 일반 중요 메모를 start_date DESC로 강제
// 정렬해서, 사용자가 드래그로 정해 둔 순서(pin_order 0~10, 실데이터 11건 전부 존재)가
// 다시 열 때마다 날짜순으로 되돌아갔다. 세 번째가 오지 않게 실측 근거를 테스트로 굳힌다.
import assert from "node:assert/strict";
import { compareMemoDefault, comparePriorityMemos, compareByDayOrder, orderPriorityMemos } from "@/lib/memo/ordering";
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

// ④ 수동 순서가 있는 것과 없는 것이 섞이면 — **표시 순서**는 새 메모를 날짜 자리에 끼워 넣는다.
//    🔴 2026-09-10 계약 변경: 예전에는 새 중요 메모가 수동 블록 **뒤에** 통째로 붙어서,
//    수동 순서를 한 번이라도 만진 사용자는 새로 ★를 켤 때마다 그게 맨 뒤로 갔다(실데이터 재현:
//    "메모색상?" start_date 2026-09-10이 전체에서 가장 최신인데 12건 중 11번째였다).
//    수동끼리의 상대 순서는 그대로 두므로 2584097이 되돌린 "전체 강제 날짜정렬"과 다르다.
const mixed = [
  m({ id: "newest", start_date: "2026-09-09" }),
  m({ id: "ordered1", pin_order: 1, start_date: "2026-01-01" }),
  m({ id: "older", start_date: "2026-08-01" }),
  m({ id: "ordered0", pin_order: 0, start_date: "2026-02-02" }),
];
assert.equal(orderPriorityMemos(mixed).map((x) => x.id).join(" "), "newest older ordered0 ordered1",
  "새 중요 메모는 날짜에 맞는 자리에 들어간다 — 수동 블록 뒤로 밀려나지 않는다");
assert.equal(
  orderPriorityMemos(mixed).filter((x) => x.pin_order !== null).map((x) => x.id).join(" "),
  "ordered0 ordered1",
  "🔴 수동 메모끼리의 상대 순서는 어떤 경우에도 바뀌지 않는다 — 이게 깨지면 52b42b2 재발이다");

// ④-1 실데이터 재현(운영 DB 2026-09-10): 수동 pin_order 1~10 + 새 중요 2건.
//     새로 ★를 켠 "메모색상?"(09-10, 전체 최신)이 예전 계약에서는 11번째였다.
const real = [
  m({ id: "p1", pin_order: 1, start_date: "2026-09-09" }), m({ id: "p2", pin_order: 2, start_date: "2026-09-02" }),
  m({ id: "p3", pin_order: 3, start_date: "2026-09-08" }), m({ id: "p4", pin_order: 4, start_date: "2026-09-02" }),
  m({ id: "p5", pin_order: 5, start_date: "2026-09-02" }), m({ id: "p6", pin_order: 6, start_date: "2026-09-02" }),
  m({ id: "p7", pin_order: 7, start_date: "2026-08-30" }), m({ id: "p8", pin_order: 8, start_date: "2026-08-13" }),
  m({ id: "p9", pin_order: 9, start_date: "2026-08-10" }), m({ id: "p10", pin_order: 10, start_date: "2026-08-05" }),
  m({ id: "새색상", start_date: "2026-09-10" }), m({ id: "휴일", start_date: "2026-08-15" }),
];
assert.equal(comparePriorityMemos(real[10], real[0]), 1, "옛 계약에서는 최신 새 메모가 수동 메모보다 뒤였다(재현)");
assert.equal(orderPriorityMemos(real).map((x) => x.id).join(" "),
  "새색상 p1 p2 p3 p4 p5 p6 p7 휴일 p8 p9 p10",
  "가장 최신인 새 메모는 맨 앞, 08-15짜리는 08-30과 08-13 사이 — 수동 1~10 순서는 그대로");

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

// ── ⑩ Dashboard TODAY — 오늘 날짜의 memo_day_order를 **읽기 전용으로 재사용**한다 ──────
//    Monthly에서 C A B D로 저장했으면 TODAY 앞 3건은 C A B다(카드가 slice(0,3)만 그린다).
//    🔴 TODAY 전용 순서 컬럼/테이블을 만들지 않는다는 계약이 이 케이스로 고정된다.
const important = (a: Memo, b: Memo) => Number(b.is_important) - Number(a.is_important);
const todaySet = [
  m({ id: "A", is_important: true }), m({ id: "B", is_important: false }),
  m({ id: "C", is_important: false }), m({ id: "D", is_important: false }),
];
const savedToday = new Map([["C", 0], ["A", 1], ["B", 2], ["D", 3]]);
assert.equal(ids(todaySet, compareByDayOrder(savedToday, important)), "C A B D",
  "TODAY는 오늘 날짜의 수동 순서를 그대로 따른다 — 중요(★) 여부가 그 순서를 앞지르면 안 된다");
assert.equal(ids(todaySet, compareByDayOrder(savedToday, important)).split(" ").slice(0, 3).join(" "), "C A B",
  "카드에 보이는 앞 3건이 Monthly에서 저장한 순서와 같아야 한다(사용자 요구 그대로)");

// ⑪ 순서가 없으면 TODAY는 **기존 기본값(중요 우선)**을 유지한다 — Monthly 기본값으로 바뀌면 안 된다.
//    음성 대조: 같은 집합을 기본 fallback으로 정렬하면 결과가 달라야 한다(fallback이 실제로 쓰인다는 증거).
assert.equal(ids(todaySet, compareByDayOrder(new Map(), important)), "A B C D",
  "저장된 순서가 없으면 TODAY는 중요 메모를 앞에 두는 기존 기본 순서를 유지한다");
assert.notEqual(
  ids([m({ id: "P", is_important: false, created_at: "2026-09-02T00:00:00Z" }), m({ id: "Q", is_important: true, created_at: "2026-09-01T00:00:00Z" })], compareByDayOrder(new Map(), important)),
  ids([m({ id: "P", is_important: false, created_at: "2026-09-02T00:00:00Z" }), m({ id: "Q", is_important: true, created_at: "2026-09-01T00:00:00Z" })], compareByDayOrder(new Map())),
  "fallback 인자가 실제로 쓰이는지 — 기본 fallback과 결과가 같으면 인자가 무시되고 있는 것이다");

console.log(`ordering.check.ts OK — 메모 ${cases}건으로 13가지 정렬 계약 확인 (수동순서 보존 / 새 중요메모 날짜 삽입 / 날짜별 독립 / TODAY 재사용)`);
