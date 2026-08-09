import { XMLParser } from "fast-xml-parser";
import { NEWS_SOURCES } from "./sources";

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
// Gemini에 넘기기 전에 일반 코드에서 정리한다
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
  "#8216": "'", "#8217": "'", "#8220": '"', "#8221": '"', "#8211": "-", "#8212": "—", "#8230": "…",
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, code: string) => ENTITIES[code] ?? m)
    .replace(/\s+/g, " ")
    .trim();
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
        summary: stripHtml(textOf(item.description) || String(item.description ?? "")),
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
