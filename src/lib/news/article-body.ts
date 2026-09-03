import { stripHtml } from "./rss.ts";

// 🔴🔴 2026-09-03 — **최종 선정된 기사에 한해** 원문 본문을 받아 재료를 늘린다.
//
// 왜 필요했나 (실측): rss.ts의 pickRicherText가 `content:encoded`로 세 소스를 이미 살렸지만
// **AI타임스는 그 필드가 0/50건**이라 재료가 300자에 묶여 있었다(RSS가 정확히 300에서 자른다).
// 후보 57건 중 31건이 AI타임스다 — 요약이 짧은 이유의 대부분이 여기였다.
// 실측(라이브 8건): RSS 300자 → 본문 857~3,168자 (2.9~10.6배), 추출 성공 8/8.
//
// ⚖️ **적용 범위를 AI타임스로만 좁힌 이유 — robots.txt (2026-09-03 확인)**
//   AI타임스   `User-agent: * / Disallow: /admin/` 뿐 → 기사 페이지 **허용**
//   TechCrunch 기사 경로는 `*`에 열려 있지만 **anthropic-ai · ClaudeBot · Claude-Web · GPTBot ·
//              CCBot · Google-Extended · cohere-ai 등 13종에 `Disallow: /`** 를 명시해뒀다.
//              본문을 받아 LLM에 넣는 이 용도가 정확히 그 대상이라, UA 문자열이 목록에 없다는
//              이유로 받아오지 않는다. 🔴 **사용자 지시 없이 TechCrunch를 여기 추가하지 마라.**
//              (TechCrunch RSS 요약을 쓰는 것은 발행자가 배포용으로 내보낸 것이라 그대로 유지한다.)
//
// 🔴 선정 로직과 무관하다 — 이 함수는 `rewrite.ts`(선정이 끝난 뒤 **글만** 다시 쓰는 단계)에서만
//    불린다. 후보 수집·필터·점수·중복 제거·출처 상한은 이 코드를 지나지 않는다.
const BODY_FETCH_SOURCES = new Set(["AI타임스"]);
const FETCH_TIMEOUT_MS = 8_000;
// 이보다 짧으면 껍데기만 받은 것으로 본다(실측: 본문이 사실상 없는 영상 뉴스가 57자였다).
const MIN_BODY_LENGTH = 200;

// 발행자가 **선언한 경계**를 쓴다 — 잡코리아에서 얻은 교훈(`<b>` 같은 시각 서식을 라벨로 추측하면
// 오탐 하나가 앞 섹션을 통째로 삼킨다)을 그대로 적용했다. 이 마크업은 두 가지를 함께 선언한다:
//   <article id="article-view-content-div" class="article-veiw-body view-page" itemprop="articleBody">
// schema.org 표준인 `itemprop="articleBody"` 쪽을 잡는다(CMS가 id를 바꿔도 살아남는다).
// 💀 `<div ...>`로 찾지 마라 — **`<article>` 태그다.** 여기서 한 번 헛짚었다.
const BODY_OPEN = /<article\b[^>]*itemprop=["']articleBody["'][^>]*>/i;

// 마지막에 붙는 기자 서명("박찬 기자 cpark@aitimes.com", "… Powered by AItimes AI Solution").
// 실측 8/8건 전부에 있었고 본문이 아니다.
const BYLINE = /@aitimes\.com/i;

function extractBody(html: string): string | null {
  const open = html.match(BODY_OPEN);
  if (!open || open.index === undefined) return null;

  // 닫는 태그를 **깊이를 세서** 찾는다. 첫 `</article>`로 자르면 중첩이 있을 때 본문이 잘린다.
  const start = open.index + open[0].length;
  const tags = /<article\b|<\/article>/gi;
  tags.lastIndex = start;
  let depth = 1;
  let end = -1;
  let m: RegExpExecArray | null;
  while ((m = tags.exec(html)) !== null) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) { end = m.index; break; }
  }
  if (end < 0) return null;

  const inner = html
    .slice(start, end)
    // 본문이 아닌 덩어리를 먼저 걷는다 — 사진 설명·표·TTS 위젯이 문장 사이에 섞인다.
    .replace(/<(script|style|figure|figcaption|table)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<div[^>]+id=["']audio-tts-container["'][\s\S]*?<\/div>/gi, " ");

  const paras = [...inner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((p) => stripHtml(p[1]))            // 태그·엔티티 정제는 기존 함수 하나로 통일한다
    .filter((t) => t.length > 0 && !BYLINE.test(t));

  const body = paras.join("\n");
  return body.length >= MIN_BODY_LENGTH ? body : null;
}

// 실패하면 **항상 null**을 돌려준다 — 호출부가 기존 RSS 요약으로 즉시 되돌아간다.
// 이 함수는 절대 throw하지 않는다(원문 서버 장애가 브리핑을 죽이면 안 된다).
export async function fetchArticleBody(source: string, url: string): Promise<string | null> {
  if (!BODY_FETCH_SOURCES.has(source)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (SkillPilot RSS bot)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[article-body] ${source} HTTP ${res.status} — RSS 요약을 그대로 씁니다: ${url}`);
      return null;
    }
    const body = extractBody(await res.text());
    if (!body) console.warn(`[article-body] ${source} 본문 추출 실패 — RSS 요약을 그대로 씁니다: ${url}`);
    return body;
  } catch (e) {
    console.warn(`[article-body] ${source} 요청 실패 — RSS 요약을 그대로 씁니다: ${url}`, e);
    return null;
  }
}

// 자체 점검이 추출부만 따로 돌려보기 위한 export(네트워크 없이).
export const __extractBodyForTest = extractBody;
