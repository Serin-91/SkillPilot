"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 훅 (PHASE 0 ② 4순위). 로직은 한 글자도 안 고쳤다.
//
// 🔴 useScrollTopButton에 useState를 다시 들이지 마라 — 그 위 주석이 이유를 적고 있다
//    (스크롤이 setState가 되면 Dashboard 전체가 리렌더되어 캐럿이 죽는다).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Memo } from "@/lib/memo/types";
import { reorderPinnedMemos } from "@/lib/actions/memo";
import { noteScrollTopTap } from "@/components/memo/MemoRichEditor";
import { useHoldDrag } from "@/lib/useHoldDrag";
import { SCROLL_TOP_THRESHOLD, type MemoReorder } from "@/lib/dashboard/helpers";

// 서버에서는 useLayoutEffect가 경고를 낸다(DOM이 없다). 브라우저에서만 layout으로 쓴다.
// 테마 보정처럼 **페인트 전에** 끝나야 하는 것에만 쓴다 — useEffect면 한 프레임 뒤라 번쩍인다.
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// (2026-08-30 제거: traceScrollTop — "위로가기를 누르면 2.5초간 프레임마다 scrollTop을 기록하고
//  ViewportDebug가 그대로 그린다"는 주석이 붙어 있었는데, 패널을 45줄→19줄로 줄일 때(15-1)
//  그리는 쪽이 빠지면서 **아무 데도 안 보이는 로그**가 됐다. `window.__spScrollTrace`를 읽는 코드가
//  파일 전체에 없다. 되살릴 일이 생기면 git에 있고, 그때는 패널에 그리는 줄을 반드시 같이 넣어라.)
// 🔴🔴🔴 버튼 노출을 **state로 만들지 마라.** 여기가 "위로가기 생기면서 다 망가졌다"의 진짜 자리다.
//
// 회귀 지점은 git이 정확히 짚어준다(90c679e, 위로가기를 도입한 커밋):
//     -  <div className="textarea-row">
//     +  <div className="textarea-row" ref={postitScrollRef} onScroll={onPostitScroll}>
// 그 전까지 편집 스크롤러에는 **onScroll이 아예 없었다.** 즉 메모를 스크롤해도 React는 아무것도
// 하지 않았다. 버튼이 생기면서 스크롤이 setState가 됐고, Dashboard는 화면 전체를 그리는 **한 개짜리**
// 컴포넌트라 그 setState 한 번이 MemoRichEditor까지 통째로 다시 렌더한다. 그러면 tiptap의
// useEditor가 editor.setOptions()를 부르고(@tiptap/react: onRender → compareOptions 불일치 →
// setOptions), 그 안에서 view.setProps() + view.updateState()가 돈다(@tiptap/core Editor.setOptions).
// ProseMirror는 거기서 outerDeco를 다시 계산해 view.dom의 속성(contenteditable 포함)을 다시 쓴다 —
// **WebKit에서 포커스된 contenteditable의 속성이 다시 써지면 blur된다.** 그게 caret none의 정체다.
//
// 그래서 탭 경로만 막은 수정(KEEP_EDITOR_FOCUS)으로는 안 잡혔다. 방아쇠는 탭이 아니라 **스크롤 자체**다.
// 위로가기를 누르면 scrollTo(0) → scroll 이벤트 → setState → 리렌더 → blur가 그 자리에서 일어난다.
//
// 고치는 방향은 값을 만지는 게 아니라 **state를 없애는 것**이다. 버튼 노출은 화면 어디에도 영향을
// 주지 않는 순수 표시값이라 클래스 토글이면 충분하다. 이러면 스크롤 중 리렌더가 0이 되어
// 버튼이 생기기 전의 렌더 동작으로 정확히 돌아간다.
// ⚠️ 여기에 useState를 다시 들이지 마라. 들이는 순간 위 연쇄가 통째로 돌아온다.
export function useScrollTopButton() {
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  function setVisible(on: boolean) {
    btnRef.current?.classList.toggle("is-visible", on);
  }
  function onScroll() {
    setVisible((ref.current?.scrollTop ?? 0) > SCROLL_TOP_THRESHOLD);
  }
  function scrollToTop() {
    const el = ref.current;
    if (!el) return;
    // 🔴🔴 여기서 캐럿을 건드리지 마라 — 2026-08-26에 실제로 심었다가 되돌린 자리다.
    // "iOS가 캐럿을 보이려고 스크롤을 되돌린다"는 가설로 DOM Selection을 에디터 맨 앞으로 옮겼는데
    // (`removeAllRanges()` → `addRange()`), 그 사이 **선택 범위가 0개가 되는 순간**에 iOS가 캐럿이
    // 사라진 것으로 보고 키보드를 닫아버린다. 그러면 연쇄로: 편집이 풀려 "보기 모드"로 튕기고
    // (`.postit-overlay`의 onClick이 detail 편집 중 탭을 setPostitEditMode(null)로 받는다),
    // --kb-inset이 326→0으로 떨어지며 껍데기 padding이 줄고, 다시 탭해 키보드를 올리면 baseline이
    // 어긋나 본문과 키보드 사이에 죽은 공간이 생긴다. 사용자 신고: "간헐적으로 커서가 없어지고
    // 보기모드로 돌입, 그러면서 메모내용이랑 키보드 사이 간격 발생". 데스크톱에서는 재현되지 않는다.
    // 커서가 살아 있을 때 안 올라가는 문제는 **아직 원인 미확정**이다. 값이나 셀렉션을 또 만지지 말고
    // 실기기에서 `?debug=vp`로 KB-INSET / vvTop / 스크롤러 목록을 먼저 읽어라(CLAUDE.md 7절 4단계).
    // smooth를 뺐다. 부작용이 없는 쪽으로만 한 칸 움직인 것이지 위 증상을 고쳤다는 뜻은 아니다.
    // 근거: 실측(375x684, 프로젝트 편집) smooth 애니메이션이 **420ms 동안 900에서 멈춰 있다가** 0으로
    // 간다. 지뢰표 마지막 줄이 경고하는 구간이 정확히 그 창이다 — 그 사이에 리플로우(키보드 닫힘 →
    // --kb-inset 326→0 → 껍데기 padding 변화)가 끼면 스크롤이 멈춘 채로 남는다. 즉시 이동은 그 창이
    // 아예 없다. 잃는 것은 애니메이션뿐이고 포커스·캐럿·편집 모드는 건드리지 않는다.
    // 캐럿 노출 소유자(MemoRichEditor의 vv.resize settle)에게 "지금은 비켜라"라고 알린다.
    // iOS Chrome은 스크롤만으로도 하단 툴바가 접혀 vv.resize가 뜨고, 그 뒤 scrollIntoView()가
    // 캐럿 자리로 도로 끌어내린다 — 그게 "내용을 수정했을 때만 위로가기가 안 먹는" 이유다.
    // 반드시 scrollTo **앞**에서 부른다(스크롤이 resize를 부르기 전에 창이 열려 있어야 한다).
    noteScrollTopTap();
    el.scrollTo({ top: 0, behavior: "auto" });
    setVisible(false); // 클래스 토글뿐 — 리렌더가 없어야 캐럿이 산다(위 주석)
  }
  // <dialog>는 닫혀 있어도 자식 DOM이 계속 마운트돼 있어 scrollTop이 저절로 0으로 돌아가지 않는다 —
  // 다이얼로그/편집창을 새로 열 때 호출해 이전 세션의 스크롤 위치와 버튼 노출 상태를 지운다.
  function resetScroll() {
    if (ref.current) ref.current.scrollTop = 0;
    setVisible(false);
  }
  return { ref, btnRef, onScroll, scrollToTop, resetScroll };
}
// 고정 메모와 중요 메모의 순서 변경은 완전히 같은 동작이라 훅 하나로 쓴다.
// 순서는 두 목록 모두 memo.pin_order에 저장한다 — getImportantMemos가 is_pinned → pin_order →
// pinned_at → start_date 순으로 정렬하므로 비고정 메모에도 그대로 먹는다(새 컬럼/마이그레이션 없음).
//
// 예전엔 HTML5 draggable + onDragOver로 순서를 바꿨는데 두 가지 문제가 있었다.
// (1) dragover는 커서가 멈춰 있어도 초당 수십 번 발사되는데 매번 상태를 갱신해 Dashboard 전체가
//     그만큼 리렌더돼 웹에서 드래그가 통째로 멈춰 보였다.
// (2) 터치에서는 dragstart 자체가 안 떠서 모바일에서는 순서를 아예 못 바꿨다.
// 그래서 관심 직무 우선순위(PriorityList)와 같은 Pointer Events 방식으로 옮겼다.
// (3) 그런데 누르는 즉시 포인터를 캡처해서, 가로로 늘어선 카드를 스크롤하려고 손가락만 대도
//     그게 드래그가 됐다. 시작 조건은 useHoldDrag에 맡긴다 — 꾹 눌러야 집힌다.
// onCommit을 주면 그쪽으로 확정 순서를 넘긴다(Monthly 하단 목록의 **날짜별** 순서가 그 경로다).
// 주지 않으면 예전 그대로 Key Notes의 pin_order에 저장한다.
// 🔴 두 저장소는 완전히 독립이다 — 한쪽 드래그가 다른 쪽 순서를 바꾸면 안 된다.
export function useMemoReorder(
  memos: Memo[], pinned: boolean, group: string, onTap: (m: Memo) => void,
  onCommit?: (orderedIds: string[]) => void | Promise<boolean | void>,
): MemoReorder {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderRef = useRef<string[] | null>(null);

  // 🔴 dragOrder는 **드래그를 시작한 그 순간 목록에 있던 id 배열**이다. 목록 구성원이 바뀌면
  //   더는 유효하지 않으므로 버린다. 안 버리면 Key Notes 안에서 중요 OFF→ON 할 때
  //   **옛 수동 자리로 되돌아간다**: 서버는 해제하면서 pin_order를 비워(=이제 날짜 자리다)
  //   memos는 새 자리를 주는데, 화면은 스냅샷이 기억하는 옛 index로 다시 꽂아 버린다.
  //   그래서 "나갔다 다시 들어와야 반영된다"로 보였다(다이얼로그를 다시 열면 key가 바뀌어
  //   이 컴포넌트가 remount되고 스냅샷이 초기화되기 때문이다 — 2026-09-10 실기기 신고).
  //   실측(로컬 1280×900, 수동 pin_order=2 / 날짜 2026-09-02 메모): 드래그를 한 번 한 뒤
  //   OFF→ON 하면 **3번 자리로 부활**, 드래그를 안 했으면 **7번(날짜 자리)로 정상 이동**.
  //   👉 드래그 결과는 드롭 시점에 pin_order로 저장되므로 스냅샷을 버려도 순서는 남는다.
  // 🔴 effect가 아니라 **렌더 중** 조정이다 — effect로 미루면 한 프레임 옛 자리가 그려진다.
  //   (React "Adjusting state when props change" 패턴: 같은 컴포넌트의 setState라 커밋 전에 다시 렌더된다.)
  const memoIds = memos.map((m) => m.id).join("|");
  const [snapshotIds, setSnapshotIds] = useState(memoIds);
  if (memoIds !== snapshotIds) {
    setSnapshotIds(memoIds);
    setDragOrder(null);
  }

  // 여기까지 왔으면 dragOrder의 id 집합 == memos의 id 집합이다(다르면 위에서 버려진다).
  const displayed = dragOrder
    ? (dragOrder.map((id) => memos.find((m) => m.id === id)).filter(Boolean) as Memo[])
    : memos;

  const drag = useHoldDrag<Memo>({
    onHold(m) {
      // 🔴 **화면에 보이는 순서(displayed)로 시작한다.** 예전엔 `dragOrder ?? memos`를 썼는데,
      //   `dragOrder`는 지난번 드래그 시점의 id 배열이라 **그 뒤에 만들어진 메모가 빠져 있다.**
      //   그러면 새 메모를 집었을 때 onMove의 `order.indexOf(m.id)`가 -1이라 매번 그냥 return하고,
      //   집히기는 하는데 순서가 1px도 안 바뀐다(2026-09-10 실기기 신고 "방금 만든 메모만 드래그 불가").
      //   웹에서만 난 이유는 모바일은 작성이 전체화면이라 목록이 다시 마운트되며 dragOrder가
      //   초기화되기 때문이다. `displayed`는 지금 **화면에 그려져 있는 순서 그대로**라,
      //   보이는 것은 무엇이든 집을 수 있다.
      orderRef.current = displayed.map((x) => x.id);
      setDraggingId(m.id);
    },
    onMove(m, { x, y }) {
      const under = document.elementFromPoint(x, y);
      const card = under instanceof Element ? under.closest<HTMLElement>("[data-reorder-id]") : null;
      // 고정 목록과 중요 목록은 같은 다이얼로그에 나란히 있다 — 그룹을 확인하지 않으면 한 목록의
      // 카드를 다른 목록 위로 끌었을 때 엉뚱한 배열에서 인덱스를 찾다가 순서가 튄다.
      if (!card || card.dataset.reorderGroup !== group) return;
      const overId = card.dataset.reorderId;
      if (!overId || overId === m.id) return;
      const order = orderRef.current ?? memos.map((x) => x.id);
      const from = order.indexOf(m.id);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, m.id);
      orderRef.current = next;
      setDragOrder(next); // 카드가 실제로 자리를 바꿀 때만 렌더한다
    },
    onEnd(m, outcome) {
      setDraggingId(null);
      // 꾹 누르지 않고 그냥 눌렀다 뗐으면 탭 — 기존처럼 메모를 연다.
      if (outcome === "tap") { onTap(m); return; }
      const order = orderRef.current;
      orderRef.current = null;
      // 집었다가 그대로 놨으면(cancel) 순서가 그대로라 서버에 갈 이유가 없다.
      if (outcome !== "drag" || !order) return;
      // reorderPinnedMemos가 revalidatePath("/")를 부르므로 그 응답이 새 importantMemos를 실어 온다 —
      // 별도 router.refresh()는 두 번째 전체 재렌더였다(refreshAfterMemoChange 주석 참고).
      if (onCommit) {
        // 저장이 실패하면 드래그 순서를 버려서 목록이 **서버가 아는 순서**로 되돌아가게 한다.
        // 안 그러면 저장되지 않은 순서가 화면에 그대로 남아 저장된 것처럼 보인다.
        void Promise.resolve(onCommit(order)).then((ok) => { if (ok === false) setDragOrder(null); });
      } else void reorderPinnedMemos(order, pinned);
    },
  });

  return {
    displayed,
    draggingId,
    group,
    pinned,
    bind: drag.bind,
  };
}
