"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp } from "@/lib/actions/auth";
import { WaveField, type FieldState } from "@/components/auth/WaveField";
import { JobRolePicker } from "@/components/auth/JobRolePicker";
import { GoogleButton } from "@/components/auth/GoogleButton";
import type { JobRole } from "@/lib/jobs/roles";

type SignupState = { error?: string; info?: string; field?: "roles" } | undefined;

export default function SignupForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [roles, setRoles] = useState<JobRole[]>([]);

  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    async (_prev, formData) => signUp(formData),
    undefined
  );

  // 비어 있으면 성공/실패 아이콘을 띄우지 않는다 — 입력이 시작된 뒤에만 판정한다
  const confirmState: FieldState = confirm.length === 0
    ? null
    : password === confirm
      ? { kind: "success", message: "비밀번호가 일치합니다." }
      : { kind: "error", message: "비밀번호가 일치하지 않습니다." };

  return (
    <form action={formAction} className="auth-form">
      <WaveField label="Email" name="email" type="email" required autoComplete="email" placeholder="사용할 이메일을 입력하세요" />
      <WaveField label="Nickname" name="nickname" type="text" required autoComplete="nickname" placeholder="SkillPilot에서 사용할 닉네임" />
      <WaveField
        label="Password" name="password" type="password" required minLength={8} autoComplete="new-password"
        placeholder="8자 이상 입력해 주세요" value={password} onChange={(e) => setPassword(e.target.value)}
      />
      <WaveField
        label="Confirm Password" name="passwordConfirm" type="password" required minLength={8} autoComplete="new-password"
        placeholder="비밀번호를 한 번 더 입력하세요" value={confirm} onChange={(e) => setConfirm(e.target.value)}
        state={confirmState}
      />

      <JobRolePicker
        value={roles} onChange={setRoles}
        error={state?.field === "roles" ? state.error : null}
      />

      {state?.error && state.field !== "roles" && <p className="auth-error" role="alert">{state.error}</p>}
      {state?.info && <p className="auth-info" role="status">{state.info}</p>}

      <button className="auth-primary-button" type="submit" disabled={pending}>
        {pending ? "계정 생성 중..." : "Create account"}
      </button>

      <div className="auth-divider">or</div>
      <GoogleButton />

      <p className="auth-foot">이미 계정이 있으신가요? <Link href="/login">Log in</Link></p>
    </form>
  );
}
