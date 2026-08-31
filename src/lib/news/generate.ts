import { createAdminClient as adminClient } from "@/lib/supabase/admin";
import { fetchAllCandidates, type Candidate } from "./rss";
import { matchesKeywords, normalizeUrl, scoreArticle } from "./filter";
import { selectTopNews, type SelectedNewsItem } from "./select";
import { generateTrendBrief, type TrendBriefResult } from "./trend-brief";
import { fetchDevEcosystem } from "./dev-ecosystem";
import {
  MAX_CANDIDATES, MAX_LOOKBACK_DAYS, FALLBACK_LOOKBACK_DAYS, MIN_CANDIDATES_BEFORE_FALLBACK,
  PER_SOURCE_INITIAL, PER_SOURCE_MAX, NEWS_SOURCES, SOURCE_LOOKBACK_DAYS,
  FALLBACK_ENGLISH_LOOKBACK_DAYS, MAX_SELECTED,} from "./sources";
import { dedupeByEvent } from "./event-dedupe";
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

// 소스별 예외가 있으면 그중 넓은 쪽을 쓴다(sources.ts SOURCE_LOOKBACK_DAYS 주석 참고) —
// 전역 창이 fallback으로 넓어졌을 때 예외 소스가 오히려 좁아지지 않게 max로 잡는다.
// wideEnglish는 조건부 fallback 전용 — **SOURCE_LOOKBACK_DAYS에 등록된 소스에만** 적용된다.
// 그 목록이 곧 "발행 빈도가 낮은 영문 소스"이고, 국내 소스는 여기에 없으므로 창이 안 넓어진다.
function lookbackFor(source: string, lookbackDays: number, wideEnglish = false): number {
  const perSource = SOURCE_LOOKBACK_DAYS[source] ?? 0;
  if (wideEnglish && perSource > 0) return Math.max(lookbackDays, FALLBACK_ENGLISH_LOOKBACK_DAYS);
  return Math.max(lookbackDays, perSource);
}

function withinLookback(candidate: Candidate, lookbackDays: number, wideEnglish = false): boolean {
  const days = (Date.now() - candidate.publishedAt.getTime()) / (24 * 60 * 60 * 1000);
  return days <= lookbackFor(candidate.source, lookbackDays, wideEnglish);
}

// Hard Filter는 날짜·중복·(종합 소스만) AI 관련성 정도로 최소화한다. 채용/행사/수상 홍보는 여기서
// 제거하지 않는다 — §10 "Hard Filter 최소화" 원칙에 따라 filter.ts의 Ranking 감점으로만 처리한다
// (요청서 §2·§5가 서로 다른 처리를 요구해 §10을 우선해 통일함, 2026-08-09). 애매한 기사는 점수만
// 낮아진 채 후보로 남는다.
// 관리자 페이지 "뉴스 파싱 기록"용 단계별 수치. 예전엔 "정상 4건 / 5명"만 남아서, 하루 4건을
// 못 채운 날에 시장에 기사가 없었던 건지 필터가 너무 좁았던 건지 화면에서 구별할 수 없었다.
// 채용 쪽 collect-trace.ts가 하는 일을 뉴스에도 해주는 값들이다(저장은 cron_runs.details).
export type NewsPipelineStats = {
  sources: number;      // RSS 소스 수
  fetched: number;      // 수집된 기사 수(중복 제거 전)
  rejectedOld: number;  // lookback 기간 초과
  rejectedTopic: number;// 제목 키워드 미해당(주제 미해당)
  rejectedDup: number;  // 이미 쓴 URL 또는 배치 내 중복
  passed: number;       // hard filter 통과
  // ⚠️ optional이다 — 이 필드가 생기기 전(2026-08-31 이전) cron_runs 기록에는 없다.
  mergedEvents?: number; // 같은 사건으로 접힌 건수(출처별 배분 전 event-dedupe)
  distinct?: number;     // 사건 단위로 접은 뒤 남은 서로 다른 사건 수
  fallbackUsed?: boolean;// 1차가 4건에 못 미쳐 영문 소스 lookback을 넓혀 재선정했나
  candidates: number;   // 소스 분산 후 LLM에 넘긴 후보 수
  selected: number;     // AI가 최종 선정한 건수
  lookbackDays: number; // 실제로 적용된 lookback(부족하면 넓힌다)
};

// 탈락 이유를 세면서 거른다. 통계가 없던 시절엔 이 함수가 그냥 filter였는데, 그러면 "통과 0건"과
// "수집 0건"이 화면에서 같아 보인다 - 어느 단계에서 사라졌는지가 진단의 전부다.
// export는 자체 점검(filter-tally.check.ts)이 tally 계산을 직접 돌려보기 위한 것이다.
export function hardFilter(
  raw: Candidate[],
  usedUrls: Set<string>,
  lookbackDays: number,
  tally?: { rejectedOld: number; rejectedTopic: number; rejectedDup: number },
  wideEnglish = false
): Candidate[] {
  const seenInBatch = new Set<string>();
  return raw.filter((c) => {
    if (!withinLookback(c, lookbackDays, wideEnglish)) { if (tally) tally.rejectedOld += 1; return false; }
    if (!matchesKeywords(c.title)) { if (tally) tally.rejectedTopic += 1; return false; }
    const url = normalizeUrl(c.url);
    if (usedUrls.has(url) || seenInBatch.has(url)) { if (tally) tally.rejectedDup += 1; return false; }
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
// skipDedup은 수동 "지금 업데이트" 전용 — 오늘 하루 여러 번 강제 재생성하면 앞선 시도가 뽑은 URL이
// (전체 사용자 공유 briefing이라 recentlyUsedUrls가 계정 구분 없이) 계속 쌓여 후보가 말라버린다.
export async function buildCandidateList(
  supabase: ReturnType<typeof adminClient>,
  skipDedup = false,
  wideEnglish = false
): Promise<{ candidates: Candidate[]; stats: Omit<NewsPipelineStats, "selected"> }> {
  const raw = await fetchAllCandidates();
  const usedUrls = skipDedup ? new Set<string>() : await recentlyUsedUrls(supabase);

  let lookbackDays = MAX_LOOKBACK_DAYS;
  let tally = { rejectedOld: 0, rejectedTopic: 0, rejectedDup: 0 };
  let filtered = hardFilter(raw, usedUrls, lookbackDays, tally, wideEnglish);
  // 최근 3일 후보가 부족하면만 5일로 넓힌다 — 넓혀도 부족하면 부족한 채로 둔다(8절, 억지로 채우지 않음)
  if (filtered.length < MIN_CANDIDATES_BEFORE_FALLBACK) {
    // 넓혀서 다시 거르면 탈락 사유도 처음부터 다시 세야 한다 — 이어서 더하면 같은 기사가 두 번 잡힌다.
    lookbackDays = FALLBACK_LOOKBACK_DAYS;
    tally = { rejectedOld: 0, rejectedTopic: 0, rejectedDup: 0 };
    filtered = hardFilter(raw, usedUrls, lookbackDays, tally, wideEnglish);
  }

  // 🔴 **출처별 배분 전에** 같은 사건을 접는다(event-dedupe.ts 주석에 실측 근거).
  //    여기서 접어야 distributeByScore의 30칸이 30개의 서로 다른 사건으로 채워진다.
  //    배분 뒤에 접으면 이미 중복이 칸을 먹은 뒤라 늦다.
  const { kept, merged } = dedupeByEvent(filtered);
  const candidates = distributeByScore(kept);
  return {
    candidates,
    stats: {
      sources: NEWS_SOURCES.length, fetched: raw.length,
      ...tally, passed: filtered.length,
      mergedEvents: merged, distinct: kept.length,
      candidates: candidates.length, lookbackDays,
    },
  };
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

export type GenerationResult = { selectedNews: SelectedNewsItem[]; trendBrief: TrendBriefResult | null; briefingDate: string; newsStats: NewsPipelineStats };

// 🔴 조건부 fallback — **1차 결과가 목표에 못 미칠 때만** 후보 검색 범위를 한 단계 넓혀 다시 고른다.
//
// 왜 여기인가: 실측으로 확인된 병목은 품질 필터도 PER_SOURCE_MAX도 아니라 **비-AI타임스 공급**이다.
// 최종 4건에 한 출처는 2건까지만 들어가므로 3·4번째 슬롯은 반드시 다른 매체에서 나와야 하는데,
// 저빈도 영문 소스(TechCrunch·Ars·MIT)가 창에 안 들어오는 날은 그 재료가 마른다.
//
// ★ **선정·랭킹 로직은 한 줄도 안 건드린다.** 넓힌 후보로 `selectTopNews`를 **그대로 다시 부른다** —
//   품질 기준·사건 중복 제거·recentlyUsedUrls·출처 상한(2)·번역 관문이 전부 같은 경로를 다시 탄다.
//   "완화된 2차 기준" 같은 것은 존재하지 않는다. 새 경로를 만들면 그 경로만 규칙이 어긋난다.
// ★ 넓힌 쪽이 더 많이 고르지 못하면 **1차 결과를 그대로 쓴다.** 억지로 4건을 채우지 않는다.
// ★ 1차가 이미 목표를 채웠으면 이 함수는 추가 호출을 **0회** 한다(비용은 부족한 날에만 든다).
export async function selectWithFallback(
  supabase: ReturnType<typeof adminClient>,
  skipDedup: boolean,
  first: { candidates: Candidate[]; items: SelectedNewsItem[] },
): Promise<{ items: SelectedNewsItem[]; candidates: Candidate[]; fallbackUsed: boolean }> {
  if (first.items.length >= MAX_SELECTED) {
    return { items: first.items, candidates: first.candidates, fallbackUsed: false };
  }
  console.log(`[news-select] 조건부 fallback: 1차 ${first.items.length}건(목표 ${MAX_SELECTED}) — 영문 소스만 ${FALLBACK_ENGLISH_LOOKBACK_DAYS}일로 넓혀 재선정`);
  try {
    const wide = await buildCandidateList(supabase, skipDedup, true);
    const added = wide.candidates.length - first.candidates.length;
    console.log(`[news-select] fallback 후보: ${first.candidates.length} → ${wide.candidates.length}건 (${added >= 0 ? "+" : ""}${added})`);
    if (wide.candidates.length === 0) return { items: first.items, candidates: first.candidates, fallbackUsed: true };
    const wideItems = await selectTopNews(wide.candidates);
    if (wideItems.length > first.items.length) {
      console.log(`[news-select] fallback 채택: ${first.items.length}건 → ${wideItems.length}건`);
      return { items: wideItems, candidates: wide.candidates, fallbackUsed: true };
    }
    console.log(`[news-select] fallback 미채택: 넓혀도 ${wideItems.length}건 — 1차 ${first.items.length}건을 유지한다`);
    return { items: first.items, candidates: first.candidates, fallbackUsed: true };
  } catch (e) {
    console.error("[news-select] fallback 실패 — 1차 결과만 사용", e);
    return { items: first.items, candidates: first.candidates, fallbackUsed: true };
  }
}

// 뉴스 선정 + AI Trend Briefing 생성.
// AI Trend Briefing이 실패해도 News는 그대로 살린다 — trend_brief만 null이 된다 (요청서 17절)
async function buildBriefingPayload(supabase: ReturnType<typeof adminClient>, skipDedup = false) {
  // dev 생태계 수집은 뉴스 후보/선정과 서로 무관한 입력이라 기다릴 필요 없이 동시에 시작한다 —
  // trendBrief만 이 결과를 나중에 필요로 한다.
  const [{ candidates: firstCandidates, stats: baseStats }, dev] = await Promise.all([buildCandidateList(supabase, skipDedup), fetchDevEcosystem()]);

  // 후보 0건 → LLM 호출 안 함 (4.2.2절)
  // trendBrief와 마찬가지로 뉴스 선정 실패가 브리핑 전체를 죽이지 않게 격리한다 (모델 오류/레이트리밋 등)
  let selectedNews: SelectedNewsItem[] = [];
  let candidates = firstCandidates;
  let fallbackUsed = false;
  if (firstCandidates.length > 0) {
    try {
      selectedNews = await selectTopNews(firstCandidates);
    } catch (e) {
      console.error("[news-select] 뉴스 선정 실패 — 이번 브리핑은 뉴스 없이 진행합니다", e);
    }
    // 🔴 4건에 못 미칠 때만 후보 검색 범위를 넓혀 한 번 더 고른다(위 selectWithFallback 주석).
    const r = await selectWithFallback(supabase, skipDedup, { candidates: firstCandidates, items: selectedNews });
    selectedNews = r.items;
    candidates = r.candidates;
    fallbackUsed = r.fallbackUsed;
  }
  // 원본 후보 적재는 **최종적으로 쓴 후보 목록**으로 한다 — fallback이 채택되면 그쪽이 실제 재료다.
  await insertRawCandidates(supabase, candidates);

  let trendBrief: TrendBriefResult | null = null;
  try {
    trendBrief = await generateTrendBrief(selectedNews, dev);
  } catch (e) {
    console.error("[trend-briefing] 생성 실패 — News는 그대로 유지합니다", e);
  }

  return { selectedNews, trendBrief, newsStats: { ...baseStats, selected: selectedNews.length, fallbackUsed } };
}

// (user_id, briefing_date) 단위로 브리핑을 생성해 저장한다. 이미 있으면 그대로 재사용한다.
// targetUserIds가 여러 명이면 RSS·Gemini 호출은 1회만 하고 동일 결과를 각자의 행으로 저장한다.
export async function generateBriefingFor(targetUserIds: string[], skipDedup = false): Promise<GenerationResult> {
  const supabase = adminClient();
  const briefingDate = todayKSTDateString();

  const { selectedNews, trendBrief, newsStats } = await buildBriefingPayload(supabase, skipDedup);

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

  return { selectedNews, trendBrief, briefingDate, newsStats };
}

// 관리자 페이지 "N건/M명" 표시용 — 오늘 실제로 briefing 행을 가진 회원 수(=전체 회원 중 몇 명이
// 뉴스를 받았는지).
export async function countTodaysBriefingRows(): Promise<number> {
  const supabase = adminClient();
  const { count, error } = await supabase
    .from("briefing")
    .select("id", { count: "exact", head: true })
    .eq("briefing_date", todayKSTDateString());
  if (error) throw error;
  return count ?? 0;
}

export async function briefingExistsForToday(): Promise<boolean> {
  return (await countTodaysBriefingRows()) > 0;
}

// briefingExistsForToday()가 true란 뜻은 "오늘자 콘텐츠가 이미 있다"이지 "전 회원이 오늘자 행을
// 가졌다"가 아니다 — 흔히 크론(10:10)보다 먼저 누군가 개별 접속해 fallback으로 자기 행 하나만
// 먼저 만들어두는 경우다. 그런데 cron/route.ts는 이 플래그가 true면 전 회원 삽입 자체를 통째로
// 건너뛰어서, 그 하루는 fallback을 트리거한 그 한 명만 행을 갖고 나머지 전원은 그날 히스토리가
// 빈다(뉴스는 전 회원 공유 콘텐츠라 "새로 만들지 않는다"와 "회원별 행을 안 채운다"는 별개 결정이어야
// 했는데 하나로 묶여 있었다). 콘텐츠는 재사용하고, 아직 오늘자 행이 없는 회원에게만 같은 내용을
// 그대로 채워 넣는다.
export async function backfillMissingBriefingRows(allUserIds: string[]): Promise<number> {
  const supabase = adminClient();
  const briefingDate = todayKSTDateString();

  const { data: rows, error: rowsError } = await supabase
    .from("briefing")
    .select("user_id, selected_news, trend_brief")
    .eq("briefing_date", briefingDate);
  if (rowsError) throw rowsError;
  const source = rows?.[0];
  if (!source) return 0; // 호출 시점엔 최소 1건 있다고 가정하지만 방어적으로 처리

  const have = new Set((rows ?? []).map((r) => r.user_id as string));
  const missing = allUserIds.filter((id) => !have.has(id));
  if (missing.length === 0) return 0;

  const { error: upsertError } = await supabase.from("briefing").upsert(
    missing.map((userId) => ({
      user_id: userId,
      briefing_date: briefingDate,
      selected_news: source.selected_news,
      trend_brief: source.trend_brief,
      generated_at: new Date().toISOString(),
    })),
    { onConflict: "user_id,briefing_date", ignoreDuplicates: true }
  );
  if (upsertError) throw upsertError;
  return missing.length;
}

export async function allProfileUserIds(): Promise<string[]> {
  const supabase = adminClient();
  const { data, error } = await supabase.from("profiles").select("user_id");
  if (error) throw error;
  return (data ?? []).map((p) => p.user_id as string);
}

// 예약 생성용 — 관심 직무를 1개 이상 고른 회원만 채용공고 대상이다. job_role_priority도 같이 읽어야
// cron(예약 생성, primary 경로)에서도 quota가 우선순위를 반영한다 — 안 읽으면 cron이 매번 canonical
// 순서로 재정렬해 우선순위 기능이 무력화된다.
export async function allProfilesWithRoles(): Promise<{ user_id: string; interested_job_roles: string[]; job_role_priority: string[] }[]> {
  const supabase = adminClient();
  const { data, error } = await supabase.from("profiles").select("user_id, interested_job_roles, job_role_priority");
  if (error) throw error;
  return (data ?? []).filter((p) => (p.interested_job_roles ?? []).length > 0);
}
