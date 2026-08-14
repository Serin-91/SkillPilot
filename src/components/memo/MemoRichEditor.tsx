"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { List, ListOrdered, ListTodo } from "lucide-react";
import { EmojiPopover } from "./EmojiPopover";
import { LinkPopover } from "./LinkPopover";

type ParaLevel = 0 | 1 | 2 | 3;
// 메모 툴바 지침 1~3절 — "본문 ▼" 드롭다운 제거, [본문][H1][H2][H3] 4개 버튼을 항상 노출한다.
// 라벨은 지침의 최종 툴바 구조를 그대로 따른다("본문"만 개발 용어를 피하고, H1/H2/H3는 그대로 노출).
const PARAGRAPH_STYLES: { label: string; level: ParaLevel; styleClass: string }[] = [
  { label: "본문", level: 0, styleClass: "text-style-body" },
  { label: "H1", level: 1, styleClass: "text-style-h1" },
  { label: "H2", level: 2, styleClass: "text-style-h2" },
  { label: "H3", level: 3, styleClass: "text-style-h3" },
];

// 글씨 크기 — 자유 입력이 아니라 프리셋만 제공. 기본 본문은 16px(마크 없음)로 취급한다.
const FONT_SIZES = [12, 13, 14, 16, 18, 20, 22, 24, 28, 32] as const;
const DEFAULT_FONT_SIZE = 16;

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
};

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
}>(function MemoRichEditor({ initialValue, onChange, placeholder, bodyClassName, toolbarExtra, hideToolbar, enableTextColor }, ref) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkPopover, setLinkPopover] = useState<{ url: string; hasLink: boolean } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        link: { autolink: true, openOnClick: false, linkOnPaste: true },
        code: false,
        codeBlock: false,
      }),
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
  });

  useImperativeHandle(ref, () => ({
    insertTextAtCursor(text: string) {
      editor?.chain().focus().insertContent(text).run();
    },
  }), [editor]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setFontSizeOpen(false);
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function openLinkPopoverForSelection() {
    if (!editor) return;
    const existing = editor.getAttributes("link").href as string | undefined;
    setLinkPopover({ url: existing ?? "", hasLink: !!existing });
  }

  if (!editor) return null;

  function setParagraphStyle(level: ParaLevel) {
    if (level === 0) editor!.chain().focus().setParagraph().run();
    else editor!.chain().focus().toggleHeading({ level }).run();
  }

  if (hideToolbar) {
    return (
      <div className="rich-editor">
        {toolbarExtra && <div className="rich-toolbar-minimal">{toolbarExtra}</div>}
        <div className="rich-editor-body-wrap">
          <EditorContent editor={editor} />
          {linkPopover && (
            <LinkPopover
              open
              initialUrl={linkPopover.url}
              hasExistingLink={linkPopover.hasLink}
              onApply={(url) => editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()}
              onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
              onClose={() => setLinkPopover(null)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
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
        {/* 글씨 크기 — H3 오른쪽, B/I/U 왼쪽. 프리셋만 제공(자유 입력 없음), 기본 16px은 마크 없음으로 취급 */}
        <div className="toolbar-dropdown" ref={fontSizeRef}>
          <button
            type="button" className="toolbar-btn toolbar-dropdown-trigger" title="글씨 크기"
            onClick={() => setFontSizeOpen((v) => !v)}
          >
            {(editor.getAttributes("fontSize").size as string | undefined)?.replace("px", "") ?? DEFAULT_FONT_SIZE}px ▾
          </button>
          {fontSizeOpen && (
            <div className="toolbar-menu">
              {FONT_SIZES.map((size) => (
                <button
                  key={size} type="button" className="toolbar-menu-item" style={{ fontSize: size }}
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
        <button type="button" className={`toolbar-btn ${editor.isActive("link") ? "active" : ""}`} aria-pressed={editor.isActive("link")} title="링크" onClick={openLinkPopoverForSelection}>🔗</button>
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
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().toggleStrike().run(); setMoreOpen(false); }}><s>취소선</s></button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().toggleBlockquote().run(); setMoreOpen(false); }}>| 인용문</button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().setHorizontalRule().run(); setMoreOpen(false); }}>― 구분선</button>
              <button type="button" className="toolbar-menu-item" onClick={() => { editor.chain().focus().unsetAllMarks().clearNodes().run(); setMoreOpen(false); }}>🧹 서식 지우기</button>
            </div>
          )}
        </div>
        {toolbarExtra && <span className="toolbar-extra">{toolbarExtra}</span>}
      </div>

      <div className="rich-editor-body-wrap">
        <EditorContent editor={editor} />
        {linkPopover && (
          <LinkPopover
            open
            initialUrl={linkPopover.url}
            hasExistingLink={linkPopover.hasLink}
            onApply={(url) => editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()}
            onRemove={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
            onClose={() => setLinkPopover(null)}
          />
        )}
      </div>
    </div>
  );
});
