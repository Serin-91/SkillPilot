"use client";

// PHASE 2 ⑧-a — Dashboard.tsx의 **프로젝트 상세 "보기(view)" 분기**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 4554–4587, 34줄 · 참조 13개 중 전용 2 / 공유 11)
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다**(사용자 지시). 동작·UI 변경 0.
//   - state 소유권 변경 0. `projTitle`/`projSummary`/`projStatus`/`projContent`/`projUpdatedAt`/
//     `savingProject`는 전부 Dashboard에 남는다 — `openNewProject`·`openExistingProject`·
//     autosave 핸들러가 같은 state를 쓰기 때문이다(실측: 각 5~8곳).
//   - `toggleProjectTask`·`handleSaveProject`·`handleDeleteProject`는 Dashboard 것을 그대로
//     호출한다. 실행 순서를 바꾸지 않으려고 래핑조차 하지 않았다.
//   - `close(dialogs.projectDetail)` 호출식과 [수정] 버튼의 3연타
//     (`setProjMode` + `setProjEditorKey` + `resetProjectDetailScroll`)는 **호출부(Dashboard)에
//     남겼다** — ⑤ projects-list-dialog와 같은 규약이고, `close`/`dialogs`를 자식으로 내리지
//     않기 위해서다(그 둘은 각각 55곳·57곳에서 쓰인다).
//   - className은 **글자 그대로** 유지한다. CSS가 `.proj-view-*`·`.rich-content-view`·
//     `.form-actions`에 묶여 있고 dialog 타입 셀렉터 아래에 있다(지뢰표).
//   - `style={{ marginTop: 26 }}` 인라인도 그대로다 — 값을 CSS로 옮기는 것은 이 단계가 아니다.
//   - CSS는 건드리지 않았다.
//
// ⚠️ **⑧-b(edit 분기)는 아직 Dashboard에 있다.** 껍데기(`<dialog>` · dialog-head ·
//   ScrollTopButton · projTemplatePromptNode · confirmDialogNode)도 Dashboard에 남아 있다.
//   `projectDetailScrollRef`가 view일 때 `.dialog-inner`, edit일 때 `.dialog-body-scroll`
//   **두 곳에 붙는다**(mode로 갈려 한 번에 하나만 마운트된다) — 그 부착점은 껍데기 쪽이라
//   이 파일이 건드리지 않는다. 옮길 때 두 부착점을 반드시 같이 세라.

import { CalendarDays, NotebookPen } from "lucide-react";
import { formatProjectUpdated } from "@/lib/dashboard/helpers";
import { ProjectStatusBadge } from "@/components/dashboard/presentational";

export type ProjectDetailViewProps = {
  projTitle: string;
  projSummary: string;
  projStatus: string;
  projContent: string;
  projUpdatedAt: string | null;
  savingProject: boolean;
  todayYear: number;
  onToggleTask: (index: number) => void;
  onCancel: () => void;
  onEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
};

export function ProjectDetailView({
  projTitle, projSummary, projStatus, projContent, projUpdatedAt,
  savingProject, todayYear,
  onToggleTask, onCancel, onEdit, onSave, onDelete,
}: ProjectDetailViewProps) {
  return (
            <>
              <div className="proj-view-head">
                <div className="proj-view-title-group">
                  <h2 className="proj-view-title">{projTitle}</h2>
                  {projSummary && <p className="proj-view-summary">{projSummary}</p>}
                </div>
                <ProjectStatusBadge status={projStatus} />
                {projUpdatedAt && (
                  <span className="proj-view-updated">
                    <CalendarDays size={14} strokeWidth={1.8} /> 업데이트 {formatProjectUpdated(projUpdatedAt, todayYear)}
                  </span>
                )}
              </div>

              <div className="proj-note-label"><NotebookPen size={20} strokeWidth={1.9} /> 프로젝트 노트</div>
              <div
                className="rich-content-view proj-note-view"
                onClick={(e) => {
                  // 핵심 기능 체크만 inline 허용 — 본문 텍스트 변경은 [수정]에서 한다
                  const li = (e.target as HTMLElement).closest("li[data-checked]");
                  if (!li) return;
                  const all = Array.from(e.currentTarget.querySelectorAll("li[data-checked]"));
                  onToggleTask(all.indexOf(li));
                }}
                dangerouslySetInnerHTML={{ __html: projContent || "<p>(내용 없음)</p>" }}
              />

              <div className="form-actions" style={{ marginTop: 26 }}>
                <button className="cancel-btn" onClick={onCancel}>취소</button>
                <button className="edit-btn" onClick={onEdit}>✎ 수정</button>
                <button className="save-btn" disabled={savingProject} onClick={onSave}>{savingProject ? "저장 중..." : "저장"}</button>
                <button className="delete-btn" onClick={onDelete}>🗑 삭제</button>
              </div>
            </>
  );
}
