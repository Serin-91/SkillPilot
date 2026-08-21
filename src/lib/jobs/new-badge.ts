// NEW 배지 판정 한 곳. 예전엔 이 로직이 generate.ts(수집 파이프라인)와 get-jobs.ts(조회)에 나뉘어
// 있었고, 두 곳의 null 처리가 서로 어긋나면서 실제 사고가 났다(2026-08-21) — 아래 두 주석 참고.
// generate.ts는 `@/` 별칭 import가 많아 Node로 단독 실행이 안 되므로, 순수 함수만 별칭 없이
// 여기로 뽑아 new-badge.check.ts가 직접 돌려볼 수 있게 한다.

// ── 동일 포지션 식별 ─────────────────────────────────────────────────────────────────────────
// NEW의 의미는 "이 URL을 처음 봄"이 아니라 "이 채용 포지션을 처음 추천함"이다(18-1절) — 같은 공고가
// 다른 사이트에서 재발견되면 URL이 달라지므로 회사+공고명으로도 과거를 찾는다.
export function normalizeCompany(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사/g, "")
    .replace(/[·•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeJobTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    // 모집 decorator만 제거한다 — AI/Backend/MLOps 같은 의미 토큰은 절대 제거하지 않는다(17-2절).
    .replace(/^\s*\[(?:신입|경력|채용|상시채용)\]\s*/g, "")
    .replace(/[·•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function identityKey(fields: { company: string; title: string }): string {
  return `${normalizeCompany(fields.company)}::${normalizeJobTitle(fields.title)}`;
}

// ── 처음 추천된 날 ───────────────────────────────────────────────────────────────────────────
export type RecommendedBefore = { job_date: string; first_recommended_date: string | null };

// 예전엔 `?.first_recommended_date ?? ... ?? localDate` 체인이었다. 이 컬럼이 생기기 전에 저장된
// row는 값이 null이라 두 단계를 모두 통과해 localDate(오늘)로 떨어졌고, 어제 본 공고가 오늘 다시
// 추천되면 "오늘 처음 추천됨"으로 되살아나 NEW가 붙었다(실제 증상: 추천공고에 어제 본 게 NEW).
// buildPreviousIdentityMap은 같은 상황을 `?? row.job_date`로 보정하고 있었는데 여기만 빠져 있었다.
// 이제 양쪽 모두 job_date를 대체값으로 쓰고, url 매칭과 identity 매칭 중 더 이른 날짜를 택한다.
export function firstRecommendedDateFor(
  fields: { company: string; title: string },
  url: string,
  localDate: string,
  previousByUrl: Map<string, RecommendedBefore>,
  previousByIdentity: Map<string, RecommendedBefore>
): string {
  const seen = [previousByUrl.get(url), previousByIdentity.get(identityKey(fields))]
    .filter((row): row is RecommendedBefore => !!row)
    .map((row) => row.first_recommended_date ?? row.job_date)
    .filter((d): d is string => !!d);
  // 날짜가 yyyy-mm-dd라 사전순 정렬이 곧 시간순이다.
  return seen.length > 0 ? seen.sort()[0] : localDate;
}

// ── 배지를 붙일지 ────────────────────────────────────────────────────────────────────────────
// NEW 배지를 며칠까지 붙일지. 1이면 처음 추천된 그날 하루만.
export const NEW_BADGE_DAYS = 1;

// 예전 판정은 `first_recommended_date === job_date`였다. job_date는 그 공고가 배치에 들어갈 때마다
// 오늘로 갱신되는 값이라 배치 안에서는 얼추 맞았지만 "최근 추천"에서는 완전히 틀렸다 — 거기 뜨는
// 공고는 오늘 배치에 없어서 job_date가 과거에 멈춰 있고, 딱 한 번만 추천된 공고는
// first_recommended_date === job_date가 영원히 참이라 몇 달 뒤에도 NEW가 붙어 있었다
// (실제 증상: 한 계정은 최근 추천 전체에 NEW가 달려 있었다 — 전부 한 번씩만 추천된 공고였다).
// NEW는 "언제 처음 추천됐는가" 하나로만 정한다. job_date는 쓰지 않는다.
export function isNewBadge(firstRecommendedDate: string | null, cutoffDate: string): boolean {
  return firstRecommendedDate !== null && firstRecommendedDate >= cutoffDate;
}
