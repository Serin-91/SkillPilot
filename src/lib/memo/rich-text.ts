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

// 37절 — "이 본문에 실제로 서식이 들어 있나". plainTextToHtml은 <p>/<br>만 만들어내므로
// **그 외 태그가 하나라도 있으면** 서식이 있는 것으로 본다.
//
// 🔴🔴 예전엔 서식 태그를 **나열**했다(h1~3, strong, b, em, ... a). 그 목록에 `span`이 빠져 있었고,
// 서식툴바의 **글씨 크기·글자색은 정확히 `<span style="font-size:16px">` / `<span style="color:…">`**를
// 만든다(MemoRichEditor의 FontSize/TextColor Mark가 `["span", …]`로 렌더). 그래서 그 둘만 쓴 메모가
// "서식 없음"으로 판정됐고, **본문이 실제로 깨졌다**(2026-08-26 사용자 신고 "메뉴 선택한 채로 수정
// 들어가면 글 내용이 반쯤 날아간다"):
//   ① contentFormatFor가 `plain`으로 저장 → 내용은 HTML인데 포맷은 plain
//   ② openQuickEdit의 방어선(`hasRichFormatting`)도 같이 뚫려 Quick Edit로 열림
//   ③ loadMemoIntoForm이 htmlToPlainText로 납작하게 만든다 — 태그가 사라지고
//      `\n{2,}`가 `\n`으로 접혀 **빈 줄이 통째로 없어진다**(= "반쯤 날아감")
//   ④ 자동저장이 그 납작해진 본문을 서버에 덮어쓴다 → 되돌릴 수 없다
//
// 나열식(allow-list)은 서식이 하나 늘 때마다 조용히 어긋난다. 그래서 **주석이 원래 말하던 정의
// 그대로** 뒤집었다: `<p>`/`<br>`가 **아닌** 태그가 보이면 서식이다. 새 Mark를 추가해도 안 깨진다.
// ⚠️ `>`까지 반드시 요구한다. 간단 메모는 **평문 textarea**라 사용자가 `a<b` 같은 부등호를 그냥 칠 수
// 있는데, 여는 꺾쇠만 보고 "서식"으로 판정하면 그 평문이 rich_html로 저장되고 → 다시 열 때 에디터가
// HTML로 파싱해 `<b` 뒤가 통째로 사라진다. 방향만 다를 뿐 위와 똑같은 유실이다. 닫는 `>`를 요구하면
// 예전 나열식보다 오히려 **더 엄격**해진다(예전 `/<b\b/`는 `a<b `에도 걸렸다).
export function hasRichFormatting(html: string): boolean {
  return /<(?!\/?(?:p|br)\b)[a-z][a-z0-9-]*(?:\s[^<>]*=[^<>]*)?\s*\/?>/i.test(html);
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

// AI Trend Briefing "전체 저장" — 네 카테고리 모두 본문 문단으로 저장한다(실무적용은 bullets로
// 들어오지만 목록이 아니라 문단으로 편다. 아래 bullets 주석 참고).
export function trendFullBlockHtml(
  label: string, title: string | null, body: string, bullets: string[] | null,
  source: string | null, url: string | null
): string {
  return (
    "<hr>" +
    `<h3>📊 AI Trend Briefing 전체 저장 — ${escapeHtml(label)}</h3>` +
    (title ? `<p><strong>${escapeHtml(title)}</strong></p>` : "") +
    (body ? `<p>${escapeHtml(body)}</p>` : "") +
    // 🔴 2026-08-30 — 여기는 `<ul><li>`였다. 그런데 트렌드 4개 카테고리 중 **bullets를 넘기는 건
    // 실무 적용 하나뿐이고**(Dashboard.tsx의 openFullTrendPicker: 나머지 셋은 body를 넘긴다),
    // 나머지 셋은 `<p>` 문단이라 저장된 메모에서 **실무 적용만 혼자 한 칸 들여쓰기**로 보였다
    // (실측: `.rich-editor-content ul`이 `padding-left: 1.4em` + disc 마커. 줄 간격 자체는 26px로
    //  넷이 같았다 — 사용자가 말한 "한 칸 띄어져"는 줄 간격이 아니라 이 들여쓰기다).
    // 그래서 같은 문단으로 맞춘다. ⚠️ 뉴스(관련 키워드)·채용공고는 목록이 맞으므로 건드리지 않는다.
    (bullets && bullets.length ? bullets.map((b) => `<p>${escapeHtml(b)}</p>`).join("") : "") +
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
