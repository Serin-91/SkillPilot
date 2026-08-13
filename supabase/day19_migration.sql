-- Day19 추가 — schema.sql, day3~day18_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- AI 중심 관심 직무 4종 전면 개편(SkillPilot_AI_Job_Rebuild_ClaudeCode_Instructions).
--
-- 새 저장값(애플리케이션 write validation)은 llm_ai_agent/applied_ai_ml/ai_platform_mlops/
-- ai_service_backend 4종만 허용하지만(roles.ts), 기존 회원 row에는 구 4직군(backend/frontend/
-- ai_ml/data_engineer)이 여전히 남아있을 수 있다. 이 값을 강제로 일괄 UPDATE하지 않고(9절 원칙),
-- 사용자가 My Page에서 직접 재설정할 때까지 읽을 수 있도록 전환 기간 동안 legacy+new 8개 slug를
-- 모두 허용하는 transitional constraint로 교체한다. 모든 사용자가 전환한 뒤 별도 cleanup
-- migration에서 legacy 허용값을 뺄 수 있다.

-- 1) profiles.interested_job_roles — legacy+new 모두 허용
alter table profiles drop constraint if exists profiles_interested_job_roles_valid;
alter table profiles add constraint profiles_interested_job_roles_valid check (
  interested_job_roles <@ array[
    'llm_ai_agent', 'applied_ai_ml', 'ai_platform_mlops', 'ai_service_backend',
    'backend', 'frontend', 'ai_ml', 'data_engineer'
  ]::text[]
  and array_length(interested_job_roles, 1) is distinct from 0
);

-- 2) saved_job.matched_role — legacy+new 모두 허용(과거 history 보존, saved_job row는 삭제하지 않는다)
alter table saved_job drop constraint if exists saved_job_matched_role_check;
alter table saved_job add constraint saved_job_matched_role_check check (
  matched_role in (
    'llm_ai_agent', 'applied_ai_ml', 'ai_platform_mlops', 'ai_service_backend',
    'backend', 'frontend', 'ai_ml', 'data_engineer'
  )
);

-- daily_jobs_run.role_snapshot(day11_migration.sql)은 원래 CHECK 없는 text[] 컬럼이라 변경 불필요.
-- profiles.job_role_priority(day12_migration.sql)의 subset 제약도 interested_job_roles만 참조하므로 변경 불필요.
