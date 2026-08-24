import { recordCollectError } from "./collect-trace.ts";
import type { ExtractedJobFields } from "./extract-fields";

// 원티드는 클라이언트 렌더링 SPA라 Tavily Extract로는 본문을 못 읽지만,
// 최초 HTML에 __NEXT_DATA__로 공고 원본 데이터가 그대로 박혀 있어 이걸 직접 파싱한다.
type WantedInitialData = {
  position: string;
  company?: { company_name?: string };
  main_tasks?: string;
  requirements?: string;
  preferred_points?: string;
  due_time?: string;
  confirm_time?: string;
  status?: string;
  career?: { annual_from?: number | null; annual_to?: number | null; is_newbie?: boolean };
};

// due_time/confirm_time은 오프셋 없는 "YYYY-MM-DDTHH:mm:ss" 형태의 KST 벽시계 값으로 내려온다.
// 오프셋이 없으면 +09:00을 붙여 실제 시각(instant)으로 해석한다(오프셋이 이미 있으면 그대로 둔다).
function parseWantedTimestamp(value: string): Date {
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? new Date(value) : new Date(`${value}+09:00`);
}

function formatCareer(career?: WantedInitialData["career"]): string {
  if (!career) return "경력무관";
  const { annual_from: from, annual_to: to, is_newbie } = career;
  if (is_newbie) return "신입";
  if (!from && !to) return "경력무관";
  if (!to || to >= 100) return `경력 ${from ?? 0}년 이상`; // 100은 원티드의 "상한 없음" 표시값
  return `경력 ${from ?? 0}~${to}년`;
}

export async function fetchWantedJobDetail(url: string): Promise<ExtractedJobFields | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (SkillPilot job collector)" },
    signal: AbortSignal.timeout(15_000),
  });
  // 차단(403)·레이트리밋(429)도 여기로 온다. 조용히 null을 주면 호출부에는 "결과 없음"으로만
  // 보여서 원인을 영영 알 수 없다 — 상태 코드를 남긴다.
  if (!res.ok) { recordCollectError("원티드 상세", `HTTP ${res.status} ${url.slice(0, 60)}`); return null; }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;

  let data: WantedInitialData;
  try {
    data = JSON.parse(match[1]).props?.pageProps?.initialData;
  } catch {
    return null;
  }
  if (!data?.position || !data.main_tasks) return null;

  // status 실제값 검증(2026-08-13, 28절 P0) — 활성/마감 샘플 다수를 직접 조회해 "active"/"close" 두 값만
  // 확인했다. 대부분의 마감 공고가 due_time은 null인 채로 status만 close였다(검색 인덱스가 마감 공고를
  // 올려보내는 문제의 실제 원인, 6-1절) — due_time 단독 체크보다 이게 훨씬 강한 신호다.
  if (data.status === "close") return null;

  // 마감된 공고는 제외 (5.3절) — status가 확인 안 되는 값이거나 없을 때의 보조 안전장치로 유지한다.
  // due_time은 "2026-08-14T00:00:00"처럼 타임존 표기 없이 내려온다(실제 조회로 확인함) — KST 벽시계 값인데
  // 오프셋 없이 new Date()로 그대로 파싱하면 서버 실행 타임존(UTC)으로 해석되어 최대 9시간 늦게 마감 처리된다.
  if (data.due_time && parseWantedTimestamp(data.due_time) < new Date()) return null;

  return {
    is_job_posting: true,
    company: data.company?.company_name ?? "",
    title: data.position,
    role: data.position,
    responsibilities: data.main_tasks ?? "",
    required_text: data.requirements ?? "",
    preferred_text: data.preferred_points ?? "",
    career_requirement: formatCareer(data.career),
    deadline: data.due_time ? data.due_time.slice(0, 10) : null,
    posted_at: data.confirm_time ?? null,
    date_confidence: data.confirm_time ? "high" : "unknown",
    source_status: data.status ?? null,
  };
}
