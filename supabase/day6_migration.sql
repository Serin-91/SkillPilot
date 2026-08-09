-- Day6 추가 — schema.sql, day3~day5_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- AI Trend Brief — 오늘 선정된 뉴스를 4개 카테고리로 재분석한 결과를 briefing 행에 함께 저장한다(News와 동일한 1일 1회 캐시 재사용).
alter table briefing add column if not exists trend_brief jsonb;
