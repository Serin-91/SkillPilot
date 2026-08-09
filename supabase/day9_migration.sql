-- Day9 추가 — schema.sql, day3~day8_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- 프로젝트 상태를 4종(아이디어/기획안작성/개발중/완료)으로 최종 확정 — 검토중/보류 제거, 공백 혼용 정리.
-- project_idea.status는 check 제약이 없는 자유 텍스트라 DDL은 필요 없고, 기존 값만 새 값으로 옮겨준다.
-- 삭제가 아니라 매핑이다: 검토 중/보류 → 아이디어로 보존한다.
update project_idea set status = '아이디어' where status = '검토 중';
update project_idea set status = '아이디어' where status = '보류';
update project_idea set status = '기획안작성' where status = '기획안 작성';
update project_idea set status = '개발중' where status = '개발 중';
