"use client";

// PHASE 2 ⑫ — Dashboard.tsx의 **본문 확장 편집 다이얼로그**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 4403–4465, 63줄 · 참조 19개 중 전용 2 / 공유 17 — 계획서의 63줄과 일치)
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다**(사용자 지시). 동작·UI 변경 0.
//    state 소유권 변경 0 · 새 Context 0 · ref 소유권 변경 0.
//
// ─── 이 파일에서 **절대 건드리면 안 되는 것 넷** ──────────────────────────────────
//
// 🔴🔴 ① `{...KEEP_EDITOR_FOCUS}` — 삽입 버튼 셋에 **전부** 붙어 있어야 한다.
//    지뢰표: *"`pointerdown` preventDefault로는 포커스를 못 지킨다 — `mousedown`도 같이 막아라.
//    반쪽만 붙이면 같은 지뢰다."* 그래서 **한 벌짜리 spread 객체**로만 쓴다(풀어 쓰지 마라).
//    점검: `grep -c "KEEP_EDITOR_FOCUS"`의 **두 파일 합계가 이동 전 개수와 같아야** 한다.
//
// 🔴🔴 ② 삽입 버튼의 **화살표 래핑**. 원본 주석 그대로 옮겼다 —
//    *"`onClick={insertPendingAtCursor}`로 함수를 그대로 넘기면 안 된다. 클릭 이벤트가 첫 인자
//    (where)로 들어간다."* `() => void insertPendingAtCursor("start")` 형태를 유지한다.
//    💀 `insertPendingAtCursor`는 Dashboard의 `activeMemoEditorRef()`로 **위에 뜬 에디터를 골라**
//    삽입한다(지뢰표 "에디터 handle ref는 화면 수만큼 있다"). 여기로 내리면 그 선택이 두 벌이 된다.
//
// 🔴🔴 ③ `bodyEditorHandleRef`는 **Dashboard 소유다.** `activeMemoEditorRef()`의 네 후보 중
//    하나이고(`activeDialogKey === "bodyEditor" ? bodyEditorHandleRef : null`), 여기서 새로
//    만들면 "커서 위치에 삽입"이 **보이지 않는 사본**을 집는다(2026-08-25에 실제로 터진 건).
//    `bodyEditorRef`(dialog)도 같다 — `dialogs` 레지스트리에 등록돼 있고 Esc·뒤로가기 핸들러가
//    `el === bodyEditorRef.current`로 비교한다(Dashboard 626절).
//
// 🔴🔴 ④ `onChange`의 **호출 순서**: `setBodyEditorDraftWhileTyping(html)` → autosave.
//    그리고 target에 따라 `scheduleAutosave`(메모) / `scheduleProjectAutosave`(프로젝트)로 갈린다.
//    순서·분기를 바꾸지 마라.
//
// ─── 나머지 규약 (⑤⑧⑩과 동일) ───────────────────────────────────────────────
//   - `closeBodyEditor`는 **Dashboard에 남는다.** 그 함수가 target별로 `setProjContent`+
//     `setProjEditorKey` 또는 `setFormBody`+`setFormSessionKey`를 하고, `close(dialogs.bodyEditor)`와
//     `preBodyEditorDialogKeyRef` 복원까지 한다 — 옮길 물건이 아니다. `onClose`로 받는다.
//   - `useScrollTopButton()` 호출도 Dashboard에 남는다(`resetBodyEditorScroll`을 `openBodyEditor`가
//     쓴다). 여기서는 `scrollRef`/`onScroll`/`scrollBtnRef`/`onScrollToTop` 네 개만 받는다.
//   - `projTemplatePrompt === "bodyEditor"` **게이트 식은 Dashboard에 남기고** 이미 걸러진
//     `projTemplatePromptNode`만 받는다.
//   - `<dialog>`와 `className="glass-dialog full body-editor"`를 **글자 그대로** 둔다.
//     CSS가 `dialog.body-editor` **타입 셀렉터**에 묶여 있다(`02-memo-dialogs.css` 493~506·530절):
//     `.dialog-body-scroll`은 `overflow: hidden`이고 실제 스크롤러는 `.rich-editor-body-wrap`이다.
//   - CSS는 건드리지 않았다.
//
// ⚠️ 관찰(고치지 않았다): `.body-editor`에는 `--kb-inset` 규칙이 **0건**이다 — 지뢰표가 세는
//    "키보드 몫을 비워야 하는 껍데기 넷"에 이 화면은 들어 있지 않다. 이동과 무관한 **기존 상태**이고
//    "옮기면서 고치기 금지"라 그대로 뒀다. 실기기에서 이 화면 키보드 경로를 볼 때 같이 재라.

import type { ReactNode, RefObject } from "react";
import { KEEP_EDITOR_FOCUS, colorInputClass } from "@/lib/dashboard/helpers";
import { PROJECT_BODY_PLACEHOLDER } from "@/lib/project/template";
import { MemoRichEditor, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import { ScrollTopButton, ColorSwatches } from "@/components/dashboard/presentational";
import type { MemoColor } from "@/lib/memo/types";

export type BodyEditorDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  bodyEditorTarget: "memo" | "project";
  formColor: MemoColor;
  setFormColor: (c: MemoColor) => void;
  applyProjectTemplate: (target?: "form" | "bodyEditor") => void;
  autosaveStatusNode: ReactNode;
  projAutosaveStatusNode: ReactNode;
  onClose: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  scrollBtnRef: RefObject<HTMLButtonElement | null>;
  onScrollToTop: () => void;
  // 이 컴포넌트가 읽는 것은 text 하나다. Dashboard의 SelSource는 그 함수 안 로컬 타입이라
  // export가 없다 - 여기서 두 번째 사본을 만들지 않고 필요한 만큼만 좁힌다(구조는 그대로다).
  pendingInsert: { text: string } | null;
  insertPendingAtCursor: (where?: "cursor" | "start" | "end") => void;
  bodyEditorSessionKey: number;
  bodyEditorHandleRef: RefObject<MemoRichEditorHandle | null>;
  bodyEditorDraft: string;
  setBodyEditorDraftWhileTyping: (html: string) => void;
  scheduleAutosave: (overrides?: Partial<{ title: string; content: string }>) => void;
  scheduleProjectAutosave: (overrides?: Partial<{ title: string; status: string; summary: string; content: string }>) => void;
  /** 이미 `projTemplatePrompt === "bodyEditor"`로 걸러진 값. 게이트는 Dashboard에 있다. */
  projTemplatePromptNode: ReactNode;
};

export function BodyEditorDialog({
  dialogRef, onDialogBackdropClick, bodyEditorTarget,
  formColor, setFormColor, applyProjectTemplate,
  autosaveStatusNode, projAutosaveStatusNode, onClose,
  scrollRef, onScroll, scrollBtnRef, onScrollToTop,
  pendingInsert, insertPendingAtCursor,
  bodyEditorSessionKey, bodyEditorHandleRef, bodyEditorDraft, setBodyEditorDraftWhileTyping,
  scheduleAutosave, scheduleProjectAutosave, projTemplatePromptNode,
}: BodyEditorDialogProps) {
  return (
      <dialog className="glass-dialog full body-editor" ref={dialogRef} onClick={onDialogBackdropClick}>
        {/* 🔴 tabIndex={-1} — 프로젝트 상세와 **같은 원인**의 포커스 링을 막는다(2026-09-07).
            `showModal()`은 autofocus가 없으면 트리 순서상 첫 포커스 가능 요소를 잡는다. 여기는
            `dialog.body-editor .dialog-inner { overflow: hidden }`(dashboard.css)이라 컨테이너가
            포커스 후보가 못 되고, 포커스가 그 다음인 `.close-btn`으로 떨어진다 —
            실측으로 `document.activeElement === BUTTON.close-btn`을 확인했다. 그 상태에서
            `[data-theme="dark"] button:focus-visible { outline: rgba(167,139,250,.65) }`가 걸리면
            ✕에 보라색 링이 남는다(프로젝트에서는 그것이 ↶에 붙어 사용자 신고가 됐다).
            `-1`이라 Tab 순서에는 안 들어가고, 스크롤·레이아웃에는 영향이 없다. */}
        <div className="dialog-inner" tabIndex={-1}>
          <div className="dialog-head">
            <div className="body-editor-head-left">
              <h3>{bodyEditorTarget === "project" ? "프로젝트 내용" : "본문 작성"}</h3>
              {/* 색상 선택은 메모 전용 — 프로젝트 화면에는 넣지 않는다 */}
              {bodyEditorTarget === "memo" && <ColorSwatches value={formColor} onChange={setFormColor} />}
              {bodyEditorTarget === "project" && (
                <div className="proj-template-toggle" role="group" aria-label="본문 시작 방식">
                  <button type="button" className="proj-template-btn" onClick={() => applyProjectTemplate("bodyEditor")}>기본 템플릿</button>
                </div>
              )}
            </div>
            <div className="dialog-head-right">
              {bodyEditorTarget === "memo" && autosaveStatusNode}
              {bodyEditorTarget === "project" && projAutosaveStatusNode}
              <button className="close-btn" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className="dialog-body-scroll" ref={scrollRef} onScroll={onScroll}>
            {bodyEditorTarget === "project" && (
              <span className="proj-template-hint">템플릿을 선택하면 기본 구조가 자동으로 입력됩니다.</span>
            )}
            {/* News/Job/AI Trend → 기존 메모 삽입 context는 Quick Editor(bigEditorNode)에서 확장으로
                넘어와도 사라지면 안 된다(9~10절) — bigEditorNode는 언마운트되지만 pendingInsert 자체는
                살아있는 state이므로 여기서도 같은 한 줄 bar를 그대로 보여준다. dialog-body-scroll이
                더 이상 자체 스크롤하지 않고(아래 CSS) Editor 내부만 스크롤하므로, 본문을 아무리
                내려도 이 bar는 화면에 그대로 남는다. */}
            {bodyEditorTarget === "memo" && pendingInsert && (
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
            )}
            <MemoRichEditor
              key={`expand-${bodyEditorSessionKey}`}
              ref={bodyEditorHandleRef}
              initialValue={bodyEditorDraft}
              bodyClassName={`body-editor-textarea ${bodyEditorTarget === "memo" ? colorInputClass(formColor) : ""}`}
              placeholder={bodyEditorTarget === "project" ? PROJECT_BODY_PLACEHOLDER : "본문 — 여기서 길게 써도 됩니다"}
              enableTextColor={bodyEditorTarget === "project"}
              onChange={(html) => {
                setBodyEditorDraftWhileTyping(html);
                if (bodyEditorTarget === "memo") scheduleAutosave({ content: html });
                else scheduleProjectAutosave({ content: html }); // 신규 작성 중이면 editingProjectId가 없어 조용히 무시된다
              }}
            />
            {projTemplatePromptNode}
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button className="save-btn" onClick={onClose}>완료</button>
          </div>
        </div>
        <ScrollTopButton ref={scrollBtnRef} onClick={onScrollToTop} />
      </dialog>
  );
}
