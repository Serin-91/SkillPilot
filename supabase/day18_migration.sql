-- Day18 추가 — schema.sql, day3~day17_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- Job Description 최종 수정: daily_jobs_run에 시도 상태(status/last_attempt_at)와 정상 배치의 정확한
-- 4개 URL(selected_urls)을 남긴다. day17에서 추가한 saved_job.is_bookmarked/bookmarked_at은 이번
-- 작업에서 사용자 Bookmark 기능 자체를 제거하면서 앱 코드 참조만 없앴다 — 컬럼은 기술부채로 그대로 둔다
-- (운영 데이터를 건드리는 destructive drop을 UI 되돌리기 작업에 억지로 섞지 않는다).

alter table daily_jobs_run
  add column if not exists status text,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists selected_urls text[];

-- 기존 row(이 컬럼들이 생기기 전에 만들어진 성공/실패 기록) 백필 — job_count로 상태를 역산한다.
update daily_jobs_run
set status = case
  when job_count >= 4 then 'success'
  when job_count > 0 then 'partial'
  else 'failed'
end
where status is null;

update daily_jobs_run
set last_attempt_at = coalesce(last_attempt_at, generated_at)
where last_attempt_at is null;

alter table daily_jobs_run
  alter column status set default 'success',
  alter column status set not null;

alter table daily_jobs_run
  drop constraint if exists daily_jobs_run_status_check;
alter table daily_jobs_run
  add constraint daily_jobs_run_status_check check (status in ('processing', 'success', 'partial', 'failed'));
