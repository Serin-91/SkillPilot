// 모바일 편집창 레이아웃 **불변식**.
//
// 왜 있나: 이 프로젝트엔 자동 검사가 11개(memo/weather/jobs/ai...) 있는데 **레이아웃만 0개**였다.
// 그래서 검증 경로가 "사용자가 폰으로 확인해서 알려준다" 하나뿐이었고, 왕복 한 번에 몇 시간이
// 걸리는 동안 나는 추측했다. 같은 증상을 10라운드 넘게 고친 이유가 기술이 아니라 **이것**이다.
//
// 여기 적힌 다섯 줄은 전부 실제로 터져서 알게 된 것이고, 하나라도 깨지면 사용자 화면에서
// "스크롤 잠김" / "여백이 차올라 글이 가려짐" / "캐럿이 사라짐" 중 하나로 나타난다.
//
// 구조: 판정(judge)은 **숫자만 받는 순수 함수**라 노드에서 테스트된다. DOM 읽기(measure)는 얇게
// 분리해서 브라우저에서만 돈다. 그래야 판정 자체가 틀리는 일을 검사로 막을 수 있다.

export type Invariant = { name: string; ok: boolean; detail: string };

export type Measured = {
  /** 열린 다이얼로그 안에서 실제로 굴릴 수 있는 스크롤러 수. 항상 1이어야 한다. */
  liveScrollers: number;
  /** overflow가 auto인데 넘칠 내용이 없는 "유령 스크롤러". iOS는 여기서 터치를 멈춘다. */
  deadScrollers: number;
  /** 본문 위를 덮는 것(sticky 툴바 + absolute 패널)이 스크롤러 상단에서 차지하는 높이. */
  coveredTop: number;
  /** 캐럿 노출 시 위로 비우는 값(ProseMirror scrollMargin.top). */
  scrollMarginTop: number;
  /** 키보드가 가린 높이(--kb-inset). 0이면 키보드가 없거나 보정이 죽은 것이다. */
  kbInset: number;
  /** 편집 껍데기의 실제 padding-bottom. kbInset을 먹고 있어야 한다. */
  shellPadBottom: number;
  /** 스크롤러 아랫변 y. */
  scrollerBottom: number;
  /** 보이는 화면의 아랫변 = 키보드 상단(vv.height). */
  visibleBottom: number;
  /** iOS가 화면을 민 양. 0이 아니면 우리 padding과 이중 보정이다. */
  vvOffsetTop: number;
  /** 편집 껍데기의 시각 좌표 top. 밀기가 상쇄됐는지는 **이 값**이 말한다(0이어야 한다). */
  shellTop: number;
  /** 편집 스크롤러에 남은 스크롤 여유(scrollHeight - clientHeight). 키보드가 올라오기 전에
   *  이 값이 0이면 iOS가 문서 스크롤로 승격해 화면을 민다(WebKit #191204). */
  scrollerSlack: number;
  /** 🔴 이 화면은 **문서가 스크롤러**인가(.memo-edit-page 계열: 모바일 메모 수정 / 먼슬리 Create /
   *  메모로 저장). 그 구조에서는 요소 스크롤러가 **0개인 것이 정상**이고 여유도 문서에서 나온다.
   *  없으면(옛 구조) undefined로 두면 되고, 그때 판정은 예전과 완전히 같다. */
  documentScroller?: boolean;
  /** 문서 스크롤러일 때의 남은 여유(scrollHeight - innerHeight). documentScroller일 때만 쓴다. */
  docSlack?: number;
  /** 🔴 문서 스크롤러일 때, 문서 높이를 **정당하게** 만드는 유일한 것 = 편집 페이지 자신의 높이.
   *  이 값보다 문서가 크면 그 차이는 **아무 내용도 없는 슬랙**이고, 진입 스크롤이 그 안으로
   *  clamp되어 맨 위 줄이 화면 밖으로 나간다(2026-08-31, 11라운드). documentScroller일 때만 쓴다. */
  docContentH?: number;
  /** 문서 스크롤이 겨루는 실제 레이아웃 뷰포트 높이(window.innerHeight).
   *  visibleBottom(--app-vh)과 구분한다 — 로컬 키보드 시뮬레이션에서 둘이 어긋난다. */
  docInnerH?: number;
};

/** 스크롤러 아랫변과 키보드 상단이 이만큼까지 어긋나는 건 봐준다(반올림·경계 여유). */
export const SCROLLER_BOTTOM_TOLERANCE = 4;

export function judge(m: Measured): Invariant[] {
  const out: Invariant[] = [];

  // ① 조상 체인에 굴릴 수 있는 스크롤러가 둘이면 손가락이 엉뚱한 것을 굴린다.
  // 🔴 문서가 스크롤러인 화면(.memo-edit-page)에서는 **요소 스크롤러가 0개인 것이 정상**이다.
  //    구조를 옮긴 뒤에도 이 불변식이 옛 기준으로 남아 있어서, 정작 제일 많이 쓰는 화면에서
  //    상시 빨간불이 떴다(2026-08-29 사용자 지적: "디버그값 너무 길어서 보기 힘들다").
  //    거짓 실패가 상시로 뜨는 검사는 아무도 안 본다 — 그러면 검사가 없는 것만 못하다.
  out.push({
    name: "스크롤러 1개",
    ok: m.documentScroller ? m.liveScrollers === 0 : m.liveScrollers === 1,
    detail: m.documentScroller ? `${m.liveScrollers}개(문서가 스크롤러)` : `${m.liveScrollers}개`,
  });

  // ② 유령 스크롤러(auto인데 못 굴림) — iOS가 여기서 터치를 삼킨다.
  out.push({
    name: "유령 스크롤러 0개",
    ok: m.deadScrollers === 0,
    detail: `${m.deadScrollers}개`,
  });

  // ③ 덮는 높이 > scrollMargin.top 이면 캐럿이 툴바/패널 뒤에 놓인다. 그러면 스크롤러로는
  //    꺼낼 수 없어서 iOS가 화면 전체를 밀고, 그게 "여백이 차올라 글이 가려짐"이 된다.
  out.push({
    name: "덮는 높이 ≤ scrollMargin.top",
    // 🔴 문서가 스크롤러인 화면에서는 **검사 대상이 아니다.** 이 불변식은 우리가 캐럿을
    //    `scrollIntoView`로 직접 노출할 때 "패널 뒤에 캐럿을 놓지 마라"는 뜻인데,
    //    .memo-edit-page 계열에서는 그 호출을 **가드로 꺼놨고**(iOS가 직접 한다) 기준이 되는
    //    스크롤러 top도 스크롤한 만큼 음수라 수치 자체가 의미를 잃는다(실측: 덮음 703).
    ok: m.documentScroller ? true : m.coveredTop <= m.scrollMarginTop,
    detail: m.documentScroller ? "검사 안 함(문서 스크롤러)" : `덮음 ${m.coveredTop} / 마진 ${m.scrollMarginTop}`,
  });

  // ④ 키보드가 올라왔으면 껍데기가 그만큼을 padding으로 비워야 한다. 안 그러면 편집창이
  //    키보드 뒤까지 늘어나고 긴 글의 끝을 영영 못 잡는다.
  out.push({
    name: "껍데기가 --kb-inset을 먹는다",
    ok: m.kbInset === 0 || m.shellPadBottom >= m.kbInset,
    detail: m.kbInset === 0 ? "키보드 없음" : `pad ${m.shellPadBottom} / inset ${m.kbInset}`,
  });

  // ⑤ 스크롤러 아랫변은 키보드 상단과 맞아야 한다. 위면 죽은 여백, 아래면 글이 키보드 뒤로 숨는다.
  out.push({
    name: "스크롤러 아랫변 == 키보드 상단",
    ok: m.kbInset === 0 || Math.abs(m.scrollerBottom - m.visibleBottom) <= SCROLLER_BOTTOM_TOLERANCE,
    detail: m.kbInset === 0 ? "키보드 없음" : `${m.scrollerBottom} vs ${m.visibleBottom}`,
  });

  // ⑥ iOS의 화면 밀기. **vvTop이 0인지가 아니라 껍데기가 제자리인지**를 본다 —
  //    되돌리기(scrollTo)는 배경 스크롤 잠금(body{position:fixed}) 때문에 원리적으로 불가능해서,
  //    지금은 --vv-push로 같은 양만큼 아래로 밀어 **상쇄**한다. 상쇄가 먹으면 vvTop은 45로
  //    남아도 껍데기 top은 0이고 화면은 정상이다. 그러니 판정 기준은 결과(shellTop)여야 한다 —
  //    vvTop만 보면 제대로 고쳐도 계속 실패로 뜨고, 그러면 검사를 안 믿게 된다.
  out.push({
    name: "iOS 밀기가 상쇄됨",
    // 🔴 문서가 스크롤러면 껍데기 == 문서라, 아래로 굴린 만큼 top이 음수인 게 **정상**이다
    //    (실측: scrollY 800일 때 껍데기 top -800). 옛 구조(fixed 껍데기)에서만 0이어야 한다.
    //    밀기 자체는 vvTop으로 따로 보므로 여기서 중복해서 볼 필요가 없다.
    ok: m.documentScroller ? true : Math.abs(m.shellTop) <= SCROLLER_BOTTOM_TOLERANCE,
    detail: m.documentScroller
      ? `검사 안 함(문서 스크롤러) vvTop ${m.vvOffsetTop}`
      : `껍데기 top ${m.shellTop} (vvTop ${m.vvOffsetTop})`,
  });

  // ⑦ 키보드가 올라오기 **전에** 편집 스크롤러에 굴릴 여유가 있어야 한다.
  //    없으면 iOS가 캐럿을 보이려고 **문서 자체를 스크롤하는 쪽으로 승격**하고(WebKit #191204),
  //    그게 vv.offsetTop > 0 = "편집창이 화면 밖으로 나가고 죽은 여백이 생긴다"다.
  //    한 번 승격되면 배경 스크롤 잠금(body{position:fixed}) 때문에 되돌리지도 상쇄하지도 못한다
  //    (2026-08-27: 되돌리기 scrollTo와 상쇄 translateY 둘 다 실패했다. 원인이 여기였다).
  //    🔴 kb-open 이후에는 검사하지 않는다 — 그때는 껍데기가 --kb-inset으로 키보드 몫을 비워
  //    스크롤러가 이미 키보드 위에 완전히 들어와 있고, 여유를 남기면 "글 끝에 빈 칸이 이어진다"는
  //    별개의 신고가 된다(dashboard.css 4430절). 여유가 필요한 구간과 거슬리는 구간은 겹치지 않는다.
  //    🔴 문서가 스크롤러면 여유도 **문서**에서 나온다 — 요소 스크롤러의 slack은 항상 0이다.
  //
  // 🔴🔴🔴 2026-08-31 (11라운드) — **문서가 스크롤러인 화면에서는 이 요구가 뒤집힌다.**
  //    그 화면들(.memo-edit-page 계열)에서 "키보드 전 여유"는 방어가 아니라 **버그 그 자체다.**
  //    상단 짤림 11라운드의 원인이 정확히 그 여유였다: `.sp-body { min-height: 100vh }`가 iOS에서
  //    792로 풀려 보이는 높이(684)보다 108px 큰 문서를 만들고 있었고, 브라우저가 진입 시 그
  //    108px 안으로 clamp하면서 맨 위 줄(‹ ↶ ↷ ★ ⋮)이 화면 밖으로 나갔다.
  //    실기기 판독: `docSH=792 innerH=684 maxScroll=108`, 진입 기전 `+0ms y=0 → +31ms y=108`.
  //    수정 후: `docSH=684 innerH=684 maxScroll=0` — 즉 **여유 0이 고쳐진 상태다.**
  //
  //    승격(WebKit #191204) 방어는 이 구조에서 **다른 곳이 담당한다**: 키보드가 올라오면
  //    `html.kb-open`이 메모지를 `calc(100lvh + var(--kb-inset))`로 키워 문서에 큰 여유를 만든다
  //    (dashboard.css 9888절). 그러니 키보드 **전에** 여유를 남길 이유가 없고, 남기면 짤린다.
  //    ⚠️ 남은 이론적 위험은 "키보드가 열리기 시작한 시점 ~ JS가 kb-open을 붙이는 시점" 사이의
  //       한 프레임이다(HANDOFF 10-2가 기록한 구간). 그건 여유로 막을 수 없고 — 막으려면 짤린다 —
  //       실기기에서 `vvTop`이 0인지로 감시한다. 그래서 **여유를 요구하는 대신 0을 요구한다.**
  //    💀 이 불변식이 고쳐진 상태를 "깨짐"으로 찍고 있었다. 틀린 판정을 내는 검사는
  //       다음 세션을 그대로 옛 처방으로 되돌린다 — CLAUDE.md가 "표 자신이 틀린 값을 갖게 됐다"고
  //       경고한 것과 같은 사고다. 요소 스크롤러 화면(먼슬리 상세·프로젝트·확장 편집)은 여전히
  //       옛 구조이므로 **그쪽 요구는 그대로 둔다.**
  //
  // 💀💀 그리고 처음 뒤집을 때 **"여유 0"으로 썼다가 긴 메모를 잡았다**(사용자 신고:
  //    "정상메모에서 불변식 1/7 깨짐"). 본문이 뷰포트보다 길면 여유는 **정당하게** 생기고
  //    그때 스크롤은 있어야 한다 — 그러니 "0이어야 한다"는 **만족 불가능한 요구**였다.
  //    올바른 명제는 여유의 크기가 아니라 **그 여유가 어디서 왔는가**다:
  //
  //        문서 높이 == max(편집 페이지 높이, innerHeight)
  //
  //    즉 **문서 높이는 본문만이 만들어야 한다.** 본문 밖에서 온 높이가 곧 짤림의 원인이다.
  //      · 버그: 본문 684 / innerH 684 인데 문서 792 → 여유 108, 기대 0 → 잡힌다 ✅
  //      · 고침: 본문 684 / innerH 684 / 문서 684 → 여유 0, 기대 0 → 통과 ✅
  //      · 긴 메모: 본문 1079 / innerH 684 / 문서 1079 → 여유 395, 기대 395 → 통과 ✅
  //    "여유가 있냐 없냐"를 묻는 대신 "설명되지 않는 여유가 있냐"를 묻는다.
  const slack = m.documentScroller ? (m.docSlack ?? 0) : m.scrollerSlack;
  // 본문이 뷰포트보다 큰 만큼만 여유가 있어야 한다. 그보다 크면 출처 없는 슬랙이다.
  const expectedSlack = Math.max(0, (m.docContentH ?? 0) - (m.docInnerH ?? 0));
  const unexplained = slack - expectedSlack;
  out.push({
    name: m.documentScroller ? "문서 높이는 본문만이 만든다 (짤림 방지)" : "키보드 전 스크롤 여유 있음",
    ok: m.kbInset > 0
      ? true
      : m.documentScroller
        ? Math.abs(unexplained) <= SCROLLER_BOTTOM_TOLERANCE
        : slack > 0,
    detail: m.kbInset > 0
      ? "키보드 열림(검사 안 함)"
      : m.documentScroller
        ? `여유 ${slack}px / 본문이 설명하는 몫 ${expectedSlack}px → 설명 안 되는 ${unexplained}px`
        : `여유 ${slack}px`,
  });

  return out;
}

export function failures(list: Invariant[]): Invariant[] {
  return list.filter((i) => !i.ok);
}

// ── DOM 읽기 (브라우저 전용) ────────────────────────────────────────────────
// 열린 dialog 안에서만 찾는다 — <dialog>는 닫혀 있어도 자식이 마운트돼 있어서 document 전체에서
// 찾으면 안 보이는 사본이 먼저 잡힌다(이 프로젝트에서 실제로 당했다).
export function measureEditor(): Measured | null {
  if (typeof document === "undefined") return null;
  const open = [...document.querySelectorAll("dialog[open]")].pop() ?? null;
  const root: ParentNode = open ?? document;
  const scroller = [...root.querySelectorAll<HTMLElement>(".textarea-row, .dialog-body-scroll")]
    .find((el) => el.clientHeight > 0);
  if (!scroller) return null;

  const all = [...root.querySelectorAll<HTMLElement>("*")];
  const scrollable = (el: HTMLElement) => /auto|scroll/.test(getComputedStyle(el).overflowY);
  const live = all.filter((el) => el.clientHeight > 0 && scrollable(el) && el.scrollHeight - el.clientHeight > 2);
  const dead = all.filter((el) => el.clientHeight > 0 && scrollable(el) && el.scrollHeight - el.clientHeight <= 2);

  const trTop = scroller.getBoundingClientRect().top;
  const toolbar = scroller.querySelector<HTMLElement>(".mobile-rich-toolbar");
  const panel = toolbar?.querySelector<HTMLElement>(".mobile-toolbar-panel") ?? null;
  const coverEl = panel ?? toolbar;
  const coveredTop = coverEl ? Math.round(coverEl.getBoundingClientRect().bottom - trTop) : 0;
  // MemoRichEditor가 실제로 쓰는 값을 그대로 내려받는다 — 여기서 다시 추측하지 않는다.
  const marginAttr = toolbar?.getAttribute("data-caret-top-margin");

  const shell = scroller.closest<HTMLElement>(".big-postit, .memo-form, .dialog-inner, .proj-detail-inner");
  const cs = document.documentElement ? getComputedStyle(document.documentElement) : null;
  const vv = typeof window !== "undefined" ? window.visualViewport : null;

  return {
    liveScrollers: live.length,
    deadScrollers: dead.length,
    coveredTop,
    scrollMarginTop: marginAttr ? Number(marginAttr) : 0,
    kbInset: Math.round(parseFloat(cs?.getPropertyValue("--kb-inset") || "0") || 0),
    shellPadBottom: shell ? Math.round(parseFloat(getComputedStyle(shell).paddingBottom) || 0) : 0,
    scrollerBottom: Math.round(scroller.getBoundingClientRect().bottom),
    // 🔴 `vv.height`가 아니라 `--app-vh`를 먼저 본다. 실기기에서는 useViewportHeight가 그 값을
    // vv.height로 채우므로 같지만, **로컬 키보드 시뮬레이션**(CLAUDE.md 7절: --kb-inset/--app-vh를
    // 손으로 주입)에서는 vv.height가 안 줄어서 둘이 어긋난다. 그때 이 불변식이 항상 거짓 실패로
    // 뜨면 검사 자체를 안 믿게 된다 — 앱이 실제로 레이아웃에 쓰는 값과 같은 기준으로 재야 한다.
    visibleBottom: Math.round(
      parseFloat(cs?.getPropertyValue("--app-vh") || "") || (vv ? vv.height : window.innerHeight),
    ),
    vvOffsetTop: Math.round(vv ? vv.offsetTop : 0),
    shellTop: shell ? Math.round(shell.getBoundingClientRect().top) : 0,
    scrollerSlack: Math.round(scroller.scrollHeight - scroller.clientHeight),
    documentScroller: !!scroller.closest(".memo-edit-page"),
    docSlack: Math.round(
      Math.max(0, document.documentElement.scrollHeight - (typeof window !== "undefined" ? window.innerHeight : 0)),
    ),
    // 문서 높이를 정당하게 만드는 유일한 것 = 편집 페이지 자신의 높이(위 docContentH 주석).
    docContentH: Math.round(
      document.querySelector(".memo-edit-page")?.getBoundingClientRect().height ?? 0,
    ),
    docInnerH: typeof window !== "undefined" ? window.innerHeight : 0,
  };
}
