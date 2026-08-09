"use client";

import { useActionState, useState } from "react";
import { updatePassword } from "@/lib/actions/auth";
import { WaveField, type FieldState } from "@/components/auth/WaveField";

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, formAction, pending] = useActionState<{ error?: string } | undefined, FormData>(
    async (_prev, formData) => updatePassword(formData),
    undefined
  );

  const confirmState: FieldState = confirm.length === 0
    ? null
    : password === confirm
      ? { kind: "success", message: "비밀번호가 일치합니다." }
      : { kind: "error", message: "비밀번호가 일치하지 않습니다." };

  return (
    <form action={formAction} className="auth-form">
      <WaveField
        label="Password" name="password" type="password" required minLength={8} autoComplete="new-password"
        placeholder="8자 이상 입력해 주세요" value={password} onChange={(e) => setPassword(e.target.value)}
      />
      <WaveField
        label="Confirm Password" name="passwordConfirm" type="password" required minLength={8} autoComplete="new-password"
        placeholder="비밀번호를 한 번 더 입력하세요" value={confirm} onChange={(e) => setConfirm(e.target.value)}
        state={confirmState}
      />

      {state?.error && <p className="auth-error" role="alert">{state.error}</p>}

      <button className="auth-primary-button" type="submit" disabled={pending}>
        {pending ? "변경 중..." : "Change password"}
      </button>
    </form>
  );
}
