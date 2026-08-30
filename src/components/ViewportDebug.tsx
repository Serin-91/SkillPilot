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
          // ⚠️ 여기에 `inset/base 이력`(useViewportHeight의 __spKbLog) 줄이 있었는데 패널을 줄일 때
          //    없앴고, 2026-08-30에 수집하는 쪽도 같이 지웠다. **지금 패널에 그 줄은 없다** —
          //    "R 표시를 읽어라" 같은 옛 지시를 만나면 그건 이 줄 얘기이고, 되살리려면
          //    useViewportHeight의 kbLog 수집과 여기 출력을 **둘 다** 되살려야 한다.
          // 본문이 갑자기 줄어 자동저장이 막힌 순간. 이 줄이 보이면 "글 내용이 날아간다"가
          // 재현된 것이고, 그때 서버 덮어쓰기는 막혔다는 뜻이다(Dashboard의 scheduleAutosave 가드).
          ...((window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink ?? []).map((s) => `🚨 ${s}`),
          `scrollY=${Math.round(window.scrollY)} bodyPos=${getComputedStyle(document.body).position}`,
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
    return () => window.clearInterval(timer);
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
