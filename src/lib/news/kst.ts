const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toKSTDateString(date: Date): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

export function todayKSTDateString(): string {
  return toKSTDateString(new Date());
}

// 오늘을 뺀 최근 N일 — 뉴스/채용공고 히스토리(어제, 그저께)에 쓴다. 최신순.
export function recentKSTDateStrings(days: number): string[] {
  return Array.from({ length: days }, (_, i) => toKSTDateString(new Date(Date.now() - (i + 1) * 86400000)));
}
