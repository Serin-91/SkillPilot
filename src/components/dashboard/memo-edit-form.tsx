"use client";

// ① 메모 편집 폼 — Dashboard.tsx에서 **그대로 옮겨온** 표현 JSX 3덩어리다(재-Audit 후보 ①).
// 로직·조건식·className·DOM 중첩·이벤트 순서를 한 글자도 안 고쳤다.
//
// 🔴🔴 **이 파일의 존재 이유이자 제1규칙: 메모 편집 폼은 "한 벌"이다.**
//   포스트잇 상세 편집 · 먼슬리 Create(모바일) · "메모로 저장" 셋이 `MemoEditForm` 하나를 쓴다.
//   **폼 마크업을 복사하지 마라** — 2026-08-30 이전에 "메모로 저장"이 이 폼의 사본이었고, 사본이
//   `memoColor`/`onMemoColorChange`를 안 넘겨서 그 화면에만 메모지 색 버튼이 없었다.
//   셋의 차이는 인자로만 준다: editorKey · titleId · scroll · beforeBody · actions.
//   **새 차이가 생기면 인자를 늘려라. 폼을 다시 복사하지 마라.**
//
// 🔴🔴 **editorRef를 인자로 받는 이유** — 세 화면이 동시에 뜨지 않는다는 전제를 코드로 못박기
//   위해서다. 같은 ref를 여러 벌 마운트가 공유하면 마지막 사본이 가져간다(CLAUDE.md 지뢰표).
//   호출부가 화면마다 **다른 ref**를 준다: detailEditorRef / compactEditorRef / bigEditorHandleRef.
//   🔴 ref는 전부 **Dashboard 소유 그대로**다. 이 파일은 받아서 붙이기만 한다 — 여기로 옮기거나
//     여기서 새로 만들지 마라. `postitScrollRef`도 같다.
//
// 🔴 **에디터 인스턴스의 수명은 `key`가 정한다**: `${editorKey ?? "postit-detail"}-${formSessionKey}`.
//   화면마다 editorKey가 다르고 세션이 바뀌면 formSessionKey가 오른다. 이 key를 건드리면
//   타이핑 도중 Tiptap이 remount되어 포커스·히스토리·캐럿이 날아간다. 손대지 마라.
//
// 🔴 호출부(Dashboard)의 마운트 조건과 지점은 이 추출에서 **하나도 바뀌지 않았다.**
//   Dashboard에 `memoHeadActions()`·`quickEditFormNode`·`memoEditForm()` 이름이 그대로 남아 있고
//   몸통만 여기로 왔다 — 그래서 호출부 grep이 추출 전후 공집합이다.

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { STATUS_OPTIONS, colorInputClass, KEEP_EDITOR_FOCUS } from "@/lib/dashboard/helpers";
import { ColorSwatches } from "@/components/dashboard/presentational";
import { MemoTypeDropdown, MiniDatePicker } from "@/components/dashboard/widgets";
import { MemoRichEditor, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import type { MemoColor, MemoType, TodoStatus } from "@/lib/memo/types";

export type MemoHeadActionsProps = {
  editorRef: RefObject<MemoRichEditorHandle | null>;
  editingMemoId: string | null;
  formImportant: boolean;
  setFormImportant: Dispatch<SetStateAction<boolean>>;
  formPinned: boolean;
  setFormPinned: Dispatch<SetStateAction<boolean>>;
  handleTogglePin: (id: string, isPinned: boolean) => Promise<void>;
  setMobileMemoMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export function MemoHeadActions({
  editorRef, editingMemoId, formImportant, setFormImportant,
  formPinned, setFormPinned, handleTogglePin, setMobileMemoMenuOpen,
}: MemoHeadActionsProps) {
  return (
        <div className="mobile-editor-head-actions mobile-postit-head-actions">
        {/* onPointerDown에서 기본동작을 막아 **에디터 포커스를 빼앗지 않는다** - 이게 없으면 버튼을
            탭하는 순간 본문이 blur되고, blur된 뒤의 프로그래매틱 focus는 모바일에서 실패할 수 있다.
            에디터 툴바의 표준 패턴이고, 버튼 자체의 click은 그대로 발생한다.
            undo/redo는 성공 여부를 돌려주므로 실패를 콘솔에 남긴다 - 침묵 지점을 만들지 않는다. */}
          <button type="button" aria-label="실행 취소" {...KEEP_EDITOR_FOCUS}
            onClick={() => { if (editorRef.current?.undo() === false) console.warn("[memo] 실행 취소할 내용이 없다(또는 에디터 미마운트)"); }}><Undo2 size={18} strokeWidth={2} /></button>
          <button type="button" aria-label="다시 실행" {...KEEP_EDITOR_FOCUS}
            onClick={() => { if (editorRef.current?.redo() === false) console.warn("[memo] 다시 실행할 내용이 없다(또는 에디터 미마운트)"); }}><Redo2 size={18} strokeWidth={2} /></button>
          {/* 웹은 별표(★)와 압정(📌)이 따로 있는데 모바일은 버튼이 하나뿐이라, 예전엔 "고정 해제"만 되고
              고정을 걸 수가 없었다. ☆ → ★(중요) → 📌(고정) → ☆ 로 한 바퀴 돌려 웹과 같은 기능을 낸다. */}
          <button type="button" className={`mobile-important-btn ${formImportant || formPinned ? "active" : ""}`} aria-label={formPinned ? "고정 메모" : formImportant ? "중요 메모" : "중요 표시 안 함"} onClick={() => {
            if (formPinned) {
              if (editingMemoId) void handleTogglePin(editingMemoId, true); // 고정 해제
              setFormPinned(false);
              setFormImportant(false);
            } else if (formImportant) {
              if (editingMemoId) void handleTogglePin(editingMemoId, false); // 고정
              setFormPinned(true);
            } else {
              setFormImportant(true);
            }
          }}>{formPinned ? "📌" : formImportant ? "★" : "☆"}</button>
          <button type="button" className="mobile-more-btn" aria-label="메모 더보기" onClick={() => setMobileMemoMenuOpen(true)}>⋮</button>
        </div>
  );
}

export type QuickEditFormProps = {
  formTitle: string;
  setFormTitle: Dispatch<SetStateAction<string>>;
  formType: MemoType;
  setFormType: Dispatch<SetStateAction<MemoType>>;
  formStartDate: string;
  setFormStartDate: Dispatch<SetStateAction<string>>;
  formEndDate: string;
  setFormEndDate: Dispatch<SetStateAction<string>>;
  formBody: string;
  setFormBody: (html: string) => void;
  formColor: MemoColor;
  setFormColor: Dispatch<SetStateAction<MemoColor>>;
  formImportant: boolean;
  setFormImportant: Dispatch<SetStateAction<boolean>>;
  memoDateError: string | null;
  editingMemoId: string | null;
  savingMemo: boolean;
  todayIso: string;
  scheduleAutosave: (overrides?: Partial<{ title: string; content: string }>) => void;
  handleSaveMemo: () => void;
  handleDeleteMemo: (id: string) => void;
  closePostitView: () => void;
};

export function QuickEditForm({
  formTitle, setFormTitle, formType, setFormType, formStartDate, setFormStartDate,
  formEndDate, setFormEndDate, formBody, setFormBody, formColor, setFormColor,
  formImportant, setFormImportant, memoDateError, editingMemoId,
  savingMemo, todayIso, scheduleAutosave, handleSaveMemo,
  handleDeleteMemo, closePostitView,
}: QuickEditFormProps) {
  return (
    <>
      <div className="big-title-row">
        {/* type/autocomplete를 명시한다 — 없으면 크롬이 이 칸을 자동완성 대상으로 보고 키보드 위에
            액세서리 바(비밀번호·카드·위치)를 띄운다. 그 바는 `vv.height`가 빼고 주는 영역이라
            우리가 그릴 수 없고, 메모 편집 중에 화면만 잡아먹는다. 구글·네이버 검색창이 같은
            상황에서 안 뜨는 이유가 이 속성이다(2026-08-28 사용자 지적). 메모 제목은 자동완성할
            값이 아니므로 끄는 게 맞다. 세 벌 전부에 붙인다 — 하나만 붙이면 다른 화면에서 또 뜬다. */}
        <input
          type="text" autoComplete="off"
          className="big-title-input"
          value={formTitle}
          placeholder="제목 (비워두면 자동 생성)"
          onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
        />
        <span className={`star-toggle ${formImportant ? "active" : ""}`} title="중요 메모로 지정" onClick={() => setFormImportant((v) => !v)}>
          {formImportant ? "★" : "☆"}
        </span>
      </div>
      {memoDateError && <div className="memo-date-error" role="alert">{memoDateError}</div>}
      <div className="big-meta-row">
        <MemoTypeDropdown value={formType} onChange={setFormType} />
        <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
        <span>~</span>
        <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
      </div>
      <ColorSwatches value={formColor} onChange={setFormColor} />
      <div className="textarea-row">
        <textarea
          className={`memo-quick-editor big-body-input ${colorInputClass(formColor)}`}
          placeholder="간단한 내용을 입력하세요..."
          value={formBody}
          onChange={(e) => { setFormBody(e.target.value); scheduleAutosave({ content: e.target.value }); }}
        />
      </div>
      <div className="form-actions postit-edit-actions" style={{ marginTop: 16 }}>
        <button className="cancel-btn" onClick={closePostitView}>취소</button>
        <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
        {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>🗑 삭제</button>}
      </div>
    </>
  );
}

export type MemoEditFormProps = {
  editorRef: RefObject<MemoRichEditorHandle | null>;
  onCancel: () => void;
  opts?: {
    editorKey?: string;
    titleId?: string;
    scroll?: boolean;
    beforeBody?: ReactNode;
    actions?: ReactNode;
  };
  formTitle: string;
  setFormTitle: Dispatch<SetStateAction<string>>;
  formType: MemoType;
  setFormType: Dispatch<SetStateAction<MemoType>>;
  formStatus: TodoStatus;
  setFormStatus: Dispatch<SetStateAction<TodoStatus>>;
  formStartDate: string;
  setFormStartDate: Dispatch<SetStateAction<string>>;
  formEndDate: string;
  setFormEndDate: Dispatch<SetStateAction<string>>;
  formBody: string;
  setFormBodyWhileTyping: (html: string) => void;
  formColor: MemoColor;
  setFormColor: Dispatch<SetStateAction<MemoColor>>;
  formSessionKey: number;
  memoDateError: string | null;
  savingMemo: boolean;
  todayIso: string;
  scheduleAutosave: (overrides?: Partial<{ title: string; content: string }>) => void;
  handleSaveMemo: () => void;
  openBodyEditor: (target?: "memo" | "project") => void;
  postitScrollRef: RefObject<HTMLDivElement | null>;
  onPostitScroll: (e: React.UIEvent<HTMLElement>) => void;
};

export function MemoEditForm({
  editorRef, onCancel, opts,
  formTitle, setFormTitle, formType, setFormType, formStatus, setFormStatus,
  formStartDate, setFormStartDate, formEndDate, setFormEndDate,
  formBody, setFormBodyWhileTyping, formColor, setFormColor, formSessionKey,
  memoDateError, savingMemo, todayIso, scheduleAutosave,
  handleSaveMemo, openBodyEditor, postitScrollRef, onPostitScroll,
}: MemoEditFormProps) {
    const scroll = opts?.scroll ?? true;
    return (
      <>
        <div className="big-title-row">
          {/* type/autocomplete를 명시한다 — 없으면 크롬이 이 칸을 자동완성 대상으로 보고 키보드 위에
              액세서리 바(비밀번호·카드·위치)를 띄운다. 그 바는 `vv.height`가 빼고 주는 영역이라
              우리가 그릴 수 없고, 메모 편집 중에 화면만 잡아먹는다. 구글·네이버 검색창이 같은
              상황에서 안 뜨는 이유가 이 속성이다(2026-08-28 사용자 지적). 메모 제목은 자동완성할
              값이 아니므로 끄는 게 맞다. 세 벌 전부에 붙인다 — 하나만 붙이면 다른 화면에서 또 뜬다. */}
          <input
            {...(opts?.titleId ? { id: opts.titleId, name: opts.titleId } : {})}
            type="text" autoComplete="off"
            className="big-title-input"
            value={formTitle}
            placeholder="제목 (비워두면 자동 생성)"
            onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
          />
        </div>
        {memoDateError && <div className="memo-date-error" role="alert">{memoDateError}</div>}
        <div className="big-meta-row">
          <MemoTypeDropdown value={formType} onChange={setFormType} />
          <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
          <span>~</span>
          <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
          <span className="detail-color-desktop"><ColorSwatches value={formColor} onChange={setFormColor} /></span>
          {formType === "todo" && (
            <div className="status-select-group status-select-group--compact">
              {STATUS_OPTIONS.map(([value, label, color, bg]) => (
                <span
                  key={value}
                  className={`status-option ${formStatus === value ? "active" : ""}`}
                  style={formStatus === value ? { background: bg, color } : undefined}
                  onClick={() => setFormStatus(value)}
                >
                  <span className="dot" style={{ background: color }} />{label}
                </span>
              ))}
            </div>
          )}
          <button className="expand-btn detail-expand-desktop" style={{ marginLeft: "auto" }} onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>
        <div className="memo-color-action-row detail-color-row-mobile">
          <ColorSwatches value={formColor} onChange={setFormColor} />
          <button className="expand-btn" onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>
        {opts?.beforeBody}
        <div className="textarea-row" {...(scroll ? { ref: postitScrollRef, onScroll: onPostitScroll } : {})}>
          <MemoRichEditor
            key={`${opts?.editorKey ?? "postit-detail"}-${formSessionKey}`}
            ref={editorRef}
            initialValue={formBody}
            bodyClassName={`big-body-input ${colorInputClass(formColor)}`}
            hideToolbar
            memoColor={formColor}
            onMemoColorChange={setFormColor}
            onChange={(html) => { setFormBodyWhileTyping(html); scheduleAutosave({ content: html }); }}
          />
        </div>
        {opts?.actions ?? (
          <div className="form-actions postit-edit-actions" style={{ marginTop: 22 }}>
            <button className="cancel-btn" onClick={onCancel}>취소</button>
            <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
          </div>
        )}
      </>
    );
}
