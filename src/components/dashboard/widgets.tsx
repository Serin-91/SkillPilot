"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 상태 있는 위젯 (PHASE 0 ② 3순위).
// 자체 state·포털을 가진 것들이다. 로직은 한 글자도 안 고쳤다.

import { useEffect, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { type Memo, type MemoType } from "@/lib/memo/types";
import { memoPreview } from "@/lib/memo/rich-text";
import { PROJECT_STATUSES } from "@/lib/project/types";
import { type DayStatus } from "@/lib/actions/admin-status";
import { PROJECT_STATUS_META, postitColorClass, MEMO_TYPE_OPTIONS, type DateRangeMode, DATE_RANGE_OPTIONS, formatRangeLabel, WEEKDAY_LABELS, formatUpdatedAt, CRON_SCHEDULED_TIME_KST, SYSTEM_STATUS_BADGE_CLASS, type SystemStatusErrorState, memberCoverageSuffix, buildSystemOverview, isoDate } from "@/lib/dashboard/helpers";
import { wrapForPortal } from "@/components/dashboard/presentational";
import { useIsoLayoutEffect, useMemoReorder } from "@/lib/dashboard/hooks";

export function ProjectStatusFilterDropdown({ value, onChange, includeAll = true }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const [open, setOpen] = useState(false);
  // 열린 위치를 트리거 기준으로 실측해서 들고 있는다. 패널을 포털로 빼면 조상의 좌표계를
  // 잃어버리므로(=absolute가 기준 삼을 게 없다) fixed + 실측 좌표가 유일한 방법이다.
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const options = includeAll ? ["전체", ...PROJECT_STATUSES] : [...PROJECT_STATUSES];
  const currentSlug = value === "전체" ? "all" : PROJECT_STATUS_META[value]?.slug ?? "idea";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      // 패널은 이제 포털로 나가 있어서 rootRef 밖이다 — 패널 자신도 "안쪽"으로 쳐주지 않으면
      // 항목을 누르는 mousedown이 바깥 클릭으로 잡혀 click이 도착하기 전에 패널이 사라진다.
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // fixed는 화면 기준이라 안쪽 스크롤러가 움직이면 트리거만 떠나고 패널은 제자리에 남는다.
  // 다시 재는 대신 닫는다 — 스크롤했다는 건 대개 목록을 그만 보겠다는 뜻이고, 매 프레임
  // 좌표를 다시 재는 쪽이 훨씬 비싸다. capture로 걸어야 안쪽 스크롤러의 스크롤도 잡힌다.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (open) { setOpen(false); return; }
    const el = rootRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      // 좌표는 **패널이 실제로 붙는 곳 기준**으로 재야 한다. 뷰포트 좌표 + position:fixed로 하면
      // 웹에서 어긋난다 — dialog.glass-dialog에 backdrop-filter:blur(30px)가 걸려 있어서 그 요소가
      // fixed 자식의 containing block이 되기 때문이다(실측: 다이얼로그가 (113,399)에 있으면 fixed의
      // (0,0)이 화면 (114,400)에 그려진다). 모바일은 다이얼로그가 100vw/100dvh 전체화면이라 원점이
      // (0,0)과 같아 어긋남이 0이었고, 그래서 모바일만 멀쩡해 보였다.
      // 그래서 host 기준 상대좌표 + position:absolute로 바꾼다. host(<dialog>)는 자기가 positioned라
      // absolute의 기준이 되고, backdrop-filter가 있든 없든 결과가 같다.
      const host = el.closest("dialog") as HTMLElement | null;
      if (host) {
        const hr = host.getBoundingClientRect();
        setAnchor({ left: r.left - hr.left, top: r.bottom - hr.top + 8, width: r.width });
      } else {
        // 다이얼로그 밖(body에 붙는 경우) — absolute는 문서 기준이라 스크롤량을 더해야 한다.
        setAnchor({ left: r.left + window.scrollX, top: r.bottom + window.scrollY + 8, width: r.width });
      }
    }
    setOpen(true);
  }

  const panel = (
    <div
      ref={panelRef}
      className="proj-filter-panel"
      // 기본 규칙의 absolute/left:0/right:0을 인라인으로 덮는다. width는 데스크톱에서 트리거 폭을
      // 그대로 쓰기 위한 것이고, 모바일은 CSS가 width를 !important로 잡고 있어 그쪽이 이긴다.
      style={anchor ? ({ position: "absolute", left: anchor.left, top: anchor.top, right: "auto", zIndex: 9999, "--anchor-w": `${anchor.width}px` } as React.CSSProperties) : undefined}
    >
      {options.map((o) => {
        const slug = o === "전체" ? "all" : PROJECT_STATUS_META[o]?.slug ?? "idea";
        return (
          <div
            key={o}
            className="project-status-filter-option"
            data-selected={o === value}
            onClick={() => { onChange(o); setOpen(false); }}
          >
            <span className={`project-status-filter-chip project-status-filter-chip--${slug}`} />
            {o}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="proj-filter-dropdown" ref={rootRef}>
      <button type="button" className="proj-filter-trigger" onClick={toggle}>
        <span className="proj-filter-trigger-value">
          <span className={`project-status-filter-chip project-status-filter-chip--${currentSlug}`} />
          {value}
        </span>
        <span className={`proj-filter-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {/* 패널을 포털로 빼는 이유는 두 가지고, 웹과 모바일에서 서로 다르게 드러났다.
          - 웹: 프로젝트 편집 화면의 조상이 .proj-detail-inner.proj-detail-editing{overflow:hidden}이고
            그 안 스크롤러가 overflow-x:hidden이라, absolute 패널이 그 상자에서 그대로 잘렸다.
          - 모바일/PWA: 조상 어딘가가 스태킹 컨텍스트를 만들어 z-index:30이 그 안에 갇히고, 서식
            툴바(sticky) 아래로 깔렸다.
          둘 다 "조상 상자에 갇힌 것"이 원인이라 상자 밖으로 꺼내면 한 번에 풀린다.
          붙이는 곳은 MiniDatePicker와 같다 — 열려 있는 <dialog>(top layer)가 있으면 그 안, 없으면 body.
          dialog 안에 넣어야 showModal()의 top layer 위로 올라간다(z-index로는 top layer를 못 이긴다). */}
      {open && (typeof document !== "undefined"
        ? createPortal(wrapForPortal(panel, rootRef.current), rootRef.current?.closest("dialog") ?? document.body)
        : panel)}
    </div>
  );
}
// 메모 유형(Todo/Dev Note/Free Note) — native select는 브라우저 기본 화살표/팝업이라 앱 톤과 안 맞아서
// 다른 곳(프로젝트 상태 필터)과 같은 custom dropdown 패턴으로 통일한다.
export function MemoTypeDropdown({ value, onChange }: { value: MemoType; onChange: (v: MemoType) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const currentLabel = MEMO_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "Free Note";

  return (
    <div className="memo-type-dropdown" ref={rootRef}>
      <button type="button" className="memo-type-trigger" onClick={() => setOpen((v) => !v)}>
        <span>{currentLabel}</span>
        <span className={`memo-type-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="memo-type-panel">
          {MEMO_TYPE_OPTIONS.map((o) => (
            <div
              key={o.value}
              className={`memo-type-option${o.value === value ? " selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DateRangeSelector({
  mode, customStart, customEnd, todayIso, onSelectMode, onApplyCustomRange,
}: {
  mode: DateRangeMode; customStart: string | null; customEnd: string | null; todayIso: string;
  onSelectMode: (mode: DateRangeMode) => void;
  onApplyCustomRange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"list" | "range">("list");
  const [draftStart, setDraftStart] = useState(customStart ?? todayIso);
  const [draftEnd, setDraftEnd] = useState(customEnd ?? todayIso);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setPanel("list"); }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label =
    mode === "selected-day" ? "선택일"
    : mode === "month" ? "이번 달"
    : mode === "all" ? "전체 기간"
    : customStart && customEnd ? formatRangeLabel(customStart, customEnd) : "기간";

  function pick(next: DateRangeMode) {
    if (next === "custom") {
      setDraftStart(customStart ?? todayIso);
      setDraftEnd(customEnd ?? todayIso);
      setRangeError(null);
      setPanel("range");
      return; // 적용을 눌러야 실제 모드가 바뀐다
    }
    onSelectMode(next);
    setOpen(false);
  }

  function applyRange() {
    if (!draftStart || !draftEnd || draftStart > draftEnd) {
      setRangeError("시작일이 종료일보다\n늦을 수 없습니다.");
      return;
    }
    onApplyCustomRange(draftStart, draftEnd);
    setOpen(false);
    setPanel("list");
  }

  return (
    <div className="memo-type-dropdown date-range-dropdown" ref={rootRef}>
      <button type="button" className="memo-type-trigger" onClick={() => { setOpen((v) => !v); setPanel("list"); }}>
        <span>{label}</span>
        <span className={`memo-type-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && panel === "list" && (
        <div className="memo-type-panel">
          {DATE_RANGE_OPTIONS.map(([key, opLabel]) => (
            <div key={key} className={`memo-type-option${mode === key ? " selected" : ""}`} onClick={() => pick(key)}>{opLabel}</div>
          ))}
        </div>
      )}
      {open && panel === "range" && (
        <div className="memo-type-panel date-range-panel">
          <label className="field-with-label sm"><span className="field-label">시작일</span><MiniDatePicker value={draftStart} onChange={setDraftStart} todayIso={todayIso} /></label>
          <label className="field-with-label sm"><span className="field-label">종료일</span><MiniDatePicker value={draftEnd} onChange={setDraftEnd} todayIso={todayIso} /></label>
          {rangeError && <div className="hint" style={{ color: "#e0446b", whiteSpace: "pre-line" }}>{rangeError}</div>}
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => setPanel("list")}>취소</button>
            <button type="button" className="save-btn" onClick={applyRange}>적용</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 참고_구조&스타일/SkillPilot_미니달력_팝업.html 포팅 — 시작일/종료일 입력용 미니 달력 팝업
// inline이면 트리거 버튼 없이 팝업 내용만 그려서 원형 토글 메뉴 등 다른 곳에서도 그대로 재사용한다
export function MiniDatePicker({ value, onChange, inline, portal, popupClassName, todayIso }: { value: string; onChange: (v: string) => void; inline?: boolean; portal?: boolean; popupClassName?: string; todayIso: string }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(value.split("-")[0]));
  const [viewMonth0, setViewMonth0] = useState(() => Number(value.split("-")[1]) - 1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // 아래로 열 자리가 없으면 위로 연다. CSS로는 "자리가 있는가"를 알 수 없어서 여기서 실측한다.
  // 자르는 주체는 대개 <dialog>다(dialog.glass-dialog는 overflow:hidden). 경계는 가장 가까운
  // dialog, 없으면 뷰포트로 잡는다.
  //
  // ★ "아래가 부족하면 무조건 위로"는 틀린 규칙이다. 실측(뷰포트 1000x560, 메모 0개인 날의 저장
  //   팝업): 다이얼로그가 405px뿐이라 아래로 1px 모자란데, 위로 뒤집으면 143px 모자란다 —
  //   더 나빠진다. 그래서 **뒤집는 쪽이 실제로 더 넓을 때만** 뒤집는다.
  //   그러고도 모자라면(양쪽 다 좁은 다이얼로그) 넓은 쪽 높이에 맞춰 달력이 스스로 스크롤한다.
  //   잘려서 안 보이는 것보다 낫고, 어느 컨테이너에서도 잘리지 않는 게 보장된다.
  const [flipUp, setFlipUp] = useState(false);
  const [popupMaxH, setPopupMaxH] = useState<number | null>(null);
  useEffect(() => {
    if (!open) { setFlipUp(false); setPopupMaxH(null); return; }
    const wrap = wrapRef.current, el = popupRef.current;
    if (!wrap || !el) return;
    const dlg = wrap.closest("dialog");
    const box = dlg ? dlg.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const t = wrap.getBoundingClientRect();
    const GAP = 8, EDGE = 6;
    const below = box.bottom - t.bottom - GAP - EDGE;
    const above = t.top - box.top - GAP - EDGE;
    // 높이는 뒤집기 전 값으로 잰다 — 뒤집힌 rect로 다시 재면 상태가 진동한다.
    const need = el.offsetHeight;
    const up = need > below && above > below;
    const room = up ? above : below;
    setFlipUp(up);
    setPopupMaxH(need > room ? Math.max(room, 160) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 편집 대상이 바뀌어(다른 메모 선택 등) value가 갱신되면 팝업의 표시 월도 그 값으로 따라간다 —
  // 그렇지 않으면 이전 편집 대상의 월이 그대로 남아 보인다.
  useEffect(() => {
    setViewYear(Number(value.split("-")[0]));
    setViewMonth0(Number(value.split("-")[1]) - 1);
  }, [value]);

  useEffect(() => {
    if (inline || !open) return;
    // portal이면 popup이 wrapRef 밖(body 쪽)으로 옮겨지므로, popup 내부 클릭까지 같이 확인해야
    // 날짜를 고르는 클릭이 "바깥 클릭"으로 오인돼 즉시 닫히는 걸 막을 수 있다.
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, inline]);

  function nav(delta: number) {
    let ny = viewYear, nm = viewMonth0 + delta;
    if (nm < 0) { nm = 11; ny -= 1; } else if (nm > 11) { nm = 0; ny += 1; }
    setViewYear(ny); setViewMonth0(nm);
  }
  function pick(day: number) {
    onChange(isoDate(viewYear, viewMonth0, day));
    setOpen(false);
  }

  const firstWeekday = new Date(viewYear, viewMonth0, 1).getDay();
  const lastDate = new Date(viewYear, viewMonth0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);

  const popup = (
    <div
      ref={popupRef}
      className={`mini-date-popup${flipUp ? " flip-up" : ""}${portal ? " mobile-options-date-popup" : ""}${popupClassName ? ` ${popupClassName}` : ""}`}
      style={portal
        ? { position: "fixed", zIndex: 9999, top: "auto", bottom: 155, left: "50%", right: "auto", width: 210, margin: 0, padding: 8, borderRadius: 14, transform: "translateX(-50%)", display: "block", visibility: "visible", opacity: 1 }
        : (popupMaxH !== null ? { maxHeight: popupMaxH, overflowY: "auto", overflowX: "hidden" } : undefined)}
    >
      <div className="mini-date-head">
        <button type="button" onClick={() => nav(-1)}>‹</button>
        <span>{viewYear}년 {viewMonth0 + 1}월</span>
        <button type="button" onClick={() => nav(1)}>›</button>
      </div>
      <div className="mini-date-weekdays">
        {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="mini-date-days">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} className="mini-date-day empty" />;
          const iso = isoDate(viewYear, viewMonth0, day);
          const dow = (firstWeekday + day - 1) % 7;
          return (
            <button
              key={i} type="button"
              className={`mini-date-day${dow === 0 ? " sunday" : ""}${dow === 6 ? " saturday" : ""}${iso === todayIso ? " today" : ""}${iso === value ? " selected" : ""}`}
              onClick={() => pick(day)}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );

  if (inline) return <div className="mini-date-picker inline" ref={wrapRef}>{popup}</div>;

  return (
    <div className="mini-date-picker" ref={wrapRef}>
      <button type="button" className="mini-date-trigger" onClick={() => setOpen((v) => !v)}>📅 {value}</button>
      {open && (portal && typeof document !== "undefined" ? createPortal(popup, wrapRef.current?.closest(".mobile-options-backdrop") ?? wrapRef.current?.closest("dialog") ?? document.body) : popup)}
    </div>
  );
}

// 참고_구조&스타일/원형토글메뉴.html 포팅 — 뉴스/채용공고 텍스트 선택 시 뜨는 원형 메뉴 (복사 / 달력)
export function RadialSelectionMenu({
  onCopy, onPickDate, onClose, todayIso,
}: {
  onCopy: () => void;
  onPickDate: (iso: string) => void;
  onClose: () => void;
  todayIso: string;
}) {
  const [fanOpen, setFanOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [toast, setToast] = useState(false);
  const [date, setDate] = useState(todayIso);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!rootRef.current || rootRef.current.contains(target)) return;
      // [치명적] 이 컴포넌트는 모바일에서 CSS(.selection-action-desktop{display:none})로만 숨겨져
      // 있고 실제로는 계속 마운트돼 있다 — 그래서 이 document mousedown 리스너도 살아 있다.
      // 모바일 하단 액션바(복사 / 메모로 저장 / 미니달력 날짜)를 실제로 누르면 여기서 "바깥 클릭"으로
      // 판정해 onClose()=setSelectionMenu(null)이 먼저 돌아 레이어가 통째로 사라졌다. 그래서
      // "메모로 저장을 눌러도 아무것도 안 뜨고", "달력이 떠도 날짜를 고를 수 없었다".
      // (합성 click으로 테스트하면 mousedown이 없어서 재현되지 않는다 — 실제 터치에서만 터진다.)
      if (target instanceof Element && target.closest(".mobile-selection-layer")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function handleCopy() {
    onCopy();
    setToast(true);
    setTimeout(onClose, 900);
  }

  return (
    <div className="radial-menu" ref={rootRef}>
      <button type="button" className={`radial-toggle ${fanOpen ? "open" : ""}`} onClick={() => setFanOpen((v) => !v)}>+</button>
      <button type="button" className={`radial-item radial-copy ${fanOpen ? "open" : ""}`} aria-label="복사" onClick={handleCopy}>📋</button>
      <button
        type="button" className={`radial-item radial-calendar ${fanOpen ? "open" : ""}`} aria-label="날짜 선택"
        onClick={() => setShowCalendar((v) => !v)}
      >
        📅
      </button>
      {showCalendar && (
        <div className="radial-calendar-popup">
          <MiniDatePicker value={date} onChange={(iso) => { setDate(iso); onPickDate(iso); }} inline todayIso={todayIso} />
        </div>
      )}
      {toast && <div className="mini-toast">복사되었습니다.</div>}
    </div>
  );
}

// 모바일에서는 RadialSelectionMenu 대신 선택 영역과 분리된 하단 고정 액션바를 쓴다 (터치로 원형 메뉴를 정확히 누르기 어려움)
export function MobileSelectionActionBar({
  text, onCopy, onPickDate, onClose, todayIso,
}: {
  text: string;
  onCopy: () => void;
  onPickDate: (iso: string) => void;
  onClose: () => void;
  todayIso: string;
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [copied, setCopied] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);

  // 🔴🔴 2026-09-01 — 이 바는 `position: fixed`라 스크롤러 위에 떠서 **본문 마지막 부분을 덮는다.**
  // 실측(375×684, AI트렌드): 바가 화면 하단 **106px**을 가리고, 스크롤을 끝까지 내려도 마지막
  // 섹션의 **83px이 바 뒤에 갇혔다** — 스크롤러의 `padding-bottom`이 24px뿐이라 올라올 자리가 없다.
  // 바 위를 쓸어도 스크롤은 안 되므로 사용자에게는 "스크롤이 안 된다"로 느껴진다.
  //
  // 자기 높이를 실측해서 내려주고, CSS가 스크롤러 끝에 그만큼 빈 칸을 붙인다(dashboard.css의
  // `.dialog-inner::after` 스페이서). 달력을 펼치면 바가 커지는데 `showCalendar`가 바뀌면 이
  // effect가 다시 돌아 값이 따라온다 — **높이를 손으로 찍지 않는다.**
  // ⚠️ `bottom` 오프셋(10px + safe-area)까지 포함해야 실제로 가려지는 높이가 된다 → rect의
  //    아랫변이 아니라 **뷰포트 바닥까지**를 재야 한다(innerHeight - rect.top).
  // ⚠️ rAF/ResizeObserver에 맡기지 않는다 — 이 프로젝트에서 프레임이 안 도는 환경에서 콜백이
  //    0회인 것을 실측했다(HANDOFF 21-1). `useLayoutEffect`는 커밋 직후 동기로 돈다.
  // (이 파일이 이미 쓰는 SSR 안전 래퍼를 쓴다 — 66절 참고)
  useIsoLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const root = document.documentElement;
    root.style.setProperty("--sel-bar-h", `${Math.ceil(window.innerHeight - el.getBoundingClientRect().top)}px`);
    return () => { root.style.removeProperty("--sel-bar-h"); };
  }, [showCalendar, text]);

  function handleCopy() {
    onCopy();
    setCopied(true);
    window.setTimeout(onClose, 800);
  }

  return (
    <div ref={layerRef} className={`mobile-selection-layer${showCalendar ? " calendar-open" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mobile-selection-preview" title={text}>{text}</div>
      {/* [치명적] 달력은 .mobile-selection-actions(3열 grid) 안에 있으면 첫 칸(108px)으로 짜부라져
          날짜 버튼이 8x8px가 되어 실물 터치로는 절대 못 눌렀다 — "메모로 저장을 눌러도 아무것도 안 뜸"의
          정체가 이것이다. 액션 grid 바깥, 레이어(flex column)의 형제로 두어야 폭을 온전히 쓴다. */}
      {showCalendar && (
        <div className="mobile-selection-calendar">
          <MiniDatePicker value={todayIso} onChange={onPickDate} inline todayIso={todayIso} />
        </div>
      )}
      <div className="mobile-selection-actions" aria-label="선택 문장 작업">
        <button type="button" onClick={handleCopy}>📋 {copied ? "복사됨" : "복사"}</button>
        <button type="button" onClick={() => setShowCalendar(true)}>📅 메모로 저장</button>
        <button type="button" className="mobile-selection-close" onClick={onClose} aria-label="선택 작업 닫기">✕</button>
      </div>
    </div>
  );
}

// My Page > System Status(관리자 전용) — Daily Briefing cron이 오늘 정상 돌았는지를 몇 초 안에 보여준다.
export function SystemStatusPanel({
  days, loading, error, fetchedAt, onRefresh,
}: {
  days: DayStatus[] | null; loading: boolean; error: SystemStatusErrorState | null;
  fetchedAt: string | null; onRefresh: () => void;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (loading && !days && !error) return <p className="mypage-hint">불러오는 중...</p>;

  // 권한 없음(forbidden)과 실제 조회 실패(query_failed)를 구분한다 — 전자는 사실상 발생하면 안 되는
  // 상태(탭 자체가 관리자에게만 보임)라 오류처럼 보이지 않게, 후자는 원인과 시각을 그대로 보여준다.
  if (error) {
    return (
      <section className="mypage-card">
        {error.reason === "forbidden" ? (
          <p className="mypage-card-desc" style={{ margin: 0 }}>관리자 권한이 필요합니다.</p>
        ) : (
          <>
            <p className="auth-error" role="status" style={{ margin: "0 0 6px" }}>시스템 상태를 불러오지 못했습니다.</p>
            <p className="sysstatus-error-text">{error.message} · {formatUpdatedAt(error.at)}</p>
          </>
        )}
        <button type="button" className="sysstatus-refresh-btn" style={{ marginTop: 14, marginLeft: 0 }} onClick={onRefresh} disabled={loading}>
          {loading ? "확인 중..." : "상태 다시 확인"}
        </button>
      </section>
    );
  }

  if (!days || days.every((d) => d.label === "기록 없음")) {
    return (
      <section className="mypage-card">
        <p className="mypage-card-desc" style={{ margin: 0 }}>
          아직 실행 기록이 없습니다.<br />다음 Daily Briefing 실행 후 상태가 표시됩니다.
        </p>
        <button type="button" className="sysstatus-refresh-btn" style={{ marginTop: 14, marginLeft: 0 }} onClick={onRefresh} disabled={loading}>
          {loading ? "확인 중..." : "상태 다시 확인"}
        </button>
      </section>
    );
  }

  const [todayStatus, ...history] = days;
  const overview = buildSystemOverview(days);

  return (
    <>
      <section className="mypage-card sysstatus-overview">
        <div className="mypage-card-heading">
          System Overview
          <button type="button" className="sysstatus-refresh-btn" onClick={onRefresh} disabled={loading}>
            {loading ? "확인 중..." : "↻ 상태 다시 확인"}
          </button>
        </div>
        <div className="sysstatus-overview-grid">
          <div className="sysstatus-overview-item">
            <span>전체 상태</span>
            <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[overview.overallLabel]}`}>{overview.overallLabel}</span>
          </div>
          <div className="sysstatus-overview-item"><span>Daily Briefing</span><span>{overview.overallLabel}</span></div>
          <div className="sysstatus-overview-item"><span>News</span><span>{overview.newsText}</span></div>
          <div className="sysstatus-overview-item">
            <span>AI Trend</span>
            <span className="sysstatus-job-breakdown">
              <span>{overview.aiTrend.main}</span>
              {overview.aiTrend.note && <span>{overview.aiTrend.note}</span>}
            </span>
          </div>
          <div className="sysstatus-overview-item">
            <span>Job Description</span>
            <span className="sysstatus-job-breakdown">
              <span>┌ 정상 {overview.jobOk}/{overview.jobEligible}명</span>
              <span>{overview.jobPendingCount > 0 ? "├" : "└"} 이상 {overview.jobIssueCount}명</span>
              {overview.jobPendingCount > 0 && <span>└ 재설정 대기 {overview.jobPendingCount}명</span>}
            </span>
          </div>
          <div className="sysstatus-overview-item"><span>마지막 정상 실행</span><span>{overview.lastSuccessAt ? formatUpdatedAt(overview.lastSuccessAt) : "없음"}</span></div>
          <div className="sysstatus-overview-item"><span>최근 오류</span><span>{overview.lastError ? formatUpdatedAt(overview.lastError.at) : "없음"}</span></div>
        </div>
        {overview.lastError && <p className="sysstatus-error-text" style={{ marginTop: 10 }}>{overview.lastError.message}</p>}
        {fetchedAt && <p className="sysstatus-fetched-at">마지막 갱신: {formatUpdatedAt(fetchedAt)}</p>}
      </section>

      <section className="mypage-card">
        <div className="mypage-card-heading">
          Daily Briefing — 오늘
          <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[todayStatus.label]}`}>{todayStatus.label}</span>
        </div>
        <SystemStatusRows day={todayStatus} />
      </section>

      <section className="mypage-card">
        <div className="mypage-card-heading">최근 실행 기록</div>
        <ul className="sysstatus-history">
          {history.map((day) => (
            <li key={day.date}>
              <button
                type="button" className="sysstatus-history-row"
                onClick={() => setExpandedDate((cur) => (cur === day.date ? null : day.date))}
              >
                <span className="sysstatus-history-date">{day.date.slice(5).replace("-", "/")}</span>
                <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[day.label]}`}>{day.label}</span>
              </button>
              {expandedDate === day.date && (
                <div className="sysstatus-history-detail"><SystemStatusRows day={day} /></div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function SystemStatusRows({ day }: { day: DayStatus }) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const coverage = memberCoverageSuffix(day.newsMemberCovered, day.newsMemberTotal);
  const newsText = day.newsOk === null ? "-" : !day.newsOk ? "실패" : day.newsCount !== null ? `정상 · ${day.newsCount}건${coverage}` : `정상${coverage}`;

  return (
    <div className="sysstatus-rows">
      <div className="sysstatus-row"><span>예약 실행</span><span>{CRON_SCHEDULED_TIME_KST}</span></div>
      <div className="sysstatus-row"><span>실제 시작</span><span>{day.cronStartedAt ? formatUpdatedAt(day.cronStartedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>완료</span><span>{day.cronFinishedAt ? formatUpdatedAt(day.cronFinishedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>News</span><span>{newsText}</span></div>
      {/* 뉴스 파싱 기록 - 단계별 통과/탈락. "정상 4건 / 5명"만 있던 시절에는 4건을 못 채운 날에
          시장에 기사가 없었던 건지 필터가 좁았던 건지 화면에서 구별할 수 없었다. 채용의
          "단계 D/E/F"와 같은 역할이다(admin-status.ts NewsPipelineStats).
          기록을 남기기 전 날짜와 "이미 생성돼 있어 스킵한 날"은 값이 없어 이 줄을 아예 그리지 않는다. */}
      {day.newsStats && (
        <div className="sysstatus-row">
          <span>News 파싱</span>
          <span className="sysstatus-job-breakdown">
            <span>┌ 수집 RSS {day.newsStats.sources}개 → 기사 {day.newsStats.fetched}건</span>
            <span>├ 필터 통과 {day.newsStats.passed}건 (최근 {day.newsStats.lookbackDays}일)</span>
            <span>├ 탈락 중복 {day.newsStats.rejectedDup} / 주제 {day.newsStats.rejectedTopic} / 기간 {day.newsStats.rejectedOld}</span>
            {/* 같은 사건 접기(event-dedupe)는 2026-08-31에 들어왔다 — 그 이전 기록에는 이 필드가
                없으므로 있을 때만 그린다(옛 날짜를 눌렀을 때 "undefined건"이 뜨지 않게). */}
            {day.newsStats.mergedEvents !== undefined && (
              <span>├ 같은 사건 접기 {day.newsStats.mergedEvents}건 → 서로 다른 사건 {day.newsStats.distinct}건</span>
            )}
            <span>└ 후보 {day.newsStats.candidates}건 → AI 선별 {day.newsStats.selected}건</span>
          </span>
        </div>
      )}
      {/* 채용은 회원별 개인화라 날짜 집계만으로는 어느 계정이 문제인지 못 읽는다. 정상 회원은
          숫자로만 세고 이상 회원만 행으로 깐다 — 회원이 늘어도 화면은 이상 수에만 비례한다
          (admin-status.ts JobIssue / JOB_ISSUE_MAX). 예전 "사용자 N명 / 실패 N명"은 legacy
          재설정 대기자까지 분모에 넣어 실제 대상 수를 가렸다. */}
      <div className="sysstatus-row">
        <span>Job</span>
        <span className="sysstatus-job-breakdown">
          <span>┌ 정상 {day.outcome.jobsOk}/{day.outcome.jobsEligible}명</span>
          <span>{day.outcome.jobsPendingReset > 0 ? "├" : "└"} 이상 {day.outcome.jobIssues.length + day.outcome.jobIssuesOmitted}명</span>
          {day.outcome.jobsPendingReset > 0 && <span>└ 재설정 대기 {day.outcome.jobsPendingReset}명</span>}
        </span>
      </div>
      {day.outcome.jobIssues.length > 0 && (
        <div className="sysstatus-row">
          <span>Job 이상</span>
          <span className="sysstatus-job-breakdown">
            {day.outcome.jobIssues.map((issue) => (
              <span key={`${issue.who}-${issue.kind}`}>· {issue.who} — {issue.kind} ({issue.detail})</span>
            ))}
            {day.outcome.jobIssuesOmitted > 0 && <span>· 외 {day.outcome.jobIssuesOmitted}명</span>}
          </span>
        </div>
      )}
      {day.jobsOverwritten !== null && day.jobsOverwritten > 0 && (
        <div className="sysstatus-row">
          <span>Job 재수집</span>
          <span>예약 전 배치 {day.jobsOverwritten}건을 크론이 갈아엎음</span>
        </div>
      )}
      {/* 신규 발견 vs 과거 재추천 — NEW 배지가 왜 0건인지를 가르는 줄이다. 신규 0건이면 그날
          generate.ts가 STEP F(과거 활성 공고 재추천)까지 내려갔다는 뜻이다. 며칠 연속이면
          시장에 신규가 없는 게 아니라 수집(검색 폭·필터)을 봐야 한다는 신호로 읽는다. */}
      <div className="sysstatus-row">
        <span>Job 신규</span>
        <span className="sysstatus-job-breakdown">
          {day.outcome.jobsFresh === null
            ? "-"
            : <><span>┌ 신규 {day.outcome.jobsFresh}건</span><span>└ 재추천 {day.outcome.jobsReserved ?? 0}건</span></>}
        </span>
      </div>
      {/* 결과 점검 — cron이 "성공"이라고 적어둔 것과 별개로, 실제 저장된 결과물을 다시 본 값이다.
          예전엔 이 줄이 없어서 뉴스 3건 + 중복 + 채용 수집 실패가 겹친 날도 "정상"으로 떴다. */}
      <div className="sysstatus-row">
        <span>결과 점검</span>
        <span className="sysstatus-job-breakdown">
          {day.outcome.problems.length === 0
            ? "이상 없음"
            : day.outcome.problems.map((p) => <span key={p}>· {p}</span>)}
        </span>
      </div>
      <div className="sysstatus-row"><span>Fallback</span><span>{day.fallbackAt ? formatUpdatedAt(day.fallbackAt) : "없음"}</span></div>
      <div className="sysstatus-row"><span>최종 생성</span><span>{day.finalGeneratedAt ? formatUpdatedAt(day.finalGeneratedAt) : "-"}</span></div>
      {day.errorMessage && (
        <div className="sysstatus-error">
          <p className="sysstatus-error-label">실패 원인</p>
          <p className={errorExpanded ? "sysstatus-error-text" : "sysstatus-error-text sysstatus-error-text--clamped"}>{day.errorMessage}</p>
          {day.errorMessage.length > 120 && (
            <button type="button" className="sysstatus-error-toggle" onClick={() => setErrorExpanded((v) => !v)}>
              {errorExpanded ? "간략히" : "자세히 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Key Notes의 카드 목록(고정 메모 / 중요 메모) — **드래그 순서 state를 이 안에 가둔다.**
//
// 실측(2026-08-24)이 이 컴포넌트가 존재하는 이유다. 예전엔 순서 state가 Dashboard에 있어서
// 카드를 한 칸 옮길 때마다 Dashboard(단일 컴포넌트, JSX 약 290KB)가 통째로 다시 그려졌다:
//   배포(Vercel): 다이얼로그 열기 156ms / 재열기 63ms  -> 드래그 중 이 비용이 이동마다 반복
//   로컬(dev):    2282ms / 2380ms, long task 2~3초 (dev는 StrictMode로 렌더가 2배)
// state를 여기로 내리면 드래그 중 다시 그려지는 건 이 목록뿐이다. memo()를 씌워 부모가 다른
// 이유로(날씨 폴링 등) 렌더돼도 props가 그대로면 건너뛴다.
//
// 화면에 보이는 결과는 이전과 같아야 한다 — 카드 마크업도 정렬 규칙도 옮기기만 했다.
export const KeynoteCardList = memo(function KeynoteCardList({
  memos, pinned, group, className, onTap,
}: {
  memos: Memo[];
  pinned: boolean;
  group: string;
  className: string;
  onTap: (m: Memo) => void;
}) {
  const { displayed, draggingId, bind } = useMemoReorder(memos, pinned, group, onTap);
  return (
    <div className={className}>
      {displayed.map((m) => (
        <div
          key={m.id}
          className={`postit ${postitColorClass(m.color)}${draggingId === m.id ? " dragging" : ""}`}
          data-reorder-id={m.id}
          data-reorder-group={group}
          {...bind(m)}
        >
          <span className={pinned ? "pin" : "pin star"}>{pinned ? "📌" : "★"}</span>
          <div className="postit-title">{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
          {m.content && <div className="postit-body">{memoPreview(m)}</div>}
          <div className="s">{m.memo_type} · {m.start_date}{m.content_mode === "document" && <span className="memo-detail-badge"> · 상세 ›</span>}</div>
        </div>
      ))}
    </div>
  );
});
