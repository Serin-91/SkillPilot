"use client";

// Dashboard.tsx의 Monthly MEMO 다이얼로그 본문(`.dialog-inner`) JSX를 **그대로 옮겼다**
// (들여쓰기만 4칸 줄임 · 내용 변경 0).
//
// 🔴 이 파일은 **조립만** 한다. Memo 소유권은 하나도 안 옮겼다 —
//   `useMemoEditSession`(폼·autosave·저장/삭제)과 `useMemoListData`(목록·달력·필터)가
//   그대로 소유하고, Dashboard가 그 값을 prop으로 내려준다.
// 🔴 `<dialog>` 엘리먼트와 그 안의 형제 노드(postitViewNode · bigEditorNode ·
//   모바일 옵션 시트 · confirmDialogNode)는 **Dashboard에 그대로 남았다** —
//   전부 KEEP 영역이고, 마운트 위치가 곧 동작 계약이라(top layer / backdrop-filter) 옮기면 안 된다.
// 🔴 props가 60개를 넘지만 **Context·giant state object·reducer로 묶지 않는다**(사용자 지시).
//   타입은 새로 만들지 않고 두 훅의 반환 타입에서 `Pick`으로 파생시켜 드리프트를 막는다.

import { Trash2, Undo2, Redo2 } from "lucide-react";
import { MemoTypeDropdown, DateRangeSelector, MiniDatePicker } from "@/components/dashboard/widgets";
import { ColorSwatches } from "@/components/dashboard/presentational";
import { MemoRichEditor, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import { STATUS_OPTIONS, colorInputClass } from "@/lib/dashboard/helpers";
import { useMemoReorder } from "@/lib/dashboard/hooks";
import type { Memo } from "@/lib/memo/types";
import type { useMemoEditSession } from "@/lib/memo/useMemoEditSession";
import type { useMemoListData } from "@/lib/memo/useMemoListData";

type EditSession = ReturnType<typeof useMemoEditSession>;
type ListData = ReturnType<typeof useMemoListData>;

export type MonthlyMemoDialogBodyProps =
  Pick<EditSession,
    | "editingMemoId" | "formTitle" | "setFormTitle" | "formType" | "setFormType"
    | "formStatus" | "setFormStatus" | "formStartDate" | "setFormStartDate"
    | "formEndDate" | "setFormEndDate" | "formImportant" | "setFormImportant"
    | "formColor" | "setFormColor" | "formBody" | "setFormBodyWhileTyping"
    | "formSessionKey" | "savingMemo" | "memoDateError"
    | "scheduleAutosave" | "handleSaveMemo" | "handleDeleteMemo"
  > &
  Pick<ListData,
    | "viewYear" | "viewMonth0" | "viewLoading" | "memoDialogDay" | "setMemoDialogDay"
    | "memoDialogDateIso" | "dateRangeMode" | "setDateRangeMode"
    | "customRangeStart" | "setCustomRangeStart" | "customRangeEnd" | "setCustomRangeEnd"
    | "typeFilter" | "setTypeFilter" | "memoSearch" | "setMemoSearch"
    | "isSearchingOrFiltering" | "filteredMemos" | "memoSelectionMode" | "selectedMemoIds"
    | "bigCalCells" | "goToMonth" | "goToToday"
    | "dayOrderKey" | "commitDayOrder"
  > & {
    memosForMonth: Memo[] | null;
    today: { year: number; month0: number; day: number };
    todayIso: string;
    memoFormOpen: boolean;
    setMemoFormOpen: (v: boolean) => void;
    memoFormRef: React.RefObject<HTMLDivElement | null>;
    compactEditorRef: React.RefObject<MemoRichEditorHandle | null>;
    autosaveStatusNode: React.ReactNode;
    openBodyEditor: (target?: "memo" | "project") => void;
    openCreateMemoForm: () => void;
    openPostitView: (m: Memo) => void;
    handleMemoDialogBack: () => void | Promise<void>;
    handleMemoTrashClick: () => void;
    toggleMemoSelected: (id: string) => void;
    cycleMemoStar: (m: Memo, e: React.MouseEvent) => void | Promise<void>;
    setMobileMemoMenuOpen: (v: boolean) => void;
  };

export function MonthlyMemoDialogBody({
  editingMemoId, formTitle, setFormTitle, formType, setFormType,
  formStatus, setFormStatus, formStartDate, setFormStartDate,
  formEndDate, setFormEndDate, formImportant, setFormImportant,
  formColor, setFormColor, formBody, setFormBodyWhileTyping,
  formSessionKey, savingMemo, memoDateError,
  scheduleAutosave, handleSaveMemo, handleDeleteMemo,
  viewYear, viewMonth0, viewLoading, memoDialogDay, setMemoDialogDay,
  memoDialogDateIso, dateRangeMode, setDateRangeMode,
  customRangeStart, setCustomRangeStart, customRangeEnd, setCustomRangeEnd,
  typeFilter, setTypeFilter, memoSearch, setMemoSearch,
  isSearchingOrFiltering, filteredMemos, memoSelectionMode, selectedMemoIds,
  bigCalCells, goToMonth, goToToday,
  dayOrderKey, commitDayOrder,
  memosForMonth, today, todayIso,
  memoFormOpen, setMemoFormOpen, memoFormRef, compactEditorRef, autosaveStatusNode,
  openBodyEditor, openCreateMemoForm, openPostitView,
  handleMemoDialogBack, handleMemoTrashClick, toggleMemoSelected, cycleMemoStar,
  setMobileMemoMenuOpen,
}: MonthlyMemoDialogBodyProps) {
  return (
    <div className="dialog-inner">
      <div className="dialog-head" style={{ marginBottom: 4 }}>
        <h3 className="monthly-dialog-title"><span>Monthly MEMO</span><small>{memoDialogDateIso}</small></h3>
        <div className="dialog-head-right">
          {memoFormOpen && autosaveStatusNode}
          {memoFormOpen && (
            <div className="mobile-editor-head-actions">
              <button type="button" aria-label="실행 취소" onClick={() => compactEditorRef.current?.undo()}><Undo2 size={18} strokeWidth={2} /></button>
              <button type="button" aria-label="다시 실행" onClick={() => compactEditorRef.current?.redo()}><Redo2 size={18} strokeWidth={2} /></button>
              <button type="button" className={`mobile-important-btn ${formImportant ? "active" : ""}`} aria-label="중요 메모" onClick={() => setFormImportant((v) => !v)}>{formImportant ? "★" : "☆"}</button>
              <button type="button" className="mobile-more-btn" aria-label="메모 더보기" onClick={() => setMobileMemoMenuOpen(true)}>⋮</button>
            </div>
          )}
          <button className="close-btn" onClick={handleMemoDialogBack}>✕</button>
        </div>
      </div>

      <div ref={memoFormRef} className={`memo-form ${memoFormOpen ? "open" : ""}`}>
        <div className="form-meta-row">
          {/* compose mode(모바일)에서만 order:-1로 맨 위로 올리기 위한 래퍼 — display:contents라
              데스크톱/평상시 레이아웃(form-meta-row 순서)에는 전혀 영향을 주지 않는다. */}
          <div className="memo-title-compose-row">
            <input
              id="memo-create-title" name="memo-create-title"
              type="text" className="form-title-input"
              placeholder="제목"
              value={formTitle} onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
            />
          </div>
          <MemoTypeDropdown value={formType} onChange={setFormType} />
          <label className="field-with-label sm"><span className="field-label">시작일</span><MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} /></label>
          <label className="field-with-label sm"><span className="field-label">종료일</span><MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} /></label>
          {memoDateError && <span className="memo-date-error" role="alert">{memoDateError}</span>}
          <span className={`star-toggle ${formImportant ? "active" : ""}`} title="중요 메모로 지정" onClick={() => setFormImportant((v) => !v)}>{formImportant ? "★" : "☆"}</span>
        </div>
        {formType === "todo" && (
          <div className="status-select-group">
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
        <div className="memo-color-action-row">
          <ColorSwatches value={formColor} onChange={setFormColor} />
          <button type="button" className="expand-btn" onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>

        <div className="textarea-row main">
          <MemoRichEditor
            key={`compact-${formSessionKey}`}
            ref={compactEditorRef}
            initialValue={formBody}
            bodyClassName={colorInputClass(formColor)}
            memoColor={formColor}
            onMemoColorChange={setFormColor}
            onChange={(html) => { setFormBodyWhileTyping(html); scheduleAutosave({ content: html }); }}
          />
        </div>

        <div className="form-footer-row">
          {editingMemoId ? (
            <button className="cancel-btn" onClick={() => handleDeleteMemo(editingMemoId)}>삭제</button>
          ) : <div />}
          <div className="form-actions">
            <button className="cancel-btn" onClick={() => setMemoFormOpen(false)}>취소</button>
            <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
          </div>
        </div>
      </div>

      <div className="memo-head" style={{ marginBottom: 8, marginTop: 2 }}>
        <div className="memo-nav">
          <div className="memo-nav-left">
            <span className="nav-group">
              <button type="button" disabled={viewLoading} onClick={() => goToMonth(-1)}>‹</button>
              <span>{viewYear}.{String(viewMonth0 + 1).padStart(2, "0")}</span>
              <button type="button" disabled={viewLoading} onClick={() => goToMonth(1)}>›</button>
            </span>
            <button className="memo-add" onClick={goToToday}>Today</button>
          </div>
          {/* 캘린더 그리드와 같은 폭이라 오른쪽 끝(토요일 컬럼) 위로 온다 */}
          <button className="add-btn memo-create-desktop" onClick={() => (memoFormOpen ? setMemoFormOpen(false) : openCreateMemoForm())}>+ Create</button>
          {/* 모바일 전용 — 데스크톱 버튼은 CSS로 숨기고, 좁은 화면에서 memo-nav-left 옆 그리드 칸에 둔다 */}
          <button className="add-btn memo-create-mobile" onClick={() => (memoFormOpen ? setMemoFormOpen(false) : openCreateMemoForm())}>+ Create</button>
        </div>
      </div>
      <div className="cal-scroll-shell">
        <div className="cal-weekdays"><span style={{ color: "#e0446b" }}>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style={{ color: "#3b6fd8" }}>토</span></div>
        <div className="cal-grid">
          {bigCalCells.map((c, i) => (
            c.day === null ? <div key={i} className="cal-cell empty" /> : (
              <div
                key={i}
                className={`cal-cell${c.day === today.day && viewYear === today.year && viewMonth0 === today.month0 ? " today" : ""}${c.day === memoDialogDay ? " selected" : ""}`}
                onClick={() => { setMemoDialogDay(c.day!); setDateRangeMode("selected-day"); }}
              >
                <div className={`num ${c.numClass}`}>{c.day}</div>
                {c.day === memoDialogDay && (
                  <button className="cal-cell-add" onClick={(e) => { e.stopPropagation(); openCreateMemoForm(); }} title="이 날짜에 메모 추가">+</button>
                )}
                {c.memos.map((m) => (
                  <span
                    key={m.id}
                    className={`memo-chip${m.is_important ? " star" : ""}`}
                    onClick={(e) => { e.stopPropagation(); openPostitView(m); }}
                  >
                    {m.is_important ? "★ " : ""}{m.emoji ? `${m.emoji} ` : ""}{m.title}
                  </span>
                ))}
                {c.overflow > 0 && <span className="cal-more-indicator" aria-label="더 많은 메모가 있어요">+{c.overflow}</span>}
                {/* 모바일에서는 64px 셀에 칩 목록 대신 총 개수 배지만 보여준다(칩/더보기 표시는 CSS로 숨김) */}
                {c.memos.length > 0 && (
                  <span className="mobile-cal-preview" aria-label={`메모 ${c.memos.length + c.overflow}개`}>
                    <span className="mobile-cal-total">{c.memos.length + c.overflow}</span>
                  </span>
                )}
              </div>
            )
          ))}
        </div>
      </div>

      <div className="keynote-divider"><span>✦</span></div>

      <div className="memo-toolbar">
        <input id="memo-search" name="memo-search" className="memo-search" placeholder="제목·본문 검색" value={memoSearch} onChange={(e) => setMemoSearch(e.target.value)} />
        <DateRangeSelector
          mode={dateRangeMode}
          customStart={customRangeStart}
          customEnd={customRangeEnd}
          todayIso={todayIso}
          onSelectMode={setDateRangeMode}
          onApplyCustomRange={(start, end) => { setCustomRangeStart(start); setCustomRangeEnd(end); setDateRangeMode("custom"); }}
        />
        <div className="memo-trash-wrap">
          <button
            type="button"
            className={`memo-trash-btn ${memoSelectionMode && selectedMemoIds.size > 0 ? "danger" : ""}`}
            onClick={handleMemoTrashClick}
          >
            <Trash2 size={16} strokeWidth={2.2} />
          </button>
          <span className="memo-trash-tooltip">
            {!memoSelectionMode ? "선택 삭제" : selectedMemoIds.size === 0 ? "선택 취소" : `선택한 메모 ${selectedMemoIds.size}개 삭제`}
          </span>
        </div>
        <div className="chip-row">
          {[["all", "전체"], ["todo", "Todo"], ["dev_note", "Dev Note"], ["free_note", "Free Note"], ["unfinished", "미완료"]].map(([key, label]) => (
            <span key={key} className={`chip chip-${key} ${typeFilter === key ? "active" : ""}`} onClick={() => setTypeFilter(key)}>{label}</span>
          ))}
        </div>
      </div>

      <div className="detail-section">
        <div>
          {memosForMonth === null && <div className="hint">로그인하면 메모를 기록할 수 있습니다.</div>}
          {memosForMonth !== null && filteredMemos.length === 0 && (
            <div className="hint">
              {isSearchingOrFiltering ? "검색 결과가 없습니다." : dateRangeMode === "selected-day" ? "이 날의 메모가 없습니다." : "표시할 메모가 없습니다."}
            </div>
          )}
          {/* 🔴 드래그를 켜는 조건 셋 — "선택일" 모드 · 선택(삭제) 모드 아님 · **검색/유형 필터 아님**.
              필터 중에는 목록이 그 날짜의 **일부**라, 드롭하면 보이는 것만 0..k-1로 다시 매겨져
              숨은 메모의 sort_order와 값이 겹친다(순서가 뒤섞인다).
              🔴 key={dayOrderKey} — 날짜가 바뀌면 드래그 상태를 **통째로 새로 시작**한다.
              안 그러면 useMemoReorder의 dragOrder가 남아 기간 메모처럼 두 날짜에 다 있는
              메모가 이전 날짜의 자리에 고정된다(= 날짜 독립성이 깨진다). */}
          <MonthlyDayMemoList
            key={dayOrderKey}
            memos={filteredMemos}
            dragEnabled={dateRangeMode === "selected-day" && !memoSelectionMode && !isSearchingOrFiltering}
            onCommitOrder={commitDayOrder}
            memoSelectionMode={memoSelectionMode}
            selectedMemoIds={selectedMemoIds}
            toggleMemoSelected={toggleMemoSelected}
            cycleMemoStar={cycleMemoStar}
            openPostitView={openPostitView}
          />
        </div>
      </div>
    </div>
  );
}


// Monthly 하단 목록 — **선택한 날짜 안에서만** 드래그로 순서를 바꾼다.
//
// 🔴 달력/기간 메모의 상단 표현(cal-cell·memo-chip)은 여기 없다. 그쪽은 손대지 않는다.
// 🔴 순서 저장소는 Key Notes와 완전히 별개다(memo_day_order vs memo.pin_order).
//    그래서 onCommitOrder를 주입받는다 — 이 컴포넌트는 어디 저장되는지 모른다.
// 🔴 드래그 구현은 Key Notes와 **같은 useMemoReorder/useHoldDrag**를 그대로 쓴다.
//    새 라이브러리를 넣지 않았고, "꾹 눌러야 집힌다(320ms)/10px 넘게 움직이면 스크롤"이라는
//    기존 규칙을 그대로 물려받으므로 모바일 세로 스크롤이 드래그에 먹히지 않는다.
function MonthlyDayMemoList({
  memos, dragEnabled, onCommitOrder, memoSelectionMode, selectedMemoIds,
  toggleMemoSelected, cycleMemoStar, openPostitView,
}: {
  memos: Memo[];
  dragEnabled: boolean;
  onCommitOrder: (orderedIds: string[]) => void;
  memoSelectionMode: boolean;
  selectedMemoIds: Set<string>;
  toggleMemoSelected: (id: string) => void;
  cycleMemoStar: (m: Memo, e: React.MouseEvent) => void | Promise<void>;
  openPostitView: (m: Memo) => void;
}) {
  const { displayed, draggingId, bind } = useMemoReorder(
    memos, false, "monthly-day", openPostitView, onCommitOrder
  );
  // 드래그를 끄면(선택 모드·이번달/기간/전체 보기) 예전 그대로 onClick 한 벌로만 움직인다.
  // 켜면 탭까지 useHoldDrag가 처리하므로 onClick을 같이 달지 않는다(두 번 열린다).
  const rows = dragEnabled ? displayed : memos;
  return (
    <>
      {rows.map((m) => (
        <div
          key={m.id}
          className={`memo-row${draggingId === m.id ? " dragging" : ""}`}
          data-reorder-id={m.id}
          data-reorder-group="monthly-day"
          {...(dragEnabled
            ? bind(m)
            : { onClick: () => (memoSelectionMode ? toggleMemoSelected(m.id) : openPostitView(m)) })}
        >
          {memoSelectionMode && (
            <input
              id={`memo-select-${m.id}`} name={`memo-select-${m.id}`}
              type="checkbox" className="memo-select-checkbox"
              checked={selectedMemoIds.has(m.id)}
              onChange={() => toggleMemoSelected(m.id)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <span
            className={`star-toggle ${m.is_important ? "active" : ""}`}
            title={m.is_pinned ? "고정 해제" : m.is_important ? "고정하기" : "중요 표시"}
            onClick={(e) => void cycleMemoStar(m, e)}
            // 별을 꾹 눌렀을 때 행 전체가 집히지 않게 한다 — 탭(별 토글)은 그대로 동작한다.
            onPointerDown={(e) => e.stopPropagation()}
          >
            {m.is_pinned ? "📌" : m.is_important ? "★" : "☆"}
          </span>
          <div className="body">
            <div className="t"><span className={`type-badge ${m.memo_type}`}>{m.memo_type === "todo" ? "Todo" : m.memo_type === "dev_note" ? "Dev Note" : "Free Note"}</span>{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
            <div className="s">
              {m.status && <span className={`status-pill ${m.status === "planned" ? "planned" : m.status === "in_progress" ? "progress" : "done"}`}>{m.status === "planned" ? "예정" : m.status === "in_progress" ? "진행 중" : "완료"}</span>}
              {m.start_date === m.end_date ? m.start_date : `${m.start_date} ~ ${m.end_date}`}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
