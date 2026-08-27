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

// 키보드가 화면의 이 비율보다 더 가릴 수는 없다고 본다. 넘는 값은 키보드 애니메이션/패널 전환
// 도중의 **찰나**이지 실제 키보드 높이가 아니다. 실기기 실측(2026-08-27, iPhone Chrome + 네이버
// 키보드, 684px 화면): 정상 343(50%) / 튐 571(83%). 한국어 키보드는 자체 툴바가 붙어 세로로
// 긴 편이라 여유를 두되, 화면의 2/3을 넘기면 그건 값이 튄 것이다.
const MAX_KEYBOARD_RATIO = 0.66;
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
    // 튄 --kb-inset을 버릴 때 되돌아갈 자리 (아래 insetCap 주석 참고).
    let lastInset = 0;

    // ?debug 가 붙었을 때만 이력을 남긴다. 일반 사용자에게는 null이라 배열 조작 자체가 없다.
    const kbLog: string[] | null = new URLSearchParams(window.location.search).has("debug")
      ? ((window as unknown as { __spKbLog?: string[] }).__spKbLog = [])
      : null;

    // 🔴🔴 mayUpdateBaseline — focus 이벤트에서는 기준값을 **절대** 갱신하지 않는다.
    //
    // 예전엔 sync() 하나가 resize·scroll·focusin·focusout에서 전부 같은 일을 했다. 그런데
    // `focusout` 시점에는 **키보드가 아직 열려 있는데** activeElement가 body나 버튼으로 바뀌어
    // isEditing()이 false가 된다 — 그 순간 baseline이 "키보드에 눌린 높이"(실측 358)로 덮인다.
    // 그 다음 다시 본문을 탭하면 inset = 358 - 358 = 0이 되어 **키보드 보정이 통째로 죽는다.**
    // 그 상태가 이 파일 위쪽 주석이 설명하는 그 실패 그대로다: 편집창이 키보드 뒤까지 늘어나고,
    // iOS가 최후수단으로 화면을 밀고(vv.offsetTop>0), 손가락은 스크롤이 아니라 밀린 화면을
    // 상대하게 된다 = "스크롤이 잠긴 것처럼" 느껴진다.
    //
    // 특히 제목 input → 본문처럼 **키보드를 닫지 않고 포커스만 옮기는** 경로에서는 뒤따르는
    // resize가 없어서 잘못된 baseline이 그대로 굳는다. 그래서 "어떤 날은 되고 어떤 날은 잠긴다".
    // 기준값은 resize 계열(키보드가 실제로 닫히면 반드시 온다)에서만 갱신한다.
    const sync = (mayUpdateBaseline: boolean) => {
      // 편집 중이 아니면 지금 보이는 높이가 곧 "키보드 없을 때의 높이"다.
      if (mayUpdateBaseline && !isEditing()) baseline = vv.height;
      root.style.setProperty("--app-vh", `${Math.round(vv.height)}px`);
      // 음수 방지 — 편집 중에 주소창이 펼쳐지면 vv.height가 기준값보다 커질 수 있다.
      // 🔴 round가 아니라 floor다. vv.height는 소수를 갖는다(예: 357.5) — round면 326.5가 327로
      // **올라가고**, 그 1px이 그대로 padding-bottom에 얹혀 글 끝~키보드 여백이 4px이 아니라 5px이 된다
      // ("여백 4px로 맞출 수 없나 / 5px 되고 커진 느낌", 2026-08-26). 반올림 오차는 항상 여백을
      // **키우는 쪽**으로만 틀린다 — 올려 잡으면 키보드가 가린 것보다 더 비우기 때문이다.
      // floor는 최대 1px **덜** 비우는데, 그건 안전하다: 위 html.kb-open 규칙이 4px 쿠션을 이미
      // 갖고 있어서 1px 미만이 줄어도 글이 키보드 뒤로 들어가지 않는다.
      const raw = Math.max(0, Math.floor(baseline - vv.height));
      // 🔴🔴 튀는 값을 그대로 쓰지 마라. 실기기 이력(2026-08-27, iPhone Chrome + 네이버 키보드):
      //     inset=343 base=684 vvH=341   ← 정상(화면의 50%)
      //     inset=571 base=684 vvH=113   ← 튐. 화면의 83%가 가려졌다는 값이다
      // vv.height가 113까지 떨어지는 **찰나**가 있다(키보드 애니메이션 / 키보드 자체 패널 전환).
      // 그 571을 그대로 padding-bottom에 넣으면 스크롤러가 거의 0으로 찌그러지고 캐럿이 보이는
      // 자리에서 사라진다 → **iOS가 최후수단으로 화면을 민다**(vv.offsetTop > 0).
      // 그리고 그 밀기는 배경 스크롤 잠금(body{position:fixed}) 때문에 window.scrollTo(0,0)으로
      // **되돌려지지 않는다** — 실측: bodyPos=fixed인데 vvTop=45가 그대로 남았다.
      // 즉 한 번 밀리면 못 돌아온다. 그래서 애초에 밀리게 만들지 않는 것이 유일하게 통하는 방어다.
      // 키보드가 화면의 이 비율보다 더 가릴 수는 없다고 보고, 넘으면 직전 값을 유지한다.
      const insetCap = Math.floor(baseline * MAX_KEYBOARD_RATIO);
      const inset = raw > insetCap ? lastInset : raw;
      lastInset = inset;
      root.style.setProperty("--kb-inset", `${inset}px`);
      // 키보드가 덮고 있으면 홈 인디케이터 여백(safe-area-inset-bottom)은 필요 없다 — 그걸 또
      // 비우면 --kb-inset과 이중으로 계산되어 본문이 그만큼 짧아진다. 닫히면 변수를 지워서
      // CSS의 fallback env(safe-area-inset-bottom)이 다시 살아나게 한다.
      if (inset > 0) root.style.setProperty("--safe-bottom", "0px");
      else root.style.removeProperty("--safe-bottom");
      // CSS는 var() 값으로 분기할 수 없어서 키보드 상태를 클래스로도 내려준다.
      // 키보드가 올라와 있는 동안만 껍데기 여백을 줄여 본문에 공간을 돌려주는 데 쓴다.
      root.classList.toggle("kb-open", inset > 0);
      // ?debug 전용 이력 — 진입 직후의 어긋남은 **찰나**라 패널의 10Hz 폴링으로는 못 잡는다.
      // 값이 실제로 바뀌는 이 자리에서 직접 남겨야 "진입할 때만 크다"를 눈으로 확인할 수 있다.
      // baseline까지 같이 찍는다 — 여백이 크다는 건 baseline이 큰 것이므로 그게 곧 증거다.
      if (kbLog) {
        const line = `inset=${inset} base=${Math.round(baseline)} vvH=${Math.round(vv.height)} ${isEditing() ? "EDIT" : "view"}${mayUpdateBaseline ? " R" : ""}`;
        if (kbLog[kbLog.length - 1] !== line) {
          kbLog.push(line);
          if (kbLog.length > 12) kbLog.shift();
        }
      }
      // 강제 레이아웃 읽기 — padding이 바뀐 것을 즉시 확정시킨다(값은 쓰지 않는다).
      void document.body.offsetHeight;

      // ── iOS의 화면 밀기(visualViewport.offsetTop)는 **보정하지 않는다** ──────────────
      //
      // 3주간 이 자리에서 되돌리기(window.scrollTo(0,0)) → 상쇄(transform: translateY) →
      // !important → 가드 제거를 차례로 시도했고 전부 실패했다. 방향도 값도 문제가 아니었다.
      // **애초에 보정할 대상이 아니었다.**
      //
      //   "On iOS WebKit the layout viewport itself slides under the keyboard, so that origin is
      //    0, not offsetTop. The correct clamp origin is offsetTop on Blink, but 0 on iOS WebKit."
      //
      //   Vuetify PR #22923 "keep overlay attached with iOS keyboard open" (머지됨):
      //     y: visualViewport.scale > 1 || IS_WEBKIT ? 0 : visualViewport.offsetTop
      //
      // 즉 WebKit은 position:fixed를 이미 보이는 자리에 붙여준다. offsetTop이 0이 아닌 것은
      // **정보일 뿐 보정 대상이 아니다** — 더하면 요소가 오히려 화면 밖으로 나간다.
      //
      // 대신 껍데기 높이를 --app-vh(= vv.height)로 잡는다(dashboard.css). 그러면 껍데기 아랫변이
      // 곧 보이는 아랫변이라 죽은 여백도 짤림도 **구조적으로 불가능**하다. 그리고 이 설계는
      // 위에서 구한 vv.height 하나만 쓴다 — baseline·--kb-inset·offsetTop·scale처럼 여러 번
      // 틀렸던 값에 아무것도 의존하지 않는다. `--kb-inset`은 이제 껍데기 높이가 아니라
      // html.kb-open 판정과 위로가기 버튼 위치에만 쓰인다.
    };

    const syncResize = () => sync(true);
    const syncFocus = () => sync(false);

    // 회전하면 기준값을 버린다 — 세로/가로의 보이는 높이는 아예 다른 값이다.
    const resetBaseline = () => {
      baseline = vv.height;
      syncResize();
    };

    sync(true);
    vv.addEventListener("resize", syncResize);
    // 🔴🔴 vv.scroll은 baseline을 갱신하면 안 된다 — 위 mayUpdateBaseline 주석이 정한 규칙("기준값은
    // resize 계열에서만")을 이 한 줄이 어기고 있었다. syncResize라는 **이름 때문에** resize와 같은
    // 부류로 묶여 있었지만 의미가 다르다: vv.scroll은 visual viewport가 **패닝될 때** 뜨는 이벤트이고,
    // "키보드가 닫혔다"를 절대 보장하지 않는다. resize만 그걸 보장한다.
    // 그래서 키보드가 올라오는 중에 iOS가 화면을 미는 그 순간(vv.offsetTop>0 → 아래 window.scrollTo가
    // 다시 vv.scroll을 쏜다)에도 baseline이 덮일 수 있었다. activeElement가 아직 에디터로 안 넘어온
    // 찰나면 isEditing()이 false라 방어도 뚫린다 — 편집 **진입 직후에만** 여백이 어긋나고 그 뒤
    // 정상 resize가 한 번 오면 스스로 맞아버리는("오락가락") 증상이 정확히 이 모양이다.
    // 표시값(--app-vh/--kb-inset)은 그대로 다시 그리되 기준값만 건드리지 않는다.
    vv.addEventListener("scroll", syncFocus);
    // 포커스가 들어오고 나가는 순간에도 --kb-inset을 다시 그린다. 단 기준값은 건드리지 않는다(위 주석).
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    // window resize도 같이 듣는다 — visualViewport의 resize가 항상 즉시 오지는 않아서(테스트 중
    // 화면 크기를 바꿨을 때 값이 한 박자 늦게 남아 있는 것을 봤다) 회전·창 크기 변경을 놓치지 않게.
    window.addEventListener("resize", syncResize);
    window.addEventListener("orientationchange", resetBaseline);
    return () => {
      vv.removeEventListener("resize", syncResize);
      vv.removeEventListener("scroll", syncFocus);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
      window.removeEventListener("resize", syncResize);
      window.removeEventListener("orientationchange", resetBaseline);
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--safe-bottom");
      root.classList.remove("kb-open");
    };
  }, []);
}
