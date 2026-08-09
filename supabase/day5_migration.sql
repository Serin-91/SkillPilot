-- Day5 추가 — schema.sql, day3/day4_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- 메모지 색상에 화이트/블랙/다크그레이 추가 (day4_migration.sql의 memo_color_check를 교체)
alter table memo drop constraint if exists memo_color_check;
alter table memo add constraint memo_color_check
  check (color in ('yellow', 'pink', 'green', 'blue', 'purple', 'white', 'black', 'darkgray'));

-- 프로젝트 아이디어 상태값을 6종(아이디어/검토 중/기획안 작성/개발 중/완료/보류)으로 정리 — project_idea.status는
-- check 제약이 없는 자유 텍스트라 DDL은 필요 없고, 예전 값("계획"/"폐기")만 새 값으로 옮겨준다.
update project_idea set status = '기획안 작성' where status = '계획';
update project_idea set status = '보류' where status = '폐기';
