"use client";

import { JOB_ROLE_CONFIG, JOB_ROLE_ORDER, type JobRole } from "@/lib/jobs/roles";
import { PriorityList } from "./PriorityList";

// 관심 직무 4종 복수 선택 — checkbox semantics를 그대로 써서 키보드/스크린리더로도 선택 가능하다.
// 최소 1개 필수, 최대 4개. 저장은 항상 slug이고 한글 label을 키로 쓰지 않는다.
export function JobRolePicker({ value, onChange, error, name = "roles" }: {
  value: JobRole[];
  onChange: (next: JobRole[]) => void;
  error?: string | null;
  name?: string;
}) {
  function toggle(role: JobRole) {
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  }

  // 기술 태그는 보통 한 줄로 붙이지만, AI·ML처럼 특정 항목 앞에서 줄바꿈이 필요하면 그 지점부터 새 줄로 뗀다
  function skillsText(config: (typeof JOB_ROLE_CONFIG)[JobRole]): string {
    if (!config.skillsBreakBefore) return config.skills.join(" · ");
    const idx = config.skills.indexOf(config.skillsBreakBefore);
    if (idx <= 0) return config.skills.join(" · ");
    return `${config.skills.slice(0, idx).join(" · ")}\n${config.skills.slice(idx).join(" · ")}`;
  }

  return (
    <fieldset className="role-block" aria-describedby="role-block-desc">
      <legend className="role-block-title">Interested Jobs</legend>
      <p id="role-block-desc" className="role-block-desc">
        관심 직무를 선택해주세요.<br />
        선택한 직무를 기준으로 매일 새로운 채용공고 4개를 제공합니다.
      </p>
      <div className="role-grid">
        {JOB_ROLE_ORDER.map((role) => {
          const config = JOB_ROLE_CONFIG[role];
          const checked = value.includes(role);
          return (
            <label key={role} className="role-card" data-checked={checked}>
              <input type="checkbox" name={name} value={role} checked={checked} onChange={() => toggle(role)} />
              <span className="role-card-name">
                <span className="role-card-check" aria-hidden="true">✓</span>
                {config.label}
              </span>
              <span className="role-card-desc">{config.description}</span>
              <span className="role-card-skills">{skillsText(config)}</span>
            </label>
          );
        })}
      </div>
      {/* value 배열의 순서가 곧 priority다(체크=끝에 추가, 해제=제거하며 나머지 순서 유지) — 별도 state 없이 그대로 쓴다 */}
      <PriorityList roles={value} onReorder={onChange} />
      <input type="hidden" name={`${name}Priority`} value={value.join(",")} />
      {error && <p className="auth-error" role="alert">{error}</p>}
    </fieldset>
  );
}
