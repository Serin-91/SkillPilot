"use client";

// PHASE 1 ⑦ — Dashboard.tsx의 Idea Build 다이얼로그를 **그대로 옮겨온** 것이다.
// 계획서 §2 결합도 표: 271줄 / 참조 29개 중 23개 전용 / 공유 6. PHASE 1에서 가장 큰 항목이다.
//
// 🔴 **표현 JSX 경계만 분리했다. 로직은 한 글자도 안 옮겼다**(사용자 지시).
//    원본 4677~4947줄과 이 파일의 <dialog>~</dialog> 구간은 **2줄을 빼고 바이트 동일**이다:
//      ① ref={ideaRef} → ref={dialogRef}
//      ② onClick={() => close(dialogs.idea)} → onClick={onCloseClick}
//
// Dashboard에 그대로 남긴 것 (여기로 내리지 마라):
//   - state 전부(13개): ideaMeta · ideaDisplay · ideaGenerating · ideaError · ideaHistoryOpen ·
//     ideaGenMode · ideaSourcePickerOpen · ideaSourceSearch · ideaRandomPulse · ideaRetryPinnedId ·
//     ideaProjectPicker · ideaSaveSearch · pendingIdeaSave · pendingTitleOnlySave · ideaSaveToast
//   - handler 전부: runIdea · viewIdeaVersion · confirmPendingIdeaSave ·
//     confirmSaveIdeaTitleAsProject — **래핑조차 하지 않았다**(실행 순서 보존)
//   - derived: ideaExhausted · ideaPickableProjects · ideaSourceProject (useMemo/파생 계산 이동 금지)
//   - 💀 **ideaView prop 재동기화 effect**(Dashboard 1938절). 자정이 지나 서버가 새 ideaView를
//     내려줘도 마운트 시 1회만 읽는 useState 때문에 **어제 결과/횟수가 남던 버그**의 처방이다.
//   - 💀 타이머 3개: runIdea의 setTimeout(r, 5000)(로딩 최소 노출) · 저장 토스트 1500ms ×2.
//   - 💀 DB 쓰기 경로 전부: runIdeaAction · saveProjectIdea. 여기엔 호출이 하나도 없다.
//
// 🔴 ③ 자료 선택 팝업과 공유하는 state(ideaGenMode · ideaRandomPulse · ideaRetryPinnedId ·
//    ideaPickableProjects)는 **Dashboard가 계속 소유한다.** ③ 파일(idea-source-picker.tsx)은
//    재수정하지 않았다. ⑦은 그 팝업을 `ideaSourcePickerNode` **ReactNode 하나**로만 받는다 —
//    공유 state를 이 파일이 읽지도 쓰지도 않으므로 ③↔⑦ 결합이 늘지 않는다.
// 🔴 `ideaModeSelector` · `ideaPickerBlock` · `ideaSourcePickerNode` · `confirmDialogNode`는
//    Dashboard가 만드는 JSX 변수다. "⑦ 전용으로 보이니 같이 내리자"고 판단하지 않았다(사용자 지시) —
//    ideaModeSelector는 ideaPickerBlock(블록 밖 2000줄)에서도 쓰이고, 내리면 파생 계산이 따라온다.
// 🔴 `<dialog className="ai-direction-dialog">`를 그대로 유지한다. CSS가 dialog 타입 셀렉터에
//    묶여 있고, 이 블록은 **조건 없이 항상 마운트**된다(`&&` 가드 없음).
// 🔴 ✕의 `close(dialogs.idea)` 호출식은 호출부(Dashboard)에 남겼다.
// 🔴 dialog 직속 오버레이 3개(.idea-save-overlay)의 위치를 옮기지 않았다 — 원본 주석이 설명하는
//    backdrop-filter 컨테이닝 블록 문제 때문에 .ai-direction-modal 안으로 들어가면 안 된다.
// CSS는 건드리지 않았다.
//
// ⚠️ 실시간 값 없음 — formatUpdatedAt은 저장된 ISO를 절대시각으로 포맷한다(상대시간이 아니다).

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { IdeaView } from "@/lib/ai/state";
import type { IdeaResult } from "@/lib/ai/idea";
import type { ProjectIdea } from "@/lib/project/types";
import { ideaTechList, ideaResultToText } from "@/lib/ai/idea-text";
import { formatUpdatedAt, formatProjectUpdated, copyText } from "@/lib/dashboard/helpers";
import { SentenceLines, ProjectStatusBadge, AiLoadingStage, AiErrorState } from "@/components/dashboard/presentational";

export type IdeaDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  ideaGenerating: boolean;
  ideaDisplay: { id: string; result: IdeaResult; savedMemoId: string | null } | null;
  ideaError: string | null;
  ideaMeta: IdeaView | null;
  ideaExhausted: boolean;
  ideaHistoryOpen: boolean;
  setIdeaHistoryOpen: Dispatch<SetStateAction<boolean>>;
  runIdea: () => void;
  viewIdeaVersion: (version: number) => void;
  isAdmin: boolean;
  IDEA_MAX: number;
  // 저장 흐름 — 오버레이 3개가 dialog 직속이라 이 컴포넌트가 같이 그린다
  ideaProjectPicker: boolean;
  setIdeaProjectPicker: Dispatch<SetStateAction<boolean>>;
  pendingTitleOnlySave: boolean;
  setPendingTitleOnlySave: Dispatch<SetStateAction<boolean>>;
  pendingIdeaSave: { projectId: string | null; label: string } | null;
  setPendingIdeaSave: Dispatch<SetStateAction<{ projectId: string | null; label: string } | null>>;
  confirmSaveIdeaTitleAsProject: () => void;
  confirmPendingIdeaSave: () => void;
  ideaSaveSearch: string;
  setIdeaSaveSearch: Dispatch<SetStateAction<string>>;
  ideaSaveToast: boolean;
  projectIdeas: ProjectIdea[] | null;
  today: { year: number; month0: number; day: number };
  // Dashboard가 만드는 JSX — 소유권을 옮기지 않기 위해 노드로 받는다
  ideaPickerBlock: ReactNode;
  ideaModeSelector: ReactNode;
  ideaSourcePickerNode: ReactNode;
  confirmDialogNode: ReactNode;
};

export function IdeaDialog({
  dialogRef, onDialogBackdropClick, onCloseClick,
  ideaGenerating, ideaDisplay, ideaError, ideaMeta, ideaExhausted,
  ideaHistoryOpen, setIdeaHistoryOpen, runIdea, viewIdeaVersion,
  isAdmin, IDEA_MAX,
  ideaProjectPicker, setIdeaProjectPicker,
  pendingTitleOnlySave, setPendingTitleOnlySave,
  pendingIdeaSave, setPendingIdeaSave,
  confirmSaveIdeaTitleAsProject, confirmPendingIdeaSave,
  ideaSaveSearch, setIdeaSaveSearch, ideaSaveToast,
  projectIdeas, today,
  ideaPickerBlock, ideaModeSelector, ideaSourcePickerNode, confirmDialogNode,
}: IdeaDialogProps) {
  return (
      <dialog className="ai-direction-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
        <div className="ai-direction-modal">
          {/* 생성 중에는 제목/설명 영역과 Idea ON을 숨기고 중앙 로더에만 집중시킨다(수정지침 4.1절).
              닫기 버튼은 생성 중에도 남긴다 */}
          <div className="ai-modal-header">
            {!ideaGenerating && <span className="ai-modal-header-icon">💡</span>}
            <div className="ai-modal-title-wrap">
              {!ideaGenerating && (
                <>
                  <h3 className="ai-modal-title">Idea Build</h3>
                  <p className="ai-modal-subtitle">프로젝트 아이디어를 분석해<br />확장 방향을 제안해요</p>
                </>
              )}
            </div>
            <div className="ai-modal-header-actions">
              {/* 실제 재생성은 결과 하단의 [재생성] 버튼이 담당한다 — 여기 있는 건 장식용 배지라
                  클릭되지 않는다. 다만 오늘 횟수를 다 쓰면 지금처럼 비활성 상태로 보여준다. */}
              {ideaDisplay && !ideaGenerating && (
                <span
                  className="glass-button idea-btn ai-modal-cta-btn ai-cta-ornament"
                  data-exhausted={ideaExhausted}
                  aria-hidden="true"
                >
                  <span>💡 Idea ON</span>
                </span>
              )}
              <button type="button" className="ai-modal-close" aria-label="닫기" onClick={onCloseClick}>✕</button>
            </div>
          </div>

          {ideaGenerating && (
            <AiLoadingStage title="아이디어를 구체화하는 중..." sub="저장된 프로젝트 내용을 읽고 다음 발전 방향을 정리하고 있어요." />
          )}
          {!ideaGenerating && ideaError && (
            <>
              {ideaPickerBlock}
              <AiErrorState feature="idea" isRetrying={ideaGenerating} onRetry={runIdea} />
            </>
          )}
          {!ideaDisplay && !ideaGenerating && !ideaError && (
            <>
              {ideaPickerBlock}
              <div className="ai-run-step">
                <button className="glass-button idea-btn ai-cta-lg" onClick={runIdea}><span>💡 Idea ON</span></button>
                <div className="hint">저장된 프로젝트 아이디어만 바탕으로 분석합니다.</div>
              </div>
            </>
          )}
          {ideaDisplay && !ideaGenerating && !ideaError && (
            <>
              <div className="idea-badge">✦ IDEA · {String(ideaMeta?.usedCount ?? 1).padStart(2, "0")}</div>

              <div className="idea-result-card">
                <div className="idea-source-label">
                  {ideaDisplay.result.selectionMode === "random" ? "Random Pick" : "직접 선택"} · {ideaDisplay.result.projectStatus}
                </div>
                <h4 className="idea-source-title">{ideaDisplay.result.projectTitle}</h4>
                <div className="idea-source-divider" />

                <div className="idea-direction-hero">
                  <div className="idea-direction-orb">✦</div>
                  <div>
                    <div className="idea-direction-label">추천 방향</div>
                    <h5 className="idea-direction-title"><SentenceLines text={ideaDisplay.result.recommendationTitle} /></h5>
                  </div>
                </div>
                <div className="idea-source-only">🛡 저장된 아이디어 자료만 기반으로 분석했어요</div>

                <div className="idea-section">
                  <div className="idea-section-title">왜 이 방향인가요?</div>
                  <div className="idea-direction-box">
                    <div className="idea-direction-box-icon">◎</div>
                    <p style={{ margin: 0 }}><SentenceLines text={ideaDisplay.result.reason} /></p>
                  </div>
                </div>

                {ideaDisplay.result.whatToBuild && (
                  <div className="idea-section">
                    <div className="idea-section-title">무엇을 만들면 되나요?</div>
                    <p className="idea-section-body"><SentenceLines text={ideaDisplay.result.whatToBuild} /></p>
                  </div>
                )}

                <div className="idea-section">
                  <div className="idea-section-title">핵심 구현</div>
                  <ol className="idea-step-list">
                    {ideaDisplay.result.developmentSteps.map((s, i) => <li key={i}><SentenceLines text={s} /></li>)}
                  </ol>
                </div>

                {ideaDisplay.result.implementationFlow?.length > 0 && (
                  <div className="idea-section">
                    <div className="idea-section-title">구현 흐름</div>
                    <div className="idea-flow">
                      {ideaDisplay.result.implementationFlow.map((step, i) => (
                        <div key={i} className="idea-flow-step">{step}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="idea-section">
                  <div className="idea-section-title">예상 필요 기술</div>
                  <div className="idea-tech-list">
                    {ideaTechList(ideaDisplay.result).map((t) => (
                      <div key={t.name} className="idea-tech-chip">
                        <span className="idea-tech-name">{t.name}</span>
                        {t.reason && <span className="idea-tech-reason">{t.reason}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {ideaDisplay.result.completionCriteria?.length > 0 && (
                  <div className="idea-section">
                    <div className="idea-section-title">완료 기준</div>
                    <ul className="editorial-bullet-list">
                      {ideaDisplay.result.completionCriteria.map((c, i) => <li key={i}><SentenceLines text={c} /></li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="idea-actions">
                <button type="button" className="idea-action-button" onClick={() => copyText(ideaResultToText(ideaDisplay.result))}>📋 전체복사</button>
                <button type="button" className="idea-action-button primary" onClick={() => setIdeaProjectPicker(true)}>📁 프로젝트에 저장</button>
                <button type="button" className="idea-action-button secondary-sky" onClick={() => setPendingTitleOnlySave(true)}>🏷 프로젝트명만 저장</button>
                {ideaSaveToast && <div className="mini-toast idea-save-toast">저장되었습니다.</div>}
              </div>

              {ideaModeSelector}
              <button
                type="button"
                className="idea-regenerate-button"
                disabled={ideaExhausted}
                onClick={runIdea}
              >
                <span className="idea-regenerate-icon">↻</span>
                <span className="idea-regenerate-copy">
                  <span className="idea-regenerate-main">재생성</span>
                  <span className="idea-regenerate-sub">
                    {ideaExhausted
                      ? `오늘의 생성 횟수를 모두 사용했습니다 · ${ideaMeta?.maxCount}/${ideaMeta?.maxCount}`
                      : "다른 확장 방향으로 다시 생성"}
                  </span>
                </span>
              </button>

              <div className="idea-footer">
                <span className="idea-generation-meta">
                  {/* 관리자는 상한이 없으니 n/n 카운터를 아예 숨긴다 — 의미 없는 숫자다(ideaExhausted와 같은 기준). */}
                  {ideaMeta?.updatedAt ? `${formatUpdatedAt(ideaMeta.updatedAt)} 생성` : ""}
                  {!isAdmin && `${ideaMeta?.updatedAt ? " · " : ""}${ideaMeta?.usedCount ?? 0}/${ideaMeta?.maxCount ?? IDEA_MAX}`}
                </span>
                {ideaMeta && ideaMeta.history.length > 0 && (
                  <button type="button" className="history-toggle" aria-expanded={ideaHistoryOpen} onClick={() => setIdeaHistoryOpen((v) => !v)}>
                    History {ideaHistoryOpen ? "︿" : "⌄"}
                  </button>
                )}
              </div>
              {ideaHistoryOpen && ideaMeta && ideaMeta.history.length > 0 && (
                <div className="focus-history-preview">
                  <div className="focus-history-heading">이전 결과</div>
                  <div className="focus-history-grid">
                    {ideaMeta.history.map((h) => (
                      <button
                        type="button" key={h.version} className="focus-history-item"
                        style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                        onClick={() => viewIdeaVersion(h.version)}
                      >
                        <div className="focus-history-item-title">v{h.version}</div>
                        <div className="focus-history-item-meta">{formatUpdatedAt(h.createdAt)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
        {/* 아래 오버레이들은 .ai-direction-modal 안이 아니라 dialog 직속이어야 한다. 전부 position:fixed로
            화면 전체를 덮는 오버레이인데, .ai-direction-modal에 backdrop-filter가 걸려 있어서
            그 안에 두면 fixed의 기준이 뷰포트가 아니라 모달 박스가 된다 — 모달 높이에 따라
            팝업이 화면 중앙이 아닌 엉뚱한 자리(아래쪽)에 떴다. dialog에는 backdrop-filter가 없다.

            ★ .idea-save-overlay 3개도 같은 이유로 여기 있어야 한다(2026-08-24). 모달 안에 두면 fixed가
              사실상 absolute처럼 동작해 모달의 **스크롤 콘텐츠 최상단**에 붙는다 — 아이디어를 생성하고
              저장 버튼까지 스크롤해 내려간 뒤 누르면 "맨 위로 스크롤해 올라가야 팝업이 보이는" 상태가 된다.
              6213줄의 place-items:center는 오버레이 자기 박스 안에서만 가운데였을 뿐이다.
            ※ 데스크톱 크롬 반응형(375px 에뮬레이션)에서는 이 증상이 재현되지 않는다 — 그 환경에서는
              .ai-direction-modal의 backdrop-filter가 none으로 계산돼 fixed가 뷰포트를 기준으로 잡는다.
              실기기에서만 터지므로 반응형 모드 실측으로 "정상"이라 판단하지 말 것. */}
        {ideaDisplay && !ideaGenerating && !ideaError && (
          <>
            {/* .idea-save-overlay — 모바일 규칙(dashboard.css)이 전부 이 클래스를 기준으로 쓰여 있는데
                3000 마크업엔 이 클래스가 아예 안 붙어 있어서 "글씨가 세로로 쏟아지고 배치가 엉망"인
                상태로 방치돼 있었다(규칙은 있는데 걸 고리가 없던 케이스). 3001 기준으로 맞춘다. */}
            {ideaProjectPicker && !pendingIdeaSave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setIdeaProjectPicker(false)}>
                <div className="panel copy-picker" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="idea-picker-back" aria-label="뒤로가기" onClick={() => setIdeaProjectPicker(false)}>‹</button>
                  <button className="close-btn" onClick={() => setIdeaProjectPicker(false)}>✕</button>
                  <div className="copy-picker-head">
                    <div className="copy-picker-title">어느 프로젝트에 저장할까요?</div>
                    <input
                      className="proj-search copy-picker-search" placeholder="프로젝트 검색"
                      value={ideaSaveSearch} onChange={(e) => setIdeaSaveSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button" className="add-btn proj-new-btn copy-picker-new-btn"
                    onClick={() => setPendingIdeaSave({ projectId: null, label: "새 프로젝트" })}
                  >
                    + 새 프로젝트 생성
                  </button>
                  {(projectIdeas ?? []).length > 0 && (
                    <div className="proj-table">
                      <div className="proj-table-row proj-table-head project-table-header">
                        <span className="proj-col-name">프로젝트명</span>
                        <span className="proj-col-summary">한 줄 요약</span>
                        <span className="proj-col-status">상태</span>
                        <span className="proj-col-updated">최근 수정</span>
                      </div>
                      {(projectIdeas ?? [])
                        .filter((p) => p.title.toLowerCase().includes(ideaSaveSearch.trim().toLowerCase()))
                        .map((p) => (
                        <button
                          type="button" key={p.id} className="proj-table-row project-list-row"
                          onClick={() => setPendingIdeaSave({ projectId: p.id, label: p.title })}
                        >
                          <span className="proj-col-name project-list-title">{p.title}</span>
                          <span className="proj-col-summary project-list-summary">{p.summary}</span>
                          <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                          <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, today.year)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {pendingTitleOnlySave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setPendingTitleOnlySave(false)}>
                <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="copy-picker-title">프로젝트명만 저장하시겠습니까?</div>
                  <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                    <button className="cancel-btn" onClick={() => setPendingTitleOnlySave(false)}>취소</button>
                    <button className="save-btn" onClick={confirmSaveIdeaTitleAsProject}>저장</button>
                  </div>
                </div>
              </div>
            )}
            {pendingIdeaSave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setPendingIdeaSave(null)}>
                <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="copy-picker-title">
                    {pendingIdeaSave.projectId ? `"${pendingIdeaSave.label}"에 이어붙이시겠습니까?` : "새 프로젝트로 저장하시겠습니까?"}
                  </div>
                  <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                    <button className="cancel-btn" onClick={() => setPendingIdeaSave(null)}>취소</button>
                    <button className="save-btn" onClick={confirmPendingIdeaSave}>저장</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {ideaSourcePickerNode}
        {confirmDialogNode}
      </dialog>
  );
}
