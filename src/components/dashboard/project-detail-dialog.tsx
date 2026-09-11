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

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { ScrollTopButton } from "@/components/dashboard/presentational";
import { CalendarDays, NotebookPen, Maximize2, Sparkles } from "lucide-react";
import { formatProjectUpdated, SUMMARY_MAX_LENGTH } from "@/lib/dashboard/helpers";
import { PROJECT_BODY_PLACEHOLDER } from "@/lib/project/template";
import { MemoRichEditor, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import { ProjectStatusBadge } from "@/components/dashboard/presentational";
import { ProjectStatusFilterDropdown } from "@/components/dashboard/widgets";

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

// PHASE 2 ⑧-b — Dashboard.tsx의 **프로젝트 상세 "생성/수정(create·edit)" 분기**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 4572–4691, 120줄 · 참조 23개 중 전용 2 / 공유 21)
//
// 🔴 ⑧-a와 같은 규약이다. 동작·UI 변경 0, state 소유권 변경 0.
//   - `close(dialogs.projectDetail)`와 취소의 삼항(`projMode === "edit" ? view : close`)은
//     **호출부(Dashboard)에 남겼다.** 그래서 이 컴포넌트는 `projMode`를 아예 받지 않는다
//     (덩어리 안에서 `projMode`를 쓰던 곳이 그 삼항 하나뿐이었다 — 실측).
//   - `scheduleProjectAutosave`는 **onChange 안에서 부르는 순서까지 원본 그대로**다.
//     🔴 setState → schedule 순서를 바꾸지 마라. autosave가 폼 값을 스냅샷으로 받는 구조다.
//   - `projectDetailScrollRef`는 `useScrollTopButton()`이 돌려준 것이고 그 훅 호출은 Dashboard에
//     남는다(`resetProjectDetailScroll`을 `openNewProject`·`openExistingProject`가 쓴다).
//     여기서는 `scrollRef`/`onScroll`로 받아 **`.dialog-body-scroll`에만** 붙인다.
//     ⚠️ view 모드에서는 같은 ref가 `.dialog-inner`에 붙는다(껍데기 쪽, Dashboard에 남아 있다).
//        **부착점이 둘이고 mode로 갈려 한 번에 하나만 마운트된다** — 지뢰표 "같은 ref를 여러 벌이
//        공유하면 마지막 사본이 이긴다" 자리다. 한쪽만 옮기지 마라.
//   - `projectEditorRef`도 Dashboard에 남는다 — 껍데기의 undo/redo 버튼(`.mobile-editor-head-actions`)이
//     같은 ref를 쓴다. ✅ 이 ref는 `activeMemoEditorRef()`의 4개 후보에 **없다**(실측) —
//     그래서 "현재 커서 위치에 삽입" 경로와 무관하다.
//   - `SUMMARY_MAX_LENGTH`·`PROJECT_BODY_PLACEHOLDER`는 모듈 상수라 prop이 아니라 import다.
//   - 주석·className·인라인 style·`aria-*`를 한 글자도 바꾸지 않았다. CSS는 건드리지 않았다.

export type ProjectDetailEditProps = {
  projTitle: string;
  setProjTitle: Dispatch<SetStateAction<string>>;
  projSummary: string;
  setProjSummary: Dispatch<SetStateAction<string>>;
  projSummaryError: string | null;
  projStatus: string;
  setProjStatus: Dispatch<SetStateAction<string>>;
  projContent: string;
  setProjContentWhileTyping: (html: string) => void;
  projEditorKey: number;
  projectEditorRef: RefObject<MemoRichEditorHandle | null>;
  projAutosaveStatusNode: ReactNode;
  mobileProjectSummaryOpen: boolean;
  setMobileProjectSummaryOpen: Dispatch<SetStateAction<boolean>>;
  savingProject: boolean;
  scheduleProjectAutosave: (overrides?: Partial<{ title: string; status: string; summary: string; content: string }>) => void;
  applyProjectTemplate: (target?: "form" | "bodyEditor") => void;
  openBodyEditor: (target?: "memo" | "project") => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function ProjectDetailEdit({
  projTitle, setProjTitle,
  projSummary, setProjSummary, projSummaryError,
  projStatus, setProjStatus,
  projContent, setProjContentWhileTyping,
  projEditorKey, projectEditorRef, projAutosaveStatusNode,
  mobileProjectSummaryOpen, setMobileProjectSummaryOpen,
  savingProject, scheduleProjectAutosave, applyProjectTemplate, openBodyEditor,
  scrollRef, onScroll, onCancel, onSave,
}: ProjectDetailEditProps) {
  return (
            <>
              <div className="dialog-body-scroll" ref={scrollRef} onScroll={onScroll}>
              {/* 우측 여백을 채우는 패널을 title 옆 한 줄에만 놓으면 그 아래(한줄요약·상태) 줄까지는
                  못 채운다는 게 4번째 지적의 핵심이었다 - "상단에만 쳐놓으면 뭐 함". 그래서 title
                  행 + summary 행을 왼쪽 스택(.proj-top-cluster-left)으로 묶고, 오른쪽에 두 행 높이를
                  전부 커버하는 패널 하나(.proj-coming-soon, align-items:stretch)를 둔다.
                  모바일에서는 .proj-top-cluster/-left를 display:contents로 지워서 .proj-form-grid,
                  .proj-summary-row, .mobile-project-summary-popover가 여전히 .dialog-body-scroll의
                  직계 flex 자식처럼 동작하게 한다 - 안 그러면 기존 order:-2/-1 재배치 트릭이 깨진다. */}
              <div className="proj-top-cluster">
                <div className="proj-top-cluster-left">
                  <div className="proj-form-grid">
                    <div className="proj-field">
                      <label className="proj-field-label" htmlFor="proj-title">프로젝트명</label>
                      <div className="mobile-project-title-row">
                        <input
                          id="proj-title" type="text" className="form-title-input" placeholder="프로젝트명을 입력하세요"
                          value={projTitle}
                          onChange={(e) => { setProjTitle(e.target.value); scheduleProjectAutosave({ title: e.target.value }); }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="proj-summary-row">
                    <div className="proj-field proj-summary-field">
                      <div className="proj-summary-field-head">
                        <label className="proj-field-label" htmlFor="proj-summary">한 줄 요약</label>
                        <span className="proj-summary-badge">최대 {SUMMARY_MAX_LENGTH}자</span>
                        {projAutosaveStatusNode}
                      </div>
                      <div className="proj-summary-input-wrap">
                        <input
                          id="proj-summary" type="text" placeholder="프로젝트를 한 줄로 요약해보세요"
                          maxLength={SUMMARY_MAX_LENGTH} value={projSummary}
                          onChange={(e) => {
                            const next = e.target.value.slice(0, SUMMARY_MAX_LENGTH);
                            setProjSummary(next);
                            scheduleProjectAutosave({ summary: next });
                          }}
                        />
                        <span className="proj-summary-counter">{projSummary.length} / {SUMMARY_MAX_LENGTH}</span>
                      </div>
                      {projSummaryError && <div className="proj-summary-error">{projSummaryError}</div>}
                    </div>
                    <div className="proj-field proj-field--status">
                      <span className="proj-field-label">상태</span>
                      <div className="mobile-project-status-row">
                        <ProjectStatusFilterDropdown
                          value={projStatus}
                          onChange={(v) => { setProjStatus(v); scheduleProjectAutosave({ status: v }); }}
                          includeAll={false}
                        />
                        <button type="button" className="mobile-project-summary-toggle" aria-expanded={mobileProjectSummaryOpen} onClick={() => setMobileProjectSummaryOpen((v) => !v)}>한 줄 요약⌄</button>
                      </div>
                    </div>
                  </div>

                  {/* 토글 바로 아래에 열려야 하므로 .proj-summary-row 직후에 둔다(데스크톱에서는 display:none) */}
                  {mobileProjectSummaryOpen && (
                    <div className="mobile-project-summary-popover">
                      <input
                        type="text" placeholder="프로젝트를 30자 이내로 요약해보세요"
                        maxLength={SUMMARY_MAX_LENGTH} value={projSummary}
                        onChange={(e) => { const next = e.target.value.slice(0, SUMMARY_MAX_LENGTH); setProjSummary(next); scheduleProjectAutosave({ summary: next }); }}
                        onBlur={() => setMobileProjectSummaryOpen(false)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      />
                      <span>{projSummary.length}/{SUMMARY_MAX_LENGTH}</span>
                    </div>
                  )}
                </div>

                {/* 리퀴드 글래스 오브 - Idea Build 결과 화면의 .idea-direction-orb + 배경 .blob을
                    그대로 가져왔다(사용자가 시안 중 "리퀴드 글래스 오브" 선택). 모바일에서는
                    통째로 숨긴다(dashboard.css (17)절). */}
                <div className="proj-coming-soon" aria-hidden="true">
                  <span className="proj-coming-soon-blob proj-coming-soon-blob-a" />
                  <span className="proj-coming-soon-blob proj-coming-soon-blob-b" />
                  <span className="proj-coming-soon-orb">
                    <Sparkles size={34} strokeWidth={1.9} />
                  </span>
                  <span className="proj-coming-soon-copy">
                    <span className="proj-coming-soon-label">기능 추가 예정</span>
                    <strong className="proj-coming-soon-main">곧, 새로운 기능</strong>
                    <span className="proj-coming-soon-sub">이 자리에서 프로젝트를 더 깊게 다룰 수 있게 됩니다</span>
                  </span>
                  <span className="proj-coming-soon-status">
                    <span className="proj-coming-soon-status-dot" />준비 중
                  </span>
                </div>
              </div>

              <div className="proj-content-head">
                <span className="proj-field-label">프로젝트 내용</span>
                <div className="proj-template-toggle" role="group" aria-label="본문 시작 방식">
                  <button type="button" className="proj-template-btn" onClick={() => applyProjectTemplate("form")}>기본 템플릿</button>
                </div>
                <span className="proj-template-hint">템플릿을 선택하면 기본 구조가 자동으로 입력됩니다.</span>
                <button type="button" className="expand-btn" onClick={() => openBodyEditor("project")}>
                  <Maximize2 size={14} strokeWidth={2} /> 확장
                </button>
              </div>

              <MemoRichEditor
                key={`project-${projEditorKey}`}
                ref={projectEditorRef}
                initialValue={projContent}
                bodyClassName="proj-body-input"
                placeholder={PROJECT_BODY_PLACEHOLDER}
                enableTextColor
                onChange={(html) => { setProjContentWhileTyping(html); scheduleProjectAutosave({ content: html }); }}
              />
              </div>

              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="cancel-btn" onClick={onCancel}>취소</button>
                <button className="save-btn" disabled={savingProject} onClick={onSave}>{savingProject ? "저장 중..." : "저장"}</button>
              </div>
            </>
  );
}

// ⑨(재-Audit ②) — Dashboard.tsx의 **프로젝트 상세/편집 "껍데기"**를 그대로 옮겨온 것이다.
// 위 파일 머리말이 "껍데기는 아직 Dashboard에 있다"고 적어 둔 그 부분이고, 이제 여기 있다.
//
// 🔴 목적은 표현 경계 분리다. 동작·DOM·CSS 변경 0 · state/effect 이동 0 · 새 Context/registry 0.
// 🔴 **ref 3개는 전부 Dashboard 소유 그대로다**(`projectEditorRef`·`projectDetailScrollRef`·
//   `projectDetailScrollBtnRef`). 여기서는 받아서 붙이기만 한다 — 옮길 이유가 없으면 옮기지
//   않는다는 규칙(`CLAUDE.md` 공유 ref 항목) 그대로다. 여기로 끌고 오지 마라.
// 🔴 **`projectDetailScrollRef`의 부착점은 둘이다** — view면 `.dialog-inner`, edit면
//   `ProjectDetailEdit`의 `scrollRef`(=`.dialog-body-scroll`). projMode로 갈려 **한 번에 하나만**
//   마운트된다. 위 머리말이 "옮길 때 두 부착점을 반드시 같이 세라"고 한 것이 이것이고, 둘 다 여기 있다.
// 🔴 **이 컴포넌트 자체도 한 번에 한 곳에만 마운트된다.** 호출부(Dashboard)가 모바일이면
//   `.proj-edit-page`, 아니면 `<dialog>` 안에 넣는다(`projectEditPage` 삼항). 두 벌이 되면
//   `projectEditorRef`를 공유해 "마지막 사본이 이긴다". 그 계약은 호출부에 그대로 남겼다.
// 🔴 `projTemplatePromptNode`·`projAutosaveStatusNode`는 **Dashboard에 남겨 두고 node로 받는다** —
//   body-editor 다이얼로그도 같은 두 노드를 쓰기 때문이다(각각 2곳). 여기로 옮기면 그쪽이 끊긴다.
//   반면 모바일 옵션 시트는 이 블록에서만 쓰여서 함께 옮겼다.

export type ProjectDetailShellProps = {
  projMode: "create" | "view" | "edit";
  editingProjectId: string | null;
  projTitle: string;
  setProjTitle: Dispatch<SetStateAction<string>>;
  projSummary: string;
  setProjSummary: Dispatch<SetStateAction<string>>;
  projSummaryError: string | null;
  projStatus: string;
  setProjStatus: Dispatch<SetStateAction<string>>;
  projContent: string;
  setProjContentWhileTyping: (html: string) => void;
  projUpdatedAt: string | null;
  projEditorKey: number;
  setProjEditorKey: Dispatch<SetStateAction<number>>;
  setProjMode: Dispatch<SetStateAction<"create" | "view" | "edit">>;
  savingProject: boolean;
  today: { year: number; month0: number; day: number };
  projectEditorRef: RefObject<MemoRichEditorHandle | null>;
  projectDetailScrollRef: RefObject<HTMLDivElement | null>;
  projectDetailScrollBtnRef: RefObject<HTMLButtonElement | null>;
  onProjectDetailScroll: (e: React.UIEvent<HTMLElement>) => void;
  scrollProjectDetailToTop: () => void;
  resetProjectDetailScroll: () => void;
  mobileProjectMenuOpen: boolean;
  setMobileProjectMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobileProjectSummaryOpen: boolean;
  setMobileProjectSummaryOpen: Dispatch<SetStateAction<boolean>>;
  toggleProjectTask: (index: number) => void;
  handleSaveProject: () => void;
  handleDeleteProject: () => void;
  handleProjectDetailBack: () => void;
  closeProjectDetail: () => void;
  scheduleProjectAutosave: (overrides?: Partial<{ title: string; status: string; summary: string; content: string }>) => void;
  applyProjectTemplate: (target?: "form" | "bodyEditor") => void;
  openBodyEditor: (target?: "memo" | "project") => void;
  projTemplatePrompt: "form" | "bodyEditor" | false;
  projTemplatePromptNode: ReactNode;
  projAutosaveStatusNode: ReactNode;
  confirmDialogNode: ReactNode;
};

export function ProjectDetailShell({
  projMode, editingProjectId, projTitle, setProjTitle,
  projSummary, setProjSummary, projSummaryError, projStatus,
  setProjStatus, projContent, setProjContentWhileTyping, projUpdatedAt,
  projEditorKey, setProjEditorKey, setProjMode, savingProject,
  today, projectEditorRef, projectDetailScrollRef, projectDetailScrollBtnRef,
  onProjectDetailScroll, scrollProjectDetailToTop, resetProjectDetailScroll, mobileProjectMenuOpen,
  setMobileProjectMenuOpen, mobileProjectSummaryOpen, setMobileProjectSummaryOpen, toggleProjectTask,
  handleSaveProject, handleDeleteProject, handleProjectDetailBack, closeProjectDetail,
  scheduleProjectAutosave, applyProjectTemplate, openBodyEditor, projTemplatePrompt,
  projTemplatePromptNode, projAutosaveStatusNode, confirmDialogNode,
}: ProjectDetailShellProps) {
  function renderMobileProjectOptionsSheet() {
    return mobileProjectMenuOpen && (
      <div
        className="mobile-options-backdrop"
        onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileProjectMenuOpen(false); }}
        onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileProjectMenuOpen(false); }}
      >
        <section className="mobile-options-sheet mobile-project-options-sheet" aria-label="프로젝트 설정" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-options-handle" />
          {editingProjectId && <button type="button" className="mobile-options-delete" onClick={() => { setMobileProjectMenuOpen(false); handleDeleteProject(); }}>삭제하기</button>}
        </section>
      </div>
    );
  }

  return (
    <>
        {/* 🔴 tabIndex={-1} — 모바일에서 프로젝트를 열면 ↶(실행 취소)에 보라색 포커스 링이 남던 것을 막는다.
            원인: `showModal()`은 autofocus가 없으면 **트리 순서상 첫 포커스 가능 요소**를 잡는다. News·Jobs·
            AI Trend·프로젝트목록은 `.dialog-inner`가 실제 스크롤러라 브라우저가 그것을 포커스 후보로 보고 거기서
            멈추는데(그래서 링이 안 보인다), **편집 껍데기는 `overflow: hidden`이라 후보가 못 되어** 포커스가
            그 다음인 `.mobile-project-head-actions`의 첫 `<button>`(= ↶)으로 떨어졌다. 거기에
            `[data-theme="dark"] button:focus-visible { outline: rgba(167,139,250,.65) }`가 걸려 보라색이 된다.
            `-1`이라 Tab 순서에는 안 들어가고, 다른 네 다이얼로그와 **같은 지점(컨테이너)**에 포커스가 서게 된다.
            💀 리팩토링 회귀가 아니다 — 이 head 블록은 ⑧ 이전(`aafa143^`)과 바이트 동일하고 보라색 규칙은
               다크모드 도입(`a5c66bb`) 때부터 있었다. */}
        <div
          className={`dialog-inner proj-detail-inner ${projMode !== "view" ? "proj-detail-editing" : ""} ${projMode === "edit" && editingProjectId ? "proj-detail-existing" : ""}`}
          tabIndex={-1}
          ref={projMode === "view" ? projectDetailScrollRef : undefined}
          onScroll={projMode === "view" ? onProjectDetailScroll : undefined}
        >
          <div className="dialog-head proj-detail-head">
            {projMode !== "view" && (
              <div className="mobile-editor-head-actions mobile-project-head-actions">
                <button type="button" aria-label="실행 취소" onClick={() => projectEditorRef.current?.undo()}><Undo2 size={18} strokeWidth={2} /></button>
                <button type="button" aria-label="다시 실행" onClick={() => projectEditorRef.current?.redo()}><Redo2 size={18} strokeWidth={2} /></button>
                {editingProjectId && <button type="button" className="mobile-more-btn" aria-label="프로젝트 더보기" onClick={() => setMobileProjectMenuOpen(true)}>⋮</button>}
              </div>
            )}
            <button
              className="close-btn project-back-btn"
              aria-label="프로젝트 목록으로 돌아가기"
              onClick={() => {
                const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
                if (mobile) handleProjectDetailBack();
                else closeProjectDetail();
              }}
            >
              <span className="desktop-close-symbol">✕</span><span className="mobile-back-symbol">‹</span>
            </button>
          </div>

          {projMode === "view" ? (
            /* PHASE 2 ⑧-a — 보기 분기는 project-detail-dialog.tsx로 옮겼다.
               closeProjectDetail()와 [수정] 3연타는 여기 남긴다(⑤와 같은 규약). */
            <ProjectDetailView
              projTitle={projTitle}
              projSummary={projSummary}
              projStatus={projStatus}
              projContent={projContent}
              projUpdatedAt={projUpdatedAt}
              savingProject={savingProject}
              todayYear={today.year}
              onToggleTask={toggleProjectTask}
              onCancel={() => closeProjectDetail()}
              onEdit={() => { setProjMode("edit"); setProjEditorKey((k) => k + 1); resetProjectDetailScroll(); }}
              onSave={handleSaveProject}
              onDelete={handleDeleteProject}
            />
          ) : (
            <ProjectDetailEdit
              projTitle={projTitle}
              setProjTitle={setProjTitle}
              projSummary={projSummary}
              setProjSummary={setProjSummary}
              projSummaryError={projSummaryError}
              projStatus={projStatus}
              setProjStatus={setProjStatus}
              projContent={projContent}
              setProjContentWhileTyping={setProjContentWhileTyping}
              projEditorKey={projEditorKey}
              projectEditorRef={projectEditorRef}
              projAutosaveStatusNode={projAutosaveStatusNode}
              mobileProjectSummaryOpen={mobileProjectSummaryOpen}
              setMobileProjectSummaryOpen={setMobileProjectSummaryOpen}
              savingProject={savingProject}
              scheduleProjectAutosave={scheduleProjectAutosave}
              applyProjectTemplate={applyProjectTemplate}
              openBodyEditor={openBodyEditor}
              scrollRef={projectDetailScrollRef}
              onScroll={onProjectDetailScroll}
              onCancel={() => (projMode === "edit" ? setProjMode("view") : closeProjectDetail())}
              onSave={handleSaveProject}
            />
          )}
        </div>
        {/* 편집 중에는 위로가기를 띄우지 않는다(사용자 요청 2026-08-28 — 메모 쪽과 같은 이유로
            "조잡하다"). 보기 모드에는 그대로 남긴다. 12-2에서 지운 것은 문서 스크롤러용
            DocScrollTopButton이고, 이건 요소 스크롤러용이라 다른 물건이다. */}
        {projMode !== "edit" && <ScrollTopButton ref={projectDetailScrollBtnRef} onClick={scrollProjectDetailToTop} />}

        {projTemplatePrompt === "form" && projTemplatePromptNode}
        {renderMobileProjectOptionsSheet()}
        {confirmDialogNode}
    </>
  );
}
