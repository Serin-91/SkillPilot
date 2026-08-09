-- Day10 추가 — schema.sql, day3~day9_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- 간단 메모(quick) / 상세 메모(document) 작성 모드 구분. memo_type(업무 성격)·content_format(저장 형식)과는 별개 개념이다.
alter table memo add column if not exists content_mode text not null default 'quick'
  check (content_mode in ('quick', 'document'));

-- 기존 레코드 백필 — 지금까지 모든 메모는 항상 content_format='rich_html'로 저장돼왔으므로, 새 기본값
-- 'quick'(plain textarea)으로 그대로 두면 이미 서식이 들어간 기존 본문이 열람/편집 시 그대로 노출된다.
-- content_format이 rich_html인 기존 행만 document로 백필해 열람 화면이 지금과 달라지지 않게 한다.
update memo set content_mode = 'document' where content_format = 'rich_html';
