"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 메모 목록·달력 데이터 (Memo 소유권 리팩토링 2단계).
// 로직은 한 글자도 안 고쳤다 — "옮기면서 고치기 금지".
//
// 여기 모인 것: 목록/달력 state 15개 / 파생값 / ref 1개 / 함수 3개 / useMemo 6개 / effect 4개.
//
// 🔴 여기 **안 들어온** 것과 그 이유 — 되돌리지 마라:
//   ① `patchMemoInLists` — 이름은 목록 갱신인데 몸통 절반이 **편집 폼**이다
//      (`editingMemoId`를 읽고 `setFormImportant`/`setFormPinned`를 부른다 = `useMemoEditSession` 소유).
//      이 훅이 `useMemoEditSession`보다 **먼저** 호출돼야 하므로(그쪽이 이쪽의 setter를 인자로 받는다)
//      여기 넣으면 훅 두 개가 서로를 참조하는 **순환**이 된다. Dashboard에 다리로 남겨 뒀다.
//      1단계에서 `bodyEditor`를 뺀 것과 **같은 종류의 경계**다.
//   ② `openMemoModalAt` / `monthFetchRef` — 목록 state를 쓰지만 `open(dialogs.memo)`까지 하는
//      **화면 전환**이라 SHELL 소유다. 이 훅의 setter를 받아 쓴다.
//   ③ `toggleMemoSelected` / `handleMemoTrashClick` — 선택 **state**만 여기 있고 동작은 Dashboard.
//      `handleMemoTrashClick`은 `askConfirm`·`deleteMemo`까지 부른다.
//
// 🔴 1단계에서 **실제 화면으로 검증된 계약**을 깨지 마라:
//   `patchLocalMemo`(useMemoEditSession 안)가 `setViewMemos` · `setMemosForMonthState` ·
//   `setPostitViewMemo` 셋을 모두 부른다. 앞의 둘이 이 훅의 반환값이다. **셋 중 하나라도 빠지면
//   "메모를 껐다 켜야 반영된다"가 재발한다.**

import { useEffect, useMemo, useRef, useState } from "react";
import type { Memo } from "./types";
import { htmlToPlainText } from "./rich-text";
import { EMPTY_MEMOS, isoDate, groupMemosByDay, type DateRangeMode } from "@/lib/dashboard/helpers";
import { getMemosForMonthAction, getMemosForRangeAction } from "@/lib/actions/memo";

export function useMemoListData(opts: {
  /** page.tsx가 내려주는 오늘 날짜(서버 기준). `todayIso`는 그것을 ISO로 편 값이다. */
  today: { year: number; month0: number; day: number };
  todayIso: string;
  /** 서버 props — 이번 달 메모 / 중요 메모. 각각 로컬 state로 미러링한다. */
  memosForMonth: Memo[] | null | undefined;
  importantMemos: Memo[] | null | undefined;
}) {
  const { today, todayIso, memosForMonth, importantMemos } = opts;

  // 월간 달력 (기획안 6.4·6.7절)
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth0, setViewMonth0] = useState(today.month0);
  const [viewMemos, setViewMemos] = useState<Memo[]>(memosForMonth ?? []);
  // 대시보드 미니 패널(TODAY/주간 미리보기)이 참조하는 이번 달 메모 — router.refresh()의 서버 왕복을 기다리지
  // 않고 메모 생성/수정/삭제 직후 바로 반영되도록 로컬 상태로 미러링한다 (importantMemosState와 같은 패턴)
  const [memosForMonthState, setMemosForMonthState] = useState<Memo[] | null>(memosForMonth ?? null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMemosForMonthState(memosForMonth ?? null), [memosForMonth]);
  const [viewLoading, setViewLoading] = useState(false);
  const firstWeekday = new Date(viewYear, viewMonth0, 1).getDay();
  const lastDate = new Date(viewYear, viewMonth0 + 1, 0).getDate();
  const [memoDialogDay, setMemoDialogDay] = useState(today.day);
  const memoDialogDateIso = isoDate(viewYear, viewMonth0, memoDialogDay);

  const navigatingRef = useRef(false);
  async function goToMonth(delta: number) {
    if (navigatingRef.current) return; // setViewLoading은 비동기라 같은 틱의 중복 클릭엔 못 미친다
    navigatingRef.current = true;
    let y = viewYear, m = viewMonth0 + delta;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewLoading(true);
    try {
      const memos = await getMemosForMonthAction(y, m);
      setViewYear(y);
      setViewMonth0(m);
      setViewMemos(memos);
      setMemoDialogDay(1);
    } finally {
      setViewLoading(false);
      navigatingRef.current = false;
    }
  }
  function goToToday() {
    setViewYear(today.year);
    setViewMonth0(today.month0);
    setViewMemos(memosForMonthState ?? []);
    setMemoDialogDay(today.day);
  }

  const dayMemos = useMemo(
    () => viewMemos.filter((m) => m.start_date <= memoDialogDateIso && m.end_date >= memoDialogDateIso),
    [viewMemos, memoDialogDateIso]
  );

  const [typeFilter, setTypeFilter] = useState("all");
  const [memoSearch, setMemoSearch] = useState("");
  const isSearchingOrFiltering = memoSearch.trim().length > 0 || typeFilter !== "all";

  // 하단 목록 날짜 범위 필터 — 선택일/이번 달/기간/전체 기간. 메모 유형 필터와 독립적으로 조합된다.
  // 기본값은 "선택일" — 달력에서 날짜를 고른 뒤 그 날의 메모를 바로 보는 게 실제 사용 흐름이다.
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("selected-day");
  const [customRangeStart, setCustomRangeStart] = useState<string | null>(null);
  const [customRangeEnd, setCustomRangeEnd] = useState<string | null>(null);
  // "기간"/"전체 기간"은 현재 불러온 달(viewMemos) 밖의 데이터가 필요해 별도로 조회한다.
  const [rangeMemos, setRangeMemos] = useState<Memo[]>([]);
  useEffect(() => {
    // 취소 가드가 없으면 "기간"에서 시작일을 고른 뒤 종료일을 고칠 때 두 요청이 겹치고
    // **늦게 도착한 쪽이 이긴다** — 화면에 방금 지운 범위의 메모가 남았다.
    let cancelled = false;
    const load = (from: string | null, to: string | null) =>
      getMemosForRangeAction(from, to)
        .then((rows) => { if (!cancelled) setRangeMemos(rows); })
        .catch(() => { if (!cancelled) setRangeMemos([]); });

    if (dateRangeMode === "all") load(null, null);
    else if (dateRangeMode === "custom" && customRangeStart && customRangeEnd) load(customRangeStart, customRangeEnd);
    return () => { cancelled = true; };
  }, [dateRangeMode, customRangeStart, customRangeEnd]);

  // "기간"인데 양쪽 날짜가 덜 찬 구간은 여기서 파생값으로 비운다 — 이펙트에서 setRangeMemos([])를
  // 부르면 렌더가 한 번 더 돌기만 하고 결과는 같다. 예전엔 이 구간을 아무도 처리하지 않아
  // rangeMemos가 **이전 범위 결과를 그대로 들고 있었고**, 아래 목록이 그걸 새 필터의 결과인 것처럼 그렸다.
  const customRangeIncomplete = dateRangeMode === "custom" && (!customRangeStart || !customRangeEnd);
  const memoListScope =
    dateRangeMode === "selected-day" ? dayMemos
    : dateRangeMode === "month" ? viewMemos
    : customRangeIncomplete ? EMPTY_MEMOS
    : rangeMemos;

  const filteredMemos = memoListScope.filter((m) => {
    const q = memoSearch.trim().toLowerCase();
    const bodyText = m.content_format === "rich_html" ? htmlToPlainText(m.content ?? "") : (m.content ?? "");
    if (q && !m.title.toLowerCase().includes(q) && !bodyText.toLowerCase().includes(q)) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "unfinished") return m.memo_type === "todo" && m.status !== "completed";
    return m.memo_type === typeFilter;
  });

  async function refreshAfterMemoChange(): Promise<Memo[]> {
    const sameMonth = viewYear === today.year && viewMonth0 === today.month0;
    const [memos, todayMemos] = await Promise.all([
      getMemosForMonthAction(viewYear, viewMonth0),
      sameMonth ? Promise.resolve(null) : getMemosForMonthAction(today.year, today.month0),
    ]);
    setViewMemos(memos);
    setMemosForMonthState(sameMonth ? memos : todayMemos!);
    return sameMonth ? memos : [...memos, ...todayMemos!];
  }

  // 날짜별 메모 목록 다중 선택 삭제 — 휴지통 버튼 하나가 선택모드 진입/취소/삭제를 겸한다
  const [memoSelectionMode, setMemoSelectionMode] = useState(false);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMemoSelectionMode(false); setSelectedMemoIds(new Set()); }, [memoDialogDateIso]);

  // Key Notes — importantMemos는 이미 "Pin 우선 → 날짜순"으로 정렬돼 온다 (6.6절)
  // 서버 새로고침 없이 즉시 반영하기 위해 로컬 상태로 미러링한다 (12절 — 별/고정 토글 속도)
  const [importantMemosState, setImportantMemosState] = useState<Memo[] | null>(importantMemos ?? null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setImportantMemosState(importantMemos ?? null), [importantMemos]);
  const pinnedMemos = (importantMemosState ?? []).filter((m) => m.is_pinned);
  const priorityMemos = (importantMemosState ?? []).filter((m) => !m.is_pinned);

  // 대시보드 미니 패널 — Monthly MEMO 카드는 미리보기 역할만 한다: 오늘이 속한 주간 + TODAY/NEXT
  const weekPreview = useMemo(() => {
    const base = new Date(today.year, today.month0, today.day);
    const dow = base.getDay();
    const monday = new Date(today.year, today.month0, today.day + (dow === 0 ? -6 : 1 - dow));
    const monthMemos = memosForMonthState ?? [];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const iso = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
      return {
        y: d.getFullYear(), m0: d.getMonth(), day: d.getDate(), dow: d.getDay(), iso,
        hasMemo: monthMemos.some((m) => m.start_date <= iso && m.end_date >= iso),
        isToday: iso === todayIso,
      };
    });
  }, [today.year, today.month0, today.day, memosForMonthState, todayIso]);

  const todayMemoItems = useMemo(
    () => (memosForMonthState ?? [])
      .filter((m) => m.start_date <= todayIso && m.end_date >= todayIso)
      .sort((a, b) => Number(b.is_important) - Number(a.is_important)),
    [memosForMonthState, todayIso]
  );
  const nextMemo = useMemo(() => {
    const upcoming = (memosForMonthState ?? [])
      .filter((m) => m.start_date > todayIso)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0] ?? null;
  }, [memosForMonthState, todayIso]);

  // Monthly MEMO 상세 달력 — 이전/다음 달 이동 가능
  const memosByDay = useMemo(
    () => groupMemosByDay(viewMemos, viewYear, viewMonth0, lastDate),
    [viewMemos, viewYear, viewMonth0, lastDate]
  );
  const bigCalCells = useMemo(() => {
    const cells: { day: number | null; numClass: string; memos: Memo[]; overflow: number }[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, numClass: "", memos: [], overflow: 0 });
    for (let d = 1; d <= lastDate; d++) {
      const dayIndex = (firstWeekday + d - 1) % 7;
      let numClass = "";
      if (dayIndex === 0) numClass = "sunday";
      else if (dayIndex === 6) numClass = "saturday";
      const dayMemosForCell = memosByDay.get(d) ?? [];
      cells.push({ day: d, numClass, memos: dayMemosForCell.slice(0, 3), overflow: Math.max(0, dayMemosForCell.length - 3) });
    }
    return cells;
  }, [firstWeekday, lastDate, memosByDay]);

  // 🔴 반환 키는 **호출부 이름을 그대로 유지**하려고 편평하게 낸다(rename 0곳).
  //   훅 밖 사용이 0회인 것은 일부러 뺐다(실측): viewMemos · rangeMemos · importantMemosState ·
  //   setViewLoading · setRangeMemos · firstWeekday · lastDate · customRangeIncomplete ·
  //   memoListScope · dayMemos · memosByDay · navigatingRef.
  //   **다시 넣지 마라** — 목록 원본을 밖에서 직접 만지면 `filteredMemos` 파생 경로가 갈라진다.
  return {
    viewYear, setViewYear,
    viewMonth0, setViewMonth0,
    setViewMemos,
    memosForMonthState, setMemosForMonthState,
    viewLoading,
    memoDialogDay, setMemoDialogDay,
    memoDialogDateIso,
    dateRangeMode, setDateRangeMode,
    customRangeStart, setCustomRangeStart,
    customRangeEnd, setCustomRangeEnd,
    typeFilter, setTypeFilter,
    memoSearch, setMemoSearch,
    isSearchingOrFiltering,
    filteredMemos,
    memoSelectionMode, setMemoSelectionMode,
    selectedMemoIds, setSelectedMemoIds,
    setImportantMemosState,
    pinnedMemos, priorityMemos,
    weekPreview, todayMemoItems, nextMemo, bigCalCells,
    goToMonth, goToToday, refreshAfterMemoChange,
  };
}
