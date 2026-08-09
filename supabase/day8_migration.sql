-- Day8 추가 — schema.sql, day3~day7_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.

-- Monthly MEMO 본문을 Markdown-in-textarea에서 Tiptap 기반 리치 텍스트로 전환하면서 추가.
-- content_format: 기존 행은 전부 'plain'(평문)으로 남고, 이후 앱에서 저장하는 모든 새 값은 'rich_html'이다.
-- 문자열 내용을 보고 HTML인지 추측하지 않기 위해 명시적으로 둔다.
alter table memo add column if not exists content_format text not null default 'plain' check (content_format in ('plain', 'rich_html'));
alter table memo add column if not exists emoji text;
