-- Day7 추가 — schema.sql, day3~day6_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- Key Notes 고정 메모(Pin) 끼리의 수동 정렬 순서. pinned_at은 "고정된 시각" 의미를 그대로 유지하고,
-- 드래그로 바꾼 순서는 이 컬럼에 따로 저장한다.
alter table memo add column if not exists pin_order integer;
