"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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
}>(function MemoRichEditor({ initialValue, onChange, placeholder, bodyClassName, toolbarExtra }, ref) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [linkPopover, setLinkPopover] = useState<{ url: string; hasLink: boolean } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

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
        {/* 그룹 B — 기본 강조 */}
        <button type="button" className={`toolbar-btn ${editor.isActive("bold") ? "active" : ""}`} aria-pressed={editor.isActive("bold")} title="굵게" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("italic") ? "active" : ""}`} aria-pressed={editor.isActive("italic")} title="기울임" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" className={`toolbar-btn ${editor.isActive("underline") ? "active" : ""}`} aria-pressed={editor.isActive("underline")} title="밑줄" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
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

      <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty}>
        <div className="bubble-menu">
          <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
          <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button type="button" className={editor.isActive("link") ? "active" : ""} onClick={openLinkPopoverForSelection}>🔗</button>
        </div>
      </BubbleMenu>

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
