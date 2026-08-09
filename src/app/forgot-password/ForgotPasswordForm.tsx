"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/actions/auth";
import { WaveField } from "@/components/auth/WaveField";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<{ error?: string; info?: string } | undefined, FormData>(
    async (_prev, formData) => requestPasswordReset(formData),
    undefined
  );

  return (
    <form action={formAction} className="auth-form">
      <WaveField label="Email" name="email" type="email" required autoComplete="email" placeholder="가입한 이메일을 입력하세요" />

      {state?.error && <p className="auth-error" role="alert">{state.error}</p>}
      {state?.info && <p className="auth-info" role="status">✓ 비밀번호 재설정 링크를 이메일로 보냈습니다.</p>}

      <button className="auth-primary-button" type="submit" disabled={pending}>
        {pending ? "전송 중..." : "Send reset link"}
      </button>

      <p className="auth-foot"><Link href="/login">← Back to Log in</Link></p>
    </form>
  );
}
