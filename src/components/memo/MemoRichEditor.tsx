"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Eraser, List, ListOrdered, ListTodo, Minus, Quote, Strikethrough } from "lucide-react";
import { EmojiPopover } from "./EmojiPopover";
import { LinkPopover } from "./LinkPopover";
import type { MemoColor } from "@/lib/memo/types";

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
  insertTextAtCursor: (text: string) => void;
  undo: () => void;
  redo: () => void;
  // Quick Editor ↔ 확장(bodyEditor) 전환처럼 에디터 인스턴스 자체가 다시 마운트되는 화면 전환에서
  // caret 위치를 옮겨 심기 위한 용도 — ProseMirror의 위치 정수(from/to)를 그대로 주고받는다.
  getSelection: () => { from: number; to: number } | null;
  setSelection: (range: { from: number; to: number }) => void;
};

// 모바일 하단 툴바 — 포스트잇 색상 스위처(메모 색상 전환)에 쓰는 팔레트. 값은 postit 색 클래스와 맞춘다.
const MEMO_COLORS: { value: MemoColor; hex: string; label: string }[] = [
  { value: "yellow", hex: "#fbe9b8", label: "노랑" },
  { value: "pink", hex: "#ffd6ea", label: "분홍" },
  { value: "green", hex: "#d3ecc9", label: "초록" },
  { value: "blue", hex: "#c9deff", label: "파랑" },
  { value: "purple", hex: "#ddd0ff", label: "보라" },
  { value: "white", hex: "#f6f6f6", label: "흰색" },
  { value: "black", hex: "#17171a", label: "검정" },
  { value: "darkgray", hex: "#3a3a40", label: "진회색" },
];

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
  const [editorFocused, setEditorFocused] = useState(false);
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
    onFocus() {
      setEditorFocused(true);
    },
    onBlur() {
      window.setTimeout(() => setEditorFocused(false), 120);
    },
  });

  useImperativeHandle(ref, () => ({
    insertTextAtCursor(text: string) {
      editor?.chain().focus().insertContent(text).run();
    },
    undo() {
      editor?.chain().focus().undo().run();
    },
    redo() {
      editor?.chain().focus().redo().run();
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
  }), [editor]);

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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setFontSizeOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // 링크 버튼은 토글이다 — 이미 열려 있으면 닫는다. 닫을 때 에디터 포커스를 되돌려줘야
  // 하단 서식툴바가 (editorFocused 조건으로 열려 있으므로) 같이 사라지지 않는다.
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
        className={`mobile-rich-toolbar${editorFocused || mobileGroup || linkPopover ? " open" : ""}`}
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
            {MEMO_COLORS.map((color) => (
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
              <span className="mobile-memo-color-current" style={{ background: MEMO_COLORS.find((color) => color.value === memoColor)?.hex }} />
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
