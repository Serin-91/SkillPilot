-- Day4 추가 필드 — schema.sql, day3_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- 채용공고 출처 사이트 표시용 (원티드/점핏/사람인)
alter table saved_job add column source_site text;

-- Monthly MEMO 포스트잇 색상 선택 기능
alter table memo add column color text not null default 'yellow'
  check (color in ('yellow', 'pink', 'green', 'blue', 'purple'));
