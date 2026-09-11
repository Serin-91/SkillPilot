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
import { orderPriorityMemos, compareByDayOrder } from "./ordering";
import { EMPTY_MEMOS, isoDate, groupMemosByDay, type DateRangeMode } from "@/lib/dashboard/helpers";
import { getMemosForMonthAction, getMemosForRangeAction, getMemoDayOrderAction, getMemoDayOrdersForRangeAction, reorderMemosForDay } from "@/lib/actions/memo";

// 참조가 매번 바뀌면 정렬이 불필요하게 다시 돈다. 빈 순서는 하나를 공유한다.
const EMPTY_DAY_ORDER: ReadonlyMap<string, number> = new Map();

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

  const scopedMemos = memoListScope.filter((m) => {
    const q = memoSearch.trim().toLowerCase();
    const bodyText = m.content_format === "rich_html" ? htmlToPlainText(m.content ?? "") : (m.content ?? "");
    if (q && !m.title.toLowerCase().includes(q) && !bodyText.toLowerCase().includes(q)) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "unfinished") return m.memo_type === "todo" && m.status !== "completed";
    return m.memo_type === typeFilter;
  });

  // 하단 목록의 **날짜별** 수동 순서 (memo_day_order). "선택일" 모드에서만 의미가 있다 —
  // 이번 달/기간/전체 기간은 여러 날짜가 섞여 있어 "그 날의 순서"라는 게 성립하지 않는다.
  // 🔴 Key Notes(pin_order)와 완전히 독립이다. 서로 읽지도 쓰지도 않는다.
  // 🔴 **날짜별로 캐시한다.** 이전에는 `{day, order}` 한 벌이라 날짜를 옮길 때마다 순서를 잃고
  //   fetch가 끝날 때까지 빈 맵으로 그렸다 — 그 창에서 기본 순서가 한 번 보였다가 저장된
  //   순서로 바뀌는 게 모바일에서 눈에 띄는 flicker였다(A → B → A 복귀 시 매번).
  //   날짜를 **키로** 들고 있으면 ① 이미 본 날짜는 첫 프레임부터 저장된 순서다
  //   ② 이전 날짜의 순서가 새 날짜에 새는 것은 여전히 구조적으로 불가능하다(키가 안 맞으면 못 읽는다).
  //   🔴 이 날짜 키를 없애고 맵 하나로 합치지 마라 — 그게 날짜 독립성 계약이다.
  const [dayOrders, setDayOrders] = useState<ReadonlyMap<string, ReadonlyMap<string, number>>>(new Map());

  // 🔴 **보이는 달 전체를 미리 받아 캐시를 채운다.** 날짜를 클릭할 때 그 날짜만 lazy fetch하면
  //   아직 못 받은 날짜에서 목록이 잠깐 비고(dayOrderPending), 그게 실기기에서 "새로 진입한 뒤
  //   처음 방문하는 날짜마다 깜빡 빈다"로 보였다. 달 단위로 미리 채우면 그 창이 아예 없다.
  //   🔴 순서가 **없는** 날짜도 빈 맵으로 넣어 "이미 안다"로 표시해야 게이트가 안 걸린다 —
  //   그러지 않으면 메모 없는 날짜가 계속 pending으로 남는다.
  //   🔴 날짜별 독립성은 그대로다: 서버가 날짜별로 분리해 주고 여기서도 날짜를 키로만 넣는다.
  useEffect(() => {
    if (dateRangeMode !== "selected-day") return;
    let cancelled = false;
    const last = new Date(viewYear, viewMonth0 + 1, 0).getDate();
    const from = isoDate(viewYear, viewMonth0, 1);
    const to = isoDate(viewYear, viewMonth0, last);
    getMemoDayOrdersForRangeAction(from, to)
      .then((byDay) => {
        if (cancelled) return;
        setDayOrders((prev) => {
          const next = new Map(prev);
          for (let d = 1; d <= last; d++) {
            const day = isoDate(viewYear, viewMonth0, d);
            const rows = byDay[day];
            next.set(day, rows ? new Map(Object.entries(rows)) : EMPTY_DAY_ORDER);
          }
          return next;
        });
      })
      .catch(() => { /* 실패해도 아래 단일 날짜 조회가 각자 물러난다 */ });
    return () => { cancelled = true; };
  }, [dateRangeMode, viewYear, viewMonth0]);

  useEffect(() => {
    if (dateRangeMode !== "selected-day") return;
    let cancelled = false;
    const day = memoDialogDateIso;
    // 캐시가 있어도 다시 불러 revalidate한다(다른 기기·탭에서 바뀌었을 수 있다).
    // 화면은 그동안 캐시된 순서를 그대로 쓰므로 깜빡이지 않는다.
    getMemoDayOrderAction(day)
      .then((o) => { if (!cancelled) setDayOrders((prev) => new Map(prev).set(day, new Map(Object.entries(o)))); })
      // 실패했는데 캐시가 있으면 그걸 유지한다 — 빈 맵으로 덮으면 저장된 순서가 화면에서 사라진다.
      .catch(() => { if (!cancelled) setDayOrders((prev) => prev.has(day) ? prev : new Map(prev).set(day, EMPTY_DAY_ORDER)); });
    return () => { cancelled = true; };
  }, [dateRangeMode, memoDialogDateIso]);

  const activeDayOrder = dayOrders.get(memoDialogDateIso) ?? EMPTY_DAY_ORDER;
  // 아직 한 번도 안 불러온 날짜 — 여기서 기본 순서로 그리면 곧 저장된 순서로 바뀌며 튄다.
  // 목록을 잠깐 **안 그리는** 쪽이 틀린 순서를 보여주는 것보다 낫다(호출부가 이 값으로 게이트한다).
  const dayOrderPending = dateRangeMode === "selected-day" && !dayOrders.has(memoDialogDateIso);
  // 저장된 순서가 없으면 compareByDayOrder가 기본 순서로 물러난다(마이그레이션 전에도 동작한다).
  const filteredMemos = dateRangeMode === "selected-day"
    ? [...scopedMemos].sort(compareByDayOrder(activeDayOrder))
    : scopedMemos;

  // 드롭 확정 — 화면을 먼저 바꾸고(optimistic) 서버에 보낸다. 실패하면 이전 순서로 되돌리고
  // 조용히 넘어가지 않는다(사용자가 바꾼 순서가 사라진 걸 모르면 안 된다).
  // 🔴 false를 돌려주면 호출부(useMemoReorder)가 **드래그 중 화면 순서까지** 되돌린다.
  //   dayOrder만 되돌리면 화면은 드래그한 상태로 남는다 — 저장 안 된 순서를 저장된 것처럼
  //   보여주는 게 가장 나쁜 실패다(2026-09-10 실측으로 잡았다).
  async function commitDayOrder(orderedIds: string[]): Promise<boolean> {
    const day = memoDialogDateIso;
    const previousForDay = dayOrders.get(day) ?? EMPTY_DAY_ORDER;
    setDayOrders((prev) => new Map(prev).set(day, new Map(orderedIds.map((id, i) => [id, i]))));
    try {
      await reorderMemosForDay(day, orderedIds);
      return true;
    } catch (e) {
      console.error("[memo] 날짜별 순서 저장 실패", e);
      // 🔴 그 날짜만 되돌린다. 캐시 전체를 스냅샷으로 덮으면 저장을 기다리는 동안 다른 날짜가
      //   받아 둔 순서까지 같이 날아가고, 그 날짜는 다시 fetch되지 않아 기본 순서로 남는다.
      setDayOrders((prev) => new Map(prev).set(day, previousForDay));
      alert("메모 순서를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return false;
    }
  }

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
  // 🔴 Pin 배열은 위 한 줄 그대로다 — 서버 getImportantMemos가 정한
  //   pin_order → pinned_at → start_date 순서를 **여기서 다시 계산하지 않는다.**
  //   Pin 정렬을 클라이언트로 복제하면 계약이 두 벌이 되고 한쪽만 바뀐다.
  // 일반 중요 메모만 다시 세운다 — 수동 순서(pin_order)끼리의 상대 순서는 그대로 두고,
  //   아직 순서가 없는 새 중요 메모만 날짜에 맞는 자리에 끼워 넣는다(orderPriorityMemos).
  //   🔴 무조건 날짜순으로 덮으면 드래그가 재진입마다 되돌아간다(52b42b2가 그랬다).
  const priorityMemos = orderPriorityMemos((importantMemosState ?? []).filter((m) => !m.is_pinned));

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

  // Dashboard TODAY — Monthly 하단에서 **오늘 날짜에** 저장한 수동 순서를 그대로 따른다.
  // 🔴 읽기 전용이다: TODAY 카드에는 드래그가 없고 전용 순서 컬럼/테이블도 만들지 않았다.
  //   순서가 없는 메모는 기존 기본값(중요 우선)을 그대로 쓴다 — 그래서 fallback을 넘긴다.
  //   🔴 Key Notes pin_order와는 무관하다. 여기서 그걸 읽지 마라.
  const todayMemoItems = useMemo(
    () => (memosForMonthState ?? [])
      .filter((m) => m.start_date <= todayIso && m.end_date >= todayIso)
      .sort(compareByDayOrder(
        dayOrders.get(todayIso) ?? EMPTY_DAY_ORDER,
        (a, b) => Number(b.is_important) - Number(a.is_important),
      )),
    [memosForMonthState, todayIso, dayOrders]
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

  // AI Smart Direction 카드 하단의 통계 pill — 이번 달 메모 기준(달력과 같은 데이터 재사용)
  // Dashboard에서 **그대로 옮겨왔다**(계산식 무변경). 원본 `memosForMonthState`와 `todayIso`가
  // 둘 다 이 훅 안에 있으므로 소유자는 여기다 — Dashboard는 카드에 넘기기만 한다.
  const incompleteTodoCount = (memosForMonthState ?? []).filter((m) => m.memo_type === "todo" && m.status !== "completed").length;
  const dueTodayCount = (memosForMonthState ?? []).filter(
    (m) => m.memo_type === "todo" && m.status !== "completed" && m.end_date === todayIso
  ).length;

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
    dayOrderKey: memoDialogDateIso, commitDayOrder, dayOrderPending,
    memoSelectionMode, setMemoSelectionMode,
    selectedMemoIds, setSelectedMemoIds,
    setImportantMemosState,
    pinnedMemos, priorityMemos,
    weekPreview, todayMemoItems, nextMemo, bigCalCells,
    incompleteTodoCount, dueTodayCount,
    goToMonth, goToToday, refreshAfterMemoChange,
  };
}
