"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/lib/actions/auth";
import { WaveField } from "@/components/auth/WaveField";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginForm({ oauthError }: { oauthError?: string }) {
  const [state, formAction, pending] = useActionState<{ error?: string; email?: string } | undefined, FormData>(
    async (_prev, formData) => signIn(formData),
    undefined
  );

  return (
    <form action={formAction} className="auth-form">
      {/* defaultValue로 방금 입력한 이메일을 다시 심는다 — React 19가 action 완료 후 uncontrolled
          입력을 defaultValue로 되돌리므로, 비밀번호만 틀렸을 때 이메일이 그대로 남는다.
          비밀번호는 일부러 비운 채로 둔다(다시 입력하는 게 맞는 값이다). */}
      <WaveField label="Email" name="email" type="email" required autoComplete="email" placeholder="이메일을 입력하세요" defaultValue={state?.email ?? ""} />
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
