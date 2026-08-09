-- Day13 추가 — schema.sql, day3~day12_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- project_idea 본문도 Monthly MEMO(day8)와 동일하게 MemoRichEditor(Tiptap)로 저장된다.
-- 기존 행은 전부 'plain'(평문/구 Markdown)으로 남고, 이후 앱에서 저장하는 모든 새 값은 'rich_html'이다.
-- 문자열 내용을 보고 HTML인지 추측하지 않기 위해 명시적으로 둔다.
alter table project_idea add column if not exists content_format text not null default 'plain' check (content_format in ('plain', 'rich_html'));
