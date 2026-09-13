// 자체 점검: node --test 없이 그냥 `node src/lib/ai/focus.check.ts`로 돌린다(Node 24 type stripping).
// Today's Focus 우선순위 최종안(기한초과/status 분리, S>A>B, 기한초과 최근 우선)이 깨지면 여기서 바로 터진다.
import assert from "node:assert/strict";
import { buildFocusResult } from "./focus.ts";

const TODAY = "2026-08-11";

function todo(id: string, status: "planned" | "in_progress", endDate: string, opts: Partial<{ isImportant: boolean; startDate: string }> = {}) {
  return {
    id, title: id, status, start_date: opts.startDate ?? "2026-08-01", end_date: endDate,
    is_important: opts.isImportant ?? false, updated_at: "2026-08-01T00:00:00.000Z",
  };
}

// 1. 오늘 마감(S)이 기한초과+예정(A)보다 항상 앞선다 — "모든 기한초과를 무조건 최상위로" 금지
{
  const a = todo("due-today", "planned", "2026-08-11");
  const b = todo("overdue-planned-20", "planned", "2026-07-22");
  const { items } = buildFocusResult([b, a], TODAY);
  assert.equal(items[0].memoId, "due-today");
  assert.equal(items[1].memoId, "overdue-planned-20");
}

// 2. 판정 순서 — 진행중 + 오늘마감은 IN_PROGRESS가 아니라 DUE_TODAY로 분류된다
{
  const c = todo("in-progress-due-today", "in_progress", "2026-08-11");
  const { items } = buildFocusResult([c], TODAY);
  assert.match(items[0].reason, /오늘이 마감일/);
}

// 3. OVERDUE_IN_PROGRESS(S) > IN_PROGRESS(A) > OVERDUE_PLANNED(A) 순서
{
  const overdueInProgress = todo("d", "in_progress", "2026-08-08");
  const generalInProgress = todo("e", "in_progress", "2026-08-16");
  const overduePlanned = todo("f", "planned", "2026-08-08");
  const { items } = buildFocusResult([generalInProgress, overduePlanned, overdueInProgress], TODAY);
  assert.deepEqual(items.map((i) => i.memoId), ["d", "e", "f"]);
}

// 4. 기한초과 그룹 내부는 "최근에 초과된 것" 우선 — 오래 방치된 Todo가 상단을 독점하지 않는다
{
  const recentlyOverdue = todo("g-d1", "in_progress", "2026-08-10"); // D+1
  const longOverdue = todo("h-d20", "in_progress", "2026-07-22"); // D+20
  const { items } = buildFocusResult([longOverdue, recentlyOverdue], TODAY);
  assert.deepEqual(items.map((i) => i.memoId), ["g-d1", "h-d20"]);
}

// 5. is_important는 등급 자체를 뒤집지 않는다 — S등급(안중요)이 B등급(중요)보다 항상 앞선다
{
  const importantButLowGrade = todo("i-important-b", "planned", "2026-08-21", { isImportant: true });
  const unimportantButS = todo("j-plain-s", "planned", "2026-08-11", { isImportant: false });
  const { items } = buildFocusResult([importantButLowGrade, unimportantButS], TODAY);
  assert.equal(items[0].memoId, "j-plain-s");
}

// 6. 최대 3개만 반환
{
  const many = ["k1", "k2", "k3", "k4", "k5"].map((id) => todo(id, "planned", "2026-08-11"));
  assert.equal(buildFocusResult(many, TODAY).items.length, 3);
}

// 7. D-day 라벨 포맷 — meta는 "Todo · {status} · {dday}" 순서를 유지한다
{
  const dueToday = todo("due", "planned", "2026-08-11");
  const overdue = todo("over", "planned", "2026-07-22");
  const { items } = buildFocusResult([overdue, dueToday], TODAY);
  assert.equal(items.find((i) => i.memoId === "due")!.meta, "Todo · 예정 · D-Day");
  assert.equal(items.find((i) => i.memoId === "over")!.meta, "Todo · 예정 · 기한초과 D+20");
}

console.log("focus.check.ts OK");
