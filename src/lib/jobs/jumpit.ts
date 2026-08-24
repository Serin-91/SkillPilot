import { COLLECTOR_UA } from "./sources.ts";
import { recordCollectError } from "./collect-trace.ts";
import type { ExtractedJobFields } from "./extract-fields";
import { todayKSTDateString } from "../news/kst.ts";
import { JUMPIT_CATEGORY } from "./sources.ts";

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
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function byLabel(html: string, label: string): string | null {
  const m = html.match(new RegExp(`<dt[^>]*>${label}</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`));
  return m ? stripTags(m[1]) : null;
}

// 실제 마감 공고 10건을 확인해보니(2026-08-13) 마감 시 상세 <dt>마감일</dt>은 그대로 있고(과거 날짜라
// deadline 비교로도 걸린다) 지원 버튼 자리에 이 문구가 버튼/보조 텍스트로 겹쳐 나온다 — "마감"이라는
// 짧은 단어가 아니라 이 정확한 문구로만 판정한다(6-2절, 단순 "마감" substring reject 금지).
const CLOSED_POSITION_MARKER = "마감된 포지션";

function parseTechSkills(html: string): string[] {
  const raw = byLabel(html, "기술스택");
  if (!raw) return [];
  return raw.split(/[,\n·]/).map((s) => s.trim()).filter(Boolean);
}

export async function fetchJumpitJobDetail(url: string): Promise<ExtractedJobFields | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": COLLECTOR_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { recordCollectError("점핏 상세", `HTTP ${res.status} ${url.slice(0, 60)}`); return null; }
  const html = await res.text();

  if (html.includes(CLOSED_POSITION_MARKER)) return null; // 5.3절 — 마감된 공고 제외

  const titleRaw = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] ?? null;
  const title = titleRaw ? stripTags(titleRaw) : null;
  const responsibilities = byLabel(html, "주요업무");
  const requiredText = byLabel(html, "자격요건");
  if (!title || !requiredText) return null; // 채용공고 페이지가 아니거나 구조가 다르면 실패로 간주

  const companyRaw = html.match(/<a class="company"[\s\S]{0,300}?<h2>([^<]+)<\/h2>/)?.[1] ?? "";
  const company = companyRaw ? stripTags(companyRaw) : "";
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

  const sourceJobId = url.match(/\/position\/(\d+)/)?.[1] ?? null;

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
    tech_skills: parseTechSkills(html),
    source_job_id: sourceJobId,
  };
}

// 점핏이 목록 페이지에서 실제로 쓰는 내부 API(jumpit-api.saramin.co.kr) — 로그인/토큰 없이
// 공개 응답을 준다. Tavily 검색 인덱스가 오래돼 마감된 공고를 올려보내는 문제를 이 경로로 우회한다:
// sort=recent로 점핏 사이트 자체 최신순 그대로 받아온다. jobCategory id는 sources.ts(JUMPIT_CATEGORY)
// 에서 온다 — /api/common/code-initialize 실제 응답으로 확인함(28절 P0, 추측 금지).
// 2026-08-13 3소스 재구축 — "인공지능/머신러닝"(8) 하나만 보면 Backend/DevOps/Data 계열에 숨은 AI Platform·
// AI Service Backend 후보를 놓칠 수 있어(2-2절) category/page를 파라미터로 받는 형태로 바꿨다.
// bounded pagination — 무제한 순회 금지(4-2절), 호출부(generate.ts)가 필요한 만큼만 page를 늘려서 부른다.
export async function fetchJumpitPositions(
  limit: number,
  category: number = JUMPIT_CATEGORY.AI_ML,
  page: number = 1
): Promise<{ url: string; title: string; content: string }[]> {
  const url = `https://jumpit-api.saramin.co.kr/api/positions?jobCategory=${category}&sort=recent&highlight=false&page=${page}`;
  const res = await fetch(url, {
    headers: { "User-Agent": COLLECTOR_UA, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  // 목록 API가 막히면 여기서 빈 배열이 나가고, 그 뒤 모든 단계가 "0건"으로만 보인다.
  if (!res.ok) { recordCollectError("점핏 목록", `HTTP ${res.status}`); return []; }

  const data = await res.json();
  const positions: { id: number; title: string; companyName: string; techStacks?: string[] }[] = data?.result?.positions ?? [];
  return positions.slice(0, limit).map((p) => ({
    url: `https://jumpit.saramin.co.kr/position/${p.id}`,
    title: p.title,
    content: `${p.companyName} ${(p.techStacks ?? []).join(" ")}`,
  }));
}
