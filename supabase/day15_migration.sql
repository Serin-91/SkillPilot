-- Day15 추가 — schema.sql, day3~day14_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- Vercel Cron(/api/cron/briefing)이 실제로 실행됐는지, 실패했다면 왜 실패했는지 나중에 조회하기 위한 기록.
-- 서버(관리자 클라이언트)만 쓰는 내부 운영 테이블이라 RLS는 켜두되 별도 정책은 두지 않는다(서비스 롤만 접근).
create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('started', 'success', 'failed')),
  trigger_source text not null default 'vercel_cron' check (trigger_source in ('vercel_cron', 'fallback', 'manual')),
  error_message text,
  details jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cron_runs enable row level security;
