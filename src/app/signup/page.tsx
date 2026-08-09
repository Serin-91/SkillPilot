import AuthShell from "@/components/auth/AuthShell";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <AuthShell tab="signup" title="Welcome to SkillPilot" subtitle="새 계정을 만들어 시작하세요.">
      <SignupForm />
    </AuthShell>
  );
}
