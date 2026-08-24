import type { ContentFormat, SourceType } from "./types";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 기존 textarea에 쌓인 평문(줄바꿈만 있는 텍스트)을 Tiptap이 읽을 수 있는 문단 HTML로 변환한다.
// 빈 줄도 <p></p>로 남겨서 원래 textarea에서 보이던 줄 간격을 그대로 유지한다.
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  return text.split("\n").map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join("");
}

// 37절 — 상세→간단 전환 확인 팝업 노출 여부 판단용. plainTextToHtml은 <p>/<br>만 만들어내므로
// 그 외 태그가 하나라도 있으면 "실제로 서식이 들어간" 상태로 본다.
export function hasRichFormatting(html: string): boolean {
  return /<(h[1-3]|strong|b|em|i|u|s|del|ul|ol|li|blockquote|hr|pre|code|a)\b/i.test(html);
}

// 검색·카드 미리보기용 — 리치 HTML에서 태그를 걷어내고 줄바꿈만 살린 순수 텍스트를 만든다.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(p|div|h[1-3]|li|blockquote|tr)[^>]*>/gi, "")
    .replace(/<\/(p|div|h[1-3]|li|blockquote|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n").trim();
}

// 메모 열람/편집 시 실제로 에디터·렌더러에 넣을 HTML — 기존 평문 메모도 그대로 이 함수를 거친다.
export function toEditableHtml(content: string | null, format: ContentFormat): string {
  if (!content) return "";
  return format === "rich_html" ? content : plainTextToHtml(content);
}

// 6~10절 뉴스/채용공고 → "새 메모 생성" 시 초기 본문(구분선 + 소제목 + 인용문 + 출처)
export function sourceBlockHtml(sourceType: SourceType, sourceTitle: string, sourceUrl: string, selectedText: string): string {
  const heading = sourceType === "news" ? "뉴스에서 추가" : sourceType === "job" ? "채용공고에서 추가" : "AI Trend Briefing에서 추가";
  return (
    "<hr>" +
    `<h3>${escapeHtml(heading)}</h3>` +
    `<blockquote><p>${escapeHtml(selectedText)}</p></blockquote>` +
    `<p>출처: ${escapeHtml(sourceTitle)}${sourceUrl ? ` · <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">원문</a>` : ""}</p>`
  );
}

function bulletGroupsHtml(groups: { heading: string | null; bullets: string[] }[]): string {
  return groups
    .map((g) => {
      const heading = g.heading ? `<p><strong>${escapeHtml(g.heading)}</strong></p>` : "";
      const bullets = g.bullets.length ? `<ul>${g.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "";
      return heading + bullets;
    })
    .join("");
}

// 뉴스 "전체 저장" — 문장 하나만 담는 sourceBlockHtml과는 다른 헤딩(📰)을 써서 구분되게 한다
export function newsFullBlockHtml(
  sourceTitle: string, sourceUrl: string, summary: string, reason: string, tags: string[]
): string {
  return (
    "<hr>" +
    `<h3>📰 뉴스 전체 저장 — ${escapeHtml(sourceTitle)}</h3>` +
    (summary ? `<p>${escapeHtml(summary)}</p>` : "") +
    (reason ? `<blockquote><p>✨ Why it matters — ${escapeHtml(reason)}</p></blockquote>` : "") +
    (tags.length ? `<p><strong>관련 키워드</strong></p><ul>${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "") +
    (sourceUrl ? `<p>출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">원문 보기</a></p>` : "")
  );
}

// AI Trend Briefing "전체 저장" — 업계영향/도구서비스/개발자동향은 본문 문단, 실무적용은 목록으로 저장한다
export function trendFullBlockHtml(
  label: string, title: string | null, body: string, bullets: string[] | null,
  source: string | null, url: string | null
): string {
  return (
    "<hr>" +
    `<h3>📊 AI Trend Briefing 전체 저장 — ${escapeHtml(label)}</h3>` +
    (title ? `<p><strong>${escapeHtml(title)}</strong></p>` : "") +
    (body ? `<p>${escapeHtml(body)}</p>` : "") +
    (bullets && bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "") +
    (source || url
      ? `<p>출처: ${source ? escapeHtml(source) : ""}${url ? `${source ? " · " : ""}<a href="${escapeHtml(url)}" target="_blank" rel="noopener">원문 보기</a>` : ""}</p>`
      : "")
  );
}

// 채용공고 "전체 저장" — 주요업무/자격요건/우대사항을 카테고리별 소제목+목록으로 그대로 옮긴다
export function jobFullBlockHtml(
  title: string, company: string, sourceSite: string, career: string, deadline: string, sourceUrl: string,
  categories: { label: string; groups: { heading: string | null; bullets: string[] }[] }[]
): string {
  const categoriesHtml = categories
    .filter((c) => c.groups.length > 0)
    .map((c) => `<h4>${escapeHtml(c.label)}</h4>${bulletGroupsHtml(c.groups)}`)
    .join("");
  return (
    "<hr>" +
    `<h3>💼 채용공고 전체 저장 — ${escapeHtml(title)}</h3>` +
    `<p><strong>${escapeHtml(company)}</strong>${sourceSite ? ` · ${escapeHtml(sourceSite)}` : ""} · ${escapeHtml(career)} · 마감 ${escapeHtml(deadline)}</p>` +
    categoriesHtml +
    (sourceUrl ? `<p>출처: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">원문 보기</a></p>` : "")
  );
}

// Key Notes 카드 미리보기 본문 — 리치 HTML을 평문으로 납작하게 만드는 비용을 본문 단위로 캐시한다.
// 이게 없으면 드래그로 순서가 바뀔 때마다(상태 갱신 → Dashboard 전체 리렌더) 열려 있는 카드 전부의
// 본문을 처음부터 다시 변환한다. 실측(2026-08-24): 50KB 본문 20장 = 렌더 1회당 약 16ms가 순수 낭비.
// 캐시 키는 id가 아니라 content다 — id로 잡으면 메모를 수정한 뒤에도 옛 미리보기가 남는다.
const previewCache = new Map<string, string>();
export const MEMO_PREVIEW_MAX = 400;
export function memoPreview(m: { content: string | null; content_format: ContentFormat }): string {
  const raw = m.content ?? "";
  if (m.content_format !== "rich_html") return raw;
  const hit = previewCache.get(raw);
  if (hit !== undefined) return hit;
  const text = htmlToPlainText(raw);
  // 카드에 실제로 보이는 건 몇 줄뿐이다(.postit-body가 -webkit-line-clamp로 자른다) — 캐시가 본문
  // 전체를 또 한 벌 들고 있을 이유가 없다.
  const preview = text.length > MEMO_PREVIEW_MAX ? text.slice(0, MEMO_PREVIEW_MAX) : text;
  if (previewCache.size > 300) previewCache.clear(); // 무한 증가 방지 (세션 내 캐시라 통째로 버려도 안전)
  previewCache.set(raw, preview);
  return preview;
}
