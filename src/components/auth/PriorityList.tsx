"use client";

import { useRef, useState } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
import { JOB_ROLE_CONFIG, type JobRole } from "@/lib/jobs/roles";
import { useHoldDrag } from "@/lib/useHoldDrag";

// 체크된 관심 직무의 드래그 순위 목록 — roles 배열의 인덱스가 곧 priority라 별도 숫자 state가 없다.
// 위/아래 화살표 버튼을 걷어내고 드래그 하나로 통일했는데, HTML5 draggable은 터치에서 dragstart가
// 아예 안 떠서 모바일이면 순서를 못 바꾼다. 그래서 마우스·터치가 같은 경로를 타는 Pointer Events로 옮겼다.
// (라이브러리는 여전히 안 쓴다 — 항목이 최대 4개뿐이라 이걸로 충분하다.)
//
// 시작 조건만 useHoldDrag에 맡긴다 — 누르자마자가 아니라 꾹 눌러야 시작한다. 예전엔 손이 살짝만
// 흔들려도 순서가 바뀌어서 "너무 민감하다"는 지적이 계속 나왔다. 고정메모 드래그와 같은 훅이다.
export function PriorityList({ roles, onReorder }: { roles: JobRole[]; onReorder: (next: JobRole[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // 끌고 있는 항목의 현재 인덱스 — 드래그 중 계속 바뀌므로 렌더와 무관한 ref로 들고 간다.
  const atRef = useRef<number | null>(null);

  // 포인터가 걸쳐 있는 행 — 행 높이가 균일하지 않을 수 있어 실제 rect로 찾는다.
  function indexAtPoint(clientY: number) {
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      if (clientY < rows[i].getBoundingClientRect().bottom) return i;
    }
    return rows.length - 1;
  }

  const drag = useHoldDrag<number>({
    onHold(i) {
      atRef.current = i;
      setDragIndex(i);
    },
    onMove(_i, { y }) {
      const from = atRef.current;
      if (from === null) return;
      const over = indexAtPoint(y);
      if (over === from) return;
      const next = [...roles];
      const [moved] = next.splice(from, 1);
      next.splice(over, 0, moved);
      atRef.current = over;
      setDragIndex(over);
      onReorder(next);
    },
    onEnd() {
      atRef.current = null;
      setDragIndex(null);
    },
  });

  if (roles.length === 0) return null;

  return (
    <div className="priority-block">
      <p className="priority-title"><ListOrdered size={18} strokeWidth={2.2} aria-hidden="true" />관심 직무 우선순위</p>
      <p className="priority-hint">길게 눌러 집은 뒤 드래그하면 관심 순서를 변경할 수 있습니다.</p>
      <ul className="priority-list" ref={listRef}>
        {roles.map((role, i) => (
          <li
            key={role}
            className="priority-row"
            data-dragging={dragIndex === i}
            {...drag.bind(i)}
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
