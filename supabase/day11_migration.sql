-- Day11 추가 — schema.sql, day3~day10_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- 관심 직무 개인화(회원가입+로그인 지시서 JOB_INTEREST_SPEC / JOB_RECOMMENDATION_POLICY)

-- 1) 관심 직무 — 기존 profiles를 확장한다. 값은 4개 slug만, 저장은 UI label이 아니라 slug.
alter table profiles add column if not exists interested_job_roles text[] not null default '{}';
alter table profiles drop constraint if exists profiles_interested_job_roles_valid;
alter table profiles add constraint profiles_interested_job_roles_valid check (
  interested_job_roles <@ array['backend','frontend','ai_ml','data_engineer']::text[]
  and array_length(interested_job_roles, 1) is distinct from 0
);

-- 2) 공고가 어떤 관심 직무로 뽑혔는지 추적 — 배분(4 / 2+2 / 2+1+1 / 1+1+1+1) 검증용
alter table saved_job add column if not exists matched_role text
  check (matched_role in ('backend','frontend','ai_ml','data_engineer'));
alter table saved_job add column if not exists job_date date;

-- 3) (user_id, local_date) 중복 생성 guard — 예약 생성과 최초 접속 fallback이 같은 날 두 번 돌지 않게 한다.
--    결과 0건도 정상 상태로 캐시되어야 하므로 saved_job이 아니라 별도 행으로 남긴다.
create table if not exists daily_jobs_run (
  user_id uuid not null references profiles(user_id) on delete cascade,
  job_date date not null,
  role_snapshot text[] not null,
  job_count int not null default 0,
  generated_at timestamptz not null default now(),
  primary key (user_id, job_date)
);
alter table daily_jobs_run enable row level security;
drop policy if exists "own rows only" on daily_jobs_run;
create policy "own rows only" on daily_jobs_run
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) 수동 새로고침 폐기 — job_refresh_log는 더 이상 읽지도 쓰지도 않는다.
drop table if exists job_refresh_log;
