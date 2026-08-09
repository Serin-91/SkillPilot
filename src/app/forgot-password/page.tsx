import AuthShell from "@/components/auth/AuthShell";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset Password" subtitle="비밀번호를 다시 설정할 수 있도록 가입한 이메일로 링크를 보내드릴게요.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
