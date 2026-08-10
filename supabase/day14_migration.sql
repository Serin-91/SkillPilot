-- Day14 추가 — schema.sql, day3~day13_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- 뉴스/채용공고 "지금 업데이트" 수동 버튼의 하루 횟수 제한용 카운터.
-- briefing/saved_job은 재시도할 때마다 지웠다 다시 만들어서 그 행 자체에는 횟수를 못 남긴다 —
-- 그래서 콘텐츠 행과 분리된 별도 카운터 테이블에 (user_id, feature, refresh_date)당 1행만 유지한다.
create table if not exists manual_refresh_log (
  user_id uuid not null references profiles(user_id) on delete cascade,
  feature text not null check (feature in ('briefing', 'jobs')),
  refresh_date date not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, refresh_date)
);
alter table manual_refresh_log enable row level security;
drop policy if exists "own rows only" on manual_refresh_log;
create policy "own rows only" on manual_refresh_log
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
