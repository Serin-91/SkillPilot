"use client";

// Dashboard.tsx의 선택→메모 오버레이 JSX를 **그대로 옮겼다**(들여쓰기 변경 0 · 내용 변경 0).
// 로직·상태 소유권은 `useSelectionToMemo` 훅과 Dashboard에 그대로 있다 — 여기는 렌더링만 한다.
//
// 🔴 `confirmDialogNode`는 Dashboard 소유다(KEEP 영역). 여기서 만들지 않고 prop으로 받아
//   원문과 같은 자리에 그대로 끼운다.
// 🔴 두 노드는 News·Trend·Jobs 다이얼로그에 **node prop**으로 들어간다 — Dashboard의
//   `radialMenuOverlay`/`selectionOverlays` 변수는 그대로 두고 그 값만 이 컴포넌트로 바꿨다.
//   그래서 호출부(3개 다이얼로그)는 한 글자도 안 바뀌었다.

import { RadialSelectionMenu, MobileSelectionActionBar, MiniDatePicker } from "@/components/dashboard/widgets";
import type { Memo } from "@/lib/memo/types";
import type { SelSource } from "@/lib/dashboard/useSelectionToMemo";

type SelectionMenuState = { x: number; y: number; text: string; source: SelSource };
type MemoPickerState = { date: string; memos: Memo[]; content: { mode: string } };
type PendingSaveState = { memoId: string | null; label: string };

export function RadialMenuOverlay({
  selectionMenu, copySelectionText, openMemoPickerForDate, setSelectionMenu, todayIso,
}: {
  selectionMenu: SelectionMenuState;
  copySelectionText: (text: string) => void;
  openMemoPickerForDate: (iso: string, source: SelSource, text: string) => void;
  setSelectionMenu: (v: null) => void;
  todayIso: string;
}) {
  return (
    <>
      <div className="selection-action-desktop" style={{ position: "absolute", top: selectionMenu.y, left: selectionMenu.x, zIndex: 60 }}>
        <RadialSelectionMenu
          onCopy={() => copySelectionText(selectionMenu.text)}
          onPickDate={(iso) => openMemoPickerForDate(iso, selectionMenu.source, selectionMenu.text)}
          onClose={() => setSelectionMenu(null)}
          todayIso={todayIso}
        />
      </div>
      <MobileSelectionActionBar
        text={selectionMenu.text}
        onCopy={() => copySelectionText(selectionMenu.text)}
        onPickDate={(iso) => openMemoPickerForDate(iso, selectionMenu.source, selectionMenu.text)}
        onClose={() => setSelectionMenu(null)}
        todayIso={todayIso}
      />
    </>
  );
}

export function SelectionOverlays({
  memoPicker, pendingSave, setMemoPicker, setPendingSave,
  changeMemoPickerDate, confirmPendingSave, todayIso, confirmDialogNode,
}: {
  memoPicker: MemoPickerState | null;
  pendingSave: PendingSaveState | null;
  setMemoPicker: (v: null) => void;
  setPendingSave: (v: PendingSaveState | null) => void;
  changeMemoPickerDate: (iso: string) => Promise<void>;
  confirmPendingSave: () => void;
  todayIso: string;
  confirmDialogNode: React.ReactNode;
}) {
  return (
    <>
      {memoPicker && !pendingSave && (
        <div className="postit-overlay open" onClick={() => setMemoPicker(null)}>
          <div className="panel copy-picker" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setMemoPicker(null)}>✕</button>
            <div className="copy-picker-title">
              {memoPicker.date} {memoPicker.content.mode === "selection" ? "메모로 복사" : "메모에 전체 저장"}
            </div>
            {/* 저장할 날짜를 여기서 바꿀 수 있다(웹·모바일 공통) — 뉴스/채용공고/AI Trend 전체 저장도
                오늘로 고정되지 않고 원하는 날짜의 메모에 넣을 수 있어야 한다는 요청. */}
            <div className="copy-picker-date-row">
              <span className="copy-picker-date-label">저장 날짜</span>
              <MiniDatePicker
                value={memoPicker.date}
                onChange={(iso) => { void changeMemoPickerDate(iso); }}
                todayIso={todayIso}
              />
              {/* 웹에서는 "저장 날짜 · 달력 · +새 메모 생성"이 한 줄이고 그 아래로 목록이 이어진다.
                  그래서 버튼을 날짜 행의 형제가 아니라 **자식**으로 둔다 — 형제로 두면 CSS만으로는
                  같은 줄에 못 올린다(부모가 세로 스택이다).
                  모바일은 이 행이 wrap돼서 버튼이 예전처럼 아래 한 줄을 통째로 쓴다. */}
              <button
                type="button" className="idea-action-button primary copy-picker-new-btn"
                onClick={() => setPendingSave({ memoId: null, label: "새 메모" })}
              >
                + 새 메모 생성
              </button>
            </div>
            {memoPicker.memos.length > 0 && (
              <div className="copy-picker-list">
                {memoPicker.memos.map((m) => (
                  <div key={m.id} className="mock-item" onClick={() => setPendingSave({ memoId: m.id, label: m.is_auto_title ? "제목 없는 메모" : m.title })}>
                    <div className="t">
                      <span className={`star-toggle ${m.is_important ? "active" : ""}`}>{m.is_pinned ? "📌" : m.is_important ? "★" : "☆"}</span>
                      {m.title}
                    </div>
                    <div className="s">
                      <span className={`type-badge ${m.memo_type}`}>{m.memo_type === "todo" ? "Todo" : m.memo_type === "dev_note" ? "Dev Note" : "Free Note"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {pendingSave && (
        <div className="postit-overlay open" onClick={() => setPendingSave(null)}>
          <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="copy-picker-title">
              {pendingSave.memoId
                ? <>{`"${pendingSave.label}"에`}<br />붙여 넣으시겠습니까?</>
                : "새 메모로 저장하시겠습니까?"}
            </div>
            <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
              <button className="cancel-btn" onClick={() => setPendingSave(null)}>취소</button>
              <button className="save-btn" onClick={confirmPendingSave}>저장</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialogNode}
    </>
  );
}
