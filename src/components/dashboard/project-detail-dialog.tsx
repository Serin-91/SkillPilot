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
