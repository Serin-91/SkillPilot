-- Day23 추가 — schema.sql, day3~day22_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- cron_runs.status에 'partial'을 허용한다. 뉴스 파이프라인 장애 감지(2026-09-27)의 일부다.
--
-- 왜 필요한가: 지금 상태는 'started' / 'success' / 'failed' 셋뿐이라 **"실행은 끝났는데 결과가
--   온전하지 않은 날"을 표현할 방법이 없다.** 그래서 전부 success로 떨어졌다:
--     · 09-27 — 후보 30건을 받고 Gemini가 터져 뉴스 0건. cron_runs는 success · error_message는 null.
--     · 09-23 — 뉴스 4건은 정상인데 AI Trend가 실패. 역시 success.
--   운영자가 status만 보면 두 날 모두 "정상"이다. 실제로 09-27은 하루치 뉴스가 통째로 비었는데
--   그 사실이 어디에도 안 남아서, 사후에 details.newsStats를 파고서야 원인을 좁힐 수 있었다.
--
-- 판정 기준(정본은 src/lib/news/generate.ts의 runStatusFor):
--     News 성공 + Trend 성공            → success
--     News 성공 + Trend 실패            → partial
--     News 1차 실패 → fallback이 건져냄  → partial
--     News 실패(후보는 있었는데 0건)     → failed  ← 이 경우 briefing 행 자체를 만들지 않는다
--
-- 🔴 이 마이그레이션을 **배포보다 먼저** 적용해라. 제약이 없는 채로 새 코드가 뜨면 partial 기록이
--    23514로 거부된다. cron-runs.ts가 그 경우를 되받아 success로 낮춰 적고 details.degradedStatus에
--    'partial'을 남기므로 장애가 나지는 않지만, 적용 전까지는 status가 한 단계 낙관적으로 보인다.

alter table cron_runs
  drop constraint if exists cron_runs_status_check;

alter table cron_runs
  add constraint cron_runs_status_check
  check (status in ('started', 'success', 'partial', 'failed'));

-- 과거 행은 건드리지 않는다. 소급해서 partial로 바꾸면 "그때 그렇게 기록됐다"는 사실이 사라지고,
-- 09-23·09-27을 success로 보고했다는 것 자체가 이 변경의 근거다(증거를 고쳐 쓰지 않는다).
--
-- RLS: cron_runs는 day15에서 RLS를 켜고 정책을 두지 않았다(service role 전용 읽기/쓰기).
-- 제약 변경은 정책과 무관하므로 새 정책이 필요 없다.
