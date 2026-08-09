"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/lib/actions/auth";
import { WaveField } from "@/components/auth/WaveField";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginForm({ oauthError }: { oauthError?: string }) {
  const [state, formAction, pending] = useActionState<{ error?: string } | undefined, FormData>(
    async (_prev, formData) => signIn(formData),
    undefined
  );

  return (
    <form action={formAction} className="auth-form">
      <WaveField label="Email" name="email" type="email" required autoComplete="email" placeholder="이메일을 입력하세요" />
      <WaveField label="Password" name="password" type="password" required minLength={8} autoComplete="current-password" placeholder="비밀번호를 입력하세요" />

      <Link href="/forgot-password" className="auth-inline-link">비밀번호를 잊으셨나요?</Link>

      {(state?.error || oauthError) && <p className="auth-error" role="alert">{state?.error ?? oauthError}</p>}

      <button className="auth-primary-button" type="submit" disabled={pending}>
        {pending ? "로그인 중..." : "Log in"}
      </button>

      <div className="auth-divider">or</div>
      <GoogleButton />

      <p className="auth-foot">계정이 없으신가요? <Link href="/signup">Sign up</Link></p>
    </form>
  );
}
