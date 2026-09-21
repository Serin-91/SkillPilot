// 그날 배치의 신규/재추천 집계. 관리자 System Status의 "Job 신규 / 재추천" 줄이 쓴다.
//
// 🔴 정본은 `daily_jobs_run.selected_urls`다(PRD "현재 batch URL은 daily_jobs_run.selected_urls를
// 기준으로 합니다"). `saved_job.job_date`로 세면 안 된다 — 재추천 때 그 행의 job_date가 오늘로
// **갱신**되므로(unique key: user_id,url) 과거 날짜를 조회하면 이후 재추천된 항목이 빠져
// 통계가 소급해서 바뀐다. Data Model 문서와 Feature "회귀 위험"이 이미 금지하던 사용법이다.
//
// admin-status.ts는 `"use server"`라 async 함수 말고는 export할 수 없어서(→ data-server.md)
// 검사 가능한 순수 함수를 여기 둔다.

export type BatchRun = { job_date: string; user_id: string; selected_urls: string[] | null };

export type BatchFreshness = {
  /** 배치에 든 공고 수. saved_job 행을 못 찾은 URL은 세지 않는다. */
  total: number;
  /** 그날 처음 추천된 수(first_recommended_date == date). */
  fresh: number;
  /** total - fresh. */
  reused: number;
};

/**
 * @param firstRecommendedByKey `${user_id}|${url}` → first_recommended_date.
 *   같은 URL을 여러 회원이 각자 행으로 갖기 때문에 user_id가 키에 반드시 들어간다.
 */
export function countBatchFreshness(
  runs: readonly BatchRun[],
  firstRecommendedByKey: ReadonlyMap<string, string | null>,
  date: string
): BatchFreshness {
  let total = 0;
  let fresh = 0;
  for (const run of runs) {
    if (run.job_date !== date) continue;
    for (const url of run.selected_urls ?? []) {
      const first = firstRecommendedByKey.get(`${run.user_id}|${url}`);
      if (first === undefined) continue; // saved_job 행이 사라진 URL — 셀 근거가 없다
      total += 1;
      if (first === date) fresh += 1;
    }
  }
  return { total, fresh, reused: total - fresh };
}
