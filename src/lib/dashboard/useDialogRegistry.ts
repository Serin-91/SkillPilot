"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 다이얼로그 레지스트리 (PHASE 0 ①). 로직은 한 글자도 안 고쳤다.
//
// 여기 모인 것: activeDialogKey / open / close / onDialogBackdropClick /
//               <dialog> close 이벤트 캡처 / 배경 스크롤 잠금 effect.
//
// 🔴🔴 이 파일은 인계 26~28절이 **22라운드**를 태운 코드다. "정리"하지 마라.
//   ① `goingFullPage` 분기를 지우지 마라 — 모바일에서는 no-op처럼 보여도 **데스크톱은 아직 문서가
//      스크롤러**라 `else` 쪽이 실제로 일을 한다. 지우면 데스크톱에서 다이얼로그를 닫을 때 맨 위로 튄다.
//   ② `setActiveDialogKey((cur) => (cur === key ? null : cur))` 가드를 풀지 마라 — close 이벤트는
//      **비동기**라 close() 직후 다른 dialog를 open()하는 경로에서는 이미 새 key가 들어가 있다.
//   ③ open()/close()의 **statement 순서**를 바꾸지 마라. showModal() → scrollTo 복원 → key 판정 →
//      setActiveDialogKey 순서가 전부 실측으로 정해진 것이다.
//
// 🔴 ref 12개와 `dialogs` 리터럴은 **Dashboard에 그대로 남겨뒀다** — JSX가 `ref={newsRef}`로 직접
//   쓰는 자리가 40군데라, 그걸 `dialogs.news`로 바꾸는 것은 이동이 아니라 rename이다(계획서 §7-2).
//   훅은 그 객체를 인자로 받는다. 로직이 없는 ref 묶음이라 격리 대상이 아니다.

import { useEffect, useState } from "react";

export type DialogRefMap = Record<string, React.RefObject<HTMLDialogElement | null>>;

export function useDialogRegistry<D extends DialogRefMap>(opts: {
  dialogs: D;
  /** 먼슬리 Create가 일반 페이지로 내려가 있나 (그 화면은 문서가 유일한 스크롤러라 잠그면 안 된다). */
  monthlyComposePage: boolean;
  /** "메모로 저장"이 일반 페이지로 내려가 있나. 위와 같은 이유. */
  bigEditorPage: boolean;
  /** 전체화면 편집 페이지가 문서를 넘겨받는 중인가. 잠금 cleanup이 어디로 되돌릴지 정한다. */
  fullPageEditorRef: React.RefObject<boolean>;
  /**
   * open()이 key를 확정한 **뒤** 부른다. 원문에서 open() 꼬리에 있던
   * "이전에 보던 포스트잇/편집 상태 지우기" 3블록이 그대로 이쪽으로 갔다 —
   * Dashboard 지역 state를 건드리는 부분이라 훅이 들고 있을 수 없다.
   */
  onOpen: (key: keyof D | null) => void;
  /**
   * backdrop 클릭의 특수 경로. true를 돌려주면 기본 닫기를 **하지 않는다**.
   * 🔴 key가 아니라 **엘리먼트를 그대로** 넘긴다 — 원문이 `e.currentTarget === keynotesRef.current`
   *    같은 엘리먼트 비교라, key로 바꾸면 `dialogs`에 없는 다이얼로그에서 판정이 달라진다.
   */
  onBackdropIntercept: (el: HTMLDialogElement) => boolean;
}) {
  const { dialogs, monthlyComposePage, bigEditorPage, fullPageEditorRef, onOpen, onBackdropIntercept } = opts;

  const [activeDialogKey, setActiveDialogKey] = useState<keyof D | null>(null);

  function dialogKeyOf(d: React.RefObject<HTMLDialogElement | null>): keyof D | null {
    return (Object.entries(dialogs).find(([, ref]) => ref === d)?.[0] as keyof D) ?? null;
  }
  const open = (d: React.RefObject<HTMLDialogElement | null>) => {
    // showModal()은 스펙상 다이얼로그에 포커스를 옮기는 focusing steps를 동반하는데, 그 과정에서
    // 브라우저가 배경 페이지를 다이얼로그 쪽으로 스크롤시켜버린다 — 열기 직전 스크롤 위치를 그대로 복원한다.
    const scrollY = window.scrollY;
    d.current?.showModal();
    window.scrollTo(0, scrollY);
    const key = dialogKeyOf(d);
    setActiveDialogKey(key);
    // 이전에 보던 포스트잇/편집 상태가 안 지워진 채로 다이얼로그를 새로 열면 그게 그대로 겹쳐 보인다
    // (예: 주간달력에서 메모 없는 날 클릭 → 이전에 열어본 TODAY 메모가 계속 뜨는 버그).
    // bodyEditor는 이미 열려있는 big editor 위에 한 겹 더 뜨는 중첩 팝업이라 예외로 둔다 — 여기서 지우면
    // "크게 보기"를 닫았을 때 뒤에 있던 편집창까지 같이 사라진다. postitOnly는 이 호출 바로 다음에
    // openPostitView/openBigEditor로 실제 값을 다시 세팅하므로(같은 이벤트 핸들러 안, batching) 안전하다.
    onOpen(key);
  };
  const close = (d: React.RefObject<HTMLDialogElement | null>) => {
    d.current?.close();
    const key = dialogKeyOf(d);
    setActiveDialogKey((cur) => (cur === key ? null : cur));
  };
  // 다이얼로그가 열려 있는 동안 뒤 문서의 스크롤을 아예 없앤다.
  //
  // 스펙상 showModal()이면 배경 스크롤이 막혀야 하는데 iOS 사파리는 안 막는다. 그 상태에서 메모
  // 입력칸을 탭하면 iOS가 커서를 보이게 하려고 "문서를" 스크롤하고, 그때 화면을 덮고 있던
  // position:fixed 편집창이 문서와 함께 밀려 올라간다. 실기기 화면에서 편집창 아래로 대시보드
  // 푸터("SkillPilot — AI·개발 동향과...")가 그대로 드러난 게 이것이다. 스크롤 제스처도 이 문서
  // 스크롤이 먼저 먹어버려서 본문이 안 움직이는 것처럼 느껴진다.
  //
  // 문서에 스크롤할 것이 없으면 iOS도 밀 수 없다. position:fixed + top:-scrollY가 표준 처방이고,
  // 닫을 때 원래 위치로 되돌린다(그냥 overflow:hidden만으로는 iOS에서 안 먹는다).
  // 🔴🔴 <dialog>는 우리 close()를 **거치지 않고도** 닫힌다 — Esc, 안드로이드 하드웨어 뒤로가기,
  // 브라우저/OS가 top layer를 정리하는 경우. 그러면 activeDialogKey가 그대로 남아 아래 배경 스크롤
  // 잠금의 cleanup이 **영원히 안 돈다**: body가 `position: fixed; top: -Ypx; overflow: hidden`인 채로
  // 굳는다. 그 상태에서는 body의 overflow가 뷰포트로 전파돼 문서 스크롤이 통째로 죽고, 본문은
  // top: -Y 위치에서 잘린 채 남는다 — "메인페이지가 갑자기 이상해진다"의 정체다.
  // 실측(prod, 375x684): Monthly MEMO를 열고 Esc로 닫으면
  //   documentElement.scrollHeight 2640 → **684**, body position **fixed**, top **-1200px**,
  //   window.scrollTo(0, 99999) 해도 scrollY **0** (스크롤 불가). 정상 경로(✕)로 닫으면 2640 / 1200 복원.
  // onCancel을 단 다이얼로그도 조건이 안 맞으면(예: memoFormOpen=false) 그대로 native close로 간다.
  // close 이벤트는 버블링하지 않지만 **캡처 단계는 target까지 내려오므로** document에서 한 번에 받는다 —
  // 다이얼로그 12개에 onClose를 따로 다는 것보다 빠뜨릴 여지가 없다.
  useEffect(() => {
    function onAnyDialogClose(e: Event) {
      // 🔴 우리가 **모달을 풀려고** close() 직후 show()로 다시 연 경우가 있다(먼슬리 Create를
      // 일반 페이지로 내릴 때). close 이벤트는 비동기라 그 시점엔 이미 다시 열려 있는데,
      // 그걸 "닫혔다"로 읽으면 activeDialogKey가 null이 되어 배경 잠금 cleanup이 돌고
      // 화면이 대시보드 스크롤 위치로 튄다(= 지뢰 #3과 같은 사고). 실제 상태를 보고 판단한다.
      if ((e.target as HTMLDialogElement).open) return;
      const key = Object.entries(dialogs).find(([, ref]) => ref.current === e.target)?.[0] as keyof D | undefined;
      if (key) setActiveDialogKey((cur) => (cur === key ? null : cur));
    }
    document.addEventListener("close", onAnyDialogClose, true);
    return () => document.removeEventListener("close", onAnyDialogClose, true);
    // dialogs는 ref 객체 12개를 담은 리터럴이라 렌더마다 새로 만들어지지만 ref 자체는 안정적이다.
    // 리스너는 한 번만 붙이면 되므로 의존성을 비운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // 🔴 먼슬리 Create가 일반 페이지로 내려가 있으면 **잠그면 안 된다.** 그 화면은 문서가
    // 유일한 스크롤러라서, body를 fixed로 묶으면 굴릴 문서 자체가 사라진다(= 스크롤 잠김).
    if (!activeDialogKey || monthlyComposePage || bigEditorPage) return;
    const body = document.body;
    const y = window.scrollY;
    const saved = body.getAttribute("style");
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      // 🔴🔴🔴 2026-08-30 — "복원을 안 하는 것"만으로는 부족했다. 실기기 계측이 그걸 잡았다.
      //
      // `?debug=vp`의 "누가 문서를 굴렸나"가 남긴 실기기 판독:
      //     scrollTo(0)  당시 y=108  docSH=792     (vvTop=0, maxScroll=108)
      // 즉 **우리 `scrollTo(0,0)`이 불릴 때 이미 맨 끝(108)에 가 있었다.** 우리 코드의 호출은
      // 그 하나뿐이었고(아래 가드가 `scrollTo(0, y)`를 정상적으로 막고 있었다), 그렇다면 굴린
      // 것은 우리가 아니라 **브라우저**다 — `position: fixed; top: -Ypx` 잠금을 푸는 순간
      // 잠그기 전의 시각 위치(Y)로 되돌리고, 그 값이 새 페이지의 max로 clamp된 것이다.
      // "복원하지 않는다"는 우리 호출만 막을 뿐 브라우저의 되돌림은 못 막는다.
      //
      // 👉 되돌릴 위치 **자체를 0으로** 만든다. 잠금을 풀기 **전에** top을 0으로 바꾸고 강제로
      //    레이아웃을 한 번 읽어 브라우저가 그 값을 기준으로 삼게 한다. 그러면 풀 때 되돌릴
      //    것이 0이라 clamp될 큰 값이 없다.
      //
      // ★ 이것이 "선택복사에서만 났던" 이유다(사용자가 짚어준 구조 차이). 그 경로만 **다이얼로그가
      //   열려 있어 body가 잠겨 있다**(뉴스/채용 상세 → 메모로 저장). TODAY에서 여는 경로는
      //   대시보드가 문서라 애초에 잠금이 없어서 되돌릴 것도 없다.
      // cleanup이 **최신** 값을 읽는 것이 이 코드의 요점이다(바로 위 문단). eslint가 권하는 대로
      // 지역 변수로 미리 빼면 전환 전 값(false)이 잡혀 동작이 바뀐다 — 그래서 규칙을 끈다.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const goingFullPage = fullPageEditorRef.current;
      if (goingFullPage) {
        body.style.top = "0px";
        void body.offsetHeight;   // 강제 리플로우 — 이 줄이 없으면 아래 복원이 같은 tick에 덮어써 무효가 된다
      }
      if (saved === null) body.removeAttribute("style");
      else body.setAttribute("style", saved);
      // 🔴🔴 전체화면 편집 페이지로 넘어가는 중이면 **대시보드 스크롤을 복원하면 안 된다.**
      //
      // 이 cleanup은 두 경우에 돈다: ① 다이얼로그가 그냥 닫혔다(→ 복원이 맞다)
      // ② 편집 페이지가 문서를 넘겨받는다(→ 복원하면 안 된다). ②에서 `scrollTo(0, 대시보드 y)`를
      // 부르면 그 값이 편집 페이지의 max로 clamp되고(실측 900 → 90), 뒤이어 도는
      // `scrollTo(0, 0)`과 **경합**한다. 편집 페이지는 마운트되면서 문서 높이가 여러 번 바뀌는데,
      // 브라우저의 스크롤 앵커링이 그 사이에 스크롤을 되잡아서 0이 아닌 곳에 멈춘다
      // (실측 375×684, 문서 774: 어떤 판은 0, 어떤 판은 **26**에서 멈췄다 →
      //  close-btn top -4 / dialog-head top -6 = "들어가자마자 상단이 잘려 보인다").
      //
      // 💀 예전 처방은 "그 다음에 scrollTo(0,0)을 한 번 더 부른다"였다(지뢰 #3). 그건 **순서 경쟁**이라
      // 레이아웃이 늦게 정리되는 실기기에서 진다. 애초에 굴리지 않는 것이 근본 수정이다.
      // 로컬에서 3주 동안 안 보였던 이유: 빈 메모는 문서 높이 == 뷰포트라 maxScroll이 0이었다.
      // 실기기는 `min-height:100lvh`(주소창 없는 높이)라 항상 여유가 있다 — 그래서 거기서만 났다.
      //
      // ref로 읽는 이유: cleanup은 **이전 렌더의 클로저**라 monthlyComposePage/bigEditorPage를
      // 직접 보면 전환 전 값(false)이 잡힌다. 지금 화면 상태를 봐야 한다.
      // 전체화면으로 갈 때도 **0을 명시적으로 한 번 더** 박는다. 위 top=0으로 되돌림 대상은
      // 없앴지만, 잠금 해제 직후 문서 높이가 다시 잡히는 구간이 남아 있어 여기서 확정한다.
      if (goingFullPage) window.scrollTo(0, 0);
      else window.scrollTo(0, y);
    };
    // 🔴 deps는 **원문 그대로 셋**이다. fullPageEditorRef를 넣지 마라 — 넣어도 동작은 같지만
    // (ref 객체는 안정적이다) 원문과 배열이 달라진다. 원문 Dashboard에서는 같은 컴포넌트의
    // useRef라 이 경고 자체가 안 났고, 인자로 받으면서 eslint가 출처를 모르게 된 것뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialogKey, monthlyComposePage, bigEditorPage]);
  // 8장 — 팝업 바깥(backdrop) 클릭 시 닫기
  function onDialogBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    // Key Notes의 고정 메모 전체보기 / bodyEditor의 draft 되돌리기 / Monthly MEMO의 draft 저장은
    // 각각 Dashboard 지역 state를 봐야 해서 호출자가 판정한다(true면 기본 닫기를 하지 않는다).
    if (onBackdropIntercept(e.currentTarget)) return;
    e.currentTarget.close();
    const key = Object.entries(dialogs).find(([, ref]) => ref.current === e.currentTarget)?.[0] as keyof D | undefined;
    if (key) setActiveDialogKey((cur) => (cur === key ? null : cur));
  }

  return { activeDialogKey, setActiveDialogKey, open, close, onDialogBackdropClick };
}
