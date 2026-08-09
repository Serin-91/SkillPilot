import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import OnboardingForm from "./OnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile/queries";

// Google 신규 회원, 그리고 관심 직무가 비어 있는 기존 회원이 거치는 최소 onboarding.
// 여기를 통과해야 개인화 채용공고가 생성된다.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(supabase, user.id);
  if (profile && profile.interested_job_roles.length > 0) redirect("/");

  const suggestedNickname =
    profile?.nickname ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "";

  return (
    <AuthShell title="Almost there." subtitle="닉네임과 관심 직무만 설정하면 바로 시작할 수 있어요.">
      <OnboardingForm defaultNickname={suggestedNickname} defaultRoles={profile?.interested_job_roles ?? []} />
    </AuthShell>
  );
}
