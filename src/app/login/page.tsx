import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "./LoginForm";

// Google OAuth 거부/이메일 링크 만료 시 auth/callback이 이유를 error 쿼리로 붙여 여기로 보낸다.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell tab="login" title="Welcome back" subtitle="SkillPilot에 로그인해 주세요.">
      <LoginForm oauthError={error} />
    </AuthShell>
  );
}
