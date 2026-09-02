import { XMLParser } from "fast-xml-parser";
import { NEWS_SOURCES } from "./sources.ts";

export type Candidate = {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: Date;
};

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: "__cdata" });

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "__cdata" in value) {
    return String((value as { __cdata: unknown }).__cdata);
  }
  return "";
}

// GitHub Changelog 등 일부 피드는 본문에 &#8220; 같은 엔티티가 그대로 들어온다 —
// Gemini에 넘기기 전에 일반 코드에서 정리한다. 십진(#39) 표기만 있던 걸 십육진(#x27) 표기도
// 같이 디코딩하도록 넓혔다(채용공고 쪽에서 실제로 이 표기 때문에 깨진 사례가 있었음).
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  "#39": "'", "#x27": "'",
  "#8216": "'", "#8217": "'", "#8220": '"', "#8221": '"', "#8211": "-", "#8212": "—", "#8230": "…",
};

// 한국 뉴스 제목은 "[단독]"/"<속보>"류 대괄호 접두어를 흔히 쓴다 — 진짜 HTML 태그(<b>, <a href="...">
// 등, description에 섞여 들어오는 경우가 있어 이건 지워야 한다)와 구분하려면 "<" 바로 뒤에 ASCII 알파벳이
// 오는 것만 태그로 본다. "<속보>"는 "<" 다음이 한글이라 이 정규식에 안 걸려 안전하게 살아남는다.
export function stripHtml(s: string): string {
  return s
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/g, " ")
    .replace(/&(#?\w+);/g, (m, code: string) => ENTITIES[code] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

// 🔴 2026-09-02 — **Gemini는 기사 본문을 한 번도 본 적이 없었다.** 넘어가던 것은 제목 + RSS
// description뿐이고(select.ts의 toCandidateText), 그 description 실측 중앙값이 이렇다:
//     AI타임스 300자(정확히 300에서 잘림) · ZDNet 1016 · TechCrunch 141 · MIT 148 · **Ars 81**
// 81자짜리 한 문장으로 "무엇이 달라졌는지 / 기존 방식과 차이 / 산업 영향"을 쓸 수 없다.
// 프롬프트는 "원문 정보량이 부족하면 최소 3문장까지 줄인다"고 이미 지시하고 있으므로,
// 요약이 짧은 것은 모델이 규칙을 **어긴** 게 아니라 **지킨** 결과다. 재료가 없었다.
//
// 그런데 같은 피드에 `<content:encoded>`가 있고 훨씬 길다(실측):
//     ZDNet 30/30건 · MIT 50/50건 · Ars 20/20건이 description보다 김
//     Ars 81 → 1054(13배) · MIT 148 → 6884(46배)
//     AI타임스·TechCrunch는 이 필드가 아예 없다(0건) → 자동으로 description이 남는다
//
// ⚠️ **무조건 우선하지 않는다.** 둘 다 같은 정리(태그 제거·엔티티 디코드·공백 정리)를 거친 뒤
//    실제 글자 수를 비교해 **많은 쪽**을 쓴다. content:encoded가 껍데기·푸터만 담아 오히려
//    빈약한 피드가 나타나면 그때는 description이 자동으로 이긴다 — 판정이 소스 목록에
//    의존하지 않으므로 소스를 추가해도 따라온다.
//    (지금 5소스 꼬리를 전부 훑어 네비/푸터 오염이 없는 것은 확인했다. Ars의
//     "Read full article Comments" 26자가 유일하고 무해하다.)
// ⚠️ 상한 2000자 — 후보 30건 기준 입력량 실측: 무제한이면 **244,647자(≈111k 토큰)**로 못 쓴다.
//    1000→30,000 / 1500→45,000 / **2000→60,000(≈27k 토큰)** / 2500→75,000.
//    현재(description만)가 37,706자이므로 2000은 +59%다. 범위(1,500~2,000)의 상단을 쓴다 —
//    Ars는 전문(1,054)이 통째로 들어오고 MIT은 도입부 2,000자가 들어온다.
//    ponytail: 토큰이 문제가 되면 이 숫자 하나만 내리면 된다.
export const MAX_SUMMARY_LENGTH = 2000;
export function pickRicherText(description: string, encoded: string): string {
  return (encoded.length > description.length ? encoded : description).slice(0, MAX_SUMMARY_LENGTH);
}

// RSS 한 개를 정규화된 Candidate 배열로 파싱한다. 뉴스 4개 소스와 개발 생태계(GitHub/HF) 피드가 같이 쓴다 —
// LLM이 아니라 이 일반 코드에서만 파싱한다 (요청서 25절)
export async function fetchRssItems(name: string, url: string): Promise<Candidate[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SkillPilot RSS bot)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${name} RSS ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item ?? [];
  const itemList = Array.isArray(items) ? items : [items];

  return itemList
    .filter((item) => item?.title && item?.link)
    .map((item) => {
      const publishedAt = new Date(textOf(item.pubDate) || item.pubDate || Date.now());
      return {
        title: stripHtml(textOf(item.title) || String(item.title)),
        summary: pickRicherText(
          stripHtml(textOf(item.description) || String(item.description ?? "")),
          stripHtml(textOf(item["content:encoded"]) || "")
        ),
        url: textOf(item.link) || String(item.link),
        source: name,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      };
    });
}

// RSS 4개를 병렬 요청하고 성공한 응답만 합친다 (4.2절 — 실패한 소스는 조용히 제외)
export async function fetchAllCandidates(): Promise<Candidate[]> {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map((s) => fetchRssItems(s.name, s.url))
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
