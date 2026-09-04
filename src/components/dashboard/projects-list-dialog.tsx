"use client";

// PHASE 1 ⑤ — Dashboard.tsx의 프로젝트 목록 다이얼로그를 **그대로 옮겨온** 것이다.
// 계획서 §2 결합도 표: 61줄 / 참조 12개 중 9개 전용 / 공유 3.
//
// 🔴 **이 단계의 목적은 구조 개선이 아니라 "표현 JSX 경계만 안전하게 분리"다**(사용자 지시).
//   - 프로젝트 CRUD·선택·필터·상태 로직을 **한 글자도 바꾸지 않았다.**
//   - state 소유권 변경 0. `projectSearch` / `projectStatusFilter` / `filteredProjects`는
//     전부 Dashboard에 있다. 💀 특히 `filteredProjects`는 Dashboard의 `useMemo`가
//     `projectSearch`·`projectStatusFilter`를 읽어 계산한다 — 여기로 내리면 그 memo가
//     쪼개지고 필터 결과가 달라질 수 있다. **계산은 Dashboard에 두고 결과만 받는다.**
//   - handler(`openNewProject` / `openExistingProject`)도 Dashboard 것을 그대로 호출한다.
//     실행 순서를 바꾸지 않으려고 래핑조차 하지 않았다.
//   - `<dialog>` 엘리먼트와 `className="glass-dialog big tonedown projects-list-dialog"`를
//     그대로 유지한다. CSS가 dialog 타입 셀렉터와 이 클래스 조합에 묶여 있다(지뢰표).
//   - ✕의 `close(dialogs.projects)` 호출식은 호출부(Dashboard)에 남겼다 — `close`/`dialogs`를
//     자식으로 내리지 않기 위해서다.
//   - CSS는 건드리지 않았다.

import type { RefObject } from "react";
import { PROJECT_STATUSES, type ProjectIdea } from "@/lib/project/types";
import { formatProjectUpdated } from "@/lib/dashboard/helpers";
import { ProjectStatusBadge } from "@/components/dashboard/presentational";
import { ProjectStatusFilterDropdown } from "@/components/dashboard/widgets";

export type ProjectsListDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  projectIdeaCount: number;
  projectIdeas: ProjectIdea[] | null;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  projectStatusFilter: string;
  setProjectStatusFilter: (value: string) => void;
  openNewProject: () => void;
  filteredProjects: ProjectIdea[];
  openExistingProject: (p: ProjectIdea) => void;
  todayYear: number;
};

export function ProjectsListDialog({
  dialogRef, onDialogBackdropClick, onCloseClick,
  projectIdeaCount, projectIdeas,
  projectSearch, setProjectSearch,
  projectStatusFilter, setProjectStatusFilter,
  openNewProject, filteredProjects, openExistingProject, todayYear,
}: ProjectsListDialogProps) {
  return (
      <dialog className="glass-dialog big tonedown projects-list-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head">
            <div className="project-list-title-group">
              <h3>프로젝트 아이디어</h3>
              <span className="project-total-badge">{projectIdeaCount} Projects</span>
            </div>
            <button className="close-btn" onClick={onCloseClick}>✕</button>
          </div>

          {projectIdeas === null ? (
            <div className="hint">로그인하면 프로젝트 아이디어를 기록할 수 있습니다.</div>
          ) : (
            <>
              <div className="proj-toolbar">
                <input
                  id="proj-search" name="proj-search"
                  className="proj-search" placeholder="프로젝트 검색"
                  value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
                />
                <ProjectStatusFilterDropdown value={projectStatusFilter} onChange={setProjectStatusFilter} />
                <button className="add-btn proj-new-btn" onClick={openNewProject}>+ Project</button>
              </div>

              {projectIdeas.length === 0 ? (
                // 위 툴바에 이미 "+ Project" 버튼이 있다 — 목록이 비었을 때 여기 또 하나를 더 띄워
                // 같은 화면에 버튼이 두 개 뜨고 있었다. 안내 문구만 남긴다.
                <div className="proj-empty">
                  <div className="hint">아직 등록된 프로젝트가 없습니다.<br />새로운 아이디어를 기록해보세요.</div>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="hint">조건에 맞는 프로젝트가 없습니다.</div>
              ) : (
                <div className="proj-table">
                  <div className="proj-table-row proj-table-head project-table-header">
                    <span className="proj-col-name">프로젝트명</span>
                    <span className="proj-col-summary">한 줄 요약</span>
                    <span className="proj-col-status">상태</span>
                    <span className="proj-col-updated">최근 수정</span>
                  </div>
                  {filteredProjects.map((p) => (
                    <button type="button" key={p.id} className="proj-table-row project-list-row" onClick={() => openExistingProject(p)}>
                      <span className="proj-col-name project-list-title">{p.title}</span>
                      <span className="proj-col-summary project-list-summary">{p.summary}</span>
                      <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                      <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, todayYear)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="proj-legend">
                <span className="proj-legend-label">상태별 색상 안내</span>
                <div className="proj-legend-row">
                  {PROJECT_STATUSES.map((s) => <ProjectStatusBadge key={s} status={s} />)}
                </div>
              </div>
            </>
          )}
        </div>
      </dialog>
  );
}
