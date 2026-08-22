"use client";

import { useEffect } from "react";

// 키보드가 올라와 있을 때 실제로 보이는 높이(--app-vh)와 키보드가 가린 높이(--kb-inset)를
// CSS로 내려보낸다.
//
// iOS는 키보드가 올라와도 100dvh를 줄이지 않는다. 100dvh로 잡아둔 전체화면 편집창은 아래쪽이
// 키보드 뒤에 깔린 채로 남고, 그 안의 스크롤러도 보이지 않는 자리까지 높이로 계산한다.
// 그래서 키보드가 가린 높이를 실측해서 padding으로 비워줘야 한다.
//
// ── --kb-inset을 innerHeight - visualViewport.height 로 구하면 안 된다 ──
//
// 예전 구현이 그 뺄셈을 썼고, "innerHeight가 곧 레이아웃 뷰포트 높이라 이 뺄셈이 정확하다"고
// 적어뒀는데 실기기에서 틀렸다. 실측(iPhone Safari, 진단 패널):
//
//   키보드 닫힘:  innerH=684  vvH=684   → 뺄셈 0  (맞음)
//   키보드 열림:  innerH=358  vvH=358   → 뺄셈 0  (틀림, 실제로는 326이 가려짐)
//
// 이 iOS는 키보드가 열릴 때 innerHeight도 visualViewport.height와 똑같이 줄인다. 두 값이 항상
// 같으니 뺄셈은 영원히 0이고, --kb-inset은 한 번도 0이 아닌 값을 가진 적이 없었다.
//
// 그 결과가 그동안 잡히지 않던 증상 전부다. 편집창이 키보드 뒤까지 늘어난 채로 남고, 캐럿이
// 그 가려진 자리에 있으면 내부 스크롤러로는 보이게 만들 수 없다. 그러면 iOS가 최후수단으로
// 화면 전체를 밀어버린다(visualViewport.offsetTop이 326까지 올라간다) — position:fixed인
// 편집창이 통째로 위로 나가서 상단 서식툴바가 사라지고, 손가락은 스크롤이 아니라 그 밀린
// 화면을 상대하게 된다("중간·하단에서 수정하려고 누르면 위로 스크롤이 안 된다").
//
// ── 대신 "키보드가 없을 때의 보이는 높이"를 기준값으로 잡고 차이를 쓴다 ──
//
// 키보드는 편집 중에만 열린다. 그래서 편집 중이 아닐 때의 vv.height만 기준값으로 갱신하면,
// 편집이 시작된 뒤의 줄어든 양이 곧 키보드가 가린 높이다. 주소창이 접히는 변화는 편집 중이
// 아닐 때 기준값에 흡수되므로 키보드 높이로 오해되지 않는다.
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // 미지원 브라우저는 기존 100dvh 폴백을 그대로 쓴다
    const root = document.documentElement;

    // 키보드가 열려 있는지를 높이로 추측하지 않고 "편집 중인지"로 판단한다 — 높이 변화만 보면
    // 주소창 접힘(수십 px)과 키보드(수백 px)를 구분하려고 또 임계값을 찍어야 한다.
    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
    };

    let baseline = vv.height;

    const sync = () => {
      // 편집 중이 아니면 지금 보이는 높이가 곧 "키보드 없을 때의 높이"다.
      if (!isEditing()) baseline = vv.height;
      root.style.setProperty("--app-vh", `${Math.round(vv.height)}px`);
      // 음수 방지 — 편집 중에 주소창이 펼쳐지면 vv.height가 기준값보다 커질 수 있다.
      const inset = Math.max(0, Math.round(baseline - vv.height));
      root.style.setProperty("--kb-inset", `${inset}px`);
      // 키보드가 덮고 있으면 홈 인디케이터 여백(safe-area-inset-bottom)은 필요 없다 — 그걸 또
      // 비우면 --kb-inset과 이중으로 계산되어 본문이 그만큼 짧아진다. 닫히면 변수를 지워서
      // CSS의 fallback env(safe-area-inset-bottom)이 다시 살아나게 한다.
      if (inset > 0) root.style.setProperty("--safe-bottom", "0px");
      else root.style.removeProperty("--safe-bottom");
      // 강제 레이아웃 읽기 — padding이 바뀐 것을 즉시 확정시킨다(값은 쓰지 않는다).
      void document.body.offsetHeight;

      // iOS는 키보드가 올라올 때 캐럿을 보이게 하려고 "화면 자체"를 밀어버린다
      // (visualViewport.offsetTop > 0). 그런데 우리는 --kb-inset padding으로 키보드 자리를 이미
      // 비워두고 있으므로, 그 밀기까지 겹치면 같은 일을 두 번 하는 이중 보정이 된다.
      //
      // 실측(iPhone): KB-INSET=326으로 정상인데도 vvTop=278이었다. 편집창(100dvh=684)이 t=-277로
      // 올라가서, 위 패딩 58과 아래 패딩 350을 빼고 남는 본문 영역이 -219..47에 놓였다 — 화면
      // 0..358 중에 본문은 47px만 보이고 나머지는 전부 padding-bottom 영역이었다. 그게 "수정하려고
      // 누르면 아래 내용이 다 짤려 보이는" 화면이다. 페인트 문제가 아니라 이중 보정이었다.
      //
      // 예전에 offsetTop을 편집창 top에 "더해서" 맞추려던 시도가 있었는데(dashboard.css 2889줄)
      // 그건 이중으로 밀 뿐이다. 반대로, 밀린 것을 되돌린다.
      //
      // 편집 중이고 확대되지 않은 경우로 제한한다 — 사용자가 직접 확대해서 화면을 옮기는 중이라면
      // 그건 되돌리면 안 된다. scrollTo가 다시 vv.scroll을 쏘지만 그때는 offsetTop이 0이라 멈춘다.
      if (inset > 0 && vv.scale === 1 && vv.offsetTop > 0 && isEditing()) window.scrollTo(0, 0);
    };

    // 회전하면 기준값을 버린다 — 세로/가로의 보이는 높이는 아예 다른 값이다.
    const resetBaseline = () => {
      baseline = vv.height;
      sync();
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    // 포커스가 들어오고 나가는 순간에도 맞춘다 — 키보드가 닫히는 건 blur가 먼저 알려준다.
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    // window resize도 같이 듣는다 — visualViewport의 resize가 항상 즉시 오지는 않아서(테스트 중
    // 화면 크기를 바꿨을 때 값이 한 박자 늦게 남아 있는 것을 봤다) 회전·창 크기 변경을 놓치지 않게.
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", resetBaseline);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", resetBaseline);
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--safe-bottom");
    };
  }, []);
}
