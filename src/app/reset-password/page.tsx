import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Reset Password" subtitle="새 비밀번호를 입력해 주세요.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
