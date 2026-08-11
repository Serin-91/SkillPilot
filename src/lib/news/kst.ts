const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// UTC로 도는 서버(Vercel 등)에서도 getUTCHours/getUTCMinutes로 KST 벽시계 값을 그대로 읽을 수 있게 offset을 더한 Date.
export function nowKST(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

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

// Cron이 KST 10:10에 돌기 전에는 당일 최초 접속 fallback도 생성하지 않는다 —
// 그 전에 fallback이 먼저 돌면 자정 직후 접속만으로 즉시 생성돼버려 "10:10에 업데이트"라는 취지가 무의미해진다.
export function isPastDailyGenerationTime(): boolean {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes() >= 10 * 60 + 10;
}
