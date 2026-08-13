import type { SupabaseClient } from "@supabase/supabase-js";
import { validateInterestedJobRoles, reconcilePriority, needsJobRoleReset, type JobRole } from "@/lib/jobs/roles";

export type Profile = {
  user_id: string;
  nickname: string;
  interested_job_roles: JobRole[];
  job_role_priority: JobRole[];
  mindset: string;
  // legacy(backend/frontend/ai_ml/data_engineer) slug가 raw interested_job_roles에 남아있는지 —
  // validateInterestedJobRoles가 그 값을 걸러버리기 전에 계산해야 한다. 이 값이 true인 사용자를
  // "관심 직무 0개"로 오인해 온보딩으로 돌려보내면 재설정 안내 화면에 영영 도달하지 못한다.
  hasLegacyRoles: boolean;
};

// Auth provider의 user metadata가 아니라 profiles 테이블이 관심 직무·MindSet의 영구 저장소다.
export async function getProfile(supabase: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, nickname, interested_job_roles, job_role_priority, mindset")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const hasLegacyRoles = needsJobRoleReset(data.interested_job_roles);
  const roles = validateInterestedJobRoles(data.interested_job_roles) ?? [];
  return {
    user_id: data.user_id,
    nickname: data.nickname,
    interested_job_roles: roles,
    // priority가 없던 기존 사용자는 현재 관심 직무 순서를 기준으로 1..N이 자동 부여된다.
    job_role_priority: reconcilePriority(roles, data.job_role_priority),
    mindset: data.mindset ?? "",
    hasLegacyRoles,
  };
}
