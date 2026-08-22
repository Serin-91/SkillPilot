"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

// 가로로 실제로 스크롤되는 박스를 전부 찾는다. 손가락을 옆으로 끌었을 때 "다른 화면이 나오는"
// 정체가 이거다 — 어느 박스가 몇 px 넘치는지 이름으로 바로 나온다.
function horizontalScrollers() {
  return [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((el) => {
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 1) return false;
      const ox = getComputedStyle(el).overflowX;
      return ox === "auto" || ox === "scroll";
    })
    .slice(0, 6)
    .map(
      (el) =>
        `${el.tagName}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")}` +
        ` +${el.scrollWidth - el.clientWidth}px at ${Math.round(el.scrollLeft)}`,
    );
}

// 화면 오른쪽 밖으로 나가 있는데 숨겨지지 않은 요소. 이런 게 하나라도 있으면 가로로 끌 수 있게
// 되고("옆으로 끌면 다른 화면이 나온다"), 그 가로 제스처가 iOS 뒤로가기 스와이프와 겹친다.
// 부모가 잘라내고 있으면 제외한다 — 실제로 끌어서 볼 수 있는 것만 남긴다.
function offscreenRight() {
  const vw = window.innerWidth;
  return [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
      // 부모 중 하나가 이미 잘라내고 있으면 끌어서 볼 수 없다
      let p = el.parentElement;
      while (p) {
        const ps = getComputedStyle(p);
        if (ps.overflowX === "hidden" || ps.overflowX === "clip") return false;
        p = p.parentElement;
      }
      return true;
    })
    .slice(0, 6)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${el.tagName}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")} right=${Math.round(r.right)} (vw ${vw})`;
    });
}


// 스크롤러 바닥부터 "보이는 화면 끝"(=키보드 윗변)까지 사이에 실제로 무엇이 들어 있는지 분해한다.
// "키보드 위 여백"이 우리 패딩인지, 버튼 행인지, 아니면 사파리 액세서리 바처럼 페이지가 손댈 수
// 없는 브라우저 UI인지를 추측하지 않고 가른다.
function gapBelowText(scroller: Element | null, visibleBottom: number) {
  if (!scroller) return ["(scroller 없음)"];
  const sb = scroller.getBoundingClientRect().bottom;
  const out = [`scrollerBottom=${Math.round(sb)}  visibleBottom=${Math.round(visibleBottom)}  gap=${Math.round(visibleBottom - sb)}px`];
  // 그 구간을 차지하는 형제/조상 박스를 이름과 높이로 나열한다.
  const shell = scroller.closest(".big-postit, .memo-form, .dialog-inner");
  if (shell) {
    const cs = getComputedStyle(shell);
    out.push(`shell=${(shell.className || "").toString().split(" ").slice(0, 2).join(".")} padBottom=${cs.paddingBottom}`);
    [...shell.children].forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top >= sb - 1) {
        out.push(`  ↓ ${(el.className || el.tagName).toString().split(" ")[0]} h=${Math.round(r.height)} t=${Math.round(r.top)}`);
      }
    });
  }
  // gap이 우리 박스들의 합보다 크면 그 차액은 브라우저 UI(액세서리 바)다.
  return out;
}

export function ViewportDebug() {
  const [text, setText] = useState("");
  // showModal()로 연 <dialog>는 top layer에 그려진다 — z-index를 아무리 올려도 일반 흐름의
  // 요소는 그 아래 깔린다. 실제로 상세 화면에서 패널이 통째로 안 보였다.
  // 지금 열려 있는 dialog 안으로 포털해서 같은 층에 올린다.
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const vv = window.visualViewport;

    const read = () => {
      // 열린 dialog가 바뀌면 포털 대상도 따라간다(없으면 body).
      const open = [...document.querySelectorAll("dialog[open]")].pop() ?? null;
      setHost(open ?? document.body);
      const cs = getComputedStyle(document.documentElement);
      const active = document.activeElement;
      // 보이는 영역. getBoundingClientRect()는 iOS에서 visual viewport 기준으로 나오므로
      // 밴드는 0..vv.height다 — 여기에 offsetTop을 더하면 안 된다.
      // (한때 offsetTop을 더해서 caret/toolbar가 실제로는 보이는데 inView=NO로 찍혔고, 그 오독
      //  때문에 "페인트 문제"라고 잘못 짚었다. offsetTop 자체는 맨 윗줄에 따로 찍는다.)
      const vTop = 0;
      const vBottom = vv ? vv.height : window.innerHeight;
      const inView = (r: DOMRect | null) =>
        !r || r.height === 0 ? "-" : r.top >= vTop && r.bottom <= vBottom ? "YES" : "NO";

      // 열린 dialog 안에서만 찾는다. bigEditorNode/postitViewNode가 여러 dialog에 중복 삽입돼
      // 있어서(Dashboard 주석 참고) document 전체에서 찾으면 닫혀 있는 dialog의 사본이 먼저
      // 잡히고 h=0으로 찍힌다 — 실제로 toolbar/postit/scroller가 전부 h=0으로 나와 오해했다.
      const rect = (sel: string) =>
        ((open ?? document).querySelector(sel) ?? document.querySelector(sel))?.getBoundingClientRect() ?? null;
      const fmt = (r: DOMRect | null) => (r ? `t=${Math.round(r.top)} b=${Math.round(r.bottom)} h=${Math.round(r.height)}` : "none");

      let caret: DOMRect | null = null;
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) caret = sel.getRangeAt(0).getBoundingClientRect();
      } catch {
        /* 선택이 없으면 캐럿 정보도 없다 */
      }

      const tb = rect(".mobile-rich-toolbar");
      const inOpen = (sel: string) => (open ?? document).querySelector(sel);
      // 실제로 스크롤되는 것을 고른다 — 어느 경로(.big-postit / compose)인지 미리 정하지 않는다.
      const scroller =
        [...(open ?? document).querySelectorAll<HTMLElement>(".textarea-row")].find(
          (el) => el.scrollHeight > el.clientHeight,
        ) ?? inOpen(".textarea-row");

      setText(
        [
          `standalone=${window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone ? "YES" : "no"}`,
          `SCALE=${vv ? vv.scale.toFixed(2) : "-"}  vvLeft=${vv ? Math.round(vv.offsetLeft) : "-"}  vvTop=${vv ? Math.round(vv.offsetTop) : "-"}`,
          `innerH=${window.innerHeight} vvH=${vv ? Math.round(vv.height) : "-"} innerW=${window.innerWidth} vvW=${vv ? Math.round(vv.width) : "-"}`,
          // --kb-inset이 0이면 키보드 보정이 죽은 것이다. 키보드가 올라온 상태에서 이 값이
          // 실제로 가려진 높이(수백 px)와 맞는지가 이 진단의 핵심이다.
          `KB-INSET=${cs.getPropertyValue("--kb-inset").trim() || "unset"}  app-vh=${cs.getPropertyValue("--app-vh").trim() || "unset"}`,
          `scrollY=${Math.round(window.scrollY)} bodyPos=${getComputedStyle(document.body).position}`,
          `focus=${active ? active.tagName + "." + (active.className || "").toString().split(" ")[0] : "none"}`,
          `visible band: ${Math.round(vTop)}..${Math.round(vBottom)}`,
          `caret   ${fmt(caret)}  inView=${inView(caret)}`,
          `toolbar ${fmt(tb)}  inView=${inView(tb)}`,
          `dialog  ${fmt(rect("dialog[open] .dialog-inner"))}`,
          `postit  ${fmt(rect(".big-postit"))}`,
          `scroller ${scroller ? `${(scroller.className || "").toString().split(" ").slice(0, 2).join(".")} h=${Math.round(scroller.getBoundingClientRect().height)} scroll=${Math.round(scroller.scrollTop)}/${scroller.scrollHeight - scroller.clientHeight}` : "none"}`,
          `docW ${document.documentElement.scrollWidth}/${document.documentElement.clientWidth}`,
          `-- 글 끝 ~ 키보드 사이에 뭐가 있나 --`,
          ...gapBelowText(scroller, vv ? vv.height : window.innerHeight),
          `-- H scrollers (옆으로 끌리는 범인) --`,
          ...(horizontalScrollers().length ? horizontalScrollers() : ["(none)"]),
          `-- 화면 오른쪽 밖에 살아있는 요소 --`,
          ...(offscreenRight().length ? offscreenRight() : ["(none)"]),
          `-- vertical chain from focus --`,
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

  if (!text || !host) return null;

  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return createPortal(
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
    </pre>,
    host,
  );
}
