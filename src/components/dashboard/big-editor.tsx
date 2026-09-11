"use client";

// ⑤ "메모로 저장"(Big Editor) 표현 JSX — Dashboard.tsx에서 **그대로 옮겨왔다**(재-Audit 후보 ⑤).
// className·DOM 중첩·조건식·핸들러 순서를 한 글자도 안 고쳤다.
//
// 🔴🔴 **`memoEditForm(bigEditorHandleRef, closeBigEditor, {...})` 호출은 Dashboard에 남겼다.**
//   그게 이 화면의 orchestration이고, 동시에 **공용 폼의 세 설정 지점 중 하나**다
//   (상세 편집 / 먼슬리 Create / 여기). 그 호출을 이 파일로 옮기면 폼 배선이 두 곳으로 갈라져
//   `memo-edit-form.tsx` 머리말의 "폼은 한 벌 · 새 차이가 생기면 인자를 늘려라"가 깨진다.
//   여기 있는 것은 그 호출에 **넘기는 조각들**(beforeBody·actions)과 **바깥 껍데기** 둘뿐이다.
//
// 🔴 **editor handle(`bigEditorHandleRef`)은 이 파일에 들어오지 않는다.** Dashboard가 소유하고
//   `memoEditForm`에 직접 넘긴다 — 여기로 끌고 오거나 여기서 만들지 마라. Tiptap 인스턴스의
//   생성 위치와 `key`(editorKey "big")도 전부 Dashboard/memo-edit-form 쪽 그대로다.
//
// 🔴 **마운트 조건도 Dashboard 소유다.** 데스크톱 오버레이는 `bigEditorOpen && !bigEditorPage`,
//   모바일 페이지는 `bigEditorPage`로 **서로 배타**이고, 오버레이 쪽은 다시 `activeDialogKey`로
//   한 다이얼로그에서만 그려진다(= 에디터 한 벌). 그 조건식을 이 파일로 내리지 마라.

import type { ReactNode } from "react";
import { KEEP_EDITOR_FOCUS } from "@/lib/dashboard/helpers";
import { postitColorClass } from "@/lib/dashboard/helpers";
import type { MemoColor } from "@/lib/memo/types";

// 삽입 대기 bar — 본문 Editor 바로 위. `memoEditForm`의 `beforeBody`로 들어간다.
export function BigEditorInsertBar({ pendingInsert, insertPendingAtCursor }: {
  pendingInsert: { text: string };
  insertPendingAtCursor: (where: "start" | "end" | "cursor") => void | Promise<void>;
}) {
  return (
          <div className="insert-bar">
            <span className="insert-bar-label">삽입 대기</span>
            <span className="insert-bar-preview" title={pendingInsert.text}>&ldquo;{pendingInsert.text}&rdquo;</span>
            {/* 🔴 세 경로를 준다. `onClick={insertPendingAtCursor}`로 함수를 그대로 넘기면
                안 된다 — 클릭 이벤트가 첫 인자(where)로 들어간다. 반드시 화살표로 감싼다. */}
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("start")}>맨 위</button>
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("end")}>맨 아래</button>
            <button type="button" className="add-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("cursor")}>커서 위치</button>
          </div>
  );
}

// 하단 버튼 줄 — 이 화면은 "취소"가 없고(✕가 그 역할) 대신 삭제가 있다.
export function BigEditorActions({ savingMemo, handleSaveMemo, editingMemoId, handleDeleteMemo }: {
  savingMemo: boolean;
  handleSaveMemo: () => void;
  editingMemoId: string | null;
  handleDeleteMemo: (id: string) => void;
}) {
  return (
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
            {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>삭제</button>}
          </div>
  );
}

// 데스크톱(그리고 예외 경로)의 옛 껍데기 — 화면을 덮는 fixed 오버레이.
export function BigEditorOverlay({ theme, formColor, pendingInsert, onClose, children }: {
  theme: "light" | "dark";
  formColor: MemoColor;
  pendingInsert: unknown;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeBigEditor = onClose;
  const bigEditorInner = children;
  return (
    <div className="postit-overlay open" data-memo-theme={theme} onClick={closeBigEditor}>
      <div className={`postit big-postit ${postitColorClass(formColor)}${pendingInsert ? " has-insert-banner" : ""}`} onClick={(e) => e.stopPropagation()}>
        {bigEditorInner}
      </div>
    </div>
  );
}

// 모바일 "메모로 저장" = 일반 페이지. 메모 수정·먼슬리 Create와 같은 구조다.
export function BigEditorPageShell({ theme, formColor, pendingInsert, children }: {
  theme: "light" | "dark";
  formColor: MemoColor;
  pendingInsert: unknown;
  children: ReactNode;
}) {
  const bigEditorInner = children;
  return (
    <div
      className={`memo-edit-page postit big-postit ${postitColorClass(formColor)}${pendingInsert ? " has-insert-banner" : ""}`}
      data-memo-theme={theme}
    >
      {bigEditorInner}
    </div>
  );
}
