-- Day17 추가 — schema.sql, day3~day16_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- Job Description 개편: 추천 순환(신규/재추천 판단)과 Bookmark(스크랩) 기능에 필요한 최소 컬럼만 추가한다.
-- 새 테이블은 만들지 않고 기존 saved_job row를 그대로 재사용한다.

-- 이 URL을 이 사용자에게 처음 추천한 날짜 — NEW 배지 판단 기준(first_recommended_date = job_date일 때만 NEW).
alter table saved_job add column if not exists first_recommended_date date;
-- 기존 행은 처음 추천된 시점을 알 수 없으니 지금까지의 job_date를 최초 추천일로 간주한다.
update saved_job set first_recommended_date = job_date where first_recommended_date is null;

-- Bookmark(스크랩) — 추천 알고리즘과 완전히 분리된, 사용자가 직접 보관하는 상태.
alter table saved_job add column if not exists is_bookmarked boolean not null default false;
alter table saved_job add column if not exists bookmarked_at timestamptz;
