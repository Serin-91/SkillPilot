-- Day22 추가 — schema.sql, day3~day21_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- 채용 수집 funnel 영속화(OPEN-JOBS-FUNNEL-OBSERVABILITY). 뉴스의 cron_runs.details.newsStats와
-- 같은 목적이고, 채용은 사용자별로 돌기 때문에 사용자·날짜 단위인 daily_jobs_run에 붙인다.
--
-- 왜 필요한가: 지금은 최종 selected_urls만 남아서 "신규 0"인 날의 원인을 사후에 가릴 수 없다.
--   09-13 · 09-19 · 09-20 세 날이 신규 0이었는데 시장 공급 부족인지 · 필터가 강한지 ·
--   사이트가 막힌 건지 · unseen 고갈인지 어느 것으로도 확정하지 못했다.
--   generate.ts는 필요한 숫자(D/E/F/I 단계와 소스별 검색·fetch실패·필터탈락)를 **이미 계산**하는데,
--   0건으로 끝난 날에만 collect-trace.ts의 모듈 스코프 배열로 넘기고 그마저 요청 종료 시 사라진다.
--   성공한 날은 계산해놓고 버린다 — 09-19·09-20이 정확히 그 경우다.
--
-- 왜 새 테이블이 아니라 컬럼 하나인가: 기록 단위가 이미 존재하는 (user_id, job_date) 배치와
--   정확히 같다. day18이 status/selected_urls를 같은 방식으로 붙인 전례를 그대로 따른다.
--
-- 이 컬럼은 **진단 전용**이다. 추천·선정 로직은 이 값을 읽지 않는다.

alter table daily_jobs_run
  add column if not exists funnel jsonb;

-- 백필하지 않는다. 과거 행은 애초에 이 정보를 계산한 적이 없어 채울 근거가 없고,
-- 없는 것을 채우면 "기록이 있다"는 거짓 신호가 된다. null = 그날은 기록하지 않았다.
--
-- RLS: daily_jobs_run의 기존 "own rows only" 정책(day11)이 그대로 적용된다. 새 정책 불필요.
-- 관리자 System Status는 service role로 읽으므로 정책과 무관하다.
