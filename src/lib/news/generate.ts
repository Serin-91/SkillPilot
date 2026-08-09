import { createAdminClient as adminClient } from "@/lib/supabase/admin";
import { fetchAllCandidates, type Candidate } from "./rss";
import { matchesKeywords, needsKeywordFilter, normalizeUrl, scoreArticle } from "./filter";
import { selectTopNews, type SelectedNewsItem } from "./select";
import { generateTrendBrief, type TrendBriefResult } from "./trend-brief";
import { fetchDevEcosystem } from "./dev-ecosystem";
import {
  MAX_CANDIDATES, MAX_LOOKBACK_DAYS, FALLBACK_LOOKBACK_DAYS, MIN_CANDIDATES_BEFORE_FALLBACK,
  PER_SOURCE_INITIAL, PER_SOURCE_MAX,
} from "./sources";
import { todayKSTDateString, toKSTDateString } from "./kst";

// 최근 N일 briefing에 이미 쓰인 URL — 같은 기사를 다시 뽑지 않는다 (4.4절)
async function recentlyUsedUrls(supabase: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const since = new Date(Date.now() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("briefing")
    .select("selected_news")
    .gte("briefing_date", toKSTDateString(since));
  if (error) throw error;

  const urls = new Set<string>();
  for (const row of data ?? []) {
    for (const item of (row.selected_news as SelectedNewsItem[]) ?? []) {
      if (item.url) urls.add(normalizeUrl(item.url));
    }
  }
  return urls;
}

function withinLookback(candidate: Candidate, lookbackDays: number): boolean {
  const days = (Date.now() - candidate.publishedAt.getTime()) / (24 * 60 * 60 * 1000);
  return days <= lookbackDays;
}

// Hard Filter는 날짜·중복·(종합 소스만) AI 관련성 정도로 최소화한다. 채용/행사/수상 홍보는 여기서
// 제거하지 않는다 — §10 "Hard Filter 최소화" 원칙에 따라 filter.ts의 Ranking 감점으로만 처리한다
// (요청서 §2·§5가 서로 다른 처리를 요구해 §10을 우선해 통일함, 2026-08-09). 애매한 기사는 점수만
// 낮아진 채 후보로 남는다.
function hardFilter(raw: Candidate[], usedUrls: Set<string>, lookbackDays: number): Candidate[] {
  const seenInBatch = new Set<string>();
  return raw.filter((c) => {
    if (!withinLookback(c, lookbackDays)) return false;
    if (needsKeywordFilter(c.source) && !matchesKeywords(c.title, c.summary)) return false;
    const url = normalizeUrl(c.url);
    if (usedUrls.has(url) || seenInBatch.has(url)) return false;
    seenInBatch.add(url);
    return true;
  });
}

// 소스별로 먼저 최대 PER_SOURCE_INITIAL개씩 선점하고, 남은 슬롯은 전체 후보 중 점수 높은 순으로
// 백필한다 — 단 한 소스가 최종 상한(PER_SOURCE_MAX)을 넘지 못하게 막아 특정 언론사 독점을 막는다
// (뉴스 선정 로직 수정요청서 6·7절)
function distributeByScore(filtered: Candidate[]): Candidate[] {
  const ranked = filtered
    .map((c) => ({ c, score: scoreArticle(c) }))
    .sort((a, b) => b.score - a.score);

  const takenUrls = new Set<string>();
  const perSourceCount = new Map<string, number>();
  const selected: Candidate[] = [];

  const bySource = new Map<string, typeof ranked>();
  for (const item of ranked) {
    const arr = bySource.get(item.c.source) ?? [];
    arr.push(item);
    bySource.set(item.c.source, arr);
  }
  for (const items of bySource.values()) {
    for (const item of items.slice(0, PER_SOURCE_INITIAL)) {
      selected.push(item.c);
      takenUrls.add(normalizeUrl(item.c.url));
      perSourceCount.set(item.c.source, (perSourceCount.get(item.c.source) ?? 0) + 1);
    }
  }

  for (const item of ranked) {
    if (selected.length >= MAX_CANDIDATES) break;
    const url = normalizeUrl(item.c.url);
    if (takenUrls.has(url)) continue;
    if ((perSourceCount.get(item.c.source) ?? 0) >= PER_SOURCE_MAX) continue;
    selected.push(item.c);
    takenUrls.add(url);
    perSourceCount.set(item.c.source, (perSourceCount.get(item.c.source) ?? 0) + 1);
  }

  return selected.slice(0, MAX_CANDIDATES);
}

// RSS 수집 → Hard Filter → 소스별 분배 + 점수 백필 (뉴스 선정 로직 수정요청서 1·6~8절)
async function buildCandidateList(supabase: ReturnType<typeof adminClient>): Promise<Candidate[]> {
  const raw = await fetchAllCandidates();
  const usedUrls = await recentlyUsedUrls(supabase);

  let filtered = hardFilter(raw, usedUrls, MAX_LOOKBACK_DAYS);
  // 최근 3일 후보가 부족하면만 5일로 넓힌다 — 넓혀도 부족하면 부족한 채로 둔다(8절, 억지로 채우지 않음)
  if (filtered.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
    filtered = hardFilter(raw, usedUrls, FALLBACK_LOOKBACK_DAYS);
  }

  return distributeByScore(filtered);
}

async function insertRawCandidates(supabase: ReturnType<typeof adminClient>, candidates: Candidate[]) {
  if (candidates.length === 0) return;
  const { error } = await supabase.from("source_article").upsert(
    candidates.map((c) => ({
      source: c.source,
      title: c.title,
      summary: c.summary,
      url: normalizeUrl(c.url),
      published_at: c.publishedAt.toISOString(),
    })),
    { onConflict: "url", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export type GenerationResult = { selectedNews: SelectedNewsItem[]; trendBrief: TrendBriefResult | null; briefingDate: string };

// 뉴스 선정 + AI Trend Briefing 생성. generateBriefingFor·regenerateBriefingFor가 공유한다.
// AI Trend Briefing이 실패해도 News는 그대로 살린다 — trend_brief만 null이 된다 (요청서 17절)
async function buildBriefingPayload(supabase: ReturnType<typeof adminClient>) {
  const candidates = await buildCandidateList(supabase);
  await insertRawCandidates(supabase, candidates);

  // 후보 0건 → LLM 호출 안 함 (4.2.2절)
  // trendBrief와 마찬가지로 뉴스 선정 실패가 브리핑 전체를 죽이지 않게 격리한다 (모델 오류/레이트리밋 등)
  let selectedNews: SelectedNewsItem[] = [];
  if (candidates.length > 0) {
    try {
      selectedNews = await selectTopNews(candidates);
    } catch (e) {
      console.error("[news-select] 뉴스 선정 실패 — 이번 브리핑은 뉴스 없이 진행합니다", e);
    }
  }

  let trendBrief: TrendBriefResult | null = null;
  try {
    // GitHub·Hugging Face는 일반 코드로 수집·필터링한 뒤 소수 후보만 Gemini에 넘긴다 (요청서 5·9절)
    const dev = await fetchDevEcosystem();
    trendBrief = await generateTrendBrief(selectedNews, dev);
  } catch (e) {
    console.error("[trend-briefing] 생성 실패 — News는 그대로 유지합니다", e);
  }

  return { selectedNews, trendBrief };
}

// (user_id, briefing_date) 단위로 브리핑을 생성해 저장한다. 이미 있으면 그대로 재사용한다.
// targetUserIds가 여러 명이면 RSS·Gemini 호출은 1회만 하고 동일 결과를 각자의 행으로 저장한다.
export async function generateBriefingFor(targetUserIds: string[]): Promise<GenerationResult> {
  const supabase = adminClient();
  const briefingDate = todayKSTDateString();

  const { selectedNews, trendBrief } = await buildBriefingPayload(supabase);

  const { error: upsertError } = await supabase.from("briefing").upsert(
    targetUserIds.map((userId) => ({
      user_id: userId,
      briefing_date: briefingDate,
      selected_news: selectedNews,
      trend_brief: trendBrief,
      generated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,briefing_date", ignoreDuplicates: true }
  );
  if (upsertError) throw upsertError;

  return { selectedNews, trendBrief, briefingDate };
}

export async function briefingExistsForToday(): Promise<boolean> {
  const supabase = adminClient();
  const { count, error } = await supabase
    .from("briefing")
    .select("id", { count: "exact", head: true })
    .eq("briefing_date", todayKSTDateString());
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function allProfileUserIds(): Promise<string[]> {
  const supabase = adminClient();
  const { data, error } = await supabase.from("profiles").select("user_id");
  if (error) throw error;
  return (data ?? []).map((p) => p.user_id as string);
}

// 예약 생성용 — 관심 직무를 1개 이상 고른 회원만 채용공고 대상이다
export async function allProfilesWithRoles(): Promise<{ user_id: string; interested_job_roles: string[] }[]> {
  const supabase = adminClient();
  const { data, error } = await supabase.from("profiles").select("user_id, interested_job_roles");
  if (error) throw error;
  return (data ?? []).filter((p) => (p.interested_job_roles ?? []).length > 0);
}
