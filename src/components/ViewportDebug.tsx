"use client";

import { useEffect, useState } from "react";
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
// 🔴 패널은 화면 좌상단에 **그냥 못박는다**(top/left 2px). 예전엔 `+ vv.offsetTop`을 더했는데,
// 2026-08-28에 그것 때문에 **정작 필요한 순간에만 패널이 사라졌다.** iOS WebKit은
// `position: fixed`를 이미 시각 뷰포트 기준으로 붙여주므로(CLAUDE.md 3절 💀💀💀 행 /
// Vuetify PR #22923: `IS_WEBKIT ? 0 : offsetTop`), iOS가 화면을 밀면 그 값이 패널을 그만큼
// **더 아래로** 밀어 화면 밖으로 보낸다. offsetTop 자체는 패널 안에 `vvTop=`으로 찍히므로
// 정보는 잃지 않는다. (아래쪽에 붙여도 안 된다 — 스크롤이 도는 동안 iOS가 fixed를 문서와
// 같이 끌고 가서 맨 아래에서는 아예 안 보였다.)






// 🔴 "누가 문서를 굴리는가"를 **실기기에서** 잡는 계측.
//
// CLAUDE.md 3절이 "결정적이었던 계측 둘" 중 (b)로 지정한 것이다 — 되돌리는 범인이 이름 없이 잡힌다.
// 로컬에서는 이 흐름에 `scrollTo`가 `(0,0)` 한 번뿐인데(계측으로 확인), 실기기 판독은
// `scrollY == maxScroll`(= 더 큰 값이 clamp된 신호)이라 **로컬에 없는 호출이 실기기에만 있다.**
// 그 호출의 인자와 시점을 그대로 남긴다. 값이 대시보드 스크롤 위치(수백 px)로 찍히면 잠금
// cleanup 계열이고, 0만 찍히는데도 끝에 붙어 있으면 우리 호출이 아니라 브라우저가 굴린 것이다.
//
// ⚠️ 패치는 `?debug`일 때만 건다. 그리고 원본을 반드시 복원한다(cleanup) — 안 그러면 진단이
//    앱 동작을 바꾼다. 진단은 관찰만 해야 한다.
//
// 🔴🔴 2026-08-31 — **이 계측에 구멍이 있었고, 그 구멍이 6라운드를 만들었다.**
//
// 문서를 굴리는 경로는 셋이다: `window.scrollTo` / `Element.scrollIntoView` / `el.scrollTop = n`.
// 그런데 여기서 감싼 것은 **첫 번째 하나뿐**이었다. CLAUDE.md 3절이 "computed style에 안 나타나는
// 층이 둘"이라며 scrollTo와 **scrollIntoView를 나란히** 적어뒀는데, 계측은 앞의 것만 봤다.
//
// 그래서 실기기 판독 `scrollTo(0) 당시 y=0`을 아래 "우리 코드가 안 굴렸다" 문구대로 읽었고,
// 그 뒤 여섯 라운드가 전부 **이미 무죄가 증명된 채널(window.scrollTo) 주변**만 고쳤다.
// 그 판독이 실제로 말하는 것은 "window.scrollTo는 범인이 아니다"까지이고,
// **나머지 둘은 아직 아무도 안 봤다**는 뜻이다.
//
// 특히 ProseMirror(tiptap)는 캐럿을 노출할 때 window.scrollTo를 쓰지 않는다 —
// scrollRectIntoView가 스크롤 조상의 **scrollTop에 직접 값을 쓴다.** `.memo-edit-page`는
// 내부 스크롤러를 없애 **문서가 그 스크롤 조상**이므로, 그 한 줄이 화면 전체를 움직인다.
// 잔여 30px 같은 작은 값이 정확히 그 모양이다(scrollMargin.top = 툴바 실측 39~48px).
type ScrollCall = { kind: string; to: string; at: number; docSH: number; from: string };
const scrollCalls: ScrollCall[] = [];
// 호출자 위치를 파일:줄로만 짧게 — 실기기 화면에서 눈으로 읽고 받아적어야 한다.
function callerOf(): string {
  const stack = (new Error().stack ?? "").split("\n").slice(3, 6).join(" ");
  return (stack.match(/[\w.-]+\.js:\d+:\d+/g) ?? []).slice(0, 2).join(" ") || "?";
}
function recordScroll(kind: string, to: string): void {
  scrollCalls.push({
    kind,
    to,
    at: Math.round(window.scrollY),
    docSH: document.documentElement.scrollHeight,
    from: callerOf(),
  });
  if (scrollCalls.length > 8) scrollCalls.shift();
}
// 🔴🔴 2026-08-31 (11라운드) — **"누가 굴렸나"가 아니라 "어떻게 굴러갔나"를 잰다.**
//
// 위 scrollCalls는 **우리 코드의 호출**만 잡는다. 그런데 실기기 기록(Dashboard.tsx 2500절)은
// 우리 호출이 전부 no-op이었고 **브라우저가 굴렸다**고 적고 있다. 그러면 남은 후보가 둘인데
// 처방이 정반대라 반드시 갈라야 한다:
//
//   ① 대시보드 y의 clamp — 편집 페이지로 바뀌며 문서가 2953 → 792로 무너질 때, 브라우저가
//      들고 있던 위치가 새 max로 잘려 **한 번에** 꽂힌다. 처방: 문서를 접지 않는 구조(라우트 분리).
//   ② iOS 관성 스크롤 — 대시보드를 튕긴 손가락의 관성이 진입 **후에** 도착한다. 여러 번에 걸쳐
//      감쇠하며 들어온다. 처방: scrollTo로는 절대 못 막는다(관성은 취소가 안 된다).
//
// 가르는 법은 **scroll 이벤트의 개수와 시간 분포**다. 한 발이면 ①, 여러 발이 감쇠하면 ②.
// 그래서 호출이 아니라 **실제 이벤트**를 시각으로 기록한다.
type ScrollTick = { t: number; y: number; edit: boolean };
const scrollTicks: ScrollTick[] = [];
let firstEditTickAt = 0;
// 🔴🔴 2026-09-02 — **진입 잠금이 실기기에서 걸리기는 하는지**를 기록한다.
//    06d6715가 TODAY 경로를 먼슬리와 같은 상태 기계에 태웠고 **로컬에서는** 이 전이를 실측했다:
//        +6ms static top=auto y=1400 → +1177ms fixed top=-1400px y=0 → +1269ms static y=0
//    그런데 실기기에서는 증상이 남는다. 그러면 갈림길이 둘이고, 이 한 줄이 그것을 가른다:
//      (가) fixed가 관측된다 → 잠금은 걸렸는데 부족하다 = **먼슬리와 같은 경로인데도 깨진다**
//           → 경로가 원인이 아니다(새 사실). 다른 축을 찾아야 한다.
//      (나) fixed가 한 번도 안 잡힌다 → 2단계 effect가 도달 못 했다 → 그 경로부터 고친다.
//    판정 없이 값을 또 만지면 21라운드가 된다.
let lockSeen = false;
let lockTrail: string[] = [];
function recordBodyPos(): void {
  const b = getComputedStyle(document.body);
  const mark = b.position === "fixed" ? `fixed(top ${b.top})` : b.position;
  if (b.position === "fixed") lockSeen = true;
  if (lockTrail[lockTrail.length - 1] !== mark) {
    lockTrail.push(mark);
    if (lockTrail.length > 6) lockTrail.shift();
  }
  // 편집 페이지도 다이얼로그도 없으면 다음 진입을 위해 리셋한다(대시보드로 돌아온 상태).
  if (!document.querySelector(".memo-edit-page") && !document.querySelector("dialog[open]")) {
    lockSeen = false;
    lockTrail = [];
  }
}
function recordTick(): void {
  const edit = !!document.querySelector(".memo-edit-page");
  const now = Math.round(performance.now());
  if (edit && !firstEditTickAt) firstEditTickAt = now;
  if (!edit) firstEditTickAt = 0;
  scrollTicks.push({ t: now, y: Math.round(window.scrollY), edit });
  if (scrollTicks.length > 10) scrollTicks.shift();
  recordBodyPos();
}
// 요소를 화면에서 알아볼 수 있는 최소 이름.
function nameOf(el: Element): string {
  const cls = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 2).join(".");
  return el.tagName.toLowerCase() + (cls ? "." + cls : "");
}

export function ViewportDebug() {
  const [text, setText] = useState("");
  // showModal()로 연 <dialog>는 top layer에 그려진다 — z-index를 아무리 올려도 일반 흐름의
  // 요소는 그 아래 깔린다. 실제로 상세 화면에서 패널이 통째로 안 보였다.
  // 지금 열려 있는 dialog 안으로 포털해서 같은 층에 올린다.
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    // 🔴 **주소에 `?debug`가 있을 때만** 뜬다. 2026-08-28에 이걸 localStorage에 남겨두는
    // 버전을 잠깐 썼다 — 조사 중에는 쓸모가 있었지만(앱이 로고 클릭의 `router.push("/")`나
    // 로그인 리다이렉트로 자기 쿼리스트링을 날린다) 조사가 끝나자 **끄는 방법을 알아야만 꺼지는
    // 물건**이 됐다("그냥 url로 들어가도 뜨네"). 진단 도구는 켜는 것보다 꺼지는 게 쉬워야 한다.
    // 저장값이 남아 있어도 여기서 읽지 않으므로 저절로 무해해진다.
    // 조사 중 쿼리스트링이 자꾸 날아가면, 되살릴 것은 이 저장이 아니라 그 라운드에서 쓸
    // 임시 브랜치다.
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const vv = window.visualViewport;

    // 실제 scroll 이벤트를 시각과 함께 기록한다(위 scrollTicks 주석 — ①clamp / ②관성을 가른다).
    // passive: 이 리스너가 스크롤을 막지 않는다는 것을 브라우저에 알려 진단이 증상을 바꾸지 않게 한다.
    window.addEventListener("scroll", recordTick, { passive: true });
    // 잠금은 클릭과 첫 scroll 사이에 걸렸다 풀릴 수 있어 클릭에서도 한 번 샘플링한다.
    document.addEventListener("click", recordBodyPos, true);

    // window.scrollTo를 감싸 호출을 기록한다(위 주석). 원본은 cleanup에서 되돌린다.
    const origScrollTo = window.scrollTo.bind(window);
    (window as unknown as { scrollTo: typeof window.scrollTo }).scrollTo = ((...args: unknown[]) => {
      const to = args.length === 1 && typeof args[0] === "object"
        ? String((args[0] as ScrollToOptions | null)?.top ?? "?")
        : String(args[1] ?? "?");
      recordScroll("scrollTo", to);
      return (origScrollTo as (...a: unknown[]) => void)(...args);
    }) as typeof window.scrollTo;

    // 🔴 나머지 두 채널. 위 주석이 말하는 구멍을 여기서 막는다.
    const origSIV = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      recordScroll("scrollIntoView", nameOf(this));
      return (origSIV as (...a: unknown[]) => void).apply(this, args);
    } as typeof Element.prototype.scrollIntoView;

    // `el.scrollTop = n` — ProseMirror의 캐럿 노출이 쓰는 경로다(위 주석).
    // 0에 0을 다시 쓰는 것(초기화 루틴)은 화면을 안 움직이므로 기록하지 않는다 — 그것까지 남기면
    // 링버퍼 8칸이 노이즈로 다 찬다.
    const topDesc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    if (topDesc?.set && topDesc.get) {
      const setTop = topDesc.set;
      const getTop = topDesc.get;
      Object.defineProperty(Element.prototype, "scrollTop", {
        ...topDesc,
        set(this: Element, v: number) {
          if (v !== 0 || getTop.call(this) !== 0) recordScroll("scrollTop=" + Math.round(v), nameOf(this));
          return setTop.call(this, v);
        },
      });
    }

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

      setText(
        [
          // 🔴🔴🔴 2026-09-03 — **"키보드 위 밝은 경계선" 판정 두 줄을 맨 위로.**
          //    사용자 신고: "디버그창에 이전것들 뭐가 너무 많아서 visualViewport.height가 안보임".
          //    §25-8 규칙 3("판정은 맨 위에 둔다")을 만들어놓고 또 같은 실패를 냈다 —
          //    그 규칙을 지킨 것은 진입스크롤 한 줄뿐이고, 이번에 필요한 값은 아래 281·282줄에
          //    묻혀 있었다. 필요한 값만 **맨 위 두 줄**로 뽑는다(아래 상세는 그대로 둔다).
          //
          //    이 두 줄이 답해야 하는 질문: **그 선이 우리가 그릴 수 있는 밴드 안인가.**
          //    보이는 밴드는 레이아웃 좌표로 `vvTop .. vvTop+vvH`다(§15-2 기준).
          //    · `차` = 메모지 밑변 − 밴드끝. 양수면 메모지가 밴드보다 아래까지 있다(= 밴드 끝은
          //      메모지 중간이고, 거기엔 이음매가 없어야 한다)
          //    · `페이드` = 아랫변 80px 페이드(`::after`)의 위쪽 y. `밴드안=Y`면 그 페이드가
          //      밴드 안으로 들어온다 = **그게 밝은 선의 정체다**(어두운 메모지를 캔버스색으로 올린다)
          ...(() => {
            const vvT = vv ? Math.round(vv.offsetTop) : 0;
            const vvH = vv ? Math.round(vv.height) : window.innerHeight;
            const bandEnd = vvT + vvH;
            const paper = document.querySelector<HTMLElement>(".memo-edit-page.big-postit");
            if (!paper) return [`🔷 선판정: 편집 페이지 없음  innerH=${window.innerHeight} vvH=${vvH} vvTop=${vvT}`];
            const pb = Math.round(paper.getBoundingClientRect().bottom);
            const fadeTop = pb - 80;
            return [
              `🔴 선판정 innerH=${window.innerHeight} vvH=${vvH} vvTop=${vvT} app-vh=${cs.getPropertyValue("--app-vh").trim() || "?"} kb=${cs.getPropertyValue("--kb-inset").trim() || "?"}`,
              `   밴드끝=${bandEnd} 메모지밑변=${pb} 차=${pb - bandEnd} 페이드위=${fadeTop} 페이드밴드안=${fadeTop < bandEnd ? "🚨Y" : "N"}`,
            ];
          })(),
          // 🔴🔴 2026-09-02 — **진입 스크롤 판정을 맨 위로 끌어올린다.**
          //    이 판정은 원래 패널 한참 아래(434줄 근처)에 있었는데, 패널이 `top: 40%`에서 아래로
          //    길어지고 `pointerEvents: none`이라 **스크롤할 수 없어** 화면 밖으로 나간다.
          //    사용자 신고 그대로다: "진입스크롤기전은 디버그창이 너무 밑에 있어서 안보임".
          //    16라운드 동안 이 한 줄을 못 읽어서 CSS로만 돌려막았다 — 판정을 맨 위로 올린다.
          //    ⚠️ 아래 상세 블록은 그대로 둔다(지우면 근거가 사라진다). 여기는 **요약 한 줄**이다.
          ...(() => {
            const edit = scrollTicks.filter((s) => s.edit);
            if (!edit.length) return ["🔵 진입스크롤: 편집 페이지 scroll 이벤트 0건"];
            const moved = edit.filter((s) => s.y > 0);
            if (!moved.length) return ["🟢 진입스크롤: 문서가 한 번도 안 움직였다(y=0) — 정상"];
            const span = moved[moved.length - 1].t - moved[0].t;
            const head = `🔴 진입스크롤: +${moved[0].t - firstEditTickAt}ms y=${moved[0].y}` +
              (moved.length > 1 ? ` … ${moved.length}발/${span}ms` : " (한 발)");
            return [
              head,
              moved.length === 1
                ? "   → 한 발 = 앵커링/clamp. overflow-anchor:none이 이미 걸려 있는데도 나면 앵커링 아님"
                : span > 120
                  ? "   → 여러 발 = iOS 관성. scrollTo로 못 막는다"
                  : "   → 짧은 간격 다발 — 이 두 줄을 그대로 보고해라",
              `   진입잠금(06d6715): ${lockSeen ? "✅ 걸렸다" : "🔴 한 번도 안 걸렸다"}  ${lockTrail.join(" → ") || "(기록 없음)"}`,
              lockSeen
                ? "   → 걸렸는데도 밀린다 = 먼슬리와 같은 경로인데 깨진다. **경로가 원인이 아니다**"
                : "   → 안 걸렸다 = 2단계 effect가 도달 못 했다. 그 경로부터 봐라",
            ];
          })(),
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
          // vvTop이 0이 아니면 iOS가 화면을 밀고 있다 = 우리 --kb-inset 패딩과 **이중 보정**이다.
          // 그 화면이 "여백이 절반까지 차올라 글이 가려진다"로 보인다(useViewportHeight의 되돌리기 참고).
          `vvTop=${vv ? Math.round(vv.offsetTop) : "-"}${vv && vv.offsetTop > 0 ? "  ← 🚨 밀림(레이아웃 뷰포트가 키보드 밑으로)" : ""}`,
          `innerH=${window.innerHeight} vvH=${vv ? Math.round(vv.height) : "-"} innerW=${window.innerWidth} vvW=${vv ? Math.round(vv.width) : "-"}`,
          `KB-INSET=${cs.getPropertyValue("--kb-inset").trim() || "unset"}  app-vh=${cs.getPropertyValue("--app-vh").trim() || "unset"}`,
          // 🔴 2026-08-31 — "수정 중 키보드 위에 하얀 경계선"을 가르는 세 값.
          //    로컬에서는 전체 요소·양쪽 edge를 훑어도 그 밴드에 밝은 선을 그리는 우리 요소가
          //    **0건**이었다(다크 + c6 메모). 그러면 남는 것은 `vv.height`와 키보드 사이 =
          //    **브라우저 자기 표면**이고, 그 명암은 루트의 `color-scheme`이 정한다(11-20절).
          //    다크 메모지 + `color-scheme: light`이면 밝은 띠가 뜬다 — 검은칸의 부호만 뒤집은
          //    같은 버그이고, CLAUDE.md 지뢰표가 이미 예고해둔 자리다.
          //    읽는 법: canvas가 어두운데 cs=light이면 **그게 원인이다**(파생이 어긋난 것).
          //            셋이 다 어두우면 우리 쪽이 아니다 — 네이티브 경계로 넘어가라.
          `cs=${getComputedStyle(document.documentElement).colorScheme}  canvas=${cs.getPropertyValue("--memo-canvas").trim() || "unset"}  theme-color=${document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? "none"}`,
          // ⚠️ 여기에 `inset/base 이력`(useViewportHeight의 __spKbLog) 줄이 있었는데 패널을 줄일 때
          //    없앴고, 2026-08-30에 수집하는 쪽도 같이 지웠다. **지금 패널에 그 줄은 없다** —
          //    "R 표시를 읽어라" 같은 옛 지시를 만나면 그건 이 줄 얘기이고, 되살리려면
          //    useViewportHeight의 kbLog 수집과 여기 출력을 **둘 다** 되살려야 한다.
          // 본문이 갑자기 줄어 자동저장이 막힌 순간. 이 줄이 보이면 "글 내용이 날아간다"가
          // 재현된 것이고, 그때 서버 덮어쓰기는 막혔다는 뜻이다(Dashboard의 scheduleAutosave 가드).
          ...((window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink ?? []).map((s) => `🚨 ${s}`),
          `scrollY=${Math.round(window.scrollY)} bodyPos=${getComputedStyle(document.body).position}`,
          // 🔴🔴 2026-09-01 — **"뒤로가기랑 제목 위치가 다르다"를 가르는 한 줄.**
          //
          // 13라운드째인데 로컬에서는 **한 번도 재현되지 않았다**(로컬은 세 메모 전부 제목행 top=53).
          // 이유는 두 요소가 **다른 좌표계**에 있고, 그 둘이 갈라지는 조건이 로컬에 없다는 것이다:
          //   · `‹`(.close-btn) / `↶↷★⋮`(.mobile-postit-head-actions) = `position: fixed`
          //     + `top: calc(2~3px + env(safe-area-inset-top) + var(--vv-push))`  (10199절)
          //   · 제목행(.big-title-row) = **문서 흐름**. `--vv-push`도 `env()`도 안 받는다.
          // 로컬에서는 `--vv-push`와 `env(safe-area-inset-top)`이 **둘 다 항상 0**이라 차이가 0이다.
          // 실기기에서 어느 한쪽이라도 0이 아니면 **뒤로가기만 움직이고 제목은 제자리**가 된다.
          //
          // 🔴 그리고 저장소 주석이 서로 모순이라 방향을 추측할 수 없다:
          //   ViewportDebug 16절: "iOS WebKit은 fixed를 **시각** 뷰포트 기준으로 붙여준다"
          //   dashboard.css 10191절: "즉 fixed는 **레이아웃** 뷰포트에 붙는다"
          // 둘 중 어느 쪽이냐에 따라 처방이 정반대다(제목에 push를 더해야 하나 / 버튼에서 빼야 하나).
          // **값을 만지기 전에 이 줄을 읽어라.**
          //
          // 읽는 법 — 문제가 보이는 그 화면에서(진입 직후, 손대지 말고) 읽는다:
          //   `차이=39`  → 정상. (제목행 top 53 − 뒤로가기 top 2 − 헤더높이 12 기준선. 로컬 기준값)
          //   `차이`가 정상값보다 **크다** → 제목이 더 내려갔다 / **작다** → 제목이 더 올라갔다.
          //   같은 줄의 `vvTop`·`push`·`safeTop`·`sy` 중 **0이 아닌 것이 원인**이다:
          //     · `push`≠0 이면 버튼만 그만큼 내려가 있다 → 제목에도 같은 보정을 주는 방향
          //     · `safeTop`≠0 이면 viewport-fit=cover가 켜진 것이다(지금은 꺼져 있어야 한다)
          //     · `sy`≠0 이면 문서가 굴러 있다 → 23-2의 진입 잠금이 안 듣는 것이다
          //     · 셋 다 0인데 `차이`가 다르면 **fixed가 시각 뷰포트에 붙는 것이 확정**이다
          //       (그때는 innerH와 vvH를 같이 봐라 — 둘이 다르면 그 차이가 곧 어긋남이다)
          ...(() => {
            const paper = document.querySelector<HTMLElement>(".memo-edit-page.big-postit");
            if (!paper) return [];
            const t = paper.querySelector(".big-title-row")?.getBoundingClientRect().top;
            const b = paper.querySelector<HTMLElement>(".close-btn")?.getBoundingClientRect().top;
            const hd = paper.querySelector<HTMLElement>(".mobile-postit-head-actions")?.getBoundingClientRect().top;
            const pushRaw = cs.getPropertyValue("--vv-push").trim() || "unset";
            // env(safe-area-inset-top)을 직접 읽을 수는 없어서 임시 프로브로 확정한다(즉시 제거).
            const probe = document.createElement("div");
            probe.style.cssText = "position:absolute;visibility:hidden;height:env(safe-area-inset-top)";
            paper.appendChild(probe);
            const safeTop = Math.round(probe.getBoundingClientRect().height);
            probe.remove();
            return [
              `21절 헤더정렬: 제목t=${t !== undefined ? Math.round(t) : "-"} 뒤로가기t=${b !== undefined ? Math.round(b) : "-"} 버튼줄t=${hd !== undefined ? Math.round(hd) : "-"}`,
              `   차이=${t !== undefined && b !== undefined ? Math.round(t - b) : "-"} (로컬 정상 51)  push=${pushRaw} safeTop=${safeTop} sy=${Math.round(window.scrollY)}`,
            ];
          })(),
          `focus=${active ? active.tagName + "." + (active.className || "").toString().split(" ")[0] : "none"}`,
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
          // ⚠️ 🔴 검은칸 판정(`띠=` / `← iOS가 N px 더 굴림`) 두 줄도 **지금 패널에 없다.**
          //    HANDOFF 13-2가 "?debug=vp를 붙이고 그 두 줄을 읽어라"고 지시하는데 화면에 안 나온다 —
          //    패널을 45줄→19줄로 줄일 때(15-1) 같이 빠졌다. 검은칸은 11-18·11-20~22의 3겹 처방으로
          //    닫힌 건이라 그대로 두지만, 다시 재야 하면 공식은 이것이다(그때 여기에 줄을 되살려라):
          //      띠      = vv.height − 메모지 아랫변(시각 좌표)          ← 0 이하면 정상
          //      가상영역 = maxScroll − (scrollHeight − innerHeight)     ← 0보다 크면 iOS가 늘린 것
          //    구조상 이 화면은 `문서 == .sp-body == 메모지` 한 덩어리에 스크롤러가 문서 하나뿐이라,
          //    뒷배경이 보일 수 있는 경우는 메모지 아랫변이 보이는 밴드 안으로 들어올 때뿐이다.
          // 🔴🔴 2026-08-29 — **sticky가 실기기에서 살아 있나.** 로컬(375×684, 키보드 주입 포함)에서는
          // 서식툴바도 삽입 바도 스크롤 내내 top:0을 유지한다(y=200/600/1200/2210 전부 확인).
          // 그런데 신고는 "밑으로 스크롤하면 따라오지 않는다"로 남아 있다 = 로컬에서 재현이 안 된다.
          // 추측을 쌓지 말고 **실기기가 직접 말하게** 한다. 읽는 법:
          //   pos가 sticky가 아니다           → CSS가 지고 있다(특이도/미디어쿼리). 그걸 고치면 된다.
          //   pos=sticky인데 top이 계속 커진다 → sticky 자체가 안 먹는다(조상 overflow/컨테이닝 블록)
          //   pos=sticky, top이 0쯤인데 안 보인다 → **레이아웃 뷰포트가 키보드 밑으로 밀린 것**이다.
          //     그때는 vvTop>0이 같이 뜬다. 이건 CSS로 못 고치고 구조로 풀어야 한다.
          // **메모를 수정 상태로 만들고 아래로 스크롤한 뒤** 이 줄을 읽어라.
          // (2026-08-30 제거: `__spComposeEntry` — "Dashboard의 rAF가 채운다"고 적혀 있었지만
          //  그 rAF 보정은 Create를 일반 노드로 통일할 때(15-1) 같이 사라졌다. 파일 전체에서
          //  이 값을 **쓰는 코드가 없어** 영원히 안 뜨는 줄이었다.)
          // 🔴🔴🔴 2026-08-29 3회차. **앞의 두 판정은 내가 vvTop을 안 빼서 틀렸다.**
          //
          // 실기기 회신: `툴바 top=251 / vvTop=251 / vvH=338 / scrollY=815 / docTop=-815`.
          //   docTop == -scrollY 이므로 `getBoundingClientRect()`는 **레이아웃 뷰포트 기준**이다.
          //   그런데 **보이는 밴드는 레이아웃 좌표로 `vvTop .. vvTop+vvH`(251..589)** 다.
          //   그래서 요소가 실제로 보이는지는 `rect.top`이 아니라 **`rect.top - vvTop`**이 답한다.
          //   251 - 251 = 0 → 툴바는 **보이는 화면 맨 위에 정확히 붙어 있었다.**
          // 💀 나는 `rect.top`을 0과 비교해서 "아직 자연 위치"라고 찍었다. 기준이 틀린 판정은
          //    값이 맞아도 결론이 틀린다 — 이 프로젝트가 반복해서 밟은 그 함정이다.
          //
          // 그리고 `vvTop > 0` 자체가 **"화면 위쪽 vvTop만큼이 안 보인다"**는 뜻이라,
          // 레이아웃 좌표 0..vvTop에 있는 것(= Create의 뒤로가기 줄, y 20..63)은 통째로 가려진다.
          // Create 신고("진입 시 뒤로가기 줄이 안 뜨고 제목부터 뜸")와 같은 원인일 수 있다 —
          // rAF 보정이 한 번도 안 걸린 것(🔧 줄이 안 뜸)이 "스크롤이 아니다"를 이미 말해줬다.
          `-- 🔴 보이는 밴드 안에 있나 (수정 중 아래로 스크롤해서 읽어라) --`,
          ...(() => {
            const rows: string[] = [];
            const vvTop = vv ? Math.round(vv.offsetTop) : 0;
            const visH = vv ? Math.round(vv.height) : window.innerHeight;
            // 🔴 fixed가 레이아웃 기준인지 시각 기준인지 **직접 잰다.** 이걸 몰라서 2주를 태운 적이
            //    있다(--vv-push). 1px짜리 fixed 프로브를 top:0에 두고 rect를 읽으면 끝난다:
            //      rect.top ≈ 0      → fixed는 **레이아웃** 기준 (vvTop만큼 위로 잘려 안 보인다)
            //      rect.top ≈ vvTop  → fixed는 **시각** 기준 (WebKit이 이미 보이는 자리에 붙여준다)
            const probe = document.createElement("div");
            probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;pointer-events:none;opacity:0";
            document.body.appendChild(probe);
            const fixedTop = Math.round(probe.getBoundingClientRect().top);
            probe.remove();

            const targets: [string, string][] = [
              ["툴바", ".memo-edit-page .mobile-rich-toolbar, .compose-page .mobile-rich-toolbar"],
              ["삽입바", ".memo-edit-page .insert-bar, .compose-page .insert-bar"],
              ["뒤로가기", ".memo-edit-page .close-btn, .compose-page .close-btn"],
            ];
            for (const [label, sel] of targets) {
              const el = document.querySelector<HTMLElement>(sel);
              if (!el) { rows.push(label + ": 없음"); continue; }
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              // 🔴 **vvTop을 빼지 마라.** 실측(fixed 프로브 rect == -vvTop, docTop == -scrollY)이
              //    `getBoundingClientRect()`가 **이미 시각 뷰포트 기준**임을 증명했다 —
              //    보이는 밴드는 그대로 `0..vvH`다. 지난 판에 여기서 vvTop을 한 번 더 빼서
              //    좌표를 두 번 옮겼고, 그 틀린 수치로 "툴바는 잘 붙어 있다"는 반대 결론을 냈다.
              const vTop = Math.round(r.top);
              const vBot = Math.round(r.bottom);
              const seen = vBot > 0 && vTop < visH;
              rows.push(
                label + ": " + cs.position + " 보이는좌표 " + vTop + ".." + vBot +
                  (seen ? "  ✅ 보인다" : vBot <= 0 ? "  ← 🚨 위로 잘림(안 보임)" : "  ← 🚨 아래로 벗어남"),
              );
            }
            const docTop = Math.round(document.documentElement.getBoundingClientRect().top);
            rows.push("scrollY=" + Math.round(window.scrollY) + " docTop=" + docTop + " vvTop=" + vvTop + " vvH=" + visH);
            // 🔴 이 줄이 "진입 스크롤이 새고 있다"와 "맨 위인데도 바가 잘린다"를 **가른다**.
            // 두 원인은 증상이 똑같이 "상단이 짤림"으로 보이는데 처방이 정반대다:
            //   · 맨 끝 clamp  → 진입 시 누가 굴리고 있다. 처방은 "애초에 굴리지 않는다"(1846절)
            //   · 맨 위(0)인데 짤림 → 스크롤 문제가 아니다. ‹/⋮가 position:absolute이고
            //     2026-08-30 --vv-push 처방(9930/9933절)에서 **의도적으로 빠져 있다**(commit 89c8054)
            // 짧은 메모일수록 maxScroll이 작아 "상단만 조금" 잘려 보인다 — AI트렌드 저장 블록이
            // 셋 중 가장 짧다(출처 문단이 없다). 그래서 그 메모에서만 신고가 나올 수 있다.
            {
              const sh = document.documentElement.scrollHeight;
              const maxScroll = Math.max(0, sh - window.innerHeight);
              const sy = Math.round(window.scrollY);
              rows.push(
                "🔴 상단짤림 판정: scrollY=" + sy + " / maxScroll=" + maxScroll + " (docSH=" + sh + " innerH=" + window.innerHeight + ")" +
                  (sy <= 2
                    ? "  ✅ 맨 위 — 스크롤 문제 아님. ‹/⋮ 위치를 봐라"
                    : maxScroll > 0 && sy >= maxScroll - 2
                      ? "  ← 🚨 맨 끝에 clamp됨. 진입 스크롤이 새고 있다"
                      : "  ← 🚨 중간에 멈춤. 누가 굴린 뒤 되돌리지 못했다"),
              );
            }
            const push = getComputedStyle(document.documentElement).getPropertyValue("--vv-push").trim();
            rows.push(
              "fixed(top:0) rect=" + fixedTop + "  --vv-push=" + (push || "unset") +
                (vvTop <= 2
                  ? "  (안 밀림 — 판정 보류)"
                  : Math.abs(fixedTop + vvTop) <= 3
                    ? "  → 🚨 fixed/sticky는 레이아웃 기준(vvTop만큼 위로 잘림)"
                    : Math.abs(fixedTop) <= 3
                      ? "  → fixed는 시각 기준(보정 불필요)"
                      : "  → ⁉️ 예상 밖 — 이 줄을 그대로 보고해라"),
            );
            return rows;
          })(),
          `-- 누가 문서를 굴렸나 — scrollTo / scrollIntoView / scrollTop (최근 8건, 최신이 아래) --`,
          ...(scrollCalls.length
            ? scrollCalls.map((c) => `  ${c.kind}(${c.to})  당시 y=${c.at} docSH=${c.docSH}  ${c.from}`)
            // ⚠️ 이제 세 채널을 전부 본다. 그래도 비어 있을 때만 "브라우저가 굴렸다"로 읽어라 —
            //    예전에는 scrollTo 하나만 보면서 이 결론을 냈고, 그게 6라운드짜리 오독이었다.
            : ["  (호출 없음 — scrollTo/scrollIntoView/scrollTop 셋 다 없다. 그럼 브라우저가 굴린 것이다)"]),
          // 🔴 위 목록이 비어 "브라우저가 굴렸다"로 나왔을 때, **어느 브라우저 동작인지**를 여기서 가른다.
          `-- 🔴 진입 스크롤 기전 (편집 페이지에서 굴러간 실제 scroll 이벤트) --`,
          ...(() => {
            const edit = scrollTicks.filter((s) => s.edit);
            if (!edit.length) return ["  (편집 페이지에서 scroll 이벤트 0건)"];
            // 🔴🔴 **y가 실제로 움직인 것만 센다.** 이벤트 개수만 세면 안 움직였는데도 판정이 나온다 —
            // 로컬 검증에서 정확히 그랬다(y=0인 이벤트 3발에 "관성 스크롤" 판정). 이 프로젝트가
            // 반복해서 당한 거짓 양성이고, **틀린 판정은 판정이 없는 것보다 나쁘다.**
            const moved = edit.filter((s) => s.y > 0);
            const rows = edit.map((s) => `  +${s.t - firstEditTickAt}ms  y=${s.y}`);
            if (!moved.length) return [...rows, "  → ✅ 문서가 한 번도 안 움직였다(y=0) — 진입 스크롤 없음"];
            const span = moved[moved.length - 1].t - moved[0].t;
            return [
              ...rows,
              moved.length === 1
                ? `  → ① 한 발에 y=${moved[0].y}로 꽂힘 = 대시보드 y의 clamp. 문서를 접는 구조가 원인이다`
                : span > 120
                  ? `  → ② ${moved.length}발이 ${span}ms에 걸쳐 들어옴 = iOS 관성 스크롤. scrollTo로는 못 막는다`
                  : `  → ⁉️ ${moved.length}발이 ${span}ms에 몰림 — 이 블록을 그대로 보고해라`,
            ];
          })(),
          `-- 굴릴 수 없는 스크롤러 (비어 있어야 정상) --`,
          ...(phantoms.length ? phantoms.slice(0, 8) : ["(none)"]),
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
      window.removeEventListener("scroll", recordTick);
      document.removeEventListener("click", recordBodyPos, true);
      // 🔴 반드시 되돌린다 — 진단이 앱 동작을 바꾸면 그건 진단이 아니다.
      (window as unknown as { scrollTo: typeof window.scrollTo }).scrollTo = origScrollTo;
      Element.prototype.scrollIntoView = origSIV;
      if (topDesc) Object.defineProperty(Element.prototype, "scrollTop", topDesc);
    };
  }, []);

  if (!text || !host) return null;

  return createPortal(
    <pre
      style={{
        position: "fixed",
        // 🔴 상단이 아니라 **화면 중간**이다(2026-08-29 사용자: "디버그창이 너무 위에 있어서
        //    스크롤을 충분히 해서 볼 수가 없었다"). 지금 관찰 대상이 바로 그 자리에 붙는
        //    sticky 툴바·삽입바라, 패널이 위에 있으면 **재려는 것을 패널이 덮는다.**
        //    아래도 안 된다 — 스크롤 도중 iOS가 fixed를 문서와 같이 끌고 가서 맨 아래에서는 안 보였다.
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
