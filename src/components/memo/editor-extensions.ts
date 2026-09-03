// Monthly MEMO / 프로젝트 리치 텍스트 에디터의 Tiptap 확장과 상수.
//
// MemoRichEditor.tsx에서 **그대로 옮겨온 것이다**(docs/refactor-plan.md PHASE 0 ⓐ).
// 컴포넌트 상태를 하나도 참조하지 않아 결합이 0인 구역이라 가장 먼저 뺐다.
//
// 🔴 여기 없는 것(MemoRichEditor.tsx에 남겨둔 것)과 그 이유:
//   - `MemoRichEditorHandle` 타입 — 그 컴포넌트의 공개 handle이다
//   - `TOOLBAR_ONLY_TOP_MARGIN` / `CARET_TOP_BREATHING` / `SCROLL_TOP_GRACE_MS` /
//     `noteScrollTopTap` — **캐럿 노출 effect의 소유물이다.** 계획서 3순위 표가
//     그 100줄을 "건드리지 마라"로 못박았다(3주짜리 스크롤 버그가 거기서 났다).

import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";

export type ParaLevel = 0 | 1 | 2 | 3;
// 메모 툴바 — [H1][H2][H3] 버튼을 항상 노출한다.
// "본문" 버튼은 제거했다 — 기본 상태가 곧 본문이라 버튼이 하는 일이 없었고, 툴바 맨 앞자리만
// 차지했다. H1부터 시작해 왼쪽으로 당겨진다. 본문으로 되돌리려면 활성된 H1~H3를 다시 누르면 된다
// (toggleHeading이 토글이라 그대로 문단으로 돌아온다).
export const PARAGRAPH_STYLES: { label: string; level: ParaLevel; styleClass: string }[] = [
  { label: "H1", level: 1, styleClass: "text-style-h1" },
  { label: "H2", level: 2, styleClass: "text-style-h2" },
  { label: "H3", level: 3, styleClass: "text-style-h3" },
];

// 글씨 크기 — 자유 입력이 아니라 프리셋만 제공. "마크 없음"이 곧 기본 크기이고, 그 실제 값은
// CSS의 --memo-base-font(웹 18px / 모바일 16px)가 정한다.
export const FONT_SIZES = [12, 13, 14, 16, 18, 20, 22, 24, 28, 32] as const;
// .link-popover의 CSS 폭 — 커서 위치에 띄울 때 오른쪽으로 넘치지 않게 clamp하는 데 쓴다.
export const LINK_POPOVER_WIDTH = 260;
// DOM을 아직 못 읽는 최초 렌더에서만 쓰는 임시값 — 화면에 보이는 크기의 근거는 항상 computed style이다.
const DEFAULT_FONT_SIZE = 16;

// 툴바에 표시할 "현재 글씨 크기". 마크가 있으면 그 값, 없으면 커서가 놓인 실제 DOM의 computed
// font-size를 읽는다. 예전에는 마크가 없으면 무조건 상수 16을 보여줬는데, 본문 기본 크기는 CSS가
// 따로 정하고 있어서(웹 18px) "본문을 누르면 툴바가 16으로 바뀌는" 불일치가 생겼다. 제목(H1~H3,
// em 기준)에 커서를 둔 경우까지 한 번에 맞는 값이 나온다.
export function readCurrentFontSize(editor: Editor | null): number {
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
export const FontSize = Mark.create({
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
export const TEXT_COLORS = [
  "#6D58ED", "#FF4040", "#FF6666", "#FFC0CB", "#C6E2FF",
  "#40E0D0", "#2ACAEA", "#FFF68F", "#FFD700", "#CCCCFF",
] as const;
export const TextColor = Mark.create({
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
export const FaviconLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === "string" ? HTMLAttributes.href : "";
    return ["a", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, faviconStyle(href)), 0];
  },
});

// 프로젝트 기본 템플릿의 4개 제목(class="project-template-heading")만 강조색을 유지해야 한다 —
// 기본 Heading 노드는 class attr을 스키마에 안 갖고 있어서 그냥 두면 저장/재파싱 때마다 사라진다.
export const TemplateHeading = Heading.extend({
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
