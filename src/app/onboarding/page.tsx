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
  // legacy 관심직무가 남은 기존 회원은(북마크 등으로 이 페이지에 직접 들어와도) 여기서 재설정시키지
  // 않는다 — My Page 저장 경로에만 있는 전환 처리(오늘 legacy run 정리 + 즉시 생성)를 건너뛰게 되므로,
  // 대시보드로 돌려보내 항상 그 경로를 타게 한다(page.tsx의 재설정 안내 → My Page).
  if (profile && (profile.interested_job_roles.length > 0 || profile.hasLegacyRoles)) redirect("/");

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
