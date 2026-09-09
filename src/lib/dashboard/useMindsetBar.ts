"use client";

// Dashboard.tsx에서 **그대로 옮겨온** MindSet 바 (Dashboard ownership Audit A 등급).
// 로직은 한 글자도 안 고쳤다 — `useMyPageSession`·`useIdeaBuild`·`useNewsTrendFeed`와 같은
// 이동 전용 추출이다.
//
// 🔴 JSX(입력칸 데스크톱/모바일 두 벌 + 하트 + "✓ 저장됨")는 **Dashboard에 그대로 있다.**
//   이 훅은 그 JSX가 쓰는 값 4개만 돌려준다 — 컴포넌트를 새로 만들지 마라.
//
// 🔴 `guardLogin()`은 Dashboard 몫이다. JSX가 `if (guardLogin()) fitMindsetToBox(...)`로
//   감싸고 있고, 그 게이트를 이 훅 안으로 가져오면 훅이 로그인 흐름을 알게 된다.

import { useRef, useState } from "react";
import { updateMindset } from "@/lib/actions/auth";

export function useMindsetBar(opts: { initialMindset: string }) {
  const { initialMindset } = opts;

  // MindSet — 계정(profiles.mindset)에 저장. 입력이 멈추고 800ms 뒤 조용히 저장한다(메모 자동저장과 같은 패턴).
  const [mindset, setMindset] = useState(initialMindset);
  // 🔴 "칸에 들어가는 만큼만" — 마지막으로 **칸 안에 들어갔던** 값. 넘치면 여기로 되돌린다.
  // 글자 수 상한(maxLength)으로는 못 한다: 같은 2줄 칸에 한글은 22자, 영문은 43자가 들어간다(실측
  // 162×44px). 한 숫자를 고르면 한글은 넘치거나 영문은 칸을 절반만 쓴다 — 박스를 직접 재는 게 정확하다.
  const mindsetFitRef = useRef(initialMindset);
  const [mindsetSaved, setMindsetSaved] = useState(false);
  const mindsetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onMindsetChange(value: string) {
    setMindset(value);
    if (mindsetTimer.current) clearTimeout(mindsetTimer.current);
    mindsetTimer.current = setTimeout(async () => {
      await updateMindset(value);
      setMindsetSaved(true);
      setTimeout(() => setMindsetSaved(false), 1200);
    }, 800);
  }
  // 칸을 넘치는 입력을 거부한다. 데스크톱은 한 줄(가로 넘침), 모바일은 두 줄(세로 넘침)이라
  // 재는 축만 다르고 규칙은 같다 — "지금 이 칸에 보이는 만큼"이 상한이다.
  //
  // ⚠️ 두 가지를 반드시 지킨다.
  // ① **조합 중(한글 IME)에는 되돌리지 않는다.** 조합 버퍼를 건드리면 글자가 깨진다.
  //    조합이 끝나면 onCompositionEnd가 같은 검사를 다시 돌려 그때 걷는다.
  // ② **길어지는 입력만 막는다.** 무조건 막으면, 이미 저장돼 있던 긴 값(상한이 없던 시절의 값)이
  //    들어왔을 때 지우는 것조차 "넘침"으로 거부되어 칸이 통째로 잠긴다.
  function fitMindsetToBox(el: HTMLInputElement | HTMLTextAreaElement, composing: boolean) {
    const over = el instanceof HTMLTextAreaElement ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
    const prev = mindsetFitRef.current;
    if (over && !composing && el.value.length > prev.length) {
      el.value = prev;          // 제어 컴포넌트라 state가 그대로면 리렌더가 없다 — DOM도 직접 되돌린다
      onMindsetChange(prev);
      return;
    }
    mindsetFitRef.current = el.value;
    onMindsetChange(el.value);
  }
  async function saveMindsetNow(value: string) {
    if (mindsetTimer.current) clearTimeout(mindsetTimer.current);
    await updateMindset(value);
    setMindsetSaved(true);
    setTimeout(() => setMindsetSaved(false), 1200);
  }

  return { mindset, mindsetSaved, fitMindsetToBox, saveMindsetNow };
}
