import { fetchRssItems, stripHtml, type Candidate } from "./rss";
import { normalizeUrl } from "./filter";
import {
  GITHUB_CHANGELOG_FEED,
  HF_BLOG_FEED,
  HF_TRENDING_MODELS_API,
  DEV_LOOKBACK_DAYS,
  MAX_DEV_ITEMS_PER_SOURCE,
  DEV_DESCRIPTION_MAX_CHARS,
} from "./sources";

// AI Trend Briefing에 넘기는 개발 생태계 항목 — Gemini 입력 필드를 이 5개로 제한한다 (요청서 9절)
export type DevUpdate = {
  title: string;
  description: string;
  published_at: string;
  url: string;
  source: "GitHub" | "Hugging Face";
};

export type DevEcosystem = {
  github: DevUpdate[];
  huggingface: DevUpdate[];
};

// GitHub Changelog 중 AI 개발과 관련된 항목만 (요청서 6절)
const GITHUB_KEYWORDS = [
  "copilot", "agent", "agentic", "model", "mcp", "ai ", " ai", "llm",
  "code review", "code generation", "code quality", "codespaces",
  "workflow", "automation", "inference", "reasoning", "prompt", "chat",
];

// Hugging Face 중 개발 방식·생태계 변화를 보여주는 항목만 (요청서 8절)
const HF_KEYWORDS = [
  "agent", "agentic", "tool call", "tool-call", "function call", "rag",
  "local", "on-device", "ondevice", "edge", "small language model", "slm",
  "reason", "multimodal", "quantiz", "gguf", "distill", "optimiz", "efficient",
  "serving", "inference", "deploy", "fine-tune", "finetune", "lora",
  "framework", "transformers", "agentic ai", "mcp", "text-generation",
];

// 이미지·영상·음성 생성 전용 모델은 "AI 개발 방식의 변화"와 거리가 멀어 제외한다 —
// lora/comfyui 같은 공통 태그 때문에 영상 생성 모델이 대량으로 걸려들었다 (요청서 8절)
const HF_EXCLUDED_PIPELINES = [
  "text-to-video", "image-to-video", "video-to-video", "text-to-image",
  "image-to-image", "text-to-audio", "audio-to-audio", "text-to-speech",
];

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function withinDevLookback(date: Date): boolean {
  const days = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
  return days >= 0 && days <= DEV_LOOKBACK_DAYS;
}

// 날짜 필터 → 키워드 필터 → URL 중복 제거 → 최신순 상한 — 전부 일반 코드에서 처리한다 (요청서 25절)
function reduceCandidates(
  items: Candidate[],
  keywords: string[],
  source: DevUpdate["source"]
): DevUpdate[] {
  const seen = new Set<string>();
  return items
    .filter((c) => withinDevLookback(c.publishedAt))
    .filter((c) => matchesAny(`${c.title} ${c.summary}`, keywords))
    .filter((c) => {
      const url = normalizeUrl(c.url);
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, MAX_DEV_ITEMS_PER_SOURCE)
    .map((c) => ({
      title: c.title,
      // description이 길면 Gemini 입력만 늘어난다 — 컷은 상수 하나로 두고 실측으로 정한다.
      // 🔴 옛 값 400은 `pickRicherText`가 고른 `content:encoded`(중앙 1,738자)를 여기서
      //    되버리고 있었다(2026-09-05 실측: 6/6건이 단어 중간 절단). 근거는 상수 주석에 있다.
      description: c.summary.slice(0, DEV_DESCRIPTION_MAX_CHARS),
      published_at: c.publishedAt.toISOString(),
      url: normalizeUrl(c.url),
      source,
    }));
}

export async function fetchGithubUpdates(): Promise<DevUpdate[]> {
  const items = await fetchRssItems("GitHub", GITHUB_CHANGELOG_FEED);
  return reduceCandidates(items, GITHUB_KEYWORDS, "GitHub");
}

type HfModel = {
  id?: string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  createdAt?: string;
};

// 트렌딩 모델 API — description 필드가 없으므로 입력에 실제로 있는 값(pipeline/library/tags/downloads)만으로
// 설명을 구성한다. 없는 성능·벤치마크 수치를 만들지 않는다 (요청서 11절)
function modelToUpdate(m: HfModel): DevUpdate | null {
  if (!m.id || !m.createdAt) return null;
  const created = new Date(m.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const pipeline = (m.pipeline_tag ?? "").toLowerCase();
  if (HF_EXCLUDED_PIPELINES.some((p) => pipeline === p)) return null;
  if (HF_EXCLUDED_PIPELINES.some((p) => (m.tags ?? []).includes(p))) return null;

  const tags = (m.tags ?? []).filter((t) => !t.includes(":")).slice(0, 8);
  const facts = [
    m.pipeline_tag ? `태스크: ${m.pipeline_tag}` : null,
    m.library_name ? `라이브러리: ${m.library_name}` : null,
    tags.length > 0 ? `태그: ${tags.join(", ")}` : null,
    typeof m.downloads === "number" ? `다운로드: ${m.downloads}` : null,
    typeof m.likes === "number" ? `좋아요: ${m.likes}` : null,
  ].filter(Boolean);

  return {
    title: m.id,
    description: facts.join(" · "),
    published_at: created.toISOString(),
    url: `https://huggingface.co/${m.id}`,
    source: "Hugging Face",
  };
}

async function fetchHfTrendingModels(): Promise<DevUpdate[]> {
  const res = await fetch(HF_TRENDING_MODELS_API, {
    headers: { "User-Agent": "Mozilla/5.0 (SkillPilot bot)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Hugging Face models API ${res.status}`);
  const models = (await res.json()) as HfModel[];
  if (!Array.isArray(models)) return [];

  const seen = new Set<string>();
  return models
    .map(modelToUpdate)
    .filter((m): m is DevUpdate => m !== null)
    .filter((m) => withinDevLookback(new Date(m.published_at)))
    .filter((m) => matchesAny(`${m.title} ${m.description}`, HF_KEYWORDS))
    .filter((m) => {
      if (seen.has(m.url)) return false;
      seen.add(m.url);
      return true;
    })
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, MAX_DEV_ITEMS_PER_SOURCE);
}

// 🔴🔴 2026-09-06 — HF 블로그 항목의 본문을 **원문에서 받아 채운다.**
//
// 왜 필요했나 (실측): HF 블로그 RSS의 `<item>`에는 `description`이 **필드 자체로 없다**
// (title·pubDate·link·guid 넷뿐이고 `content:encoded`도 0건). 그래서 `pickRicherText`가 고를
// 재료가 없어 blog 항목은 **제목만** dev_input에 들어갔다 — 09-03·04·05 사흘 연속 blog 3건이
// 전부 0자였고, 그것이 역량 시그널 재료 부족의 직접 원인으로 확인됐다(AI Trend 진단 2026-09-06).
// GitHub는 같은 날 1,040~2,000자였다. 즉 **두 소스의 재료량이 구조적으로 비대칭이었다.**
//
// ⚖️ robots.txt (2026-09-06 확인): huggingface.co는 `User-agent: * / Allow: /` **두 줄이 전부**다.
//    UA별 차단 목록이 없다 — TechCrunch가 anthropic-ai·ClaudeBot·GPTBot 등 13종을 명시적으로
//    막아둔 것과 다르다(article-body.ts의 판단 근거와 같은 기준을 여기에도 적용했다).
//
// 🔴 **발행자가 선언한 경계를 쓴다** — `class="blog-content …"`. 잡코리아에서 얻은 교훈
//    (시각 서식을 라벨로 추측하면 오탐 하나가 앞 섹션을 통째로 삼킨다)을 그대로 적용했다.
//    💀 `<article>`로 찾지 마라 — HF에서 그 태그는 **관련 글 카드**(`overview-card-wrapper`)이고,
//       webgpu-kernels 페이지에는 아예 없다. 실측으로 확인했다.
//    💀 ld+json에는 `articleBody`가 **없다**(3/3건). 그쪽으로 가지 마라.
const HF_BODY_TIMEOUT_MS = 8_000;
// 이보다 짧으면 껍데기만 받은 것으로 본다(article-body.ts와 같은 기준).
const HF_BODY_MIN_LENGTH = 200;

// 태그 속성 매칭 — 속성값 안의 raw ">"를 넘어간다.
// 💀 `[^>]*`로 쓰면 안 된다: HF는 Tailwind의 `[&>a]:hidden` 같은 클래스를 쓰는데 그 ">"에서
//    태그가 일찍 끊겨 **남은 속성 문자열이 본문으로 샌다**(실측: 첫 블록이 `a]:hidden">제목`이었다).
// 💀💀 그렇다고 `(?:"[^"]*"|'[^']*'|[^>])*`로 쓰면 **254KB 페이지에서 멈춘다.** 마지막 대안 `[^>]`가
//     `"`·`'`도 매치해서 앞의 두 대안과 겹치고, 그 모호성이 매치 실패 시 파국적 백트래킹이 된다
//     (실측 2026-09-06: 네트워크는 전부 0.3초인데 추출에서 4분 넘게 안 끝났다).
//     따옴표를 **마지막 대안에서 빼면** 세 대안이 서로 겹치지 않아 선형으로 훑는다.
const ATTR = `(?:"[^"]*"|'[^']*'|[^>"'])*`;
// 여는 태그는 `[^>]*`로 충분하다 — 실측상 blog-content div의 속성에는 raw ">"가 없다
// (`[&amp;_h1]:mr-0!`처럼 이스케이프돼 있다). 본문 **안쪽** 태그만 ATTR이 필요하다.
const HF_BODY_OPEN = /<(div|section|article)\b[^>]*class=["'][^"']*\bblog-content\b[^"']*["'][^>]*>/i;
const HF_BLOCKS = new RegExp(`<(p|h[1-6]|li)\\b${ATTR}>([\\s\\S]*?)</\\1>`, "gi");

// 네트워크 없이 검사할 수 있게 분리해둔다.
export function extractHfBlogBody(html: string): string | null {
  const open = html.match(HF_BODY_OPEN);
  if (!open || open.index === undefined) return null;

  // 닫는 태그를 **깊이를 세서** 찾는다. 첫 닫기로 자르면 중첩이 있을 때 본문이 잘린다.
  const tag = open[1].toLowerCase();
  const start = open.index + open[0].length;
  const tags = new RegExp(`<${tag}\\b|</${tag}>`, "gi");
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
    .replace(/<(script|style|figure|figcaption|table|svg|nav)\b[\s\S]*?<\/\1>/gi, " ")
    // 코드블록은 서술이 아니다 — 통째로 들어오면 2000자 컷을 코드가 다 먹는다.
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ");

  HF_BLOCKS.lastIndex = 0;
  const body = [...inner.matchAll(HF_BLOCKS)]
    .map((b) => stripHtml(b[2]))
    .filter((t) => t.length > 0)
    .join("\n");
  return body.length >= HF_BODY_MIN_LENGTH ? body : null;
}

// 실패하면 **항상 null** — 호출부가 기존 동작(제목만)으로 그대로 되돌아간다.
// 이 함수는 절대 throw하지 않는다(HF 장애가 브리핑 생성을 죽이면 안 된다).
async function fetchHfBlogBody(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (SkillPilot RSS bot)" },
      signal: AbortSignal.timeout(HF_BODY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[dev-ecosystem] HF 블로그 HTTP ${res.status} — 제목만 씁니다: ${url}`);
      return null;
    }
    const body = extractHfBlogBody(await res.text());
    if (!body) console.warn(`[dev-ecosystem] HF 블로그 본문 추출 실패 — 제목만 씁니다: ${url}`);
    return body;
  } catch (e) {
    console.warn(`[dev-ecosystem] HF 블로그 요청 실패 — 제목만 씁니다: ${url}`, e);
    return null;
  }
}

// HF 블로그 RSS는 description이 비어 있고 항목이 800개가 넘는다 — 날짜·키워드 필터로 먼저 줄인다
async function fetchHfBlog(): Promise<DevUpdate[]> {
  const items = await fetchRssItems("Hugging Face", HF_BLOG_FEED);
  const reduced = reduceCandidates(items, HF_KEYWORDS, "Hugging Face");

  // 🔴 **비어 있는 항목만** 보강한다 — 선정·필터는 위에서 이미 끝났고 여기서는 재료만 채운다.
  //    RSS가 나중에 description을 주기 시작하면 이 경로는 자동으로 아무 일도 하지 않는다.
  //    요청은 필터를 통과한 소수(≤6건)에만 나가고, 실패한 건은 그대로 제목만 남는다.
  const bodies = await Promise.all(
    reduced.map((u) => (u.description.trim() ? Promise.resolve(null) : fetchHfBlogBody(u.url)))
  );
  const filled = reduced.map((u, i) =>
    bodies[i] ? { ...u, description: bodies[i]!.slice(0, DEV_DESCRIPTION_MAX_CHARS) } : u
  );
  const gained = filled.filter((u, i) => bodies[i]).length;
  if (gained > 0) console.log(`[dev-ecosystem] HF 블로그 본문 보강 ${gained}/${reduced.length}건`);
  return filled;
}

// 블로그와 트렌딩 모델을 합친다. 한쪽이 실패해도 다른 쪽 결과는 살린다.
export async function fetchHuggingFaceUpdates(): Promise<DevUpdate[]> {
  const [blog, models] = await Promise.allSettled([fetchHfBlog(), fetchHfTrendingModels()]);
  const merged = [
    ...(blog.status === "fulfilled" ? blog.value : []),
    ...(models.status === "fulfilled" ? models.value : []),
  ];
  return merged.slice(0, MAX_DEV_ITEMS_PER_SOURCE);
}

// 각 수집기는 독립적으로 실패한다 — 하나가 죽어도 나머지는 빈 배열로 두고 계속 간다 (요청서 17·24절)
export async function fetchDevEcosystem(): Promise<DevEcosystem> {
  const [github, huggingface] = await Promise.allSettled([
    fetchGithubUpdates(),
    fetchHuggingFaceUpdates(),
  ]);
  return {
    github: github.status === "fulfilled" ? github.value : [],
    huggingface: huggingface.status === "fulfilled" ? huggingface.value : [],
  };
}
