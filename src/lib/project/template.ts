// 프로젝트 "기본 템플릿" — 별도 DB 필드가 아니라 그냥 본문 content에 들어가는 편집 가능한 starter 구조다.
// 핵심 기능은 Monthly Memo가 이미 쓰는 Tiptap taskList 마크업을 그대로 재사용한다(별도 checklist 시스템 없음).
// 4개 제목에만 강조색을 건다 — h3 자체가 아니라 이 class로 스코프해서 자유 형식에서 사용자가
// 직접 넣는 H3에는 색이 묻지 않는다. Heading 노드에 class attr을 유지시키는 쪽은 MemoRichEditor 쪽 담당.
const TEMPLATE_HEADING_CLASS = "project-template-heading";
export const PROJECT_TEMPLATE_HTML =
  `<h3 class="${TEMPLATE_HEADING_CLASS}">1. 프로젝트 목적</h3><p>프로젝트를 왜 만들려고 하는지 작성해보세요.</p>` +
  `<h3 class="${TEMPLATE_HEADING_CLASS}">2. 핵심 기능</h3>` +
  '<ul data-type="taskList">' +
  '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>핵심 기능을 입력하세요</p></div></li>'.repeat(3) +
  "</ul>" +
  `<h3 class="${TEMPLATE_HEADING_CLASS}">3. 대상 사용자</h3><p>누구를 위한 프로젝트인지 작성해보세요.</p>` +
  `<h3 class="${TEMPLATE_HEADING_CLASS}">4. 상세 내용</h3><p>프로젝트의 주요 내용, 구현 아이디어, 차별점, 참고사항 등을 자유롭게 작성해보세요.</p>`;

export const PROJECT_BODY_PLACEHOLDER = "프로젝트 목적, 핵심기능, 구현아이디어 등을 자유롭게 정리해보세요.";

// VIEW 화면에서 핵심 기능 체크만 inline으로 토글한다 — 본문 텍스트 편집은 [수정]으로만 가능하다.
// Tiptap이 만든 마크업을 그대로 뒤집으므로 저장 형식이 편집 화면과 완전히 같다.
export function toggleTaskItemInHtml(html: string, index: number): string {
  let seen = -1;
  return html.replace(/data-checked="(true|false)"/g, (match, value) => {
    seen += 1;
    if (seen !== index) return match;
    return `data-checked="${value === "true" ? "false" : "true"}"`;
  });
}
