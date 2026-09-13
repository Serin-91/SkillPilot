-- SkillPilot Day1 스키마
-- Supabase SQL Editor에서 그대로 실행한다.

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  mindset text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_article (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  summary text,
  url text not null,
  published_at timestamptz,
  collected_at timestamptz not null default now()
);
create unique index source_article_url_key on source_article (url);

create table briefing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  briefing_date date not null,
  selected_news jsonb not null default '[]',
  generated_at timestamptz not null default now()
);
create unique index briefing_user_date_key on briefing (user_id, briefing_date);

create table briefing_item (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references briefing(id) on delete cascade,
  source_article_id uuid references source_article(id),
  title text not null,
  summary text,
  importance int,
  reason_selected text,
  uncertainty text
);

create table skill (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table briefing_item_skill (
  briefing_item_id uuid not null references briefing_item(id) on delete cascade,
  skill_id uuid not null references skill(id) on delete cascade,
  primary key (briefing_item_id, skill_id)
);

create table saved_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  company text not null,
  title text not null,
  role text,
  url text not null,
  responsibilities text,
  required_text text,
  preferred_text text,
  career_requirement text,
  deadline date,
  posted_at date,
  date_confidence text check (date_confidence in ('high', 'medium', 'low', 'unknown')),
  analysis_result jsonb,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  content text,
  -- Day8 — 기존 행은 'plain'(평문), 이후 앱에서 저장하는 값은 전부 'rich_html'(Tiptap 출력)
  content_format text not null default 'plain' check (content_format in ('plain', 'rich_html')),
  -- Day10 — 간단/상세 작성 모드. content_format(저장 형식)과 별개 개념이다
  content_mode text not null default 'quick' check (content_mode in ('quick', 'document')),
  emoji text,
  memo_type text not null check (memo_type in ('todo', 'dev_note', 'free_note')),
  status text check (status in ('planned', 'in_progress', 'completed')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  is_important boolean not null default false,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  pin_order integer,
  auto_number int,
  is_auto_title boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pinned_requires_important check (not is_pinned or is_important)
);

create table memo_source (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references memo(id) on delete cascade,
  source_type text not null check (source_type in ('news', 'job', 'manual', 'ai_smart_direction')),
  source_id uuid,
  source_title text,
  source_url text,
  selected_text text not null,
  added_at timestamptz not null default now()
);

create table project_idea (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  summary text,
  status text not null,
  content_md text,
  -- Day13 — memo.content_format과 동일 개념. 기존 행은 'plain', 이후 저장값은 전부 'rich_html'(Tiptap 출력)
  content_format text not null default 'plain' check (content_format in ('plain', 'rich_html')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_result (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  feature text not null check (feature in ('focus', 'idea')),
  version int not null,
  result_date date not null,
  input_hash text,
  result_json jsonb not null,
  status text not null check (status in ('processing', 'done', 'error')),
  saved_memo_id uuid references memo(id),
  created_at timestamptz not null default now()
);
create unique index ai_result_processing_guard on ai_result (user_id, feature, result_date)
  where status = 'processing';

-- RLS: 모든 사용자 데이터 테이블은 auth.uid() = user_id 행만 접근 가능

alter table profiles enable row level security;
create policy "own profile" on profiles
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table briefing enable row level security;
create policy "own rows only" on briefing
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table saved_job enable row level security;
create policy "own rows only" on saved_job
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table memo enable row level security;
create policy "own rows only" on memo
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table memo_source enable row level security;
create policy "own rows only" on memo_source
  using (exists (select 1 from memo where memo.id = memo_source.memo_id and memo.user_id = auth.uid()))
  with check (exists (select 1 from memo where memo.id = memo_source.memo_id and memo.user_id = auth.uid()));

alter table project_idea enable row level security;
create policy "own rows only" on project_idea
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table ai_result enable row level security;
create policy "own rows only" on ai_result
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- briefing_item/briefing_item_skill은 briefing을 통해 간접 소유 (조회만 필요, briefing 소유자만 접근)
alter table briefing_item enable row level security;
create policy "own rows only" on briefing_item
  using (exists (select 1 from briefing where briefing.id = briefing_item.briefing_id and briefing.user_id = auth.uid()));

alter table briefing_item_skill enable row level security;
create policy "own rows only" on briefing_item_skill
  using (exists (
    select 1 from briefing_item
    join briefing on briefing.id = briefing_item.briefing_id
    where briefing_item.id = briefing_item_skill.briefing_item_id and briefing.user_id = auth.uid()
  ));

-- source_article, skill은 공용 참고 데이터 — 로그인 사용자면 조회만 허용
alter table source_article enable row level security;
create policy "read for authenticated" on source_article
  for select using (auth.role() = 'authenticated');

alter table skill enable row level security;
create policy "read for authenticated" on skill
  for select using (auth.role() = 'authenticated');
