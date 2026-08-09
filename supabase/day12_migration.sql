-- Day12 추가 — schema.sql, day3~day11_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- 관심 직무 우선순위(priority). 기존 interested_job_roles 컬럼/제약/의미는 그대로 둔다 —
-- 이 컬럼은 "무엇을 선택했는지"가 아니라 "선택한 것들의 순서"만 담는 별도 컬럼이다.

alter table profiles add column if not exists job_role_priority text[] not null default '{}';
alter table profiles drop constraint if exists profiles_job_role_priority_subset;
alter table profiles add constraint profiles_job_role_priority_subset check (
  job_role_priority <@ interested_job_roles
);
