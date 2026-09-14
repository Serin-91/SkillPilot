"use client";

// Dashboard.tsx에서 **그대로 옮겨온** Today's Focus (Dashboard ownership Audit A 등급).
// 로직은 한 글자도 안 고쳤다 — `useMindsetBar`·`useIdeaBuild`와 같은 이동 전용 추출이다.
//
// 🔴 `openFocusMemo`는 **Dashboard에 남아 있다.** 그 함수는 Focus state를 하나도 안 쓰고
//   `setViewYear`/`setViewMonth0`/`setMemoDialogDay`/`setViewMemos`(Memo 소유) ·
//   `getMemosForMonthAction` · `close(dialogs.focus)` · `openPostitFromDashboard`만 부른다.
//   즉 **Focus → Memo로 건너가는 다리**라 Dashboard 몫이다.
//   **이 훅이 Memo를 알게 만들지 마라** — 콜백으로 주입하는 것도 하지 마라(그 순간 훅이
//   Memo 흐름을 알게 된다). Briefing의 `renderJobCard`와 같은 경계다.
//
// 🔴 FocusDialog JSX 조립과 ✕의 `close(dialogs.focus)`도 Dashboard에 남는다.

import { useEffect, useState } from "react";
import type { FocusView } from "@/lib/ai/state";
import type { FocusResult } from "@/lib/ai/focus";
import { runFocus as runFocusAction, getAiResultVersion } from "@/lib/actions/ai";
import { withCleanup } from "@/lib/with-cleanup";

export function useTodaysFocus(opts: { focusView: FocusView | null }) {
  const { focusView } = opts;

  // AI Smart Direction — Today's Focus
  const [focusMeta, setFocusMeta] = useState(focusView);
  const [focusDisplay, setFocusDisplay] = useState<{ id: string; result: FocusResult; savedMemoId: string | null } | null>(
    focusView?.current && focusView.currentId ? { id: focusView.currentId, result: focusView.current, savedMemoId: focusView.savedMemoId } : null
  );
  // 위 useState는 마운트 시 최초 1회만 focusView를 읽는다 — 자정이 지나 서버가 새 focusView(오늘 것 없음)를
  // 내려줘도 이 state는 그대로 남아 어제 결과가 계속 보이는 버그가 있었다. router.refresh()/재접속으로
  // focusView prop이 실제로 바뀔 때마다 다시 동기화한다.
  useEffect(() => {
    setFocusMeta(focusView);
    setFocusDisplay(focusView?.current && focusView.currentId ? { id: focusView.currentId, result: focusView.current, savedMemoId: focusView.savedMemoId } : null);
  }, [focusView]);
  const [focusGenerating, setFocusGenerating] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [focusHistoryOpen, setFocusHistoryOpen] = useState(false);

  async function runFocus() {
    if (focusGenerating) return;
    setFocusGenerating(true);
    setFocusError(null);
    // 서버 액션이 throw하면(외부 API 404 등) setFocusGenerating(false)를 건너뛰어
    // 생성 중 화면에 영원히 갇히고 버튼도 죽는다 — 그래서 정리는 반드시 withCleanup이 맡는다
    // (옛 `finally`와 동작이 같다. 아래 early `return`에서도 실행된다).
    await withCleanup(async () => {
      try {
        // 로딩 애니메이션이 순간적으로 스쳐 지나가지 않도록 최소 5초는 보여준다 (실제 요청과 동시에 대기)
        const [res] = await Promise.all([runFocusAction(), new Promise((r) => setTimeout(r, 5000))]);
        if ("error" in res) { setFocusError(res.error); return; }
        setFocusMeta(res.view);
        if (res.view.current && res.view.currentId) {
          setFocusDisplay({ id: res.view.currentId, result: res.view.current, savedMemoId: res.view.savedMemoId });
        }
      } catch {
        setFocusError("생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    }, () => setFocusGenerating(false));
  }
  async function viewFocusVersion(version: number) {
    const res = await getAiResultVersion("focus", version);
    setFocusDisplay({ id: res.id, result: res.result as FocusResult, savedMemoId: res.savedMemoId });
  }

  return {
    focusMeta,
    focusDisplay,
    focusGenerating,
    focusError,
    focusHistoryOpen, setFocusHistoryOpen,
    runFocus,
    viewFocusVersion,
  };
}
