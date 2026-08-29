"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/auth/require-user";
import { validateInterestedJobRoles, reconcilePriority, hasLegacyJobRoles, type JobRole } from "@/lib/jobs/roles";
import { assembleDailyJobs } from "@/lib/jobs/generate";
import { todayKSTDateString } from "@/lib/news/kst";

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

  // signIn과 같은 이유 — 실패해도 이미 입력한 이메일/닉네임까지 지워지지 않게 그대로 돌려준다.
  // (비밀번호 두 칸은 controlled라 원래 살아남는다)
  const fail = (error: string, field?: "roles") => ({ error, field, email, nickname });

  if (!EMAIL_RE.test(email)) return fail("이메일 형식이 올바르지 않습니다.");
  if (!nickname) return fail("닉네임을 입력해주세요.");
  if (password.length < 8) return fail("비밀번호는 최소 8자 이상이어야 합니다.");
  if (password !== passwordConfirm) return fail("비밀번호가 일치하지 않습니다.");
  // 계정 생성 요청 전에 검증한다 — 관심 직무가 0개면 계정을 만들지 않는다
  if (!roles) return fail(ROLES_REQUIRED, "roles");
  const priority = priorityFrom(formData, roles);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    if (/already/i.test(error.message)) return fail("이미 가입된 이메일입니다. 로그인 탭에서 로그인해주세요.");
    return fail(error.message);
  }
  if (!data.user) return fail("회원가입에 실패했습니다.");

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
    return fail(profileError.message);
  }

  if (!data.session) {
    return { info: "가입 확인 이메일을 보냈습니다. 메일함에서 링크를 눌러 인증을 완료해주세요." };
  }

  redirect("/");
}

// 실패 응답에 email을 되돌려준다 — React 19는 form action이 끝나면 uncontrolled 입력을
// 자동으로 defaultValue 상태로 되돌린다. 그래서 비밀번호만 틀려도 이메일까지 같이 지워졌다.
// 되돌려준 값을 폼이 defaultValue로 다시 심어주면, 그 리셋이 곧 "이메일 복원"이 된다.
export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다.", email };

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
  // legacy→new 전환 저장인지 미리 확인해둔다(update 이후엔 이전 값을 알 수 없다) — 오늘 이미
  // legacy role 기준으로 daily_jobs_run이 success/partial/failed로 끝나 있으면 새 설정으로도
  // 오늘 재생성이 막히므로, 이 전환일 때만 예외적으로 오늘 행을 정리한다(8절).
  const { data: existing } = await supabase.from("profiles").select("interested_job_roles").eq("user_id", user.id).maybeSingle();
  const isLegacyTransition = hasLegacyJobRoles(existing?.interested_job_roles);

  const { error } = await supabase
    .from("profiles")
    .update({ nickname: trimmed, interested_job_roles: validRoles, job_role_priority: validPriority, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  if (isLegacyTransition) {
    const today = todayKSTDateString();
    const { data: todayRun } = await supabase.from("daily_jobs_run").select("role_snapshot").eq("user_id", user.id).eq("job_date", today).maybeSingle();
    if (todayRun && hasLegacyJobRoles(todayRun.role_snapshot)) {
      // saved_job은 절대 건드리지 않는다 — 오늘의 run 기록만 지워 다음 조회에서 새 AI 역할로 재생성되게 한다.
      await supabase.from("daily_jobs_run").delete().eq("user_id", user.id).eq("job_date", today);
    }
    // 정책 전환 특례 — legacy에서 새 AI 역할로 막 전환한 사람만 기존 10~11시 예약 생성을 기다리지 않고
    // 저장 즉시 생성을 시작한다(assembleDailyJobs 자체는 시간 게이트가 없다 — 그건 get-jobs.ts에만 있다).
    // 다른 일반적인 new-role → new-role 변경은 이 특례를 타지 않고 기존 원칙(다음 생성부터 반영) 그대로다.
    // 저장 버튼 응답을 막지 않도록 기다리지 않는다 — 실패해도 다음 정상 방문 시 fallback 경로가 재시도한다.
    assembleDailyJobs(user.id, validPriority).catch((e) => console.error("[jobs] legacy 전환 즉시 생성 실패", e));
  }

  revalidatePath("/");
  return {
    ok: true as const,
    info: isLegacyTransition
      ? "새 AI 직군 기준으로 채용공고 생성을 바로 시작했습니다. 잠시 후 Job Description에서 확인하세요."
      : "변경된 관심 직무는 다음 채용공고 생성/갱신부터 적용됩니다.",
  };
}

// MindSet — 계정(profiles.mindset)에 저장한다. 입력이 멈춘 뒤 디바운스로 호출되므로 조용히 저장만 한다.
//
// 🔴 상한이 **없었다.** 디바운스 800ms마다 클라이언트가 준 문자열을 그대로 profiles에 썼으니
// 임의 길이 쓰기가 그대로 통했다. 화면에서는 클라이언트가 "칸에 들어가는 만큼"으로 이미 막지만
// (Dashboard의 `fitMindsetToBox`), 서버 액션은 화면을 거치지 않고도 부를 수 있다 — 여기가 경계다.
// 실측(모바일 MindSet 칸 162×44px, 2줄): 한글 22자 / 영문 43자가 한계다. 60은 그 위 여유값이라
// 정상 입력은 절대 안 걸리고 남용만 걸린다. 자르는 쪽을 택한다 — 조용히 저장되는 값이라
// 에러를 돌려줘도 화면에 표시할 자리가 없다.
// ⚠️ `export` 하지 마라 — `"use server"` 파일은 **async 함수만** export할 수 있다.
// 상수를 export하면 빌드가 통째로 깨지는데(`Only async functions are allowed to be exported`)
// `tsc --noEmit`도 `npm run check`도 그걸 **하나도 안 잡는다**. 실제로 여기서 한 번 밟았다
// (CLAUDE.md "CSS를 고쳤으면 브라우저를 열어봐라"와 같은 종류다 — 검사 통과 ≠ 뜨는 화면).
const MINDSET_MAX = 60;
export async function updateMindset(value: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ mindset: value.slice(0, MINDSET_MAX) }).eq("user_id", user.id);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// My Page의 Change password — 로그인 상태에서 새 비밀번호로 바로 변경한다(이메일 링크 없음).
//
// 🔴 **현재 비밀번호를 반드시 확인한다.** 예전엔 세션만 있으면 그대로 바꿔줬는데, 그러면
// 잠깐 자리를 비운 기기나 새어나간 세션 쿠키 하나가 곧바로 **계정 탈취**가 된다(비밀번호를
// 바꾸는 순간 원래 주인이 다시 못 들어온다). 세션은 "이 브라우저가 로그인돼 있다"만 증명하지
// "지금 조작하는 사람이 주인이다"는 증명하지 않는다.
//
// Supabase에는 "비밀번호만 검증"하는 API가 없어서 `signInWithPassword`로 확인한다 —
// 성공하면 같은 사용자의 세션이 갱신될 뿐이라 지금 세션은 그대로 유지된다.
//
// ⚠️ Google로만 가입한 계정은 비밀번호 identity가 아예 없다. 그 사람에게 현재 비밀번호를
//    요구하면 **비밀번호를 처음 설정할 방법이 사라진다** — identity를 보고 그때만 건너뛴다.
export async function changePassword(currentPassword: string, password: string, passwordConfirm: string) {
  const user = await requireUser();
  if (password.length < 8) return { error: "비밀번호는 최소 8자 이상이어야 합니다." };
  if (password !== passwordConfirm) return { error: "비밀번호가 일치하지 않습니다." };

  const supabase = await createClient();
  const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");
  if (hasPassword) {
    if (!currentPassword) return { error: "현재 비밀번호를 입력해주세요." };
    if (!user.email) return { error: "계정 이메일을 확인할 수 없습니다. 다시 로그인해주세요." };
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    // 원문 메시지를 그대로 노출하지 않는다 — "비밀번호가 틀렸다"와 "계정이 없다"를 구분해주면
    // 그 자체가 정보가 된다. 사용자가 할 수 있는 일은 어느 쪽이든 같다.
    if (verifyError) return { error: "현재 비밀번호가 올바르지 않습니다." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true as const };
}
