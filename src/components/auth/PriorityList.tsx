"use client";

import { useRef, useState } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
import { JOB_ROLE_CONFIG, type JobRole } from "@/lib/jobs/roles";

// 체크된 관심 직무의 드래그 순위 목록 — roles 배열의 인덱스가 곧 priority라 별도 숫자 state가 없다.
// 위/아래 화살표 버튼을 걷어내고 드래그 하나로 통일했는데, HTML5 draggable은 터치에서 dragstart가
// 아예 안 떠서 모바일이면 순서를 못 바꾼다. 그래서 마우스·터치가 같은 경로를 타는 Pointer Events로 옮겼다.
// (라이브러리는 여전히 안 쓴다 — 항목이 최대 4개뿐이라 이걸로 충분하다.)
export function PriorityList({ roles, onReorder }: { roles: JobRole[]; onReorder: (next: JobRole[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  if (roles.length === 0) return null;

  // 포인터가 걸쳐 있는 행 — 행 높이가 균일하지 않을 수 있어 실제 rect로 찾는다.
  function indexAtPoint(clientY: number) {
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      if (clientY < rows[i].getBoundingClientRect().bottom) return i;
    }
    return rows.length - 1;
  }

  function startDrag(e: React.PointerEvent<HTMLLIElement>, i: number) {
    // 캡처해두면 손가락이 행 밖으로 나가도 move/up이 계속 이 li로 온다.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIndex(i);
  }

  function moveDrag(e: React.PointerEvent<HTMLLIElement>) {
    if (dragIndex === null) return;
    const over = indexAtPoint(e.clientY);
    if (over === dragIndex) return;
    const next = [...roles];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(over, 0, moved);
    setDragIndex(over); // 끌고 있는 항목의 새 인덱스
    onReorder(next);
  }

  function endDrag(e: React.PointerEvent<HTMLLIElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragIndex(null);
  }

  return (
    <div className="priority-block">
      <p className="priority-title"><ListOrdered size={18} strokeWidth={2.2} aria-hidden="true" />관심 직무 우선순위</p>
      <p className="priority-hint">드래그해서 관심 순서를 변경할 수 있습니다.</p>
      <ul className="priority-list" ref={listRef}>
        {roles.map((role, i) => (
          <li
            key={role}
            className="priority-row"
            data-dragging={dragIndex === i}
            onPointerDown={(e) => startDrag(e, i)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span className="priority-rank">{i + 1}</span>
            <span className="priority-label">{JOB_ROLE_CONFIG[role].label}</span>
            <GripVertical size={16} strokeWidth={2} className="priority-handle" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
