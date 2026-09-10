"use client";

// PHASE 2 ⑩ — Dashboard.tsx의 **Key Notes 다이얼로그**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 4384–4438, 55줄 · 참조 16개 중 전용 2 / 공유 14)
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다**(사용자 지시). 동작·디자인 변경 0.
//   state 소유권 변경 0 · 새 Context 0 · 상태 구조 변경 0.
//
// 🔴🔴 **이 파일에서 가장 위험한 한 줄은 `data-memo-theme={theme}`다.**
//   다크 메모지 8종 팔레트가 **전부 이 속성의 자손 결합자**에 걸려 있다(CSS 규칙 150개,
//   `[data-theme="dark"] [data-memo-theme="dark"] .keynote-sticky` 형태). 지뢰표:
//   *"속성 셀렉터가 자손 결합자면 그 속성은 **래퍼용**이다 — 구조를 옮겨 래퍼가 사라지면
//   조용히 죽는다."* 그래서 이 속성은 **원본과 똑같은 `<dialog>` 엘리먼트에 그대로** 둔다.
//   ⚠️ 다른 요소로 옮기거나 자식에서 다시 붙이지 마라. 그러면 다크에서 메모지가 라이트로 뜬다.
//   ⚠️ 점검은 `grep`이 아니라 `.keynote-sticky`에서 `el.matches('<전체 셀렉터>')`로 해라.
//
// 🔴 `theme`은 **prop으로 받기만 한다.** 계획서 §3이 *"theme 분리는 메모 단계 직전(⑭)"*이라고
//   못박았으므로 여기서 `useTheme()` 같은 것을 만들지 않는다 — 소유자는 여전히 Dashboard다.
//
// 🔴 `postitViewNode` / `bigEditorNode` / `confirmDialogNode`의 **마운트 게이트 식은 Dashboard에
//   남아 있다.** 이 컴포넌트는 **이미 걸러진 node만** 받는다(`ReactNode`).
//   그 게이트(`postitHostDialogKey === "keynotes"` · `activeDialogKey === "keynotes"`)는
//   지뢰표의 *"같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 마지막 사본이 이긴다"*를 막는
//   장치다 — 조건을 자식으로 내리면 그 판단이 두 벌이 된다.
//
//   - ✕의 `close(dialogs.keynotes)` 호출식과 `onCancel`(Esc·하드웨어 뒤로가기) 본문은
//     **호출부(Dashboard)에 남겼다** — ⑤ projects-list-dialog·⑧과 같은 규약이고
//     `close`(55곳)·`dialogs`(58곳)를 자식으로 내리지 않기 위해서다.
//   - `pinnedMemos`/`priorityMemos`는 Dashboard의 `importantMemosState` 필터 결과다.
//     💀 여기서 다시 계산하지 마라 — 그러면 필터가 두 벌이 된다(⑤의 `filteredProjects`와 같은 이유).
//   - `KeynoteCardList`의 `key={...OpenSeq}`는 **드래그 순서 상태를 초기화하는 장치**다.
//     세 곳의 key 문자열을 한 글자도 바꾸지 않았다.
//   - className·이모지·문구·`<span>` 구조를 그대로 유지한다. CSS는 건드리지 않았다.

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { Memo } from "@/lib/memo/types";
import { KeynoteCardList } from "@/components/dashboard/widgets";

export type KeynotesDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  theme: "light" | "dark";
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  onCancel: (e: React.SyntheticEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  /** 어느 그룹을 전체보기로 펼쳤나. null이면 평상시 Key Notes 화면이다. */
  keynoteFullView: "pinned" | "priority" | null;
  setKeynoteFullView: Dispatch<SetStateAction<"pinned" | "priority" | null>>;
  pinnedMemos: Memo[];
  priorityMemos: Memo[];
  keynotesOpenSeq: number;
  onTap: (m: Memo) => void;
  /** 이미 `postitHostDialogKey === "keynotes"`로 걸러진 값. 게이트는 Dashboard에 있다. */
  postitViewNode: ReactNode;
  /** 이미 `activeDialogKey === "keynotes"`로 걸러진 값. 게이트는 Dashboard에 있다. */
  bigEditorNode: ReactNode;
  confirmDialogNode: ReactNode;
};

export function KeynotesDialog({
  dialogRef, theme, onDialogBackdropClick, onCancel, onCloseClick,
  keynoteFullView, setKeynoteFullView,
  pinnedMemos, priorityMemos, keynotesOpenSeq, onTap,
  postitViewNode, bigEditorNode, confirmDialogNode,
}: KeynotesDialogProps) {
  return (
      <dialog
        className="glass-dialog big tonedown" ref={dialogRef} data-memo-theme={theme} onClick={onDialogBackdropClick}
        onCancel={onCancel}
      >
        <div className="dialog-inner">
          <div className="dialog-head">
            {keynoteFullView ? (
              <button type="button" className="keynote-back-btn" onClick={() => setKeynoteFullView(null)}>← Key Notes</button>
            ) : (
              <h3>Key Notes</h3>
            )}
            <button className="close-btn" onClick={onCloseClick}>✕</button>
          </div>

          {keynoteFullView === "pinned" ? (
            <>
              <p className="keynote-group-title">📌 고정 메모 <span className="keynote-drag-hint">{pinnedMemos.length}개 · 드래그해서 순서를 바꿀 수 있어요</span></p>
              {pinnedMemos.length === 0 ? (
                <div className="hint">중요 표시(☆→★)나 고정(📌)한 메모가 여기 모입니다.</div>
              ) : (
                <KeynoteCardList key={`pin-full-${keynotesOpenSeq}`} memos={pinnedMemos} pinned group="pinned" className="keynote-pinned-grid" onTap={onTap} />
              )}
            </>
          ) : keynoteFullView === "priority" ? (
            <>
              {/* 고정 전체보기와 **같은 장치**다 — 같은 뒤로가기, 같은 `.keynote-pinned-grid`,
                  같은 카드(KeynoteCardList). 새 CSS·새 레이아웃을 만들지 않았다.
                  집합도 평상시 중요 메모 영역과 같다(일반 중요 메모만, Pin은 안 섞는다). */}
              <p className="keynote-group-title">
                <span className="priority-star">★</span> 중요 메모 <span className="keynote-drag-hint">{priorityMemos.length}개 · 드래그해서 순서를 바꿀 수 있어요</span>
              </p>
              {priorityMemos.length === 0 ? (
                <div className="hint">중요 표시(☆→★)나 고정(📌)한 메모가 여기 모입니다.</div>
              ) : (
                <KeynoteCardList key={`star-full-${keynotesOpenSeq}`} memos={priorityMemos} pinned={false} group="priority" className="keynote-pinned-grid" onTap={onTap} />
              )}
            </>
          ) : (
            <>
              {pinnedMemos.length === 0 && priorityMemos.length === 0 && <div className="hint">중요 표시(☆→★)나 고정(📌)한 메모가 여기 모입니다.</div>}

              {pinnedMemos.length > 0 && (
                <>
                  <p className="keynote-group-title">
                    📌 고정 메모 <span className="keynote-drag-hint">— 드래그해서 순서를 바꿀 수 있어요</span>
                    <button type="button" className="keynote-fullview-btn" onClick={() => setKeynoteFullView("pinned")}>전체보기</button>
                  </p>
                  <KeynoteCardList key={`pin-${keynotesOpenSeq}`} memos={pinnedMemos} pinned group="pinned" className="keynote-pinned-row" onTap={onTap} />
                </>
              )}

              {pinnedMemos.length > 0 && priorityMemos.length > 0 && <div className="keynote-divider"><span>✦</span></div>}

              {priorityMemos.length > 0 && (
                <>
                  {/* 🔴 이 그룹도 드래그로 순서를 정할 수 있고 그 순서가 pin_order에 저장된다.
                      52b42b2가 날짜순 강제 정렬을 넣으면서 드래그가 재진입마다 되돌아갔고,
                      안내 문구도 "메모 날짜 최신순"으로 바꿨었다 — 둘 다 되돌렸다.
                      날짜 최신순은 **아직 드래그하지 않은 메모의 기본값**일 뿐이다. */}
                  <p className="keynote-group-title">
                    <span className="priority-star">★</span> 중요 메모
                    <span className="keynote-drag-hint">— 드래그해서 순서를 바꿀 수 있어요</span>
                    <button type="button" className="keynote-fullview-btn" onClick={() => setKeynoteFullView("priority")}>전체보기</button>
                  </p>
                  <KeynoteCardList key={`star-${keynotesOpenSeq}`} memos={priorityMemos} pinned={false} group="priority" className="keynote-rest-grid" onTap={onTap} />
                </>
              )}
            </>
          )}
        </div>
        {postitViewNode}
        {bigEditorNode}
        {confirmDialogNode}
      </dialog>
  );
}
