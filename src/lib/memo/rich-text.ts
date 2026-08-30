import type { ContentFormat, SourceType } from "./types";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 🔴 `escapeHtml`은 `javascript:`를 **안 막는다** — `&<>"`만 바꾸기 때문이다.
// 아래 블록 생성기들이 넣는 `href`는 RSS·Tavily에서 온 **외부 값**이고, 저장된 메모 본문은
// RichMemoContent가 `dangerouslySetInnerHTML`로 그대로 그린다. 즉 피드가 오염되면
// `<a href="javascript:...">`가 그대로 남아 누르는 순간 실행된다.
// http/https가 아니면 **링크를 만들지 않는다**(빈 문자열 → 호출부의 `sourceUrl ? ... : ""`가 링크를 건너뛴다).
// 상대경로도 여기서는 의미가 없다 — 전부 외부 원문 주소다.
export function safeHref(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : "";
  } catch {
    return ""; // 파싱 불가 = 절대 URL이 아니다
  }
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

// 🔴 드래그로 고른 텍스트의 **줄 구조를 살려서** 인용문으로 만든다.
//
// 예전엔 `<p>${escapeHtml(text)}</p>` 한 덩어리였다. escapeHtml은 `&<>"`만 바꾸고 `\n`은
// 그대로 두는데, HTML은 줄바꿈을 공백 한 칸으로 접는다 — 그래서 **여러 줄을 골라 "새 메모 생성"을
// 하면 전부 한 문장으로 뭉개졌다**(2026-08-30 "AI트렌드 선택복사하면 형식·줄바꿈이 엉망" 신고).
// 목록(`<li>` 여러 개)을 드래그하면 특히 심하다 — 항목 구분이 통째로 사라진다.
//
// 빈 줄(`\n\n`)은 문단 경계로, 홑 줄바꿈은 `<br>`로 옮긴다. 뉴스·채용·AI트렌드가 모두 이 한
// 함수를 지나므로 출처별로 분기하지 않는다(출처별 분기를 만들면 그게 다음 어긋남이다).
function quotedParagraphs(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return "<p></p>";
  return blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`).join("");
}

// 6~10절 뉴스/채용공고 → "새 메모 생성" 시 초기 본문(구분선 + 소제목 + 인용문 + 출처)
export function sourceBlockHtml(sourceType: SourceType, sourceTitle: string, sourceUrl: string, selectedText: string): string {
  const href = safeHref(sourceUrl);
  const heading = sourceType === "news" ? "뉴스에서 추가" : sourceType === "job" ? "채용공고에서 추가" : "AI Trend Briefing에서 추가";
  return (
    "<hr>" +
    `<h3>${escapeHtml(heading)}</h3>` +
    `<blockquote>${quotedParagraphs(selectedText)}</blockquote>` +
    `<p>출처: ${escapeHtml(sourceTitle)}${href ? ` · <a href="${escapeHtml(href)}" target="_blank" rel="noopener">원문</a>` : ""}</p>`
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
  const href = safeHref(sourceUrl);
  return (
    "<hr>" +
    `<h3>📰 뉴스 전체 저장 — ${escapeHtml(sourceTitle)}</h3>` +
    (summary ? `<p>${escapeHtml(summary)}</p>` : "") +
    (reason ? `<blockquote><p>✨ Why it matters — ${escapeHtml(reason)}</p></blockquote>` : "") +
    (tags.length ? `<p><strong>관련 키워드</strong></p><ul>${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "") +
    (href ? `<p>출처: <a href="${escapeHtml(href)}" target="_blank" rel="noopener">원문 보기</a></p>` : "")
  );
}

// AI Trend Briefing "전체 저장" — 업계영향/도구서비스/개발자동향은 본문 문단, 실무적용은 목록으로 저장한다
export function trendFullBlockHtml(
  label: string, title: string | null, body: string, bullets: string[] | null,
  source: string | null, url: string | null
): string {
  const href = safeHref(url);
  return (
    "<hr>" +
    `<h3>📊 AI Trend Briefing 전체 저장 — ${escapeHtml(label)}</h3>` +
    (title ? `<p><strong>${escapeHtml(title)}</strong></p>` : "") +
    (body ? `<p>${escapeHtml(body)}</p>` : "") +
    (bullets && bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : "") +
    (source || href
      ? `<p>출처: ${source ? escapeHtml(source) : ""}${href ? `${source ? " · " : ""}<a href="${escapeHtml(href)}" target="_blank" rel="noopener">원문 보기</a>` : ""}</p>`
      : "")
  );
}

// 채용공고 "전체 저장" — 주요업무/자격요건/우대사항을 카테고리별 소제목+목록으로 그대로 옮긴다
export function jobFullBlockHtml(
  title: string, company: string, sourceSite: string, career: string, deadline: string, sourceUrl: string,
  categories: { label: string; groups: { heading: string | null; bullets: string[] }[] }[]
): string {
  const href = safeHref(sourceUrl);
  const categoriesHtml = categories
    .filter((c) => c.groups.length > 0)
    .map((c) => `<h4>${escapeHtml(c.label)}</h4>${bulletGroupsHtml(c.groups)}`)
    .join("");
  return (
    "<hr>" +
    `<h3>💼 채용공고 전체 저장 — ${escapeHtml(title)}</h3>` +
    `<p><strong>${escapeHtml(company)}</strong>${sourceSite ? ` · ${escapeHtml(sourceSite)}` : ""} · ${escapeHtml(career)} · 마감 ${escapeHtml(deadline)}</p>` +
    categoriesHtml +
    (href ? `<p>출처: <a href="${escapeHtml(href)}" target="_blank" rel="noopener">원문 보기</a></p>` : "")
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
