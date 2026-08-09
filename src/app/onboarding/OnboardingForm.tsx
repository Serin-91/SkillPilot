"use client";

import { useActionState, useState } from "react";
import { completeOnboarding } from "@/lib/actions/auth";
import { WaveField } from "@/components/auth/WaveField";
import { JobRolePicker } from "@/components/auth/JobRolePicker";
import type { JobRole } from "@/lib/jobs/roles";

type State = { error?: string; field?: "roles" } | undefined;

export default function OnboardingForm({ defaultNickname, defaultRoles }: {
  defaultNickname: string;
  defaultRoles: JobRole[];
}) {
  const [roles, setRoles] = useState<JobRole[]>(defaultRoles);
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (_prev, formData) => completeOnboarding(formData),
    undefined
  );

  return (
    <form action={formAction} className="auth-form">
      <WaveField
        label="Nickname" name="nickname" type="text" required autoComplete="nickname"
        placeholder="SkillPilot에서 사용할 닉네임" defaultValue={defaultNickname}
      />

      <JobRolePicker value={roles} onChange={setRoles} error={state?.field === "roles" ? state.error : null} />

      {state?.error && state.field !== "roles" && <p className="auth-error" role="alert">{state.error}</p>}

      <button className="auth-primary-button" type="submit" disabled={pending}>
        {pending ? "저장 중..." : "Start SkillPilot"}
      </button>
    </form>
  );
}
