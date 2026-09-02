"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { measureEditor, judge, failures } from "@/lib/layout-invariants";

// 임시 진단 패널 — 실기기(iPhone Chrome / 설치형 PWA)에서만 확인할 수 있는 값을 화면에 띄운다.
// `?debug=vp` 가 붙은 주소에서만 뜬다 — 일반 사용자에게는 렌더 자체가 되지 않는다.
//
// 🔴🔴 2026-09-03 — **해결된 버그의 계측을 전부 지웠다(사용자 지시).**
// 패널은 `pointerEvents: none`이라 스크롤할 수 없어서, 길면 아래가 통째로 화면 밖이다.
// 그래서 지난 라운드에 "정작 필요한 값(vvH)이 안 보인다"가 났고, 내가 vp2로 **옮기기만** 했더니
// 사용자가 다시 "해결된건 다 지워줘라"고 했다. 옮기는 것은 지우는 것이 아니다.
//
// 지운 것 (전부 해결·종료된 건이다. 필요하면 git에서 되살려라 — 그게 추측보다 항상 빠르다):
//   · `window.scrollTo` / `Element.prototype.scrollIntoView` / `scrollTop` setter **몽키패치 3개**
//     와 `scrollCalls`("누가 문서를 굴렸나") — 진입 스크롤이 26·27절에서 끝났다.
//     ★ 이 패치들은 전역을 갈아끼우는 코드였다. 진단이 앱 동작을 바꿀 위험이 상시로 있었으니
//       사라진 것이 낫다. 되살릴 땐 cleanup 복원까지 같이 가져와라.
//   · `scrollTicks` / `recordTick` / `recordBodyPos` / `lockSeen`·`lockTrail`("진입잠금 06d6715")
//   · "진입 스크롤 기전" 상세 / "보이는 밴드 안에 있나" / 헤더정렬 판정 / "굴릴 수 없는 스크롤러"
//     (§3이 "그 목록은 죽은 것만 센다 — None을 무죄로 읽지 마라"고 적어둔, 오독을 부르던 줄이다)
//   · caret / toolbar / dialog / postit / scroller / docW / focus / mode 상세 8줄
//   · `vvTop=` / `innerH= vvH=` / `KB-INSET= app-vh=` — 아래 선판정 첫 줄에 **합쳤다**(중복이었다)
//   · `?debug=vp2` 분기 — 지운 뒤에는 나눌 것이 없다
//
// 🔴 패널은 화면 좌상단이 아니라 **중간(top 40%)** 이다. 관찰 대상(sticky 툴바·삽입바)이 상단에
// 붙으므로 위에 두면 재려는 것을 패널이 덮는다. 아래도 안 된다 — 스크롤 도중 iOS가 fixed를
// 문서와 같이 끌고 가서 맨 아래에서는 안 보였다. `+ vv.offsetTop`을 더하지도 마라(iOS WebKit이
// 이미 시각 뷰포트 기준으로 붙여준다 — 더하면 밀릴 때 화면 밖으로 나간다).

export function ViewportDebug() {
  const [text, setText] = useState("");
  // showModal()로 연 <dialog>는 top layer에 그려진다 — z-index를 올려도 일반 흐름의 요소는
  // 그 아래 깔린다. 지금 열려 있는 dialog 안으로 포털해서 같은 층에 올린다.
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    // 🔴 주소에 `?debug`가 있을 때만. localStorage에 남기지 마라 — 2026-08-28에 그렇게 했더니
    // "끄는 방법을 알아야만 꺼지는 물건"이 됐다. 진단은 켜는 것보다 꺼지는 게 쉬워야 한다.
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const vv = window.visualViewport;

    const read = () => {
      // 열린 dialog가 바뀌면 포털 대상도 따라간다(없으면 body).
      const open = [...document.querySelectorAll("dialog[open]")].pop() ?? null;
      setHost(open ?? document.body);
      const cs = getComputedStyle(document.documentElement);

      setText(
        [
          // 🔴 **"키보드 위 밝은 경계선" 판정 두 줄.** 지금 살아 있는 유일한 조사다.
          //    이 두 줄이 답하는 질문: 그 선이 우리가 그릴 수 있는 밴드 안인가.
          //    보이는 밴드는 레이아웃 좌표로 `vvTop .. vvTop+vvH`다(§15-2에서 확정한 기준).
          //    · `차` = 메모지 밑변 − 밴드끝. **음수면 메모지가 밴드 바닥에 못 닿는다** =
          //      그만큼이 문서 밖(캔버스)이고 거기 보이는 것은 `html`/`body` 배경이다.
          //      2026-09-03 실기기 판독이 `차=-235`였다 — 그게 이 조사의 현재 지점이다.
          //    · `페이드안=Y`면 아랫변 80px `::after` 페이드가 밴드 안으로 들어온다.
          //    · `vvTop>0`은 iOS가 화면을 밀고 있다는 뜻이다(우리 `--kb-inset` 패딩과 이중 보정).
          ...(() => {
            const vvT = vv ? Math.round(vv.offsetTop) : 0;
            const vvH = vv ? Math.round(vv.height) : window.innerHeight;
            const bandEnd = vvT + vvH;
            const head = `innerH=${window.innerHeight} vvH=${vvH} vvTop=${vvT}${vvT > 0 ? "🚨" : ""} app-vh=${cs.getPropertyValue("--app-vh").trim() || "?"} kb=${cs.getPropertyValue("--kb-inset").trim() || "?"}`;
            const paper = document.querySelector<HTMLElement>(".memo-edit-page.big-postit");
            if (!paper) return [`🔷 선판정: 편집 페이지 없음  ${head}`];
            const pb = Math.round(paper.getBoundingClientRect().bottom);
            const fadeTop = pb - 80;
            return [
              `🔴 선판정 ${head}`,
              `   밴드끝=${bandEnd} 메모지밑변=${pb} 차=${pb - bandEnd} 페이드위=${fadeTop} 페이드안=${fadeTop < bandEnd ? "🚨Y" : "N"}`,
            ];
          })(),
          // 불변식 — 깨진 게 있으면 그 한 줄이 원인을 바로 말해준다(layout-invariants.ts).
          // 총 개수를 하드코딩하지 마라: 2026-08-27에 "6개"로 박아뒀다가 불변식을 늘린 뒤
          // 틀린 값으로 남았다.
          ...(() => {
            const m = measureEditor();
            if (!m) return ["불변식: (편집창 없음)"];
            const all = judge(m);
            const bad = failures(all);
            return bad.length
              ? [`❌ 불변식 ${bad.length}/${all.length}개 깨짐`, ...bad.map((f) => `   ✗ ${f.name} — ${f.detail}`)]
              : [`✅ 불변식 ${all.length}개 전부 통과`];
          })(),
          // 다크 메모지 + 밝은 브라우저 표면이면 키보드 위에 밝은 띠가 뜬다(11-20절).
          // 읽는 법: canvas가 어두운데 cs=light이면 파생이 어긋난 것이다.
          `cs=${cs.colorScheme}  canvas=${cs.getPropertyValue("--memo-canvas").trim() || "unset"}  theme-color=${document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "none"}`,
          // 배경 스크롤 잠금이 굳었는지 한눈에. useViewportHeight가 이상을 감지하면 🚨를 남긴다.
          `scrollY=${Math.round(window.scrollY)} docSH=${document.documentElement.scrollHeight} bodyPos=${getComputedStyle(document.body).position}`,
          ...((window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink ?? []).map((s) => `🚨 ${s}`),
        ].join("\n"),
      );
    };

    read();
    // 100ms 폴링. requestAnimationFrame은 탭이 안 보이는 동안 멈춰서 값이 굳는다(실제로 겪었다).
    // 화면에서 숫자를 읽는 용도라 10Hz면 충분하다.
    const timer = window.setInterval(read, 100);
    return () => window.clearInterval(timer);
  }, []);

  if (!text || !host) return null;

  return createPortal(
    <pre
      style={{
        position: "fixed",
        top: "40%",
        left: 2,
        zIndex: 2147483647,
        margin: 0,
        padding: "5px 7px",
        maxWidth: "calc(100vw - 8px)",
        borderRadius: 6,
        background: "rgba(0,0,0,.86)",
        color: "#7dff9b",
        font: "600 9.5px/1.32 ui-monospace, Menlo, monospace",
        whiteSpace: "pre-wrap",
        pointerEvents: "none",
        letterSpacing: "-.02em",
      }}
    >
      {text}
    </pre>,
    host,
  );
}
