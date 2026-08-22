"use client";

import { useEffect } from "react";

// 키보드가 올라와 있을 때 실제로 보이는 높이를 --app-vh로 내려보낸다.
//
// iOS는 키보드가 올라와도 레이아웃 뷰포트를 줄이지 않는다. 100dvh는 키보드가 없을 때와 똑같은
// 값을 그대로 유지하고, 작아지는 건 "실제로 보이는 영역"(visual viewport)뿐이다. 그래서 100dvh로
// 잡아둔 전체화면 메모 편집창은 아래쪽 절반이 키보드 뒤에 깔린 채로 남고, 그 안의 스크롤러도
// 보이지 않는 자리까지 포함해 높이를 계산한다 — 손가락으로 밀어도 어느 지점부터는 더 올라가지도
// 내려가지도 않는 것처럼 느껴진다(2026-08-22 지적: "일정 부분 이상 가면 스크롤 자체가 안 된다").
//
// visualViewport.height를 CSS 변수로 넘겨주면 편집창이 진짜 보이는 만큼만 차지하게 되고,
// 스크롤 범위도 그 안에서 정확히 계산된다.
//
// offsetTop까지 같이 보는 이유: 키보드가 뜰 때 iOS가 캐럿을 보이게 하려고 visual viewport 자체를
// 아래로 밀어두는 경우가 있는데, 그때는 높이만 맞춰도 편집창 윗부분이 화면 밖으로 나간다.
// 밀린 만큼을 --app-vt로 함께 넘겨 위에서 보정한다.
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 미지원 브라우저는 기존 100dvh 폴백을 그대로 쓴다
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--app-vh", `${Math.round(vv.height)}px`);
      root.style.setProperty("--app-vt", `${Math.round(vv.offsetTop)}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    // window resize도 같이 듣는다 — visualViewport의 resize가 항상 즉시 오지는 않아서(테스트 중
    // 화면 크기를 바꿨을 때 값이 한 박자 늦게 남아 있는 것을 봤다) 회전·창 크기 변경을 놓치지 않게.
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-vt");
    };
  }, []);
}
