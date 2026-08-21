"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

// "꾹 눌러야" 시작되는 드래그 — 고정메모(가로 줄/전체보기 격자)와 관심 직무 우선순위가 같이 쓴다.
//
// 예전엔 onPointerDown에서 곧바로 setPointerCapture를 걸었다. 그래서 손가락이 닿는 순간이 곧
// 드래그였고, 두 가지가 동시에 망가졌다.
//  (1) 가로로 늘어선 고정메모(.keynote-pinned-row)를 스크롤하려고 손가락을 대면 그게 드래그가 돼서
//      스크롤이 아예 안 되고 카드만 자리를 바꿨다. touch-action:none까지 걸려 있어 브라우저에게
//      스크롤할 기회조차 없었다.
//  (2) 웹에서도 클릭하려다 몇 px 흔들리면 순서가 바뀌었다.
//
// 그래서 순서를 뒤집는다. 누른 직후에는 아무것도 가로채지 않고 브라우저 기본 제스처를 그대로 둔다.
// HOLD_MS 동안 가만히 눌러야 드래그로 "승격"되고, 그 전에 SLOP_PX 넘게 움직이면 스크롤로 보고
// 드래그를 포기한다.
const HOLD_MS = 320;
const SLOP_PX = 10;

export type HoldDragOutcome =
  | "tap"    // 승격 전에 손을 뗐다 — 그냥 누른 것
  | "drag"   // 꾹 눌러 실제로 옮겼다
  | "cancel"; // 집었다가 안 옮기고 놨거나, 스크롤로 판정돼 취소됐다

export type HoldDragBind = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
};

export function useHoldDrag<T>(handlers: {
  onHold: (item: T) => void;
  onMove: (item: T, point: { x: number; y: number }) => void;
  onEnd: (item: T, outcome: HoldDragOutcome) => void;
}) {
  const [dragging, setDragging] = useState(false);
  // 드래그 도중에도 리렌더가 계속 일어난다(순서가 바뀔 때마다). 매 렌더의 최신 콜백을 쓰지 않으면
  // 옛 목록을 붙든 클로저로 계산하게 된다.
  const cb = useRef(handlers);
  // 렌더 중에 ref를 쓰면 안 되므로(react-hooks/refs) 매 렌더 직후에 맞춰둔다. 포인터 이벤트는
  // 항상 커밋 뒤에 오므로 콜백은 언제나 최신이다.
  useEffect(() => {
    cb.current = handlers;
  });

  const press = useRef<{
    item: T; pointerId: number; el: HTMLElement;
    x: number; y: number; timer: number; held: boolean; moved: boolean;
  } | null>(null);

  // 승격된 뒤에는 브라우저 스크롤을 직접 막는다. touch-action CSS로는 못 한다 — 그 값은 터치가
  // 시작되는 순간 결정되는데, 여기선 시작 시점엔 일부러 스크롤을 허용해 두기 때문이다.
  // 승격 조건이 "가만히 있기"라 이 시점엔 스크롤이 아직 시작되지 않았고, 그래서 preventDefault가 먹는다.
  useEffect(() => {
    if (!dragging) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [dragging]);

  useEffect(() => () => {
    if (press.current) window.clearTimeout(press.current.timer);
  }, []);

  function finish(outcome: HoldDragOutcome) {
    const p = press.current;
    if (!p) return;
    press.current = null;
    window.clearTimeout(p.timer);
    if (p.el.hasPointerCapture(p.pointerId)) p.el.releasePointerCapture(p.pointerId);
    setDragging(false);
    cb.current.onEnd(p.item, outcome);
  }

  function bind(item: T): HoldDragBind {
    return {
      onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (press.current) window.clearTimeout(press.current.timer);
        const el = e.currentTarget;
        const timer = window.setTimeout(() => {
          const p = press.current;
          if (!p) return;
          p.held = true;
          // 포인터 캡처는 승격된 뒤에만 — 먼저 잡으면 스크롤 제스처를 가로채는 예전 문제로 되돌아간다.
          // 캡처는 "손가락이 항목 밖으로 나가도 move/up을 계속 받는다"는 편의 장치일 뿐이다.
          // 홀드 320ms 사이에 포인터가 이미 끝난 경우엔 던지는데, 그것 때문에 드래그 자체가
          // 조용히 죽으면 안 된다 — 캡처 없이도 같은 요소 위에서는 정상 동작한다.
          try { p.el.setPointerCapture(p.pointerId); } catch { /* 캡처 실패는 치명적이지 않다 */ }
          navigator.vibrate?.(12); // 안드로이드만 반응한다. iOS는 조용히 무시한다
          setDragging(true);
          cb.current.onHold(p.item);
        }, HOLD_MS);
        press.current = { item, pointerId: e.pointerId, el, x: e.clientX, y: e.clientY, timer, held: false, moved: false };
      },
      onPointerMove(e) {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        if (!p.held) {
          // 아직 승격 전 — 움직였다는 건 스크롤하려는 것이다. 드래그를 포기하고 브라우저에 넘긴다.
          if (Math.abs(e.clientX - p.x) > SLOP_PX || Math.abs(e.clientY - p.y) > SLOP_PX) {
            window.clearTimeout(p.timer);
            press.current = null;
          }
          return;
        }
        p.moved = true;
        cb.current.onMove(p.item, { x: e.clientX, y: e.clientY });
      },
      onPointerUp(e) {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        finish(p.held ? (p.moved ? "drag" : "cancel") : "tap");
      },
      onPointerCancel(e) {
        const p = press.current;
        if (!p || p.pointerId !== e.pointerId) return;
        finish("cancel");
      },
      // 꾹 누르면 모바일 브라우저가 컨텍스트 메뉴·텍스트 선택 말풍선을 띄운다 — 드래그와 정면으로 겹친다.
      onContextMenu(e) {
        if (press.current) e.preventDefault();
      },
    };
  }

  return { dragging, bind };
}
