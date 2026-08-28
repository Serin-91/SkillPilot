"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { measureEditor, judge, failures } from "@/lib/layout-invariants";

// 임시 진단 패널 — 실기기(iPhone Safari / 설치형 PWA)에서만 확인할 수 있는 값을 화면에 띄운다.
// 로컬에서는 iOS 키보드/visual viewport 동작을 재현할 수 없어서 추측으로 패치가 반복됐다.
//
// ?debug=vp 가 붙은 주소에서만 뜬다 — 일반 사용자에게는 렌더 자체가 되지 않는다.
//
// 지우기 전에 docs/mobile-pwa-postmortem.md 4절(판단 순서)을 읽을 것 — 그 순서가 이 패널을
// 전제로 쓰여 있다. 지웠다가 같은 증상이 또 나면 git에서 이 파일과 Dashboard의 호출부를
// 되살리는 것이 처음부터 코드를 추측하는 것보다 항상 빠르다(그 추측으로 5라운드를 썼다).
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
  // 편집 화면에 들어간 뒤 딱 한 번 도는 "문서가 정말 굴러가나" 자가진단. 결과 문자열만 남긴다.
  const scrollTest = useRef("(편집 아님)");

  useEffect(() => {
    // 쿼리스트링은 쉽게 사라진다 — 로고 클릭의 `router.push("/")`, 로그인 리다이렉트,
    // 설치형 PWA의 start_url. 그러면 "주소는 넣었는데 패널이 없다"가 되고, 원인을 패널
    // 자체에서 찾게 된다. 한 번 켜면 localStorage에 남겨 그 다음부터는 주소와 무관하게 뜬다.
    // 끄기: `?debug=off`.
    const qs = new URLSearchParams(window.location.search).get("debug");
    let mode = qs;
    try {
      if (qs === "off") localStorage.removeItem("spDebug");
      else if (qs !== null) localStorage.setItem("spDebug", qs);
      else mode = localStorage.getItem("spDebug");
    } catch {
      /* 사파리 프라이빗 모드 등 — 저장이 막히면 쿼리스트링만으로 동작한다 */
    }
    if (mode === null || mode === "off") return;
    const vv = window.visualViewport;

    // 🔴 진짜 손가락 제스처를 기록한다. SCROLLTEST가 `ok (0→120)`으로 나왔다 —
    // **문서는 굴러간다.** 그런데 손가락으로는 안 굴러간다. 그러면 스크롤러가 아니라
    // 제스처가 스크롤로 라우팅되지 않는 것이고, computed style에는 아무것도 안 나타난다.
    // 그 구간은 재는 방법이 하나뿐이다 — 실제 touch 이벤트를 보는 것.
    // 리스너는 window의 **버블 단계**에 단다. document의 리스너들보다 뒤에 돌아서
    // 누군가 preventDefault를 했는지 그 시점에 정확히 읽힌다(캡처 단계면 아직 안 보인다).
    // 전부 passive라 이 계측 자체가 스크롤을 방해하지 않는다.
    const gest = {
      tgt: "", moves: 0, startY: 0, dy: 0, sy0: 0, sy1: 0, syAfter: -1,
      max0: 0, max1: 0, vv0: 0, vv1: 0, prevented: false, seen: false,
    };
    const nameOf = (el: EventTarget | null) => {
      const e = el as HTMLElement | null;
      if (!e || !e.tagName) return "?";
      const c = typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : "";
      return (e.tagName + c).slice(0, 22);
    };
    // 🔴 "가다가 막힌다"는 한 제스처만 봐서는 못 푼다. 손가락이 448px 움직였는데 문서가
    // 413px 갔으면 그 제스처 자체는 **정상**이다 — 막힌 건 그 다음 제스처다. 그래서 직전
    // 제스처를 같이 남기고, 제스처 도중에 **판이 바뀌는지**를 함께 기록한다:
    //   max  — 문서가 굴러갈 수 있는 총량. 도중에 줄면 스크롤이 잘려 멈춘 것처럼 보인다.
    //   vvH  — 스크롤하다 키보드가 닫히면(iOS의 scroll-to-dismiss) 레이아웃이 통째로 바뀐다.
    //   +0.5s — 손을 뗀 뒤 되돌아가는지(캐럿 노출이 낚아채는 경우). 관성도 여기 잡힌다.
    // 🔴🔴 제스처 도중에 **누가 window.scrollTo를 부르는지** 센다. 이게 이 계측의 핵심이다.
    // useViewportHeight.ts:156에 `if (inset > 0 && notZoomed() && vv.offsetTop > 0)
    // window.scrollTo(0, 0)`이 있고, 그 함수는 `vv.scroll`에서도 돈다 — 즉 손가락으로 굴리는
    // 도중에 문서를 0으로 되돌릴 수 있다. 그 코드는 배경 스크롤 잠금(body{position:fixed}) +
    // fixed 껍데기 구조를 전제로 쓰였는데, 새 구조에서는 문서가 스크롤러라 전제가 뒤집혔다.
    // "가다가 막힘"의 모양과 정확히 같지만, **추측으로 그 파일을 고치지 않는다.** 여기서 센다.
    // 내 SCROLLTEST가 부르는 것은 제외한다(ignoreST).
    const origScrollTo = window.scrollTo.bind(window);
    let stCount = 0;
    let stLast = "";
    let ignoreST = false;
    const patched = (...a: unknown[]) => {
      if (!ignoreST) {
        const y = typeof a[0] === "object" && a[0] !== null ? (a[0] as ScrollToOptions).top : a[1];
        stCount += 1;
        stLast = String(Math.round(Number(y) || 0));
      }
      return (origScrollTo as (...args: unknown[]) => void)(...a);
    };
    (window as unknown as { scrollTo: unknown }).scrollTo = patched;

    const maxNow = () => document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const vvHNow = () => (vv ? Math.round(vv.height) : -1);
    let prevLine = "";
    const fmtGest = () =>
      `${gest.tgt} moves=${gest.moves} dy=${gest.dy} sy ${gest.sy0}→${gest.sy1}${
        gest.syAfter >= 0 && gest.syAfter !== gest.sy1 ? `→${gest.syAfter}(+0.5s)` : ""
      } max ${gest.max0}${gest.max1 !== gest.max0 ? `→🚨${gest.max1}` : ""} vvH ${gest.vv0}${
        gest.vv1 !== gest.vv0 ? `→🚨${gest.vv1}` : ""
      } prevented=${gest.prevented ? "🚨YES" : "NO"} scrollTo=${stCount ? `🚨${stCount}회 last=${stLast}` : "0회"}`;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (gest.seen) prevLine = fmtGest();
      gest.seen = true;
      gest.tgt = nameOf(e.target);
      gest.moves = 0;
      gest.dy = 0;
      gest.startY = t.clientY;
      gest.sy0 = Math.round(window.scrollY);
      gest.sy1 = gest.sy0;
      gest.syAfter = -1;
      gest.max0 = maxNow();
      gest.max1 = gest.max0;
      gest.vv0 = vvHNow();
      gest.vv1 = gest.vv0;
      gest.prevented = false;
      stCount = 0;
      stLast = "";
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      gest.moves += 1;
      gest.dy = Math.round(t.clientY - gest.startY);
      gest.sy1 = Math.round(window.scrollY);
      gest.max1 = maxNow();
      gest.vv1 = vvHNow();
      if (e.defaultPrevented) gest.prevented = true;
    };
    const onEnd = () => {
      gest.sy1 = Math.round(window.scrollY);
      gest.max1 = maxNow();
      gest.vv1 = vvHNow();
      window.setTimeout(() => {
        gest.syAfter = Math.round(window.scrollY);
      }, 500);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });

    const read = () => {
      // 열린 dialog가 바뀌면 포털 대상도 따라간다(없으면 body).
      const open = [...document.querySelectorAll("dialog[open]")].pop() ?? null;
      setHost(open ?? document.body);

      // 2026-08-28 임시 — `?debug=scroll`: 스크롤 잠김 전용 **짧은** 패널.
      // 전체 패널(`?debug=vp`)은 키보드가 올라오면 아래가 잘려서 정작 봐야 할 줄을 못 본다
      // (사용자 신고). 여기서는 스크롤을 죽일 수 있는 것만 남긴다.
      //
      // 🔴 `TOUCH` 줄이 이 패널의 존재 이유다. 실기기 실측에서 body는 static, 열린 dialog 0,
      // `.sp-body`는 clip/visible, 굴릴 수 없는 스크롤러 0개 — **computed style이 전부 정상인데
      // 스크롤이 죽어 있었다.** 그 상태를 만들 수 있는 경로는 스타일에 흔적을 남기지 않는 것뿐이고,
      // 이 코드베이스에는 하나 있다: `useHoldDrag`가 드래그로 승격되면 document에
      // `touchmove` 블로커(`{passive:false}` + `preventDefault`)를 건다. `dragging`이 참인 채
      // 굳으면 문서 전체 터치 스크롤이 죽는데 어떤 스타일에도 안 나타난다.
      // 취소 가능한 touchmove를 **실제로 손가락이 닿는 요소**에서 쏘아 올려 조상 체인 전체에
      // 블로커가 있는지 본다(bubbles: true라 document까지 올라간다).
      if (mode === "scroll") {
        const de = document.documentElement;
        const ep = document.querySelector<HTMLElement>(".memo-edit-page");
        const probeTarget =
          document.querySelector<HTMLElement>(".memo-edit-page .rich-editor-content") ?? ep ?? document.body;
        const probe = new Event("touchmove", { cancelable: true, bubbles: true });
        probeTarget.dispatchEvent(probe);
        const chain: string[] = [];
        for (let n: HTMLElement | null = ep; n; n = n.parentElement) {
          const s = getComputedStyle(n);
          // html은 next/font가 붙인 긴 해시 클래스를 갖고 있어 375px에서 한 줄을 통째로 먹는다.
          const name =
            n === de || n === document.body
              ? n.tagName.toLowerCase()
              : typeof n.className === "string" && n.className
                ? n.className.split(" ")[0]
                : n.tagName;
          chain.push(`${name} ${s.overflowY}/${s.position} ta=${s.touchAction}`);
        }
        const r = ep?.getBoundingClientRect();
        // 🔴 2026-08-28 — 여기까지 이 패널은 `.memo-edit-page`의 **조상**만 봤다. 그런데 실기기
        // 실측이 `sy=0`(문서 맨 위) + `EP t=0`(껍데기가 화면 맨 위)인데도 사용자는 메모의
        // **하단**을 보고 있다고 신고했다. 껍데기가 제자리인데 안의 글이 밀려 있다는 뜻이고,
        // 그건 조상이 아니라 **안쪽**에서만 일어날 수 있다 — 안쪽 스크롤러가 아래로 굴러가
        // 있거나(그러면 손가락은 그 박스를 굴리게 되어 "문서가 안 움직인다"가 된다), 글 박스
        // 자체가 위로 나가 있거나.
        // `?debug=vp`의 "굴릴 수 없는 스크롤러" 목록은 **죽은** 것만 세므로 살아서 굴러간
        // 스크롤러는 거기 안 잡힌다 — 그래서 "None"을 무죄로 읽으면 안 됐다.
        const inner = ep
          ? [...ep.querySelectorAll<HTMLElement>("*")].filter((e) => {
              const s = getComputedStyle(e);
              return /auto|scroll/.test(s.overflowY) && e.clientHeight > 0;
            })
          : [];
        const shortCls = (e: HTMLElement) =>
          (typeof e.className === "string" && e.className ? e.className.split(" ")[0] : e.tagName).slice(0, 18);
        const title = ep?.querySelector<HTMLElement>(".big-title-input, .big-title, .form-title-input") ?? null;
        const bodyEl = ep?.querySelector<HTMLElement>(".rich-editor-content") ?? null;
        const topOf = (e: HTMLElement | null) => (e ? Math.round(e.getBoundingClientRect().top) : null);

        // 🔴 여기까지 나온 값은 전부 "굴러가야 한다"고 말한다: 문서 1916 > 뷰포트 684,
        // body static, 열린 dialog 0, touchmove 블로커 없음, 안쪽 스크롤러 0개. 그런데
        // 사용자 손가락으로는 안 굴러간다. 그러면 남은 갈림길은 둘뿐이고 서로 처방이 정반대다:
        //   (a) 문서가 **정말로** 못 굴러간다 → 숫자가 거짓말이고 스크롤러 자체가 죽은 것
        //   (b) 문서는 굴러가는데 **손가락 제스처가 거기 도달하지 못한다** → 선택/캐럿 등
        //       터치 단계에서 먹히는 것이고, computed style로는 영원히 안 보인다
        // 재보지 않고는 절대 못 가른다. 편집 진입 1.2초 뒤 딱 한 번 120px 굴려보고 되돌린다.
        // (한 번뿐이라 사용자 조작과 싸우지 않고, 실패해도 원위치다.)
        if (!ep) scrollTest.current = "(편집 아님)";
        else if (scrollTest.current === "(편집 아님)") {
          scrollTest.current = "측정 중…";
          window.setTimeout(() => {
            const before = window.scrollY;
            ignoreST = true;
            window.scrollTo(0, before + 120);
            const after = window.scrollY;
            window.scrollTo(0, before);
            ignoreST = false;
            const max = de.scrollHeight - de.clientHeight;
            scrollTest.current =
              after > before + 1
                ? `ok (${Math.round(before)}→${Math.round(after)}, max ${max})`
                : `🚨 문서가 안 굴러감 (${Math.round(before)}→${Math.round(after)}, max ${max})`;
          }, 1200);
        }
        setText(
          [
            `DOC ${de.scrollHeight}/${de.clientHeight} sy=${Math.round(window.scrollY)}/${Math.round(de.scrollTop)}/${Math.round(document.body.scrollTop)} body=${getComputedStyle(document.body).position} dlg=${document.querySelectorAll("dialog[open]").length}`,
            `TOUCH ${probe.defaultPrevented ? "🚨 BLOCKED" : "ok"}  scale=${vv ? vv.scale : "-"} vvTop=${vv ? Math.round(vv.offsetTop) : "-"} vvH=${vv ? Math.round(vv.height) : "-"}`,
            ep && r
              ? `EP t=${Math.round(r.top)} h=${Math.round(r.height)} padB=${getComputedStyle(ep).paddingBottom}`
              : `EP 없음(편집 아님)`,
            `IN ${
              inner.length
                ? `🚨 ${inner
                    .map((e) => `${shortCls(e)} ${e.scrollHeight}/${e.clientHeight} st=${Math.round(e.scrollTop)}`)
                    .join(" | ")}`
                : "0개(정상)"
            }`,
            `TXT 제목t=${topOf(title)} 본문t=${topOf(bodyEl)} h=${bodyEl ? Math.round(bodyEl.getBoundingClientRect().height) : "-"}`,
            `SCROLLTEST ${scrollTest.current}`,
            // moves가 있는데 sy가 안 변하고 prevented=NO면 → 브라우저가 이 제스처를 스크롤로
            // 안 고른 것(선택/캐럿에 먹힘). prevented=YES면 누가 막는 것. moves=0이면 터치가
            // 페이지까지 오지도 않는 것. 셋의 처방이 전부 다르다.
            `GEST ${gest.seen ? fmtGest() : "(아직 안 만짐)"}`,
            ...(prevLine ? [`직전 ${prevLine}`] : []),
            ...chain.map((c) => `  ${c}`),
          ].join("\n"),
        );
        return;
      }

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
      // .dialog-body-scroll도 후보다 — 프로젝트 상세 편집은 .textarea-row가 아니라 이쪽이 스크롤러라
      // 예전 패널은 프로젝트 화면에서 scroller=none만 찍고 아무것도 못 알려줬다.
      const scroller =
        [...(open ?? document).querySelectorAll<HTMLElement>(".textarea-row, .dialog-body-scroll")].find(
          (el) => el.scrollHeight > el.clientHeight,
        ) ?? inOpen(".textarea-row, .dialog-body-scroll");
      // 굴릴 수 없는 스크롤러(auto인데 넘치는 내용이 없는 박스). iOS는 조상 체인에서 이걸 만나면
      // 거기서 터치를 멈춘다 — 열려 있는 dialog 안에서 이 목록은 항상 비어 있어야 한다.
      const phantoms = [...(open ?? document).querySelectorAll<HTMLElement>("*")]
        .filter((el) => {
          // 실제로 그려진 것만. 닫힌 <dialog>의 자식은 마운트만 돼 있고 높이가 0이라 전부 걸린다 —
          // 그걸 같이 찍으면 목록이 노이즈로 덮여 정작 볼 것을 못 본다.
          if (el.clientHeight === 0) return false;
          const s = getComputedStyle(el);
          // 세로만 본다. 신고된 증상이 전부 세로 스크롤 잠김이고, 가로 스트립(달력 등)은 정상 동작이다.
          return /auto|scroll/.test(s.overflowY) && el.scrollHeight - el.clientHeight <= 2;
        })
        .map((el) => `  ✗ ${(el.className || el.tagName).toString().split(" ")[0]} h=${el.clientHeight}`);

      // 2026-08-28 임시 — `.sp-body`가 세로 스크롤러가 되는지 실기기에서 한 줄로 가른다.
      // dashboard.css:10이 `overflow-x: hidden; overflow-x: clip; overflow-y: visible`인데,
      // `clip`이 안 먹는 브라우저에서는 앞줄 `hidden`이 살아나고 그 순간 반대 축 `visible`이
      // `auto`로 승격된다(지뢰표 "overflow 한 축만 적으면 반대 축이 승격된다"). `.sp-body`는
      // 내용만큼 자라는 박스라 sh == ch인 **굴릴 수 없는 스크롤러**가 되고, iOS는 조상 체인에서
      // 그런 박스를 만나면 거기서 터치를 멈춘다 = "아예 스크롤 잠김".
      // 로컬 크롬은 clip을 지원해서 재현되지 않는다 — 그래서 실기기에서만 가릴 수 있다.
      // 실측(로컬 375px, 폴백 강제): ox hidden → oy가 visible에서 **auto**로 바뀌고 2834/2834.
      // 결과가 나오면 이 블록과 아래 CLIP 두 줄을 같이 지운다.
      const sp = document.querySelector<HTMLElement>(".sp-body");
      const spo = sp ? getComputedStyle(sp) : null;

      setText(
        [
          `CLIP=${CSS.supports("overflow-x", "clip") ? "yes" : "NO"}  .sp-body ox=${spo ? spo.overflowX : "-"} oy=${spo ? spo.overflowY : "-"}`,
          `  sp-body sh/ch=${sp ? `${sp.scrollHeight}/${sp.clientHeight}` : "-"}${!spo ? "" : spo.overflowY === "visible" ? "  ← ok (문서가 스크롤러)" : "  ← 🚨 .sp-body가 세로 스크롤러"}`,
          // 🔴 불변식을 **맨 위**에 둔다. 깨진 게 있으면 그 한 줄이 원인을 바로 말해주므로
          // 아래 수치들을 눈으로 훑을 필요가 없다(layout-invariants.ts 참고).
          ...(() => {
            const m = measureEditor();
            if (!m) return ["불변식: (편집창 없음)"];
            const all = judge(m);
            const bad = failures(all);
            // 총 개수는 세지 말고 판정 결과에서 읽는다 — 하드코딩한 "6개"가 불변식을 늘린 뒤
            // 틀린 값으로 남았다(2026-08-27). 이 파일에 숫자를 다시 박지 마라.
            return bad.length
              ? [`❌ 불변식 ${bad.length}/${all.length}개 깨짐`, ...bad.map((f) => `   ✗ ${f.name} — ${f.detail}`)]
              : [`✅ 불변식 ${all.length}개 전부 통과`];
          })(),
          `standalone=${window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone ? "YES" : "no"}`,
          // vvTop이 0이 아니면 iOS가 화면을 밀고 있다 = 우리 --kb-inset 패딩과 **이중 보정**이다.
          // 그 화면이 "여백이 절반까지 차올라 글이 가려진다"로 보인다(useViewportHeight의 되돌리기 참고).
          `SCALE=${vv ? vv.scale : "-"}  vvLeft=${vv ? Math.round(vv.offsetLeft) : "-"}  vvTop=${vv ? Math.round(vv.offsetTop) : "-"}${vv && vv.offsetTop > 0 ? "  ← 🚨 밀림(글 가려짐)" : ""}`,
          `innerH=${window.innerHeight} vvH=${vv ? Math.round(vv.height) : "-"} innerW=${window.innerWidth} vvW=${vv ? Math.round(vv.width) : "-"}`,
          // --kb-inset이 0이면 키보드 보정이 죽은 것이다. 키보드가 올라온 상태에서 이 값이
          // 실제로 가려진 높이(수백 px)와 맞는지가 이 진단의 핵심이다.
          // 🔴🔴 --vv-push를 반드시 찍어라. 이 값이 안 보여서 2주를 태웠다. 상쇄가 안 먹을 때 원인은
          // 둘 중 하나뿐이다: push가 0(=JS가 계산을 안 했다) / push는 맞는데 껍데기가 안 움직인다
          // (=CSS transform이 !important에 지고 있다 — 실제로 그거였다). 두 값을 같이 봐야 구분된다.
          `VV-PUSH=${cs.getPropertyValue("--vv-push").trim() || "unset"}${(parseFloat(cs.getPropertyValue("--vv-push")) || 0) === 0 && vv && vv.offsetTop > 0 ? "  ← 🚨 밀렸는데 push=0 (JS쪽)" : ""}`,
          `KB-INSET=${cs.getPropertyValue("--kb-inset").trim() || "unset"}  app-vh=${cs.getPropertyValue("--app-vh").trim() || "unset"}`,
          // 🔴 이력을 맨 아래 두면 패널이 길어서 정작 봐야 할 base가 화면 밖으로 나간다("디버그창이
          // 너무 길어서 base 수치가 잘 안 보인다"). 지금 조사 중인 값이므로 KB-INSET 바로 밑에 둔다.
          // 진입 직후 여백이 커지는 건 baseline이 튄 것이고, 그 찰나는 이 패널의 10Hz 폴링으로는
          // 못 잡으므로 useViewportHeight가 값이 바뀌는 자리에서 직접 남긴다. `R`은 baseline 갱신 허용 호출.
          // 본문이 갑자기 줄어 자동저장이 막힌 순간. 이 줄이 보이면 "글 내용이 날아간다"가
          // 재현된 것이고, 그때 서버 덮어쓰기는 막혔다는 뜻이다(Dashboard의 scheduleAutosave 가드).
          ...((window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink ?? []).map((s) => `🚨 ${s}`),
          `-- kb 이력 (base가 튀면 그게 여백 폭발) --`,
          ...((window as unknown as { __spKbLog?: string[] }).__spKbLog ?? ["(없음)"]).slice(-5),
          `--`,
          `scrollY=${Math.round(window.scrollY)} bodyPos=${getComputedStyle(document.body).position}`,
          `focus=${active ? active.tagName + "." + (active.className || "").toString().split(" ")[0] : "none"}`,
          `visible band: ${Math.round(vTop)}..${Math.round(vBottom)}`,
          // 🔴 편집/보기를 패널이 직접 말한다. 보기 모드에서는 편집 가능한 요소가 없어 selection도
          // 없으므로 `caret none`이 **정상**이다 — 그걸 모르고 보기 모드 스크린샷의 caret none을
          // "포커스를 잃었다"로 읽으면 라운드를 통째로 태운다(2026-08-26에 실제로 그럴 뻔했다).
          // caret none이 신호가 되는 것은 mode=EDIT일 때뿐이다.
          `mode=${(open ?? document).querySelector(".textarea-row, .dialog-body-scroll") ? "EDIT (caret none이면 비정상)" : "view (caret none 정상)"}`,
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
          `-- 굴릴 수 없는 스크롤러 (비어 있어야 정상) --`,
          ...(phantoms.length ? phantoms.slice(0, 8) : ["(none)"]),
          `-- vertical chain from focus --`,
          ...(scrollChain(active).length ? scrollChain(active) : ["(none)"]),
          // 위로가기(↑)를 누른 뒤 2.5초간의 scrollTop 추적. Dashboard.tsx의 traceScrollTop이 채운다 —
          // 읽는 법(어느 시각이 어느 범인인지)은 그 함수 위 주석에 있다.
          // 🔴 slice(-14)로 꼬리만 보여줬다가 정작 필요한 `tap from=`과 **처음 되돌아간 순간**을 통째로
          // 잘라먹었다(2026-08-26 1차 스크린샷). 되돌린 범인은 항상 앞쪽에 있다 — 머리를 먼저 남긴다.
          `-- ↑ 위로가기 tap trace (버튼 누른 뒤) --`,
          ...(() => {
            const t = (window as unknown as { __spScrollTrace?: string[] }).__spScrollTrace;
            if (!t || !t.length) return ["(아직 안 눌렀음)"];
            if (t.length <= 14) return t;
            return [...t.slice(0, 9), `   … ${t.length - 13}줄 생략 …`, ...t.slice(-4)];
          })(),
        ].join("\n"),
      );
    };

    read();
    // 100ms 폴링. requestAnimationFrame을 쓰면 탭이 안 보이는 동안 아예 멈춰서 값이 굳는다
    // (로컬 확인 중 실제로 겪었다). 화면에서 숫자를 읽는 용도라 10Hz면 충분하고, 키보드
    // 애니메이션이나 패닝처럼 값이 계속 변하는 구간도 이 정도면 따라간다.
    const timer = window.setInterval(read, 100);
    return () => {
      window.clearInterval(timer);
      (window as unknown as { scrollTo: unknown }).scrollTo = origScrollTo;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  if (!text || !host) return null;

  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  // 줄 수 × 줄높이(9.5px × 1.32) + padding. 보이는 영역 아래에 붙이되, 화면이 짧으면 위로 밀지 않는다.
  const panelH = text.split("\n").length * 12.6 + 12;
  const visibleH = vv ? vv.height : typeof window !== "undefined" ? window.innerHeight : 0;
  const panelTop = Math.max(2, Math.round(visibleH - panelH - 4));
  return createPortal(
    <pre
      style={{
        position: "fixed",
        // 🔴 2026-08-28 — 여기 `+ vv.offsetTop`이 있었고, **그것 때문에 정작 필요한 순간에
        // 패널이 안 보였다**("디버그 창도 저런거 안보임"). iOS WebKit은 `position: fixed`를
        // 이미 **시각 뷰포트** 기준으로 붙여준다(CLAUDE.md 3절 💀💀💀 행 / Vuetify PR #22923:
        // `IS_WEBKIT ? 0 : offsetTop`). 그래서 iOS가 화면을 밀면(`offsetTop > 0`) 이 값이
        // 패널을 그 양만큼 **더 아래로** 밀어 화면 밖·키보드 뒤로 보낸다 — 하필 밀림이 일어난
        // 순간, 즉 이 패널이 가장 필요한 순간에만 사라진다.
        // offsetTop 자체는 TOUCH 줄(vvTop=)에 숫자로 찍으므로 정보는 잃지 않는다.
        // (Blink에서는 반대로 패닝 중 패널이 따라 밀릴 수 있다. 진단용이라 감수한다.)
        // 🔴 2026-08-28 — 위(2px)에 두었더니 **메모 제목을 정확히 덮었다.** 실기기 스크린샷을
        // CSS 좌표로 환산하니 패널이 2..106px을 가리는데 제목이 t=53이었다. 화면에 안 보이던
        // 것은 "메모 상단"이 아니라 **패널이 가린 제목**이었고, 그 상태로 "상단이 안 뜬다"를
        // 진단하고 있었다. 진단 도구가 진단 대상을 가리면 안 된다.
        // 보이는 영역(vv.height) 아래쪽에 붙인다 — 키보드가 올라와도 그 위에 남는다.
        top: panelTop,
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
