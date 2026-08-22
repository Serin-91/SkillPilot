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
// iOS 사파리는 화면을 덮고 있는 position:fixed 요소의 padding이 바뀌어도 그 레이어를 다시
// 그리지 않고 이전 화면을 그대로 남겨두는 일이 있다. 화면에는 편집창 아래쪽이 잘린 채로 보이고,
// 손으로 한 번 스크롤하면 정상으로 돌아온다.
//
// 예전 코드도 이걸 알고 `void document.body.offsetHeight`로 막으려 했는데, 그건 레이아웃만
// 강제하고 페인트는 강제하지 않는다 — 합성된 fixed 레이어의 래스터는 그대로 남는다. 그래서
// 증상이 계속 남았다. (그동안 --kb-inset이 항상 0이어서 padding이 바뀐 적이 없었고, 그래서 이
// 버그가 겉으로 드러나지 않았을 뿐이다.)
//
// ponytail: 페인트를 무효화하려고 transform을 한 프레임 넣고 뺀다. 레이아웃 값이 아니라 래스터를
// 건드리는 게 목적이라 다른 방법이 없다. containing block 문제를 피해서 <body>나 fixed 조상이
// 아니라 "화면을 덮고 있는 그 요소" 자신에게만 건다 — body에 transform을 걸면 fixed 자식들의
// 기준이 body로 바뀌어 편집창 위치가 통째로 어긋난다(예전에 offsetTop으로 밀었을 때와 같은 사고).
// iOS가 이걸 고치면 이 함수째로 지우면 된다.
function repaintFixedOverlays(inset: number) {
  // 키보드가 닫혀 있으면 padding이 0으로 안정된 상태라 건드릴 이유가 없다.
  if (inset === 0) return;
  const targets = document.querySelectorAll<HTMLElement>(".postit-overlay, dialog[open] > .dialog-inner");
  targets.forEach((el) => {
    el.style.transform = "translateZ(0)";
  });
  requestAnimationFrame(() => {
    targets.forEach((el) => {
      el.style.transform = "";
    });
  });
}

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
      repaintFixedOverlays(inset);
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
    };
  }, []);
}
