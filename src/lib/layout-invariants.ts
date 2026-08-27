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
  /** 편집 껍데기의 아랫변 y. --app-vh 구조에서는 이 값이 곧 보이는 아랫변이어야 한다. */
  shellBottom: number;
  /** 편집 스크롤러에 남은 스크롤 여유(scrollHeight - clientHeight). 키보드가 올라오기 전에
   *  이 값이 0이면 iOS가 문서 스크롤로 승격해 화면을 민다(WebKit #191204). */
  scrollerSlack: number;
};

/** 스크롤러 아랫변과 키보드 상단이 이만큼까지 어긋나는 건 봐준다(반올림·경계 여유). */
export const SCROLLER_BOTTOM_TOLERANCE = 4;

export function judge(m: Measured): Invariant[] {
  const out: Invariant[] = [];

  // ① 조상 체인에 굴릴 수 있는 스크롤러가 둘이면 손가락이 엉뚱한 것을 굴린다.
  out.push({
    name: "스크롤러 1개",
    ok: m.liveScrollers === 1,
    detail: `${m.liveScrollers}개`,
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
    ok: m.coveredTop <= m.scrollMarginTop,
    detail: `덮음 ${m.coveredTop} / 마진 ${m.scrollMarginTop}`,
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

  // ⑥ **껍데기 아랫변이 보이는 아랫변과 같아야 한다.** 이게 새 구조가 보장하는 것이고,
  //    죽은 여백/짤림이 여기서 한 번에 잡힌다 — 껍데기 높이를 --app-vh(= vv.height)로 잡으면
  //    아랫변이 곧 키보드 상단이므로 어긋날 자리가 없다.
  //    🔴 예전 ⑥은 "iOS 밀기가 상쇄됨"(shellTop == 0)이었는데, **iOS에서 offsetTop 보정 자체가
  //    틀린 접근**이라 판정 기준부터 틀렸다(WebKit은 layout viewport가 키보드 밑으로 슬라이드해서
  //    fixed의 원점이 offsetTop이 아니라 0이다 — Vuetify PR #22923도 같은 결론).
  //    그래서 vvOffsetTop이나 shellTop을 **판정에 쓰지 않는다.** 둘은 진단용 수치로만 남긴다.
  out.push({
    name: "껍데기 아랫변 == 보이는 아랫변",
    ok: m.kbInset === 0 || Math.abs(m.shellBottom - m.visibleBottom) <= SCROLLER_BOTTOM_TOLERANCE,
    detail: m.kbInset === 0 ? "키보드 없음" : `${m.shellBottom} vs ${m.visibleBottom} (vvTop ${m.vvOffsetTop})`,
  });

  // ⑦ 키보드가 올라오기 **전에** 편집 스크롤러에 굴릴 여유가 있어야 한다.
  //    없으면 iOS가 캐럿을 보이려고 **문서 자체를 스크롤하는 쪽으로 승격**하고(WebKit #191204),
  //    그게 vv.offsetTop > 0 = "편집창이 화면 밖으로 나가고 죽은 여백이 생긴다"다.
  //    한 번 승격되면 배경 스크롤 잠금(body{position:fixed}) 때문에 되돌리지도 상쇄하지도 못한다
  //    (2026-08-27: 되돌리기 scrollTo와 상쇄 translateY 둘 다 실패했다. 원인이 여기였다).
  //    🔴 kb-open 이후에는 검사하지 않는다 — 그때는 껍데기가 --kb-inset으로 키보드 몫을 비워
  //    스크롤러가 이미 키보드 위에 완전히 들어와 있고, 여유를 남기면 "글 끝에 빈 칸이 이어진다"는
  //    별개의 신고가 된다(dashboard.css 4430절). 여유가 필요한 구간과 거슬리는 구간은 겹치지 않는다.
  out.push({
    name: "키보드 전 스크롤 여유 있음",
    ok: m.kbInset > 0 || m.scrollerSlack > 0,
    detail: m.kbInset > 0 ? "키보드 열림(검사 안 함)" : `여유 ${m.scrollerSlack}px`,
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
    shellBottom: shell ? Math.round(shell.getBoundingClientRect().bottom) : 0,
    scrollerSlack: Math.round(scroller.scrollHeight - scroller.clientHeight),
  };
}
