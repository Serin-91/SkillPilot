import assert from "node:assert/strict";
import { countBatchFreshness, type BatchRun } from "./batch-stats.ts";

const U1 = "user-1";
const U2 = "user-2";
const mk = (pairs: [string, string, string | null][]) =>
  new Map(pairs.map(([u, url, first]) => [`${u}|${url}`, first]));

// ── ① 2026-09-19 운영 실측 재현 — 두 회원 4건씩, 전부 과거 재추천(신규 0)
//    관리자 화면이 "채용 신규 0건 (전부 과거 재추천 8건)"을 띄운 날이다. 수정 전 값과 같아야 한다.
{
  const runs: BatchRun[] = [
    { job_date: "2026-09-19", user_id: U1, selected_urls: ["a", "b", "c", "d"] },
    { job_date: "2026-09-19", user_id: U2, selected_urls: ["c", "e", "f", "g"] },
  ];
  const first = mk([
    [U1, "a", "2026-08-17"], [U1, "b", "2026-09-02"], [U1, "c", "2026-08-28"], [U1, "d", "2026-09-03"],
    [U2, "c", "2026-08-28"], [U2, "e", "2026-09-07"], [U2, "f", "2026-08-13"], [U2, "g", "2026-09-08"],
  ]);
  const r = countBatchFreshness(runs, first, "2026-09-19");
  assert.deepEqual(r, { total: 8, fresh: 0, reused: 8 }, "① 09-19 신규 0 / 재추천 8");
}

// ── ② 2026-09-21 실측 재현 — 두 회원이 같은 신규 공고 1건씩 + 재추천 3건씩
{
  const runs: BatchRun[] = [
    { job_date: "2026-09-21", user_id: U1, selected_urls: ["new1", "x", "y", "z"] },
    { job_date: "2026-09-21", user_id: U2, selected_urls: ["new1", "x", "p", "q"] },
  ];
  const first = mk([
    [U1, "new1", "2026-09-21"], [U1, "x", "2026-09-03"], [U1, "y", "2026-08-28"], [U1, "z", "2026-08-13"],
    [U2, "new1", "2026-09-21"], [U2, "x", "2026-09-03"], [U2, "p", "2026-08-31"], [U2, "q", "2026-09-01"],
  ]);
  const r = countBatchFreshness(runs, first, "2026-09-21");
  assert.deepEqual(r, { total: 8, fresh: 2, reused: 6 }, "② 09-21 신규 2 / 재추천 6");
}

// ── ③ 🔴 회귀의 핵심 — **나중에 재추천돼도 과거 날짜 집계는 변하지 않는다.**
//    옛 구현은 `saved_job.job_date == date`로 셌는데, 재추천이 그 행의 job_date를 오늘로 갱신하므로
//    과거 배치에서 항목이 통째로 사라졌다. selected_urls는 그날 찍힌 값이라 움직이지 않는다.
{
  const day1: BatchRun[] = [{ job_date: "2026-09-19", user_id: U1, selected_urls: ["a", "b"] }];
  const first = mk([[U1, "a", "2026-09-19"], [U1, "b", "2026-09-10"]]);
  const before = countBatchFreshness(day1, first, "2026-09-19");
  assert.deepEqual(before, { total: 2, fresh: 1, reused: 1 }, "③ 재추천 전 09-19");

  // 9/21에 "a"가 다시 추천된다 → saved_job."a".job_date 는 2026-09-21로 갱신된다.
  // first_recommended_date는 승계되어 그대로 2026-09-19다.
  const withLater: BatchRun[] = [
    ...day1,
    { job_date: "2026-09-21", user_id: U1, selected_urls: ["a", "c"] },
  ];
  const firstAfter = mk([[U1, "a", "2026-09-19"], [U1, "b", "2026-09-10"], [U1, "c", "2026-09-21"]]);

  assert.deepEqual(
    countBatchFreshness(withLater, firstAfter, "2026-09-19"),
    before,
    "③ 🔴 이후 재추천이 과거 날짜(09-19) 집계를 바꾸면 안 된다 — job_date 기준으로 되돌아간 것이다"
  );
  assert.deepEqual(
    countBatchFreshness(withLater, firstAfter, "2026-09-21"),
    { total: 2, fresh: 1, reused: 1 },
    "③ 09-21은 c만 신규(a는 09-19가 최초라 재추천)"
  );
}

// ── ④ 배치가 없는 날은 판정 불가(total 0) — 호출부가 null로 바꿔 "신규 0" problem을 만들지 않는다.
{
  assert.deepEqual(countBatchFreshness([], mk([]), "2026-09-19"), { total: 0, fresh: 0, reused: 0 }, "④ 배치 없음");
  assert.deepEqual(
    countBatchFreshness([{ job_date: "2026-09-19", user_id: U1, selected_urls: null }], mk([]), "2026-09-19"),
    { total: 0, fresh: 0, reused: 0 },
    "④ selected_urls가 null인 실패 배치"
  );
}

// ── ⑤ saved_job 행이 사라진 URL은 세지 않는다. 0으로 세면 "재추천"으로 잘못 잡힌다.
{
  const runs: BatchRun[] = [{ job_date: "2026-09-19", user_id: U1, selected_urls: ["gone", "kept"] }];
  const r = countBatchFreshness(runs, mk([[U1, "kept", "2026-09-19"]]), "2026-09-19");
  assert.deepEqual(r, { total: 1, fresh: 1, reused: 0 }, "⑤ 행이 없는 URL 제외");
}

// ── ⑥ 같은 URL을 두 회원이 가질 때 user_id로 갈라진다. 키에서 user_id를 빼면 여기서 깨진다.
{
  const runs: BatchRun[] = [
    { job_date: "2026-09-19", user_id: U1, selected_urls: ["shared"] },
    { job_date: "2026-09-19", user_id: U2, selected_urls: ["shared"] },
  ];
  const r = countBatchFreshness(runs, mk([[U1, "shared", "2026-09-19"], [U2, "shared", "2026-08-01"]]), "2026-09-19");
  assert.deepEqual(r, { total: 2, fresh: 1, reused: 1 }, "⑥ 회원별로 first_recommended_date가 다르다");
}

// ── ⑦ first_recommended_date가 null인 옛 행(컬럼 도입 전)은 신규가 아니다.
{
  const runs: BatchRun[] = [{ job_date: "2026-09-19", user_id: U1, selected_urls: ["old"] }];
  const r = countBatchFreshness(runs, mk([[U1, "old", null]]), "2026-09-19");
  assert.deepEqual(r, { total: 1, fresh: 0, reused: 1 }, "⑦ null은 재추천으로 센다");
}

console.log("batch-stats.check.ts OK — 신규/재추천 집계 7케이스 (09-19·09-21 실측 재현 + 재추천이 과거를 바꾸지 않음)");
