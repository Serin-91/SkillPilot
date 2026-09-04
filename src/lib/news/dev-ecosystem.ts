import { fetchRssItems, type Candidate } from "./rss";
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

// HF 블로그 RSS는 description이 비어 있고 항목이 800개가 넘는다 — 날짜·키워드 필터로 먼저 줄인다
async function fetchHfBlog(): Promise<DevUpdate[]> {
  const items = await fetchRssItems("Hugging Face", HF_BLOG_FEED);
  return reduceCandidates(items, HF_KEYWORDS, "Hugging Face");
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
