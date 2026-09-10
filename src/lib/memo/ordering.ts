// 메모 정렬 규칙 — 순수 함수만 둔다(테스트: ordering.check.ts).
//
// 🔴 세 정렬은 **서로 독립이다.** 한 화면의 순서가 다른 화면을 바꾸면 안 된다.
//   ① Key Notes 고정(Pin)      — 서버 getImportantMemos가 정한 순서를 **그대로 쓴다**(여기 없다).
//   ② Key Notes 일반 중요 메모 — orderPriorityMemos (memo.pin_order + 새 메모는 날짜로 삽입)
//   ③ Monthly 하단 날짜별 목록 — compareByDayOrder (memo_day_order 테이블)
//      ③의 순서는 Dashboard TODAY도 **읽기 전용으로 재사용**한다(오늘 날짜 한정, 쓰기는 Monthly만).
//
// 🔴 ①을 여기로 들이지 마라. Pin 순서의 정본은 서버 쿼리 하나이고, 클라이언트가 같은 규칙을
//   복제하면 계약이 두 벌이 되어 한쪽만 바뀐다. Pin은 서버가 준 배열을 filter만 해서 쓴다.

import type { Memo } from "./types";

// 같은 start_date 메모끼리의 기본 순서. DB 반환 순서에 맡기면 새로고침마다 뒤바뀐다
// (OPEN-MONTHLY-TIE-ORDER). 기간/월 grouping 규칙인 start_date 오름차순은 그대로 두고
// 그 **안쪽만** 확정한다.
export function compareMemoDefault(a: Memo, b: Memo): number {
  return a.start_date.localeCompare(b.start_date)
    || b.created_at.localeCompare(a.created_at)
    || a.id.localeCompare(b.id);
}

// Key Notes 일반 중요 메모 — 사용자가 드래그로 정한 수동 순서(pin_order)가 **최우선**이고,
// 아직 수동 순서가 없는 메모만 메모 날짜(start_date) 최신순으로 기본 배치한다.
// 🔴 날짜순은 "강제 정렬"이 아니라 사용자가 순서를 정하기 전의 기본값이다 — 수동 순서를
//   날짜로 덮어쓰면 드래그가 새로고침마다 되돌아간다(52b42b2가 그랬다).
export function comparePriorityMemos(a: Memo, b: Memo): number {
  const ao = a.pin_order, bo = b.pin_order;
  if (ao !== null && bo !== null) return ao - bo || a.id.localeCompare(b.id);
  if (ao !== null) return -1;
  if (bo !== null) return 1;
  return b.start_date.localeCompare(a.start_date)
    || b.created_at.localeCompare(a.created_at)
    || a.id.localeCompare(b.id);
}

// Key Notes 일반 중요 메모의 **화면 순서**. comparePriorityMemos가 "수동 블록 전부 → 새 메모 전부"로
// 두 덩어리를 잇는 것과 달리, 새 메모(pin_order = null)를 **날짜에 맞는 자리로 끼워 넣는다.**
//
// 🔴 왜 비교 함수가 아니라 merge인가: "기존 수동 순서의 상대적 순서는 그대로 두고 새 것만 날짜로
//   배치"는 pairwise 비교로 표현할 수 없다(수동 a<b인데 새 n이 둘 사이에 오면 이행성이 깨진다).
//   그래서 **표시 순서(여기)와 저장된 수동 순서(memo.pin_order)를 분리**한다.
// 🔴 DB를 건드리지 않는다. pin_order를 다시 매기지도, 일괄 정렬로 덮지도 않는다 —
//   2584097이 되돌린 실패가 정확히 "전체를 start_date DESC로 강제 정렬"이었다.
//   수동 메모들끼리의 상대 순서는 여기서 **한 번도 바뀌지 않는다**(아래 filter+sort가 pin_order만 본다).
export function orderPriorityMemos(memos: readonly Memo[]): Memo[] {
  const placed = memos.filter((m) => m.pin_order !== null).sort(comparePriorityMemos);
  const fresh = memos.filter((m) => m.pin_order === null).sort(comparePriorityMemos);
  for (const m of fresh) {
    // 자기보다 날짜가 오래된 **수동** 메모 앞에 선다. 기준을 수동 메모로만 잡아야
    // 먼저 끼워 넣은 새 메모(=더 최신)를 앞지르지 않는다.
    const at = placed.findIndex((x) => x.pin_order !== null && x.start_date < m.start_date);
    placed.splice(at === -1 ? placed.length : at, 0, m);
  }
  return placed;
}

// Monthly 하단 목록 — 그 **날짜에** 저장된 수동 순서가 최우선, 없으면 기본 순서.
// order는 memo_day_order에서 읽은 `memo_id → sort_order` 맵이며 날짜마다 별개다.
//
// 🔴 fallback은 "그 화면이 순서를 정하기 전에 쓰던 기본값"이다. Dashboard TODAY가 오늘 날짜의
//   같은 순서를 재사용하되(읽기 전용) 순서 없는 메모는 자기 기본값(중요 우선)을 유지해야 해서
//   인자로 받는다. 🔴 여기서 갈라 두 벌을 만들지 마라 — merge 규칙은 이 함수 하나다.
export function compareByDayOrder(
  order: ReadonlyMap<string, number>,
  fallback: (a: Memo, b: Memo) => number = compareMemoDefault,
) {
  return (a: Memo, b: Memo): number => {
    const ao = order.get(a.id), bo = order.get(b.id);
    if (ao !== undefined && bo !== undefined) return ao - bo || a.id.localeCompare(b.id);
    if (ao !== undefined) return -1;
    if (bo !== undefined) return 1;
    return fallback(a, b);
  };
}
