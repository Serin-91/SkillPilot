import type { ExtractedJobFields } from "./extract-fields";
import { todayKSTDateString } from "../news/kst.ts";

// 점핏도 원티드처럼 페이지 안에 필드가 <dt>라벨</dt><dd>내용</dd> 구조로 그대로 박혀 있어
// Gemini 없이 직접 파싱한다 (Gemini 무료 할당량을 아끼기 위함 — extract-fields.ts는 안 탄다).
// <pre> 안의 원문은 개행(줄바꿈)으로 이미 문단·목록이 나뉘어 있는데, \s+를 통째로 공백 하나로 합치면
// 그 개행까지 날아가서 전부 한 줄로 붙어버린다(가독성 저하 원인) — 개행은 남기고 나머지 공백만 정리한다.
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function byLabel(html: string, label: string): string | null {
  const m = html.match(new RegExp(`<dt[^>]*>${label}</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`));
  return m ? stripTags(m[1]) : null;
}

export async function fetchJumpitJobDetail(url: string): Promise<ExtractedJobFields | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SkillPilot job collector)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim() ?? null;
  const responsibilities = byLabel(html, "주요업무");
  const requiredText = byLabel(html, "자격요건");
  if (!title || !requiredText) return null; // 채용공고 페이지가 아니거나 구조가 다르면 실패로 간주

  const company = html.match(/<a class="company"[\s\S]{0,300}?<h2>([^<]+)<\/h2>/)?.[1]?.trim() ?? "";
  const preferredText = byLabel(html, "우대사항") ?? "";
  const career = byLabel(html, "경력");
  // 실제 공고 10건을 확인해보니 점핏은 항상 이 필드에 구체적인 날짜가 들어있었다("상시채용" 표기가 없음) —
  // 그래서 마감일을 못 찾거나 날짜 형식이 아니면 "마감 없음(상시)"으로 넘기지 않고 파싱 실패로 보고 통째로
  // 걸러낸다. 잘못 null로 넘기면 실제로는 마감된 공고가 "상시채용"으로 영구히 노출될 수 있다(5.3절 안전장치).
  const deadlineRaw = byLabel(html, "마감일");
  if (!deadlineRaw || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw)) return null;
  const deadline = deadlineRaw;

  // deadline은 KST 기준 날짜다 — UTC 날짜(new Date().toISOString())로 비교하면 KST 00~08시 구간에서
  // UTC 날짜가 하루 늦어 방금 마감된 공고를 못 거른다(generate.ts의 KST 재검증과 기준을 맞춘다).
  if (deadline < todayKSTDateString()) return null; // 5.3절 — 마감된 공고 제외

  return {
    is_job_posting: true,
    company,
    title,
    role: title,
    responsibilities: responsibilities ?? "",
    required_text: requiredText,
    preferred_text: preferredText,
    career_requirement: career ?? "경력무관",
    deadline,
    posted_at: null,
    date_confidence: "unknown",
  };
}

// 점핏이 목록 페이지에서 실제로 쓰는 내부 API(jumpit-api.saramin.co.kr) — 로그인/토큰 없이
// 공개 응답을 준다. Tavily 검색 인덱스가 오래돼 마감된 공고를 올려보내는 문제를 이 경로로 우회한다:
// sort=recent로 점핏 사이트 자체 최신순 그대로 받아온다. jobCategory id는 /api/common/code-initialize로 확인함.
// 2026-08-13 AI 중심 개편 — SkillPilot 관심 직무 4종이 전부 AI 직군이라 role별로 따로 부르지 않고
// 점핏의 "인공지능/머신러닝" 카테고리(8) 하나만 공통으로 받아온 뒤 filter.ts의 classifyJobRole로
// 상세 파싱 후 4개 직무 중 실제로 분류한다(generate.ts).
const JUMPIT_AI_CATEGORY_ID = 8;

export async function fetchJumpitPositions(limit: number): Promise<{ url: string; title: string; content: string }[]> {
  const url = `https://jumpit-api.saramin.co.kr/api/positions?jobCategory=${JUMPIT_AI_CATEGORY_ID}&sort=recent&highlight=false&page=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SkillPilot job collector)", accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];

  const data = await res.json();
  const positions: { id: number; title: string; companyName: string; techStacks?: string[] }[] = data?.result?.positions ?? [];
  return positions.slice(0, limit).map((p) => ({
    url: `https://jumpit.saramin.co.kr/position/${p.id}`,
    title: p.title,
    content: `${p.companyName} ${(p.techStacks ?? []).join(" ")}`,
  }));
}
