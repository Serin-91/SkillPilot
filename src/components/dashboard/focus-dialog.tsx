"use client";

// PHASE 1 ⑥ — Dashboard.tsx의 Today's Focus 다이얼로그를 **그대로 옮겨온** 것이다.
// 계획서 §2 결합도 표: 88줄 / 참조 15개 중 11개 전용 / 공유 4.
//
// 🔴 **표현 JSX 경계만 분리했다. 로직은 한 글자도 안 옮겼다**(사용자 지시).
//
// Dashboard에 그대로 남긴 것 (여기로 내리지 마라):
//   - state 6개: `focusMeta` `focusDisplay` `focusGenerating` `focusError` `focusHistoryOpen`
//   - handler 3개: `runFocus` `viewFocusVersion` `openFocusMemo` — **래핑조차 하지 않았다**(실행 순서 보존)
//   - 💀 **`focusView` prop 재동기화 effect**(Dashboard 1877절). 자정이 지나 서버가 새 focusView를
//     내려줘도 마운트 시 1회만 읽는 useState 때문에 **어제 결과가 계속 보이던 버그**의 처방이다.
//     이 effect를 여기로 옮기면 그 버그가 되살아난다.
//   - 💀 `runFocus` 안의 `setTimeout(r, 5000)`(로딩 최소 노출) — 타이머는 이동 금지.
//
// 🔴 `<dialog className="ai-direction-dialog">`를 그대로 유지한다. CSS가 dialog 타입 셀렉터에
//    묶여 있고, 이 블록은 **조건 없이 항상 마운트**된다(`&&` 가드 없음) — mount 조건을 바꾸면
//    `<dialog>` 자식이 닫힌 동안에도 살아 있어야 하는 전제가 깨진다.
// 🔴 ✕의 `close(dialogs.focus)` 호출식은 호출부(Dashboard)에 남겼다 — `close`/`dialogs`를
//    자식으로 내리지 않기 위해서다.
// CSS는 건드리지 않았다.
//
// ⚠️ 이 화면에는 **실시간 값이 없다.** `formatUpdatedAt`은 저장된 ISO를 절대시각으로 포맷하므로
//    A/B 스냅샷이 시간차로 흔들리지 않는다(상대시간이 아니다).

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { FocusView } from "@/lib/ai/state";
import type { FocusResult } from "@/lib/ai/focus";
import { formatUpdatedAt } from "@/lib/dashboard/helpers";
import { AiLoadingStage } from "@/components/dashboard/presentational";

export type FocusDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  focusGenerating: boolean;
  focusDisplay: { id: string; result: FocusResult; savedMemoId: string | null } | null;
  focusError: string | null;
  focusMeta: FocusView | null;
  focusHistoryOpen: boolean;
  setFocusHistoryOpen: Dispatch<SetStateAction<boolean>>;
  runFocus: () => void;
  openFocusMemo: (memoId: string, endDate: string) => void;
  viewFocusVersion: (version: number) => void;
};

export function FocusDialog({
  dialogRef, onDialogBackdropClick, onCloseClick,
  focusGenerating, focusDisplay, focusError, focusMeta,
  focusHistoryOpen, setFocusHistoryOpen,
  runFocus, openFocusMemo, viewFocusVersion,
}: FocusDialogProps) {
  return (
      <dialog className="ai-direction-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
        <div className="ai-direction-modal">
          {/* 생성 중에는 제목/설명과 Update Focus를 숨긴다 — 로딩 화면에 Update Focus와 Focus ON이
              동시에 남아 두 개의 죽은 버튼처럼 보이던 문제(닫기만 남긴다) */}
          <div className="ai-modal-header">
            {!focusGenerating && <span className="ai-modal-header-icon">⚡</span>}
            <div className="ai-modal-title-wrap">
              {!focusGenerating && (
                <>
                  <h3 className="ai-modal-title">Today&apos;s Focus</h3>
                  <p className="ai-modal-subtitle">오늘 먼저 확인하면 좋은 항목이에요</p>
                </>
              )}
            </div>
            <div className="ai-modal-header-actions">
              {focusDisplay && !focusGenerating && (
                <button type="button" className="glass-button focus-btn ai-modal-cta-btn" onClick={runFocus}>
                  <span>↻ Update Focus</span>
                </button>
              )}
              <button type="button" className="ai-modal-close" aria-label="닫기" onClick={onCloseClick}>✕</button>
            </div>
          </div>

          {!focusDisplay && !focusGenerating && (
            <div className="ai-run-step">
              <button className="glass-button focus-btn ai-cta-lg" onClick={runFocus}><span>⚡ Focus ON</span></button>
              <div className="hint">추가 입력 없이, 당신의 기록에서 오늘 먼저 확인할 항목을 찾습니다.</div>
            </div>
          )}
          {focusGenerating && (
            <AiLoadingStage title="데이터를 분석하는 중..." sub="메모와 프로젝트 기록에서 오늘 먼저 볼 항목을 고르고 있어요." />
          )}
          {focusError && <div className="hint">{focusError}</div>}
          {focusDisplay && !focusGenerating && (
            <>
              {focusDisplay.result.items.map((r) => {
                const [, statusLabel = "", ddayLabel = ""] = r.meta.split(" · ");
                return (
                  <div key={r.rank} className="focus-card">
                    <div className="focus-rank-number">{String(r.rank).padStart(2, "0")}</div>
                    <h4 className="focus-task-title">{r.title}</h4>
                    <div className="focus-chips">
                      <span className="focus-chip"><span className="focus-chip-dot todo" />Todo</span>
                      <span className="focus-chip"><span className={`focus-chip-dot ${statusLabel === "진행 중" ? "progress" : "todo"}`} />{statusLabel}</span>
                      <span className="focus-chip dday">{ddayLabel}</span>
                    </div>
                    <div className="focus-reason">
                      <div className="focus-reason-title"><span className="focus-reason-icon">✦</span>Why this first?</div>
                      <p className="focus-reason-text">{r.reason}</p>
                      <button type="button" className="focus-open-button" onClick={() => openFocusMemo(r.memoId, r.endDate)}>메모 열기 →</button>
                    </div>
                  </div>
                );
              })}

              <div className="focus-footer">
                <div className="focus-footer-top">
                  <span className="focus-update-badge">↻ {focusMeta?.updatedAt ? `${formatUpdatedAt(focusMeta.updatedAt)} 업데이트` : "업데이트 없음"}</span>
                  {focusMeta && focusMeta.history.length > 0 && (
                    <button type="button" className="history-toggle" aria-expanded={focusHistoryOpen} onClick={() => setFocusHistoryOpen((v) => !v)}>
                      History {focusHistoryOpen ? "︿" : "⌄"}
                    </button>
                  )}
                </div>
                <p className="focus-auto-update-note">언제든 상단의 Update Focus 버튼으로 다시 확인할 수 있어요.</p>
                {focusHistoryOpen && focusMeta && focusMeta.history.length > 0 && (
                  <div className="focus-history-preview">
                    <div className="focus-history-heading">최근 확인 기록</div>
                    <div className="focus-history-grid">
                      {focusMeta.history.map((h) => (
                        <button
                          type="button" key={h.version} className="focus-history-item"
                          style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                          onClick={() => viewFocusVersion(h.version)}
                        >
                          <div className="focus-history-item-title">v{h.version}</div>
                          <div className="focus-history-item-meta">{formatUpdatedAt(h.createdAt)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>
  );
}
