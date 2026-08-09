"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { validateInterestedJobRoles, reconcilePriority, type JobRole } from "@/lib/jobs/roles";

const ROLES_REQUIRED = "관심 직무를 최소 1개 선택해주세요.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rolesFrom(formData: FormData) {
  return validateInterestedJobRoles(formData.getAll("roles").map(String));
}

// JobRolePicker가 함께 제출하는 순서 hidden field(rolesPriority) — 콤마로 이어붙인 slug 목록.
// roles로 이미 검증된 집합을 기준으로 재정리하므로, 여기 값이 조작되거나 비어 있어도 항상 안전하다.
function priorityFrom(formData: FormData, roles: JobRole[]) {
  const raw = String(formData.get("rolesPriority") ?? "");
  return reconcilePriority(roles, raw ? raw.split(",") : []);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const roles = rolesFrom(formData);

  if (!EMAIL_RE.test(email)) return { error: "이메일 형식이 올바르지 않습니다." };
  if (!nickname) return { error: "닉네임을 입력해주세요." };
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };
  if (password !== passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };
  // 계정 생성 요청 전에 검증한다 — 관심 직무가 0개면 계정을 만들지 않는다
  if (!roles) return { error: ROLES_REQUIRED, field: "roles" as const };
  const priority = priorityFrom(formData, roles);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (/already/i.test(error.message)) return { error: "이미 가입된 이메일입니다. 로그인 탭에서 로그인해주세요." };
    return { error: error.message };
  }
  if (!data.user) return { error: "회원가입에 실패했습니다." };

  // 이메일 확인이 필요한 경우 아직 세션이 없어 anon 권한이라 RLS를 통과 못한다 —
  // 계정 생성 직후의 profiles 부트스트랩 insert는 service_role로 수행한다.
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ user_id: data.user.id, nickname, interested_job_roles: roles, job_role_priority: priority }, { onConflict: "user_id" });
  if (profileError) {
    // profiles insert 실패 시 방금 만든 auth 계정을 되돌린다 — 안 그러면 프로필 없는 유령 계정으로
    // "이미 가입됨" 취급되어 로그인은 되는데 온보딩으로 돌아갈 방법이 없어진다.
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: profileError.message };
  }

  if (!data.session) {
    return { info: "가입 확인 이메일을 보냈습니다. 메일함에서 링크를 눌러 인증을 완료해주세요." };
  }

  redirect("/");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

// 소셜 로그인은 Google 하나만 유지한다(Kakao 제외). 신규 사용자는 callback 뒤 /onboarding으로 간다.
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await requestOrigin()}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) return { error: "이메일 형식이 올바르지 않습니다." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };

  return { info: "비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함을 확인해주세요." };
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };
  if (password !== passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/login");
}

// Google 신규 가입자 / 관심 직무가 비어 있는 기존 회원이 완료하는 최소 onboarding
export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const roles = rolesFrom(formData);
  if (!nickname) return { error: "닉네임을 입력해주세요." };
  if (!roles) return { error: ROLES_REQUIRED, field: "roles" as const };
  const priority = priorityFrom(formData, roles);

  const { error } = await createAdminClient()
    .from("profiles")
    .upsert({ user_id: user.id, nickname, interested_job_roles: roles, job_role_priority: priority }, { onConflict: "user_id" });
  if (error) return { error: error.message };

  redirect("/");
}

// My Page — 닉네임과 관심 직무만 함께 저장한다. 오늘 채용공고 캐시는 건드리지 않는다.
// priority는 roles(체크된 집합)와 별도로 받는다 — 드래그로 바뀐 순서를 그대로 넘겨받고,
// roles 검증이 끝난 뒤 reconcilePriority로 그 집합 기준으로만 재정리해 저장한다.
export async function updateProfile(nickname: string, roles: string[], priority: string[]) {
  const user = await requireUser();
  const trimmed = nickname.trim();
  const validRoles = validateInterestedJobRoles(roles);
  if (!trimmed) return { error: "닉네임을 입력해주세요." };
  if (!validRoles) return { error: ROLES_REQUIRED };
  const validPriority = reconcilePriority(validRoles, priority);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nickname: trimmed, interested_job_roles: validRoles, job_role_priority: validPriority, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/");
  return { ok: true as const, info: "변경된 관심 직무는 다음 채용공고 생성/갱신부터 적용됩니다." };
}

// MindSet — 계정(profiles.mindset)에 저장한다. 입력이 멈춘 뒤 디바운스로 호출되므로 조용히 저장만 한다.
export async function updateMindset(value: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ mindset: value }).eq("user_id", user.id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// My Page의 Change password — 로그인 상태에서 새 비밀번호로 바로 변경한다(이메일 링크 없음)
export async function changePassword(password: string, passwordConfirm: string) {
  await requireUser();
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };
  if (password !== passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true as const };
}
