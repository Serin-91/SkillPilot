"use client";

import { useEffect, useState } from "react";

// 임시 진단 패널 — 실기기(iPhone Safari / 설치형 PWA)에서만 확인할 수 있는 값을 화면에 띄운다.
// 로컬에서는 iOS 키보드/visual viewport 동작을 재현할 수 없어서 추측으로 패치가 반복됐다.
//
// ?debug=vp 가 붙은 주소에서만 뜬다 — 일반 사용자에게는 렌더 자체가 되지 않는다.
// 원인이 확인되면 이 파일과 Dashboard의 호출부를 같이 지운다.
//
// 패널 자체는 visualViewport 기준으로 위치를 잡는다. iOS가 화면을 패닝하면 position:fixed
// 요소는 같이 밀려 나가는데, 그러면 진단 패널부터 안 보인다. offsetTop/offsetLeft를 직접
// 반영해서 패널만은 항상 보이는 자리에 남긴다 — 이 값이 0이 아니라는 것 자체가 단서다.

// 어떤 요소를 실제로 스크롤할 수 있는지. iOS는 캐럿을 보이게 할 때 이 체인을 위로 훑다가
// 처음 만나는 스크롤 컨테이너에서 멈춘다 — 그게 우리가 의도한 스크롤러가 아니면 화면이 안 움직인다.
function scrollChain(el: Element | null) {
  const out: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const s = getComputedStyle(node);
    const scrollable = s.overflowY !== "visible";
    if (scrollable) {
      const canScroll = node.scrollHeight > node.clientHeight;
      out.push(
        `${node.tagName}.${(node.className || "").toString().split(" ").slice(0, 2).join(".")}` +
          ` oy=${s.overflowY} ${canScroll ? `LIVE ${Math.round(node.scrollTop)}/${node.scrollHeight - node.clientHeight}` : "DEAD"}`,
      );
    }
    node = node.parentElement;
  }
  return out;
}

export function ViewportDebug() {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const vv = window.visualViewport;

    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const active = document.activeElement;
      // 보이는 영역(visual viewport)을 레이아웃 좌표로 환산한 사각형.
      // getBoundingClientRect()가 주는 값과 같은 좌표계라 바로 비교할 수 있다.
      const vTop = vv ? vv.offsetTop : 0;
      const vBottom = vTop + (vv ? vv.height : window.innerHeight);
      const inView = (r: DOMRect | null) =>
        !r || r.height === 0 ? "-" : r.top >= vTop && r.bottom <= vBottom ? "YES" : "NO";

      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const fmt = (r: DOMRect | null) => (r ? `t=${Math.round(r.top)} b=${Math.round(r.bottom)} h=${Math.round(r.height)}` : "none");

      let caret: DOMRect | null = null;
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) caret = sel.getRangeAt(0).getBoundingClientRect();
      } catch {
        /* 선택이 없으면 캐럿 정보도 없다 */
      }

      const tb = rect(".mobile-rich-toolbar.open") ?? rect(".mobile-rich-toolbar");
      const scroller = document.querySelector(".textarea-row.main") ?? document.querySelector(".big-postit .textarea-row");

      setText(
        [
          `standalone=${window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone ? "YES" : "no"}`,
          `innerH=${window.innerHeight} vvH=${vv ? Math.round(vv.height) : "-"} vvTop=${vv ? Math.round(vv.offsetTop) : "-"} vvPageTop=${vv ? Math.round(vv.pageTop) : "-"} scale=${vv ? vv.scale.toFixed(2) : "-"}`,
          `--kb-inset=${cs.getPropertyValue("--kb-inset").trim() || "unset"} --app-vh=${cs.getPropertyValue("--app-vh").trim() || "unset"}`,
          `scrollY=${Math.round(window.scrollY)} bodyPos=${getComputedStyle(document.body).position}`,
          `focus=${active ? active.tagName + "." + (active.className || "").toString().split(" ")[0] : "none"}`,
          `visible band: ${Math.round(vTop)}..${Math.round(vBottom)}`,
          `caret   ${fmt(caret)}  inView=${inView(caret)}`,
          `toolbar ${fmt(tb)}  inView=${inView(tb)}`,
          `dialog  ${fmt(rect("dialog[open] .dialog-inner"))}`,
          `postit  ${fmt(rect(".big-postit"))}`,
          `scroller ${scroller ? `${(scroller.className || "").toString().split(" ").slice(0, 2).join(".")} h=${Math.round(scroller.getBoundingClientRect().height)} scroll=${Math.round(scroller.scrollTop)}/${scroller.scrollHeight - scroller.clientHeight}` : "none"}`,
          `-- scroll chain from focus --`,
          ...(scrollChain(active).length ? scrollChain(active) : ["(none)"]),
        ].join("\n"),
      );
    };

    read();
    // 100ms 폴링. requestAnimationFrame을 쓰면 탭이 안 보이는 동안 아예 멈춰서 값이 굳는다
    // (로컬 확인 중 실제로 겪었다). 화면에서 숫자를 읽는 용도라 10Hz면 충분하고, 키보드
    // 애니메이션이나 패닝처럼 값이 계속 변하는 구간도 이 정도면 따라간다.
    const timer = window.setInterval(read, 100);
    return () => window.clearInterval(timer);
  }, []);

  if (!text) return null;

  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return (
    <pre
      style={{
        position: "fixed",
        top: (vv?.offsetTop ?? 0) + 2,
        left: (vv?.offsetLeft ?? 0) + 2,
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
    </pre>
  );
}
