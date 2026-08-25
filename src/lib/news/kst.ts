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

// vercel.json의 cron 예약 시각(KST 10:10 = UTC 01:10)과 맞춰둔 값. 한쪽만 바꾸면 어긋난다.
const CRON_SCHEDULED_MIN = 10 * 60 + 10;

// "지금 업데이트" 버튼 / "업데이트 지연" 배지 노출 기준.
//
// Vercel Cron은 정시 실행을 보장하지 않는다 — Hobby 플랜은 예약 시각으로부터 최대 한 시간 안에
// 트리거된다. 그래서 이 기준은 "예약 시각 + 실제로 끝날 수 있는 최악의 시각"보다 뒤여야 한다.
//
//   예약 트리거   10:10
//   최악 트리거   11:10  (+60분, Hobby 지연 상한)
//   생성 소요     수 분  (회원별로 웹 검색·파싱을 하므로. 실측 2026-08-24: 11:04·11:05 완료)
//   → 최악 완료   약 11:15
//
// 한때 11:01이었는데 그건 최악 트리거 시각보다도 이전이라, 크론이 정상 대기 중인 구간을
// "지연"으로 표시했다(2026-08-24: 11:04·11:05 정상 완료인데 11:01부터 지연 배지가 떴다).
// 11:30이면 최악 완료보다 15분 여유가 있고, 진짜 실패는 그 시점에 바로 드러난다.
const MANUAL_REFRESH_MIN = 11 * 60 + 30;

function kstMinutesNow(): number {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

// Cron이 돌기 전에는 당일 최초 접속 fallback도 생성하지 않는다 — 그 전에 fallback이 먼저 돌면
// 자정 직후 접속만으로 즉시 생성돼버려 "10:10에 업데이트"라는 취지가 무의미해진다.
export function isPastDailyGenerationTime(): boolean {
  return kstMinutesNow() >= CRON_SCHEDULED_MIN;
}

// 오늘 예약 시각(KST 10:10)의 UTC ISO. "이 배치가 크론이 만든 건가"를 가르는 기준선이다 —
// 이보다 이른 generated_at은 크론이 만들 수 없는 값이므로 수동("지금 업데이트")이나 이른 접속이다.
// 관리자가 새벽에 수동으로 테스트하면 오늘 daily_jobs_run에 success 행이 생기고, 그러면 아침
// 크론이 guard에 걸려 채용을 전원 스킵한다 — 실제로 2026-08-25에 01:36/01:38 배치가 그날 하루를
// 통째로 차지했다. 크론은 이 기준선보다 이른 행을 자기 것이 아닌 것으로 보고 갈아엎는다.
// 크론 자신이 만든 행은 항상 이 시각 이후이므로 같은 날 재실행에도 멱등이다.
// 그 타임스탬프가 "예약 시각 전"인지 — 날짜와 무관하게 KST 벽시계 시·분만 본다. 관리자 페이지가
// 과거 날짜 행에도 같은 판정을 쓸 수 있게 dailyGenerationCutoffISO와 CRON_SCHEDULED_MIN을 공유한다.
export function isBeforeDailyGenerationTime(iso: string): boolean {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes() < CRON_SCHEDULED_MIN;
}

export function dailyGenerationCutoffISO(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  kst.setUTCHours(0, CRON_SCHEDULED_MIN, 0, 0); // KST 벽시계 00:00 + 예약 분 = 예약 시각
  return new Date(kst.getTime() - KST_OFFSET_MS).toISOString();
}

// 클라이언트(Dashboard.tsx)에서도 이 함수로 같은 기준을 써서 서버 판정과 어긋나지 않게 한다.
export function isPastManualRefreshWindow(): boolean {
  return kstMinutesNow() >= MANUAL_REFRESH_MIN;
}
