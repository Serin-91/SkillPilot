"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, ListOrdered } from "lucide-react";
import { JOB_ROLE_CONFIG, type JobRole } from "@/lib/jobs/roles";

// 체크된 관심 직무의 드래그 순위 목록 — roles 배열의 인덱스가 곧 priority라 별도 숫자 state가 없다.
// 새 라이브러리 없이 HTML5 draggable만으로 처리한다(항목이 최대 4개뿐이라 이걸로 충분하다).
export function PriorityList({ roles, onReorder }: { roles: JobRole[]; onReorder: (next: JobRole[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (roles.length === 0) return null;

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const next = [...roles];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
  }

  function moveWithButton(from: number, to: number) {
    if (to < 0 || to >= roles.length) return;
    const next = [...roles];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  }

  return (
    <div className="priority-block">
      <p className="priority-title"><ListOrdered size={18} strokeWidth={2.2} aria-hidden="true" />관심 직무 우선순위</p>
      <p className="priority-hint">드래그하거나 화살표 버튼으로 관심 순서를 변경할 수 있습니다.</p>
      <ul className="priority-list">
        {roles.map((role, i) => (
          <li
            key={role}
            className="priority-row"
            data-dragging={dragIndex === i}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => setDragIndex(null)}
          >
            <span className="priority-rank">{i + 1}</span>
            <span className="priority-label">{JOB_ROLE_CONFIG[role].label}</span>
            <span className="priority-touch-actions">
              <button type="button" aria-label={`${JOB_ROLE_CONFIG[role].label} 위로 이동`} disabled={i === 0} onClick={() => moveWithButton(i, i - 1)}>
                <ChevronUp size={17} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`${JOB_ROLE_CONFIG[role].label} 아래로 이동`} disabled={i === roles.length - 1} onClick={() => moveWithButton(i, i + 1)}>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
            </span>
            <GripVertical size={16} strokeWidth={2} className="priority-handle" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
