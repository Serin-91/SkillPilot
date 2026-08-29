"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
// 🔴 tiptap의 editor.commands.undo/redo는 prosemirror-history의 undo/redo를 그대로 부르는데,
// 그 둘은 `buildCommand(redo, /* scroll */ true)`라서 **자기 트랜잭션에 tr.scrollIntoView()를 붙인다**
// (node_modules/prosemirror-history/dist/index.js:408, 424~430). 즉 focus()의 scrollIntoView를
// 꺼도 스크롤 주체가 하나 더 남아 있었다 — 그게 "메모 수정에서 앞/뒤로가기를 누르면 스크롤이 막힌다"가
// 고쳤다고 보고한 뒤에도 재발한 진짜 이유다(CLAUDE.md 3절 "캐럿 노출의 소유자는 정확히 하나").
// NoScroll 변종을 직접 부른다.
import { redoNoScroll, undoNoScroll } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Eraser, List, ListOrdered, ListTodo, Minus, Quote, Strikethrough } from "lucide-react";
import { EmojiPopover } from "./EmojiPopover";
import { LinkPopover } from "./LinkPopover";
import { MEMO_COLOR_OPTIONS, type MemoColor } from "@/lib/memo/types";

type ParaLevel = 0 | 1 | 2 | 3;
// 메모 툴바 — [H1][H2][H3] 버튼을 항상 노출한다.
// "본문" 버튼은 제거했다 — 기본 상태가 곧 본문이라 버튼이 하는 일이 없었고, 툴바 맨 앞자리만
// 차지했다. H1부터 시작해 왼쪽으로 당겨진다. 본문으로 되돌리려면 활성된 H1~H3를 다시 누르면 된다
// (toggleHeading이 토글이라 그대로 문단으로 돌아온다).
const PARAGRAPH_STYLES: { label: string; level: ParaLevel; styleClass: string }[] = [
  { label: "H1", level: 1, styleClass: "text-style-h1" },
  { label: "H2", level: 2, styleClass: "text-style-h2" },
  { label: "H3", level: 3, styleClass: "text-style-h3" },
];

// 글씨 크기 — 자유 입력이 아니라 프리셋만 제공. "마크 없음"이 곧 기본 크기이고, 그 실제 값은
// CSS의 --memo-base-font(웹 18px / 모바일 16px)가 정한다.
const FONT_SIZES = [12, 13, 14, 16, 18, 20, 22, 24, 28, 32] as const;
// .link-popover의 CSS 폭 — 커서 위치에 띄울 때 오른쪽으로 넘치지 않게 clamp하는 데 쓴다.
const LINK_POPOVER_WIDTH = 260;
// DOM을 아직 못 읽는 최초 렌더에서만 쓰는 임시값 — 화면에 보이는 크기의 근거는 항상 computed style이다.
const DEFAULT_FONT_SIZE = 16;

// 툴바에 표시할 "현재 글씨 크기". 마크가 있으면 그 값, 없으면 커서가 놓인 실제 DOM의 computed
// font-size를 읽는다. 예전에는 마크가 없으면 무조건 상수 16을 보여줬는데, 본문 기본 크기는 CSS가
// 따로 정하고 있어서(웹 18px) "본문을 누르면 툴바가 16으로 바뀌는" 불일치가 생겼다. 제목(H1~H3,
// em 기준)에 커서를 둔 경우까지 한 번에 맞는 값이 나온다.
function readCurrentFontSize(editor: Editor | null): number {
  const marked = (editor?.getAttributes("fontSize").size as string | undefined)?.replace("px", "");
  if (marked) return Math.round(Number(marked));
  if (!editor) return DEFAULT_FONT_SIZE;
  let node: Node | null = null;
  try {
    node = editor.view.domAtPos(editor.state.selection.from).node;
  } catch {
    node = editor.view.dom;
  }
  const el = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement) as HTMLElement | null;
  const px = parseFloat(getComputedStyle(el ?? editor.view.dom).fontSize);
  return Number.isFinite(px) && px > 0 ? Math.round(px) : DEFAULT_FONT_SIZE;
}

// TextStyle 패키지를 새로 추가하지 않고 bold/italic과 같은 방식의 최소 Mark 확장만 둔다 —
// HTML에 <span style="font-size:18px"> 형태로 저장되어 RichMemoContent(읽기 전용 렌더)도 그대로 표시하고,
// 다시 열었을 때도 parseHTML로 그대로 복원된다.
const FontSize = Mark.create({
  name: "fontSize",
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (attrs: { size: string | null }) => (attrs.size ? { style: `font-size: ${attrs.size}` } : {}),
      },
    };
  },
  parseHTML() {
    // style 기반 parseRule은 Tiptap이 addAttributes()의 attribute별 parseHTML을 자동 연결해주지
    // 않는다("style" in parseRule이면 injectExtensionAttributesToParseRule이 그대로 통과시킴) —
    // getAttrs를 직접 줘야 값이 실제로 복원된다. 안 주면 항상 기본값(null)이 되어 다시 열었을 때
    // (특히 프로젝트처럼 여러 번 리마운트되는 화면에서) 서식이 사라진다.
    return [{ style: "font-size", getAttrs: (value: string) => ({ size: value }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => import("@tiptap/core").ChainedCommands }) =>
        chain().setMark("fontSize", { size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => import("@tiptap/core").ChainedCommands }) =>
        chain().unsetMark("fontSize").run(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    textColor: {
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
  }
}

// 프로젝트 에디터 전용 글자색 — TextStyle/Color 패키지를 새로 추가하지 않고 FontSize와 같은 방식의
// 최소 Mark 확장만 둔다. "기본색"은 hex를 직접 지정하지 않고 이 마크를 제거해 현재 테마의 기본
// 글자색(라이트/다크)을 그대로 따르게 한다.
// 새로 추가한 3색(#2ACAEA·#FF6666·#FFD700)은 비슷한 계열 색 바로 옆에 끼워 넣는다 —
// 빨강(FF4040) 옆에 코랄(FF6666), 청록(40E0D0) 옆에 하늘색(2ACAEA), 연노랑(FFF68F) 옆에 골드(FFD700).
const TEXT_COLORS = [
  "#6D58ED", "#FF4040", "#FF6666", "#FFC0CB", "#C6E2FF",
  "#40E0D0", "#2ACAEA", "#FFF68F", "#FFD700", "#CCCCFF",
] as const;
const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => el.style.color || null,
        renderHTML: (attrs: { color: string | null }) => (attrs.color ? { style: `color: ${attrs.color}` } : {}),
      },
    };
  },
  parseHTML() {
    // FontSize와 같은 이유로 getAttrs를 직접 준다 — 없으면 값이 항상 기본값(null)으로 리셋된다.
    return [{ style: "color", getAttrs: (value: string) => ({ color: value }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setTextColor: (color: string) => ({ chain }: { chain: () => import("@tiptap/core").ChainedCommands }) =>
        chain().setMark("textColor", { color }).run(),
      unsetTextColor: () => ({ chain }: { chain: () => import("@tiptap/core").ChainedCommands }) =>
        chain().unsetMark("textColor").run(),
    };
  },
});

export type MemoRichEditorHandle = {
  insertTextAtCursor: (content: string, isHtml?: boolean) => boolean;
  /** 🔴 캐럿을 **안 쓰고** 본문 맨 위/맨 아래에 넣는다.
   *  "현재 커서 위치에 삽입"은 넣을 자리까지 **스크롤한 뒤** 눌러야 하는데, iOS에서 키보드가
   *  올라오면 레이아웃 뷰포트가 보이는 밴드 위로 밀려(vvTop) 상단 고정 UI가 구조적으로 안 보일 수 있다.
   *  이 경로는 그 싸움을 아예 피한다 — 진입 직후(키보드 열기 전, 스크롤 0)에 누르면 되므로
   *  위치 문제가 발생할 자리가 없다. */
  insertAt: (where: "start" | "end", content: string, isHtml?: boolean) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  // Quick Editor ↔ 확장(bodyEditor) 전환처럼 에디터 인스턴스 자체가 다시 마운트되는 화면 전환에서
  // caret 위치를 옮겨 심기 위한 용도 — ProseMirror의 위치 정수(from/to)를 그대로 주고받는다.
  getSelection: () => { from: number; to: number } | null;
  setSelection: (range: { from: number; to: number }) => void;
};

// 모바일 하단 툴바의 메모지 색 팔레트 — 목록은 lib/memo/types.ts 한 곳에만 둔다(그 파일 주석 참고).

// 링크에 그 사이트 파비콘을 작게 붙인다(노션 스타일). 이미지 URL은 링크마다 다르므로 CSS만으로는
// 만들 수 없어서, renderHTML에서 CSS 커스텀 프로퍼티로 심고 ::before가 그걸 배경으로 그린다
// (dashboard.css의 a.has-favicon 규칙). renderHTML은 매 렌더마다 도는 값이라 저장된 HTML에도
// 그대로 들어가고, 상세보기(RichMemoContent)에서도 같은 CSS가 적용된다.
//
// 파비콘은 구글 s2 서비스에서 받는다 — 별도 인프라 없이 되는 대신 서드파티 요청이 링크 도메인마다
// 하나씩 생기고, 사용자가 어떤 사이트를 메모했는지가 구글에 노출된다. 메모 본문은 첫 화면 밖이라
// 렌더를 막지는 않지만, 원치 않으면 아래 faviconStyle이 빈 객체를 반환하게 하면 파비콘만 사라진다.
function faviconStyle(href: string): Record<string, string> {
  try {
    const { hostname, protocol } = new URL(href);
    if (protocol !== "http:" && protocol !== "https:") return {};
    return { class: "has-favicon", style: `--link-favicon:url("https://www.google.com/s2/favicons?domain=${hostname}&sz=32")` };
  } catch {
    return {}; // 상대경로·잘못된 URL이면 파비콘 없이 평범한 링크로 둔다
  }
}

// openOnClick: 편집 중에도 링크를 누르면 바로 열린다(target=_blank라 작성 중인 메모는 그대로 남는다).
// 예전엔 false여서 "링크를 넣어도 눌러지지 않는" 상태였다 — 링크를 넣는 의미가 없었다.
const FaviconLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === "string" ? HTMLAttributes.href : "";
    return ["a", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, faviconStyle(href)), 0];
  },
});

// 프로젝트 기본 템플릿의 4개 제목(class="project-template-heading")만 강조색을 유지해야 한다 —
// 기본 Heading 노드는 class attr을 스키마에 안 갖고 있어서 그냥 두면 저장/재파싱 때마다 사라진다.
const TemplateHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute("class"),
        renderHTML: (attributes) => (attributes.class ? { class: attributes.class } : {}),
      },
    };
  },
});

// "맨 위로 이동"과 캐럿 노출의 충돌 — 사용자가 방금 위로 보내달라고 한 것을 되돌리지 않기 위한 창.
//
// ⚠️ 이 창은 **"위로가기 안 먹힘"의 원인이 아니다.** 진짜 원인은 버튼이 에디터 포커스를 빼앗던 것이고
// (Dashboard.tsx의 KEEP_EDITOR_FOCUS 주석 참고: pointerdown만 막고 mousedown을 안 막았다),
// 실기기 실측(2026-08-26 iPhone Chrome)에서 탭 직후 `focus=BODY` / `caret none`이 찍혀 확인됐다.
// 즉 그 시점엔 `editor.isFocused`가 false여서 **아래 훅은 애초에 돌지도 않았다** — 이 억제는 no-op이었다.
//
// 그런데도 남긴다: 포커스가 제대로 지켜지면 isFocused가 true가 되어 이 훅이 **이제부터 실제로 돈다.**
// 아래 vv.resize settle 훅은 "캐럿 노출의 유일한 소유자"이고(CLAUDE.md 3절), iOS Chrome은 스크롤 중에
// 하단 툴바가 접혔다 펴지며 vv.resize를 쏜다 — 위로 올린 직후 120ms 뒤 scrollIntoView()가 캐럿 자리로
// 도로 끌어내릴 수 있다. 포커스 수정이 그 경로를 **열어주기 때문에** 짝으로 같이 둔다.
//
// 캐럿이나 selection은 절대 건드리지 않는다 — 그 길은 2026-08-26에 심었다가 같은 날 되돌렸다
// (CLAUDE.md 지뢰표 💀💀 줄: 선택 범위가 0개가 되는 순간 iOS가 키보드를 닫고 보기모드로 튕긴다).
// 여기서는 **소유자를 잠깐 비켜세우기만** 한다. 창이 지나면 캐럿 노출은 원래대로 돌아온다.
// 패널이 하나도 안 열렸을 때의 값 — 툴바만 있으면 실측 39px이라 48로 9px 여유가 남는다.
// 패널이 열리면 아래 useLayoutEffect가 실제 덮이는 높이로 올려 잡는다.
const TOOLBAR_ONLY_TOP_MARGIN = 48;
// 캐럿이 패널 아랫변에 딱 붙지 않도록 조금 더 띄운다.
const CARET_TOP_BREATHING = 8;
const SCROLL_TOP_GRACE_MS = 700;
let lastScrollTopTapAt = -Infinity;
export function noteScrollTopTap() {
  lastScrollTopTapAt = performance.now();
}

// 4~27절 — Monthly MEMO 본문 전용 리치 텍스트 에디터. textarea 자리를 그대로 대체한다.
export const MemoRichEditor = forwardRef<MemoRichEditorHandle, {
  initialValue: string;
  onChange: (html: string) => void;
  placeholder?: string;
  bodyClassName?: string;
  toolbarExtra?: ReactNode;
  hideToolbar?: boolean;
  enableTextColor?: boolean;
  memoColor?: MemoColor;
  onMemoColorChange?: (color: MemoColor) => void;
}>(function MemoRichEditor({ initialValue, onChange, placeholder, bodyClassName, toolbarExtra, hideToolbar, enableTextColor, memoColor, onMemoColorChange }, ref) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<"text" | "memoColor" | "more" | null>(null);
  const [mobileFontSizeOpen, setMobileFontSizeOpen] = useState(false);
  // editorFocused 상태는 없앴다. 하단 서식툴바를 포커스 여부로 display:none ↔ block 토글하는
  // 용도 하나뿐이었는데, 그 토글이 바로 "탭한 자리에서 수정이 시작되지 않는" 원인이었다.
  // 툴바는 스크롤러(.textarea-row) 안, 스크롤 위치보다 위에 있는 .rich-editor의 첫 자식이다.
  // 그래서 포커스가 들어오는 순간 39px(실측)이 스크롤 콘텐츠 맨 위에 삽입되고, 그 아래 내용이
  // 통째로 39px 밀린다 — 손가락이 닿는 순간 조준한 줄이 움직여버린다.
  // 편집 모드에서는 툴바가 늘 필요하므로 항상 띄운다. 토글을 없애면 리플로우도 같이 없어지고,
  // 캐럿을 놓기 전에 T를 먼저 누를 수도 있게 된다.
  const [linkPopover, setLinkPopover] = useState<{ url: string; hasLink: boolean; top: number; left: number } | null>(null);
  // 툴바의 "현재 글씨 크기"와 B/I/U 활성 표시는 커서 위치의 mark를 읽어 그린다. 그런데 선택이
  // 바뀔 때 리렌더를 걸어주는 곳이 없어서, 글자를 선택해도 값이 이전 상태 그대로 남아 있었다.
  const [selectionTick, setSelectionTick] = useState(0);
  void selectionTick;
  const selectionSyncRef = useRef<number | null>(null);
  function scheduleSelectionSync() {
    if (selectionSyncRef.current !== null) window.clearTimeout(selectionSyncRef.current);
    selectionSyncRef.current = window.setTimeout(() => {
      selectionSyncRef.current = null;
      setSelectionTick((n) => n + 1);
    }, 120);
  }
  useEffect(() => () => {
    if (selectionSyncRef.current !== null) window.clearTimeout(selectionSyncRef.current);
  }, []);
  // 🔴🔴 캐럿을 노출할 때 위쪽으로 비워야 하는 높이 — **고정값이면 안 된다.**
  //
  // 서식툴바 패널(T / 메모색상 / ⋯)은 `position: absolute`라 툴바 박스 높이(실측 39px)에 **안 잡히면서**
  // 본문 위를 덮는다. 실측(375×684, 포스트잇 상세 편집)으로 실제 가려지는 높이:
  //     패널 없음 39px · T 97px · 메모색상 97px · ⋯ 136px
  // 그런데 scrollMargin.top이 48 고정이었다. 패널이 없을 때만 맞고(39 < 48), 패널을 열면 49~88px이
  // 모자란다 — `scrollIntoView`가 캐럿을 위에서 48px 지점에 놓는데 거기가 **패널 뒤**라 캐럿이 안 보인다.
  // 그러면 iOS가 캐럿을 보이려고 **화면 전체를 민다**(vv.offsetTop > 0). 우리 `--kb-inset` 패딩과
  // 이중 보정이 되어 편집창이 위로 나가고 화면에는 padding 영역만 남는다 = **"여백이 절반까지
  // 차올라 글이 가려진다"**(2026-08-26 신고). 캐럿이 아래쪽(하단 터치)이면 bottom 마진만 쓰여서
  // 멀쩡한 것도 같은 이유다 — 신고가 "하단은 괜찮고 상단·중단만 이상하다"였던 게 정확히 이 모양이다.
  //
  // 그래서 숫자를 다시 찍지 않고 **실제 덮이는 높이를 재서 쓴다.** 패널 내용이 바뀌어도 따라간다.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [caretTopMargin, setCaretTopMargin] = useState(TOOLBAR_ONLY_TOP_MARGIN);
  const moreRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        link: false, // 아래 FaviconLink로 대체한다(파비콘 + 클릭 시 바로 열기)
        code: false,
        codeBlock: false,
      }),
      FaviconLink.configure({ autolink: true, openOnClick: true, linkOnPaste: true }),
      TemplateHeading.configure({ levels: [1, 2, 3] }),
      Placeholder.configure({ placeholder: placeholder ?? "내용을 입력하세요..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      FontSize,
      ...(enableTextColor ? [TextColor] : []),
    ],
    content: initialValue,
    immediatelyRender: false,
    editorProps: {
      // 캐럿을 보이게 스크롤할 때 위아래로 비워둘 여백 — ProseMirror가 원래 갖고 있는 knob이라
      // 우리가 좌표를 계산할 필요가 없다. 위쪽은 본문 위에 sticky로 떠 있는 서식툴바(실측 39px)
      // 높이만큼 비워야 캐럿이 그 아래에 깔리지 않는다. 툴바 높이를 바꾸면 여기도 같이 봐야 한다.
      //
      // 아래쪽은 작게 둔다. 한때 72였는데, 문서 끝 근처를 편집하면 캐럿 아래로 72px을 비우려다
      // 남은 내용이 그만큼 없어서 최대 스크롤로 클램프됐다 — "하단을 누르면 맨 끝까지 튀는" 증상의
      // 절반이 이것이었다. 키보드가 가린 높이는 --kb-inset padding이 이미 비워주므로(레이아웃이
      // 담당) 여기서 또 크게 잡을 이유가 없다.
      scrollMargin: { top: caretTopMargin, bottom: 24, left: 0, right: 0 },
      scrollThreshold: { top: caretTopMargin, bottom: 24, left: 0, right: 0 },
      attributes: { class: `rich-editor-content ${bodyClassName ?? ""}` },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          openLinkPopoverForSelection();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
    onSelectionUpdate() {
      // 이 훅은 키를 누를 때마다(캐럿이 움직일 때마다) 발사된다. 여기서 바로 setState를 하면
      // 툴바가 매 타자마다 다시 그려지고, 그 렌더에서 readCurrentFontSize가 getComputedStyle을
      // 호출해 강제 스타일 재계산까지 매 타자마다 일어난다 — 빠르게 치면 이게 미세한 렉으로 느껴진다.
      // 표시값이 100ms 늦게 갱신되는 건 눈에 안 보이므로, 입력이 잠깐 멈출 때만 갱신한다.
      scheduleSelectionSync();
    },
  });

  useImperativeHandle(ref, () => {
    // 삽입 로직 한 벌 — insertTextAtCursor(캐럿)과 insertAt(맨 위/맨 아래)이 같이 쓴다.
    const insertInto = (content: string, isHtml: boolean) => {
      if (!editor) return false;
      let ok: boolean;
      if (isHtml) {
        ok = editor.commands.insertContent(content);
      } else {
        const nodes = content.split(/\r?\n/).flatMap((line, i) => [
          ...(i === 0 ? [] : [{ type: "hardBreak" as const }]),
          ...(line ? [{ type: "text" as const, text: line }] : []),
        ]);
        if (nodes.length === 0) return false;
        ok = editor.commands.insertContent(nodes);
      }
      if (ok && !editor.isFocused) editor.commands.focus(undefined, { scrollIntoView: false });
      return ok;
    };
    return {
    // isHtml=false(드래그 선택한 평문)면 HTML로 파싱시키지 않는다.
    // insertContent에 문자열을 주면 Tiptap이 **HTML로 파싱**한다 - 그래서 전체저장(html)은 정상인데
    // 드래그 선택한 평문만 깨졌다: 문장에 '<'가 들어 있으면 태그로 먹히고, 여러 줄이면 개행이
    // 통째로 사라져 화면상 아무 일도 안 일어난 것처럼 보였다. 평문은 text 노드 + hardBreak로 넣는다.
    // 🔴 예전엔 `chain().focus().insertContent(...)`였다. undo/redo에서 이미 한 번 겪은 그 지뢰가
    // 여기 그대로 남아 있었다(CLAUDE.md 3절 "chain은 한 덩어리다 — 앞이 실패하면 뒤도 죽는다"):
    // 모바일에서 삽입 버튼을 탭하면 에디터가 먼저 blur되고, blur된 상태의 프로그래매틱 focus는
    // iOS에서 실패할 수 있다 — 그러면 insertContent까지 통째로 무효가 되어 **아무 일도 안 일어난다**.
    // 두세 번 눌러야 되던 이유가 이것이다. 게다가 focus() 기본값은 { scrollIntoView: true }라
    // 캐럿 노출 소유자가 하나 더 생긴다.
    // 문서 변경을 먼저 확정하고, 포커스는 그 뒤에 스크롤 없이 따로 시도한다.
    insertTextAtCursor(content: string, isHtml = false) {
      return insertInto(content, isHtml);
    },
    // 캐럿을 문서 맨 앞/맨 뒤로 옮기고 **같은** 삽입 로직을 태운다. 삽입 자체는 한 곳(insertInto)에만
    // 있어야 한다 — 평문 hardBreak 처리 같은 지뢰를 두 벌로 만들면 한쪽만 고쳐진다.
    // ⚠️ setTextSelection은 tiptap이 위치를 clamp하므로 0 / doc.content.size를 그대로 줘도 안전하다.
    // ⚠️ chain()으로 묶지 마라 — 앞이 실패하면 뒤도 통째로 죽는다(이 파일 위쪽 주석의 그 지뢰).
    insertAt(where: "start" | "end", content: string, isHtml = false) {
      if (!editor) return false;
      editor.commands.setTextSelection(where === "start" ? 0 : editor.state.doc.content.size);
      return insertInto(content, isHtml);
    },
    // 🔴 예전엔 `chain().focus().undo().run()`이었다. chain은 한 덩어리라 앞의 focus()가 실패하면
    // 뒤의 undo까지 통째로 무효가 된다 - 모바일에서 버튼을 탭하면 에디터가 먼저 blur되고, 그 상태의
    // 프로그래매틱 focus는 iOS에서 실패할 수 있다. 문서 변경을 **먼저** 확정하고 포커스는 그 다음에
    // 따로 시도한다(포커스가 실패해도 undo는 남는다). 반환값으로 성공 여부를 호출부에 넘겨
    // "눌렀는데 아무 일도 안 난다"가 침묵으로 끝나지 않게 한다.
    // 🔴🔴 focus()를 그냥 부르면 안 된다. 기본값이 { scrollIntoView: true }라서, 이 파일 아래쪽의
    // scrollIntoView(캐럿 노출의 **유일한** 소유자)와 둘이 스크롤을 다툰다 - 그러면 전체화면 편집에서
    // "스크롤이 막힌 것처럼" 느껴지는 그 증상이 그대로 재발한다(CLAUDE.md 3절 "캐럿 노출의 소유자는
    // 정확히 하나", "여기에 스크롤을 더 넣지 말 것"). 실제로 한 번 재발시켰다.
    // 포커스만 되돌리고 스크롤은 절대 건드리지 않는다. 버튼 쪽 onPointerDown preventDefault가
    // 포커스를 지켜주므로 대개 이 호출조차 필요 없지만, 키보드 조작 등으로 포커스가 빠진 경우를 위해 남긴다.
    // 🔴🔴 editor.commands.undo/redo를 쓰면 안 된다 — 그 명령 자체가 tr.scrollIntoView()를 붙인다.
    // 파일 상단 import 주석 참고. undoNoScroll/redoNoScroll은 같은 히스토리 플러그인의 같은 로직에
    // 스크롤만 뺀 변종이라 동작은 동일하다.
    undo() {
      if (!editor) return false;
      const ok = undoNoScroll(editor.state, editor.view.dispatch);
      if (ok && !editor.isFocused) editor.commands.focus(undefined, { scrollIntoView: false });
      return ok;
    },
    redo() {
      if (!editor) return false;
      const ok = redoNoScroll(editor.state, editor.view.dispatch);
      if (ok && !editor.isFocused) editor.commands.focus(undefined, { scrollIntoView: false });
      return ok;
    },
    getSelection() {
      if (!editor) return null;
      const { from, to } = editor.state.selection;
      return { from, to };
    },
    setSelection({ from, to }) {
      if (!editor) return;
      const max = editor.state.doc.content.size;
      editor.chain().focus().setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) }).run();
    },
    };
  }, [editor]);

  // 툴바의 크기 표시는 렌더 중에 computed style을 읽는다 — 그런데 첫 렌더에는 ProseMirror DOM이
  // 아직 문서에 붙지 않아 getComputedStyle이 빈 값을 주고, 그러면 임시값 16px이 그대로 굳어버린다
  // (본문은 18px인데 툴바만 16px로 남던 원인). 마운트 직후와 화면 폭이 바뀔 때(웹 18 ↔ 모바일 16
  // 분기가 넘어갈 때) 한 번씩 다시 그려서 실제 값으로 맞춘다.
  useEffect(() => {
    if (!editor) return;
    const resync = () => setSelectionTick((n) => n + 1);
    resync();
    window.addEventListener("resize", resync);
    return () => window.removeEventListener("resize", resync);
  }, [editor]);

  // 캐럿을 보이는 자리로 데려오는 유일한 지점.
  //
  // iOS는 원래 "화면 자체를 밀어서" 캐럿을 보이게 한다. 그런데 편집창이 position:fixed 전체화면
  // 이라 그렇게 밀리면 창이 통째로 화면 밖으로 나가버린다(실측: vvTop=278일 때 본문이 화면에
  // 47px만 남았다). 그래서 useViewportHeight에서 그 밀기를 되돌린다.
  //
  // 밀기를 되돌리면 캐럿 노출을 해줄 주체가 사라진다. 그 일을 여기서 내부 스크롤러로 한다.
  // 한때 같은 훅이 있었지만 그때는 iOS의 밀기와 중복으로 돌아서 오버슈트를 만들었다(탭한 자리
  // 보다 아래가 보이던 증상). 지금은 밀기가 취소되므로 중복이 아니라 유일한 주체다.
  //
  // resize가 멈춘 뒤에 한 번만 실행한다. 키보드가 열리는 동안 resize가 여러 번 오는데, 매번
  // 스크롤하면 아직 끝나지 않은 레이아웃을 기준으로 맞춰져 결과가 어긋난다. 애니메이션 길이를
  // 상수로 추측하지 않고 "이벤트가 멈추면"으로 판단한다.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv || !editor) return;
    let timer: number | null = null;
    // 캐럿을 보이는 밴드로 데려온다. 조건이 안 맞으면 아무것도 안 하고 false.
    const reveal = () => {
      if (!editor.isFocused) return false;
      // 🔴🔴 2026-08-28 — 모바일 메모 편집(`.memo-edit-page`)에서는 **우리가 캐럿을 옮기지 않는다.**
      //
      // 이 훅이 존재하는 이유는 바로 위 주석에 적혀 있다: "밀기를 되돌리면 캐럿 노출을 해줄 주체가
      // 사라진다. 그 일을 여기서 내부 스크롤러로 한다." 새 구조에서는 그 전제가 **둘 다** 없어졌다 —
      // 되돌리기를 하지 않고(useViewportHeight의 `inMemoEditPage` 가드), 내부 스크롤러도 없다.
      // 즉 캐럿 노출의 주체는 다시 iOS 하나이고, 여기서 또 부르면 **소유자가 둘**이 된다.
      // CLAUDE.md "캐럿 노출의 소유자는 정확히 하나"를 이 경로가 어기고 있었다.
      //
      // 증상: 손가락으로 아래로 굴리면 주소창이 접혔다 펴지며 `vv.resize`가 뜨고, 120ms 뒤
      // 이 `scrollIntoView()`가 돌아 **캐럿 자리로 되감는다**(실기기 2026-08-28: "내려갔다가
      // 다시 위로 튕김"). 옛 구조에서는 되감아도 내부 스크롤러 안이라 티가 안 났는데, 지금은
      // 문서가 스크롤러라 화면 전체가 튄다.
      //
      // 다른 편집 화면(먼슬리 Create·프로젝트 상세·확장 편집)은 여전히 fixed 껍데기 + 배경 잠금
      // 구조라 되돌리기가 살아 있고, 따라서 이 훅도 그대로 필요하다.
      if (document.querySelector(".memo-edit-page")) return false;
      // 방금 "맨 위로"를 눌렀으면 캐럿 자리로 되돌리지 않는다(위 SCROLL_TOP_GRACE_MS 주석).
      // (2026-08-30: 여기 있던 `__spScrollTrace.push`는 지웠다 — 그 배열을 그리는 코드가
      //  ViewportDebug에서 사라져 아무 데도 안 보이는 로그였다. Dashboard의 traceScrollTop 주석 참고.)
      if (performance.now() - lastScrollTopTapAt < SCROLL_TOP_GRACE_MS) return false;
      editor.commands.scrollIntoView();
      return true;
    };
    const settle = () => {
      // 💀💀 **여기서 즉시 `reveal()`을 부르지 마라. 2026-08-27에 넣었다가 같은 날 되돌렸다.**
      //
      // 근거는 그럴듯했다: 캐럿 노출이 "resize가 멈춘 뒤 120ms"에만 돌면 키보드 애니메이션이
      // 끝날 때까지 캐럿이 가려진 채라, iOS가 먼저 화면을 밀어버리고(vv.offsetTop > 0) 그 밀기는
      // 배경 스크롤 잠금(body{position:fixed}) 때문에 되돌릴 수 없다. 그래서 매 resize마다
      // 즉시 한 번 더 불러 "경주에서 이기게" 하려 했다.
      //
      // 결과는 **명백히 더 나빠졌다.** 사용자 신고: 상단 7~9줄에서만 나던 여백 이상이
      // **메모 전역**으로 번졌다. 이 훅의 원래 주석이 경고하던 그대로다 — 키보드가 열리는 동안
      // resize가 여러 번 오는데, 매번 스크롤하면 **아직 끝나지 않은 레이아웃**을 기준으로 맞춰져
      // 결과가 어긋난다. 애니메이션 중간값마다 한 번씩 어긋난 자리로 끌고 가니, 원래 한 구간에서만
      // 나던 증상이 모든 구간에서 나게 된다.
      //
      // 교훈: "iOS보다 먼저 움직인다"는 방향 자체가 틀렸다. 정확한 스크롤은 레이아웃이 끝난 뒤에만
      // 가능하고, 그 전에 움직이면 틀린 자리로 갈 뿐이다. iOS의 밀기를 막고 싶으면 스크롤 타이밍이
      // 아니라 **밀 이유를 없애는 쪽**(--kb-inset 스파이크 차단 등)으로 가야 한다.
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        reveal();
      }, 120);
    };
    vv.addEventListener("resize", settle);
    return () => {
      vv.removeEventListener("resize", settle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [editor]);

  // 위 caretTopMargin 주석 참고 — 툴바 + 지금 열려 있는 패널이 **실제로 덮는 높이**를 재서 넣는다.
  // 패널은 absolute라 툴바 rect에 안 잡히므로 패널 rect를 직접 봐야 한다.
  // 패널이 그려진 뒤 같은 프레임에 재야 하므로 useLayoutEffect다(useEffect면 한 프레임 늦어
  // 그 사이에 탭이 들어오면 옛 값으로 스크롤한다).
  useLayoutEffect(() => {
    const tb = toolbarRef.current;
    const scroller = tb?.closest(".textarea-row, .dialog-body-scroll") as HTMLElement | null;
    if (!tb || !scroller) return;
    const panel = tb.querySelector(".mobile-toolbar-panel");
    const coveredBottom = (panel ?? tb).getBoundingClientRect().bottom;
    const covered = coveredBottom - scroller.getBoundingClientRect().top;
    // 데스크톱은 이 툴바가 display:none이라 rect가 0이다 — 그때는 기존 값을 그대로 쓴다.
    const next = covered > 0
      ? Math.max(TOOLBAR_ONLY_TOP_MARGIN, Math.round(covered) + CARET_TOP_BREATHING)
      : TOOLBAR_ONLY_TOP_MARGIN;
    setCaretTopMargin((v) => (v === next ? v : next));
  }, [mobileGroup, mobileFontSizeOpen, colorOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setFontSizeOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // 링크 버튼은 토글이다 — 이미 열려 있으면 닫는다. 닫을 때 에디터 포커스를 되돌려준다
  // (툴바는 이제 포커스와 무관하게 항상 떠 있지만, 캐럿은 본문으로 돌려놔야 이어 쓸 수 있다).
  function openLinkPopoverForSelection() {
    if (!editor) return;
    if (linkPopover) {
      setLinkPopover(null);
      editor.chain().focus().run();
      return;
    }
    const existing = editor.getAttributes("link").href as string | undefined;
    // 커서 위치에 띄운다 — 예전엔 CSS가 본문 좌상단(top:40/left:0)이나 화면 중앙에 고정해서,
    // 커서가 어디 있든 항상 같은 자리에 떴다.
    const wrap = (editor.view.dom.closest(".rich-editor-body-wrap") ?? editor.view.dom) as HTMLElement;
    let top = 40;
    let left = 0;
    try {
      const caret = editor.view.coordsAtPos(editor.state.selection.from);
      const base = wrap.getBoundingClientRect();
      top = caret.bottom - base.top + 8;
      left = Math.max(0, Math.min(caret.left - base.left, Math.max(0, base.width - LINK_POPOVER_WIDTH)));
    } catch {
      /* 좌표를 못 구하면 기본 위치를 그대로 쓴다 */
    }
    setLinkPopover({ url: existing ?? "", hasLink: !!existing, top, left });
  }

  if (!editor) return null;

  function setParagraphStyle(level: ParaLevel) {
    // H1~H3의 크기는 .rich-editor-content h1{font-size:1.5em} 처럼 em으로 정해지는데, 글자에
    // font-size 마크(span style="font-size:16px")가 붙어 있으면 그 span이 이겨서 제목으로 바꿔도
    // 글씨가 안 커지고 위아래 여백만 바뀐 것처럼 보였다 — 제목으로 갈 때는 크기 마크를 걷어낸다.
    if (level === 0) editor!.chain().focus().setParagraph().run();
    else editor!.chain().focus().unsetFontSize().toggleHeading({ level }).run();
  }

  // hideToolbar는 "데스크톱 상단 서식툴바를 감춘다"는 뜻이다 — 예전엔 여기서 통째로 early return을 해서
  // 하단 고정 .mobile-rich-toolbar까지 같이 사라졌고, 그 결과 모바일 메모 편집에 서식 도구가 아예 없었다.
  return (
    <div className="rich-editor">
      {hideToolbar && toolbarExtra && <div className="rich-toolbar-minimal">{toolbarExtra}</div>}
      {!hideToolbar && (
      <div className="rich-toolbar desktop-rich-toolbar">
        {/* 그룹 A — 문단/제목: 드롭다운 없이 항상 노출, 버튼 자체 글자 크기로 위계를 보여준다 */}
        {PARAGRAPH_STYLES.map((p) => {
          const isActive = p.level === 0 ? editor.isActive("paragraph") : editor.isActive("heading", { level: p.level });
          return (
            <button
              key={p.label} type="button"
              className={`toolbar-btn ${p.styleClass} ${isActive ? "active" : ""}`}
              aria-pressed={isActive} title={p.label}
              onClick={() => setParagraphStyle(p.level)}
            >
              {p.label}
            </button>
          );
        })}
        <span className="toolbar-divider" />
        {/* 글씨 크기 — H3 오른쪽, B/I/U 왼쪽. 프리셋만 제공(자유 입력 없음). 표시값은 readCurrentFontSize가
            실제 렌더 크기를 읽어 만들므로 선택 영역을 바꾸면 그 자리 크기가 그대로 뜬다. */}
        <div className="toolbar-dropdown toolbar-font-size" ref={fontSizeRef}>
          <button
            type="button" className="toolbar-btn toolbar-dropdown-trigger" title="글씨 크기"
            onClick={() => setFontSizeOpen((v) => !v)}
          >
            {readCurrentFontSize(editor)}px ▾
          </button>
          {fontSizeOpen && (
            <div className="toolbar-menu">
              {FONT_SIZES.map((size) => (
                <button
                  key={size} type="button"
                  className={`toolbar-menu-item${readCurrentFontSize(editor) === size ? " active" : ""}`}
                  aria-selected={readCurrentFontSize(editor) === size}
                  style={{ fontSize: size }}
                  onClick={() => {
                    editor.chain().focus().setFontSize(`${size}px`).run();
                    setFontSizeOpen(false);
                  }}
                >
                  {size}px
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="toolbar-divider" />
        {/* 그룹 B — 기본 강조 */}
        <button type="button" className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`} aria-pressed={editor.isActive("bold")} title="굵게" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`} aria-pressed={editor.isActive("italic")} title="기울임" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("underline") ? "active" : ""}`} aria-pressed={editor.isActive("underline")} title="밑줄" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
        {enableTextColor && (
          <div className="toolbar-dropdown" ref={colorRef}>
            <button
              type="button" className="toolbar-btn toolbar-dropdown-trigger" title="글자색"
              style={{ color: (editor.getAttributes("textColor").color as string | undefined) ?? undefined }}
              onClick={() => setColorOpen((v) => !v)}
            >
              A ▾
            </button>
            {colorOpen && (
              <div className="toolbar-menu color-toolbar-menu">
                <button
                  type="button" className="toolbar-menu-item"
                  onClick={() => { editor.chain().focus().unsetTextColor().run(); setColorOpen(false); }}
                >
                  기본색
                </button>
                <div className="color-swatch-grid">
                  {TEXT_COLORS.map((hex) => (
                    <button
                      key={hex} type="button" className="color-swatch-btn" title={hex} style={{ background: hex }}
                      onClick={() => { editor.chain().focus().setTextColor(hex).run(); setColorOpen(false); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <span className="toolbar-divider" />
        {/* 그룹 C — 목록: 아이콘 라이브러리(lucide-react, 이미 설치됨)로 통일. 들여쓰기/내어쓰기는 제거됨 */}
        <button type="button" className={`toolbar-btn ${editor.isActive("bulletList") ? "active" : ""}`} aria-pressed={editor.isActive("bulletList")} aria-label="글머리 목록" title="글머리 목록" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} strokeWidth={1.8} /></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("orderedList") ? "active" : ""}`} aria-pressed={editor.isActive("orderedList")} aria-label="번호 목록" title="번호 목록" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} strokeWidth={1.8} /></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("taskList") ? "active" : ""}`} aria-pressed={editor.isActive("taskList")} aria-label="체크리스트" title="체크리스트" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={17} strokeWidth={1.8} /></button>
        <span className="toolbar-divider" />
        {/* 그룹 D — 삽입 */}
        <button type="button" data-link-toggle className={`toolbar-btn ${editor.isActive("link") ? "active" : ""}`} aria-pressed={editor.isActive("link")} title="링크" onClick={openLinkPopoverForSelection}>🔗</button>
        <EmojiPopover
          triggerLabel="😊" triggerTitle="이모지 삽입"
          onSelect={(e) => editor.chain().focus().insertContent(e).run()}
        />
        <span className="toolbar-divider" />
        {/* 그룹 E — More: 표 삽입은 제거되었다 */}
        <div className="toolbar-dropdown" ref={moreRef}>
          <button type="button" className="toolbar-btn" title="더보기" onClick={() => setMoreOpen((v) => !v)}>⋯</button>
          {moreOpen && (
            <div className="toolbar-menu">
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().toggleStrike().run(); setMoreOpen(false); }}><Strikethrough size={15} /> 취소선</button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().toggleBlockquote().run(); setMoreOpen(false); }}><Quote size={15} /> 인용문</button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().setHorizontalRule().run(); setMoreOpen(false); }}><Minus size={15} /> 구분선</button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().unsetAllMarks().clearNodes().run(); setMoreOpen(false); }}><Eraser size={15} /> 서식 지우기</button>
            </div>
          )}
        </div>
        {toolbarExtra && <span className="toolbar-extra">{toolbarExtra}</span>}
      </div>
      )}

      {/* 본문 위에 sticky로 붙는다(dashboard.css .mobile-rich-toolbar) — 예전엔 키보드 높이를
          visualViewport로 재서 bottom에 넣었는데, 그 자리가 브라우저 autofill 액세서리 바와
          정확히 겹쳤다. 위로 올리면서 그 계산 자체가 필요 없어졌다. */}
      <div
        ref={toolbarRef}
        // 레이아웃 불변식 검사(layout-invariants.ts)가 이 값을 읽는다 — 거기서 다시 추측하지
        // 않고 **에디터가 실제로 쓰는 값**을 그대로 비교하기 위해서다.
        data-caret-top-margin={caretTopMargin}
        className="mobile-rich-toolbar open"
        onMouseDown={(e) => e.preventDefault()}
      >
        {mobileGroup === "text" && (
          <div className="mobile-toolbar-panel mobile-toolbar-panel-text">
            {PARAGRAPH_STYLES.map((p) => {
              const active = p.level === 0 ? editor.isActive("paragraph") : editor.isActive("heading", { level: p.level });
              return <button key={`mobile-${p.label}`} type="button" className={active ? "active" : ""} onClick={() => setParagraphStyle(p.level)}>{p.label}</button>;
            })}
            <div className="mobile-font-size-picker">
              <button
                type="button"
                className={`mobile-font-size-trigger${mobileFontSizeOpen ? " active" : ""}`}
                aria-label="글씨 크기"
                aria-expanded={mobileFontSizeOpen}
                onClick={() => setMobileFontSizeOpen((open) => !open)}
              >
                {readCurrentFontSize(editor)}px <span aria-hidden="true">⌄</span>
              </button>
              {mobileFontSizeOpen && (
                <div className="mobile-font-size-menu" role="listbox" aria-label="글씨 크기 선택">
                  {FONT_SIZES.map((size) => {
                    const current = String(readCurrentFontSize(editor));
                    return (
                      <button
                        key={`mobile-size-${size}`}
                        type="button"
                        role="option"
                        aria-selected={current === String(size)}
                        className={current === String(size) ? "active" : ""}
                        onClick={() => {
                          editor.chain().focus().setFontSize(`${size}px`).run();
                          setMobileFontSizeOpen(false);
                        }}
                      >
                        {size}px
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" className={editor.isActive("bold") ? "active" : ""} aria-label="굵게" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
            <button type="button" className={editor.isActive("italic") ? "active" : ""} aria-label="기울임" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
            <button type="button" className={editor.isActive("underline") ? "active" : ""} aria-label="밑줄" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
            {enableTextColor && (
              <button type="button" className={colorOpen ? "active" : ""} onClick={() => setColorOpen((v) => !v)}>A</button>
            )}
            {enableTextColor && colorOpen && (
              <div className="mobile-color-panel">
                <button type="button" className="mobile-color-reset" onClick={() => { editor.chain().focus().unsetTextColor().run(); setColorOpen(false); }}>기본</button>
                {TEXT_COLORS.map((hex) => <button key={`mobile-${hex}`} type="button" className="mobile-color-dot" style={{ background: hex }} onClick={() => { editor.chain().focus().setTextColor(hex).run(); setColorOpen(false); }} />)}
              </div>
            )}
          </div>
        )}
        {mobileGroup === "memoColor" && memoColor && onMemoColorChange && (
          <div className="mobile-toolbar-panel mobile-toolbar-panel-memo-color" aria-label="메모 색상 선택">
            {MEMO_COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                type="button"
                className={memoColor === color.value ? "active" : ""}
                aria-label={`${color.label} 메모지`}
                aria-pressed={memoColor === color.value}
                onClick={() => onMemoColorChange(color.value)}
              >
                <span className="mobile-memo-color-dot" style={{ background: color.hex }} />
              </button>
            ))}
          </div>
        )}
        {mobileGroup === "more" && (
          <div className="mobile-toolbar-panel mobile-toolbar-panel-more">
            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /> 글머리</button>
            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /> 번호</button>
            <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo size={16} /> 체크</button>
            <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /> 취소선</button>
            <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /> 인용문</button>
            <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={15} /> 구분선</button>
            <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={15} /> 서식 지우기</button>
          </div>
        )}
        <div className={`mobile-toolbar-main${memoColor && onMemoColorChange ? " has-memo-color" : ""}`}>
          <button type="button" className={mobileGroup === "text" ? "active" : ""} aria-label="텍스트 서식" onClick={() => setMobileGroup((v) => v === "text" ? null : "text")}>T</button>
          {memoColor && onMemoColorChange && (
            <button type="button" className={mobileGroup === "memoColor" ? "active" : ""} aria-label="메모 색상" onClick={() => setMobileGroup((v) => v === "memoColor" ? null : "memoColor")}>
              <span className="mobile-memo-color-current" style={{ background: MEMO_COLOR_OPTIONS.find((color) => color.value === memoColor)?.hex }} />
            </button>
          )}
          <button type="button" data-link-toggle className={editor.isActive("link") ? "active" : ""} aria-label="링크" onClick={openLinkPopoverForSelection}>🔗</button>
          <EmojiPopover triggerLabel="😊" triggerClassName="mobile-toolbar-emoji" triggerTitle="이모지 삽입" onSelect={(emoji) => editor.chain().focus().insertContent(emoji).run()} />
          <button type="button" className={mobileGroup === "more" ? "active" : ""} aria-label="더 많은 서식" onClick={() => setMobileGroup((v) => v === "more" ? null : "more")}>…</button>
        </div>
      </div>

      <div className="rich-editor-body-wrap">
        <EditorContent editor={editor} />
        {linkPopover && (
          <LinkPopover
            open
            anchor={{ top: linkPopover.top, left: linkPopover.left }}
            initialUrl={linkPopover.url}
            hasExistingLink={linkPopover.hasLink}
            // setLink는 "선택된 텍스트에 링크 mark를 씌우는" 명령이라, 커서만 있고 선택이 없으면
            // 폭 0인 범위에 mark를 걸고 끝나 화면에 아무 변화가 없다 — 🔗를 누르고 주소를 붙여넣어도
            // 아무 일도 안 일어나던 원인이다(선택 없이 누르는 게 오히려 일반적인 사용 흐름이다).
            // 선택이 비어 있으면 주소를 텍스트로 넣고 거기에 링크를 건다.
            onApply={(url) => {
              if (editor.state.selection.empty) {
                editor.chain().focus()
                  .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] })
                  .run();
                return;
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }}
            onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
            onClose={() => setLinkPopover(null)}
          />
        )}
      </div>
    </div>
  );
});
