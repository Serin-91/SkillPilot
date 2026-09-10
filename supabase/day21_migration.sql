-- Day21 추가 — schema.sql, day3~day20_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- Monthly MEMO 상세 **하단 목록의 날짜별 수동 순서** 저장.
--
-- 왜 memo에 컬럼 하나로 안 되나:
--   기간 메모(start_date ~ end_date)는 여러 날짜의 하단 목록에 **동시에** 나타난다. 순서를 memo
--   row 하나에 저장하면 9/10에서 바꾼 순서가 9/11 목록까지 강제로 바꾼다. 제품 계약은
--   "그 당일 목록에서만 순서를 바꾼다"이므로 (사용자, 날짜, 메모) 3원 키가 필요하다.
--
-- 🔴 Key Notes의 memo.pin_order와 **완전히 독립**이다. 서로 읽지도 쓰지도 않는다.
--   Monthly 순서를 pin_order에 얹으면 Key Notes 순서가 같이 바뀐다.
--
-- 기존 데이터 영향 0 — 새 테이블만 만든다. 순서 행이 없는 날짜/메모는 애플리케이션이
-- 기본 정렬(start_date ASC → created_at DESC → id)로 물러난다.

create table if not exists memo_day_order (
  user_id    uuid not null references profiles(user_id) on delete cascade,
  day        date not null,
  memo_id    uuid not null references memo(id) on delete cascade,
  sort_order int  not null,
  updated_at timestamptz not null default now(),
  -- (user_id, day, memo_id) 유일성 = 한 사용자의 한 날짜에 같은 메모가 두 순서를 가질 수 없다
  primary key (user_id, day, memo_id)
);

-- 하단 목록은 항상 "내 것 + 그 날짜"로만 읽는다
create index if not exists memo_day_order_user_day_idx
  on memo_day_order (user_id, day, sort_order);

alter table memo_day_order enable row level security;
drop policy if exists "own rows only" on memo_day_order;
create policy "own rows only" on memo_day_order
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
