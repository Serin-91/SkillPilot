// 메모 정렬 규칙 — 순수 함수만 둔다(테스트: ordering.check.ts).
//
// 🔴 세 정렬은 **서로 독립이다.** 한 화면의 순서가 다른 화면을 바꾸면 안 된다.
//   ① Key Notes 고정(Pin)      — 서버 getImportantMemos가 정한 순서를 **그대로 쓴다**(여기 없다).
//   ② Key Notes 일반 중요 메모 — comparePriorityMemos (memo.pin_order)
//   ③ Monthly 하단 날짜별 목록 — compareByDayOrder (memo_day_order 테이블)
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

// Monthly 하단 목록 — 그 **날짜에** 저장된 수동 순서가 최우선, 없으면 기본 순서.
// order는 memo_day_order에서 읽은 `memo_id → sort_order` 맵이며 날짜마다 별개다.
export function compareByDayOrder(order: ReadonlyMap<string, number>) {
  return (a: Memo, b: Memo): number => {
    const ao = order.get(a.id), bo = order.get(b.id);
    if (ao !== undefined && bo !== undefined) return ao - bo || a.id.localeCompare(b.id);
    if (ao !== undefined) return -1;
    if (bo !== undefined) return 1;
    return compareMemoDefault(a, b);
  };
}
