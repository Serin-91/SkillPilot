"use client";

// 포스트잇 확대 보기(`postitViewNode`)의 **표현 전용** 껍데기 — 재-Audit 후보 ④.
//
// 🔴🔴 이 파일은 ref를 하나도 **소유하지 않는다.** `detailEditorRef`·Tiptap 인스턴스·editor key·
//   autosave·폼 조립(`memoEditForm`/`memoHeadActions`)은 전부 Dashboard가 그대로 갖고 있고,
//   편집 상태의 알맹이는 **`children`으로** 들어온다. ⑤·⑦과 같은 규약이다:
//   **ref를 품은 노드를 일반 prop으로 넘기면 `react-hooks/refs`가 새로 뜬다**(⑦에서 실제로 NEW 2건이
//   났고 children으로 되돌리니 0이 됐다). 그래서 여기 `children`을 prop 위치로 바꾸지 마라.
//
// 🔴🔴 **마운트 계약은 Dashboard 것이다.** 이 노드는 memo·keynotes·postitOnly **세 다이얼로그**에
//   삽입되지만 `postitHostDialogKey` 게이트가 그중 한 곳만 통과시켜 화면에 **항상 한 벌**만 뜬다.
//   과거 그 게이트가 없어서 세 벌이 같은 `detailEditorRef`를 공유했고, React가 마지막 사본으로 ref를
//   덮어써서 **안 보이는 에디터가 undo/redo·커서 삽입을 가져갔다**(CLAUDE.md "같은 ref를 여러 벌…").
//   게이트를 이 파일로 가져오지 말고, 호출부 셋을 하나로 합치지도 마라 — 그 셋이 계약이다.
//
// 옮긴 것은 오버레이/메모지 껍데기와 **보기 상태의 마크업**뿐이다(제목·별/고정·메타·본문·버튼 줄).

import type { ReactNode, RefObject } from "react";
import type { Memo, MemoColor } from "@/lib/memo/types";
import { STATUS_OPTIONS, postitColorClass } from "@/lib/dashboard/helpers";
import { RichMemoContent } from "@/components/memo/RichMemoContent";
import { ScrollTopButton } from "@/components/dashboard/presentational";

type PostitViewProps = {
  memo: Memo;
  theme: "light" | "dark";
  editMode: "quick" | "detail" | null;
  /** 편집 중에는 메모지 색이 폼 값을 따라간다(보기 중에는 메모 자신의 색). */
  formColor: MemoColor;
  expanded: boolean;
  onOverlayClick: () => void;
  onCloseClick: () => void;
  onToggleImportant: (e: React.MouseEvent<HTMLSpanElement>) => void;
  onTogglePin: () => void;
  postitScrollRef: RefObject<HTMLDivElement | null>;
  onPostitScroll: (e: React.UIEvent<HTMLElement>) => void;
  scrollBtnRef: React.Ref<HTMLButtonElement>;
  onScrollTop: () => void;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 모바일 "메모 설정" 시트. ref를 품지 않으므로 node prop으로 받는다(가드는 Dashboard). */
  optionsSheetNode: ReactNode;
  /** 편집 상태의 머리 액션·자동저장 표시·폼 한 벌. **전부 Dashboard가 조립한다.** */
  children: ReactNode;
};

export function PostitView({
  memo, theme, editMode, formColor, expanded,
  onOverlayClick, onCloseClick, onToggleImportant, onTogglePin,
  postitScrollRef, onPostitScroll, scrollBtnRef, onScrollTop,
  onExpand, onEdit, onDelete, optionsSheetNode, children,
}: PostitViewProps) {
  return (
    // data-memo-theme — 다크 메모지 8종 팔레트 전체가 이 속성에 걸려 있다(dashboard.css). 없으면
    // 다크 배경 위에 라이트 메모지가 그대로 남는다. 글로벌 테마를 그대로 따라가는 파생값이라
    // 별도 state/저장소가 없다. ★ .postit-overlay open은 파일에 5번 나오는데 **실제 메모지를 그리는 둘**(여기, bigEditorNode)에만 붙인다 —
    // 나머지(프로젝트 템플릿·확인 팝업 등)에 붙이면 그것들까지 메모지 스타일을 먹는다.
    <div className="postit-overlay open" data-memo-theme={theme} onClick={onOverlayClick}>
      <div
        className={`postit big-postit ${postitColorClass(editMode ? formColor : memo.color)} ${expanded ? "expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={onCloseClick}>✕</button>
        {children}
        {!editMode && (
          <>
            <div className="big-title-row">
              <div className="big-title">{memo.emoji ? `${memo.emoji} ` : ""}{memo.title}</div>
              <div className="big-title-actions">
                <span
                  className={`star-toggle ${memo.is_important ? "active" : ""}`}
                  onClick={onToggleImportant}
                >
                  {memo.is_pinned ? "📌" : memo.is_important ? "★" : "☆"}
                </span>
                {memo.is_important && (
                  <button
                    className={`pin-toggle ${memo.is_pinned ? "active" : ""}`}
                    onClick={onTogglePin}
                  >
                    📌
                  </button>
                )}
              </div>
            </div>
            <div className="big-meta">
              {memo.memo_type === "todo" ? "Todo" : memo.memo_type === "dev_note" ? "Dev Note" : "Free Note"}
              {memo.status && (() => {
                const opt = STATUS_OPTIONS.find(([value]) => value === memo.status);
                if (!opt) return null;
                const [, label, color] = opt;
                return (
                  <>
                    {" · "}<span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: "0 0 0 1.5px rgba(255,255,255,.9)" }} />{" "}{label}
                  </>
                );
              })()}
              {" · "}{memo.start_date === memo.end_date ? memo.start_date : `${memo.start_date} ~ ${memo.end_date}`}
            </div>
            <div className="big-body-scroll" ref={postitScrollRef} onScroll={onPostitScroll}>
              <RichMemoContent content={memo.content} format={memo.content_format} className="big-body" />
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              {!expanded && <button className="cancel-btn postit-expand-btn" onClick={onExpand}>전체 보기 ↗</button>}
              <button
                className="edit-btn"
                onClick={onEdit}
              >
                ✎ 수정
              </button>
              <button className="delete-btn" onClick={onDelete}>🗑 삭제</button>
            </div>
          </>
        )}
        {editMode !== "quick" && <ScrollTopButton ref={scrollBtnRef} onClick={onScrollTop} />}
      </div>
      {optionsSheetNode}
    </div>
  );
}
