-- Day3 채용공고 — schema.sql 실행 후 추가로 실행한다.

create unique index saved_job_user_url_key on saved_job (user_id, url);

create table job_refresh_log (
  user_id uuid not null references profiles(user_id) on delete cascade,
  refresh_date date not null,
  count int not null default 0,
  primary key (user_id, refresh_date)
);

alter table job_refresh_log enable row level security;
create policy "own rows only" on job_refresh_log
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
