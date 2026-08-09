"use client";

import type { InputHTMLAttributes } from "react";

// label의 글자가 하나씩 위로 움직이는 wave 효과만 가져왔다. delay는 20~25ms,
// Confirm Password처럼 긴 label도 전체 애니메이션이 길어지지 않게 상한을 둔다.
function WaveLabel({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label className="wave-label" htmlFor={htmlFor}>
      {text.split("").map((char, index) => (
        <span key={`${char}-${index}`} style={{ transitionDelay: `${Math.min(index, 8) * 22}ms` }}>
          {char === " " ? " " : char}
        </span>
      ))}
    </label>
  );
}

export type FieldState = { kind: "success" | "error"; message: string } | null;

export function WaveField({
  label, helper, state, ...inputProps
}: {
  label: string;
  helper?: string;
  state?: FieldState;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = inputProps.id ?? `field-${inputProps.name}`;
  return (
    <div className="wave-field" data-state={state?.kind}>
      <WaveLabel text={label} htmlFor={id} />
      <input {...inputProps} id={id} aria-describedby={state ? `${id}-msg` : undefined} />
      {state ? (
        <p id={`${id}-msg`} className={`wave-message wave-message-${state.kind}`} aria-live="polite">
          <span aria-hidden="true">{state.kind === "success" ? "✅" : "❌"}</span>
          {state.message}
        </p>
      ) : (
        helper && <p className="wave-helper">{helper}</p>
      )}
    </div>
  );
}
