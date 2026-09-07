// Dashboard.tsx에서 **그대로 옮겨온** 순수 함수·상수·타입 (docs/refactor-plan.md PHASE 0 ② 1순위).
// 컴포넌트 상태를 참조하지 않아 위험도 0인 구역이다. 로직은 한 글자도 안 고쳤다.
//
// 🔴 KEEP_EDITOR_FOCUS는 지뢰다 — onPointerDown/onMouseDown **두 벌을 반드시 같이** 유지해라.
//    한쪽만 붙이면 편집창 버튼이 본문 에디터의 포커스를 빼앗는다(그 선언 위 주석 참고).

import { type Memo, type MemoColor, type MemoType } from "@/lib/memo/types";
import { Lightbulb, FileText, Code2, CircleCheck } from "lucide-react";
import { type IdeaResult } from "@/lib/ai/idea";
import { type DayStatus, type DayStatusLabel } from "@/lib/actions/admin-status";

export const STATUS_OPTIONS = [
  ["planned", "예정", "#c62828", "rgba(255,196,196,.55)"],
  ["in_progress", "진행 중", "#2c4f9e", "rgba(163,208,255,.5)"],
  ["completed", "완료", "#1a7a3a", "rgba(150,230,170,.55)"],
] as const;

// (MEMO_COLORS는 lib/memo/types.ts로 옮겼다 — 색 목록이 세 벌이던 것을 한 벌로. 그 파일 주석 참고.)

// 모듈 스코프에 둬야 참조가 고정된다 — 렌더마다 새 []를 만들면 이걸 받는 하위 memo/useMemo가 매번 무효화된다.
export const EMPTY_MEMOS: Memo[] = [];

// 뉴스사/채용사이트 로고 — 직접 제공받은 Asset만 사용, 외부에서 새로 받아오지 않는다.
// cls는 JOB_SITE_LOGOS와 같은 규칙이다(dashboard.css의 `.row-logo-box.<cls>`와 1:1). 배경이 불투명한
// PNG는 박스 배경이 비치지 않으므로 cls가 필요 없다 — 실측 기준으로만 붙인다:
//   aitimes(투명 0% / 흰 83%), mit(투명 0% / 흰 94%) → 자체 흰 배경, 보정 불필요
//   zdnet(불투명 rgb(7,10,17) 어두운 배경) → 자체 배경이 어두워 다크에 오히려 어울린다, 보정 불필요
//   arstechnica·techcrunch → 배경 투명 + 어두운 잉크. 흰 박스가 필요하다(아래 CSS 주석).
export const NEWS_SOURCE_LOGOS: Record<string, { src: string; cls?: string }> = {
  "AI타임스": { src: "/logos/aitimes.png" },
  "ZDNet Korea": { src: "/logos/zdnet.jpg" },
  "TechCrunch": { src: "/logos/techcrunch.webp", cls: "techcrunch-logo" },
  "MIT News AI": { src: "/logos/mit.png" },
  "Ars Technica AI": { src: "/logos/arstechnica.png", cls: "ars-logo" },
};
// 로고 PNG와 그 PNG에 필요한 박스 보정 클래스를 한 맵에 둔다 — 예전엔 클래스가 JSX 삼항으로
// 원티드에만 붙어 있어서, 점핏·잡코리아는 CSS 규칙을 받을 클래스 자체가 없었다(로고가 깨져 보인 원인).
// cls는 dashboard.css의 `.row-logo-box.<cls>` 규칙과 1:1 대응한다.
export const JOB_SITE_LOGOS: Record<string, { src: string; cls: string }> = {
  "원티드": { src: "/logos/wanted.png", cls: "wanted-logo" },
  "점핏": { src: "/logos/jumpit.png", cls: "jumpit-logo" },
  "잡코리아": { src: "/logos/jobkorea.png", cls: "jobkorea-logo" },
};

// 채용공고 상세의 기술 태그 — 별도 DB 필드가 없으므로 공고 원문(주요업무/자격요건/우대사항)에
// 실제로 등장하는 용어만 골라서 보여준다. AI가 추측해서 만들지 않는다.
export const TECH_TAG_VOCAB = [
  "Python", "TypeScript", "JavaScript", "Java", "Kotlin", "Go",
  "LLM API", "LLM", "RAG", "LangChain", "LangGraph", "MCP", "Prompt Engineering",
  "Vector DB", "Pinecone", "FAISS", "Elasticsearch",
  "FastAPI", "Django", "Flask", "PyTorch", "TensorFlow", "Hugging Face",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Cloud",
  "Airflow", "Kafka", "Redis", "PostgreSQL", "MySQL", "MongoDB",
  "GraphQL", "REST API", "Terraform", "CI/CD", "Git", "Spark", "MLOps",
] as const;
// 공고 원문 필드(주요업무/자격요건/우대사항)는 "[하위 소제목]"으로 이미 구획이 나뉜 채 들어온다
// (예: [LLM 애플리케이션 구축], [프로덕션 운영 및 개선]) — 이걸 무시하고 전부 평평한 bullet로
// 펼치면 한 공고에 40개 넘는 항목이 쌓여 위계가 사라진다. 원문에 있는 구획을 그대로 살려서 보여준다.
export type JobTextGroup = { heading: string | null; bullets: string[] };
export function parseJobTextSections(text: string): JobTextGroup[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const groups: JobTextGroup[] = [];
  let current: JobTextGroup = { heading: null, bullets: [] };
  for (const line of lines) {
    const bracketed = line.match(/^\[(.+)\]$/);
    if (bracketed) {
      if (current.heading !== null || current.bullets.length > 0) groups.push(current);
      current = { heading: bracketed[1].trim(), bullets: [] };
    } else {
      // 🔴 2026-09-01 — 불릿 문자 목록이 좁아서 앞에 · 이 하나 더 남았다(사용자 신고, 잡코리아).
      //    렌더러가 <li>로 자기 불릿을 그리는데 원문 불릿이 안 벗겨지면 두 개로 보인다.
      //    U+00B7(·)만 있었고 한국어 공고에 흔한 ㆍ(U+318D)·∙(U+2219)·•(U+2022) 변형과
      //    ▶■◆ 같은 장식, 그리고 "1." "1)" 번호가 빠져 있었다. 지뢰표 "표기 변이는 양쪽 다 넣어라".
      //    ⚠️ 앞쪽(^)만 벗긴다 — 본문 중간의 · 는 내용이다.
      // 🔴 2026-09-04 — **마침표류가 빠져 있었다(같은 자리의 두 번째 표기 변이 누락).**
      //    점핏 원문이 U+FF0E(．)를 불릿으로 쓴다 — 실측: (주)연호엔지니어링 공고 원문 HTML의
      //    <pre> 안에 134개, 저장값에도 그대로(responsibilities 15 · required_text 10 ·
      //    preferred_text 6). 화면에서는 CSS의 `li::before{content:"•"}`와 겹쳐 `• ．항목`으로
      //    보였다(사용자 신고 "각 행에 ． 가 추가된다"). 우리가 붙인 문자가 아니라 원문 불릿이다.
      //    💀 **ASCII `.`은 이 문자 클래스에 넣으면 안 된다** — `.NET 경험` 같은 정당한 선행
      //       마침표를 깨뜨린다. 그래서 뒤에 공백이 오는 `. ` 형태만 별도 분기로 벗긴다.
      //    실측 근거(전체 241공고 5,466줄): 선행 ． 31건(점핏 전용) · 선행 ASCII `.` 18건은
      //    전부 `. Python` `. PyTorch`처럼 공백이 뒤따르는 불릿이고 `.NET`류 위험 사례 **0건**.
      //    점핏 전용 분기를 만들지 않았다 — 이 공통 정규화 한 곳만 넓혔다(helpers.check.ts가 지킨다).
      // 🔴 2026-09-07 — **ASCII `?`가 빠져 있었다(같은 자리의 세 번째 표기 변이 누락).**
      //    잡코리아 원본 HTML이 불릿 자리에 ASCII `?`(0x3f)를 담아 보낸다 — 실측: Gno 49888581
      //    (㈜시옷) 응답이 `charset=utf-8`이고 주변 한글은 정상 UTF-8인데 그 자리 바이트가 `3f 20`이다
      //    (`<span style="letter-spacing: 0px;">? AI/ML 모델 연구 및 개발</span>`).
      //    즉 우리 디코딩·파싱이 만든 게 아니라 **잡코리아가 그렇게 준다**(작성자가 심볼 폰트 불릿을
      //    쓴 뒤 잡코리아 쪽 저장에서 `?`로 떨어진 것으로 보인다). DB 저장값도 그래서 `?`가 맞다.
      //    화면에서는 CSS의 `li::before{content:"•"}`와 겹쳐 `• ? AI/ML 모델 연구`로 보였다
      //    (사용자 신고 "공고 앞에 ?가 보인다"). 실측: 전체 263건 중 잡코리아 4개사가 해당.
      //    💀 **ASCII `?`도 `.`과 같이 문자 클래스에 넣으면 안 된다** — 문장 끝 물음표는 내용이다.
      //       `. `와 똑같이 **줄 맨 앞 + 뒤에 공백**인 형태만 별도 분기로 벗긴다.
      current.bullets.push(line.replace(/^[\s•·ㆍ∙‧・･▪▫◦‣⁃▶▷■□●○◆◇★☆※．。｡\-–—*]+|^[.?]\s+|^\s*(?:\d+[.)]|\[\d+\])\s*/g, "").trim());
    }
  }
  if (current.heading !== null || current.bullets.length > 0) groups.push(current);
  return groups.filter((g) => g.heading || g.bullets.length > 0);
}
export function extractTechTags(...texts: (string | null | undefined)[]): string[] {
  const combined = texts.filter(Boolean).join(" ");
  return TECH_TAG_VOCAB.filter((term) => {
    const pattern = /^[A-Za-z0-9 ]+$/.test(term)
      ? new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i")
      : null;
    return pattern ? pattern.test(combined) : combined.toLowerCase().includes(term.toLowerCase());
  });
}

export const SUMMARY_MAX_LENGTH = 30;

// 프로젝트 상태 최종 4종 — 아이디어(Yellow)/기획안작성(Purple)/개발중(Blue)/완료(Green), slug는 CSS 토큰과 1:1 대응
export const PROJECT_STATUS_META: Record<string, { slug: "idea" | "planning" | "developing" | "completed"; icon: typeof Lightbulb }> = {
  "아이디어": { slug: "idea", icon: Lightbulb },
  "기획안작성": { slug: "planning", icon: FileText },
  "개발중": { slug: "developing", icon: Code2 },
  "완료": { slug: "completed", icon: CircleCheck },
};
// 최근 수정 — 올해면 MM.DD만, 아니면 YYYY.MM.DD (연도 반복 표시 방지)
export function formatProjectUpdated(iso: string, todayYear: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const [y, m, d] = parts.split("-");
  return Number(y) === todayYear ? `${m}.${d}` : `${y}.${m}.${d}`;
}

export function postitColorClass(color: MemoColor): string {
  return { yellow: "", pink: "c1", green: "c2", blue: "c3", purple: "c4", white: "c5", black: "c6", darkgray: "c7" }[color];
}

// Monthly MEMO Create — 포스트잇처럼 전체를 색칠하지 않고 입력창만 메모지 색상으로 물들인다.
// postitColorClass는 yellow가 ""(기본값)라 이걸론 yellow를 못 골라서 색상별로 전부 클래스를 준다.
export function colorInputClass(color: MemoColor): string {
  return `color-input-${color}`;
}

export const MEMO_TYPE_OPTIONS: { value: MemoType; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "dev_note", label: "Dev Note" },
  { value: "free_note", label: "Free Note" },
];

// Monthly MEMO 하단 목록 — 날짜 범위 필터(선택일/이번 달/기간/전체 기간). 메모 유형 필터(전체/Todo/...)와
// 독립적으로 조합된다. "기간"을 고르면 같은 패널이 시작일/종료일 입력 화면으로 바뀌고, 적용을 눌러야
// 실제로 반영된다(취소 시 기존 범위 유지) — 별도 팝오버를 새로 띄우지 않고 패널 내용만 전환한다.
export type DateRangeMode = "selected-day" | "month" | "custom" | "all";
export const DATE_RANGE_OPTIONS: [DateRangeMode, string][] = [
  ["selected-day", "선택일"], ["month", "이번 달"], ["custom", "기간"], ["all", "전체 기간"],
];
export function formatRangeLabel(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? start.slice(5).replace("-", ".") : start.replaceAll("-", ".")} ~ ${end.slice(5).replace("-", ".")}`;
}
// AI 호출(뉴스/채용공고/AI Trend Briefing/Idea Build) 실패 시 공통으로 쓰는 오류 안내 + 재시도 UI.
// 문구만 기능별로 다르고 나머지는 전부 같은 카드 — 각 기능은 자기 결과 영역 안에서 이걸 대신 그린다.
export const AI_ERROR_COPY = {
  news: { title: "뉴스를 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "" },
  jobs: { title: "채용공고를 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "" },
  briefing: { title: "오늘의 브리핑을 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "실패한 요청은 이용 횟수에 포함되지 않습니다." },
  idea: { title: "아이디어를 생성하지 못했어요", description: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", helperText: "실패한 요청은 이용 횟수에 포함되지 않습니다." },
} as const;

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// Monthly MEMO/Project 전체보기·수정 화면 공용 "맨 위로 이동" — window가 아니라 각 dialog의 실제
// scroll container(ref) 기준으로 동작한다. 새 컴포넌트 없이 이 훅 하나를 각 화면에서 재사용한다.
export const SCROLL_TOP_THRESHOLD = 400;
// 🔴🔴 편집창 안 버튼이 본문 에디터의 포커스를 빼앗지 않게 하는 공통 props. **두 이벤트 다 막아야 한다.**
//
// 지뢰표에 "편집창 안의 모든 버튼에 onPointerDown preventDefault가 붙었는지 세라"가 있었고 실제로 다
// 붙어 있었다 — 그런데 **틀린 이벤트에 붙어 있었다.** WebKit(iOS Safari·Chrome 공통)에서 포커스와
// blur를 실제로 움직이는 것은 `mousedown`이고, `pointerdown`의 preventDefault는 뒤따르는 호환
// mousedown을 막아주지 않는다. 그래서 탭하는 순간 본문이 blur된다.
// 근거: 잘 동작하는 .mobile-rich-toolbar만 유일하게 `onMouseDown`을 쓰고 있었다(MemoRichEditor.tsx).
// 실기기 실측(2026-08-26, iPhone Chrome, ?debug=vp): 위로가기 탭 후 `focus=BODY.min-h-full`,
// `caret none` — 에디터가 포커스를 통째로 잃었다. 정상 동작한 경우는 `caret t=480 inView=YES`로 살아 있었다.
//
// blur되면 연쇄가 전부 따라온다: 키보드 닫힘 → --kb-inset 326→0 → 껍데기 padding 축소 →
// 스크롤러 clientHeight 233→520(실측) → 그 리플로우가 스크롤을 되돌린다("위로가기 안 먹힘"),
// 캐럿이 사라지고 보기모드로 튕기며, 다시 키보드를 올리면 본문과 키보드 사이에 죽은 공간이 생긴다.
// 메모 내용을 **고쳤을 때만** 나던 이유도 이것이다 — 안 고쳤으면 키보드가 안 떠 있어 잃을 포커스가 없다.
//
// 새 버튼을 편집창에 넣을 때는 이걸 spread 해라. 한 쪽만 붙이면 같은 지뢰를 다시 밟는다.
export const KEEP_EDITOR_FOCUS = {
  onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
} as const;
// 자동저장 축소 가드가 발동한 것을 ViewportDebug 패널로 올린다. 컴포넌트 **밖**에 두는 이유는
// React Compiler ESLint(react-hooks/immutability)가 렌더 함수 안에서의 전역 쓰기를 막기 때문이다.
// ⚠️ 이 값은 ViewportDebug가 실제로 그린다(`__spBodyShrink`). 계측을 새로 넣을 때는 **패널에
//    그리는 줄까지 같이** 넣어라 — 아래 traceScrollTop이 정확히 그걸 빠뜨려서 죽어 있었다.
export function noteBodyShrink(line: string) {
  if (typeof window === "undefined") return;
  (window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink = [line];
}
export function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ponytail: vercel.json의 cron 스케줄과 수동 동기화 — 스케줄을 바꾸면 이 값도 같이 바꿔야 한다.
export const CRON_SCHEDULED_TIME_KST = "10:10";

export const SYSTEM_STATUS_BADGE_CLASS: Record<DayStatusLabel, string> = {
  "정상": "ok",
  "점검 필요": "partial",
  "일부 실패": "partial",
  "실패": "failed",
  "실패 후 복구": "recovered",
  "기록 없음": "empty",
};

export type SystemStatusErrorState = { message: string; reason: "forbidden" | "query_failed"; at: string };

// 오늘 하루 요약이 아니라 "최근 7일 중 가장 최근" 기준 — 오늘 아직 기록이 없어도 최근 정상 실행/최근
// 오류를 계속 보여줘야 운영자가 "언제부터 문제였는지"를 바로 알 수 있다.
// "18/20명"처럼 회원 커버리지를 붙인다 — 이 필드가 없는 과거 기록(newsMemberTotal null)은 그냥 생략한다.
export function memberCoverageSuffix(covered: number | null, total: number | null): string {
  return total !== null && covered !== null ? ` · ${covered}/${total}명` : "";
}

export function buildSystemOverview(days: DayStatus[]) {
  const today = days[0];
  const coverage = memberCoverageSuffix(today.newsMemberCovered, today.newsMemberTotal);
  const newsText = today.newsOk === null ? "-" : !today.newsOk ? "실패" : today.newsCount !== null ? `정상 · ${today.newsCount}건${coverage}` : `정상${coverage}`;
  // aiTrendOk는 이번 실행에서 실제로 생성을 시도했을 때만 기록된다 — 이미 생성돼 있어 스킵한 경우와
  // "기록 자체가 없는" 경우를 구분한다(추적 안 되는 걸 임의로 "정상"이라 하지 않는다).
  // "스킵(이미 생성됨)"은 모바일 폭에서 한 줄에 안 들어가 괄호가 어중간하게 잘려 보인다 —
  // 사유를 둘째 줄로 내린다(.sysstatus-job-breakdown이 이미 세로 스택이라 재사용한다).
  const aiTrend: { main: string; note: string | null } =
    today.aiTrendOk !== null
      ? { main: today.aiTrendOk ? "정상" : "실패", note: null }
      : today.newsSkipped
      ? { main: "스킵", note: "(이미 생성됨)" }
      : { main: "-", note: null };
  // 분모는 cron의 자기 보고(jobUsers)가 아니라 프로필로 다시 센 jobsEligible을 쓴다 — 자기 보고만
  // 믿었던 탓에 legacy 재설정 대기자 3명이 "사용자 5명 / 실패 0명"에 섞여 12일간 안 보였다.
  const jobOk = today.outcome.jobsOk;
  const jobEligible = today.outcome.jobsEligible;
  const jobIssueCount = today.outcome.jobIssues.length + today.outcome.jobIssuesOmitted;
  const jobPendingCount = today.outcome.jobsPendingReset;

  let lastSuccessAt: string | null = null;
  let lastError: { message: string; at: string } | null = null;
  for (const day of days) {
    if (!lastSuccessAt && (day.label === "정상" || day.label === "일부 실패" || day.label === "실패 후 복구")) {
      lastSuccessAt = day.cronFinishedAt ?? day.fallbackAt ?? day.finalGeneratedAt;
    }
    if (!lastError && day.errorMessage) lastError = { message: day.errorMessage, at: day.cronStartedAt ?? day.fallbackAt ?? day.date };
    if (lastSuccessAt && lastError) break;
  }

  return { overallLabel: today.label, newsText, aiTrend, jobOk, jobEligible, jobIssueCount, jobPendingCount, lastSuccessAt, lastError };
}

export function isoDate(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// 날짜 칸에 표시할 최대 3개를 정할 때: 기간 메모(start_date !== end_date) 우선, 그 다음 최근 등록/수정순.
// 컴포넌트 state를 참조하지 않는 순수 함수라 isoDate처럼 모듈 스코프에 둔다(매 렌더 재생성 방지).
export function calendarCellPriority(memos: Memo[]): Memo[] {
  return [...memos].sort((a, b) => {
    const rangeDiff = Number(b.start_date !== b.end_date) - Number(a.start_date !== a.end_date);
    if (rangeDiff !== 0) return rangeDiff;
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

export function groupMemosByDay(memos: Memo[], year: number, month0: number, monthLastDate: number): Map<number, Memo[]> {
  const map = new Map<number, Memo[]>();
  for (const m of calendarCellPriority(memos)) {
    const startDay = m.start_date < isoDate(year, month0, 1) ? 1 : Number(m.start_date.slice(8, 10));
    const endDay = m.end_date > isoDate(year, month0, monthLastDate) ? monthLastDate : Number(m.end_date.slice(8, 10));
    for (let d = startDay; d <= endDay; d++) {
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(m);
    }
  }
  return map;
}

// Idea Build 결과 스키마가 바뀌기 전(구 필드: headline/direction/tech)에 저장된 오늘자 row가 있으면
// 그대로 렌더링했을 때 필드가 없어 화면이 깨진다 — 새 스키마 모양이 아니면 "결과 없음"으로 취급한다.
export function isIdeaResult(v: unknown): v is IdeaResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.recommendationTitle === "string" && Array.isArray(o.developmentSteps);
}
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* 클립보드 권한 없으면 무시 */ }
}


export type MemoReorder = {
  displayed: Memo[];
  draggingId: string | null;
  group: string;
  pinned: boolean;
  bind: (m: Memo) => Record<string, unknown>;
};
