-- Day16 추가 — day15_migration.sql을 이미 실행했는데 이후 day15가 trigger_source/details 컬럼을
-- 포함하도록 수정된 경우를 위한 보정. cron_runs가 그 두 컬럼 없이 이미 만들어져 있으면 이걸 실행한다.
-- (day15를 아직 안 돌렸다면 이 파일은 필요 없음 — day15만 실행하면 됨)
alter table cron_runs add column if not exists trigger_source text not null default 'vercel_cron'
  check (trigger_source in ('vercel_cron', 'fallback', 'manual'));
alter table cron_runs add column if not exists details jsonb;
