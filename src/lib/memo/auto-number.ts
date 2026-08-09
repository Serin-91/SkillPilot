// 기획안 6.3절 — 같은 날짜 안에서 메모1, 메모2... 자동 번호, 빈 번호부터 재사용
export const RESERVED_AUTO_TITLE_PATTERN = /^메모\d+$/;

export function getNextMemoNumber(
  memos: Array<{ autoNumber: number | null; isAutoTitle: boolean }>
): number {
  const used = new Set(
    memos.filter((m) => m.isAutoTitle && m.autoNumber !== null).map((m) => m.autoNumber as number)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}
