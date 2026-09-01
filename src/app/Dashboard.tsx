"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./dashboard.css";
import "./auth.css";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
import type { SelectedNewsItem } from "@/lib/news/select";
import type { JobsView, SavedJobRow } from "@/lib/jobs/get-jobs";
import type { Memo, MemoColor, MemoType, TodoStatus, SourceType, ContentFormat, ContentMode } from "@/lib/memo/types";
import { defaultMemoColor, MEMO_COLORS } from "@/lib/memo/types";
import {
  createMemo, updateMemo, deleteMemo, toggleImportant, setMemoPinned, reorderPinnedMemos, recordMemoSource,
  copySelectionToMemo as copySelectionToMemoAction,
  copyFullNewsToMemo as copyFullNewsToMemoAction,
  copyFullJobToMemo as copyFullJobToMemoAction,
  copyFullTrendToMemo as copyFullTrendToMemoAction,
  getMemosForDateAction, getMemosForMonthAction, getMemosForRangeAction,
} from "@/lib/actions/memo";
import { toEditableHtml, htmlToPlainText, memoPreview, hasRichFormatting, plainTextToHtml, newsFullBlockHtml, jobFullBlockHtml, trendFullBlockHtml } from "@/lib/memo/rich-text";
import { MemoRichEditor, noteScrollTopTap, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import { WaveField, type FieldState } from "@/components/auth/WaveField";
import { JobRolePicker } from "@/components/auth/JobRolePicker";
import { RichMemoContent } from "@/components/memo/RichMemoContent";
import { PROJECT_STATUSES, type ProjectIdea } from "@/lib/project/types";
import { PROJECT_TEMPLATE_HTML, PROJECT_BODY_PLACEHOLDER, toggleTaskItemInHtml } from "@/lib/project/template";
// Undo2/Redo2 — 예전엔 유니코드 글자 ↶(U+21B6)/↷(U+21B7)를 그대로 썼는데, SUIT·Noto Sans KR
// 어느 쪽에도 이 글리프가 없어서 모바일 브라우저가 제각각 폴백 폰트로 그렸다(굵기·크기가 전혀 안
// 맞는 기괴한 곡선 화살표로 보였다). 툴바 나머지가 이미 쓰고 있는 lucide 아이콘으로 통일한다.
import { Lightbulb, FileText, Code2, CircleCheck, Dices, Trash2, UserRound, LogOut, Lock, Maximize2, NotebookPen, CalendarDays, Briefcase, CircleHelp, ArrowUp, ChevronDown, ChevronUp, TriangleAlert, ScanSearch, Sparkles, Undo2, Redo2, Sun, Moon } from "lucide-react";
import { SupportDialog, type SupportDialogHandle } from "@/components/support/SupportDialog";
import { saveProjectIdea, deleteProjectIdea } from "@/lib/actions/project";
import { signOut, updateProfile, changePassword, updateMindset, verifyCurrentPassword } from "@/lib/actions/auth";
import type { JobRole } from "@/lib/jobs/roles";
import { hasUsableBody } from "@/lib/jobs/section-quality";
import { useHoldDrag } from "@/lib/useHoldDrag";
import { ViewportDebug } from "@/components/ViewportDebug";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { IDEA_MAX, type FocusView, type IdeaView } from "@/lib/ai/state";
import type { FocusResult } from "@/lib/ai/focus";
import type { IdeaResult } from "@/lib/ai/idea";
import { ideaTechList, ideaResultToText, splitSentences } from "@/lib/ai/idea-text";
import { runFocus as runFocusAction, runIdea as runIdeaAction, getAiResultVersion } from "@/lib/actions/ai";
import { retryBriefing as retryBriefingAction, getBriefingView as getBriefingViewAction } from "@/lib/actions/briefing";
import { isPastManualRefreshWindow } from "@/lib/news/kst";
import { getSystemStatus as getSystemStatusAction, type DayStatus, type DayStatusLabel } from "@/lib/actions/admin-status";
import {
  retryJobs as retryJobsAction, getJobsView as getJobsViewAction,
  getJobsRecentView as getJobsRecentViewAction,
} from "@/lib/actions/jobs";
import type { IdeaGenerationMode } from "@/lib/ai/idea";
import type { WeatherView } from "@/lib/weather";
import { useLiveWeather } from "@/lib/useLiveWeather";
import WeatherMeta from "@/components/weather/WeatherMeta";
import WeatherTempTrigger from "@/components/weather/WeatherTempTrigger";

const STATUS_OPTIONS = [
  ["planned", "예정", "#c62828", "rgba(255,196,196,.55)"],
  ["in_progress", "진행 중", "#2c4f9e", "rgba(163,208,255,.5)"],
  ["completed", "완료", "#1a7a3a", "rgba(150,230,170,.55)"],
] as const;

// (MEMO_COLORS는 lib/memo/types.ts로 옮겼다 — 색 목록이 세 벌이던 것을 한 벌로. 그 파일 주석 참고.)

// 서버에서는 useLayoutEffect가 경고를 낸다(DOM이 없다). 브라우저에서만 layout으로 쓴다.
// 테마 보정처럼 **페인트 전에** 끝나야 하는 것에만 쓴다 — useEffect면 한 프레임 뒤라 번쩍인다.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// 모듈 스코프에 둬야 참조가 고정된다 — 렌더마다 새 []를 만들면 이걸 받는 하위 memo/useMemo가 매번 무효화된다.
const EMPTY_MEMOS: Memo[] = [];

// Idea Build 본문을 문장마다 줄바꿈해 렌더한다. <li> 안에서도 쓰이므로 <p>가 아니라 display:block
// span으로 끊는다 — li 안에 p를 넣으면 목록 마커와 첫 줄 baseline이 어긋난다.
// 문장이 하나뿐이면 span 하나라 기존 렌더와 시각적으로 동일하다.
function SentenceLines({ text }: { text: string }) {
  return (
    <>
      {splitSentences(text).map((line, i) => (
        <span key={i} className="sentence-line">{line}</span>
      ))}
    </>
  );
}

// 뉴스사/채용사이트 로고 — 직접 제공받은 Asset만 사용, 외부에서 새로 받아오지 않는다.
// cls는 JOB_SITE_LOGOS와 같은 규칙이다(dashboard.css의 `.row-logo-box.<cls>`와 1:1). 배경이 불투명한
// PNG는 박스 배경이 비치지 않으므로 cls가 필요 없다 — 실측 기준으로만 붙인다:
//   aitimes(투명 0% / 흰 83%), mit(투명 0% / 흰 94%) → 자체 흰 배경, 보정 불필요
//   zdnet(불투명 rgb(7,10,17) 어두운 배경) → 자체 배경이 어두워 다크에 오히려 어울린다, 보정 불필요
//   arstechnica·techcrunch → 배경 투명 + 어두운 잉크. 흰 박스가 필요하다(아래 CSS 주석).
const NEWS_SOURCE_LOGOS: Record<string, { src: string; cls?: string }> = {
  "AI타임스": { src: "/logos/aitimes.png" },
  "ZDNet Korea": { src: "/logos/zdnet.jpg" },
  "TechCrunch": { src: "/logos/techcrunch.webp", cls: "techcrunch-logo" },
  "MIT News AI": { src: "/logos/mit.png" },
  "Ars Technica AI": { src: "/logos/arstechnica.png", cls: "ars-logo" },
};
// 로고 PNG와 그 PNG에 필요한 박스 보정 클래스를 한 맵에 둔다 — 예전엔 클래스가 JSX 삼항으로
// 원티드에만 붙어 있어서, 점핏·잡코리아는 CSS 규칙을 받을 클래스 자체가 없었다(로고가 깨져 보인 원인).
// cls는 dashboard.css의 `.row-logo-box.<cls>` 규칙과 1:1 대응한다.
const JOB_SITE_LOGOS: Record<string, { src: string; cls: string }> = {
  "원티드": { src: "/logos/wanted.png", cls: "wanted-logo" },
  "점핏": { src: "/logos/jumpit.png", cls: "jumpit-logo" },
  "잡코리아": { src: "/logos/jobkorea.png", cls: "jobkorea-logo" },
};

// 채용공고 상세의 기술 태그 — 별도 DB 필드가 없으므로 공고 원문(주요업무/자격요건/우대사항)에
// 실제로 등장하는 용어만 골라서 보여준다. AI가 추측해서 만들지 않는다.
const TECH_TAG_VOCAB = [
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
type JobTextGroup = { heading: string | null; bullets: string[] };
function parseJobTextSections(text: string): JobTextGroup[] {
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
      current.bullets.push(line.replace(/^[\s•·ㆍ∙‧・･▪▫◦‣⁃▶▷■□●○◆◇★☆※\-–—*]+|^\s*(?:\d+[.)]|\[\d+\])\s*/g, "").trim());
    }
  }
  if (current.heading !== null || current.bullets.length > 0) groups.push(current);
  return groups.filter((g) => g.heading || g.bullets.length > 0);
}
function extractTechTags(...texts: (string | null | undefined)[]): string[] {
  const combined = texts.filter(Boolean).join(" ");
  return TECH_TAG_VOCAB.filter((term) => {
    const pattern = /^[A-Za-z0-9 ]+$/.test(term)
      ? new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i")
      : null;
    return pattern ? pattern.test(combined) : combined.toLowerCase().includes(term.toLowerCase());
  });
}

const SUMMARY_MAX_LENGTH = 30;

// 프로젝트 상태 최종 4종 — 아이디어(Yellow)/기획안작성(Purple)/개발중(Blue)/완료(Green), slug는 CSS 토큰과 1:1 대응
const PROJECT_STATUS_META: Record<string, { slug: "idea" | "planning" | "developing" | "completed"; icon: typeof Lightbulb }> = {
  "아이디어": { slug: "idea", icon: Lightbulb },
  "기획안작성": { slug: "planning", icon: FileText },
  "개발중": { slug: "developing", icon: Code2 },
  "완료": { slug: "completed", icon: CircleCheck },
};
// News/Job 미리보기 한 줄 — 왼쪽 소스 로고(없으면 생략) + 제목 + 보조 메타 텍스트
function PreviewRow({ logo, title, meta, flat, logoClass }: { logo?: string; title: string; meta: string; flat?: boolean; logoClass?: string }) {
  return (
    <div className={`preview-row${flat ? " job-row" : ""}`}>
      {logo && (
        <div className={`row-logo-box${logoClass ? ` ${logoClass}` : ""}`}>
          <img src={logo} alt="" className="row-logo-img" />
        </div>
      )}
      <div className="preview-row-body">
        <div className="t">{title}</div>
        <div className="s">{meta}</div>
      </div>
    </div>
  );
}

// 비회원용 정적 Lock Preview — 실제 데이터를 blur 처리하는 게 아니라 아예 조회하지 않고
// 이 카드만 렌더링한다. 가짜 뉴스 제목/회사명은 넣지 않는다.
function GuestLockCard({ kicker, title, description }: { kicker: string; title: string; description: React.ReactNode }) {
  return (
    <div className="guest-lock-card">
      <div className="guest-lock-kicker">{kicker}</div>
      <div className="guest-lock-title">{title}</div>
      <p className="guest-lock-description">{description}</p>
      <span className="guest-lock-action"><Lock size={18} strokeWidth={2.2} /> Sign in to view</span>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: string }) {
  const meta = PROJECT_STATUS_META[status] ?? PROJECT_STATUS_META["아이디어"];
  return (
    <span className={`project-status-badge project-status-badge--${meta.slug}`}>
      <span className="project-status-badge__dot" />
      {status}
    </span>
  );
}

// 프로젝트 상태 dropdown — 목록 필터(전체 포함)와 상세 페이지 상태 선택(전체 제외) 둘 다 여기서 재사용한다.
// native select는 옵션 팝업을 OS가 그려서 glass 톤·color chip을 못 입히므로 custom dropdown 사용
// 패널을 포털로 꺼내면 조상이 바뀌어서 조상 클래스에 의존하는 CSS가 통째로 안 먹는다.
// 실측으로 10개 규칙이 여기 걸려 있었다(.proj-detail-editing .proj-filter-panel의 width:98px !important,
// .proj-toolbar .project-status-filter-option의 크기, .projects-list-dialog .proj-toolbar ... 등).
// 그래서 원래 있던 자리의 조상 클래스들을 같은 중첩 순서로 다시 만들어 씌운다. 각 래퍼는
// display:contents라 상자를 만들지 않는다 — 셀렉터 매칭에만 참여하고 레이아웃에는 영향이 없다.
// (CSS를 10곳 고쳐 포털용 셀렉터를 덧붙이는 방법도 있지만, 그러면 앞으로 이 화면 규칙을 만질 때마다
//  두 벌을 맞춰 써야 한다. 조상을 재현하는 쪽이 고칠 곳이 없다.)
const PORTAL_CONTEXT_CLASSES = ["projects-list-dialog", "proj-toolbar", "proj-detail-editing"];
function wrapForPortal(node: React.ReactNode, from: HTMLElement | null): React.ReactNode {
  if (!from) return node;
  const chain = PORTAL_CONTEXT_CLASSES.filter((c) => from.closest(`.${c}`));
  // 바깥쪽부터 안쪽으로 중첩한다 — `.a .b .panel` 같은 규칙은 a와 b가 서로 다른 조상이어야 맞는다.
  return chain.reduceRight<React.ReactNode>(
    (child, cls) => <div className={cls} style={{ display: "contents" }}>{child}</div>,
    node
  );
}

function ProjectStatusFilterDropdown({ value, onChange, includeAll = true }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const [open, setOpen] = useState(false);
  // 열린 위치를 트리거 기준으로 실측해서 들고 있는다. 패널을 포털로 빼면 조상의 좌표계를
  // 잃어버리므로(=absolute가 기준 삼을 게 없다) fixed + 실측 좌표가 유일한 방법이다.
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const options = includeAll ? ["전체", ...PROJECT_STATUSES] : [...PROJECT_STATUSES];
  const currentSlug = value === "전체" ? "all" : PROJECT_STATUS_META[value]?.slug ?? "idea";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      // 패널은 이제 포털로 나가 있어서 rootRef 밖이다 — 패널 자신도 "안쪽"으로 쳐주지 않으면
      // 항목을 누르는 mousedown이 바깥 클릭으로 잡혀 click이 도착하기 전에 패널이 사라진다.
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // fixed는 화면 기준이라 안쪽 스크롤러가 움직이면 트리거만 떠나고 패널은 제자리에 남는다.
  // 다시 재는 대신 닫는다 — 스크롤했다는 건 대개 목록을 그만 보겠다는 뜻이고, 매 프레임
  // 좌표를 다시 재는 쪽이 훨씬 비싸다. capture로 걸어야 안쪽 스크롤러의 스크롤도 잡힌다.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (open) { setOpen(false); return; }
    const el = rootRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      // 좌표는 **패널이 실제로 붙는 곳 기준**으로 재야 한다. 뷰포트 좌표 + position:fixed로 하면
      // 웹에서 어긋난다 — dialog.glass-dialog에 backdrop-filter:blur(30px)가 걸려 있어서 그 요소가
      // fixed 자식의 containing block이 되기 때문이다(실측: 다이얼로그가 (113,399)에 있으면 fixed의
      // (0,0)이 화면 (114,400)에 그려진다). 모바일은 다이얼로그가 100vw/100dvh 전체화면이라 원점이
      // (0,0)과 같아 어긋남이 0이었고, 그래서 모바일만 멀쩡해 보였다.
      // 그래서 host 기준 상대좌표 + position:absolute로 바꾼다. host(<dialog>)는 자기가 positioned라
      // absolute의 기준이 되고, backdrop-filter가 있든 없든 결과가 같다.
      const host = el.closest("dialog") as HTMLElement | null;
      if (host) {
        const hr = host.getBoundingClientRect();
        setAnchor({ left: r.left - hr.left, top: r.bottom - hr.top + 8, width: r.width });
      } else {
        // 다이얼로그 밖(body에 붙는 경우) — absolute는 문서 기준이라 스크롤량을 더해야 한다.
        setAnchor({ left: r.left + window.scrollX, top: r.bottom + window.scrollY + 8, width: r.width });
      }
    }
    setOpen(true);
  }

  const panel = (
    <div
      ref={panelRef}
      className="proj-filter-panel"
      // 기본 규칙의 absolute/left:0/right:0을 인라인으로 덮는다. width는 데스크톱에서 트리거 폭을
      // 그대로 쓰기 위한 것이고, 모바일은 CSS가 width를 !important로 잡고 있어 그쪽이 이긴다.
      style={anchor ? ({ position: "absolute", left: anchor.left, top: anchor.top, right: "auto", zIndex: 9999, "--anchor-w": `${anchor.width}px` } as React.CSSProperties) : undefined}
    >
      {options.map((o) => {
        const slug = o === "전체" ? "all" : PROJECT_STATUS_META[o]?.slug ?? "idea";
        return (
          <div
            key={o}
            className="project-status-filter-option"
            data-selected={o === value}
            onClick={() => { onChange(o); setOpen(false); }}
          >
            <span className={`project-status-filter-chip project-status-filter-chip--${slug}`} />
            {o}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="proj-filter-dropdown" ref={rootRef}>
      <button type="button" className="proj-filter-trigger" onClick={toggle}>
        <span className="proj-filter-trigger-value">
          <span className={`project-status-filter-chip project-status-filter-chip--${currentSlug}`} />
          {value}
        </span>
        <span className={`proj-filter-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {/* 패널을 포털로 빼는 이유는 두 가지고, 웹과 모바일에서 서로 다르게 드러났다.
          - 웹: 프로젝트 편집 화면의 조상이 .proj-detail-inner.proj-detail-editing{overflow:hidden}이고
            그 안 스크롤러가 overflow-x:hidden이라, absolute 패널이 그 상자에서 그대로 잘렸다.
          - 모바일/PWA: 조상 어딘가가 스태킹 컨텍스트를 만들어 z-index:30이 그 안에 갇히고, 서식
            툴바(sticky) 아래로 깔렸다.
          둘 다 "조상 상자에 갇힌 것"이 원인이라 상자 밖으로 꺼내면 한 번에 풀린다.
          붙이는 곳은 MiniDatePicker와 같다 — 열려 있는 <dialog>(top layer)가 있으면 그 안, 없으면 body.
          dialog 안에 넣어야 showModal()의 top layer 위로 올라간다(z-index로는 top layer를 못 이긴다). */}
      {open && (typeof document !== "undefined"
        ? createPortal(wrapForPortal(panel, rootRef.current), rootRef.current?.closest("dialog") ?? document.body)
        : panel)}
    </div>
  );
}
// 최근 수정 — 올해면 MM.DD만, 아니면 YYYY.MM.DD (연도 반복 표시 방지)
function formatProjectUpdated(iso: string, todayYear: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const [y, m, d] = parts.split("-");
  return Number(y) === todayYear ? `${m}.${d}` : `${y}.${m}.${d}`;
}

function postitColorClass(color: MemoColor): string {
  return { yellow: "", pink: "c1", green: "c2", blue: "c3", purple: "c4", white: "c5", black: "c6", darkgray: "c7" }[color];
}

// Monthly MEMO Create — 포스트잇처럼 전체를 색칠하지 않고 입력창만 메모지 색상으로 물들인다.
// postitColorClass는 yellow가 ""(기본값)라 이걸론 yellow를 못 골라서 색상별로 전부 클래스를 준다.
function colorInputClass(color: MemoColor): string {
  return `color-input-${color}`;
}

function ColorSwatches({ value, onChange }: { value: MemoColor; onChange: (c: MemoColor) => void }) {
  return (
    <div className="color-swatches">
      <span className="field-label">색상</span>
      {MEMO_COLORS.map((c) => (
        <span key={c} className={`swatch ${c} ${value === c ? "selected" : ""}`} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

const MEMO_TYPE_OPTIONS: { value: MemoType; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "dev_note", label: "Dev Note" },
  { value: "free_note", label: "Free Note" },
];

// 메모 유형(Todo/Dev Note/Free Note) — native select는 브라우저 기본 화살표/팝업이라 앱 톤과 안 맞아서
// 다른 곳(프로젝트 상태 필터)과 같은 custom dropdown 패턴으로 통일한다.
function MemoTypeDropdown({ value, onChange }: { value: MemoType; onChange: (v: MemoType) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const currentLabel = MEMO_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "Free Note";

  return (
    <div className="memo-type-dropdown" ref={rootRef}>
      <button type="button" className="memo-type-trigger" onClick={() => setOpen((v) => !v)}>
        <span>{currentLabel}</span>
        <span className={`memo-type-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="memo-type-panel">
          {MEMO_TYPE_OPTIONS.map((o) => (
            <div
              key={o.value}
              className={`memo-type-option${o.value === value ? " selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Monthly MEMO 하단 목록 — 날짜 범위 필터(선택일/이번 달/기간/전체 기간). 메모 유형 필터(전체/Todo/...)와
// 독립적으로 조합된다. "기간"을 고르면 같은 패널이 시작일/종료일 입력 화면으로 바뀌고, 적용을 눌러야
// 실제로 반영된다(취소 시 기존 범위 유지) — 별도 팝오버를 새로 띄우지 않고 패널 내용만 전환한다.
export type DateRangeMode = "selected-day" | "month" | "custom" | "all";
const DATE_RANGE_OPTIONS: [DateRangeMode, string][] = [
  ["selected-day", "선택일"], ["month", "이번 달"], ["custom", "기간"], ["all", "전체 기간"],
];
function formatRangeLabel(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? start.slice(5).replace("-", ".") : start.replaceAll("-", ".")} ~ ${end.slice(5).replace("-", ".")}`;
}
function DateRangeSelector({
  mode, customStart, customEnd, todayIso, onSelectMode, onApplyCustomRange,
}: {
  mode: DateRangeMode; customStart: string | null; customEnd: string | null; todayIso: string;
  onSelectMode: (mode: DateRangeMode) => void;
  onApplyCustomRange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"list" | "range">("list");
  const [draftStart, setDraftStart] = useState(customStart ?? todayIso);
  const [draftEnd, setDraftEnd] = useState(customEnd ?? todayIso);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setPanel("list"); }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label =
    mode === "selected-day" ? "선택일"
    : mode === "month" ? "이번 달"
    : mode === "all" ? "전체 기간"
    : customStart && customEnd ? formatRangeLabel(customStart, customEnd) : "기간";

  function pick(next: DateRangeMode) {
    if (next === "custom") {
      setDraftStart(customStart ?? todayIso);
      setDraftEnd(customEnd ?? todayIso);
      setRangeError(null);
      setPanel("range");
      return; // 적용을 눌러야 실제 모드가 바뀐다
    }
    onSelectMode(next);
    setOpen(false);
  }

  function applyRange() {
    if (!draftStart || !draftEnd || draftStart > draftEnd) {
      setRangeError("시작일이 종료일보다\n늦을 수 없습니다.");
      return;
    }
    onApplyCustomRange(draftStart, draftEnd);
    setOpen(false);
    setPanel("list");
  }

  return (
    <div className="memo-type-dropdown date-range-dropdown" ref={rootRef}>
      <button type="button" className="memo-type-trigger" onClick={() => { setOpen((v) => !v); setPanel("list"); }}>
        <span>{label}</span>
        <span className={`memo-type-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && panel === "list" && (
        <div className="memo-type-panel">
          {DATE_RANGE_OPTIONS.map(([key, opLabel]) => (
            <div key={key} className={`memo-type-option${mode === key ? " selected" : ""}`} onClick={() => pick(key)}>{opLabel}</div>
          ))}
        </div>
      )}
      {open && panel === "range" && (
        <div className="memo-type-panel date-range-panel">
          <label className="field-with-label sm"><span className="field-label">시작일</span><MiniDatePicker value={draftStart} onChange={setDraftStart} todayIso={todayIso} /></label>
          <label className="field-with-label sm"><span className="field-label">종료일</span><MiniDatePicker value={draftEnd} onChange={setDraftEnd} todayIso={todayIso} /></label>
          {rangeError && <div className="hint" style={{ color: "#e0446b", whiteSpace: "pre-line" }}>{rangeError}</div>}
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => setPanel("list")}>취소</button>
            <button type="button" className="save-btn" onClick={applyRange}>적용</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 로딩중스타일.html(Warp Loader) 포팅 — Today's Focus/Idea Build 생성 중 표시
function WarpLoader() {
  return (
    <div className="warp-loader">
      <div className="ring" /><div className="ring" /><div className="ring" /><div className="ring" />
      <div className="core-glow" />
    </div>
  );
}

// Today's Focus·Idea Build 생성 중 화면. 로더 하나에 작은 문구만 있으면 넓은 모달이 휑해 보여서,
// 결과 카드가 들어올 자리를 스켈레톤으로 미리 잡아준다. 가짜 진행률(%)이나 단계 표시는 넣지 않는다.
function AiLoadingStage({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="ai-loading-stage">
      <div className="ai-loading-orb"><WarpLoader /></div>
      <h4 className="ai-loading-title">{title}</h4>
      <p className="ai-loading-sub">{sub}</p>
      <div className="ai-loading-skeleton" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}

// AI 호출(뉴스/채용공고/AI Trend Briefing/Idea Build) 실패 시 공통으로 쓰는 오류 안내 + 재시도 UI.
// 문구만 기능별로 다르고 나머지는 전부 같은 카드 — 각 기능은 자기 결과 영역 안에서 이걸 대신 그린다.
const AI_ERROR_COPY = {
  news: { title: "뉴스를 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "" },
  jobs: { title: "채용공고를 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "" },
  briefing: { title: "오늘의 브리핑을 불러오지 못했어요", description: "일시적인 오류가 발생했습니다. 다시 시도해주세요.", helperText: "실패한 요청은 이용 횟수에 포함되지 않습니다." },
  idea: { title: "아이디어를 생성하지 못했어요", description: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", helperText: "실패한 요청은 이용 횟수에 포함되지 않습니다." },
} as const;

function AiErrorState({ feature, isRetrying, onRetry }: { feature: keyof typeof AI_ERROR_COPY; isRetrying: boolean; onRetry: () => void }) {
  const copy = AI_ERROR_COPY[feature];
  return (
    <div className="ai-error-state">
      <div className="ai-error-state-icon-wrap" aria-hidden="true"><span className="ai-error-state-icon">⚠</span></div>
      <h4 className="ai-error-state-title">{copy.title}</h4>
      <p className="ai-error-state-desc">{copy.description}</p>
      <button type="button" className="ai-error-state-btn" onClick={onRetry} disabled={isRetrying} aria-busy={isRetrying}>
        {isRetrying ? "다시 시도 중..." : "다시 시도"}
      </button>
      {copy.helperText && <div className="ai-error-state-helper">🛡 {copy.helperText}</div>}
    </div>
  );
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 참고_구조&스타일/SkillPilot_미니달력_팝업.html 포팅 — 시작일/종료일 입력용 미니 달력 팝업
// inline이면 트리거 버튼 없이 팝업 내용만 그려서 원형 토글 메뉴 등 다른 곳에서도 그대로 재사용한다
function MiniDatePicker({ value, onChange, inline, portal, popupClassName, todayIso }: { value: string; onChange: (v: string) => void; inline?: boolean; portal?: boolean; popupClassName?: string; todayIso: string }) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(value.split("-")[0]));
  const [viewMonth0, setViewMonth0] = useState(() => Number(value.split("-")[1]) - 1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // 아래로 열 자리가 없으면 위로 연다. CSS로는 "자리가 있는가"를 알 수 없어서 여기서 실측한다.
  // 자르는 주체는 대개 <dialog>다(dialog.glass-dialog는 overflow:hidden). 경계는 가장 가까운
  // dialog, 없으면 뷰포트로 잡는다.
  //
  // ★ "아래가 부족하면 무조건 위로"는 틀린 규칙이다. 실측(뷰포트 1000x560, 메모 0개인 날의 저장
  //   팝업): 다이얼로그가 405px뿐이라 아래로 1px 모자란데, 위로 뒤집으면 143px 모자란다 —
  //   더 나빠진다. 그래서 **뒤집는 쪽이 실제로 더 넓을 때만** 뒤집는다.
  //   그러고도 모자라면(양쪽 다 좁은 다이얼로그) 넓은 쪽 높이에 맞춰 달력이 스스로 스크롤한다.
  //   잘려서 안 보이는 것보다 낫고, 어느 컨테이너에서도 잘리지 않는 게 보장된다.
  const [flipUp, setFlipUp] = useState(false);
  const [popupMaxH, setPopupMaxH] = useState<number | null>(null);
  useEffect(() => {
    if (!open) { setFlipUp(false); setPopupMaxH(null); return; }
    const wrap = wrapRef.current, el = popupRef.current;
    if (!wrap || !el) return;
    const dlg = wrap.closest("dialog");
    const box = dlg ? dlg.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const t = wrap.getBoundingClientRect();
    const GAP = 8, EDGE = 6;
    const below = box.bottom - t.bottom - GAP - EDGE;
    const above = t.top - box.top - GAP - EDGE;
    // 높이는 뒤집기 전 값으로 잰다 — 뒤집힌 rect로 다시 재면 상태가 진동한다.
    const need = el.offsetHeight;
    const up = need > below && above > below;
    const room = up ? above : below;
    setFlipUp(up);
    setPopupMaxH(need > room ? Math.max(room, 160) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 편집 대상이 바뀌어(다른 메모 선택 등) value가 갱신되면 팝업의 표시 월도 그 값으로 따라간다 —
  // 그렇지 않으면 이전 편집 대상의 월이 그대로 남아 보인다.
  useEffect(() => {
    setViewYear(Number(value.split("-")[0]));
    setViewMonth0(Number(value.split("-")[1]) - 1);
  }, [value]);

  useEffect(() => {
    if (inline || !open) return;
    // portal이면 popup이 wrapRef 밖(body 쪽)으로 옮겨지므로, popup 내부 클릭까지 같이 확인해야
    // 날짜를 고르는 클릭이 "바깥 클릭"으로 오인돼 즉시 닫히는 걸 막을 수 있다.
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, inline]);

  function nav(delta: number) {
    let ny = viewYear, nm = viewMonth0 + delta;
    if (nm < 0) { nm = 11; ny -= 1; } else if (nm > 11) { nm = 0; ny += 1; }
    setViewYear(ny); setViewMonth0(nm);
  }
  function pick(day: number) {
    onChange(isoDate(viewYear, viewMonth0, day));
    setOpen(false);
  }

  const firstWeekday = new Date(viewYear, viewMonth0, 1).getDay();
  const lastDate = new Date(viewYear, viewMonth0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);

  const popup = (
    <div
      ref={popupRef}
      className={`mini-date-popup${flipUp ? " flip-up" : ""}${portal ? " mobile-options-date-popup" : ""}${popupClassName ? ` ${popupClassName}` : ""}`}
      style={portal
        ? { position: "fixed", zIndex: 9999, top: "auto", bottom: 155, left: "50%", right: "auto", width: 210, margin: 0, padding: 8, borderRadius: 14, transform: "translateX(-50%)", display: "block", visibility: "visible", opacity: 1 }
        : (popupMaxH !== null ? { maxHeight: popupMaxH, overflowY: "auto", overflowX: "hidden" } : undefined)}
    >
      <div className="mini-date-head">
        <button type="button" onClick={() => nav(-1)}>‹</button>
        <span>{viewYear}년 {viewMonth0 + 1}월</span>
        <button type="button" onClick={() => nav(1)}>›</button>
      </div>
      <div className="mini-date-weekdays">
        {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="mini-date-days">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} className="mini-date-day empty" />;
          const iso = isoDate(viewYear, viewMonth0, day);
          const dow = (firstWeekday + day - 1) % 7;
          return (
            <button
              key={i} type="button"
              className={`mini-date-day${dow === 0 ? " sunday" : ""}${dow === 6 ? " saturday" : ""}${iso === todayIso ? " today" : ""}${iso === value ? " selected" : ""}`}
              onClick={() => pick(day)}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );

  if (inline) return <div className="mini-date-picker inline" ref={wrapRef}>{popup}</div>;

  return (
    <div className="mini-date-picker" ref={wrapRef}>
      <button type="button" className="mini-date-trigger" onClick={() => setOpen((v) => !v)}>📅 {value}</button>
      {open && (portal && typeof document !== "undefined" ? createPortal(popup, wrapRef.current?.closest(".mobile-options-backdrop") ?? wrapRef.current?.closest("dialog") ?? document.body) : popup)}
    </div>
  );
}

// 참고_구조&스타일/원형토글메뉴.html 포팅 — 뉴스/채용공고 텍스트 선택 시 뜨는 원형 메뉴 (복사 / 달력)
function RadialSelectionMenu({
  onCopy, onPickDate, onClose, todayIso,
}: {
  onCopy: () => void;
  onPickDate: (iso: string) => void;
  onClose: () => void;
  todayIso: string;
}) {
  const [fanOpen, setFanOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [toast, setToast] = useState(false);
  const [date, setDate] = useState(todayIso);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!rootRef.current || rootRef.current.contains(target)) return;
      // [치명적] 이 컴포넌트는 모바일에서 CSS(.selection-action-desktop{display:none})로만 숨겨져
      // 있고 실제로는 계속 마운트돼 있다 — 그래서 이 document mousedown 리스너도 살아 있다.
      // 모바일 하단 액션바(복사 / 메모로 저장 / 미니달력 날짜)를 실제로 누르면 여기서 "바깥 클릭"으로
      // 판정해 onClose()=setSelectionMenu(null)이 먼저 돌아 레이어가 통째로 사라졌다. 그래서
      // "메모로 저장을 눌러도 아무것도 안 뜨고", "달력이 떠도 날짜를 고를 수 없었다".
      // (합성 click으로 테스트하면 mousedown이 없어서 재현되지 않는다 — 실제 터치에서만 터진다.)
      if (target instanceof Element && target.closest(".mobile-selection-layer")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function handleCopy() {
    onCopy();
    setToast(true);
    setTimeout(onClose, 900);
  }

  return (
    <div className="radial-menu" ref={rootRef}>
      <button type="button" className={`radial-toggle ${fanOpen ? "open" : ""}`} onClick={() => setFanOpen((v) => !v)}>+</button>
      <button type="button" className={`radial-item radial-copy ${fanOpen ? "open" : ""}`} aria-label="복사" onClick={handleCopy}>📋</button>
      <button
        type="button" className={`radial-item radial-calendar ${fanOpen ? "open" : ""}`} aria-label="날짜 선택"
        onClick={() => setShowCalendar((v) => !v)}
      >
        📅
      </button>
      {showCalendar && (
        <div className="radial-calendar-popup">
          <MiniDatePicker value={date} onChange={(iso) => { setDate(iso); onPickDate(iso); }} inline todayIso={todayIso} />
        </div>
      )}
      {toast && <div className="mini-toast">복사되었습니다.</div>}
    </div>
  );
}

// 모바일에서는 RadialSelectionMenu 대신 선택 영역과 분리된 하단 고정 액션바를 쓴다 (터치로 원형 메뉴를 정확히 누르기 어려움)
function MobileSelectionActionBar({
  text, onCopy, onPickDate, onClose, todayIso,
}: {
  text: string;
  onCopy: () => void;
  onPickDate: (iso: string) => void;
  onClose: () => void;
  todayIso: string;
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    window.setTimeout(onClose, 800);
  }

  return (
    <div className={`mobile-selection-layer${showCalendar ? " calendar-open" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mobile-selection-preview" title={text}>{text}</div>
      {/* [치명적] 달력은 .mobile-selection-actions(3열 grid) 안에 있으면 첫 칸(108px)으로 짜부라져
          날짜 버튼이 8x8px가 되어 실물 터치로는 절대 못 눌렀다 — "메모로 저장을 눌러도 아무것도 안 뜸"의
          정체가 이것이다. 액션 grid 바깥, 레이어(flex column)의 형제로 두어야 폭을 온전히 쓴다. */}
      {showCalendar && (
        <div className="mobile-selection-calendar">
          <MiniDatePicker value={todayIso} onChange={onPickDate} inline todayIso={todayIso} />
        </div>
      )}
      <div className="mobile-selection-actions" aria-label="선택 문장 작업">
        <button type="button" onClick={handleCopy}>📋 {copied ? "복사됨" : "복사"}</button>
        <button type="button" onClick={() => setShowCalendar(true)}>📅 메모로 저장</button>
        <button type="button" className="mobile-selection-close" onClick={onClose} aria-label="선택 작업 닫기">✕</button>
      </div>
    </div>
  );
}

// Monthly MEMO/Project 전체보기·수정 화면 공용 "맨 위로 이동" — window가 아니라 각 dialog의 실제
// scroll container(ref) 기준으로 동작한다. 새 컴포넌트 없이 이 훅 하나를 각 화면에서 재사용한다.
const SCROLL_TOP_THRESHOLD = 400;
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
const KEEP_EDITOR_FOCUS = {
  onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault(),
  onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
} as const;
// 자동저장 축소 가드가 발동한 것을 ViewportDebug 패널로 올린다. 컴포넌트 **밖**에 두는 이유는
// React Compiler ESLint(react-hooks/immutability)가 렌더 함수 안에서의 전역 쓰기를 막기 때문이다.
// ⚠️ 이 값은 ViewportDebug가 실제로 그린다(`__spBodyShrink`). 계측을 새로 넣을 때는 **패널에
//    그리는 줄까지 같이** 넣어라 — 아래 traceScrollTop이 정확히 그걸 빠뜨려서 죽어 있었다.
function noteBodyShrink(line: string) {
  if (typeof window === "undefined") return;
  (window as unknown as { __spBodyShrink?: string[] }).__spBodyShrink = [line];
}
// (2026-08-30 제거: traceScrollTop — "위로가기를 누르면 2.5초간 프레임마다 scrollTop을 기록하고
//  ViewportDebug가 그대로 그린다"는 주석이 붙어 있었는데, 패널을 45줄→19줄로 줄일 때(15-1)
//  그리는 쪽이 빠지면서 **아무 데도 안 보이는 로그**가 됐다. `window.__spScrollTrace`를 읽는 코드가
//  파일 전체에 없다. 되살릴 일이 생기면 git에 있고, 그때는 패널에 그리는 줄을 반드시 같이 넣어라.)
// 🔴🔴🔴 버튼 노출을 **state로 만들지 마라.** 여기가 "위로가기 생기면서 다 망가졌다"의 진짜 자리다.
//
// 회귀 지점은 git이 정확히 짚어준다(90c679e, 위로가기를 도입한 커밋):
//     -  <div className="textarea-row">
//     +  <div className="textarea-row" ref={postitScrollRef} onScroll={onPostitScroll}>
// 그 전까지 편집 스크롤러에는 **onScroll이 아예 없었다.** 즉 메모를 스크롤해도 React는 아무것도
// 하지 않았다. 버튼이 생기면서 스크롤이 setState가 됐고, Dashboard는 화면 전체를 그리는 **한 개짜리**
// 컴포넌트라 그 setState 한 번이 MemoRichEditor까지 통째로 다시 렌더한다. 그러면 tiptap의
// useEditor가 editor.setOptions()를 부르고(@tiptap/react: onRender → compareOptions 불일치 →
// setOptions), 그 안에서 view.setProps() + view.updateState()가 돈다(@tiptap/core Editor.setOptions).
// ProseMirror는 거기서 outerDeco를 다시 계산해 view.dom의 속성(contenteditable 포함)을 다시 쓴다 —
// **WebKit에서 포커스된 contenteditable의 속성이 다시 써지면 blur된다.** 그게 caret none의 정체다.
//
// 그래서 탭 경로만 막은 수정(KEEP_EDITOR_FOCUS)으로는 안 잡혔다. 방아쇠는 탭이 아니라 **스크롤 자체**다.
// 위로가기를 누르면 scrollTo(0) → scroll 이벤트 → setState → 리렌더 → blur가 그 자리에서 일어난다.
//
// 고치는 방향은 값을 만지는 게 아니라 **state를 없애는 것**이다. 버튼 노출은 화면 어디에도 영향을
// 주지 않는 순수 표시값이라 클래스 토글이면 충분하다. 이러면 스크롤 중 리렌더가 0이 되어
// 버튼이 생기기 전의 렌더 동작으로 정확히 돌아간다.
// ⚠️ 여기에 useState를 다시 들이지 마라. 들이는 순간 위 연쇄가 통째로 돌아온다.
function useScrollTopButton() {
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  function setVisible(on: boolean) {
    btnRef.current?.classList.toggle("is-visible", on);
  }
  function onScroll() {
    setVisible((ref.current?.scrollTop ?? 0) > SCROLL_TOP_THRESHOLD);
  }
  function scrollToTop() {
    const el = ref.current;
    if (!el) return;
    // 🔴🔴 여기서 캐럿을 건드리지 마라 — 2026-08-26에 실제로 심었다가 되돌린 자리다.
    // "iOS가 캐럿을 보이려고 스크롤을 되돌린다"는 가설로 DOM Selection을 에디터 맨 앞으로 옮겼는데
    // (`removeAllRanges()` → `addRange()`), 그 사이 **선택 범위가 0개가 되는 순간**에 iOS가 캐럿이
    // 사라진 것으로 보고 키보드를 닫아버린다. 그러면 연쇄로: 편집이 풀려 "보기 모드"로 튕기고
    // (`.postit-overlay`의 onClick이 detail 편집 중 탭을 setPostitEditMode(null)로 받는다),
    // --kb-inset이 326→0으로 떨어지며 껍데기 padding이 줄고, 다시 탭해 키보드를 올리면 baseline이
    // 어긋나 본문과 키보드 사이에 죽은 공간이 생긴다. 사용자 신고: "간헐적으로 커서가 없어지고
    // 보기모드로 돌입, 그러면서 메모내용이랑 키보드 사이 간격 발생". 데스크톱에서는 재현되지 않는다.
    // 커서가 살아 있을 때 안 올라가는 문제는 **아직 원인 미확정**이다. 값이나 셀렉션을 또 만지지 말고
    // 실기기에서 `?debug=vp`로 KB-INSET / vvTop / 스크롤러 목록을 먼저 읽어라(CLAUDE.md 7절 4단계).
    // smooth를 뺐다. 부작용이 없는 쪽으로만 한 칸 움직인 것이지 위 증상을 고쳤다는 뜻은 아니다.
    // 근거: 실측(375x684, 프로젝트 편집) smooth 애니메이션이 **420ms 동안 900에서 멈춰 있다가** 0으로
    // 간다. 지뢰표 마지막 줄이 경고하는 구간이 정확히 그 창이다 — 그 사이에 리플로우(키보드 닫힘 →
    // --kb-inset 326→0 → 껍데기 padding 변화)가 끼면 스크롤이 멈춘 채로 남는다. 즉시 이동은 그 창이
    // 아예 없다. 잃는 것은 애니메이션뿐이고 포커스·캐럿·편집 모드는 건드리지 않는다.
    // 캐럿 노출 소유자(MemoRichEditor의 vv.resize settle)에게 "지금은 비켜라"라고 알린다.
    // iOS Chrome은 스크롤만으로도 하단 툴바가 접혀 vv.resize가 뜨고, 그 뒤 scrollIntoView()가
    // 캐럿 자리로 도로 끌어내린다 — 그게 "내용을 수정했을 때만 위로가기가 안 먹는" 이유다.
    // 반드시 scrollTo **앞**에서 부른다(스크롤이 resize를 부르기 전에 창이 열려 있어야 한다).
    noteScrollTopTap();
    el.scrollTo({ top: 0, behavior: "auto" });
    setVisible(false); // 클래스 토글뿐 — 리렌더가 없어야 캐럿이 산다(위 주석)
  }
  // <dialog>는 닫혀 있어도 자식 DOM이 계속 마운트돼 있어 scrollTop이 저절로 0으로 돌아가지 않는다 —
  // 다이얼로그/편집창을 새로 열 때 호출해 이전 세션의 스크롤 위치와 버튼 노출 상태를 지운다.
  function resetScroll() {
    if (ref.current) ref.current.scrollTop = 0;
    setVisible(false);
  }
  return { ref, btnRef, onScroll, scrollToTop, resetScroll };
}
// ref는 React 19에서 함수 컴포넌트의 평범한 prop이다 — 별도 이름(btnRef 등)으로 넘기면
// react-hooks/refs가 "render 중 ref 접근"으로 오탐하므로 그대로 ref로 받는다.
function ScrollTopButton({ ref, onClick }: { ref: React.Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    // 🔴 onPointerDown preventDefault — 이 버튼만 그게 빠져 있었다(실행취소·다시실행·삽입 버튼엔 전부 있다).
    // 없으면 탭하는 순간 본문이 blur돼 키보드가 닫히고, 그러면 --kb-inset이 326→0으로 떨어지면서
    // 편집창 padding-bottom이 그만큼 줄어 **스크롤러 높이가 도중에 바뀐다** — 그 리플로우가
    // scrollTo({behavior:"smooth"}) 애니메이션 한가운데서 일어나 스크롤이 멈춘 채로 남는다.
    // 포커스를 지키면 키보드가 그대로라 리플로우 자체가 없고, 맨 위로 간 뒤 바로 이어서 칠 수도 있다.
    <button type="button" ref={ref} className="scroll-top-btn" {...KEEP_EDITOR_FOCUS} onClick={onClick} aria-label="맨 위로 이동">
      <ArrowUp size={18} strokeWidth={2.2} />
    </button>
  );
}

// (2026-08-28: 문서 스크롤 페이지용 위로가기 DocScrollTopButton을 넣었다가 **사용자 요청으로 뺐다** —
//  "그냥 없애자, 뭔가 너무 조잡하다". 다시 만들지 마라. 요소 스크롤러를 쓰는 다른 화면
//  (본문 확장·프로젝트 상세·포스트잇 보기)의 ScrollTopButton은 그대로 둔다.)

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ponytail: vercel.json의 cron 스케줄과 수동 동기화 — 스케줄을 바꾸면 이 값도 같이 바꿔야 한다.
const CRON_SCHEDULED_TIME_KST = "10:10";

const SYSTEM_STATUS_BADGE_CLASS: Record<DayStatusLabel, string> = {
  "정상": "ok",
  "점검 필요": "partial",
  "일부 실패": "partial",
  "실패": "failed",
  "실패 후 복구": "recovered",
  "기록 없음": "empty",
};

type SystemStatusErrorState = { message: string; reason: "forbidden" | "query_failed"; at: string };

// 오늘 하루 요약이 아니라 "최근 7일 중 가장 최근" 기준 — 오늘 아직 기록이 없어도 최근 정상 실행/최근
// 오류를 계속 보여줘야 운영자가 "언제부터 문제였는지"를 바로 알 수 있다.
// "18/20명"처럼 회원 커버리지를 붙인다 — 이 필드가 없는 과거 기록(newsMemberTotal null)은 그냥 생략한다.
function memberCoverageSuffix(covered: number | null, total: number | null): string {
  return total !== null && covered !== null ? ` · ${covered}/${total}명` : "";
}

function buildSystemOverview(days: DayStatus[]) {
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

// My Page > System Status(관리자 전용) — Daily Briefing cron이 오늘 정상 돌았는지를 몇 초 안에 보여준다.
function SystemStatusPanel({
  days, loading, error, fetchedAt, onRefresh,
}: {
  days: DayStatus[] | null; loading: boolean; error: SystemStatusErrorState | null;
  fetchedAt: string | null; onRefresh: () => void;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (loading && !days && !error) return <p className="mypage-hint">불러오는 중...</p>;

  // 권한 없음(forbidden)과 실제 조회 실패(query_failed)를 구분한다 — 전자는 사실상 발생하면 안 되는
  // 상태(탭 자체가 관리자에게만 보임)라 오류처럼 보이지 않게, 후자는 원인과 시각을 그대로 보여준다.
  if (error) {
    return (
      <section className="mypage-card">
        {error.reason === "forbidden" ? (
          <p className="mypage-card-desc" style={{ margin: 0 }}>관리자 권한이 필요합니다.</p>
        ) : (
          <>
            <p className="auth-error" role="status" style={{ margin: "0 0 6px" }}>시스템 상태를 불러오지 못했습니다.</p>
            <p className="sysstatus-error-text">{error.message} · {formatUpdatedAt(error.at)}</p>
          </>
        )}
        <button type="button" className="sysstatus-refresh-btn" style={{ marginTop: 14, marginLeft: 0 }} onClick={onRefresh} disabled={loading}>
          {loading ? "확인 중..." : "상태 다시 확인"}
        </button>
      </section>
    );
  }

  if (!days || days.every((d) => d.label === "기록 없음")) {
    return (
      <section className="mypage-card">
        <p className="mypage-card-desc" style={{ margin: 0 }}>
          아직 실행 기록이 없습니다.<br />다음 Daily Briefing 실행 후 상태가 표시됩니다.
        </p>
        <button type="button" className="sysstatus-refresh-btn" style={{ marginTop: 14, marginLeft: 0 }} onClick={onRefresh} disabled={loading}>
          {loading ? "확인 중..." : "상태 다시 확인"}
        </button>
      </section>
    );
  }

  const [todayStatus, ...history] = days;
  const overview = buildSystemOverview(days);

  return (
    <>
      <section className="mypage-card sysstatus-overview">
        <div className="mypage-card-heading">
          System Overview
          <button type="button" className="sysstatus-refresh-btn" onClick={onRefresh} disabled={loading}>
            {loading ? "확인 중..." : "↻ 상태 다시 확인"}
          </button>
        </div>
        <div className="sysstatus-overview-grid">
          <div className="sysstatus-overview-item">
            <span>전체 상태</span>
            <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[overview.overallLabel]}`}>{overview.overallLabel}</span>
          </div>
          <div className="sysstatus-overview-item"><span>Daily Briefing</span><span>{overview.overallLabel}</span></div>
          <div className="sysstatus-overview-item"><span>News</span><span>{overview.newsText}</span></div>
          <div className="sysstatus-overview-item">
            <span>AI Trend</span>
            <span className="sysstatus-job-breakdown">
              <span>{overview.aiTrend.main}</span>
              {overview.aiTrend.note && <span>{overview.aiTrend.note}</span>}
            </span>
          </div>
          <div className="sysstatus-overview-item">
            <span>Job Description</span>
            <span className="sysstatus-job-breakdown">
              <span>┌ 정상 {overview.jobOk}/{overview.jobEligible}명</span>
              <span>{overview.jobPendingCount > 0 ? "├" : "└"} 이상 {overview.jobIssueCount}명</span>
              {overview.jobPendingCount > 0 && <span>└ 재설정 대기 {overview.jobPendingCount}명</span>}
            </span>
          </div>
          <div className="sysstatus-overview-item"><span>마지막 정상 실행</span><span>{overview.lastSuccessAt ? formatUpdatedAt(overview.lastSuccessAt) : "없음"}</span></div>
          <div className="sysstatus-overview-item"><span>최근 오류</span><span>{overview.lastError ? formatUpdatedAt(overview.lastError.at) : "없음"}</span></div>
        </div>
        {overview.lastError && <p className="sysstatus-error-text" style={{ marginTop: 10 }}>{overview.lastError.message}</p>}
        {fetchedAt && <p className="sysstatus-fetched-at">마지막 갱신: {formatUpdatedAt(fetchedAt)}</p>}
      </section>

      <section className="mypage-card">
        <div className="mypage-card-heading">
          Daily Briefing — 오늘
          <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[todayStatus.label]}`}>{todayStatus.label}</span>
        </div>
        <SystemStatusRows day={todayStatus} />
      </section>

      <section className="mypage-card">
        <div className="mypage-card-heading">최근 실행 기록</div>
        <ul className="sysstatus-history">
          {history.map((day) => (
            <li key={day.date}>
              <button
                type="button" className="sysstatus-history-row"
                onClick={() => setExpandedDate((cur) => (cur === day.date ? null : day.date))}
              >
                <span className="sysstatus-history-date">{day.date.slice(5).replace("-", "/")}</span>
                <span className={`sysstatus-badge sysstatus-badge--${SYSTEM_STATUS_BADGE_CLASS[day.label]}`}>{day.label}</span>
              </button>
              {expandedDate === day.date && (
                <div className="sysstatus-history-detail"><SystemStatusRows day={day} /></div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function SystemStatusRows({ day }: { day: DayStatus }) {
  const [errorExpanded, setErrorExpanded] = useState(false);
  const coverage = memberCoverageSuffix(day.newsMemberCovered, day.newsMemberTotal);
  const newsText = day.newsOk === null ? "-" : !day.newsOk ? "실패" : day.newsCount !== null ? `정상 · ${day.newsCount}건${coverage}` : `정상${coverage}`;

  return (
    <div className="sysstatus-rows">
      <div className="sysstatus-row"><span>예약 실행</span><span>{CRON_SCHEDULED_TIME_KST}</span></div>
      <div className="sysstatus-row"><span>실제 시작</span><span>{day.cronStartedAt ? formatUpdatedAt(day.cronStartedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>완료</span><span>{day.cronFinishedAt ? formatUpdatedAt(day.cronFinishedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>News</span><span>{newsText}</span></div>
      {/* 뉴스 파싱 기록 - 단계별 통과/탈락. "정상 4건 / 5명"만 있던 시절에는 4건을 못 채운 날에
          시장에 기사가 없었던 건지 필터가 좁았던 건지 화면에서 구별할 수 없었다. 채용의
          "단계 D/E/F"와 같은 역할이다(admin-status.ts NewsPipelineStats).
          기록을 남기기 전 날짜와 "이미 생성돼 있어 스킵한 날"은 값이 없어 이 줄을 아예 그리지 않는다. */}
      {day.newsStats && (
        <div className="sysstatus-row">
          <span>News 파싱</span>
          <span className="sysstatus-job-breakdown">
            <span>┌ 수집 RSS {day.newsStats.sources}개 → 기사 {day.newsStats.fetched}건</span>
            <span>├ 필터 통과 {day.newsStats.passed}건 (최근 {day.newsStats.lookbackDays}일)</span>
            <span>├ 탈락 중복 {day.newsStats.rejectedDup} / 주제 {day.newsStats.rejectedTopic} / 기간 {day.newsStats.rejectedOld}</span>
            {/* 같은 사건 접기(event-dedupe)는 2026-08-31에 들어왔다 — 그 이전 기록에는 이 필드가
                없으므로 있을 때만 그린다(옛 날짜를 눌렀을 때 "undefined건"이 뜨지 않게). */}
            {day.newsStats.mergedEvents !== undefined && (
              <span>├ 같은 사건 접기 {day.newsStats.mergedEvents}건 → 서로 다른 사건 {day.newsStats.distinct}건</span>
            )}
            <span>└ 후보 {day.newsStats.candidates}건 → AI 선별 {day.newsStats.selected}건</span>
          </span>
        </div>
      )}
      {/* 채용은 회원별 개인화라 날짜 집계만으로는 어느 계정이 문제인지 못 읽는다. 정상 회원은
          숫자로만 세고 이상 회원만 행으로 깐다 — 회원이 늘어도 화면은 이상 수에만 비례한다
          (admin-status.ts JobIssue / JOB_ISSUE_MAX). 예전 "사용자 N명 / 실패 N명"은 legacy
          재설정 대기자까지 분모에 넣어 실제 대상 수를 가렸다. */}
      <div className="sysstatus-row">
        <span>Job</span>
        <span className="sysstatus-job-breakdown">
          <span>┌ 정상 {day.outcome.jobsOk}/{day.outcome.jobsEligible}명</span>
          <span>{day.outcome.jobsPendingReset > 0 ? "├" : "└"} 이상 {day.outcome.jobIssues.length + day.outcome.jobIssuesOmitted}명</span>
          {day.outcome.jobsPendingReset > 0 && <span>└ 재설정 대기 {day.outcome.jobsPendingReset}명</span>}
        </span>
      </div>
      {day.outcome.jobIssues.length > 0 && (
        <div className="sysstatus-row">
          <span>Job 이상</span>
          <span className="sysstatus-job-breakdown">
            {day.outcome.jobIssues.map((issue) => (
              <span key={`${issue.who}-${issue.kind}`}>· {issue.who} — {issue.kind} ({issue.detail})</span>
            ))}
            {day.outcome.jobIssuesOmitted > 0 && <span>· 외 {day.outcome.jobIssuesOmitted}명</span>}
          </span>
        </div>
      )}
      {day.jobsOverwritten !== null && day.jobsOverwritten > 0 && (
        <div className="sysstatus-row">
          <span>Job 재수집</span>
          <span>예약 전 배치 {day.jobsOverwritten}건을 크론이 갈아엎음</span>
        </div>
      )}
      {/* 신규 발견 vs 과거 재추천 — NEW 배지가 왜 0건인지를 가르는 줄이다. 신규 0건이면 그날
          generate.ts가 STEP F(과거 활성 공고 재추천)까지 내려갔다는 뜻이다. 며칠 연속이면
          시장에 신규가 없는 게 아니라 수집(검색 폭·필터)을 봐야 한다는 신호로 읽는다. */}
      <div className="sysstatus-row">
        <span>Job 신규</span>
        <span className="sysstatus-job-breakdown">
          {day.outcome.jobsFresh === null
            ? "-"
            : <><span>┌ 신규 {day.outcome.jobsFresh}건</span><span>└ 재추천 {day.outcome.jobsReserved ?? 0}건</span></>}
        </span>
      </div>
      {/* 결과 점검 — cron이 "성공"이라고 적어둔 것과 별개로, 실제 저장된 결과물을 다시 본 값이다.
          예전엔 이 줄이 없어서 뉴스 3건 + 중복 + 채용 수집 실패가 겹친 날도 "정상"으로 떴다. */}
      <div className="sysstatus-row">
        <span>결과 점검</span>
        <span className="sysstatus-job-breakdown">
          {day.outcome.problems.length === 0
            ? "이상 없음"
            : day.outcome.problems.map((p) => <span key={p}>· {p}</span>)}
        </span>
      </div>
      <div className="sysstatus-row"><span>Fallback</span><span>{day.fallbackAt ? formatUpdatedAt(day.fallbackAt) : "없음"}</span></div>
      <div className="sysstatus-row"><span>최종 생성</span><span>{day.finalGeneratedAt ? formatUpdatedAt(day.finalGeneratedAt) : "-"}</span></div>
      {day.errorMessage && (
        <div className="sysstatus-error">
          <p className="sysstatus-error-label">실패 원인</p>
          <p className={errorExpanded ? "sysstatus-error-text" : "sysstatus-error-text sysstatus-error-text--clamped"}>{day.errorMessage}</p>
          {day.errorMessage.length > 120 && (
            <button type="button" className="sysstatus-error-toggle" onClick={() => setErrorExpanded((v) => !v)}>
              {errorExpanded ? "간략히" : "자세히 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function isoDate(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// 날짜 칸에 표시할 최대 3개를 정할 때: 기간 메모(start_date !== end_date) 우선, 그 다음 최근 등록/수정순.
// 컴포넌트 state를 참조하지 않는 순수 함수라 isoDate처럼 모듈 스코프에 둔다(매 렌더 재생성 방지).
function calendarCellPriority(memos: Memo[]): Memo[] {
  return [...memos].sort((a, b) => {
    const rangeDiff = Number(b.start_date !== b.end_date) - Number(a.start_date !== a.end_date);
    if (rangeDiff !== 0) return rangeDiff;
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

function groupMemosByDay(memos: Memo[], year: number, month0: number, monthLastDate: number): Map<number, Memo[]> {
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
function isIdeaResult(v: unknown): v is IdeaResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.recommendationTitle === "string" && Array.isArray(o.developmentSteps);
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* 클립보드 권한 없으면 무시 */ }
}


type DashboardProps = {
  weather: WeatherView;
  briefing: BriefingView | null;
  jobs: JobsView | null;
  newsHistory: BriefingHistoryDay[];
  today: { year: number; month0: number; day: number };
  memosForMonth: Memo[] | null;
  importantMemos: Memo[] | null;
  projectIdeas: ProjectIdea[] | null;
  focusView: FocusView | null;
  ideaView: IdeaView | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  hasPasswordLogin: boolean;
  initialTheme: "light" | "dark";
  nickname: string | null;
  email: string | null;
  jobRolePriority: JobRole[];
  hasLegacyRoles: boolean;
  mindset: string;
};

type MemoReorder = {
  displayed: Memo[];
  draggingId: string | null;
  group: string;
  pinned: boolean;
  bind: (m: Memo) => Record<string, unknown>;
};

// 고정 메모와 중요 메모의 순서 변경은 완전히 같은 동작이라 훅 하나로 쓴다.
// 순서는 두 목록 모두 memo.pin_order에 저장한다 — getImportantMemos가 is_pinned → pin_order →
// pinned_at → start_date 순으로 정렬하므로 비고정 메모에도 그대로 먹는다(새 컬럼/마이그레이션 없음).
//
// 예전엔 HTML5 draggable + onDragOver로 순서를 바꿨는데 두 가지 문제가 있었다.
// (1) dragover는 커서가 멈춰 있어도 초당 수십 번 발사되는데 매번 상태를 갱신해 Dashboard 전체가
//     그만큼 리렌더돼 웹에서 드래그가 통째로 멈춰 보였다.
// (2) 터치에서는 dragstart 자체가 안 떠서 모바일에서는 순서를 아예 못 바꿨다.
// 그래서 관심 직무 우선순위(PriorityList)와 같은 Pointer Events 방식으로 옮겼다.
// (3) 그런데 누르는 즉시 포인터를 캡처해서, 가로로 늘어선 카드를 스크롤하려고 손가락만 대도
//     그게 드래그가 됐다. 시작 조건은 useHoldDrag에 맡긴다 — 꾹 눌러야 집힌다.
function useMemoReorder(memos: Memo[], pinned: boolean, group: string, onTap: (m: Memo) => void): MemoReorder {
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderRef = useRef<string[] | null>(null);

  // dragOrder는 다이얼로그를 열 때 한 번만 찍은 스냅샷이라, 그 안에서 새로 고정/해제하면 memos는
  // 바뀌어도 이 순서엔 반영이 안 돼 나갔다 와야 보였다 — 없어진 id는 버리고 새 id는 뒤에 붙인다.
  const displayed = dragOrder
    ? (() => {
        const known = dragOrder.filter((id) => memos.some((m) => m.id === id));
        const extra = memos.filter((m) => !known.includes(m.id)).map((m) => m.id);
        return [...known, ...extra].map((id) => memos.find((m) => m.id === id)).filter(Boolean) as Memo[];
      })()
    : memos;

  const drag = useHoldDrag<Memo>({
    onHold(m) {
      orderRef.current = dragOrder ?? memos.map((x) => x.id);
      setDraggingId(m.id);
    },
    onMove(m, { x, y }) {
      const under = document.elementFromPoint(x, y);
      const card = under instanceof Element ? under.closest<HTMLElement>("[data-reorder-id]") : null;
      // 고정 목록과 중요 목록은 같은 다이얼로그에 나란히 있다 — 그룹을 확인하지 않으면 한 목록의
      // 카드를 다른 목록 위로 끌었을 때 엉뚱한 배열에서 인덱스를 찾다가 순서가 튄다.
      if (!card || card.dataset.reorderGroup !== group) return;
      const overId = card.dataset.reorderId;
      if (!overId || overId === m.id) return;
      const order = orderRef.current ?? memos.map((x) => x.id);
      const from = order.indexOf(m.id);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, m.id);
      orderRef.current = next;
      setDragOrder(next); // 카드가 실제로 자리를 바꿀 때만 렌더한다
    },
    onEnd(m, outcome) {
      setDraggingId(null);
      // 꾹 누르지 않고 그냥 눌렀다 뗐으면 탭 — 기존처럼 메모를 연다.
      if (outcome === "tap") { onTap(m); return; }
      const order = orderRef.current;
      orderRef.current = null;
      // 집었다가 그대로 놨으면(cancel) 순서가 그대로라 서버에 갈 이유가 없다.
      if (outcome !== "drag" || !order) return;
      // reorderPinnedMemos가 revalidatePath("/")를 부르므로 그 응답이 새 importantMemos를 실어 온다 —
      // 별도 router.refresh()는 두 번째 전체 재렌더였다(refreshAfterMemoChange 주석 참고).
      void reorderPinnedMemos(order, pinned);
    },
  });

  return {
    displayed,
    draggingId,
    group,
    pinned,
    bind: drag.bind,
  };
}


// Key Notes의 카드 목록(고정 메모 / 중요 메모) — **드래그 순서 state를 이 안에 가둔다.**
//
// 실측(2026-08-24)이 이 컴포넌트가 존재하는 이유다. 예전엔 순서 state가 Dashboard에 있어서
// 카드를 한 칸 옮길 때마다 Dashboard(단일 컴포넌트, JSX 약 290KB)가 통째로 다시 그려졌다:
//   배포(Vercel): 다이얼로그 열기 156ms / 재열기 63ms  -> 드래그 중 이 비용이 이동마다 반복
//   로컬(dev):    2282ms / 2380ms, long task 2~3초 (dev는 StrictMode로 렌더가 2배)
// state를 여기로 내리면 드래그 중 다시 그려지는 건 이 목록뿐이다. memo()를 씌워 부모가 다른
// 이유로(날씨 폴링 등) 렌더돼도 props가 그대로면 건너뛴다.
//
// 화면에 보이는 결과는 이전과 같아야 한다 — 카드 마크업도 정렬 규칙도 옮기기만 했다.
const KeynoteCardList = memo(function KeynoteCardList({
  memos, pinned, group, className, onTap,
}: {
  memos: Memo[];
  pinned: boolean;
  group: string;
  className: string;
  onTap: (m: Memo) => void;
}) {
  const { displayed, draggingId, bind } = useMemoReorder(memos, pinned, group, onTap);
  return (
    <div className={className}>
      {displayed.map((m) => (
        <div
          key={m.id}
          className={`postit ${postitColorClass(m.color)}${draggingId === m.id ? " dragging" : ""}`}
          data-reorder-id={m.id}
          data-reorder-group={group}
          {...bind(m)}
        >
          <span className={pinned ? "pin" : "pin star"}>{pinned ? "📌" : "★"}</span>
          <div className="postit-title">{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
          {m.content && <div className="postit-body">{memoPreview(m)}</div>}
          <div className="s">{m.memo_type} · {m.start_date}{m.content_mode === "document" && <span className="memo-detail-badge"> · 상세 ›</span>}</div>
        </div>
      ))}
    </div>
  );
});

export default function Dashboard({ weather: initialWeather, briefing: initialBriefing, jobs: initialJobs, newsHistory, today, memosForMonth, importantMemos, projectIdeas, focusView, ideaView, isLoggedIn, isAdmin, hasPasswordLogin, initialTheme, nickname, email, jobRolePriority, hasLegacyRoles, mindset: initialMindset }: DashboardProps) {
  // 테마 — 실제 적용은 <html data-theme>이고 그건 layout.tsx의 인라인 스크립트가 첫 페인트 전에
  // 이미 확정해뒀다. 여기 state는 "지금 무슨 테마인가"를 JSX(토글 아이콘, data-memo-theme)에
  // 알려주는 거울일 뿐이라, localStorage를 다시 읽지 않고 DOM에 붙은 값을 그대로 읽어온다.
  // 판별 로직이 두 벌이 되면 나중에 한쪽만 고쳐서 어긋난다 — 판별은 인라인 스크립트 한 곳뿐이다.
  //
  // 🔴 초기값은 **서버가 쿠키로 넘겨준 값**이다("light" 하드코딩이 아니다). 예전엔 무조건 "light"로
  // 시작하고 마운트 후 effect에서 고쳤는데, 그러면 다크 사용자에게 첫 HTML이 라이트 메모지로 나가고
  // (Key Notes 패널 등이 이 값을 data-memo-theme으로 쓴다) 하이드레이션이 끝나서야 다크로 바뀐다.
  // 쿠키는 layout.tsx 인라인 스크립트가 localStorage와 같은 값으로 심는다 — 판별은 여전히 거기 한 곳뿐이다.
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  // 안전망. 쿠키가 아직 없는 첫 방문(스크립트가 이번 요청 뒤에 심는다)이나 쿠키가 지워진 경우
  // 서버 값과 DOM이 어긋난다 — 그때만 맞춘다.
  // ⚠️ useEffect가 아니라 **layout**이다. useEffect는 페인트 뒤에 돌아서 한 프레임이 그대로 번쩍인다.
  useIsoLayoutEffect(() => {
    const actual = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (actual !== initialTheme) setTheme(actual);
    // initialTheme은 서버 prop이라 이 컴포넌트가 사는 동안 안 바뀐다 — 마운트 시 1회면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    // 서버가 다음 요청의 첫 HTML을 맞는 색으로 그리도록 쿠키도 같이 갱신한다(위 initialTheme 주석).
    // localStorage와 **같은 값**이어야 한다 — 어긋나면 위 안전망이 한 프레임 늦게 고치게 된다.
    document.cookie = `skillpilot_theme=${next};path=/;max-age=31536000;samesite=lax`;
    // theme-color(PWA 상태바 · 브라우저 크롬)는 여기서 안 건드린다 — setTheme이 아래
    // "브라우저 크롬 색" effect를 돌리고, 그 한 곳이 유일한 쓰기 지점이다(mobileEditActive 참조).
    try {
      localStorage.setItem("skillpilot_theme", next);
    } catch {
      // 사파리 프라이빗 모드 등 저장이 막힌 환경 — 이번 세션 동안만 적용되고 새로고침하면 라이트로 돌아간다.
    }
  };

  const { weather, region, airQuality, warnings } = useLiveWeather(initialWeather);
  // 오류 화면의 [다시 시도]가 성공하면 그 결과를 바로 반영해야 해서 로컬 state로 미러링한다
  // (memosForMonthState와 같은 패턴) — 아래 briefing/jobs를 쓰는 코드는 전부 그대로 두고 이름만 재사용한다.
  const [briefing, setBriefing] = useState(initialBriefing);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setBriefing(initialBriefing), [initialBriefing]);
  const [jobs, setJobs] = useState(initialJobs);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setJobs(initialJobs), [initialJobs]);
  // News/Job Description은 page.tsx SSR에서 더 이상 기다리지 않는다 — fallback 생성(RSS/Gemini,
  // Tavily 호출)이 대시보드 전체 로딩을 막지 않도록 마운트 후 각자 따로, 독립적으로 불러온다.
  // isLoggedIn && briefing===null(=jobs===null)은 "아직 안 불러옴"만 의미한다 — getTodayBriefing/
  // getJobsForUser는 원래도 null을 반환하지 않아서 로딩 여부와 실제 데이터가 서로 안 겹친다.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    getBriefingViewAction()
      .then((view) => { if (!cancelled) setBriefing(view); })
      .catch(() => {
        if (cancelled) return;
        setBriefing({ selectedNews: [], trendBrief: null, generatedAt: null, briefingDate: todayIso, stale: true, pending: false });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    // 우선순위(jobRolePriority)를 넘긴다 — canonical 정렬된 값으로는 quota 배분을 못 한다.
    getJobsViewAction(jobRolePriority)
      .then((view) => { if (!cancelled) setJobs(view); })
      .catch(() => {
        if (cancelled) return;
        setJobs({ jobs: [], lastUpdated: null, jobDate: todayIso, stale: true, incomplete: false, todayProcessing: false, pending: false });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);
  const [briefingRetrying, setBriefingRetrying] = useState(false);
  const [jobsRetrying, setJobsRetrying] = useState(false);
  async function handleRetryBriefing() {
    if (briefingRetrying) return;
    setBriefingRetrying(true);
    try {
      const res = await retryBriefingAction();
      if ("ok" in res) setBriefing(res.view);
      else alert(res.error);
    } finally {
      setBriefingRetrying(false);
    }
  }
  async function handleRetryJobs() {
    if (jobsRetrying) return;
    setJobsRetrying(true);
    try {
      const res = await retryJobsAction(jobRolePriority);
      if ("ok" in res) setJobs(res.view);
      else alert(res.error);
    } finally {
      setJobsRetrying(false);
    }
  }
  // 메인 카드는 항상 오늘 것만 — 히스토리 선택은 상세 다이얼로그 안에서만 적용된다
  const newsItems = briefing?.selectedNews ?? [];
  const trendBriefing = briefing?.trendBrief ?? null;
  // generatedAt이 null인 건 get-briefing.ts의 최종 실패 fallback뿐이다 — 이때만 진짜 오류로 본다
  // (오늘 조건에 맞는 뉴스가 0건인 정상적인 경우는 generatedAt이 채워져 있다).
  const newsFailed = !!briefing && briefing.generatedAt === null;
  // lastUpdated가 null인 건 정상 성공(4건) batch가 한 번도 없었다는 뜻이다 — 이때만 진짜 오류로 본다
  // (news의 newsFailed와 동일한 기준. 과거 성공 배치가 있으면 stale로 보여주지 오류로 취급하지 않는다).
  const jobsFailed = !!jobs && jobs.lastUpdated === null;
  // "지금 업데이트" 버튼은 오늘 정상 4건이 없고(stale) KST 11:01도 지났고, 지금 processing 중이 아닐 때만 노출한다 —
  // 10:10~11:00 사이는 cron이 아직 안 돌았을 뿐인 정상 범위라 지연으로 취급하지 않는다.
  // 관리자 계정은 상한이 없으므로(actions/briefing.ts) 지연 상태가 아니어도 항상 버튼을 노출한다 —
  // 결과를 여러 번 돌려보는 게 이 계정의 용도다.
  const newsDelayed = isAdmin || (!!briefing?.stale && isPastManualRefreshWindow());
  // incomplete(오늘 배치인데 4건 미만)도 재시도 대상이다 — partial 결과를 화면에 띄우기
  // 시작하면서 그런 날은 stale=false가 됐다. stale만 보면 복구 버튼이 사라진다.
  const jobsDelayed = !jobs?.todayProcessing && (isAdmin || ((!!jobs?.stale || !!jobs?.incomplete) && isPastManualRefreshWindow()));
  // 뉴스 히스토리 — 오늘(null)이 기본, 어제/그저께 날짜를 고르면 그날 캐시로 바꿔 보여준다.
  const [newsHistoryDate, setNewsHistoryDate] = useState<string | null>(null);
  const activeNewsItems = newsHistoryDate ? (newsHistory.find((h) => h.date === newsHistoryDate)?.selectedNews ?? []) : newsItems;
  function historyDateLabel(date: string): string {
    const [, m, d] = date.split("-");
    return `${Number(m)}.${Number(d)}`;
  }

  // Job Description — 추천 공고(항상 4건) / 최근 추천 2탭. 날짜별 히스토리 UI는 없앴다.
  // 최근 탭은 처음엔 필요 없으므로 탭을 열 때만 지연 조회하고, null(미조회)과 빈 배열(0건)을 구분한다.
  const [jobTab, setJobTab] = useState<"recommended" | "recent">("recommended");
  const [expandedJobUrl, setExpandedJobUrl] = useState<string | null>(null);
  const [jobsRecent, setJobsRecent] = useState<SavedJobRow[] | null>(null);
  useEffect(() => {
    if (jobTab !== "recent" || jobsRecent !== null || !jobs) return;
    // 위 두 이펙트(briefing/jobs)와 같은 cancelled + catch 짝을 반드시 둔다. 예전엔 둘 다 없어서
    // requireUser()가 세션 만료로 throw하면 jobsRecent가 null에 영구히 머물렀다 — "최근 추천" 탭이
    // 빈 채로 굳고(재조회 조건이 jobsRecent===null이라 다시 시도하지도 못한다) unhandled rejection이 남았다.
    // deps에 jobs가 있어서 in-flight 중 jobs identity가 바뀌면 두 번 나가는 문제도 같이 막는다.
    let cancelled = false;
    getJobsRecentViewAction(jobs.jobs.map((j) => j.url))
      .then((rows) => { if (!cancelled) setJobsRecent(rows); })
      .catch(() => { if (!cancelled) setJobsRecent([]); }); // 0건과 구분할 방법이 화면에 없어 빈 배열로 닫는다
    return () => { cancelled = true; };
  }, [jobTab, jobsRecent, jobs]);
  function selectJobTab(tab: "recommended" | "recent") {
    setJobTab(tab);
    setExpandedJobUrl(null); // 탭 변경 시 펼친 상세는 초기화
  }
  // 추천 공고 / 최근 추천 두 탭이 같은 카드를 쓴다 — 접힌 요약(collapsed) + 상세보기 펼침(accordion).
  function renderJobCard(j: SavedJobRow) {
    const techTags = extractTechTags(j.role, j.responsibilities, j.required_text, j.preferred_text);
    const isExpanded = expandedJobUrl === j.url;
    const isExpired = !!j.deadline && j.deadline < todayIso;
    return (
      <div
        key={j.id}
        className={`editorial-card job-card${isExpired ? " is-expired" : ""}`}
        {...selectableHandlers({ type: "job", title: `${j.company} / ${j.title}`, url: j.url })}
      >
        <div className="editorial-top-row">
          {j.is_new && <span className="job-new-badge">NEW</span>}
          <span className="editorial-pill">{j.company}</span>
          {j.source_site && <span className="editorial-pill">{j.source_site}</span>}
          {isExpired && <span className="job-expired-badge">마감</span>}
          <div className="job-card-actions">
            <button
              type="button" className="editorial-save-all-btn"
              onMouseUp={(e) => e.stopPropagation()} onClick={() => openFullJobPicker(j, techTags)}
              title="이 채용공고 전체를 메모로 저장"
            >
              📥 전체 저장
            </button>
            <a className="editorial-link-icon" href={j.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()} title="원문 보기">↗</a>
          </div>
        </div>
        <h4 className="job-role-title">{j.title}</h4>
        <div className="job-meta-row">
          <span>👤 {j.career_requirement ?? "경력 무관"}</span>
          <span>🕓 마감 {j.deadline ?? "상시"}</span>
        </div>
        {techTags.length > 0 && (
          <div className="editorial-tags" style={{ marginBottom: 14 }}>
            {techTags.map((t) => <span key={t} className="editorial-tag">{t}</span>)}
          </div>
        )}
        <button
          type="button" className="job-detail-toggle"
          onMouseUp={(e) => e.stopPropagation()}
          onClick={() => setExpandedJobUrl((v) => (v === j.url ? null : j.url))}
        >
          {isExpanded ? "접기" : "상세보기"} {isExpanded ? <ChevronUp size={14} strokeWidth={2.2} /> : <ChevronDown size={14} strokeWidth={2.2} />}
        </button>
        {isExpanded && (
          <div className="job-detail-content">
            {j.responsibilities && (
              <div className="editorial-section">
                <div className="editorial-section-label">📋 주요 업무</div>
                {parseJobTextSections(j.responsibilities).map((group, gi) => (
                  <div key={gi} className="editorial-subgroup">
                    {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                    <ul className="editorial-bullet-list">
                      {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {j.required_text && (
              <div className="editorial-section">
                <div className="editorial-section-label">🎯 자격요건</div>
                {parseJobTextSections(j.required_text).map((group, gi) => (
                  <div key={gi} className="editorial-subgroup">
                    {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                    <ul className="editorial-bullet-list">
                      {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {j.preferred_text && (
              <div className="editorial-section">
                <div className="editorial-section-label">⭐ 우대사항</div>
                {parseJobTextSections(j.preferred_text).map((group, gi) => (
                  <div key={gi} className="editorial-subgroup">
                    {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                    <ul className="editorial-bullet-list">
                      {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {/* 이미지로만 올라온 공고 — 세 필드가 전부 비거나 장식만 남았다. 예전엔 세 블록이 전부
                조건부라 상세 패널이 **완전히 빈 채로** 열렸다(라이브 81건 중 10건). OCR은 하지 않고,
                왜 비었는지와 원문 링크만 정직하게 준다. 마크업/클래스는 위 세 섹션과 동일하다. */}
            {!hasUsableBody(j) && (
              <div className="editorial-section">
                <div className="editorial-section-label">📄 본문 없음</div>
                <ul className="editorial-bullet-list">
                  <li>
                    이미지로 올라온 공고라 본문 텍스트를 가져오지 못했습니다.{" "}
                    <a href={j.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문에서 확인하기 ↗</a>
                  </li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const router = useRouter();
  const todayIso = isoDate(today.year, today.month0, today.day);

  // 뉴스/채용 수동 새로고침은 삭제됐다 — 예약 생성 + 당일 최초 접속 fallback으로만 갱신된다.

  // My Page — 기존 dialog 구조를 그대로 쓴다. 닉네임/관심 직무/비밀번호 변경/로그아웃만 둔다.
  const [myNickname, setMyNickname] = useState(nickname ?? "");
  // myRoles는 체크된 집합이자 그 순서 그대로 priority다(JobRolePicker의 value와 동일한 패턴) — 초기값은
  // 저장된 우선순위(jobRolePriority)를 쓴다.
  const [myRoles, setMyRoles] = useState<JobRole[]>(jobRolePriority);
  const [myPageMessage, setMyPageMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  // 이메일 링크가 아니라 My Page 안에서 바로 변경한다
  // 현재 비밀번호 — 세션만으로 비밀번호를 바꿀 수 있으면 잠깐 빌려준 기기 하나가 계정 탈취가 된다.
  // 검증은 서버(actions/auth.ts changePassword)가 하고, 여기서는 값만 받아 넘긴다.
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myPassword, setMyPassword] = useState("");
  const [myPasswordConfirm, setMyPasswordConfirm] = useState("");
  const myPasswordConfirmState: FieldState = myPassword.length > 0 && myPassword.length < 8
    ? { kind: "error", message: "비밀번호는 8자 이상 입력해주세요." }
    : myPasswordConfirm.length === 0
      ? null
      : myPassword === myPasswordConfirm
        ? { kind: "success", message: "비밀번호가 일치합니다." }
        : { kind: "error", message: "비밀번호가 일치하지 않습니다." };
  // 🔴 현재 비밀번호 "일치 여부"를 **타이핑 중에** 보여준다(사용자 요청 3회).
  //
  // 확인칸은 두 값을 비교하면 끝이지만 이건 서버만 아는 값이라, 예전 구현은 "저장을 눌러야"
  // 문구가 떴다 — 그게 신고가 세 번 반복된 이유다. 값이 아니라 **문제 정의**가 달랐다.
  // 이제 입력이 멈추고 500ms 뒤 verifyCurrentPassword를 부른다(메모 자동저장과 같은 디바운스 패턴).
  //
  // ⚠️ 응답이 순서를 바꿔 도착하면 옛 판정이 새 입력을 덮는다 — 요청마다 seq를 붙여
  //    **마지막 요청의 응답만** 반영한다. 그 사이 값이 또 바뀌면 그 응답은 버린다.
  const [myCurrentPasswordError, setMyCurrentPasswordError] = useState<string | null>(null);
  const [myCurrentPwCheck, setMyCurrentPwCheck] = useState<"idle" | "checking" | "match" | "wrong">("idle");
  const pwCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pwCheckSeq = useRef(0);
  function onCurrentPasswordChange(value: string) {
    setMyCurrentPassword(value);
    if (myCurrentPasswordError) setMyCurrentPasswordError(null);
    if (pwCheckTimer.current) clearTimeout(pwCheckTimer.current);
    if (!value) { setMyCurrentPwCheck("idle"); return; }
    setMyCurrentPwCheck("checking");
    const seq = ++pwCheckSeq.current;
    pwCheckTimer.current = setTimeout(async () => {
      const r = await verifyCurrentPassword(value).catch(() => null);
      if (seq !== pwCheckSeq.current) return;   // 더 최근 입력이 있다 — 이 응답은 버린다
      setMyCurrentPwCheck(r?.match ? "match" : "wrong");
    }, 500);
  }
  const myCurrentPasswordState: FieldState = myCurrentPasswordError
    ? { kind: "error", message: myCurrentPasswordError }
    : myCurrentPwCheck === "match"
      ? { kind: "success", message: "현재 비밀번호가 일치합니다." }
      : myCurrentPwCheck === "wrong"
        ? { kind: "error", message: "현재 비밀번호가 일치하지 않습니다." }
        : null;   // idle·checking에는 문구를 안 띄운다 — 확인 중 깜빡이는 게 더 산만하다
  // 🔴 비밀번호 칸을 탭하면 **스크롤러 위쪽으로 데려온다.**
  //
  // 껍데기에 `--kb-inset`을 먹인 것(dashboard.css)으로 "칸이 키보드 뒤에 깔린다"는 풀렸지만,
  // 그것만으로는 칸이 **키보드 바로 위**에 걸린다. 거기는 크롬의 autofill 액세서리 바
  // (열쇠·카드 칩)가 사는 자리라 그 칩들이 칸을 덮는다 — 그 바는 우리가 못 없앤다(지뢰표
  // "키보드 위는 우리 영역이 아니다"). 없앨 수 없으면 **칸을 그 위로 올리는 수밖에 없다.**
  //
  // ⚠️ `block: "start"`가 아니라 `"center"`다. start면 칸이 스크롤러 맨 위에 붙어 라벨(wave-label)이
  //    잘리고, 아래 보조문구("일치합니다")가 화면 밖으로 나간다. center는 라벨·문구를 같이 데려온다.
  // ⚠️ 지연 250ms: 키보드가 올라오며 `vv.height`가 줄어든 **뒤에** 재야 맞는 자리로 간다.
  //    0ms면 아직 키보드 전 높이라 엉뚱한 데로 간다. (메모 편집의 캐럿 노출과 달리 여기는
  //    요소 스크롤러라 지뢰표의 "캐럿 소유자" 규칙과 충돌하지 않는다 — 그 규칙은
  //    `.memo-edit-page`(문서가 스크롤러) 전용이다.)
  // ⚠️ `behavior: "auto"` — smooth는 실측상 420ms 멈춰 있다가 움직여서 그 사이 리플로우가 끼면
  //    멈춘 채 남는다(지뢰표).
  function revealMyPageField(e: React.FocusEvent<HTMLInputElement>) {
    // 🔴 input이 아니라 **`.wave-field` 래퍼**를 굴린다 — 라벨(wave-label)과 아래 보조문구
    //    ("일치합니다")까지 한 덩어리로 데려와야 한다. input만 굴리면 라벨이 위로 잘린다.
    // 🔴 `block: "start"` — center로는 액세서리 바(열쇠·카드 칩)를 못 피한다는 신고를 받았다.
    //    start로 올리고, 라벨이 스크롤러 천장에 붙지 않게 여유는 CSS `scroll-margin-top`이 준다
    //    (dashboard.css `.mypage-card .wave-field`). 값을 여기 px로 박지 않는 이유는 그 여유가
    //    레이아웃(safe-area·패딩) 쪽 값이라서다.
    const el = (e.currentTarget.closest(".wave-field") as HTMLElement | null) ?? e.currentTarget;
    window.setTimeout(() => el.scrollIntoView({ block: "start", behavior: "auto" }), 250);
  }
  // System Status(관리자 전용) — 탭을 처음 열 때만 서버에서 가져오고, 이후 같은 모달 세션에서는 재사용한다.
  // "상태 다시 확인" 버튼도 이 fetch 함수를 그대로 다시 부른다(cron/뉴스/채용 재실행은 안 함, 조회만).
  const [myPageTab, setMyPageTab] = useState<"account" | "status">("account");
  const [systemStatus, setSystemStatus] = useState<DayStatus[] | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<SystemStatusErrorState | null>(null);
  const [systemStatusFetchedAt, setSystemStatusFetchedAt] = useState<string | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);
  function openMyPage() {
    setMyNickname(nickname ?? "");
    setMyRoles(jobRolePriority);
    setMyCurrentPassword("");
    setMyPassword("");
    setMyPasswordConfirm("");
    setMyCurrentPasswordError(null);
    setMyCurrentPwCheck("idle");
    pwCheckSeq.current++;   // 진행 중인 대조 응답을 버린다
    setMyPageMessage(null);
    setMyPageTab("account");
    open(dialogs.myPage);
  }
  function refreshSystemStatus() {
    setSystemStatusLoading(true);
    setSystemStatusError(null);
    getSystemStatusAction()
      .then((result) => {
        if ("error" in result) setSystemStatusError({ message: result.error, reason: result.reason, at: result.at });
        else { setSystemStatus(result.days); setSystemStatusFetchedAt(result.fetchedAt); }
      })
      .catch((e) => setSystemStatusError({ message: e instanceof Error ? e.message : String(e), reason: "query_failed", at: new Date().toISOString() }))
      .finally(() => setSystemStatusLoading(false));
  }
  function openSystemStatusTab() {
    setMyPageTab("status");
    if (systemStatus || systemStatusLoading) return;
    refreshSystemStatus();
  }
  // 비밀번호 변경도 이 버튼 하나로 처리한다 — 새 비밀번호를 입력했을 때만 같이 반영한다
  async function handleSaveProfile() {
    if (myPassword.length > 0 && (myPassword.length < 8 || myPassword !== myPasswordConfirm)) {
      setMyPageMessage({ kind: "error", text: "비밀번호를 확인해주세요." });
      return;
    }
    // 서버도 같은 것을 막지만, 왕복 한 번을 아끼고 어느 칸이 비었는지 바로 알려준다.
    // 폼 아래 공통 자리가 아니라 **그 칸 밑**에 그린다 — 어느 칸 얘기인지가 문구에 안 들어간다.
    if (myPassword.length > 0 && hasPasswordLogin && !myCurrentPassword) {
      setMyCurrentPasswordError("현재 비밀번호를 입력해주세요.");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await updateProfile(myNickname, myRoles, myRoles);
      if (result.error) { setMyPageMessage({ kind: "error", text: result.error }); return; }
      if (myPassword) {
        const pwResult = await changePassword(myCurrentPassword, myPassword, myPasswordConfirm);
        if (pwResult.error) {
          if ("field" in pwResult && pwResult.field === "current") setMyCurrentPasswordError(pwResult.error);
          else setMyPageMessage({ kind: "error", text: pwResult.error });
          return;
        }
        setMyCurrentPassword("");
        setMyPassword("");
        setMyPasswordConfirm("");
        setMyCurrentPasswordError(null);
    setMyCurrentPwCheck("idle");
    pwCheckSeq.current++;   // 진행 중인 대조 응답을 버린다
      }
      setMyPageMessage(null);
      // router.refresh() 없음 — updateProfile이 revalidatePath("/")를 부르므로 그 액션 응답이 이미
      // 새 props를 실어 온다(refreshAfterMemoChange 주석 참고).
      setSaveToast(true);
      setTimeout(() => { setSaveToast(false); close(dialogs.myPage); }, 1200);
    } finally {
      setSavingProfile(false);
    }
  }

  const newsRef = useRef<HTMLDialogElement>(null);
  const jobsRef = useRef<HTMLDialogElement>(null);
  const memoRef = useRef<HTMLDialogElement>(null);
  const keynotesRef = useRef<HTMLDialogElement>(null);
  const bodyEditorRef = useRef<HTMLDialogElement>(null);
  const projectsRef = useRef<HTMLDialogElement>(null);
  const projectDetailRef = useRef<HTMLDialogElement>(null);
  const focusRef = useRef<HTMLDialogElement>(null);
  const ideaRef = useRef<HTMLDialogElement>(null);
  const postitOnlyRef = useRef<HTMLDialogElement>(null);
  const trendBriefRef = useRef<HTMLDialogElement>(null);
  const myPageRef = useRef<HTMLDialogElement>(null);
  const supportDialogRef = useRef<SupportDialogHandle>(null);
  const dialogs = {
    news: newsRef, jobs: jobsRef, memo: memoRef, keynotes: keynotesRef,
    bodyEditor: bodyEditorRef, projects: projectsRef, projectDetail: projectDetailRef,
    focus: focusRef, idea: ideaRef, postitOnly: postitOnlyRef, trendBrief: trendBriefRef,
    myPage: myPageRef,
  };
  // bigEditorNode/postitViewNode/confirmDialogNode는 memo·keynotes·postitOnly 등 여러 다이얼로그에
  // 그대로 중복 삽입돼 있다 — <dialog>는 열려있지 않아도 자식이 계속 마운트돼 있어서, 실제로 보이는
  // 다이얼로그가 아닌 다른 곳에 있는 textarea에 ref가 붙어버리면 커서 위치를 엉뚱한 곳(주로 0)에서
  // 읽어오는 문제가 생긴다. 지금 열려있는 다이얼로그의 key를 추적해서 그 안에서만 렌더링한다.
  // 키보드가 올라왔을 때 실제로 보이는 높이를 CSS(--app-vh)로 내려보낸다 — 전체화면 편집창이
  // 키보드 뒤까지 늘어나 스크롤이 막히는 것을 막는다.
  useViewportHeight();
  const [activeDialogKey, setActiveDialogKey] = useState<keyof typeof dialogs | null>(null);
  // 모바일 여부는 **렌더에 쓰이므로 state여야 한다.** 기존 코드는 이벤트 핸들러 안에서
  // matchMedia를 즉석 호출했는데(그건 괜찮다), 아래 모바일 편집 페이지는 JSX 분기라
  // 회전/창 크기 변경에 반응해야 한다.
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setIsMobileView(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  // Monthly MEMO 작성 폼 열림 여부. 원래 1870절에 있었는데 **여기로 올렸다** — 바로 아래
  // 배경 스크롤 잠금 effect가 이 값을 봐야 하기 때문이다(compose 페이지에서는 잠그면 안 된다).
  const [memoFormOpen, setMemoFormOpen] = useState(false);
  // 🔴🔴 먼슬리 Create를 **일반 페이지**로 — 모바일 메모 편집(`.memo-edit-page`)과 같은 구조다.
  //
  // 옛 구조(fixed <dialog> 껍데기 + 배경 잠금 + 내부 스크롤러)는 WebKit #191204 승격을
  // 구조적으로 허용하고, 한 번 승격되면 되돌릴 수도 상쇄할 수도 없다. 그게 3주짜리 버그였다.
  // 문서를 유일한 스크롤러로 만들면 그 승격이 **일어날 자리 자체가 없어진다.**
  //
  // ★ <dialog> 엘리먼트는 **그대로 둔다.** compose 관련 CSS 77개 중 **64개가 `dialog` 타입
  //   셀렉터로 시작해서**(실측), 평범한 <div>로 옮기면 화면이 통째로 무너진다. 대신 모달을
  //   풀어(top layer에서 내려) 일반 흐름 블록으로 만든다 — 셀렉터는 전부 그대로 매치된다.
  // ★ 마커 클래스도 `.memo-edit-page`를 **재사용한다.** 그러면 이미 검증된 것들이 공짜로 붙는다:
  //   내부 스크롤러 제거 규칙 / 서식툴바 sticky / useViewportHeight의 scrollTo 가드 /
  //   MemoRichEditor의 scrollIntoView 가드. 평행한 두 번째 메커니즘을 만들지 마라.
  const monthlyComposePage = isMobileView && memoFormOpen;
  // 모바일 "메모로 저장"(News/Job/AI Trend → 기존 메모 삽입)도 같은 일반 페이지 구조로 연다.
  const [bigEditorOpen, setBigEditorOpen] = useState(false);
  const bigEditorPage = isMobileView && bigEditorOpen;
  // 전체화면 편집 페이지(메모 수정 / 먼슬리 Create / 메모로 저장) 중 하나라도 문서를 차지하고 있나.
  // 배경 스크롤 잠금 cleanup이 **이전 렌더의 클로저**라 값을 직접 못 읽어서 ref로 넘긴다(1806절).
  // 값은 mobileEditActive가 정해지는 렌더 하단에서 매 렌더 갱신한다.
  const fullPageEditorRef = useRef(false);
  function dialogKeyOf(d: React.RefObject<HTMLDialogElement | null>): keyof typeof dialogs | null {
    return (Object.entries(dialogs).find(([, ref]) => ref === d)?.[0] as keyof typeof dialogs) ?? null;
  }
  const open = (d: React.RefObject<HTMLDialogElement | null>) => {
    // showModal()은 스펙상 다이얼로그에 포커스를 옮기는 focusing steps를 동반하는데, 그 과정에서
    // 브라우저가 배경 페이지를 다이얼로그 쪽으로 스크롤시켜버린다 — 열기 직전 스크롤 위치를 그대로 복원한다.
    const scrollY = window.scrollY;
    d.current?.showModal();
    window.scrollTo(0, scrollY);
    const key = dialogKeyOf(d);
    setActiveDialogKey(key);
    // 이전에 보던 포스트잇/편집 상태가 안 지워진 채로 다이얼로그를 새로 열면 그게 그대로 겹쳐 보인다
    // (예: 주간달력에서 메모 없는 날 클릭 → 이전에 열어본 TODAY 메모가 계속 뜨는 버그).
    // bodyEditor는 이미 열려있는 big editor 위에 한 겹 더 뜨는 중첩 팝업이라 예외로 둔다 — 여기서 지우면
    // "크게 보기"를 닫았을 때 뒤에 있던 편집창까지 같이 사라진다. postitOnly는 이 호출 바로 다음에
    // openPostitView/openBigEditor로 실제 값을 다시 세팅하므로(같은 이벤트 핸들러 안, batching) 안전하다.
    if (key !== "bodyEditor") {
      setPostitViewMemo(null);
      setBigEditorOpen(false);
    }
    if (key === "news") setNewsHistoryDate(null);
    if (key === "jobs") { setJobTab("recommended"); setExpandedJobUrl(null); }
  };
  const close = (d: React.RefObject<HTMLDialogElement | null>) => {
    d.current?.close();
    const key = dialogKeyOf(d);
    setActiveDialogKey((cur) => (cur === key ? null : cur));
  };
  // 다이얼로그가 열려 있는 동안 뒤 문서의 스크롤을 아예 없앤다.
  //
  // 스펙상 showModal()이면 배경 스크롤이 막혀야 하는데 iOS 사파리는 안 막는다. 그 상태에서 메모
  // 입력칸을 탭하면 iOS가 커서를 보이게 하려고 "문서를" 스크롤하고, 그때 화면을 덮고 있던
  // position:fixed 편집창이 문서와 함께 밀려 올라간다. 실기기 화면에서 편집창 아래로 대시보드
  // 푸터("SkillPilot — AI·개발 동향과...")가 그대로 드러난 게 이것이다. 스크롤 제스처도 이 문서
  // 스크롤이 먼저 먹어버려서 본문이 안 움직이는 것처럼 느껴진다.
  //
  // 문서에 스크롤할 것이 없으면 iOS도 밀 수 없다. position:fixed + top:-scrollY가 표준 처방이고,
  // 닫을 때 원래 위치로 되돌린다(그냥 overflow:hidden만으로는 iOS에서 안 먹는다).
  // 🔴🔴 <dialog>는 우리 close()를 **거치지 않고도** 닫힌다 — Esc, 안드로이드 하드웨어 뒤로가기,
  // 브라우저/OS가 top layer를 정리하는 경우. 그러면 activeDialogKey가 그대로 남아 아래 배경 스크롤
  // 잠금의 cleanup이 **영원히 안 돈다**: body가 `position: fixed; top: -Ypx; overflow: hidden`인 채로
  // 굳는다. 그 상태에서는 body의 overflow가 뷰포트로 전파돼 문서 스크롤이 통째로 죽고, 본문은
  // top: -Y 위치에서 잘린 채 남는다 — "메인페이지가 갑자기 이상해진다"의 정체다.
  // 실측(prod, 375x684): Monthly MEMO를 열고 Esc로 닫으면
  //   documentElement.scrollHeight 2640 → **684**, body position **fixed**, top **-1200px**,
  //   window.scrollTo(0, 99999) 해도 scrollY **0** (스크롤 불가). 정상 경로(✕)로 닫으면 2640 / 1200 복원.
  // onCancel을 단 다이얼로그도 조건이 안 맞으면(예: memoFormOpen=false) 그대로 native close로 간다.
  // close 이벤트는 버블링하지 않지만 **캡처 단계는 target까지 내려오므로** document에서 한 번에 받는다 —
  // 다이얼로그 12개에 onClose를 따로 다는 것보다 빠뜨릴 여지가 없다.
  useEffect(() => {
    function onAnyDialogClose(e: Event) {
      // 🔴 우리가 **모달을 풀려고** close() 직후 show()로 다시 연 경우가 있다(먼슬리 Create를
      // 일반 페이지로 내릴 때). close 이벤트는 비동기라 그 시점엔 이미 다시 열려 있는데,
      // 그걸 "닫혔다"로 읽으면 activeDialogKey가 null이 되어 배경 잠금 cleanup이 돌고
      // 화면이 대시보드 스크롤 위치로 튄다(= 지뢰 #3과 같은 사고). 실제 상태를 보고 판단한다.
      if ((e.target as HTMLDialogElement).open) return;
      const key = Object.entries(dialogs).find(([, ref]) => ref.current === e.target)?.[0] as keyof typeof dialogs | undefined;
      if (key) setActiveDialogKey((cur) => (cur === key ? null : cur));
    }
    document.addEventListener("close", onAnyDialogClose, true);
    return () => document.removeEventListener("close", onAnyDialogClose, true);
    // dialogs는 ref 객체 12개를 담은 리터럴이라 렌더마다 새로 만들어지지만 ref 자체는 안정적이다.
    // 리스너는 한 번만 붙이면 되므로 의존성을 비운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // 🔴 먼슬리 Create가 일반 페이지로 내려가 있으면 **잠그면 안 된다.** 그 화면은 문서가
    // 유일한 스크롤러라서, body를 fixed로 묶으면 굴릴 문서 자체가 사라진다(= 스크롤 잠김).
    if (!activeDialogKey || monthlyComposePage || bigEditorPage) return;
    const body = document.body;
    const y = window.scrollY;
    const saved = body.getAttribute("style");
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      // 🔴🔴🔴 2026-08-30 — "복원을 안 하는 것"만으로는 부족했다. 실기기 계측이 그걸 잡았다.
      //
      // `?debug=vp`의 "누가 문서를 굴렸나"가 남긴 실기기 판독:
      //     scrollTo(0)  당시 y=108  docSH=792     (vvTop=0, maxScroll=108)
      // 즉 **우리 `scrollTo(0,0)`이 불릴 때 이미 맨 끝(108)에 가 있었다.** 우리 코드의 호출은
      // 그 하나뿐이었고(아래 가드가 `scrollTo(0, y)`를 정상적으로 막고 있었다), 그렇다면 굴린
      // 것은 우리가 아니라 **브라우저**다 — `position: fixed; top: -Ypx` 잠금을 푸는 순간
      // 잠그기 전의 시각 위치(Y)로 되돌리고, 그 값이 새 페이지의 max로 clamp된 것이다.
      // "복원하지 않는다"는 우리 호출만 막을 뿐 브라우저의 되돌림은 못 막는다.
      //
      // 👉 되돌릴 위치 **자체를 0으로** 만든다. 잠금을 풀기 **전에** top을 0으로 바꾸고 강제로
      //    레이아웃을 한 번 읽어 브라우저가 그 값을 기준으로 삼게 한다. 그러면 풀 때 되돌릴
      //    것이 0이라 clamp될 큰 값이 없다.
      //
      // ★ 이것이 "선택복사에서만 났던" 이유다(사용자가 짚어준 구조 차이). 그 경로만 **다이얼로그가
      //   열려 있어 body가 잠겨 있다**(뉴스/채용 상세 → 메모로 저장). TODAY에서 여는 경로는
      //   대시보드가 문서라 애초에 잠금이 없어서 되돌릴 것도 없다.
      const goingFullPage = fullPageEditorRef.current;
      if (goingFullPage) {
        body.style.top = "0px";
        void body.offsetHeight;   // 강제 리플로우 — 이 줄이 없으면 아래 복원이 같은 tick에 덮어써 무효가 된다
      }
      if (saved === null) body.removeAttribute("style");
      else body.setAttribute("style", saved);
      // 🔴🔴 전체화면 편집 페이지로 넘어가는 중이면 **대시보드 스크롤을 복원하면 안 된다.**
      //
      // 이 cleanup은 두 경우에 돈다: ① 다이얼로그가 그냥 닫혔다(→ 복원이 맞다)
      // ② 편집 페이지가 문서를 넘겨받는다(→ 복원하면 안 된다). ②에서 `scrollTo(0, 대시보드 y)`를
      // 부르면 그 값이 편집 페이지의 max로 clamp되고(실측 900 → 90), 뒤이어 도는
      // `scrollTo(0, 0)`과 **경합**한다. 편집 페이지는 마운트되면서 문서 높이가 여러 번 바뀌는데,
      // 브라우저의 스크롤 앵커링이 그 사이에 스크롤을 되잡아서 0이 아닌 곳에 멈춘다
      // (실측 375×684, 문서 774: 어떤 판은 0, 어떤 판은 **26**에서 멈췄다 →
      //  close-btn top -4 / dialog-head top -6 = "들어가자마자 상단이 잘려 보인다").
      //
      // 💀 예전 처방은 "그 다음에 scrollTo(0,0)을 한 번 더 부른다"였다(지뢰 #3). 그건 **순서 경쟁**이라
      // 레이아웃이 늦게 정리되는 실기기에서 진다. 애초에 굴리지 않는 것이 근본 수정이다.
      // 로컬에서 3주 동안 안 보였던 이유: 빈 메모는 문서 높이 == 뷰포트라 maxScroll이 0이었다.
      // 실기기는 `min-height:100lvh`(주소창 없는 높이)라 항상 여유가 있다 — 그래서 거기서만 났다.
      //
      // ref로 읽는 이유: cleanup은 **이전 렌더의 클로저**라 monthlyComposePage/bigEditorPage를
      // 직접 보면 전환 전 값(false)이 잡힌다. 지금 화면 상태를 봐야 한다.
      // 전체화면으로 갈 때도 **0을 명시적으로 한 번 더** 박는다. 위 top=0으로 되돌림 대상은
      // 없앴지만, 잠금 해제 직후 문서 높이가 다시 잡히는 구간이 남아 있어 여기서 확정한다.
      if (goingFullPage) window.scrollTo(0, 0);
      else window.scrollTo(0, y);
    };
  }, [activeDialogKey, monthlyComposePage, bigEditorPage]);
  // 🔴🔴 "메모로 저장"을 일반 페이지로 열 때는 **호스트 다이얼로그를 닫아야 한다.**
  // 그 다이얼로그(뉴스·채용·AI트렌드 등)는 모달이라 top layer에 있고, 열려 있는 한 우리 페이지를
  // 그대로 덮어버린다. 닫고 나가면서 **어디서 왔는지 기억했다가 되돌려 놓는다** — 안 그러면
  // 기사 읽다가 메모에 붙여넣고 나왔을 때 대시보드로 튕긴다.
  // 그리고 잠금 cleanup의 `scrollTo(0, 대시보드 y)`가 이 페이지를 엉뚱한 데로 굴리므로
  // 맨 위로 되돌린다(지뢰 #3 — mobileEditActive·monthlyComposePage와 같은 처방).
  const bigEditorHostKeyRef = useRef<keyof typeof dialogs | null>(null);
  useEffect(() => {
    if (!bigEditorPage) return;
    const host = activeDialogKey;
    if (host) { bigEditorHostKeyRef.current = host; close(dialogs[host]); }
    window.scrollTo(0, 0);
    return () => {
      const back = bigEditorHostKeyRef.current;
      bigEditorHostKeyRef.current = null;
      if (back) open(dialogs[back]);
    };
    // activeDialogKey를 의존성에 넣으면 호스트를 닫는 순간(null이 됨) cleanup이 돌아 즉시
    // 되돌아간다. 진입 시점의 값만 필요하므로 bigEditorPage 하나만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bigEditorPage]);
  // 🔴🔴 먼슬리 Create를 top layer에서 내리고 되올린다.
  //
  // 모달 <dialog>는 스펙상 containing block이 뷰포트라 **문서와 함께 스크롤될 수 없다.**
  // 그래서 일반 페이지로 만들려면 모달을 풀어야 하고, 그 방법은 close() 후 show()뿐이다.
  // (엘리먼트를 <div>로 바꾸지 않는 이유는 위 monthlyComposePage 주석 참고 — CSS 64개가 깨진다.)
  //
  // close()가 쏘는 close 이벤트는 위 onAnyDialogClose가 `el.open`으로 걸러낸다.
  // 그리고 잠금 cleanup의 `scrollTo(0, 대시보드 y)`가 이 페이지를 엉뚱한 데로 굴리므로
  // 맨 위로 되돌린다 — mobileEditActive가 같은 이유로 하는 것과 정확히 같은 처방이다(지뢰 #3).
  // 🔴🔴 모바일 Create는 **일반메모 편집과 완전히 같은 노드**(composePageNode)로 뜬다.
  // 그래서 이 다이얼로그는 열어둘 이유가 없다 — 닫고, 나갈 때 되돌린다.
  // (예전에는 `close(); show()`로 모달만 풀어 <dialog>를 그대로 페이지처럼 썼는데, 그 <dialog>가
  //  붙이고 다니는 것들 때문에 Create만 계속 깨졌다: show()의 focusing steps가 툴바 버튼을 잡아
  //  다크 포커스 링을 그리고, .glass-dialog의 backdrop-filter가 fixed 자손의 컨테이닝 블록을 만들어
  //  ⋮ 시트를 화면 밖으로 보내고, .dialog-head가 sticky top:-18로 잘린 채 붙어 있었다.
  //  껍데기를 안 쓰면 그 셋이 전부 **발생할 자리 자체가 없어진다.**)
  // ★ "메모로 저장"(bigEditorPage)이 쓰는 것과 정확히 같은 처방이다 — 새 메커니즘이 아니다.
  useEffect(() => {
    const d = memoRef.current;
    if (!d || !monthlyComposePage) return;
    const wasOpen = d.open;
    if (wasOpen) close(dialogs.memo);
    return () => {
      // 되돌아갈 때 달력·목록 화면을 다시 연다. 이미 열려 있으면(다른 경로로 복귀) 건드리지 않는다.
      if (wasOpen && !memoRef.current?.open) open(dialogs.memo);
    };
  }, [monthlyComposePage]);
  // 비회원은 메인 구조만 보고, 잠긴 기능을 클릭하면 Auth 화면으로 보낸다(1차 방어).
  // Server Action의 requireUser(2차)와 Supabase RLS(3차)가 뒤를 받친다.
  function guardLogin(): boolean {
    if (isLoggedIn) return true;
    // 비회원 진입점은 Login 화면으로 보낸다 — 이미 계정이 있는 사용자가 대다수라 Sign up부터
    // 보여주면 매번 탭을 되돌려야 한다. 회원가입은 Auth 화면 상단 탭에서 바로 넘어갈 수 있다.
    askConfirm("로그인이 필요한 서비스입니다.", () => router.push("/login"), "Sign up", true);
    return false;
  }
  // 8장 — 팝업 바깥(backdrop) 클릭 시 닫기
  function onDialogBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    // Key Notes의 고정 메모 전체보기 중에는 바깥 클릭도 모달을 통째로 닫지 않고 한 단계만 되돌아간다.
    if (e.currentTarget === keynotesRef.current && pinnedFullView) { setPinnedFullView(false); return; }
    // bodyEditor는 draft를 formBody/projContent로 되돌리고 이전 activeDialogKey(뉴스·채용·AI트렌드
    // 등)를 복원해야 하므로, 바깥 클릭도 그 로직을 갖춘 closeBodyEditor를 그대로 태운다.
    if (e.currentTarget === bodyEditorRef.current) { closeBodyEditor(); return; }
    // Monthly MEMO는 여기서 close()만 하면 작성 중이던 내용이 그대로 사라졌다 — +Create는
    // editingMemoId가 없어서 자동저장 대상이 아니라, 바깥을 터치하는 순간 draft가 통째로 유실됐다.
    // 뒤로가기 버튼과 같은 경로(날짜 검증 + draft 저장)를 태워서 같은 결과가 되게 한다.
    if (e.currentTarget === memoRef.current && memoFormOpen) { void handleMemoDialogBack(); return; }
    e.currentTarget.close();
    const key = Object.entries(dialogs).find(([, ref]) => ref.current === e.currentTarget)?.[0] as keyof typeof dialogs | undefined;
    if (key) setActiveDialogKey((cur) => (cur === key ? null : cur));
  }

  // MindSet — 계정(profiles.mindset)에 저장. 입력이 멈추고 800ms 뒤 조용히 저장한다(메모 자동저장과 같은 패턴).
  const [mindset, setMindset] = useState(initialMindset);
  // 🔴 "칸에 들어가는 만큼만" — 마지막으로 **칸 안에 들어갔던** 값. 넘치면 여기로 되돌린다.
  // 글자 수 상한(maxLength)으로는 못 한다: 같은 2줄 칸에 한글은 22자, 영문은 43자가 들어간다(실측
  // 162×44px). 한 숫자를 고르면 한글은 넘치거나 영문은 칸을 절반만 쓴다 — 박스를 직접 재는 게 정확하다.
  const mindsetFitRef = useRef(initialMindset);
  const [mindsetSaved, setMindsetSaved] = useState(false);
  const mindsetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onMindsetChange(value: string) {
    setMindset(value);
    if (mindsetTimer.current) clearTimeout(mindsetTimer.current);
    mindsetTimer.current = setTimeout(async () => {
      await updateMindset(value);
      setMindsetSaved(true);
      setTimeout(() => setMindsetSaved(false), 1200);
    }, 800);
  }
  // 칸을 넘치는 입력을 거부한다. 데스크톱은 한 줄(가로 넘침), 모바일은 두 줄(세로 넘침)이라
  // 재는 축만 다르고 규칙은 같다 — "지금 이 칸에 보이는 만큼"이 상한이다.
  //
  // ⚠️ 두 가지를 반드시 지킨다.
  // ① **조합 중(한글 IME)에는 되돌리지 않는다.** 조합 버퍼를 건드리면 글자가 깨진다.
  //    조합이 끝나면 onCompositionEnd가 같은 검사를 다시 돌려 그때 걷는다.
  // ② **길어지는 입력만 막는다.** 무조건 막으면, 이미 저장돼 있던 긴 값(상한이 없던 시절의 값)이
  //    들어왔을 때 지우는 것조차 "넘침"으로 거부되어 칸이 통째로 잠긴다.
  function fitMindsetToBox(el: HTMLInputElement | HTMLTextAreaElement, composing: boolean) {
    const over = el instanceof HTMLTextAreaElement ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
    const prev = mindsetFitRef.current;
    if (over && !composing && el.value.length > prev.length) {
      el.value = prev;          // 제어 컴포넌트라 state가 그대로면 리렌더가 없다 — DOM도 직접 되돌린다
      onMindsetChange(prev);
      return;
    }
    mindsetFitRef.current = el.value;
    onMindsetChange(el.value);
  }
  async function saveMindsetNow(value: string) {
    if (mindsetTimer.current) clearTimeout(mindsetTimer.current);
    await updateMindset(value);
    setMindsetSaved(true);
    setTimeout(() => setMindsetSaved(false), 1200);
  }

  // 월간 달력 (기획안 6.4·6.7절)
  const [viewYear, setViewYear] = useState(today.year);
  const [viewMonth0, setViewMonth0] = useState(today.month0);
  const [viewMemos, setViewMemos] = useState<Memo[]>(memosForMonth ?? []);
  // 대시보드 미니 패널(TODAY/주간 미리보기)이 참조하는 이번 달 메모 — router.refresh()의 서버 왕복을 기다리지
  // 않고 메모 생성/수정/삭제 직후 바로 반영되도록 로컬 상태로 미러링한다 (importantMemosState와 같은 패턴)
  const [memosForMonthState, setMemosForMonthState] = useState<Memo[] | null>(memosForMonth ?? null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMemosForMonthState(memosForMonth ?? null), [memosForMonth]);
  const [viewLoading, setViewLoading] = useState(false);
  const firstWeekday = new Date(viewYear, viewMonth0, 1).getDay();
  const lastDate = new Date(viewYear, viewMonth0 + 1, 0).getDate();
  const [memoDialogDay, setMemoDialogDay] = useState(today.day);
  const memoDialogDateIso = isoDate(viewYear, viewMonth0, memoDialogDay);

  const navigatingRef = useRef(false);
  async function goToMonth(delta: number) {
    if (navigatingRef.current) return; // setViewLoading은 비동기라 같은 틱의 중복 클릭엔 못 미친다
    navigatingRef.current = true;
    let y = viewYear, m = viewMonth0 + delta;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewLoading(true);
    try {
      const memos = await getMemosForMonthAction(y, m);
      setViewYear(y);
      setViewMonth0(m);
      setViewMemos(memos);
      setMemoDialogDay(1);
    } finally {
      setViewLoading(false);
      navigatingRef.current = false;
    }
  }
  function goToToday() {
    setViewYear(today.year);
    setViewMonth0(today.month0);
    setViewMemos(memosForMonthState ?? []);
    setMemoDialogDay(today.day);
  }

  const dayMemos = useMemo(
    () => viewMemos.filter((m) => m.start_date <= memoDialogDateIso && m.end_date >= memoDialogDateIso),
    [viewMemos, memoDialogDateIso]
  );

  // Monthly MEMO 폼 — editingMemoId가 null이면 새 메모 생성
  // (memoFormOpen 자체는 위 1700절로 올라갔다 — 배경 스크롤 잠금 effect가 그걸 봐야 해서다.)
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<MemoType>("free_note");
  const [formStatus, setFormStatus] = useState<TodoStatus>("planned");
  const [formStartDate, setFormStartDate] = useState(memoDialogDateIso);
  const [formEndDate, setFormEndDate] = useState(memoDialogDateIso);
  const [formImportant, setFormImportant] = useState(false);
  const [formPinned, setFormPinned] = useState(false);
  const [formColor, setFormColor] = useState<MemoColor>("yellow");
  const [formBody, setFormBodyState] = useState("");
  // 본문 최신값은 항상 이 ref에 동기적으로 들어간다. 리치 에디터(Tiptap)는 키 입력마다 onChange를
  // 주는데, 그때마다 setState로 Dashboard(이 컴포넌트 하나가 화면 전체를 그린다)를 리렌더하면
  // 타이핑이 눈에 띄게 밀렸다 — "입력 버퍼링"의 실제 원인이다(자동저장 문구가 아니다).
  // 그래서 타이핑 중에는 ref만 갱신하고 state는 입력이 멈춘 뒤에 한 번 따라가게 한다.
  // 저장·자동저장·나가기 판정은 전부 readFormBody()로 ref를 읽으므로 state가 늦어도 유실이 없다.
  const formBodyRef = useRef("");
  const formBodyFlushRef = useRef<number | null>(null);
  // content_format은 "이 본문이 실제로 무엇인가"를 나타내야 한다. 예전엔 UI 토글(formContentMode)만
  // 보고 quick이면 무조건 "plain"으로 저장했는데, 간단 메모도 같은 MemoRichEditor를 쓰고 모바일
  // 서식툴바는 hideToolbar와 무관하게 항상 뜬다 — 즉 quick 모드에서도 링크·굵게를 넣을 수 있다.
  // 그러면 저장된 본문은 리치 HTML인데 포맷은 plain이라, 다시 열 때 htmlToPlainText로 납작해져
  // 넣은 링크가 통째로 사라졌다(실측: htmlToPlainText가 <a>를 지우고 텍스트만 남긴다).
  // 내용에 실제 서식이 있으면 모드와 무관하게 rich_html로 저장한다.
  function contentFormatFor(body: string): ContentFormat {
    return formContentMode === "document" || hasRichFormatting(body) ? "rich_html" : "plain";
  }
  function readFormBody() {
    return formBodyRef.current;
  }
  function cancelFormBodyFlush() {
    if (formBodyFlushRef.current !== null) {
      window.clearTimeout(formBodyFlushRef.current);
      formBodyFlushRef.current = null;
    }
  }
  // 자동저장 축소 가드의 기준값 — "이 편집 세션이 시작될 때 본문이 얼마였나". `setFormBody`는
  // 새 세션 초기화·모드 전환처럼 **의도적으로 본문을 통째로 갈아끼우는** 자리에서만 불리므로
  // 여기가 기준을 세울 유일한 지점이다(타이핑 경로 setFormBodyWhileTyping은 기준을 만지지 않는다).
  const memoBodyBaselineRef = useRef("");
  // 이 비율보다 더 줄면 자동저장을 멈춘다. 사람이 지운 것이라면 저장 버튼/‹로 명시적으로 저장된다.
  // 짧은 메모는 한두 문장만 지워도 비율이 크게 떨어지므로 최소 길이를 같이 둔다.
  const AUTOSAVE_SHRINK_RATIO = 0.5;
  const AUTOSAVE_SHRINK_MIN_CHARS = 200;
  // 즉시 반영이 필요한 경로(새 세션 초기화, 모드 전환, 삽입 등)
  function setFormBody(html: string) {
    formBodyRef.current = html;
    memoBodyBaselineRef.current = html;
    cancelFormBodyFlush();
    setFormBodyState(html);
  }
  // 리치 에디터 타이핑 경로 — ref는 즉시, state는 입력이 멈춘 뒤에만
  function setFormBodyWhileTyping(html: string) {
    formBodyRef.current = html;
    cancelFormBodyFlush();
    formBodyFlushRef.current = window.setTimeout(() => {
      formBodyFlushRef.current = null;
      setFormBodyState(formBodyRef.current);
    }, 300);
  }
  // 간단 메모(quick, plain textarea) / 상세 메모(document, Tiptap) — formBody는 항상 현재 모드가 만드는
  // 형식(plain 또는 rich HTML) 그대로를 담는다. 전환 시점에만 명시적으로 변환한다 (36~37절)
  const [formContentMode, setFormContentMode] = useState<ContentMode>("quick");
  const [formEmoji, setFormEmoji] = useState<string | null>(null);
  // 편집 대상이 바뀔 때마다 올려서 MemoRichEditor를 key로 강제 재마운트 — Tiptap은 textarea처럼
  // value prop만으로 내용이 갱신되지 않아서, 새 세션을 시작할 때마다 새로 초기화한다.
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [bodyEditorSessionKey, setBodyEditorSessionKey] = useState(0);
  const [savingMemo, setSavingMemo] = useState(false);
  const [mobileMemoMenuOpen, setMobileMemoMenuOpen] = useState(false);
  const [mobileProjectMenuOpen, setMobileProjectMenuOpen] = useState(false);
  const [memoDateError, setMemoDateError] = useState<string | null>(null);
  const [mobileProjectSummaryOpen, setMobileProjectSummaryOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [memoSearch, setMemoSearch] = useState("");
  const isSearchingOrFiltering = memoSearch.trim().length > 0 || typeFilter !== "all";

  // 하단 목록 날짜 범위 필터 — 선택일/이번 달/기간/전체 기간. 메모 유형 필터와 독립적으로 조합된다.
  // 기본값은 "선택일" — 달력에서 날짜를 고른 뒤 그 날의 메모를 바로 보는 게 실제 사용 흐름이다.
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("selected-day");
  const [customRangeStart, setCustomRangeStart] = useState<string | null>(null);
  const [customRangeEnd, setCustomRangeEnd] = useState<string | null>(null);
  // "기간"/"전체 기간"은 현재 불러온 달(viewMemos) 밖의 데이터가 필요해 별도로 조회한다.
  const [rangeMemos, setRangeMemos] = useState<Memo[]>([]);
  useEffect(() => {
    // 취소 가드가 없으면 "기간"에서 시작일을 고른 뒤 종료일을 고칠 때 두 요청이 겹치고
    // **늦게 도착한 쪽이 이긴다** — 화면에 방금 지운 범위의 메모가 남았다.
    let cancelled = false;
    const load = (from: string | null, to: string | null) =>
      getMemosForRangeAction(from, to)
        .then((rows) => { if (!cancelled) setRangeMemos(rows); })
        .catch(() => { if (!cancelled) setRangeMemos([]); });

    if (dateRangeMode === "all") load(null, null);
    else if (dateRangeMode === "custom" && customRangeStart && customRangeEnd) load(customRangeStart, customRangeEnd);
    return () => { cancelled = true; };
  }, [dateRangeMode, customRangeStart, customRangeEnd]);

  // "기간"인데 양쪽 날짜가 덜 찬 구간은 여기서 파생값으로 비운다 — 이펙트에서 setRangeMemos([])를
  // 부르면 렌더가 한 번 더 돌기만 하고 결과는 같다. 예전엔 이 구간을 아무도 처리하지 않아
  // rangeMemos가 **이전 범위 결과를 그대로 들고 있었고**, 아래 목록이 그걸 새 필터의 결과인 것처럼 그렸다.
  const customRangeIncomplete = dateRangeMode === "custom" && (!customRangeStart || !customRangeEnd);
  const memoListScope =
    dateRangeMode === "selected-day" ? dayMemos
    : dateRangeMode === "month" ? viewMemos
    : customRangeIncomplete ? EMPTY_MEMOS
    : rangeMemos;

  const filteredMemos = memoListScope.filter((m) => {
    const q = memoSearch.trim().toLowerCase();
    const bodyText = m.content_format === "rich_html" ? htmlToPlainText(m.content ?? "") : (m.content ?? "");
    if (q && !m.title.toLowerCase().includes(q) && !bodyText.toLowerCase().includes(q)) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "unfinished") return m.memo_type === "todo" && m.status !== "completed";
    return m.memo_type === typeFilter;
  });

  const memoFormRef = useRef<HTMLDivElement>(null);
  const compactEditorRef = useRef<MemoRichEditorHandle>(null);
  const detailEditorRef = useRef<MemoRichEditorHandle>(null);
  const projectEditorRef = useRef<MemoRichEditorHandle>(null);
  // ⋮ 더보기 sheet — sheet 자체(.mobile-options-sheet)나 그 트리거(.mobile-more-btn) 밖을 누르면 닫는다.
  useEffect(() => {
    if (!mobileMemoMenuOpen && !mobileProjectMenuOpen) return;
    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // 미니 달력 팝업은 .mobile-options-backdrop으로 portal돼 sheet '바깥'에 붙는다 —
      // 여기서 걸러주지 않으면 날짜를 누르는 pointerdown이 바깥 클릭으로 오인돼 시트가 먼저 닫히고,
      // click이 도달하지 못해 날짜가 아예 안 바뀐다.
      if (target.closest(".mobile-options-sheet") || target.closest(".mobile-more-btn") || target.closest(".mini-date-popup")) return;
      setMobileMemoMenuOpen(false);
      setMobileProjectMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [mobileMemoMenuOpen, mobileProjectMenuOpen]);
  // 프로젝트 편집 화면의 "한 줄 요약⌄" 토글이 여는 팝업 — 팝업/토글 밖을 누르면 닫는다.
  useEffect(() => {
    if (!mobileProjectSummaryOpen) return;
    function closeSummaryOnOutsidePress(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".mobile-project-summary-popover") || target.closest(".mobile-project-summary-toggle")) return;
      setMobileProjectSummaryOpen(false);
    }
    document.addEventListener("pointerdown", closeSummaryOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeSummaryOnOutsidePress, true);
  }, [mobileProjectSummaryOpen]);
  function renderMobileMemoOptionsSheet() {
    return mobileMemoMenuOpen && (
      <div
        className="mobile-options-backdrop mobile-memo-options-backdrop"
        onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileMemoMenuOpen(false); }}
        onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileMemoMenuOpen(false); }}
      >
        <section className="mobile-options-sheet mobile-memo-options-sheet" aria-label="메모 설정" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-options-handle" />
          <div className="mobile-options-title">메모 설정</div>
          <div className="mobile-options-date-row">
            <label className="mobile-options-field"><span>시작일</span><MiniDatePicker value={formStartDate} onChange={setFormStartDate} portal todayIso={todayIso} /></label>
            <label className="mobile-options-field"><span>종료일</span><MiniDatePicker value={formEndDate} onChange={setFormEndDate} portal todayIso={todayIso} /></label>
          </div>
          {memoDateError && <div className="memo-date-error" role="alert">{memoDateError}</div>}
          {formType === "todo" && (
            <div className="mobile-options-field">
              <span>진행 상태</span>
              <div className="status-select-group">
                {STATUS_OPTIONS.map(([value, label, color, bg]) => (
                  <button key={`sheet-${value}`} type="button" className={`status-option ${formStatus === value ? "active" : ""}`} style={formStatus === value ? { background: bg, color } : undefined} onClick={() => setFormStatus(value)}>
                    <span className="dot" style={{ background: color }} />{label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mobile-options-actions">
            {editingMemoId && <button type="button" className="mobile-options-delete" onClick={() => { setMobileMemoMenuOpen(false); handleDeleteMemo(editingMemoId); }}>메모 삭제</button>}
            <button type="button" className="mobile-options-done" onClick={() => setMobileMemoMenuOpen(false)}>완료</button>
          </div>
        </section>
      </div>
    );
  }
  function renderMobileProjectOptionsSheet() {
    return mobileProjectMenuOpen && (
      <div
        className="mobile-options-backdrop"
        onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileProjectMenuOpen(false); }}
        onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setMobileProjectMenuOpen(false); }}
      >
        <section className="mobile-options-sheet mobile-project-options-sheet" aria-label="프로젝트 설정" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-options-handle" />
          {editingProjectId && <button type="button" className="mobile-options-delete" onClick={() => { setMobileProjectMenuOpen(false); handleDeleteProject(); }}>삭제하기</button>}
        </section>
      </div>
    );
  }
  function scrollToMemoForm() {
    requestAnimationFrame(() => memoFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function openCreateMemoForm() {
    setEditingMemoId(null);
    setFormTitle("");
    setFormType("free_note");
    setFormStatus("planned");
    setFormStartDate(memoDialogDateIso);
    setFormEndDate(memoDialogDateIso);
    setFormImportant(false);
    setFormPinned(false);
    setFormColor(defaultMemoColor(theme));
    setFormBody("");
    setFormContentMode("document"); // Monthly MEMO + Create = 상세 메모 생성으로 단일화 (간단 메모는 포스트잇 전용)
    setFormEmoji(null);
    setFormSessionKey((k) => k + 1);
    setMemoFormOpen(true);
    scrollToMemoForm();
  }
  // 포스트잇을 누르면 우선 읽기 전용 보기가 뜬다. "전체 보기"는 같은 오버레이 안에서 더 큰 레이아웃으로,
  // "수정"은 postitEditMode로 같은 오버레이 안에서 편집 폼으로 전환한다 — 별도 dialog를 열고 닫지 않는다(17절)
  const [postitViewMemo, setPostitViewMemo] = useState<Memo | null>(null);
  const [postitExpanded, setPostitExpanded] = useState(false);
  // null = 읽기 전용 보기, "quick" = 포스트잇 수정(Quick Edit), "detail" = 전체 보기 안에서의 상세 수정(Detail Edit)
  const [postitEditMode, setPostitEditMode] = useState<"quick" | "detail" | null>(null);
  // 맨 위로 이동 — Quick Edit은 대상에서 제외(P0), 전체보기(읽기)/Detail Edit이 같은 postit 안에서
  // 조건부로 번갈아 렌더링되므로 ref 하나를 공유해도 안전하다(항상 둘 중 하나만 마운트된다).
  // JSX에서 훅이 돌려준 객체를 그대로 .ref처럼 체이닝하면 React Compiler ESLint가 "render 중 ref 접근"으로
  // 오탐하므로, 호출 직후 평범한 변수로 풀어서 쓴다.
  const {
    ref: postitScrollRef, btnRef: postitScrollBtnRef,
    onScroll: onPostitScroll, scrollToTop: scrollPostitToTop, resetScroll: resetPostitScroll,
  } = useScrollTopButton();
  const {
    ref: projectDetailScrollRef, btnRef: projectDetailScrollBtnRef,
    onScroll: onProjectDetailScroll, scrollToTop: scrollProjectDetailToTop, resetScroll: resetProjectDetailScroll,
  } = useScrollTopButton();
  const {
    ref: bodyEditorScrollRef, btnRef: bodyEditorScrollBtnRef,
    onScroll: onBodyEditorScroll, scrollToTop: scrollBodyEditorToTop, resetScroll: resetBodyEditorScroll,
  } = useScrollTopButton();
  function openPostitView(m: Memo) {
    setPostitExpanded(false);
    setPostitViewMemo(m);
    resetPostitScroll();
    // 모바일은 프로젝트와 마찬가지로 읽기 전용 보기를 거치지 않고 바로 편집으로 들어간다 —
    // 그래야 헤더가 ↶/↷/★/⋮ 한 벌로 통일되고, 수정·삭제 버튼을 따로 둘 필요가 없다(삭제는 ⋮ 안).
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    // 모바일은 읽기 전용 보기를 거치지 않고 바로 편집으로 — 다이얼로그를 닫고 일반 페이지로 여는
    // 처리는 openDetailEditInPlace 안에 있다(호출자가 둘이라 거기 한 곳에 둬야 한다).
    if (isMobile) openDetailEditInPlace(m);
    else setPostitEditMode(null);
  }
  // 🔴🔴 **대시보드(TODAY / 다음 메모)에서 메모를 여는 전용 경로.** 다른 두 경로(먼슬리 목록·
  // Key Notes)는 이미 열린 다이얼로그 안에서 부르므로 껍데기를 새로 열 필요가 없다 —
  // `openPostitView`를 그냥 부른다. 여기만 껍데기가 필요해서 호출부 둘이 직접
  // `open(dialogs.postitOnly); openPostitView(m);`을 하고 있었고, **그게 모바일 버그였다.**
  //
  // 증상: "TODAY 하단에서 메모를 열면 뒤로가기 줄이 안 보인다"(2026-08-30). 메모를 여는 네 경로
  // 중 **이 둘에서만** 났고, 그게 유일한 구조 차이였다.
  // 기전: 모바일에서는 `openDetailEditInPlace`가 그 껍데기를 **곧바로 닫는다**(일반 페이지로 가므로).
  //       즉 모바일의 `open(dialogs.postitOnly)`는 하자마자 취소되는 일인데, `open()`이 그 전에
  //       `window.scrollTo(0, 대시보드 y)`를 부른다(showModal이 배경을 굴리는 걸 되돌리는 보정).
  //       그 값이 곧 만들어질 편집 페이지의 max로 **clamp**되어 상단이 잘린 채로 열린다
  //       (Dashboard 1846절이 같은 증상을 26px로 실측해뒀다 — 거기 처방이 "애초에 굴리지 않는다"다).
  //       짧은 메모일수록 max가 작아 "상단만 조금" 잘린다.
  // 👉 모바일에서는 **껍데기를 아예 열지 않는다.** `mobileEditActive`는 postitOnly가 열렸는지와
  //    무관하다(3923절: isMobileView && postitEditMode==="detail" && postitViewMemo).
  function openPostitFromDashboard(m: Memo) {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    if (!isMobile) open(dialogs.postitOnly);
    openPostitView(m);
  }
  // "전체 보기"로 넘어가며 닫아버린 host dialog(Monthly MEMO/Key Notes)를 기억해뒀다가, 전체 보기를
  // 닫을 때 그 자리로 되돌아가기 위한 참조 — expandPostitView에서 채우고 closePostitView에서 소비한다
  const postitHostKeyRef = useRef<"memo" | "keynotes" | null>(null);
  // 🔴 TODAY 경로 진입 잠금(아래 openDetailEditInPlace / 해제 effect). saved는 복원할 body style.
  const entryLockRef = useRef<{ saved: string | null } | null>(null);
  // "전체 보기" — 열려있는 host dialog(Monthly MEMO/Key Notes, 최대 1040px)에 갇혀 있으면
  // 모달 top layer가 그 자체로 컨테이닝 블록이 되어 .big-postit.expanded(최대 1400px)가
  // 커지지 못하고 host 크기로 눌려 보인다. 전용 postitOnly 다이얼로그(뷰포트 전체 크기)로
  // 옮겨서 연다 — open()이 postitViewMemo를 초기화하므로 반드시 그 다음에 다시 채운다.
  function expandPostitView() {
    if (!postitViewMemo) return;
    const memo = postitViewMemo;
    if (activeDialogKey === "memo") { postitHostKeyRef.current = "memo"; close(dialogs.memo); }
    else if (activeDialogKey === "keynotes") { postitHostKeyRef.current = "keynotes"; close(dialogs.keynotes); }
    else postitHostKeyRef.current = null;
    open(dialogs.postitOnly);
    setPostitViewMemo(memo);
    setPostitEditMode(null);
    setPostitExpanded(true);
  }
  // postitOnly 다이얼로그를 통해 열렸을 때만 실제로 닫는다 — 이미 닫혀있는 dialog에 close()는 안전한 no-op이라
  // Key Notes·Monthly MEMO 안에 중첩된 경우(그 다이얼로그는 계속 열려있어야 함)에도 그냥 같이 호출해도 된다.
  // 전체 보기로 넘어오며 host dialog를 닫았던 경우엔 그 dialog를 다시 열어 돌아간다.
  // 모바일 포스트잇은 저장 버튼 없이 ‹ 하나로 나간다. scheduleAutosave는 제목·본문만 담으므로
  // 색상/타입/시작·종료일/상태/중요까지 확실히 남기려면 나가기 직전에 전체 저장을 한 번 돌려야 한다
  // (프로젝트의 handleProjectDetailBack과 같은 이유).
  // 🔴 창을 **먼저** 닫고 저장은 뒤에서 보낸다. 예전엔 `await updateMemo` + `await
  // refreshAfterMemoChange`(그 안에서 또 1~2왕복)를 전부 기다린 다음에야 닫아서, 모바일/PWA에서
  // ‹를 누르면 서버 왕복 2~3번 동안 화면이 그대로 멈춰 있었다 — 사용자가 신고한 "메모 뒤로가기 렉".
  // CLAUDE.md 지뢰표 "UI를 닫는 setState를 서버 왕복 뒤에 두지 마라"가 정확히 이 얘기다.
  // 닫은 뒤에는 폼 state가 초기화되므로 보낼 값은 **닫기 전에 스냅샷**으로 떠 둔다.
  // 목록은 patchLocalMemo가 즉시 갱신하고, 서버 응답이 오면 refreshAfterMemoChange가 다시 맞춘다.
  async function handlePostitBack() {
    if (postitEditMode && editingMemoId && !savingMemo) {
      if (!validateMemoDates()) { setMobileMemoMenuOpen(true); return; }
      if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
      const id = editingMemoId;
      const body = readFormBody();
      const input = {
        title: formTitle,
        content: body,
        content_format: contentFormatFor(body),
        content_mode: formContentMode,
        emoji: formEmoji,
        memo_type: formType,
        status: formType === "todo" ? formStatus : null,
        start_date: formStartDate,
        end_date: formEndDate,
        color: formColor,
        is_important: formImportant,
      };
      patchLocalMemo(id, input as Partial<Memo>);
      closePostitView();
      const result = await updateMemo(id, input);
      if (result && "error" in result) { alert(result.error); return; }
      await refreshAfterMemoChange();
      return;
    }
    closePostitView();
  }
  function closePostitView() {
    setPostitViewMemo(null);
    setPostitExpanded(false);
    setPostitEditMode(null);
    close(dialogs.postitOnly);
    if (postitHostKeyRef.current) {
      open(dialogs[postitHostKeyRef.current]);
      postitHostKeyRef.current = null;
    }
  }
  // Quick Edit/Detail Edit/bigEditorNode(뉴스·채용공고 등)이 모두 공유하는 폼 상태 채우기.
  // target 모드가 "quick"인데 원본이 document(rich_html)면 서식을 제거한 plain text로 내려서 보여준다.
  function loadMemoIntoForm(m: Memo, mode: ContentMode) {
    setPendingInsert(null);
    setEditingMemoId(m.id);
    setFormTitle(m.is_auto_title ? "" : m.title);
    setFormType(m.memo_type);
    setFormStatus(m.status ?? "planned");
    setFormStartDate(m.start_date);
    setFormEndDate(m.end_date);
    setFormImportant(m.is_important);
    setFormPinned(m.is_pinned);
    setFormColor(m.color);
    setFormContentMode(mode);
    setFormBody(
      mode === "document"
        ? toEditableHtml(m.content, m.content_format)
        : (m.content_format === "rich_html" ? htmlToPlainText(m.content ?? "") : (m.content ?? ""))
    );
    setFormEmoji(m.emoji);
    setFormSessionKey((k) => k + 1);
  }
  // (bigEditorOpen은 위 1700절로 올라갔다 — 배경 스크롤 잠금 effect가 봐야 한다.)
  // Detail Edit — 항상 상세(rich) 모드로 연다. 뉴스/채용공고 등 다른 화면에서는 별도 오버레이(bigEditorNode)로 열리고,
  // 포스트잇 전체 보기에서는 openDetailEditInPlace로 같은 오버레이 안에서 연다.
  function openBigEditor(m: Memo) {
    loadMemoIntoForm(m, "document");
    setBigEditorOpen(true);
  }
  function closeBigEditor() {
    setBigEditorOpen(false);
    setPendingInsert(null);
    close(dialogs.postitOnly); // Key Notes/Monthly MEMO 안에 중첩된 경우엔 이미 닫혀있어 안전한 no-op
  }
  // 포스트잇 "수정" — 상세 서식이 있는 메모는 Detail Edit로 열어 서식을 보존한다. 그 외에는 Quick Edit.
  function openQuickEdit(m: Memo) {
    // content_mode까지 같이 보던 조건에서 내용만 보도록 좁혔다 — quick으로 저장됐지만 실제로는
    // 서식이 들어 있는 메모가 quick으로 열리면 htmlToPlainText로 납작해져 링크가 사라진다.
    if (hasRichFormatting(toEditableHtml(m.content, m.content_format))) {
      openDetailEditInPlace(m);
    } else {
      loadMemoIntoForm(m, "quick");
      setPostitEditMode("quick");
    }
  }
  // 전체 보기(Detail View) 안에서 "수정" — 같은 오버레이를 유지한 채 내부 상태만 Detail Edit로 전환한다(8·17절)
  // 🔴🔴 모바일 편집은 **다이얼로그가 아니라 일반 페이지로** 연다(2026-08-28).
  //
  // 3주간 못 고친 "키보드 위에서 글이 짤린다 / 죽은 여백"의 원인은 값이 아니라 **구조**였다.
  // iOS에서 개별적으로 다 위험하다고 문서화된 것 넷이 이 화면에 동시에 있었다:
  //   ① 전체화면 position:fixed 껍데기 ② body{position:fixed} 배경 스크롤 잠금
  //   ③ 내부 단일 스크롤러       ④ sticky 툴바
  // 일반 웹페이지의 textarea에는 이 버그가 **없다** — 문서가 스크롤러라서 iOS가 캐럿을 보이려
  // 문서를 스크롤하는 것이 정상 동작이고(되돌릴 수도 있다), 어긋날 fixed 요소가 없다.
  // 참고 구현(vaul, hydrogen-web)도 전부 넷 중 하나 이상을 피한다 — 그래서 넷을 함께 쓰는
  // 예제 코드가 어디에도 없었다. 조사 기록: docs/incidents.md 11-11 ~ 11-13절.
  //
  // ★ 이 처리를 openDetailEditInPlace **안**에 둔다. 호출자가 둘이고(openPostitView = 목록에서
  //   바로 편집, openPostitEdit = 보기에서 "수정") 한쪽에만 넣으면 다른 경로에서는 모달이 그대로
  //   열려 있어 편집 페이지가 그 뒤에 깔린다. CLAUDE.md가 반복해서 경고하는 "형제 경로를 전부
  //   세라"가 이것이다 — 실제로 openPostitView에만 넣었다가 여기로 옮겼다.
  //
  // host 다이얼로그를 닫으면 activeDialogKey가 null이 되어 **배경 스크롤 잠금 effect가 저절로
  // 풀린다**(그 잠금이 iOS의 밀기를 되돌릴 수 없게 만들던 ②다). 닫은 다이얼로그는
  // postitHostKeyRef가 기억하고 closePostitView가 되돌린다 — expandPostitView가 이미 쓰던
  // 패턴 그대로다(새 상태 기계를 만들지 않는다).
  function openDetailEditInPlace(m: Memo) {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    if (isMobile) {
      // ⚠️ 2026-08-31 정정 — **상단 짤림의 원인은 이게 아니었다.** 진짜 원인은
      //    dashboard.css `.memo-edit-page.big-postit`의 `min-height: 100dvh`가 실기기에서
      //    "큰 뷰포트"(792)로 풀려 보이는 높이(684)보다 108px 큰 바닥을 깔고 있던 것이고,
      //    `100svh`로 바꿔 고쳤다(그 규칙의 주석에 실측 전문이 있다).
      //    이 줄은 **긴 메모**(내용이 길어 max가 실제로 큰 경우)에서 대시보드 y가 clamp되는 것을
      //    막으므로 그대로 둔다. 다만 짤림의 처방으로 읽지 마라 — 아래 설명은 그 라운드의 기록이다.
      //
      // (기록) 실기기 판독:
      //     scrollTo(0) 당시 y=0  docSH=792     →  최종 scrollY=30 (maxScroll≈108)
      // 아래 `mobileEditActive` effect의 `scrollTo(0, 0)`이 불릴 때 y는 **이미 0**이었다.
      // 즉 그 호출은 **아무 일도 하지 않는 no-op**이었고, 취소해야 할 대상을 취소하지 못했다.
      // (로컬 Chrome은 그 시점에 이미 clamp가 끝나 y=108로 잡히므로 effect가 제 몫을 한다 —
      //  그래서 로컬에서는 3라운드 내내 재현이 안 됐다. 실측으로 확인: 로컬 y=108, 실기기 y=0.)
      //
      // 기전: 대시보드는 문서 스크롤 y=1400 같은 곳에 있다. 편집 페이지로 바뀌면서 문서가
      // 2709 → 792로 줄고, 브라우저는 **원래 요청값(1400)을 기억한 채** 보이는 값만 clamp한다.
      // 레이아웃이 늦게 정리되는 실기기에서는 effect가 도는 시점에 그 clamp가 아직 반영되지
      // 않아 y가 0으로 읽히고, 그 뒤 기억해둔 값이 되살아나 30에서 멈춘다.
      //
      // ★ 구조 대조(사용자 지적대로 값이 아니라 구조가 답이었다): 편집 페이지로 들어가는 경로 중
      //   **이 경로만 문서가 스크롤된 상태에서 들어온다.** 먼슬리 목록·Key Notes 경로는 다이얼로그가
      //   열려 있어 body가 `position:fixed`로 잠겨 문서 스크롤이 0이다 — 그래서 되살아날 값이 없다.
      //   여기서 미리 0으로 굴리면 그 경로들과 **같은 출발선**이 된다(잠긴 경로에서는 no-op).
      window.scrollTo(0, 0);
      // 🔴🔴🔴 2026-09-01 — **TODAY 경로만 배경 잠금이 없다. 그게 "진입하자마자 제목이 밀리는" 원인이다.**
      //
      // 전수 비교(로컬 375×684, TODAY 진입, 대시보드 y=1400에서):
      //   메모3(채용 317자)   docSH 728  maxScroll 44 → 잠금 O: 제목행 top **53** / 잠금 X: **9**
      //   일반긴메모(446자)   docSH 763  maxScroll 79 → 잠금 O: 제목행 top **53** / 잠금 X: **-26**
      //   메모1(개발자동향)   docSH 750  maxScroll 66 → 잠금 O: 제목행 top **53** / 잠금 X: **-13**
      // → **잠금이 걸린 상태에서는 세 메모가 완전히 동일하다(53 / 뒤로가기 2).** 구조 차이는 0이고,
      //   밀리는 양은 정확히 그 메모의 `maxScroll`이다. **메모 종류·출처와 무관하고 높이에만 의존한다.**
      //   내가 직접 타이핑한 AI트렌드 무관 일반메모가 가장 심하게 밀렸다(-26) — "개발자동향만"이
      //   아니었고, 개발자동향은 AI트렌드 네 섹션 중 유일하게 뷰포트를 넘겼을 뿐이다.
      //
      // 정상 경로(먼슬리 목록·Key Notes)가 안 그러는 이유도 실측했다: 다이얼로그가 열려 있어
      // body가 `position: fixed`로 잠겨 **진입 시점에 굴릴 문서가 없다**(네 메모 전부 maxScroll 0).
      // 👉 그 경로가 쓰는 절차를 **그대로** 태운다. 새 기전을 만들지 않는다(지금까지 새로 만든 것 —
      //    scrollTop 가드·scroll 리스너 pin·overflow:hidden — 은 전부 실패했다).
      //    잠근 뒤 `top`을 0으로 두면 풀 때 **되돌릴 값 자체가 0**이다(잠긴 경로의 `goingFullPage`
      //    분기가 쓰는 것과 같은 산수다).
      // ⚠️ **잠금을 유지하면 안 된다.** 그러면 뷰포트보다 긴 메모가 스크롤 자체를 못 한다.
      //    아래 해제 effect가 **다음 커밋에서 무조건** 푼다(성공·실패 무관 — 잠긴 채 남지 않는다).
      // ⚠️ 이미 잠겨 있으면(다이얼로그 경로) 건드리지 않는다 — 그쪽은 자기 cleanup이 복원한다.
      if (getComputedStyle(document.body).position !== "fixed") {
        const body = document.body;
        entryLockRef.current = { saved: body.getAttribute("style") };
        body.style.position = "fixed";
        body.style.top = "0px";
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
      }
      // 🔴🔴 `activeDialogKey`(state)로 판단하면 안 된다 — **같은 tick에서는 아직 옛 값이다.**
      // 호출부가 `open(dialogs.postitOnly); openPostitView(m);` 순서다(Dashboard 4157/4171줄).
      // `open()`이 setActiveDialogKey를 큐에 넣기만 하므로 이 함수가 읽는 값은 그 이전 값이고,
      // 그러면 **열려 있는 다이얼로그를 하나도 못 닫는다** → 모달이 위에 남고 activeDialogKey가
      // "postitOnly"로 굳어 배경 스크롤 잠금(body{position:fixed})이 풀리지 않는다
      // = 2026-08-28 "스크롤 막힘". DOM의 `.open`은 showModal()이 **동기로** 세우므로 정확하다.
      const openKey = (["memo", "keynotes", "postitOnly"] as const).find((k) => dialogs[k].current?.open) ?? null;
      if (openKey) {
        // postitOnly는 되돌아갈 자리가 아니다(포스트잇 전용 창) — memo/keynotes만 기억한다.
        if (openKey !== "postitOnly") postitHostKeyRef.current = openKey;
        close(dialogs[openKey]);
      }
      // close 이벤트는 **비동기**라 그것만 기다리면 잠금이 한 프레임 이상 남는다. 직접 비운다.
      setActiveDialogKey(null);
    }
    loadMemoIntoForm(m, "document");
    setPostitEditMode("detail");
  }
  function openPostitEdit(m: Memo) {
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    if (postitExpanded || isMobile) openDetailEditInPlace(m);
    else openQuickEdit(m);
  }
  // 브라우저 기본 confirm() 대신 기존 디자인과 통일된 확인 팝업 — 어떤 다이얼로그 안에서 열려도 재사용
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; hideCancel?: boolean } | null>(null);
  function askConfirm(message: string, onConfirm: () => void | Promise<void>, confirmLabel?: string, hideCancel?: boolean) {
    setConfirmDialog({ message, confirmLabel, onConfirm, hideCancel });
  }
  // 메모를 바꾼 뒤 서버 props(대시보드 미니 패널 등)와 현재 보고 있는 달의 데이터를 함께 갱신.
  //
  // 여기엔 router.refresh()가 있었는데 지웠다. 이유(Next 16.3 server-actions 문서 "Choosing a cache
  // update"): revalidatePath가 실행되면 Next가 현재 라우트를 서버에서 다시 렌더해 그 액션 응답에
  // 새 RSC 페이로드를 같이 실어 보낸다. 이 함수의 호출자 7곳은 전부 그 직전에 revalidatePath("/")를
  // 부르는 메모 액션(createMemo/updateMemo/deleteMemo/saveBlockToMemo…)을 await하므로, 도착한
  // 시점에 page.tsx props(memosForMonth·importantMemos·projectIdeas·focusView…)는 이미 새것이다.
  // 그 뒤의 router.refresh()는 같은 페이지를 한 번 더 통째로 렌더시키는 두 번째 왕복이었다
  // (page.tsx의 DB 쿼리 6개 + getProfile이 저장 한 번에 두 번 돌았다).
  //
  // 한때 "router.refresh()를 빼고 필요한 것만 따로 불러오게" 최적화했다가 포스트잇 저장 시
  // 다이얼로그가 닫히는 버그가 나서 되돌린 적이 있는데, 그건 refresh를 뺀 것 자체가 아니라 빼면서
  // Key Notes만 따로 받아오는 경로(getImportantMemosAction)를 '추가'해 prop 갱신 경로가 둘로 늘어난
  // 탓으로 보인다. 이번엔 아무것도 추가하지 않고 중복 왕복만 지운다 — importantMemos는 위 액션 응답의
  // 재렌더로 그대로 갱신되므로 별도 조회가 필요 없다.
  //
  // 반환값(이번에 새로 받아온 메모들)을 저장 흐름에서 재사용하면, 방금 저장한 메모 하나를 보려고
  // 또 한 번 getMemosForDateAction을 왕복하지 않아도 된다(아래 handleSaveMemo 참고).
  // viewMemos는 여기서 계속 직접 받아온다 — page.tsx는 '오늘 달'만 조회하므로 사용자가 다른 달을
  // 보고 있으면 액션 응답의 props로는 그 달을 채울 수 없다.
  async function refreshAfterMemoChange(): Promise<Memo[]> {
    const sameMonth = viewYear === today.year && viewMonth0 === today.month0;
    const [memos, todayMemos] = await Promise.all([
      getMemosForMonthAction(viewYear, viewMonth0),
      sameMonth ? Promise.resolve(null) : getMemosForMonthAction(today.year, today.month0),
    ]);
    setViewMemos(memos);
    setMemosForMonthState(sameMonth ? memos : todayMemos!);
    return sameMonth ? memos : [...memos, ...todayMemos!];
  }
  // 시작일이 종료일보다 늦어도 아무 경고 없이 저장되던 버그 — 저장 경로가 셋(저장 버튼 /
  // Monthly MEMO ‹ 나가기 / 포스트잇 ‹ 나가기)인데 전부 검사가 없었다. 세 경로가 같은 폼 상태를
  // 쓰므로 여기 한 곳에서만 막는다. ISO(YYYY-MM-DD)라 문자열 비교로 충분하다.
  // 저장 시점에만 검사하면 memoFormOpen이 false인 경로(다이얼로그 하단 상시 폼 등)나
  // 저장 없이 닫히는 흐름에서 문구가 아예 안 뜬다. 날짜가 바뀌는 즉시 검사해 두면
  // 어느 화면(웹 폼 / 포스트잇 수정 / ⋮ 시트)에서 고르든 바로 경고가 보인다.
  useEffect(() => {
    setMemoDateError(
      formStartDate && formEndDate && formStartDate > formEndDate
        ? "시작일이 종료일보다 늦을 수 없습니다."
        : null
    );
  }, [formStartDate, formEndDate]);
  function validateMemoDates() {
    if (formStartDate && formEndDate && formStartDate > formEndDate) {
      setMemoDateError("시작일이 종료일보다 늦을 수 없습니다.");
      return false;
    }
    setMemoDateError(null);
    return true;
  }
  async function handleSaveMemo() {
    if (!validateMemoDates()) return;
    // "저장" 버튼은 지금 값을 바로 반영하므로, 대기 중인 자동저장 타이머가 1초 뒤 같은 내용을 또 저장하는
    // 중복 요청을 막는다.
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    setSavingMemo(true);
    try {
      const input = {
        title: formTitle,
        content: readFormBody(),
        content_format: contentFormatFor(readFormBody()),
        content_mode: formContentMode,
        emoji: formEmoji,
        memo_type: formType,
        status: formType === "todo" ? formStatus : null,
        start_date: formStartDate,
        end_date: formEndDate,
        color: formColor,
        is_important: formImportant,
      };
      const result = editingMemoId ? await updateMemo(editingMemoId, input) : await createMemo(input);
      if (result && "error" in result) { alert(result.error); return; }
      const savedId = editingMemoId;
      // 저장 체감 속도 — 예전엔 여기서 refreshAfterMemoChange가 끝난 뒤에도 방금 저장한 메모 하나
      // 보자고 getMemosForDateAction을 또 한 번(왕복 3번째) 불렀다. refreshAfterMemoChange가 이미
      // 받아온 목록에 그 메모가 있으면(같은 달/오늘 보기 중이면 거의 항상 있다) 그걸 그대로 쓰고,
      // 정말 범위 밖일 때만(다른 달 보다가 그 메모를 열었던 경우 등) 예전처럼 따로 가져온다.
      const refreshed = await refreshAfterMemoChange();
      // Quick Edit/Detail Edit 둘 다 저장 후 같은 오버레이에서 View로 복귀해 결과를 바로 보여준다
      // (예전엔 Quick Edit만 저장 즉시 닫혔는데, 사용자가 갑자기 닫히는 느낌이라 Detail Edit와 통일했다).
      // 그 외(Create/기존 폼)는 기존대로 닫는다.
      if (postitEditMode === "quick" || postitEditMode === "detail") {
        // 버그: 색상 등을 바꿔 저장하면 View로 돌아가는 순간 postitViewMemo가 아직 저장 전 값이라
        // 이전 색으로 한 프레임 렌더된 뒤, 아래 fetch가 끝나야 새 색으로 바뀌었다(깜빡임의 원인).
        // View로 전환하기 전에 방금 저장한 값으로 먼저 낙관적 병합해두면 처음부터 새 색으로 뜬다 —
        // 서버 fetch는 그대로 두어 auto_title 등 서버 계산 필드까지 마저 맞춘다.
        if (savedId) setPostitViewMemo((v) => (v ? { ...v, ...input } : v));
        setPostitEditMode(null);
        if (savedId) {
          const alreadyFetched = refreshed.find((mm) => mm.id === savedId);
          const fresh = alreadyFetched ?? (await getMemosForDateAction(input.start_date)).find((mm) => mm.id === savedId);
          if (fresh) setPostitViewMemo(fresh);
        }
      } else {
        setMemoFormOpen(false);
        closeBigEditor();
      }
    } finally {
      setSavingMemo(false);
    }
  }
  // Monthly MEMO 다이얼로그의 뒤로가기(‹) — compose mode(작성 중)면 먼저 작성 화면만 종료하고
  // 달력/목록으로 복귀시키며, 그 상태에서 내용이 있으면 조용히 저장까지 해준다(뒤로가기로 나가면서
  // 방금 쓴 내용이 사라지는 것을 막는다). compose mode가 아니면(=이미 달력/목록 화면) 평소처럼
  // 다이얼로그 자체를 닫는다.
  async function handleMemoDialogBack() {
    if (!memoFormOpen) { close(dialogs.memo); return; }
    if (savingMemo) return;
    // 날짜가 뒤집힌 채로 조용히 저장되지 않도록 나가기도 막고, 모바일은 날짜가 있는 ⋮ 시트를 열어 보여준다.
    if (!validateMemoDates()) { setMobileMemoMenuOpen(true); return; }
    const hasDraft = Boolean(formTitle.trim() || htmlToPlainText(readFormBody()).trim());
    if (!editingMemoId && !hasDraft) {
      setMemoFormOpen(false);
      return;
    }
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    // 위 handlePostitBack과 같은 이유로 작성 화면을 **먼저** 닫는다. 예전엔 왕복 2~3번에 더해
    // "저장됨 ✓"를 보여주려는 `await sleep(520)`까지 기다린 뒤에야 닫혀서, 모바일에서 ‹를 누르고
    // 1~2초를 멈춘 채 기다려야 했다. 화면이 닫히면 그 표시는 어차피 안 보이므로 대기도 같이 없앤다.
    const id = editingMemoId;
    const body = readFormBody();
    const input = {
      title: formTitle,
      content: body,
      content_format: contentFormatFor(body),
      content_mode: formContentMode,
      emoji: formEmoji,
      memo_type: formType,
      status: formType === "todo" ? formStatus : null,
      start_date: formStartDate,
      end_date: formEndDate,
      color: formColor,
      is_important: formImportant,
    };
    if (id) patchLocalMemo(id, input as Partial<Memo>);
    setMemoFormOpen(false);
    const result = id ? await updateMemo(id, input) : await createMemo(input);
    if (result && "error" in result) { alert(result.error); return; }
    if (!id && "id" in result && typeof result.id === "string") setEditingMemoId(result.id);
    await refreshAfterMemoChange();
  }
  function handleDeleteMemo(id: string) {
    askConfirm("이 메모를 삭제할까요?", async () => {
      await deleteMemo(id);
      setMemoFormOpen(false);
      closeBigEditor();
      // 🔴 세 setter를 손으로 부르면 **되돌아갈 화면을 잃는다.** 그 셋만 내리면
      // 편집 페이지가 언마운트되면서 `memo-edit-page-open`이 풀려 대시보드가 그대로 드러난다
      // — 먼슬리 메모/키노트에서 삭제했는데 메인으로 튕기는 신고가 이것이다.
      // 호스트 다이얼로그 복원(postitHostKeyRef)은 closePostitView가 **이미** 하고 있다.
      // 되돌리는 로직을 두 벌로 만들지 말고 그 한 곳을 쓴다.
      closePostitView();
      await refreshAfterMemoChange();
    });
  }

  // 날짜별 메모 목록 다중 선택 삭제 — 휴지통 버튼 하나가 선택모드 진입/취소/삭제를 겸한다
  const [memoSelectionMode, setMemoSelectionMode] = useState(false);
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMemoSelectionMode(false); setSelectedMemoIds(new Set()); }, [memoDialogDateIso]);
  function toggleMemoSelected(id: string) {
    setSelectedMemoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function handleMemoTrashClick() {
    if (!memoSelectionMode) { setMemoSelectionMode(true); setSelectedMemoIds(new Set()); return; }
    if (selectedMemoIds.size === 0) { setMemoSelectionMode(false); return; }
    const ids = Array.from(selectedMemoIds);
    askConfirm(
      `선택한 메모 ${ids.length}개를 삭제할까요? 삭제한 메모는 복구할 수 없습니다.`,
      async () => {
        await Promise.all(ids.map((id) => deleteMemo(id)));
        setSelectedMemoIds(new Set());
        setMemoSelectionMode(false);
        await refreshAfterMemoChange();
      },
      `${ids.length}개 삭제`
    );
  }

  // Key Notes — importantMemos는 이미 "Pin 우선 → 날짜순"으로 정렬돼 온다 (6.6절)
  // 서버 새로고침 없이 즉시 반영하기 위해 로컬 상태로 미러링한다 (12절 — 별/고정 토글 속도)
  const [importantMemosState, setImportantMemosState] = useState<Memo[] | null>(importantMemos ?? null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setImportantMemosState(importantMemos ?? null), [importantMemos]);
  const pinnedMemos = (importantMemosState ?? []).filter((m) => m.is_pinned);
  const priorityMemos = (importantMemosState ?? []).filter((m) => !m.is_pinned);
  const [pinnedFullView, setPinnedFullView] = useState(false);
  // 다이얼로그를 열 때마다 이 값을 올려 KeynoteCardList를 새로 마운트한다 = 드래그 순서를 서버
  // 순서로 되돌리는 스냅샷. 예전엔 부모가 snapshot()을 직접 불렀는데, 그러려면 드래그 순서 state가
  // 부모에 있어야 했다 — 그게 곧 "카드 한 칸 옮길 때마다 Dashboard 전체 재렌더"의 원인이었다.
  const [keynotesOpenSeq, setKeynotesOpenSeq] = useState(0);
  function openKeyNotes() {
    setKeynotesOpenSeq((n) => n + 1);
    setPinnedFullView(false);
    open(dialogs.keynotes);
  }

  function patchMemoInLists(id: string, patch: Partial<Memo>) {
    setViewMemos((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setImportantMemosState((prev) => {
      if (!prev) return prev;
      const existing = prev.find((m) => m.id === id);
      const withoutIt = prev.filter((m) => m.id !== id);
      const updated = existing ? { ...existing, ...patch } : null;
      return updated?.is_important ? [updated, ...withoutIt] : withoutIt;
    });
    if (editingMemoId === id) {
      if (patch.is_important !== undefined) setFormImportant(patch.is_important);
      if (patch.is_pinned !== undefined) setFormPinned(patch.is_pinned);
    }
  }
  // ☆ ↔ ★ 만 다룬다 — 고정은 Key Notes 팝업에서만 (12절, 목록에서는 빠르게 동작해야 한다)
  async function handleToggleImportant(m: Memo, e: React.MouseEvent) {
    e.stopPropagation();
    const patch: Partial<Memo> = m.is_important
      ? { is_important: false, is_pinned: false, pinned_at: null }
      : { is_important: true };
    patchMemoInLists(m.id, patch);
    await toggleImportant(m.id);
  }
  // 먼슬리 메모 목록의 별 — ☆ → ★ → 📌 → ☆ 로 한 바퀴 돈다(모바일 편집 헤더의 버튼과 같은 규칙).
  // 새 서버 액션을 만들지 않는다: toggleImportant가 **중요 해제 시 is_pinned/pinned_at까지 같이 내린다**
  // (memo.ts 119절)라 📌 → ☆가 한 번에 되고, ★ → 📌은 setMemoPinned가 is_important까지 올려준다.
  async function cycleMemoStar(m: Memo, e: React.MouseEvent) {
    // 📌(고정) → ☆ , ☆ → ★  : 둘 다 toggleImportant 한 번으로 끝난다
    if (m.is_pinned || !m.is_important) return handleToggleImportant(m, e);
    // ★(중요) → 📌(고정)
    e.stopPropagation();
    return handleTogglePin(m.id, false);
  }
  async function handleTogglePin(id: string, isPinned: boolean) {
    const patch: Partial<Memo> = isPinned ? { is_pinned: false } : { is_pinned: true, is_important: true };
    patchMemoInLists(id, patch);
    await setMemoPinned(id, !isPinned);
  }

  // 프로젝트 아이디어 — CREATE(새 작성) / VIEW(읽기) / EDIT(수정) 3개 모드를 같은 다이얼로그가 담당한다.
  // 본문은 Monthly Memo의 MemoRichEditor를 그대로 재사용한다(프로젝트 전용 에디터를 새로 만들지 않는다).
  const [projMode, setProjMode] = useState<"create" | "view" | "edit">("create");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projTitle, setProjTitle] = useState("");
  const [projStatus, setProjStatus] = useState<string>(PROJECT_STATUSES[0]);
  const [projSummary, setProjSummary] = useState("");
  // 프로젝트 본문도 메모 본문과 같은 이유로 ref를 최신값의 기준으로 둔다(위 formBodyRef 주석 참고).
  const [projContent, setProjContentState] = useState("");
  const projContentRef = useRef("");
  const projContentFlushRef = useRef<number | null>(null);
  function readProjContent() {
    return projContentRef.current;
  }
  function setProjContent(value: string | ((prev: string) => string)) {
    const next = typeof value === "function" ? value(projContentRef.current) : value;
    projContentRef.current = next;
    if (projContentFlushRef.current !== null) {
      window.clearTimeout(projContentFlushRef.current);
      projContentFlushRef.current = null;
    }
    setProjContentState(next);
  }
  function setProjContentWhileTyping(html: string) {
    projContentRef.current = html;
    if (projContentFlushRef.current !== null) window.clearTimeout(projContentFlushRef.current);
    projContentFlushRef.current = window.setTimeout(() => {
      projContentFlushRef.current = null;
      setProjContentState(projContentRef.current);
    }, 300);
  }
  const [projUpdatedAt, setProjUpdatedAt] = useState<string | null>(null);
  const [projSummaryError, setProjSummaryError] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [projEditorKey, setProjEditorKey] = useState(0); // 템플릿 삽입/모드 전환 시 Tiptap 재마운트용
  // false | "form"(작성창 안 에디터) | "bodyEditor"(확장 창) — 어느 쪽에서 템플릿을 눌렀는지 기억해야
  // "추가" 확인 후 같은 곳에 적용할 수 있다.
  const [projTemplatePrompt, setProjTemplatePrompt] = useState<false | "form" | "bodyEditor">(false);

  // 프로젝트 목록 — 검색+상태 필터 (목록은 Database Table로, 서버에서 이미 최근 수정일 내림차순으로 온다)
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>("전체");
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return (projectIdeas ?? []).filter((p) => {
      if (projectStatusFilter !== "전체" && p.status !== projectStatusFilter) return false;
      if (q && !p.title.toLowerCase().includes(q) && !(p.summary ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projectIdeas, projectSearch, projectStatusFilter]);

  // 🔴 다른 프로젝트로 갈아타기 전에 **대기 중인 자동저장을 반드시 버린다.** 남겨두면 1초 뒤
  // 그 타이머가 방금 떠난 화면의 제목·본문을 지금 열린 프로젝트에 덮어쓴다(신규로 열었으면 그
  // 내용으로 row를 하나 더 만든다). 저장 버튼·‹ 나가기 경로는 이미 같은 정리를 하고 있다.
  function discardPendingProjectAutosave() {
    if (projAutosaveTimerRef.current) { clearTimeout(projAutosaveTimerRef.current); projAutosaveTimerRef.current = null; }
  }
  function openNewProject() {
    discardPendingProjectAutosave();
    setProjMode("create");
    setEditingProjectId(null);
    editingProjectIdRef.current = null;
    setProjTitle("");
    setProjStatus(PROJECT_STATUSES[0]);
    setProjSummary("");
    setProjContent("");
    setProjUpdatedAt(null);
    setProjSummaryError(null);
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    setProjEditorKey((k) => k + 1);
    resetProjectDetailScroll();
    open(dialogs.projectDetail);
  }
  function openExistingProject(p: ProjectIdea) {
    // 모바일은 postit과 동일하게 읽기전용 View를 건너뛰고 바로 편집 폼으로 들어간다(자동저장이라 안전)
    discardPendingProjectAutosave();
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    setProjMode(isMobile ? "edit" : "view");
    setEditingProjectId(p.id);
    editingProjectIdRef.current = p.id;
    setProjTitle(p.title);
    setProjStatus(p.status);
    setProjSummary(p.summary ?? "");
    // content_format 컬럼으로 판별한다 — 서식 없는 rich_html 본문(순수 <p> 문단)을 문자열 추측으로 plain 오판하면
    // 태그가 그대로 이스케이프되어 노출되므로 hasRichFormatting 휴리스틱을 쓰지 않는다
    setProjContent(toEditableHtml(p.content_md, p.content_format));
    setProjUpdatedAt(p.updated_at);
    setProjSummaryError(null);
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    setProjEditorKey((k) => k + 1);
    resetProjectDetailScroll();
    open(dialogs.projectDetail);
  }
  // 자유 형식 = 목차를 자동으로 넣지 않을 뿐, 에디터 기능은 기본 템플릿과 완전히 동일하다.
  // 본문이 이미 있으면 절대 덮어쓰지 않고 "아래에 추가할까요?"를 먼저 물어본다.
  // 작성창 안 에디터(form)와 확장 창(bodyEditor)이 같은 로직을 쓰되 대상 state만 다르다.
  function applyProjectTemplate(target: "form" | "bodyEditor" = "form") {
    const current = target === "bodyEditor" ? readBodyEditorDraft() : readProjContent();
    if (htmlToPlainText(current).trim().length > 0) { setProjTemplatePrompt(target); return; }
    if (target === "bodyEditor") { setBodyEditorDraft(PROJECT_TEMPLATE_HTML); setBodyEditorSessionKey((k) => k + 1); }
    else { setProjContent(PROJECT_TEMPLATE_HTML); setProjEditorKey((k) => k + 1); }
  }
  function appendProjectTemplate() {
    if (projTemplatePrompt === "bodyEditor") {
      setBodyEditorDraft((prev) => prev + PROJECT_TEMPLATE_HTML);
      setBodyEditorSessionKey((k) => k + 1);
    } else {
      setProjContent((prev) => prev + PROJECT_TEMPLATE_HTML);
      setProjEditorKey((k) => k + 1);
    }
    setProjTemplatePrompt(false);
  }
  // 작성창/확장 창 둘 다 같은 확인 팝업을 쓴다 — 지금 열려있는 다이얼로그 쪽에서만 렌더링한다.
  const projTemplatePromptNode = (
    <div className="postit-overlay open" onClick={() => setProjTemplatePrompt(false)}>
      <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="copy-picker-title">현재 내용이 있습니다.<br />기본 템플릿을 현재 내용 아래에 추가할까요?</div>
        <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="cancel-btn" onClick={() => setProjTemplatePrompt(false)}>취소</button>
          <button className="save-btn" onClick={appendProjectTemplate}>추가</button>
        </div>
      </div>
    </div>
  );
  // VIEW에서 핵심 기능 체크만 즉시 반영한다 — [수정] 진입 없이 바로 저장까지 간다.
  async function toggleProjectTask(index: number) {
    const next = toggleTaskItemInHtml(readProjContent(), index);
    setProjContent(next);
    if (!editingProjectId) return;
    await saveProjectIdea(editingProjectId, {
      title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: next,
    });
    // 이하 프로젝트 저장/삭제 경로 전부 router.refresh()를 뺐다 — saveProjectIdea/deleteProjectIdea가
    // revalidatePath("/")를 부르므로 그 액션 응답이 새 projectIdeas를 실어 온다. projectIdeas는 로컬
    // 미러가 없어 prop을 직접 읽는 유일한 값인데, 액션 응답의 재렌더가 그 prop을 갱신해준다
    // (근거: refreshAfterMemoChange 주석).
  }
  async function handleSaveProject() {
    const summary = projSummary.trim();
    if (summary.length > SUMMARY_MAX_LENGTH) {
      setProjSummaryError(`한 줄 요약은 최대 ${SUMMARY_MAX_LENGTH}자까지 입력할 수 있습니다.`);
      return;
    }
    // 대기 중인 자동저장 타이머가 뒤늦게 같은 내용을 또 insert(신규 작성 중 중복 row)하지 않도록 막는다.
    if (projAutosaveTimerRef.current) { clearTimeout(projAutosaveTimerRef.current); projAutosaveTimerRef.current = null; }
    setProjSummaryError(null);
    setSavingProject(true);
    try {
      // ref로 읽는 이유는 handleProjectDetailBack과 같다 — 자동저장이 방금 만든 row를 놓치면 중복 insert가 된다.
      const id = editingProjectIdRef.current;
      const result = await saveProjectIdea(id, {
        title: projTitle, status: projStatus, summary, content_md: readProjContent(),
      });
      if (result.error) { alert(result.error); return; }
      if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
      close(dialogs.projectDetail);
    } finally {
      setSavingProject(false);
    }
  }
  function handleDeleteProject() {
    if (!editingProjectId) return;
    askConfirm("이 프로젝트 아이디어를 삭제할까요?", async () => {
      await deleteProjectIdea(editingProjectId);
      close(dialogs.projectDetail);
    });
  }
  // 모바일 ‹ 목록 버튼 — 디바운스된 자동저장이 아직 안 걸렸을 수 있으니 나가기 전에 즉시 한 번 저장한다.
  async function handleProjectDetailBack() {
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    if (projMode === "view" || !projTitle.trim()) { close(dialogs.projectDetail); return; }
    if (savingProject) return;
    if (projAutosaveTimerRef.current) {
      clearTimeout(projAutosaveTimerRef.current);
      projAutosaveTimerRef.current = null;
    }
    // 메모 쪽(handlePostitBack)과 같은 이유로 창을 **먼저** 닫고 저장은 뒤에서 보낸다 —
    // 모바일/PWA에서 ‹를 누르고 서버 왕복 한 번을 멈춘 채 기다리던 구간이다.
    // 🔴 state가 아니라 ref다 — 자동저장이 방금 만든 row의 id는 아직 state에 안 들어와 있을 수
    // 있고, 그러면 여기서 같은 내용을 한 번 더 insert한다(scheduleProjectAutosave 주석의 그 창).
    const id = editingProjectIdRef.current;
    const input = { title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: readProjContent() };
    close(dialogs.projectDetail);
    const result = await saveProjectIdea(id, input);
    if (result.error) { alert(result.error); return; }
    if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
  }

  // Monthly Memo와 같은 방식 — 입력이 멈추고 1초 뒤 조용히 저장한다. 신규 작성 중(editingProjectId
  // 없음)에도 제목이 있으면 저장을 걸어 새 row를 만들고, 그 id를 editingProjectId로 채워 이후
  // 자동저장이 같은 row를 계속 update하게 한다 — 드래그 등으로 창을 실수로 벗어나도 내용이 남는다.
  const [projAutosaveStatus, setProjAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const projAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔴🔴 신규 프로젝트의 id는 **타이머가 터지는 시점**에 읽어야 한다 — 스케줄 시점에 읽으면 중복 insert가 난다.
  //
  // 예전엔 `const id = editingProjectId`를 스케줄 시점에 잡았다. 신규 작성 흐름을 그대로 따라가면:
  //   t=0     제목 입력 → 스케줄(id=null), 타이머 T1
  //   t=1000  T1 발화 → insert 시작(아직 응답 없음)
  //   t=1100  이어서 타이핑 → 스케줄. editingProjectId는 **아직 null**이라 id=null로 또 잡힌다 → T2
  //   t=1300  insert 응답 → setEditingProjectId(새 id)
  //   t=2100  T2 발화 → id가 null이므로 **두 번째 insert** = 같은 프로젝트가 목록에 두 벌
  // 디바운스는 "대기 중인 타이머"만 지우지 이미 발화해 왕복 중인 저장은 못 지운다. 1초 넘게
  // 이어 치기만 하면 재현되므로 신규 작성에서는 사실상 상시 발생하는 경로다.
  // 최신 id를 ref로 들고 발화 시점에 읽는다 — setEditingProjectId 뒤 커밋에서 이 effect가 맞춰준다.
  const editingProjectIdRef = useRef<string | null>(null);
  useEffect(() => { editingProjectIdRef.current = editingProjectId; }, [editingProjectId]);
  function scheduleProjectAutosave(overrides: Partial<{ title: string; status: string; summary: string; content: string }> = {}) {
    const title = overrides.title ?? projTitle;
    const status = overrides.status ?? projStatus;
    const summary = overrides.summary ?? projSummary;
    const content = overrides.content ?? readProjContent();
    if (!title.trim()) return; // 제목 없이는 저장하지 않는다(서버 액션도 동일하게 막는다)
    if (projAutosaveTimerRef.current) clearTimeout(projAutosaveTimerRef.current);
    projAutosaveTimerRef.current = setTimeout(async () => {
      const id = editingProjectIdRef.current; // 스케줄 시점이 아니라 **지금** 읽는다(위 주석)
      setProjAutosaveStatus("saving");
      try {
        const result = await saveProjectIdea(id, { title, status, summary: summary.trim(), content_md: content });
        if (result.error) { setProjAutosaveStatus("idle"); return; }
        // 다음 타이머가 같은 row를 update하도록 ref를 **즉시** 채운다. setEditingProjectId는
        // 커밋 뒤에야 반영되므로 그것만 믿으면 위 중복 insert 창이 그대로 남는다.
        if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
        setProjAutosaveStatus("saved");
        setTimeout(() => setProjAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        // 세션 만료·네트워크 실패로 throw되면 예전엔 "저장 중..."이 영원히 남았다(unhandled rejection).
        console.error("[project] 자동저장 실패", e);
        setProjAutosaveStatus("idle");
      }
    }, 1000);
  }
  const projAutosaveStatusNode =
    projAutosaveStatus === "saving" ? <span className="autosave-status">저장 중...</span>
    : projAutosaveStatus === "saved" ? <span className="autosave-status saved">저장됨 ✓</span>
    : null;

  // 본문 크게 보기 — 메모와 프로젝트가 같은 확장 editor/modal/state를 공유한다.
  // 확장 전/후 내용은 같은 draft state를 쓰므로 열었다 닫아도 내용이 그대로 유지된다.
  // "전체 수정"(확장) 에디터의 본문도 같은 방식 — 타이핑 중에는 ref만, state는 멈춘 뒤에.
  const [bodyEditorDraft, setBodyEditorDraftState] = useState("");
  const bodyEditorDraftRef = useRef("");
  const bodyEditorFlushRef = useRef<number | null>(null);
  function readBodyEditorDraft() {
    return bodyEditorDraftRef.current;
  }
  function setBodyEditorDraft(value: string | ((prev: string) => string)) {
    const next = typeof value === "function" ? value(bodyEditorDraftRef.current) : value;
    bodyEditorDraftRef.current = next;
    if (bodyEditorFlushRef.current !== null) {
      window.clearTimeout(bodyEditorFlushRef.current);
      bodyEditorFlushRef.current = null;
    }
    setBodyEditorDraftState(next);
  }
  function setBodyEditorDraftWhileTyping(html: string) {
    bodyEditorDraftRef.current = html;
    if (bodyEditorFlushRef.current !== null) window.clearTimeout(bodyEditorFlushRef.current);
    bodyEditorFlushRef.current = window.setTimeout(() => {
      bodyEditorFlushRef.current = null;
      setBodyEditorDraftState(bodyEditorDraftRef.current);
    }, 300);
  }
  const [bodyEditorTarget, setBodyEditorTarget] = useState<"memo" | "project">("memo");
  // bigEditorNode(News/Job/AI Trend → 기존 메모)는 activeDialogKey === "news" 등으로 렌더링 여부가
  // 갈리는데, close()는 닫히는 다이얼로그가 현재 activeDialogKey와 같으면 무조건 null로 되돌린다 —
  // bodyEditor를 열기 전 activeDialogKey를 기억해뒀다가 닫을 때 되돌려서, X를 눌렀을 때 이전 Quick
  // Editor(뉴스/채용/AI트렌드 다이얼로그)가 사라지지 않고 그대로 남게 한다.
  const preBodyEditorDialogKeyRef = useRef<keyof typeof dialogs | null>(null);
  function openBodyEditor(target: "memo" | "project" = "memo") {
    preBodyEditorDialogKeyRef.current = activeDialogKey;
    // bigEditorOpen(=bigEditorNode가 실제로 마운트돼 있을 때)일 때만 그 에디터의 caret을 읽는다 —
    // 그 외 진입 경로(전체보기 detailEditFormNode 등)에서는 bigEditorHandleRef가 이전 세션의 낡은
    // 참조일 수 있어 잘못된 위치를 복구하지 않도록 방지한다.
    pendingCursorPosRef.current = target === "memo" && bigEditorOpen ? bigEditorHandleRef.current?.getSelection() ?? null : null;
    setBodyEditorTarget(target);
    setBodyEditorDraft(target === "project" ? readProjContent() : readFormBody());
    setBodyEditorSessionKey((k) => k + 1);
    resetBodyEditorScroll();
    open(dialogs.bodyEditor);
  }
  function closeBodyEditor() {
    if (bodyEditorTarget === "project") {
      setProjContent(readBodyEditorDraft());
      setProjEditorKey((k) => k + 1);
    } else {
      setFormBody(readBodyEditorDraft());
      // Tiptap은 initialValue를 마운트 시점에 한 번만 읽는다 — 그래서 project 분기는 projEditorKey를
      // 올려 에디터를 강제 재마운트하는데, memo 분기엔 그게 빠져 있었다. formBody(=ref/state)만 바뀌고
      // 화면의 에디터는 확장 창에 들어가기 전 문서를 그대로 들고 있어서, 확장에서 넣은 링크·서식이
      // "완료"를 눌러도 반영되지 않았다(메모를 껐다 켜면 새 세션 키로 다시 마운트돼 그제야 보였다).
      setFormSessionKey((k) => k + 1);
    }
    close(dialogs.bodyEditor);
    if (preBodyEditorDialogKeyRef.current) {
      setActiveDialogKey(preBodyEditorDialogKeyRef.current);
      preBodyEditorDialogKeyRef.current = null;
    }
  }
  // bodyEditor가 새 세션(bodyEditorSessionKey)으로 열릴 때마다, openBodyEditor에서 미리 읽어둔
  // caret 위치가 있으면 새로 마운트된 에디터에 그대로 옮겨 심는다.
  useEffect(() => {
    const pos = pendingCursorPosRef.current;
    if (!pos) return;
    pendingCursorPosRef.current = null;
    const timer = window.setTimeout(() => bodyEditorHandleRef.current?.setSelection(pos), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyEditorSessionKey]);

  // 24절 — 자동 저장. 기존 메모를 편집 중일 때만(신규 작성은 아직 id가 없어 대상이 없다) 입력이
  // 멈추고 1초 뒤 조용히 저장한다. 목록/카드가 세션 중 즉시 최신 상태를 보이도록 로컬 상태도 같이 갱신한다.
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patchLocalMemo(id: string, patch: Partial<Memo>) {
    const apply = (list: Memo[]) => list.map((mm) => (mm.id === id ? { ...mm, ...patch } : mm));
    setViewMemos((prev) => apply(prev));
    setMemosForMonthState((prev) => (prev ? apply(prev) : prev));
    // postitViewMemo는 목록이 아니라 상세 오버레이가 들고 있는 별도 스냅샷이다 — 여기서 같이
    // 갱신하지 않으면 오버레이 안에서 편집·자동저장을 해도 화면은 열 때의 옛 내용을 계속 그린다.
    // (링크를 넣어도 메모를 껐다 켜야 보이던 원인. 색상에서도 같은 증상이 따로 보고된 적 있다.)
    setPostitViewMemo((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }
  // 제목도 본문과 같은 디바운스로 자동저장한다 — 둘 다 formTitle/formBody 최신값을 기준으로 하나의
  // 타이머를 공유하므로, 제목/본문을 거의 동시에 고쳐도 마지막 타이핑 기준으로 둘 다 함께 저장된다.
  function scheduleAutosave(overrides: Partial<{ title: string; content: string }> = {}) {
    if (!editingMemoId) return;
    const id = editingMemoId;
    const title = overrides.title ?? formTitle;
    const content = overrides.content ?? readFormBody();
    // 🔴🔴 자동저장은 **되돌릴 수 없는** 쓰기다. 본문이 갑자기 대부분 사라진 상태를 그대로 서버에
    // 덮어쓰면 사용자가 몇 시간 쓴 메모가 영구히 없어진다("글 내용이 반쯤 날아간다", 2026-08-26).
    // 그런 급격한 축소는 사용자가 직접 지운 게 아니라 **버그일 가능성이 높다** — 실제로 이 프로젝트에서
    // 두 가지 경로가 확인됐다(hasRichFormatting 오판 → htmlToPlainText 납작화, 그리고 원인 미확정 경로).
    // 사람이 진짜로 지웠다면 저장 버튼이나 ‹(handleSaveMemo/handlePostitBack)로 명시적으로 저장된다 —
    // 그 경로는 이 가드를 거치지 않으므로 정상적인 전체 삭제는 그대로 된다.
    // 여기서 막는 것은 **자동**저장뿐이고, 막을 때는 조용히 넘어가지 않고 콘솔에 남긴다.
    const prevText = htmlToPlainText(memoBodyBaselineRef.current).length;
    const nextText = htmlToPlainText(content).length;
    if (prevText >= AUTOSAVE_SHRINK_MIN_CHARS && nextText < prevText * AUTOSAVE_SHRINK_RATIO) {
      console.error("[memo] 자동저장 취소 — 본문이 갑자기 줄었다(버그 의심). 저장 버튼이나 ‹로는 그대로 저장된다.", { id, prevText, nextText });
      noteBodyShrink(`자동저장 취소: ${prevText}자 → ${nextText}자 (id ${id.slice(0, 8)})`);
      return;
    }
    memoBodyBaselineRef.current = content;
    const format: ContentFormat = contentFormatFor(content);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        // 🔴 반환값을 버리면 안 된다. updateMemo는 제목이 예약 패턴(메모1·메모2…)이면 저장하지 않고
        // `{ error }`를 돌려주는데, 예전엔 그걸 무시하고 "저장됨 ✓"까지 띄웠다 — 화면은 저장됐다고
        // 하는데 서버엔 아무것도 안 들어간 상태다(‹로 나갈 때 handlePostitBack이 그제서야 alert한다).
        // 자동저장에서 alert을 띄우면 타이핑을 끊으므로, **거짓말만 멈춘다**: 상태를 idle로 되돌리고
        // 로컬 상태도 건드리지 않는다(scheduleProjectAutosave가 이미 쓰던 처리와 같다).
        const result = await updateMemo(id, { title, content, content_format: format });
        if (result && "error" in result) { setAutosaveStatus("idle"); return; }
        const trimmedTitle = title.trim();
        patchLocalMemo(id, { content, content_format: format, ...(trimmedTitle ? { title: trimmedTitle, is_auto_title: false } : {}) });
        setAutosaveStatus("saved");
        setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        // 세션 만료·네트워크 실패로 throw되면 예전엔 "저장 중..."이 영원히 붙어 있었다(unhandled rejection).
        console.error("[memo] 자동저장 실패", e);
        setAutosaveStatus("idle");
      }
    }, 1000);
  }
  // 포스트잇 수정(Quick/Detail Edit) 전용 — 우측 상단 눈에 잘 띄는 위치에 크게 배치한다.
  // .big-postit는 position:relative라 absolute 자식이 정확히 그 박스 기준으로 붙는다.
  const autosaveStatusCorner =
    autosaveStatus === "saving" ? <span className="autosave-status autosave-status-corner">저장 중...</span>
    : autosaveStatus === "saved" ? <span className="autosave-status autosave-status-corner saved">저장됨 ✓</span>
    : null;
  // 자동저장 표시는 어디서나 같은 디자인(우측 상단 pill)을 쓴다 — corner 하나로 통일했다.
  const autosaveStatusNode = autosaveStatusCorner;

  // AI Smart Direction — Today's Focus (기획안 8.2·8.5절)
  const [focusMeta, setFocusMeta] = useState(focusView);
  const [focusDisplay, setFocusDisplay] = useState<{ id: string; result: FocusResult; savedMemoId: string | null } | null>(
    focusView?.current && focusView.currentId ? { id: focusView.currentId, result: focusView.current, savedMemoId: focusView.savedMemoId } : null
  );
  // 위 useState는 마운트 시 최초 1회만 focusView를 읽는다 — 자정이 지나 서버가 새 focusView(오늘 것 없음)를
  // 내려줘도 이 state는 그대로 남아 어제 결과가 계속 보이는 버그가 있었다. router.refresh()/재접속으로
  // focusView prop이 실제로 바뀔 때마다 다시 동기화한다.
  useEffect(() => {
    setFocusMeta(focusView);
    setFocusDisplay(focusView?.current && focusView.currentId ? { id: focusView.currentId, result: focusView.current, savedMemoId: focusView.savedMemoId } : null);
  }, [focusView]);
  const [focusGenerating, setFocusGenerating] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [focusHistoryOpen, setFocusHistoryOpen] = useState(false);

  async function runFocus() {
    if (focusGenerating) return;
    setFocusGenerating(true);
    setFocusError(null);
    // 서버 액션이 throw하면(외부 API 404 등) 아래 setFocusGenerating(false)를 건너뛰어
    // 생성 중 화면에 영원히 갇히고 버튼도 죽는다 — 저장 핸들러들과 같이 finally로 반드시 푼다.
    try {
      // 로딩 애니메이션이 순간적으로 스쳐 지나가지 않도록 최소 5초는 보여준다 (실제 요청과 동시에 대기)
      const [res] = await Promise.all([runFocusAction(), new Promise((r) => setTimeout(r, 5000))]);
      if ("error" in res) { setFocusError(res.error); return; }
      setFocusMeta(res.view);
      if (res.view.current && res.view.currentId) {
        setFocusDisplay({ id: res.view.currentId, result: res.view.current, savedMemoId: res.view.savedMemoId });
      }
    } catch {
      setFocusError("생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setFocusGenerating(false);
    }
  }
  async function viewFocusVersion(version: number) {
    const res = await getAiResultVersion("focus", version);
    setFocusDisplay({ id: res.id, result: res.result as FocusResult, savedMemoId: res.savedMemoId });
  }
  async function openFocusMemo(memoId: string, endDate: string) {
    const [y, m, d] = endDate.split("-").map(Number);
    setViewYear(y);
    setViewMonth0(m - 1);
    setMemoDialogDay(d);
    const monthMemos = await getMemosForMonthAction(y, m - 1);
    setViewMemos(monthMemos);
    const target = monthMemos.find((mm) => mm.id === memoId);
    if (target) {
      close(dialogs.focus);
      // TODAY와 같은 경로다 — 모바일에서는 껍데기를 열지 않는다(openPostitFromDashboard 주석).
      openPostitFromDashboard(target);
    }
  }

  // AI Smart Direction — Idea Build (기획안 8.3·8.5.2절)
  function ideaDisplayFrom(view: IdeaView | null) {
    return view?.current && view.currentId && isIdeaResult(view.current)
      ? { id: view.currentId, result: view.current, savedMemoId: view.savedMemoId }
      : null;
  }
  const [ideaMeta, setIdeaMeta] = useState(ideaView);
  // 관리자는 하루 상한을 받지 않는다 — 서버(actions/ai.ts:50)는 이미 그렇게 동작하는데
  // 버튼 disabled가 isAdmin을 안 봐서 "서버는 허용, 화면은 잠김" 상태였다(2회에서 막힌 원인).
  const ideaExhausted = !isAdmin && (ideaMeta?.usedCount ?? 0) >= (ideaMeta?.maxCount ?? IDEA_MAX);
  const [ideaDisplay, setIdeaDisplay] = useState(ideaDisplayFrom(ideaView));
  // focusView와 같은 문제 — 자정 지나 서버가 새 ideaView(usedCount 0, current 없음)를 내려줘도
  // 마운트 시 1회만 읽은 이 state는 안 바뀌어서 어제 결과/횟수가 그대로 남아있었다.
  useEffect(() => {
    setIdeaMeta(ideaView);
    setIdeaDisplay(ideaDisplayFrom(ideaView));
  }, [ideaView]);
  const [ideaGenerating, setIdeaGenerating] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [ideaHistoryOpen, setIdeaHistoryOpen] = useState(false);
  // 어떤 프로젝트 아이디어를 확장할지 — 직접 선택 / 랜덤(매번 새로 뽑음).
  // null = 아직 아무것도 선택 안 함 — 기본값을 "random"으로 두면 아무 버튼도 안 누르고 Idea ON을
  // 눌러도 조용히 랜덤으로 생성돼버리는 문제가 있어(runIdea에서 null이면 선택을 강제한다).
  const [ideaGenMode, setIdeaGenMode] = useState<IdeaGenerationMode | null>(null);
  const [ideaSourcePickerOpen, setIdeaSourcePickerOpen] = useState(false);
  const [ideaSourceSearch, setIdeaSourceSearch] = useState("");
  // 랜덤은 기본값이라 이미 선택된 채로 열리는 경우가 많다 — 그 상태에서 다시 눌러도 색이 그대로라
  // "눌렀다"는 게 안 보이는 문제가 있다. 눌렀을 때 진한 보라로 바뀌고, [재생성]을 눌러 실제로
  // 생성이 시작되기 전까지는(runIdea에서 해제) 그 색을 유지한다.
  const [ideaRandomPulse, setIdeaRandomPulse] = useState(false);
  // random 생성이 실패했을 때 어떤 프로젝트를 시도했는지 기억해둔다 — 재시도는 이 프로젝트로만 하고
  // 매번 새로 뽑지 않는다. 성공하거나 사용자가 직접 모드를 바꾸면 비운다.
  const [ideaRetryPinnedId, setIdeaRetryPinnedId] = useState<string | null>(null);
  // 완료 프로젝트는 Idea Build 대상에서 제외한다(기획안 2절) — 직접 선택 목록에도 노출하지 않는다
  const ideaPickableProjects = (projectIdeas ?? []).filter((p) => p.status !== "완료");
  const ideaSourceProject = ideaGenMode && ideaGenMode.kind === "specific" ? ideaPickableProjects.find((p) => p.id === ideaGenMode.projectId) : null;
  const ideaModeSelector = (
    <div className="idea-mode-row">
      <button
        type="button" className={`idea-mode-chip idea-mode-chip-project ${ideaGenMode?.kind === "specific" ? "active" : ""}`}
        onClick={() => { setIdeaRandomPulse(false); setIdeaRetryPinnedId(null); setIdeaSourcePickerOpen(true); }}
      >
        <CircleCheck size={17} strokeWidth={2.4} />
        {/* 선택한 프로젝트명을 버튼 라벨로 덮어쓰면 이게 무슨 버튼인지 알 수 없어진다 —
            라벨은 항상 "프로젝트 선택"으로 두고, 무엇이 선택됐는지는 아래 카드로 보여준다 */}
        프로젝트 선택
      </button>
      <button
        type="button" className={`idea-mode-chip idea-mode-chip-random ${ideaGenMode?.kind === "random" ? "active" : ""} ${ideaRandomPulse ? "pulse" : ""}`}
        onClick={() => {
          setIdeaGenMode({ kind: "random" });
          setIdeaRandomPulse(true);
          setIdeaRetryPinnedId(null);
        }}
      >
        <Dices size={17} strokeWidth={2.4} />
        랜덤
      </button>
      {/* 직접 선택한 프로젝트가 있을 때만 보여주는 상태 표시 — 랜덤 결과는 여기 표시하지 않는다 */}
      {ideaSourceProject && (
        <div className="idea-selected-project-chip" title={ideaSourceProject.title} aria-label={`선택된 프로젝트: ${ideaSourceProject.title}`}>
          <CircleCheck size={15} strokeWidth={2.4} className="idea-selected-project-chip__check" aria-hidden="true" />
          <span className="idea-selected-project-chip__name">{ideaSourceProject.title}</span>
        </div>
      )}
    </div>
  );
  // 초기 화면 — "프로젝트를 고른다"는 단계를 하나로 묶고, 실행 CTA(Idea ON)와 시각적으로 분리한다(수정지침 3.2절)
  const ideaPickerBlock = (
    <div className="idea-pick-step">
      {/* 이모지 대신 lucide 아이콘 — currentColor라 라벨과 같은 보라색으로 자동 일치한다 */}
      <div className="idea-step-label">
        <ScanSearch size={19} strokeWidth={2.3} className="idea-step-label-icon" aria-hidden="true" />
        분석할 프로젝트
      </div>
      {ideaModeSelector}
      {ideaSourceProject ? (
        <div className="idea-selected-card">
          <div className="idea-selected-head">
            <span className="idea-selected-title">{ideaSourceProject.title}</span>
            <ProjectStatusBadge status={ideaSourceProject.status} />
          </div>
          {ideaSourceProject.summary && <p className="idea-selected-summary">{ideaSourceProject.summary}</p>}
        </div>
      ) : (
        <div className="idea-selected-card empty">
          {ideaGenMode?.kind === "random" ? "랜덤으로 프로젝트 하나를 골라 분석합니다." : "프로젝트 선택 또는 랜덤 버튼을 눌러주세요."}
        </div>
      )}
    </div>
  );
  // .idea-source-picker-anchor / .idea-picker-back도 모바일 규칙만 있고 마크업엔 안 붙어 있었다 —
  // 데스크톱 규칙은 없으니(전부 max-width:720px 안) 기존 클래스를 유지한 채 덧붙이면 웹은 그대로다.
  const ideaSourcePickerNode = ideaSourcePickerOpen && (
    <div
      // 목록이 비면 바텀시트 모양이 안 맞는다 — 아래 idea-picker-empty가 가운데 카드로 되돌린다.
      className={`postit-overlay fixed-overlay idea-source-picker-anchor open${ideaPickableProjects.length === 0 ? " idea-picker-empty" : ""}`}
      onClick={() => setIdeaSourcePickerOpen(false)}
    >
      <div className="panel copy-picker idea-source-picker" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="idea-picker-back" aria-label="뒤로가기" onClick={() => setIdeaSourcePickerOpen(false)}>‹</button>
        <button className="close-btn" onClick={() => setIdeaSourcePickerOpen(false)}>✕</button>
        <div className="copy-picker-head">
          <div className="copy-picker-title">어떤 프로젝트를 확장할까요?</div>
          <input
            className="proj-search copy-picker-search" placeholder="프로젝트 검색"
            value={ideaSourceSearch} onChange={(e) => setIdeaSourceSearch(e.target.value)}
          />
        </div>
        {ideaPickableProjects.length === 0 ? (
          <div className="hint">Idea Build를 사용할 프로젝트가 없습니다.</div>
        ) : (
          <div className="proj-table">
            <div className="proj-table-row proj-table-head project-table-header">
              <span className="proj-col-name">프로젝트명</span>
              <span className="proj-col-summary">한 줄 요약</span>
              <span className="proj-col-status">상태</span>
              <span className="proj-col-updated">최근 수정</span>
            </div>
            {ideaPickableProjects
              .filter((p) => p.title.toLowerCase().includes(ideaSourceSearch.trim().toLowerCase()))
              .map((p) => (
              <button
                type="button" key={p.id} className="proj-table-row project-list-row"
                onClick={() => { setIdeaGenMode({ kind: "specific", projectId: p.id }); setIdeaRandomPulse(false); setIdeaRetryPinnedId(null); setIdeaSourcePickerOpen(false); }}
              >
                <span className="proj-col-name project-list-title">{p.title}</span>
                <span className="proj-col-summary project-list-summary">{p.summary}</span>
                <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, today.year)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  async function viewIdeaVersion(version: number) {
    const res = await getAiResultVersion("idea", version);
    if (!isIdeaResult(res.result)) return;
    setIdeaDisplay({ id: res.id, result: res.result, savedMemoId: res.savedMemoId });
  }

  async function runIdea() {
    if (ideaGenerating) return;
    if (!ideaGenMode) {
      setConfirmDialog({
        message: "진행할 프로젝트를 선택하거나 '랜덤' 버튼을 먼저 눌러주세요.",
        confirmLabel: "확인", hideCancel: true, onConfirm: () => {},
      });
      return;
    }
    setIdeaGenerating(true);
    setIdeaError(null);
    setIdeaRandomPulse(false);
    // random 모드에서 이전 실패로 프로젝트가 고정돼 있으면 그 프로젝트로만 재시도한다 — 다시 뽑지 않는다.
    const effectiveMode: IdeaGenerationMode =
      ideaGenMode.kind === "random" && ideaRetryPinnedId
        ? { kind: "random", pinnedProjectId: ideaRetryPinnedId }
        : ideaGenMode;
    // 서버 액션은 실패해도 throw하지 않고 {error, projectId?}를 돌려준다 — 그래도 예상 밖의 네트워크
    // 오류 등에 대비해 catch는 남겨둔다(runFocus와 동일한 이중 방어).
    try {
      // 로딩 애니메이션이 순간적으로 스쳐 지나가지 않도록 최소 5초는 보여준다 (실제 요청과 동시에 대기)
      const [res] = await Promise.all([runIdeaAction(effectiveMode), new Promise((r) => setTimeout(r, 5000))]);
      if ("error" in res) {
        setIdeaError(res.error);
        if (ideaGenMode.kind === "random" && res.projectId) setIdeaRetryPinnedId(res.projectId);
        return;
      }
      setIdeaRetryPinnedId(null);
      // 생성이 끝나면 선택을 비운다 — [재생성]은 이전 선택을 그대로 재사용해 조용히 또 생성해버렸다.
      // 이제 다시 프로젝트/랜덤을 고르지 않으면 위 guard의 알림 팝업이 뜬다.
      setIdeaGenMode(null);
      setIdeaMeta(res.view);
      if (res.view.current && res.view.currentId) {
        setIdeaDisplay({ id: res.view.currentId, result: res.view.current, savedMemoId: res.view.savedMemoId });
      }
    } catch {
      setIdeaError("생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIdeaGenerating(false);
    }
  }
  // 아이디어 빌드 결과를 프로젝트로 저장
  const [ideaSaveToast, setIdeaSaveToast] = useState(false);
  async function saveIdeaTitleAsProject() {
    if (!ideaDisplay) return;
    const result = await saveProjectIdea(null, { title: ideaDisplay.result.recommendationTitle, status: PROJECT_STATUSES[0], summary: "", content_md: "" });
    if (result.error) { alert(result.error); return; }
    setIdeaSaveToast(true);
    setTimeout(() => setIdeaSaveToast(false), 1500);
  }
  const [pendingTitleOnlySave, setPendingTitleOnlySave] = useState(false);
  async function confirmSaveIdeaTitleAsProject() {
    setPendingTitleOnlySave(false);
    await saveIdeaTitleAsProject();
  }
  // 내용 저장은 어느 프로젝트에 저장할지 고를 수 있어야 한다 — 새 프로젝트 생성 또는 기존 프로젝트에 이어붙이기
  const [ideaProjectPicker, setIdeaProjectPicker] = useState(false);
  const [ideaSaveSearch, setIdeaSaveSearch] = useState("");
  const [pendingIdeaSave, setPendingIdeaSave] = useState<{ projectId: string | null; label: string } | null>(null);
  async function confirmPendingIdeaSave() {
    if (!pendingIdeaSave || !ideaDisplay) return;
    const { projectId } = pendingIdeaSave;
    setPendingIdeaSave(null);
    setIdeaProjectPicker(false);
    const existing = projectId ? (projectIdeas ?? []).find((p) => p.id === projectId) : null;
    // ideaResultToText()는 개행만 있는 순문 텍스트다 — 기존 rich HTML 뒤에 이어붙이려면 memo의 saveBlockToMemo와
    // 동일하게 HTML 블록으로 변환해야 한다(그대로 concat하면 태그 이스케이프/개행 손실이 생긴다)
    const ideaTextHtml = plainTextToHtml(ideaResultToText(ideaDisplay.result));
    const input = existing
      ? { title: existing.title, status: existing.status, summary: existing.summary ?? "", content_md: existing.content_md ? `${toEditableHtml(existing.content_md, existing.content_format)}${ideaTextHtml}` : ideaTextHtml }
      : { title: "프로젝트명", status: PROJECT_STATUSES[0], summary: "", content_md: ideaTextHtml };
    const result = await saveProjectIdea(existing?.id ?? null, input);
    if (result.error) { alert(result.error); return; }
    setIdeaSaveToast(true);
    setTimeout(() => setIdeaSaveToast(false), 1500);
  }

  // 뉴스/채용공고/AI Trend Briefing 문장 드래그 선택 → 원형 메뉴 → 복사 또는 날짜 선택 → 메모장에 복사 (6.2절)
  type SelSource = { type: SourceType; title: string; url: string };
  // 드래그한 문장 하나(selection) 또는 기사/공고/트렌드 항목 전체(fullNews·fullJob·fullTrend) — 메모 피커·저장 확인
  // 팝업은 넷 다 공유하고, 실제 저장 액션만 mode에 따라 분기한다
  type MemoPickerContent =
    | { mode: "selection"; source: SelSource; text: string }
    | { mode: "fullNews"; sourceTitle: string; sourceUrl: string; summary: string; reason: string; tags: string[] }
    | { mode: "fullJob"; title: string; company: string; sourceSite: string; career: string; deadline: string; sourceUrl: string; categories: { label: string; groups: JobTextGroup[] }[] }
    | { mode: "fullTrend"; label: string; title: string | null; body: string; bullets: string[] | null; source: string | null; url: string | null };
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string; source: SelSource } | null>(null);
  const [memoPicker, setMemoPicker] = useState<{ date: string; content: MemoPickerContent; memos: Memo[] } | null>(null);
  const [pendingSave, setPendingSave] = useState<{ memoId: string | null; label: string } | null>(null);
  // 기존 메모에 붙일 때는 자동 삽입하지 않고, 편집창을 열어 이 내용을 보여준 뒤 사용자가 원하는 위치에 직접 넣게 한다 (6~10절)
  // html은 전체저장(뉴스/채용공고/AI Trend)에서만 채운다 — 리치 에디터엔 이걸 넣어야 <h3> 헤딩이
  // 살아서 "새 메모 생성"과 같은 제목 크기로 들어간다(평문만 넣으면 헤딩이 본문 크기로 죽었다).
  // text는 미리보기 배너·memo_source 기록·plain textarea 경로용 평문이라 그대로 둔다.
  const [pendingInsert, setPendingInsert] = useState<{ text: string; html?: string; source: SelSource } | null>(null);
  const bigEditorHandleRef = useRef<MemoRichEditorHandle>(null);
  // "확장"(bodyEditor)으로 넘어가면 bigEditorNode 쪽 JSX가 activeDialogKey 조건에서 빠져 언마운트되고
  // bigEditorHandleRef도 함께 사라진다 — bodyEditor 자신의 에디터 인스턴스를 가리키는 별도 ref가 필요하다.
  const bodyEditorHandleRef = useRef<MemoRichEditorHandle>(null);
  // Quick Editor(bigEditorNode)에 두었던 caret을 확장(bodyEditor)의 새 에디터 인스턴스에 그대로 복구하기 위한 값
  const pendingCursorPosRef = useRef<{ from: number; to: number } | null>(null);
  const selectionContextRef = useRef<{ source: SelSource; element: HTMLDivElement } | null>(null);

  // <dialog>가 showModal()로 열리면 브라우저 top layer에 올라가서, 그 바깥의 fixed 요소는
  // z-index와 무관하게 항상 다이얼로그 밑에 깔린다 — 그래서 선택 메뉴는 같은 dialog 안에,
  // dialog 기준 좌표(absolute)로 넣어야 하고, 여기서도 dialog 기준으로 좌표를 계산한다.
  function cacheCurrentSelection(source: SelSource, selectableEl: HTMLDivElement): boolean {
    const dialogEl = selectableEl.closest("dialog");
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !sel || sel.rangeCount === 0 || !dialogEl) return false;
    const range = sel.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    if (!selectableEl.contains(commonNode.nodeType === Node.TEXT_NODE ? commonNode.parentNode : commonNode)) return false;
    // 드래그가 "끝나는" 지점 = 마지막 줄의 오른쪽 아래 — 여러 줄 선택이어도 마지막 클라이언트 rect를 쓴다
    const rects = range.getClientRects();
    const endRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
    const dialogRect = dialogEl.getBoundingClientRect();
    const top = Math.min(Math.max(56, endRect.bottom - dialogRect.top + 8), dialogRect.height - 96);
    const left = Math.min(Math.max(70, endRect.right - dialogRect.left), dialogRect.width - 64);
    // 버튼을 누르는 순간 브라우저 selection이 사라져도 이 캐시를 복사·저장에 계속 사용한다.
    setSelectionMenu({ x: left, y: top, text, source });
    return true;
  }
  function detectSelection(source: SelSource, selectableEl: HTMLDivElement, delay = 0) {
    window.setTimeout(() => {
      cacheCurrentSelection(source, selectableEl);
    }, delay);
  }
  // 마우스는 onMouseUp으로 충분하지만, iOS/Android의 길게 누르기 선택은 mouseup이 없거나
  // Selection 반영이 늦을 수 있어 pointer/touch 이벤트와 selectionchange 리스너(아래)로 보강한다.
  function selectableHandlers(source: SelSource) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        selectionContextRef.current = { source, element: e.currentTarget };
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget, e.pointerType === "mouse" ? 0 : 100),
      onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget),
      onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget, 180),
    };
  }
  // 모바일 네이티브 선택 핸들(파란 물방울)로 범위를 조정할 때는 pointerup/touchend가 안 뜨는 경우가 있어
  // selectionchange로 한 번 더 잡는다 — 데스크톱에서는 mobile.matches가 false라 아무 영향 없다.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    let timer: number | null = null;
    function onSelectionChange() {
      if (!mobile.matches || !selectionContextRef.current) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const context = selectionContextRef.current;
        if (context) cacheCurrentSelection(context.source, context.element);
      }, 80);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (timer !== null) window.clearTimeout(timer);
    };
    // ★ 의존성 배열 []가 반드시 있어야 한다. 없으면(예전 상태) 매 렌더마다 이 이펙트가 다시 돌면서
    //   cleanup이 clearTimeout(timer)를 호출한다 — 그런데 cacheCurrentSelection이 setSelectionMenu를
    //   부르므로 렌더가 일어나고, 그 렌더의 cleanup이 다음 80ms 디바운스를 죽인다. 스스로를 취소하는
    //   구조라 모바일 네이티브 선택 핸들로 범위를 조정하면 마지막 조정이 조용히 사라졌다.
    //   (timer도 렌더마다 null로 초기화돼 디바운스 상태 자체를 잃었다.)
    //   []로 고정해도 안전하다 — 이 클로저가 읽는 것은 selectionContextRef(ref)와
    //   setSelectionMenu(안정적)뿐이고, cacheCurrentSelection은 컴포넌트 state를 읽지 않는다
    //   (파라미터 + DOM API + setSelectionMenu 뿐이다). 그래서 첫 렌더의 클로저를 잡아도 stale이 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function copySelectionText(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* 클립보드 권한 없으면 무시 */ }
  }
  async function openMemoPickerForDate(date: string, source: SelSource, text: string) {
    setSelectionMenu(null);
    const memos = await getMemosForDateAction(date);
    setMemoPicker({ date, content: { mode: "selection", source, text }, memos });
  }
  // "전체 저장" — 뉴스/채용공고 카드에서 문장을 고르지 않고 바로 통째로 메모에 저장한다. 오늘 날짜 기준.
  async function openFullSavePicker(content: MemoPickerContent) {
    const memos = await getMemosForDateAction(todayIso);
    setMemoPicker({ date: todayIso, content, memos });
  }
  function openFullNewsPicker(n: SelectedNewsItem) {
    openFullSavePicker({
      mode: "fullNews", sourceTitle: n.title, sourceUrl: n.url,
      summary: n.summary, reason: n.reason_selected, tags: n.related_concepts,
    });
  }
  function openFullJobPicker(j: SavedJobRow, techTags: string[]) {
    openFullSavePicker({
      mode: "fullJob", title: j.title, company: j.company, sourceSite: j.source_site ?? "",
      career: j.career_requirement ?? "경력 무관", deadline: j.deadline ?? "상시", sourceUrl: j.url,
      categories: [
        { label: `📋 주요 업무${techTags.length ? ` · ${techTags.join(", ")}` : ""}`, groups: j.responsibilities ? parseJobTextSections(j.responsibilities) : [] },
        { label: "🎯 자격요건", groups: j.required_text ? parseJobTextSections(j.required_text) : [] },
        { label: "⭐ 우대사항", groups: j.preferred_text ? parseJobTextSections(j.preferred_text) : [] },
      ],
    });
  }
  function openFullTrendPicker(content: Extract<MemoPickerContent, { mode: "fullTrend" }>) {
    openFullSavePicker(content);
  }
  // 전체 저장도 드래그 선택 흐름과 같이 "날짜를 고른 뒤 새 메모/기존 메모"를 정할 수 있어야 한다는
  // 요청 — 기존엔 오늘 날짜로 고정이었다. 날짜를 바꾸면 그 날짜의 메모 목록을 다시 불러온다.
  async function changeMemoPickerDate(iso: string) {
    const memos = await getMemosForDateAction(iso);
    setMemoPicker((cur) => (cur ? { ...cur, date: iso, memos } : cur));
  }
  // 전체 저장(fullNews/fullJob/fullTrend)을 "현재 커서 위치에 삽입" 흐름에 태우기 위한 순수 텍스트 변환 —
  // 서버가 만드는 것과 같은 HTML block을 그대로 만들고 태그만 걷어낸다(서식은 잃지만 구조는 줄바꿈으로 남는다)
  function fullSaveToSourceAndText(content: Extract<MemoPickerContent, { mode: "fullNews" | "fullJob" | "fullTrend" }>): { source: SelSource; text: string; html: string } {
    if (content.mode === "fullNews") {
      const html = newsFullBlockHtml(content.sourceTitle, content.sourceUrl, content.summary, content.reason, content.tags);
      return { source: { type: "news", title: content.sourceTitle, url: content.sourceUrl }, text: htmlToPlainText(html), html };
    }
    if (content.mode === "fullJob") {
      const html = jobFullBlockHtml(content.title, content.company, content.sourceSite, content.career, content.deadline, content.sourceUrl, content.categories);
      return { source: { type: "job", title: `${content.company} / ${content.title}`, url: content.sourceUrl }, text: htmlToPlainText(html), html };
    }
    const html = trendFullBlockHtml(content.label, content.title, content.body, content.bullets, content.source, content.url);
    return { source: { type: "ai_smart_direction", title: content.title ?? content.label, url: content.url ?? "" }, text: htmlToPlainText(html), html };
  }
  // 3-2절 — 실제 저장 전에 한 번 확인. 신규 메모는 바로 채워 생성하고, 기존 메모는 편집창을 열어
  // 사용자가 직접 위치를 골라 "현재 커서 위치에 삽입"으로 넣게 한다 — 드래그한 문장이든 기사/공고
  // 전체든 기존 메모에 붙일 때는 항상 이 방식으로 통일한다.
  async function confirmPendingSave() {
    if (!pendingSave || !memoPicker) return;
    const { memoId } = pendingSave;
    const { date, content } = memoPicker;
    setPendingSave(null);
    setMemoPicker(null);

    // 드래그 선택은 문장 하나라 평문 그대로, 전체저장은 헤딩이 살아야 하므로 html까지 함께 넘긴다.
    const resolved = content.mode === "selection"
      ? { source: content.source, text: content.text, html: undefined as string | undefined }
      : fullSaveToSourceAndText(content);
    const { source, text, html } = resolved;

    if (memoId) {
      const freshMemos = await getMemosForDateAction(date);
      const target = freshMemos.find((mm) => mm.id === memoId);
      if (target) {
        openBigEditor(target);
        setPendingInsert({ text, html, source });
      }
      return;
    }

    if (content.mode === "selection") {
      const result = await copySelectionToMemoAction({
        date, memoId: null, sourceType: source.type, sourceTitle: source.title, sourceUrl: source.url, selectedText: text,
        color: defaultMemoColor(theme),
      });
      if ("error" in result) { alert(result.error); return; }
      await refreshAfterMemoChange();
      return;
    }

    const result = content.mode === "fullNews"
      ? await copyFullNewsToMemoAction({
          date, memoId: null, sourceTitle: content.sourceTitle, sourceUrl: content.sourceUrl,
          summary: content.summary, reason: content.reason, tags: content.tags,
          color: defaultMemoColor(theme),
        })
      : content.mode === "fullJob"
      ? await copyFullJobToMemoAction({
          date, memoId: null, title: content.title, company: content.company, sourceSite: content.sourceSite,
          career: content.career, deadline: content.deadline, sourceUrl: content.sourceUrl, categories: content.categories,
          color: defaultMemoColor(theme),
        })
      : await copyFullTrendToMemoAction({
          date, memoId: null, label: content.label, title: content.title,
          body: content.body, bullets: content.bullets, source: content.source, url: content.url,
          color: defaultMemoColor(theme),
        });
    if ("error" in result) { alert(result.error); return; }
    await refreshAfterMemoChange();
  }
  // 편집창 상단 액션 줄(실행취소 / 다시실행 / 중요·고정 / 더보기).
  // 🔴 예전엔 이 블록이 포스트잇 상세 편집에만 있었다 — 그래서 뉴스·채용공고·AI Trend에서
  // "메모로 복사"로 열리는 bigEditorNode는 상단이 통째로 비어 실행취소조차 못 했다.
  // 두 곳이 같은 폼 state(formImportant/formPinned/editingMemoId)를 공유하고 에디터 handle만
  // 다르므로, 40줄을 복제하지 않고 handle만 인자로 받는다.
  function memoHeadActions(editorRef: React.RefObject<MemoRichEditorHandle | null>) {
    return (
        <div className="mobile-editor-head-actions mobile-postit-head-actions">
        {/* onPointerDown에서 기본동작을 막아 **에디터 포커스를 빼앗지 않는다** - 이게 없으면 버튼을
            탭하는 순간 본문이 blur되고, blur된 뒤의 프로그래매틱 focus는 모바일에서 실패할 수 있다.
            에디터 툴바의 표준 패턴이고, 버튼 자체의 click은 그대로 발생한다.
            undo/redo는 성공 여부를 돌려주므로 실패를 콘솔에 남긴다 - 침묵 지점을 만들지 않는다. */}
          <button type="button" aria-label="실행 취소" {...KEEP_EDITOR_FOCUS}
            onClick={() => { if (editorRef.current?.undo() === false) console.warn("[memo] 실행 취소할 내용이 없다(또는 에디터 미마운트)"); }}><Undo2 size={18} strokeWidth={2} /></button>
          <button type="button" aria-label="다시 실행" {...KEEP_EDITOR_FOCUS}
            onClick={() => { if (editorRef.current?.redo() === false) console.warn("[memo] 다시 실행할 내용이 없다(또는 에디터 미마운트)"); }}><Redo2 size={18} strokeWidth={2} /></button>
          {/* 웹은 별표(★)와 압정(📌)이 따로 있는데 모바일은 버튼이 하나뿐이라, 예전엔 "고정 해제"만 되고
              고정을 걸 수가 없었다. ☆ → ★(중요) → 📌(고정) → ☆ 로 한 바퀴 돌려 웹과 같은 기능을 낸다. */}
          <button type="button" className={`mobile-important-btn ${formImportant || formPinned ? "active" : ""}`} aria-label={formPinned ? "고정 메모" : formImportant ? "중요 메모" : "중요 표시 안 함"} onClick={() => {
            if (formPinned) {
              if (editingMemoId) void handleTogglePin(editingMemoId, true); // 고정 해제
              setFormPinned(false);
              setFormImportant(false);
            } else if (formImportant) {
              if (editingMemoId) void handleTogglePin(editingMemoId, false); // 고정
              setFormPinned(true);
            } else {
              setFormImportant(true);
            }
          }}>{formPinned ? "📌" : formImportant ? "★" : "☆"}</button>
          <button type="button" className="mobile-more-btn" aria-label="메모 더보기" onClick={() => setMobileMemoMenuOpen(true)}>⋮</button>
        </div>
    );
  }
  // 지금 화면에 실제로 떠 있는 메모 본문 에디터의 handle. 위에 뜬 것부터 고른다 —
  // 확장(bodyEditor)은 다른 편집창 위에 겹쳐 열리므로 항상 최우선이다.
  // ref.current 존재까지 확인하므로 "열렸다고 표시된 state는 있는데 아직 마운트 전"인 순간도 걸러진다.
  function activeMemoEditorRef(): MemoRichEditorHandle | null {
    const ordered = [
      activeDialogKey === "bodyEditor" ? bodyEditorHandleRef : null,
      bigEditorOpen ? bigEditorHandleRef : null,
      postitEditMode === "detail" ? detailEditorRef : null,
      memoFormOpen ? compactEditorRef : null,
    ];
    for (const r of ordered) if (r?.current) return r.current;
    return null;
  }
  // 9~10절 — "현재 커서 위치에 삽입": textarea의 실제 캐럿 위치에 선택한 문장만 그대로 넣는다.
  // (예전엔 "---\n\n## 뉴스에서 추가\n출처...\n원문..." 헤딩 블록을 같이 붙였는데, 그건 빼고 순수 텍스트만.)
  // 출처 정보는 화면에 안 넣는 대신 memo_source 테이블에 별도로 기록한다.
  // 🔴 `where`: "cursor"는 사용자가 캐럿을 놓은 자리, "start"/"end"는 **캐럿을 안 쓴다.**
  //   캐럿 경로는 넣을 자리까지 스크롤한 뒤 버튼을 눌러야 하는데, iOS는 키보드가 올라오면
  //   레이아웃 뷰포트를 보이는 밴드 위로 밀어서(vvTop) 상단 고정 UI가 안 보일 수 있다.
  //   맨 위/맨 아래는 **진입 직후 스크롤 0·키보드 닫힌 상태**에서 누르면 되므로 그 문제가
  //   구조적으로 발생하지 않는다. 위치 싸움을 이기는 게 아니라 피하는 경로다.
  async function insertPendingAtCursor(where: "cursor" | "start" | "end" = "cursor") {
    if (!pendingInsert || !editingMemoId) return;
    if (formContentMode === "document") {
      // 🔴 예전엔 후보가 bodyEditor/bigEditor 둘뿐이었다. 그런데 메모 본문 에디터는 네 곳에 있고
      // (포스트잇 상세 detailEditorRef / Monthly MEMO compactEditorRef / "메모로 복사" bigEditorHandleRef /
      //  확장 bodyEditorHandleRef), 후보에 없는 창이 떠 있으면 target.current가 null이라 `?.`에서
      // **조용히 아무 일도 일어나지 않았다** — 버튼을 눌러도 반응 없던 침묵 지점이다.
      const target = activeMemoEditorRef();
      if (!target) {
        // 침묵하지 말 것(채용공고 5라운드 교훈). 어느 창이 떠 있는지까지 남겨 다음 진단을 짧게 만든다.
        console.error("[memo] 삽입 대상 에디터를 못 찾았다", { activeDialogKey, bigEditorOpen, postitEditMode, memoFormOpen });
        alert("편집창을 찾지 못해 삽입하지 못했습니다. 메모 편집창이 열려 있는지 확인해주세요.");
        return;
      }
      // 전체저장은 html을 넘겨 <h3> 제목 크기를 새 메모 생성 경로와 동일하게 유지한다.
      // 드래그 선택은 평문이므로 isHtml=false로 넘긴다 — 문자열을 그대로 주면 Tiptap이 HTML로
      // 파싱해서 개행이 사라지고 '<'가 태그로 먹힌다(MemoRichEditor.insertTextAtCursor 주석).
      // 실패하면 UI를 닫지 않는다 — 닫아버리면 "눌렀는데 아무것도 안 들어갔고 문장도 사라졌다"가 된다.
      const rawPayload = pendingInsert.html ?? pendingInsert.text;
      const asHtml = !!pendingInsert.html;
      // 🔴 "맨 아래"는 기존 내용과 **빈 줄 한 칸**을 두고 붙는다(사용자 요청 2026-08-30).
      // `insertAt("end")`의 캐럿은 마지막 문단 **안쪽 끝**이라 그냥 넣으면 기존 마지막 글자에
      // 바로 이어 붙는다(평문 경로는 첫 줄 앞에 hardBreak를 안 넣는다 — MemoRichEditor.insertInto).
      // "맨 위"는 앞에 아무것도 없으니 그대로 두고, "커서 위치"는 사용자가 고른 자리를 존중한다.
      const payload = where === "end"
        ? (asHtml ? `<p></p>${rawPayload}` : `\n\n${rawPayload}`)
        : rawPayload;
      const done = where === "cursor"
        ? target.insertTextAtCursor(payload, asHtml)
        : target.insertAt(where, payload, asHtml);
      if (!done) {
        console.error("[memo] insertContent 실패", { isHtml: !!pendingInsert.html, len: pendingInsert.text.length });
        alert(where === "cursor"
          ? "삽입하지 못했습니다. 본문을 한 번 탭해 커서를 놓고 다시 시도해주세요."
          : "삽입하지 못했습니다. 다시 시도해주세요.");
        return;
      }
    } else {
      // 간단 메모는 caret 위치 API가 없는 plain textarea이므로 44절 그대로 plain text로 append한다
      const latest = readFormBody();
      const next = latest ? `${latest}\n${pendingInsert.text}` : pendingInsert.text;
      setFormBody(next);
      scheduleAutosave({ content: next });
    }
    // 🔴 setPendingInsert(null)을 recordMemoSource **뒤**에 둠 탕에 "다시 눌러야 된다"는 버그가 났다.
    // 출처 기록은 서버 액션이라 증복 사이 1~2상이 걸리는데(실제 실쿼), 그 동안 삽입 버튼이
    // 그대로 남아 사용자는 "안 눌렸다"고 보고 다시 눌렀다 - 그리고 그만큼 중복 삽입됐다.
    // 삽입은 이번 것으로 끝났으니 UI를 먼저 닫고, 출처 기록은 그 뒤에 따로 보낸다.
    // 기록이 실패해도 이미 들어간 본문을 되돌리지는 않는다(본문이 원본, 출처는 부가 정보다) - 사유만 남긴다.
    const src = pendingInsert.source;
    const insertedText = pendingInsert.text;
    const memoId = editingMemoId;
    setPendingInsert(null);
    try {
      await recordMemoSource(memoId, src.type, src.title, src.url, insertedText);
    } catch (e) {
      console.error("[memo] 출처 기록 실패(본문 삽입은 정상)", e);
    }
  }


  // 대시보드 미니 패널 — Monthly MEMO 카드는 미리보기 역할만 한다: 오늘이 속한 주간 + TODAY/NEXT
  const weekPreview = useMemo(() => {
    const base = new Date(today.year, today.month0, today.day);
    const dow = base.getDay();
    const monday = new Date(today.year, today.month0, today.day + (dow === 0 ? -6 : 1 - dow));
    const monthMemos = memosForMonthState ?? [];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const iso = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
      return {
        y: d.getFullYear(), m0: d.getMonth(), day: d.getDate(), dow: d.getDay(), iso,
        hasMemo: monthMemos.some((m) => m.start_date <= iso && m.end_date >= iso),
        isToday: iso === todayIso,
      };
    });
  }, [today.year, today.month0, today.day, memosForMonthState, todayIso]);

  function ddayLabel(endDate: string): string {
    const diff = Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000);
    return diff >= 0 ? `D-${diff}` : `D+${-diff}`;
  }
  const todayMemoItems = useMemo(
    () => (memosForMonthState ?? [])
      .filter((m) => m.start_date <= todayIso && m.end_date >= todayIso)
      .sort((a, b) => Number(b.is_important) - Number(a.is_important)),
    [memosForMonthState, todayIso]
  );
  const nextMemo = useMemo(() => {
    const upcoming = (memosForMonthState ?? [])
      .filter((m) => m.start_date > todayIso)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0] ?? null;
  }, [memosForMonthState, todayIso]);

  // AI Smart Direction 카드 하단의 통계 pill — 이번 달 메모 기준(달력과 같은 데이터 재사용)
  const incompleteTodoCount = (memosForMonthState ?? []).filter((m) => m.memo_type === "todo" && m.status !== "completed").length;
  const dueTodayCount = (memosForMonthState ?? []).filter(
    (m) => m.memo_type === "todo" && m.status !== "completed" && m.end_date === todayIso
  ).length;
  const projectIdeaCount = projectIdeas?.length ?? 0;
  const projectDevCount = (projectIdeas ?? []).filter((p) => p.status === "개발중").length;
  const projectDraftCount = (projectIdeas ?? []).filter((p) => p.status === "기획안작성").length;
  const projectIdeaOnlyCount = (projectIdeas ?? []).filter((p) => p.status === "아이디어").length;
  // 주간달력에서 날짜를 눌러 Monthly MEMO를 여는 경로. 예전엔 서버에서 그 달 메모를 다 받아온
  // "뒤에" 다이얼로그를 열었다 — 헤더(Monthly MEMO →)는 이미 들고 있는 목록으로 즉시 열리는데
  // 여기만 왕복을 기다려서 눈에 띄게 굼떴다("미세한 버퍼링"). 먼저 열고 목록은 뒤따라 채운다.
  // 주간달력이 가리키는 날짜는 거의 항상 이번 달이라, 그 경우 이미 맞는 목록을 들고 있어서
  // 화면이 비었다가 채워지는 일도 없다.
  const monthFetchRef = useRef(0);
  function openMemoModalAt(y: number, m0: number, day: number) {
    const alreadyLoaded = y === viewYear && m0 === viewMonth0;
    const cached = y === today.year && m0 === today.month0 ? memosForMonthState : null;
    setViewYear(y); setViewMonth0(m0); setMemoDialogDay(day);
    if (!alreadyLoaded) setViewMemos(cached ?? []);
    setMemoFormOpen(false);
    open(dialogs.memo);
    // 응답이 늦게 도착하는 사이에 사용자가 다른 달로 옮겨갔으면 그 결과로 덮어쓰면 안 된다.
    const token = ++monthFetchRef.current;
    void getMemosForMonthAction(y, m0)
      .then((memos) => { if (token === monthFetchRef.current) setViewMemos(memos); })
      .catch(() => { /* 실패해도 이미 열려 있는 화면은 그대로 둔다 */ });
  }

  // Monthly MEMO 상세 달력 — 이전/다음 달 이동 가능
  const memosByDay = useMemo(
    () => groupMemosByDay(viewMemos, viewYear, viewMonth0, lastDate),
    [viewMemos, viewYear, viewMonth0, lastDate]
  );
  const bigCalCells = useMemo(() => {
    const cells: { day: number | null; numClass: string; memos: Memo[]; overflow: number }[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, numClass: "", memos: [], overflow: 0 });
    for (let d = 1; d <= lastDate; d++) {
      const dayIndex = (firstWeekday + d - 1) % 7;
      let numClass = "";
      if (dayIndex === 0) numClass = "sunday";
      else if (dayIndex === 6) numClass = "saturday";
      const dayMemosForCell = memosByDay.get(d) ?? [];
      cells.push({ day: d, numClass, memos: dayMemosForCell.slice(0, 3), overflow: Math.max(0, dayMemosForCell.length - 3) });
    }
    return cells;
  }, [firstWeekday, lastDate, memosByDay]);

  // 포스트잇 확대 보기 — 원문만 보여주고, "수정" 버튼을 눌러야 편집 팝업으로 넘어간다.
  // "전체 보기"를 누르면 같은 postitViewMemo를 그대로 더 큰 레이아웃(expanded)으로만 다시 그린다 — 별도 state 없음.
  // Quick Edit — 포스트잇 "수정"의 작고 가벼운 편집 폼. 제목/타입/날짜/색상/짧은 본문만, 상세 툴바 없음(6절)
  const quickEditFormNode = postitEditMode === "quick" && (
    <>
      <div className="big-title-row">
        {/* type/autocomplete를 명시한다 — 없으면 크롬이 이 칸을 자동완성 대상으로 보고 키보드 위에
            액세서리 바(비밀번호·카드·위치)를 띄운다. 그 바는 `vv.height`가 빼고 주는 영역이라
            우리가 그릴 수 없고, 메모 편집 중에 화면만 잡아먹는다. 구글·네이버 검색창이 같은
            상황에서 안 뜨는 이유가 이 속성이다(2026-08-28 사용자 지적). 메모 제목은 자동완성할
            값이 아니므로 끄는 게 맞다. 세 벌 전부에 붙인다 — 하나만 붙이면 다른 화면에서 또 뜬다. */}
        <input
          type="text" autoComplete="off"
          className="big-title-input"
          value={formTitle}
          placeholder="제목 (비워두면 자동 생성)"
          onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
        />
        <span className={`star-toggle ${formImportant ? "active" : ""}`} title="중요 메모로 지정" onClick={() => setFormImportant((v) => !v)}>
          {formImportant ? "★" : "☆"}
        </span>
      </div>
      {memoDateError && <div className="memo-date-error" role="alert">{memoDateError}</div>}
      <div className="big-meta-row">
        <MemoTypeDropdown value={formType} onChange={setFormType} />
        <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
        <span>~</span>
        <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
      </div>
      <ColorSwatches value={formColor} onChange={setFormColor} />
      <div className="textarea-row">
        <textarea
          className={`memo-quick-editor big-body-input ${colorInputClass(formColor)}`}
          placeholder="간단한 내용을 입력하세요..."
          value={formBody}
          onChange={(e) => { setFormBody(e.target.value); scheduleAutosave({ content: e.target.value }); }}
        />
      </div>
      <div className="form-actions postit-edit-actions" style={{ marginTop: 16 }}>
        <button className="cancel-btn" onClick={closePostitView}>취소</button>
        <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
        {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>🗑 삭제</button>}
      </div>
    </>
  );

  // Detail Edit — 전체 보기 안에서 같은 오버레이를 유지한 채 상세 에디터로 전환한다(8·17절, 기존 상세 폼 재사용)
  // 🔴🔴 메모 편집 폼 = **한 벌**이다. 모바일 메모 수정과 먼슬리 Create가 같은 마크업을 쓴다.
  //
  // 예전에는 Create가 <dialog> 안의 별도 폼(.memo-form/.form-meta-row)이었고, 그래서
  // "같은 화면처럼 보이는데 계속 Create만 혼자 깨지는" 일이 반복됐다. 실제로 이번 세션에만
  // 보라색 포커스 링(dialog.show()의 focusing steps) / 더보기 시트가 화면 밖(backdrop-filter가
  // fixed 컨테이닝 블록을 만든다) / 헤드가 sticky top:-18로 잘림 / 제목·유형 순서 뒤바뀜
  // (display:contents 래퍼의 order는 상속되지 않는다) 이 전부 **구조 차이 하나에서** 나왔다.
  // 증상을 하나씩 고치는 대신 차이 자체를 없앤다.
  //
  // ⚠️ editorRef를 인자로 받는 이유: 두 화면이 **동시에 뜨지 않는다**는 전제를 코드로 못박기
  //    위해서다. 같은 ref를 여러 벌 마운트가 공유하면 마지막 사본이 가져간다(CLAUDE.md 지뢰표).
  //    mobileEditActive(postitEditMode==="detail")와 monthlyComposePage(memoFormOpen)는 서로
  //    배타적이라 실제로 겹치지 않지만, ref를 다르게 주어 겹쳐도 서로를 덮지 않게 한다.
  // 🔴 메모 편집 폼의 **정본 한 벌**. 포스트잇 상세 편집 · 먼슬리 Create · "메모로 저장" 셋이 쓴다.
  //
  // 2026-08-30까지 "메모로 저장"(bigEditorInner)은 **이 폼의 사본**이었다. 3940절 주석이 "폼 마크업을
  // 복사하지 마라 — 두 벌이 되면 한쪽만 고쳐진다"고 경고하는데 정작 그 사본이 이미 있었고, 실제로
  // 한쪽만 고쳐진 자리가 있었다: 사본은 `memoColor`/`onMemoColorChange`를 안 넘겨서 **"메모로 저장"에만
  // 모바일 툴바의 메모지 색 버튼이 없었다.** 색 바꾸는 방법이 그 화면에만 없는 상태였다.
  //
  // 그래서 **다른 것만 인자로 받는다.** 지금 셋의 차이는 이게 전부다:
  //   editorKey  — 에디터 인스턴스를 화면마다 따로 둔다(ref도 따로다)
  //   titleId    — "메모로 저장"만 id/name을 갖는다(원래 그랬다. 붙여도 해는 없지만 바꿀 이유도 없다)
  //   scroll     — 요소 스크롤러를 쓰는 화면만 true. "메모로 저장"은 원래 ref가 없었고,
  //                붙이면 postitScrollRef를 두 노드가 공유하게 된다(= "마지막 사본이 이긴다" 지뢰)
  //   beforeBody — "메모로 저장"의 삽입 대기 bar
  //   actions    — 하단 버튼 줄(상세/Create는 취소·저장, "메모로 저장"은 저장·삭제)
  // 새 차이가 생기면 **여기 인자를 늘려라. 폼을 다시 복사하지 마라.**
  function memoEditForm(
    editorRef: React.RefObject<MemoRichEditorHandle | null>,
    onCancel: () => void,
    opts?: {
      editorKey?: string;
      titleId?: string;
      scroll?: boolean;
      beforeBody?: React.ReactNode;
      actions?: React.ReactNode;
    },
  ) {
    const scroll = opts?.scroll ?? true;
    return (
      <>
        <div className="big-title-row">
          {/* type/autocomplete를 명시한다 — 없으면 크롬이 이 칸을 자동완성 대상으로 보고 키보드 위에
              액세서리 바(비밀번호·카드·위치)를 띄운다. 그 바는 `vv.height`가 빼고 주는 영역이라
              우리가 그릴 수 없고, 메모 편집 중에 화면만 잡아먹는다. 구글·네이버 검색창이 같은
              상황에서 안 뜨는 이유가 이 속성이다(2026-08-28 사용자 지적). 메모 제목은 자동완성할
              값이 아니므로 끄는 게 맞다. 세 벌 전부에 붙인다 — 하나만 붙이면 다른 화면에서 또 뜬다. */}
          <input
            {...(opts?.titleId ? { id: opts.titleId, name: opts.titleId } : {})}
            type="text" autoComplete="off"
            className="big-title-input"
            value={formTitle}
            placeholder="제목 (비워두면 자동 생성)"
            onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
          />
        </div>
        {memoDateError && <div className="memo-date-error" role="alert">{memoDateError}</div>}
        <div className="big-meta-row">
          <MemoTypeDropdown value={formType} onChange={setFormType} />
          <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
          <span>~</span>
          <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
          <span className="detail-color-desktop"><ColorSwatches value={formColor} onChange={setFormColor} /></span>
          {formType === "todo" && (
            <div className="status-select-group status-select-group--compact">
              {STATUS_OPTIONS.map(([value, label, color, bg]) => (
                <span
                  key={value}
                  className={`status-option ${formStatus === value ? "active" : ""}`}
                  style={formStatus === value ? { background: bg, color } : undefined}
                  onClick={() => setFormStatus(value)}
                >
                  <span className="dot" style={{ background: color }} />{label}
                </span>
              ))}
            </div>
          )}
          <button className="expand-btn detail-expand-desktop" style={{ marginLeft: "auto" }} onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>
        <div className="memo-color-action-row detail-color-row-mobile">
          <ColorSwatches value={formColor} onChange={setFormColor} />
          <button className="expand-btn" onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>
        {opts?.beforeBody}
        <div className="textarea-row" {...(scroll ? { ref: postitScrollRef, onScroll: onPostitScroll } : {})}>
          <MemoRichEditor
            key={`${opts?.editorKey ?? "postit-detail"}-${formSessionKey}`}
            ref={editorRef}
            initialValue={formBody}
            bodyClassName={`big-body-input ${colorInputClass(formColor)}`}
            hideToolbar
            memoColor={formColor}
            onMemoColorChange={setFormColor}
            onChange={(html) => { setFormBodyWhileTyping(html); scheduleAutosave({ content: html }); }}
          />
        </div>
        {opts?.actions ?? (
          <div className="form-actions postit-edit-actions" style={{ marginTop: 22 }}>
            <button className="cancel-btn" onClick={onCancel}>취소</button>
            <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
          </div>
        )}
      </>
    );
  }
  const detailEditFormNode =
    postitEditMode === "detail" && memoEditForm(detailEditorRef, () => setPostitEditMode(null));

  // postitViewNode는 Monthly MEMO/postitOnly/Key Notes 세 다이얼로그에 전부 중복 삽입돼(아래 참고)
  // postitViewMemo가 세팅되면 세 군데서 동시에 마운트된다 — 그 안(quickEditFormNode/detailEditFormNode)의
  // input에 id/name을 주면 브라우저가 "같은 폼에 동일 id가 여러 개"라고 경고한다. 라벨(htmlFor)로
  // 참조하는 곳도 없으니 이 안의 input들은 id/name 없이 둔다.
  // 🔴🔴 1563절 주석이 정해둔 규칙("지금 열려있는 다이얼로그의 key를 추적해서 그 안에서만 렌더링한다")이
  // bigEditorNode에만 적용돼 있었고 postitViewNode는 빠져 있었다. <dialog>는 닫혀 있어도 자식이 계속
  // 마운트되므로 포스트잇이 **3벌** 살아 있었고, 셋이 같은 detailEditorRef를 공유하니 마지막에 마운트된
  // (= 화면에 보이지 않는) 사본이 ref를 가져갔다. 그 사본의 에디터는 히스토리도 캐럿도 비어 있다:
  //   - 실행취소/다시실행 → commands가 false를 돌려주고 "취소할 내용이 없다"만 남는다
  //   - "현재 커서 위치에 삽입" → 보이지 않는 에디터에 들어가서 화면엔 아무 일도 안 일어난다
  // 실측(375px, 포스트잇 상세 편집): .postit-overlay.open .textarea-row 3개 중 보이는 건 index 0,
  // clientHeight는 [648, 0, 0]. undo 클릭 → 본문 길이 3593 그대로, 콘솔에 "취소할 내용이 없다".
  // bodyEditor(확장)는 포스트잇 **위에** 겹쳐 뜨는 중첩 팝업이라 그 동안에도 포스트잇은 살아 있어야 한다 —
  // 확장 직전 key를 담아둔 preBodyEditorDialogKeyRef를 그대로 쓴다.
  const postitHostDialogKey = activeDialogKey === "bodyEditor" ? preBodyEditorDialogKeyRef.current : activeDialogKey;
  // 🔴🔴 모바일 메모 편집 = **일반 페이지**. 다이얼로그도, position:fixed 껍데기도, 배경 스크롤
  // 잠금도 쓰지 않는다. 문서가 스크롤러이므로 iOS가 캐럿을 보이려 문서를 스크롤하는 것이
  // 정상 동작이고(되돌릴 수도 있다), 어긋날 fixed 요소가 없다.
  // 경위와 이 구조를 고른 근거: docs/incidents.md 11-11 ~ 11-13절.
  //
  // ★ 이 노드는 화면에 **한 벌만** 마운트된다 — postitViewNode가 세 다이얼로그에 중복 삽입되어
  //   detailEditorRef를 안 보이는 사본이 가져가던 지뢰(CLAUDE.md "같은 ref를 여러 벌…")가
  //   이 경로에서는 구조적으로 생기지 않는다.
  const mobileEditActive = isMobileView && postitEditMode === "detail" && !!postitViewMemo;
  // 1806절 cleanup이 읽는다 — **렌더 중에** 갱신해야 한다. React는 커밋 때 "모든 cleanup → 모든
  // effect 본문" 순서로 도는데, 잠금 cleanup은 그 첫 단계에서 돌기 때문에 useEffect로 넣으면
  // 항상 한 박자 늦어 전환 **이전** 값을 보게 된다(그러면 이 보정이 통째로 무효다).
  // 렌더에서 파생값을 ref에 담는 것은 React가 허용하는 패턴이고, 여기서는 그것만 한다.
  // eslint-disable-next-line react-hooks/refs
  fullPageEditorRef.current = mobileEditActive || monthlyComposePage || bigEditorPage;
  // 🔴🔴 편집 페이지는 새 페이지다 — 맨 위에서 시작해야 한다.
  //
  // 배경 스크롤 잠금 effect(1762절)의 cleanup은 `window.scrollTo(0, y)`로 **대시보드의**
  // 스크롤 위치를 되돌린다. 다이얼로그를 닫으면 대시보드로 돌아가던 옛 구조에서는 맞는 동작이다.
  // 그런데 새 구조에서는 `openDetailEditInPlace`가 **편집 페이지로 들어가려고** 그 다이얼로그를
  // 닫는다. 그 순간 대시보드는 `display:none`이고 문서의 내용물은 편집 페이지인데, 복원은
  // 그대로 실행되어 **편집 페이지를 대시보드의 y좌표로 굴려버린다.** 대시보드가 더 길기 때문에
  // 그 값은 대개 편집 페이지의 최대 스크롤보다 커서 **맨 끝에 clamp된다.**
  //
  // 실기기 실측(2026-08-28)이 이 등식으로 잡아냈다: 진입 1.2초 뒤 `scrollY = 1226`인데
  // `max = 1226`으로 **정확히 같았다.** 우연히 같을 수 없는 값이고, "요청값이 max보다 커서
  // 잘렸다"는 뜻이다 — 그게 신고 문구 "들어가자마자 하단부터 뜸 / 하단 내용은 보이게 뜸"이다.
  // 그리고 문서 맨 끝에 붙어 있으니 위로 밀어야만 움직이는데, 그게 "스크롤이 안 된다"로 느껴진다.
  // (컴퓨티드 스타일에는 아무 흔적도 없다. 그래서 `TOUCH ok` / `IN 0개` / `body static`이
  //  전부 정상으로 나오면서도 화면은 잠겨 보였다.)
  //
  // effect는 위 cleanup **뒤에** 돈다(React가 정리 단계를 먼저 끝낸다). 그래서 여기서 0으로
  // 되돌리면 복원을 덮어쓴다. 매직넘버도, setTimeout도 아니다 — 새 페이지의 시작 위치다.
  useEffect(() => {
    if (mobileEditActive) window.scrollTo(0, 0);
  }, [mobileEditActive]);
  // 🔴 위 openDetailEditInPlace가 건 **TODAY 경로 진입 잠금을 푼다.**
  // 절차는 잠긴 경로의 `goingFullPage` 분기와 동일하다: `top`을 0으로 박고 **강제 리플로우로
  // 확정한 뒤** 복원한다 — 이 리플로우가 없으면 같은 tick의 복원이 덮어써서 무효가 된다.
  // 그러면 브라우저가 되돌릴 값이 0이라 clamp될 큰 값이 남지 않는다.
  // ⚠️ 의존성이 `mobileEditActive`만이 아니라 `postitViewMemo`도 포함한다 — 편집 페이지가
  //    안 뜨는 경우(취소·실패)에도 **다음 커밋에서 반드시 풀려야** 스크롤이 죽지 않는다.
  //    ref가 비어 있으면 no-op이므로 매 렌더 돌아도 비용이 없다.
  useEffect(() => {
    const lock = entryLockRef.current;
    if (!lock) return;
    entryLockRef.current = null;
    const body = document.body;
    body.style.top = "0px";
    void body.offsetHeight;
    if (lock.saved === null) body.removeAttribute("style");
    else body.setAttribute("style", lock.saved);
    window.scrollTo(0, 0);
  }, [mobileEditActive, postitViewMemo]);
  // 🔴🔴🔴 2026-09-01 — **진입 스크롤: "그때 고친 방법"을 이 경우에도 적용한다 = 굴릴 자리를 없앤다.**
  //
  // 상단 짤림을 실제로 끝낸 처방은 값 보정이 아니라 `.sp-body`의 `min-height: 100vh`를 걷어
  // **문서에 굴릴 자리를 안 남긴 것**이었다(docSH == innerH → maxScroll 0). 짧은 메모는 그것으로 닫혔다.
  // 그런데 AI트렌드 "개발자 동향"은 본문이 뷰포트를 넘는다(프롬프트가 summary를 2~4문장으로
  // 지정한다 — trend-brief.ts:89-98). 그래서 **정당한** 슬랙이 남고, 거기로 진입 스크롤이 착지한다
  // (실기기 판독: `+0ms y=0 → +19ms y=30`, 한 발. 우리 호출 목록엔 scrollTo(0) 하나뿐 = 브라우저가 굴렸다).
  //
  // 길이를 줄일 수는 없으니 **시점**으로 같은 결론을 만든다: 진입하는 동안 문서를 굴릴 수 없게 한다.
  // `overflow: hidden`이면 브라우저가 들고 있던 값이든 복원이든 **적용될 자리가 없다.**
  // 이건 타이밍 보정이 아니다 — 값을 되돌리는 게 아니라 굴릴 자리를 없애는 것이고,
  // 앞선 처방과 **같은 종류**다. (되돌리기·상쇄·scrollTop 가드는 전부 실패했다. 그 목록에 더하지 않는다.)
  //
  // 🔴 푸는 조건이 **타이머가 아니라 사용자 행동**이다. 첫 터치/휠/키 입력이 오면 즉시 푼다 —
  //    그 전까지 사용자는 굴릴 이유가 없고(방금 들어와 맨 위를 본다), 그 뒤로는 완전히 정상이다.
  //    타이머로 풀면 "몇 ms가 맞나"를 또 찍게 되고, 그게 이 프로젝트가 반복해서 실패한 방식이다.
  // ⚠️ 키보드 경로에 영향 없다 — 본문을 탭하는 순간 pointerdown이 먼저 와서 잠금이 풀린다.
  useEffect(() => {
    if (!(mobileEditActive || monthlyComposePage || bigEditorPage)) return;
    const root = document.documentElement;
    root.classList.add("memo-entering");
    const release = () => {
      root.classList.remove("memo-entering");
      for (const ev of ["pointerdown", "touchstart", "wheel", "keydown"]) {
        window.removeEventListener(ev, release);
      }
    };
    for (const ev of ["pointerdown", "touchstart", "wheel", "keydown"]) {
      window.addEventListener(ev, release, { passive: true, once: false });
    }
    return release;
  }, [mobileEditActive, monthlyComposePage, bigEditorPage]);
  // (2026-08-31 12라운드에 여기 있던 `documentElement.scrollTop` 가드는 **되돌렸다.**
  //  실기기에서 `+19ms y=30`이 그대로 났고 — 즉 그 채널이 아니었다 — 게다가 own property로
  //  덮어서 `?debug=vp`의 prototype 계측을 **가려버렸다.** 목록에 `scrollTop=30`이 안 뜬 것이
  //  무죄 증거가 아니게 된다. 안 듣는 처방이 진단을 눈멀게 하면 그건 순손실이다.
  //  진짜 원인은 진입 순간의 슬랙이었고 dashboard.css의 폴백 `100svh`를 0으로 바꿔 막았다.)
  // 🔴 브라우저 크롬 색 — "메모 수정 하단의 검은 배경"의 정체가 이 값이다.
  //
  // `theme-color`는 주소창만 칠하는 게 아니라 **폼 액세서리 바가 그려지는 띠까지** 같이 칠한다.
  // 그래서 다크 테마 값 `#0b0d19`가 그대로 그 띠로 나왔다 — 실측(실기기, 2026-08-28):
  // 띠 색 `rgb(11,13,25)` == `#0b0d19`이고 **주소창도 같은 색**이었다. 네이버 메모에서 그 띠가
  // 밝은 이유는 액세서리 바를 껐기 때문이 아니라 이 값이 밝거나 없기 때문이다.
  // (HANDOFF 5절이 "네이티브라 못 건드린다"고 단정했는데, 그건 바의 **존재**에만 맞는 말이다.
  //  존재는 못 없애도 **색은 우리가 정한다.**)
  //
  // 범위를 편집 화면으로 좁힌다 — 다크 전체를 밝게 하면 주소창까지 밝아지고 그건 의도가 아니다.
  // 이 화면은 다크 테마에서도 **밝은 메모지**라(dashboard.css `.memo-edit-page` 블록) 라이트 값이 맞다.
  //
  // ★ theme-color 쓰기는 이 effect 하나뿐이다. toggleTheme에도 같은 줄이 있었는데, 두 벌이 되는
  //   순간 한쪽만 고쳐져 어긋난다(CLAUDE.md). toggleTheme은 setTheme만 하고 여기로 흘러온다.
  //
  // 🔬 임시 진단(2026-08-28): DARK_CHROME이 핑크다. layout.tsx의 인라인 스크립트도 같은 값이라
  // **로드 시점부터** 핑크로 뜬다. 읽는 법 —
  //   · 주소창 핑크 + 띠 핑크  → theme-color가 띠를 칠한다. 실패한 건 **동적 변경**뿐이다.
  //   · 주소창 핑크 + 띠 검정  → theme-color는 띠를 안 칠한다. 이 가설은 죽었다(8-1 폐기).
  //   · 둘 다 안 바뀜         → theme-color 자체가 안 먹고 있다.
  // 확인 뒤 DARK_CHROME과 layout.tsx를 '#0b0d19'로 되돌린다.
  //
  // 🔴 2026-08-30: 여기서 편집 중일 때 `#d9cbff`(밝은 보라)를 하드코딩하고 있었다. 그 값의 근거는
  // "편집 화면은 다크에서도 밝은 메모지다"였는데, **다크 메모지 팔레트를 고치고 기본색이 블랙이
  // 되면서 그 전제가 깨졌다**(실측: 블랙 메모지 아랫변 `rgba(16,17,24,.98)`). 밝은 크롬 + 어두운
  // 메모지는 예전 검은칸의 부호만 뒤집은 것이다. 그래서 **편집 중에는 이 effect가 손대지 않고**,
  // 아래 "메모지 배경 복사" effect가 실제 메모지 색으로 크롬과 color-scheme을 같이 맞춘다.
  useEffect(() => {
    if (mobileEditActive || monthlyComposePage || bigEditorPage) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0d19" : "#d9cbff");
  }, [theme, mobileEditActive, monthlyComposePage, bigEditorPage]);
  // 🔴🔴 "메모 하단 검은칸"의 정체 = **body의 배경색**이다. theme-color가 아니었다.
  //
  // 사용자가 직접 짚어줬고("내가 말하는 검은칸은 메인바탕색인것같아") 문헌이 그걸 확인해준다:
  // 오버스크롤(고무줄)과 키보드 주변에서 **iOS가 보는 것은 `body`의 배경색 하나뿐이다.**
  // 자식 요소에 아무리 배경을 깔아도 그 영역엔 안 쓰인다.
  //   · https://dev.to/a-dev/css-overscroll-behavior-rubber-banding-...-47mj
  //   · 사이트 배경과 테마가 어긋나면 하단 가장자리로 배경이 "샌다"(Apple 커뮤니티 다수 보고)
  // 네이버 메모에서 이 현상이 없는 이유도 같다 — 거기는 body와 메모지 색이 어긋나지 않는다.
  //
  // 실측(로컬 375×684, 다크): 메모지 `background-color`는 **rgba(0,0,0,0)**이고 색은 전부
  // `background-image` gradient 안에 있다. 그런데 body는 `rgb(11,13,25)` — 그 어긋남이 검은칸이다.
  //
  // 처방: 편집 페이지가 열려 있는 동안 **메모지의 배경을 body에 그대로 복사한다.**
  // 색을 새로 정하지 않는다 — 그러면 "메모지 색 네 번째 벌"이 되고, 팔레트가 바뀌면 어긋난다
  // (CLAUDE.md "메모지 색은 세 벌이다"). 껍데기와 body는 높이가 거의 같아서 gradient 기하도
  // 사실상 일치하고, 넘어가는 영역은 gradient의 끝 색이 그대로 연장된다.
  useEffect(() => {
    if (!mobileEditActive && !monthlyComposePage && !bigEditorPage) return;
    // 메모지 자체를 가리킨다 — 메모 편집·메모로 저장은 포스트잇 div, Create는 다이얼로그 안쪽 박스다.
    const paper = document.querySelector<HTMLElement>(".memo-edit-page.big-postit");
    if (!paper) return;
    const cs = getComputedStyle(paper);
    // 🔴 body와 html **둘 다** 칠한다. 캔버스(= 오버스크롤로 드러나는 그 영역)는 html에 배경이
    // 있으면 그것을, 없으면 body에서 전파받은 것을 쓴다. html에 직접 거는 쪽이 전파 규칙에
    // 안 기대므로 확실하고, body는 요소 자신의 배경으로도 필요하다.
    const targets = [document.body, document.documentElement];
    const prev = targets.map((el) => ({ el, image: el.style.backgroundImage, color: el.style.backgroundColor }));
    // 🔴 **단색도 반드시 같이 넣어야 한다.** 메모지의 `background-color`는 투명이고 색이 전부
    // gradient 안에 있어서(실측 `rgba(0,0,0,0)`), 이미지만 복사하면 body의 색은 어두운 캔버스
    // `rgb(11,13,25)` 그대로 남는다 — 그게 사용자가 말한 바로 그 색이다(실측으로 확인).
    // gradient가 안 그려지는 자리(브라우저가 색만 쓰는 영역)에서는 그 어두운 색이 그대로 나온다.
    // 그래서 gradient의 **마지막 색 정지점**(= 아랫변 색, 새는 자리와 맞닿는 쪽)을 뽑아 단색으로 깐다.
    const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g);
    const solid =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : stops?.[stops.length - 1];
    for (const el of targets) {
      if (cs.backgroundImage && cs.backgroundImage !== "none") el.style.backgroundImage = cs.backgroundImage;
      if (solid) el.style.backgroundColor = solid;
    }
    // 🔴 그 단색을 CSS에도 넘긴다 — 메모지 아랫변을 이 색으로 **페이드**시켜 이음매를 없앤다.
    // 메모지 배경이 대각선 gradient(160deg)라 아랫변 색이 가로로 조금씩 다른데 띠는 단색 하나다.
    // 어떤 단색을 골라도 한 점에서만 맞으므로 **경계선이 보인다**(사용자 확인). 색을 더 정교하게
    // 고르는 대신 경계 자체를 지운다 — dashboard.css의 `.memo-edit-page::after` 참고.
    const rootEl = document.documentElement;
    const prevVar = rootEl.style.getPropertyValue("--memo-canvas");
    if (solid) rootEl.style.setProperty("--memo-canvas", solid);
    // 🔴🔴 브라우저 자기 표면(키보드 위 띠·주소창)도 **같은 메모지 색**에 맞춘다 — 2026-08-30.
    //
    // 이 둘은 원래 "편집 화면은 다크에서도 밝은 메모지다"를 전제로 각각 라이트로 하드코딩돼 있었다
    // (globals.css `html:has(.memo-edit-page){color-scheme:light}` / 위 effect의 `#d9cbff`).
    // 다크 메모지 팔레트가 실제로 붙게 되면서 그 전제가 깨졌다: 블랙·다크그레이 메모지는 어둡다.
    // 밝은 크롬 + 어두운 메모지는 검은칸(11-20)의 **부호만 뒤집은 같은 버그**다.
    //
    // 그래서 색을 새로 정하지 않고 메모지에서 파생시킨다 — `solid`는 이미 위에서 뽑아둔
    // "메모지 아랫변 색"이고, 배경 복사·`--memo-canvas` 페이드가 쓰는 것과 **같은 한 값**이다.
    //   · theme-color  → 그 색 (alpha는 떼야 한다. theme-color는 반투명 값을 무시할 수 있다)
    //   · color-scheme → 그 색의 밝기로 light/dark. 인라인이라 globals.css 규칙을 이긴다.
    const rgb = solid?.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    const prevScheme = rootEl.style.colorScheme;
    if (rgb && rgb.length === 3) {
      const [r, g, b] = rgb;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", `rgb(${r}, ${g}, ${b})`);
      // 상대 휘도 근사(ITU-R BT.601). 정확한 sRGB 선형화까지 갈 이유가 없다 — light/dark 두 갈래다.
      //
      // 🔴🔴🔴 2026-08-31 — **임계값은 128이 아니다.** 실기기 신고: "다크 메모 수정 시 키보드
      //    위에 하얀 경계선". 판독 `cs=light  canvas=rgba(188, 133, 164, 0.89)`.
      //    그 색의 휘도는 **153**이라 128을 넘어 `light`으로 갔는데, `color-scheme: light`의
      //    브라우저 표면은 **순백(255)**이다. 즉 메모지(153) 옆에 255짜리 띠가 붙는다.
      //
      //    128은 "흰색과 검은색 중 **수치상** 가까운 쪽"을 고르는 값이다(|153-255|=102 <
      //    |153-0|=153이라 흰색이 이긴다). 그런데 이 화면에서 그 선택은 틀렸다:
      //      · 우리가 고를 수 있는 것은 표면의 **색**이 아니라 light/dark **두 갈래뿐**이다
      //        (`vv.height` 밖은 우리가 못 그린다 — 지뢰표 "키보드 위는 우리 영역이 아니다").
      //      · 그래서 어느 쪽을 골라도 중간 톤 메모지와는 어긋난다. 문제는 **어긋남의 크기가
      //        아니라 눈에 띄는 정도**다. 순백 띠는 어떤 배경에서도 밝게 튀지만, 어두운 띠는
      //        이 앱(다크 테마)에서 브라우저 크롬으로 읽혀 거슬리지 않는다.
      //    👉 그래서 `light`은 **정말로 흰 메모지에만** 준다. 그 경우엔 흰 표면이 실제로 맞다.
      //       (라이트 노랑 메모지 `rgb(251,233,184)` = 236 → 여전히 light. 11-20에서 고친
      //        "밝은 메모지 + 검은칸"은 그대로 막힌다. 이번 변경이 되돌리는 것이 아니다.)
      //    ⚠️ 값을 짐작으로 낮추지 마라 — 200은 "거의 흰색"의 경계이고, 위 두 실측값(153 / 236)이
      //       그 사이에 확실히 갈리도록 고른 것이다. 새 팔레트가 들어오면 두 값을 다시 재라.
      const NEAR_WHITE = 200;
      rootEl.style.colorScheme = (r * 299 + g * 587 + b * 114) / 1000 < NEAR_WHITE ? "dark" : "light";
    }
    return () => {
      for (const p of prev) { p.el.style.backgroundImage = p.image; p.el.style.backgroundColor = p.color; }
      if (prevVar) rootEl.style.setProperty("--memo-canvas", prevVar);
      else rootEl.style.removeProperty("--memo-canvas");
      rootEl.style.colorScheme = prevScheme;
    };
    // formColor·theme이 바뀌면 메모지 색도 바뀌므로 다시 읽어야 한다.
  }, [mobileEditActive, monthlyComposePage, bigEditorPage, formColor, theme]);
  const mobileEditPageNode = mobileEditActive && postitViewMemo && (
    // data-memo-theme — 다크 메모지 8종 팔레트 전체가 이 속성에 걸려 있다(dashboard.css).
    // .postit 클래스도 유지한다 — 메모지 색(.c1~c7)이 그 조합에 걸려 있다.
    <div
      className={`memo-edit-page postit big-postit ${postitColorClass(formColor)}`}
      data-memo-theme={theme}
    >
      <button className="close-btn" onClick={() => void handlePostitBack()}>✕</button>
      {memoHeadActions(detailEditorRef)}
      {autosaveStatusCorner}
      {detailEditFormNode}
    </div>
  );
  // 🔴 먼슬리 Create = **일반메모 편집과 같은 노드**다. className도 자식 구성도 위와 동일하고,
  // 다른 것은 (1) 본문 에디터 ref (2) 취소 동작 (3) 뒤로가기 핸들러뿐이다.
  // 이 셋만 다르면 "같은 화면"이 되고, 지금까지 Create만 겪던 증상들은 발생할 자리가 없어진다.
  // ⚠️ 폼 마크업을 여기 복사하지 마라 — memoEditForm 한 벌만 쓴다(두 벌이 되면 한쪽만 고쳐진다).
  const composePageNode = monthlyComposePage && (
    <div
      className={`memo-edit-page postit big-postit ${postitColorClass(formColor)}`}
      data-memo-theme={theme}
    >
      <button className="close-btn" onClick={() => void handleMemoDialogBack()}>✕</button>
      {memoHeadActions(compactEditorRef)}
      {autosaveStatusCorner}
      {memoEditForm(compactEditorRef, () => setMemoFormOpen(false))}
    </div>
  );
  const postitViewNode = postitViewMemo && (
    // data-memo-theme — 다크 메모지 8종 팔레트 전체가 이 속성에 걸려 있다(dashboard.css). 없으면
    // 다크 배경 위에 라이트 메모지가 그대로 남는다. 글로벌 테마를 그대로 따라가는 파생값이라
    // 별도 state/저장소가 없다. ★ .postit-overlay open은 파일에 5번 나오는데 **실제 메모지를 그리는 둘**(여기, bigEditorNode)에만 붙인다 —
    // 나머지(프로젝트 템플릿·확인 팝업 등)에 붙이면 그것들까지 메모지 스타일을 먹는다.
    <div className="postit-overlay open" data-memo-theme={theme} onClick={postitEditMode === "detail" ? () => setPostitEditMode(null) : closePostitView}>
      <div
        className={`postit big-postit ${postitColorClass(postitEditMode ? formColor : postitViewMemo.color)} ${postitExpanded ? "expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={() => {
          const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
          if (mobile) void handlePostitBack();
          else if (postitEditMode === "detail") setPostitEditMode(null);
          else closePostitView();
        }}>✕</button>
        {postitEditMode && memoHeadActions(detailEditorRef)}
        {(postitEditMode === "quick" || postitEditMode === "detail") && autosaveStatusCorner}
        {postitEditMode === "quick" ? quickEditFormNode : postitEditMode === "detail" ? detailEditFormNode : (
          <>
            <div className="big-title-row">
              <div className="big-title">{postitViewMemo.emoji ? `${postitViewMemo.emoji} ` : ""}{postitViewMemo.title}</div>
              <div className="big-title-actions">
                <span
                  className={`star-toggle ${postitViewMemo.is_important ? "active" : ""}`}
                  onClick={(e) => {
                    const wasImportant = postitViewMemo.is_important;
                    handleToggleImportant(postitViewMemo, e);
                    setPostitViewMemo((v) => (v ? { ...v, is_important: !wasImportant, is_pinned: wasImportant ? false : v.is_pinned } : v));
                  }}
                >
                  {postitViewMemo.is_pinned ? "📌" : postitViewMemo.is_important ? "★" : "☆"}
                </span>
                {postitViewMemo.is_important && (
                  <button
                    className={`pin-toggle ${postitViewMemo.is_pinned ? "active" : ""}`}
                    onClick={() => {
                      const { id, is_pinned } = postitViewMemo;
                      handleTogglePin(id, is_pinned);
                      setPostitViewMemo((v) => (v ? { ...v, is_pinned: !v.is_pinned } : v));
                    }}
                  >
                    📌
                  </button>
                )}
              </div>
            </div>
            <div className="big-meta">
              {postitViewMemo.memo_type === "todo" ? "Todo" : postitViewMemo.memo_type === "dev_note" ? "Dev Note" : "Free Note"}
              {postitViewMemo.status && (() => {
                const opt = STATUS_OPTIONS.find(([value]) => value === postitViewMemo.status);
                if (!opt) return null;
                const [, label, color] = opt;
                return (
                  <>
                    {" · "}<span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: "0 0 0 1.5px rgba(255,255,255,.9)" }} />{" "}{label}
                  </>
                );
              })()}
              {" · "}{postitViewMemo.start_date === postitViewMemo.end_date ? postitViewMemo.start_date : `${postitViewMemo.start_date} ~ ${postitViewMemo.end_date}`}
            </div>
            <div className="big-body-scroll" ref={postitScrollRef} onScroll={onPostitScroll}>
              <RichMemoContent content={postitViewMemo.content} format={postitViewMemo.content_format} className="big-body" />
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              {!postitExpanded && <button className="cancel-btn postit-expand-btn" onClick={expandPostitView}>전체 보기 ↗</button>}
              <button
                className="edit-btn"
                onClick={() => openPostitEdit(postitViewMemo)}
              >
                ✎ 수정
              </button>
              <button className="delete-btn" onClick={() => handleDeleteMemo(postitViewMemo.id)}>🗑 삭제</button>
            </div>
          </>
        )}
        {postitEditMode !== "quick" && <ScrollTopButton ref={postitScrollBtnRef} onClick={scrollPostitToTop} />}
      </div>
      {postitEditMode && renderMobileMemoOptionsSheet()}
    </div>
  );

  // Key Notes 포스트잇 · 먼슬리 메모 목록 클릭 시 여는 큰 편집 팝업 (5-5·8절) — 두 다이얼로그 모두에 중복 삽입한다
  // data-memo-theme - 이 창은 .postit.big-postit(진짜 메모지)을 그리므로 다크 메모지 팔레트가 필요하다.
  // postitViewNode 쪽 주석이 "한 곳만 붙인다"고 했던 건 프로젝트 템플릿·확인 팝업(.copy-picker)을
  // 가리킨 것이고 그것들은 메모지가 아니라 지금도 안 붙인다. 여기가 빠져 있어서 다크에서
  // "메모로 저장"을 누르면 어두운 배경 위에 라이트 메모지가 그대로 떴다(CSS 규칙 150개가 이 속성에 걸려 있다).
  // 🔴 알맹이를 변수로 뺀 이유: 아래에서 **두 가지 껍데기**(옛 오버레이 / 새 일반 페이지)가
  // 이걸 쓴다. 둘은 `bigEditorPage`로 서로 배타적이라 **동시에 마운트되지 않는다** —
  // 그게 지켜져야 `bigEditorHandleRef`를 안 보이는 사본이 가져가는 지뢰를 안 밟는다
  // (CLAUDE.md "같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 마지막 사본이 이긴다").
  // 🔴 폼은 **memoEditForm 한 벌**을 그대로 쓴다. 예전엔 여기에 폼 마크업이 통째로 복사돼 있었고,
  // 그 사본이 `memoColor`/`onMemoColorChange`를 안 넘겨서 **이 화면에만 모바일 툴바의 메모지 색
  // 버튼이 없었다**(= 이 화면에서만 색을 못 바꿨다). 3940절 주석이 경고하던 바로 그 사고다.
  // 다른 것(제목칸 id / 삽입 bar / 하단 버튼 / 스크롤러 없음)만 인자로 넘긴다.
  const bigEditorInner = (
    <>
      <button className="close-btn" onClick={closeBigEditor}>✕</button>
      {/* 포스트잇 상세 편집과 같은 상단 액션 줄 - 실행취소/다시실행/중요·고정/더보기.
          "중요/Pin은 이 저장 단계에서 제공하지 않는다"는 원래 설계였지만, 이 창에서 실행취소가
          아예 불가능하고 별표도 못 거는 게 실사용에서 문제라 사용자 요청으로 4개 모두 넣었다. */}
      {memoHeadActions(bigEditorHandleRef)}
      {autosaveStatusCorner}
      {memoEditForm(bigEditorHandleRef, closeBigEditor, {
        // 에디터 인스턴스를 상세 편집과 분리한다 — ref도 다르다(bigEditorHandleRef).
        editorKey: "big",
        // 이 칸만 id/name을 갖는다(예전부터 그랬다). autoComplete="off"는 폼 안에 이미 있다.
        titleId: "body-editor-title",
        // 🔴 스크롤러 ref를 붙이지 않는다. 붙이면 `postitScrollRef`를 상세 편집 노드와 **공유**하게
        //    되고, 그게 CLAUDE.md "같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 마지막 사본이
        //    이긴다" 지뢰다. 이 화면은 원래도 요소 스크롤러를 안 썼다.
        scroll: false,
        // 삽입 대기 bar — 본문 Editor 바로 위. 높이가 절대 늘어나지 않는 한 줄짜리다.
        beforeBody: pendingInsert ? (
          <div className="insert-bar">
            <span className="insert-bar-label">삽입 대기</span>
            <span className="insert-bar-preview" title={pendingInsert.text}>&ldquo;{pendingInsert.text}&rdquo;</span>
            {/* 🔴 세 경로를 준다. `onClick={insertPendingAtCursor}`로 함수를 그대로 넘기면
                안 된다 — 클릭 이벤트가 첫 인자(where)로 들어간다. 반드시 화살표로 감싼다. */}
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("start")}>맨 위</button>
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("end")}>맨 아래</button>
            <button type="button" className="add-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("cursor")}>커서 위치</button>
          </div>
        ) : null,
        // 이 화면은 "취소"가 없고(✕가 그 역할) 대신 삭제가 있다.
        actions: (
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
            {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>삭제</button>}
          </div>
        ),
      })}
    </>
  );
  // 데스크톱(그리고 예외 경로)의 옛 껍데기 — 화면을 덮는 fixed 오버레이.
  const bigEditorNode = bigEditorOpen && !bigEditorPage && (
    <div className="postit-overlay open" data-memo-theme={theme} onClick={closeBigEditor}>
      <div className={`postit big-postit ${postitColorClass(formColor)}${pendingInsert ? " has-insert-banner" : ""}`} onClick={(e) => e.stopPropagation()}>
        {bigEditorInner}
      </div>
    </div>
  );
  // 🔴🔴 모바일 "메모로 저장" = 일반 페이지. 메모 수정·먼슬리 Create와 **같은 구조**다.
  //
  // 여기는 먼슬리 Create보다 훨씬 싸다 — 이 노드는 원래부터 `.postit.big-postit`이라
  // `.memo-edit-page` 마커만 붙이면 그 화면의 CSS·가드가 **그대로** 적용된다(먼슬리는 규칙
  // 64개가 `dialog` 타입 셀렉터에 묶여 있어서 엘리먼트를 유지해야 했다).
  // 바깥의 `.postit-overlay`(fixed 껍데기)를 걷어내는 것이 이 변경의 전부다.
  const bigEditorPageNode = bigEditorPage && (
    <div
      className={`memo-edit-page postit big-postit ${postitColorClass(formColor)}${pendingInsert ? " has-insert-banner" : ""}`}
      data-memo-theme={theme}
    >
      {bigEditorInner}
    </div>
  );

  const confirmDialogNode = confirmDialog && (
    <div className="postit-overlay fixed-overlay open" onClick={() => setConfirmDialog(null)}>
      <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="copy-picker-title">{confirmDialog.message}</div>
        <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
          {!confirmDialog.hideCancel && <button className="cancel-btn" onClick={() => setConfirmDialog(null)}>취소</button>}
          <button
            className="save-btn"
            onClick={async () => {
              const { onConfirm } = confirmDialog;
              setConfirmDialog(null);
              // 삭제 등은 실패해도 여기서 조용히 묻히지 않도록 await하고, 실패 시 사용자에게 알린다 —
              // handleDeleteMemo/handleDeleteProject 쪽은 성공(await 통과) 이후에만 UI에서 지운다.
              try {
                await onConfirm();
              } catch (err) {
                console.error(err);
                alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
              }
            }}
          >
            {confirmDialog.confirmLabel ?? "삭제"}
          </button>
        </div>
      </div>
    </div>
  );

  // RadialSelectionMenu는 document mousedown으로 "바깥 클릭 시 닫기"를 감지한다 — News·Job 다이얼로그에
  // 둘 다 무조건 삽입하면 숨겨진 쪽 인스턴스도 같은 리스너를 달게 되고, 그게 매번 "바깥 클릭"으로 오인해
  // 토글 클릭의 mousedown 시점에 공유 state를 먼저 지워버려 버튼이 눌러도 반응 없는 것처럼 보인다.
  // 그래서 이 부분만 selectionMenu.source.type이 맞는 다이얼로그에서만 렌더링한다.
  const radialMenuOverlay = selectionMenu && (
    <>
      <div className="selection-action-desktop" style={{ position: "absolute", top: selectionMenu.y, left: selectionMenu.x, zIndex: 60 }}>
        <RadialSelectionMenu
          onCopy={() => copySelectionText(selectionMenu.text)}
          onPickDate={(iso) => openMemoPickerForDate(iso, selectionMenu.source, selectionMenu.text)}
          onClose={() => setSelectionMenu(null)}
          todayIso={todayIso}
        />
      </div>
      <MobileSelectionActionBar
        text={selectionMenu.text}
        onCopy={() => copySelectionText(selectionMenu.text)}
        onPickDate={(iso) => openMemoPickerForDate(iso, selectionMenu.source, selectionMenu.text)}
        onClose={() => setSelectionMenu(null)}
        todayIso={todayIso}
      />
    </>
  );
  // News·Job 다이얼로그 안에서만 써야 top layer 위에 뜬다(1절) — 두 다이얼로그에 그대로 중복 삽입한다
  const selectionOverlays = (
    <>
      {memoPicker && !pendingSave && (
        <div className="postit-overlay open" onClick={() => setMemoPicker(null)}>
          <div className="panel copy-picker" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setMemoPicker(null)}>✕</button>
            <div className="copy-picker-title">
              {memoPicker.date} {memoPicker.content.mode === "selection" ? "메모로 복사" : "메모에 전체 저장"}
            </div>
            {/* 저장할 날짜를 여기서 바꿀 수 있다(웹·모바일 공통) — 뉴스/채용공고/AI Trend 전체 저장도
                오늘로 고정되지 않고 원하는 날짜의 메모에 넣을 수 있어야 한다는 요청. */}
            <div className="copy-picker-date-row">
              <span className="copy-picker-date-label">저장 날짜</span>
              <MiniDatePicker
                value={memoPicker.date}
                onChange={(iso) => { void changeMemoPickerDate(iso); }}
                todayIso={todayIso}
              />
              {/* 웹에서는 "저장 날짜 · 달력 · +새 메모 생성"이 한 줄이고 그 아래로 목록이 이어진다.
                  그래서 버튼을 날짜 행의 형제가 아니라 **자식**으로 둔다 — 형제로 두면 CSS만으로는
                  같은 줄에 못 올린다(부모가 세로 스택이다).
                  모바일은 이 행이 wrap돼서 버튼이 예전처럼 아래 한 줄을 통째로 쓴다. */}
              <button
                type="button" className="idea-action-button primary copy-picker-new-btn"
                onClick={() => setPendingSave({ memoId: null, label: "새 메모" })}
              >
                + 새 메모 생성
              </button>
            </div>
            {memoPicker.memos.length > 0 && (
              <div className="copy-picker-list">
                {memoPicker.memos.map((m) => (
                  <div key={m.id} className="mock-item" onClick={() => setPendingSave({ memoId: m.id, label: m.is_auto_title ? "제목 없는 메모" : m.title })}>
                    <div className="t">
                      <span className={`star-toggle ${m.is_important ? "active" : ""}`}>{m.is_pinned ? "📌" : m.is_important ? "★" : "☆"}</span>
                      {m.title}
                    </div>
                    <div className="s">
                      <span className={`type-badge ${m.memo_type}`}>{m.memo_type === "todo" ? "Todo" : m.memo_type === "dev_note" ? "Dev Note" : "Free Note"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {pendingSave && (
        <div className="postit-overlay open" onClick={() => setPendingSave(null)}>
          <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="copy-picker-title">
              {pendingSave.memoId
                ? <>{`"${pendingSave.label}"에`}<br />붙여 넣으시겠습니까?</>
                : "새 메모로 저장하시겠습니까?"}
            </div>
            <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
              <button className="cancel-btn" onClick={() => setPendingSave(null)}>취소</button>
              <button className="save-btn" onClick={confirmPendingSave}>저장</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialogNode}
    </>
  );

  return (
    // memo-edit-page-open — 편집 페이지가 문서를 차지하는 동안 대시보드를 감추는 훅.
    // 먼슬리 Create가 일반 페이지로 내려간 경우도 같은 상태라 같은 클래스를 쓴다.
    //
    // 🔴🔴 data-memo-theme을 **여기**에 붙인다 — 편집 페이지 노드가 아니라 그 조상에.
    // 다크 메모지 8종 팔레트의 셀렉터는 `[data-theme="dark"] [data-memo-theme="dark"] .postit`으로
    // **자손 결합자**다. 그런데 `.memo-edit-page`는 `postit` 클래스와 `data-memo-theme`을 **같은
    // 요소**에 갖고 있어서(3883·3900·4102절) 그 규칙에 영원히 매치되지 않는다 — 조상이 필요하다.
    // 그래서 세 편집 페이지 전부가 다크에서 **라이트 팔레트**로 떴다(실측 2026-08-30, 375×684 다크:
    // 적용된 배경 `linear-gradient(160deg, rgb(253,246,220), rgb(251,233,184))` = 라이트 값,
    // `el.matches('[data-theme="dark"] [data-memo-theme="dark"] .postit')` → **false**).
    // 조상에 붙이면 8-B 팔레트가 붙는다(실측 후: `rgba(227,223,175,.95)` 2레이어 + 글씨 `rgb(40,37,18)`).
    //
    // ⚠️ 팔레트 셀렉터 175개를 "붙여 쓰기"로 복제하지 마라 — 색이 늘 때마다 어긋난다(CLAUDE.md
    // "메모지 색은 세 벌이다", "여덟 곳의 border 색을 맞추는 쪽으로 가지 마라"). 조상 한 곳이 답이다.
    // ⚠️ 편집 페이지가 열려 있을 때만 붙인다. 3916절이 경고하듯 이 속성을 넓게 붙이면 메모지가
    //    아닌 것들(프로젝트 템플릿·확인 팝업 `.copy-picker`)까지 메모지 스타일을 먹는다.
    //    실측으로 범위를 확인했다: 편집 페이지가 열린 상태에서 이 속성을 붙였을 때 **새로 매치되는
    //    요소는 편집 페이지 자신 1개뿐**이다(나머지 postit은 이미 자기 조상에 이 속성을 갖고 있다).
    <div
      className={`sp-body${mobileEditActive || monthlyComposePage || bigEditorPage ? " memo-edit-page-open" : ""}`}
      data-memo-theme={mobileEditActive || monthlyComposePage || bigEditorPage ? theme : undefined}
    >
      {/* 모바일 편집 페이지 — 대시보드는 CSS로 감춘다(언마운트하면 스크롤 위치와 로드된 데이터를 잃는다) */}
      {mobileEditPageNode}
      {bigEditorPageNode}
      {composePageNode}
      {/* 🔴 ⋮(더보기)가 여는 바텀시트. **이 두 페이지엔 마운트가 아예 없었다** — 그래서 눌러도
          state만 바뀌고 화면엔 아무 일도 안 일어났다(실측: ⋮ 클릭 후 `.mobile-memo-options-sheet` 0개).
          시트는 원래 두 군데서만 렌더된다: postitViewNode 안(3899절)과 먼슬리 다이얼로그 안(5146절).
          두 곳 다 **다이얼로그 자식**인데, 편집 페이지로 구조를 옮기면서 다이얼로그가 전부 닫혀
          어느 쪽도 안 그려진다. 11-2가 적은 "화면을 옮길 때 UI 부속까지 전수로 세라"가 또 걸렸다.
          중복 걱정 없음: 이 두 페이지가 떠 있을 때 열린 다이얼로그는 0개이고
          postitViewNode는 postitHostDialogKey 게이트라 마운트되지 않는다(실측 확인). */}
      {(mobileEditActive || bigEditorPage || monthlyComposePage) && renderMobileMemoOptionsSheet()}
      <div className="blob a" /><div className="blob b" /><div className="blob c" />

      <main className="page">
        <div className="shell">
          <header className="header">
            {/* 로고 클릭 = 홈으로 이동 + 서버 데이터 새로고침 */}
            <button
              type="button" className="brand" title="홈 새로고침"
              onClick={() => { router.push("/"); router.refresh(); }}
            >
              <img src="/skillpilot-header-logo.png" alt="SkillPilot" className="brand-logo" />
            </button>
            <div className="header-right" style={{ position: "relative" }}>
              <div className="weather">
                <div className="weather-line1">
                  <WeatherTempTrigger weather={weather} region={region} tempClassName="weather-temp" iconClassName="sun-icon" />
                  {weather && (
                    <span className="weather-detail">
                      {weather.label}{weather.humidity !== null && ` · 습도 ${weather.humidity}%`}
                    </span>
                  )}
                </div>
                <WeatherMeta region={region} airQuality={airQuality} warnings={warnings} />
              </div>
              {isLoggedIn ? (
                <>
                  {/* 회원 — UserRound + 닉네임 pill(→ My Page), 로그아웃은 아이콘 원형 버튼 */}
                  <button type="button" className="account-btn" onClick={openMyPage}>
                    <UserRound size={17} strokeWidth={1.9} />
                    {nickname ?? "My page"}
                  </button>
                  {/* 도움말/의견·버그 문의는 아이콘 하나로 합쳐 열고, 안에서 탭으로 이동한다 */}
                  {/* 아이콘 버튼들은 한 덩어리로 묶는다 — 모바일에서 헤더가 폭을 넘으면
                      .header-right가 줄바꿈하는데, 묶지 않으면 마지막 버튼 하나만 둘째 줄로
                      떨어져 레이아웃 사고처럼 보인다. 그룹이면 셋이 같이 내려가 의도된 2줄이 된다. */}
                  <div className="header-actions">
                    <button
                      type="button"
                      className="header-icon-btn theme-toggle-btn"
                      title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                      onClick={toggleTheme}
                    >
                      {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
                    </button>
                    <button type="button" className="header-icon-btn" title="도움말" aria-label="도움말" onClick={() => supportDialogRef.current?.openHelp()}>
                      <CircleHelp size={17} strokeWidth={2} />
                    </button>
                    <button type="button" className="header-logout-btn" onClick={() => signOut()} title="로그아웃" aria-label="로그아웃">
                      <LogOut size={17} strokeWidth={2} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" className="header-signup-btn" onClick={() => router.push("/login")}>Sign up</button>
                  {/* 아이콘 버튼들은 한 덩어리로 묶는다 — 모바일에서 헤더가 폭을 넘으면
                      .header-right가 줄바꿈하는데, 묶지 않으면 마지막 버튼 하나만 둘째 줄로
                      떨어져 레이아웃 사고처럼 보인다. 그룹이면 셋이 같이 내려가 의도된 2줄이 된다. */}
                  <div className="header-actions">
                    <button
                      type="button"
                      className="header-icon-btn theme-toggle-btn"
                      title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                      onClick={toggleTheme}
                    >
                      {theme === "dark" ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
                    </button>
                    <button type="button" className="header-icon-btn" title="도움말" aria-label="도움말" onClick={() => supportDialogRef.current?.openHelp()}>
                      <CircleHelp size={17} strokeWidth={2} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>

          <SupportDialog ref={supportDialogRef} isLoggedIn={isLoggedIn} />

          <div className="dashboard-grid">
            <div className="panel mindset-bar span-2">
              <span className="mindset-label">MindSet</span>
              <span className="icon heart-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <defs>
                    <linearGradient id="mindsetHeartGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#ffb3d9" />
                      <stop offset="100%" stopColor="#b39cff" />
                    </linearGradient>
                  </defs>
                  <path fill="url(#mindsetHeartGrad)" d="M12 21s-6.7-4.35-9.3-8.1C.8 10.1 1.4 6.6 4.2 5 6.2 3.85 8.7 4.4 10 6.2c.4.55.7 1.1 1 1.65.3-.55.6-1.1 1-1.65 1.3-1.8 3.8-2.35 5.8-1.2 2.8 1.6 3.4 5.1 1.5 7.9C18.7 16.65 12 21 12 21z" />
                </svg>
              </span>
              <input
                id="mindset-input" name="mindset-input"
                type="text"
                className="mindset-input mindset-input-desktop"
                placeholder="한 줄로 나만의 다짐, 각오, 목표를 입력해 보세요."
                value={mindset}
                onFocus={(e) => { if (!guardLogin()) e.target.blur(); }}
                onChange={(e) => { if (guardLogin()) fitMindsetToBox(e.currentTarget, (e.nativeEvent as InputEvent).isComposing === true); }}
                onCompositionEnd={(e) => { if (guardLogin()) fitMindsetToBox(e.currentTarget, false); }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  saveMindsetNow(mindset);
                  e.currentTarget.blur();
                }}
              />
              {/* 🔴 모바일은 **문구가 따로다.** 데스크톱 문구를 그대로 쓰면 반이 잘린다 —
                  데스크톱 문구는 305px(16px/weight500)이라 좁은 칸에서 `overflow:hidden`이
                  문장 중간을 하드컷하고, 그 잘린 자리가 "입력창 칸 경계"로 보인다(사용자 신고).
                  ⚠️ 문구를 늘리려면 먼저 재라. 입력칸 폭 = 바 355 − 라벨 64 − 하트 24 − gap 18 − padding 32
                  = **215px**(2026-08-30 실측). "✓ 저장됨"(44 + gap 9 = 53px)은 모바일에서 뺐다 —
                  그 전에는 162px이었다. font-size는 16px 아래로 못 내린다(iOS 자동확대). */}
              {/* 🔴 모바일은 Enter 핸들러를 두지 않는다 — 두 줄짜리 칸에서 줄바꿈을 막으면
                  "줄바꿈 버튼을 눌렀는데 저장되고 닫힌다"가 된다(사용자 신고 2026-08-29).
                  저장은 onMindsetChange의 800ms 디바운스가 알아서 한다 — Enter로 강제 저장할
                  이유가 없다. 데스크톱 <input>은 애초에 줄바꿈이 불가능하므로 거기만 Enter=저장을 남긴다. */}
              <textarea
                className="mindset-input mindset-input-mobile"
                rows={2}
                placeholder="나만의 다짐 한 줄"
                value={mindset}
                onFocus={(e) => { if (!guardLogin()) e.target.blur(); }}
                onChange={(e) => { if (guardLogin()) fitMindsetToBox(e.currentTarget, (e.nativeEvent as InputEvent).isComposing === true); }}
                onCompositionEnd={(e) => { if (guardLogin()) fitMindsetToBox(e.currentTarget, false); }}
              />
              <span className={`mindset-saved ${mindsetSaved ? "show" : ""}`}>✓ 저장됨</span>
            </div>

            <article className="panel preview-card" onClick={() => { if (guardLogin()) open(dialogs.news); }}>
              <div className="kicker">News</div>
              {!isLoggedIn ? (
                <GuestLockCard
                  kicker="TODAY'S NEWS"
                  title="오늘의 AI · 개발 핵심 브리핑"
                  description="중요한 소식만 골라 한눈에 보여드려요."
                />
              ) : !briefing ? (
                <AiLoadingStage title="오늘의 뉴스를 불러오는 중..." sub="오늘 발행된 AI·Tech 기사를 모으고 있어요." />
              ) : (
                <div className="preview-list">
                  {newsItems.length === 0 && <div className="hint">오늘은 조건에 맞는 핵심 뉴스가 없습니다.</div>}
                  {newsItems.map((n, i) => (
                    <PreviewRow
                      key={i} logo={NEWS_SOURCE_LOGOS[n.source]?.src} logoClass={NEWS_SOURCE_LOGOS[n.source]?.cls} title={n.title}
                      meta={`${n.source} · ${new Date(n.published_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })}`}
                    />
                  ))}
                </div>
              )}
            </article>
            <article className="panel preview-card" onClick={() => { if (guardLogin()) open(dialogs.jobs); }}>
              <div className="kicker">Job Description</div>
              {!isLoggedIn ? (
                <GuestLockCard
                  kicker="CAREER RADAR"
                  title="관심 직무 맞춤 채용공고"
                  description={<>선택한 관심 직무에 맞는 최신 개발자 채용공고를<br />매일 확인하세요.</>}
                />
              ) : hasLegacyRoles ? (
                <div className="role-reset-alert">
                  <TriangleAlert className="role-reset-alert-icon" size={26} strokeWidth={2.2} aria-hidden="true" />
                  <span className="role-reset-alert-badge">직무 재설정 필요</span>
                  <p className="role-reset-alert-desc">
                    관심 직무 체계가 AI 중심으로 개편되었습니다.<br />
                    My Page에서 새 직무를 다시 설정해 주세요.
                  </p>
                </div>
              ) : !jobs ? (
                <AiLoadingStage title="오늘의 채용공고를 불러오는 중..." sub="관심 직무에 맞는 공고를 찾고 있어요." />
              ) : (
                <div className="preview-list job-list">
                  {jobs.jobs.length === 0 && <div className="hint">아직 수집된 공고가 없습니다.</div>}
                  {jobs.jobs.map((j) => (
                    <PreviewRow
                      key={j.id} flat
                      logo={j.source_site ? JOB_SITE_LOGOS[j.source_site]?.src : undefined}
                      logoClass={j.source_site ? JOB_SITE_LOGOS[j.source_site]?.cls : undefined}
                      title={j.title}
                      meta={`${j.company}${j.source_site ? ` · ${j.source_site}` : ""} · ${j.career_requirement ?? ""} · ${j.deadline ?? "상시"}`}
                    />
                  ))}
                </div>
              )}
            </article>

            <div className="panel trend-panel" onClick={() => { if (guardLogin()) open(dialogs.trendBrief); }}>
              <p className="label">AI Trend Briefing</p>
              <p className="smart-subtitle">오늘의 AI 흐름을 한눈에 확인하세요</p>
              <div className="trend-layout">
                <div className="trend-visual">
                  <span className="trend-bubble industry">업계 영향</span>
                  <span className="trend-bubble developer">개발자 동향</span>
                  <span className="trend-bubble tools">도구·서비스</span>
                  <span className="trend-bubble practical">실무 적용</span>
                  <span className="trend-core">AI</span>
                </div>
                <div className="trend-brief-copy">
                  <span className="brief-label">TODAY&apos;S BRIEF</span>
                  <p className="brief-copy-main">오늘 AI 흐름을<br />4가지 관점으로<br />정리했어요.</p>
                  <p className="brief-copy-sub">업계 변화부터<br />실무 적용까지<br />한눈에 확인하세요.</p>
                </div>
              </div>
            </div>

            <div className="panel memo-box mini" onClick={() => { if (guardLogin()) { goToToday(); setMemoFormOpen(false); open(dialogs.memo); } }}>
              <div className="memo-head">
                <button
                  type="button"
                  className="t memo-calendar-open"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (guardLogin()) {
                      goToToday();
                      setMemoFormOpen(false);
                      open(dialogs.memo);
                    }
                  }}
                >
                  Monthly MEMO <span aria-hidden="true">→</span>
                </button>
                <div className="memo-nav"><span>{today.year}.{String(today.month0 + 1).padStart(2, "0")}</span></div>
              </div>
              <div className="week-preview">
                {weekPreview.map((w) => (
                  <div
                    key={w.iso}
                    className={`week-day${w.isToday ? " today" : ""}${w.dow === 0 ? " sunday" : ""}${w.dow === 6 ? " saturday" : ""}`}
                    onClick={(e) => { e.stopPropagation(); if (guardLogin()) openMemoModalAt(w.y, w.m0, w.day); }}
                  >
                    <span className="dow">{WEEKDAY_LABELS[w.dow]}</span>
                    <span className="num">{w.day}</span>
                    {w.hasMemo ? <span className="dot" /> : <span className="dot-placeholder" />}
                  </div>
                ))}
              </div>
              <div className="memo-body-row">
                <div className="today-section">
                  <div className="today-label-row">
                    <div className="today-label">TODAY</div>
                    <span className="today-meta">{todayMemoItems.length} notes · {dueTodayCount} due today</span>
                  </div>
                  {todayMemoItems.length > 0 ? (
                    <>
                      {todayMemoItems.slice(0, 3).map((m) => (
                        <div key={m.id} className="today-item" onClick={(e) => { e.stopPropagation(); if (guardLogin()) openPostitFromDashboard(m); }}>
                          <span className="today-item-icon">{m.is_important ? "★" : m.memo_type === "todo" ? (m.status === "completed" ? "☑" : "☐") : "•"}</span>
                          <span className="today-item-title-group">
                            <span className="today-item-title">{m.title}</span>
                            {m.memo_type === "todo" && <span className="today-item-dday">{ddayLabel(m.end_date)}</span>}
                          </span>
                        </div>
                      ))}
                      {/* 🔴 "더보기"인데 **onClick이 없어서 눌러도 아무 일이 없었다**(2026-08-28 신고).
                          위 today-item들과 같은 경로로, 오늘 날짜의 Monthly MEMO를 연다 —
                          거기에 그날 메모가 전부 있다(주간 미리보기가 쓰는 openMemoModalAt과 동일). */}
                      {todayMemoItems.length > 3 && (
                        <div
                          className="hint hint-action" role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); if (guardLogin()) openMemoModalAt(today.year, today.month0, today.day); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (guardLogin()) openMemoModalAt(today.year, today.month0, today.day); } }}
                        >
                          + {todayMemoItems.length - 3}개 더보기
                        </div>
                      )}
                    </>
                  ) : nextMemo ? (
                    <>
                      <div className="hint">오늘 등록된 메모가 없어요.</div>
                      <div className="today-label" style={{ marginTop: 10 }}>NEXT</div>
                      <div className="next-item" onClick={(e) => { e.stopPropagation(); if (guardLogin()) openPostitFromDashboard(nextMemo); }}>
                        <span className="next-date">{nextMemo.start_date.slice(5)}</span>{nextMemo.title}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hint">아직 예정된 메모가 없어요.</div>
                      <button
                        className="add-btn" style={{ marginTop: 8 }}
                        onClick={(e) => { e.stopPropagation(); if (guardLogin()) { open(dialogs.memo); openCreateMemoForm(); } }}
                      >
                        + 새 메모
                      </button>
                    </>
                  )}
                </div>
                <button
                  className="glass-button focus-btn mini-glass-btn"
                  onClick={(e) => { e.stopPropagation(); if (guardLogin()) open(dialogs.focus); }}
                >
                  <span className="smart-card-title">⚡ Today&apos;s Focus <span className="smart-card-arrow">→</span></span>
                  <span className="smart-card-desc">오늘 먼저 확인할 항목을 추천해요</span>
                  <span className="smart-card-stats">
                    <span className="stat-pill">미완료 {incompleteTodoCount}</span>
                    <span className="stat-pill">오늘 마감 {dueTodayCount}</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="panel proj-panel" onClick={() => { if (guardLogin()) open(dialogs.projects); }}>
              <p className="label">Projects</p>
              {!isLoggedIn ? (
                <GuestLockCard
                  kicker="PROJECT TRACKER"
                  title="아이디어부터 개발까지 진행 관리"
                  description="저장한 프로젝트 아이디어를 한눈에 정리하고 단계별로 관리하세요."
                />
              ) : (
              <>
              <div className="proj-top-row">
                <div className="proj-info">
                  <p className="proj-desc">프로젝트 아이디어를<br />한눈에 정리하고 관리하세요.</p>
                  <div className="proj-count-row">
                    <span className="proj-count-num">{String(projectIdeaCount).padStart(2, "0")}</span>
                    <span className="proj-count-label">Projects</span>
                  </div>
                  <p className="proj-flow">아이디어 → 기획 → 개발까지</p>
                </div>
                <div className="proj-visual">
                  {/* 성장 곡선 — 5-1~5-3절: 단순 직선이 아니라 낮음→작은 상승→완만한 변화→강한 상승의
                      자연스러운 trajectory. ambient glow(뒤) + drop shadow(라인 입체감) + glossy sphere node +
                      halo가 있는 종점 pulse까지 얹어 장식용 그래픽에 생동감/입체감을 준다 */}
                  <svg className="growth-curve" viewBox="0 0 167 100" fill="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="growthGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8a6fd8" />
                        <stop offset="100%" stopColor="#dd6fd6" />
                      </linearGradient>
                      <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a98bff" stopOpacity=".38" />
                        <stop offset="55%" stopColor="#a98bff" stopOpacity=".12" />
                        <stop offset="100%" stopColor="#a98bff" stopOpacity="0" />
                      </linearGradient>
                      <radialGradient id="nodeSphere" cx="35%" cy="30%" r="75%">
                        <stop offset="0%" stopColor="#fff" stopOpacity="1" />
                        <stop offset="45%" stopColor="#fff" stopOpacity=".4" />
                        <stop offset="100%" stopColor="#fff" stopOpacity=".05" />
                      </radialGradient>
                      <radialGradient id="ambientGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#c8a8ff" stopOpacity=".38" />
                        <stop offset="100%" stopColor="#c8a8ff" stopOpacity="0" />
                      </radialGradient>
                      <filter id="growthGlow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="3.6" />
                      </filter>
                      <filter id="growthGlowSoft" x="-120%" y="-120%" width="340%" height="340%">
                        <feGaussianBlur stdDeviation="2.4" />
                      </filter>
                      <filter id="growthShadow" x="-60%" y="-60%" width="220%" height="220%">
                        <feDropShadow dx="0" dy="2.4" stdDeviation="2.2" floodColor="#4a3a90" floodOpacity=".38" />
                      </filter>
                    </defs>
                    {/* radial ambient glow — 그래프 전체 뒤에 은은한 보라 광원 하나를 깔아 배경과 분리된 깊이감을 준다 */}
                    <ellipse cx="95" cy="55" rx="88" ry="56" fill="url(#ambientGlow)" />
                    {/* 아래쪽 옅은 면적 — 불투명한 면 그래프가 아니라 위는 살짝 보이고 아래로 갈수록 투명 */}
                    <path
                      d="M9 82 C 31 78, 37 68, 51 66 C 64 64, 70 74, 79 72 C 95 68, 108 46, 123 38 C 136 32, 147 20, 158 14 L158 100 L9 100 Z"
                      fill="url(#growthAreaGrad)"
                    />
                    {/* 은은한 glow — 메인 라인 뒤에 흐리게 깔아 평면적으로 붙어 보이지 않게 */}
                    <path
                      d="M9 82 C 31 78, 37 68, 51 66 C 64 64, 70 74, 79 72 C 95 68, 108 46, 123 38 C 136 32, 147 20, 158 14"
                      stroke="url(#growthGrad)" strokeWidth="5.5" strokeLinecap="round" opacity=".42" filter="url(#growthGlow)"
                    />
                    {/* 메인 라인 — drop shadow로 카드 표면에서 살짝 떠 보이는 입체감을 준다 */}
                    <path
                      d="M9 82 C 31 78, 37 68, 51 66 C 64 64, 70 74, 79 72 C 95 68, 108 46, 123 38 C 136 32, 147 20, 158 14"
                      stroke="url(#growthGrad)" strokeWidth="3.5" strokeLinecap="round" filter="url(#growthShadow)"
                    />
                    {/* 중간 노드 — halo(흐림) + solid core + 좌상단 glossy highlight로 유리구슬 같은 입체감 */}
                    <circle cx="9" cy="82" r="9" fill="#8a6fd8" opacity=".24" filter="url(#growthGlowSoft)" />
                    <circle cx="9" cy="82" r="5.2" fill="#8a6fd8" />
                    <circle cx="9" cy="82" r="5.2" fill="url(#nodeSphere)" />
                    <circle cx="79" cy="72" r="9" fill="#6f7fe0" opacity=".24" filter="url(#growthGlowSoft)" />
                    <circle cx="79" cy="72" r="5.2" fill="#6f7fe0" />
                    <circle cx="79" cy="72" r="5.2" fill="url(#nodeSphere)" />
                    {/* 종점 하이라이트 — halo에 은은한 pulse 애니메이션을 얹어 그래프의 "지금 여기" 지점을 강조한다 */}
                    <circle className="curve-endpoint-pulse" cx="158" cy="14" r="12" fill="#dd6fd6" opacity=".2" filter="url(#growthGlow)" />
                    <circle cx="158" cy="14" r="6.8" fill="#dd6fd6" />
                    <circle cx="158" cy="14" r="6.8" fill="url(#nodeSphere)" />
                  </svg>
                </div>
                <div className="proj-idea-slot">
                  <button className="add-btn proj-new-btn proj-new-mobile" onClick={(e) => { e.stopPropagation(); if (guardLogin()) openNewProject(); }}>+ New Project</button>
                  <button
                    className="glass-button idea-btn mini-glass-btn"
                    onClick={(e) => { e.stopPropagation(); if (guardLogin()) open(dialogs.idea); }}
                  >
                    <span className="smart-card-title">💡 Idea Build <span className="smart-card-arrow">→</span></span>
                    <span className="smart-card-desc">저장한 아이디어를 구체화해요</span>
                    <span className="smart-card-stats">
                      <span className="stat-pill">프로젝트 아이디어 {projectIdeaCount}개</span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="proj-divider" />
              <div className="proj-status-row">
                <span className="project-status-summary project-status-summary--idea">
                  <span className="project-status-summary__icon"><Lightbulb /></span>
                  <span className="project-status-summary__label">아이디어</span>
                  <span className="project-status-summary__count">{projectIdeaOnlyCount}</span>
                </span>
                <span className="project-status-summary project-status-summary--planning">
                  <span className="project-status-summary__icon"><FileText /></span>
                  <span className="project-status-summary__label">기획안작성</span>
                  <span className="project-status-summary__count">{projectDraftCount}</span>
                </span>
                <span className="project-status-summary project-status-summary--developing">
                  <span className="project-status-summary__icon"><Code2 /></span>
                  <span className="project-status-summary__label">개발중</span>
                  <span className="project-status-summary__count">{projectDevCount}</span>
                </span>
              </div>
              <button className="add-btn proj-new-btn proj-new-desktop" onClick={(e) => { e.stopPropagation(); if (guardLogin()) openNewProject(); }}>+ New Project</button>
              </>
              )}
            </div>

            <div className="panel keynotes-panel" data-memo-theme={theme}>
              <p className="label">Key Notes</p>
              {!isLoggedIn ? (
                <GuestLockCard
                  kicker="KEY NOTES"
                  title="중요 메모를 한곳에 모아보기"
                  description="중요 표시하거나 고정한 메모를 여기서 바로 확인하세요."
                />
              ) : pinnedMemos.length > 0 ? (
                <div className="keynote-pinned-row dash" onClick={() => { if (guardLogin()) openKeyNotes(); }}>
                  {pinnedMemos.slice(0, 3).map((m) => (
                    <div key={m.id} className={`keynote-sticky ${postitColorClass(m.color)}`}>
                      <span className="keynote-sticky-pin">{m.is_pinned ? "📌" : "★"}</span>
                      <div className="keynote-sticky-title">{m.title}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hint" onClick={() => { if (guardLogin()) openKeyNotes(); }} style={{ cursor: "pointer" }}>아직 중요 표시한 메모가 없습니다. 클릭해서 열어보세요.</div>
              )}
            </div>
          </div>

          <footer>SkillPilot — AI·개발 동향과 채용공고, 기록을 한곳에서 관리합니다.</footer>
        </div>
      </main>

      {/* guardLogin()은 어떤 <dialog>도 열지 않은 채 확인 팝업을 띄운다 — selectionOverlays 안의
          confirmDialogNode는 News/Job/Trend 다이얼로그 안에만 있어서, 그 셋 다 닫힌 게스트 상태에서는
          부모 <dialog>가 display:none이라 실제로는 화면에 전혀 보이지 않았다(DOM에는 존재해서 자동화 테스트만
          속았다). 다이얼로그 밖, 항상 마운트된 위치에 한 번 더 렌더링한다. */}
      {confirmDialogNode}

      {/* News — Editorial Glass: 메인 대시보드의 화려한 Liquid Glass와 달리 차분하고 읽기 좋게 */}
      <dialog className="glass-dialog" ref={newsRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head editorial-head">
            <div className="editorial-head-titles">
              <div className="editorial-title-row">
                <h3>News</h3>
                <span className="dialog-update-badge">기본 업데이트 시간 · 매일 오전 10시~11시</span>
              </div>
              <p className="dialog-subtitle">오늘의 AI · 개발 핵심 브리핑</p>
            </div>
            <div className="editorial-head-actions">
              <button className="close-btn" onClick={() => close(dialogs.news)}>✕</button>
            </div>
          </div>
          {!isLoggedIn ? (
            <div className="hint">로그인하면 실제 뉴스가 표시됩니다.</div>
          ) : !briefing ? (
            <AiLoadingStage title="오늘의 뉴스를 불러오는 중..." sub="오늘 발행된 AI·Tech 기사를 모으고 있어요." />
          ) : (
            <>
              {newsHistory.length > 0 && (
                <div className="history-chip-row">
                  <button type="button" className={`history-chip ${newsHistoryDate === null ? "active" : ""}`} onClick={() => setNewsHistoryDate(null)}>오늘</button>
                  {newsHistory.map((h) => (
                    <button
                      type="button" key={h.date} className={`history-chip ${newsHistoryDate === h.date ? "active" : ""}`}
                      onClick={() => setNewsHistoryDate(h.date)}
                    >
                      {historyDateLabel(h.date)}
                    </button>
                  ))}
                </div>
              )}
              {newsHistoryDate === null && briefing.generatedAt && (
                <div className="editorial-meta-row hint">
                  🕐 마지막 업데이트: {formatUpdatedAt(briefing.generatedAt)}
                  {newsDelayed && (
                    <>
                      {!isAdmin && <span className="update-delay-badge">업데이트 지연</span>}
                      <button
                        type="button" className="meta-update-btn" title={isAdmin ? "횟수 제한 없음(관리자)" : "하루 최대 1회"}
                        onClick={handleRetryBriefing}
                        disabled={briefingRetrying}
                        aria-busy={briefingRetrying}
                      >
                        {briefingRetrying ? "업데이트 중..." : "↻ 지금 업데이트"}
                      </button>
                    </>
                  )}
                </div>
              )}
              {newsHistoryDate === null && newsFailed ? (
                <AiErrorState feature="news" isRetrying={briefingRetrying} onRetry={handleRetryBriefing} />
              ) : (
                <>
                  {activeNewsItems.length === 0 && <div className="mock-item">{newsHistoryDate ? "해당 날짜에 저장된 뉴스가 없습니다." : "오늘은 조건에 맞는 핵심 뉴스가 없습니다."}</div>}
                  {activeNewsItems.map((n, i) => (
                <div key={i} className="editorial-card selectable-content" {...selectableHandlers({ type: "news", title: `${n.source} / ${n.title}`, url: n.url })}>
                  <div className="editorial-top-row">
                    <span className="editorial-pill">{n.source}</span>
                    <span className="editorial-date">{new Date(n.published_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" })}</span>
                    <button
                      type="button" className="editorial-save-all-btn"
                      onMouseUp={(e) => e.stopPropagation()} onClick={() => openFullNewsPicker(n)}
                      title="이 뉴스 전체를 메모로 저장"
                    >
                      📥 전체 저장
                    </button>
                    <a className="editorial-link-icon" href={n.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()} title="원문 보기">↗</a>
                  </div>
                  <h4 className="editorial-title">{n.title}</h4>
                  <p className="editorial-summary">{n.summary}</p>
                  <div className="editorial-section">
                    <div className="editorial-section-label">✨ Why it matters</div>
                    <div className="editorial-section-body">{n.reason_selected}</div>
                  </div>
                  {n.related_concepts.length > 0 && (
                    <div className="editorial-section">
                      <div className="editorial-section-label">관련 개념</div>
                      <div className="editorial-tags">
                        {n.related_concepts.map((c, ci) => <span key={ci} className="editorial-tag">{c}</span>)}
                      </div>
                    </div>
                  )}
                  {n.uncertainty && (
                    <div className="editorial-section">
                      <div className="editorial-section-label editorial-uncertainty-label">⚠ 확인되지 않은 내용</div>
                      <div className="editorial-section-body editorial-uncertainty-body">{n.uncertainty}</div>
                    </div>
                  )}
                </div>
              ))}
                </>
              )}
            </>
          )}
          {selectionMenu?.source.type === "news" && radialMenuOverlay}
          {activeDialogKey === "news" && bigEditorNode}
          {selectionOverlays}
        </div>
      </dialog>

      {/* AI Trend Briefing — 뉴스 + GitHub Changelog + Hugging Face를 종합한 분석.
          메인 카드는 카테고리 제목만, 실제 내용은 여기서만 보여준다. 근거가 없는 섹션은 서버에서 null로 온다 */}
      <dialog className="glass-dialog compact" ref={trendBriefRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head"><h3>AI Trend Briefing</h3><button className="close-btn" onClick={() => close(dialogs.trendBrief)}>✕</button></div>
          {/* 트렌드 브리핑은 뉴스와 같은 briefing 행에 저장돼 있어 갱신 시각이 뉴스와 항상 동일하다 */}
          {briefing?.generatedAt && (
            <div className="editorial-meta-row hint">
              🕐 마지막 업데이트: {formatUpdatedAt(briefing.generatedAt)}
              {/* 트렌드 브리핑은 어차피 그날 뉴스를 재료로 만든다 — "전체 재생성"과 "트렌드만"을
                  따로 둘 이유가 없어서 News 쪽과 같은 "지금 업데이트" 하나로 합쳤다. */}
              {newsDelayed && (
                <>
                  {!isAdmin && <span className="update-delay-badge">업데이트 지연</span>}
                  <button
                    type="button" className="meta-update-btn" title={isAdmin ? "횟수 제한 없음(관리자)" : "하루 최대 1회"}
                    onClick={handleRetryBriefing}
                    disabled={briefingRetrying}
                    aria-busy={briefingRetrying}
                  >
                    {briefingRetrying ? "업데이트 중..." : "↻ 지금 업데이트"}
                  </button>
                </>
              )}
            </div>
          )}
          {!isLoggedIn ? (
            <div className="hint">로그인하면 오늘의 AI 트렌드 분석을 볼 수 있습니다.</div>
          ) : !briefing ? (
            <AiLoadingStage title="오늘의 AI 트렌드를 불러오는 중..." sub="뉴스와 개발 생태계 자료를 종합하고 있어요." />
          ) : !trendBriefing ? (
            <AiErrorState feature="briefing" isRetrying={briefingRetrying} onRetry={handleRetryBriefing} />
          ) : (
            <>
              {trendBriefing.industry_impact && (
                <div
                  className="trend-detail-item industry"
                  {...selectableHandlers({ type: "ai_smart_direction", title: "AI Trend Briefing · 업계 영향", url: "" })}
                >
                  <div className="trend-detail-title">
                    <span className="dot" />업계 영향
                    <button
                      type="button" className="editorial-save-all-btn"
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={() => openFullTrendPicker({ mode: "fullTrend", label: "업계 영향", title: null, body: trendBriefing.industry_impact!.content, bullets: null, source: null, url: null })}
                      title="이 항목 전체를 메모로 저장"
                    >
                      📥 전체 저장
                    </button>
                  </div>
                  <div className="trend-detail-body">{trendBriefing.industry_impact.content}</div>
                </div>
              )}
              {trendBriefing.tool_update && (
                <div
                  className="trend-detail-item tools"
                  {...selectableHandlers({ type: "ai_smart_direction", title: trendBriefing.tool_update.title, url: trendBriefing.tool_update.url ?? "" })}
                >
                  <div className="trend-detail-title">
                    <span className="dot" />도구·서비스
                    <button
                      type="button" className="editorial-save-all-btn"
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={() => openFullTrendPicker({
                        mode: "fullTrend", label: "도구·서비스", title: trendBriefing.tool_update!.title, body: trendBriefing.tool_update!.summary,
                        bullets: null, source: trendBriefing.tool_update!.source, url: trendBriefing.tool_update!.url ?? null,
                      })}
                      title="이 항목 전체를 메모로 저장"
                    >
                      📥 전체 저장
                    </button>
                  </div>
                  <div className="trend-detail-subtitle">{trendBriefing.tool_update.title}</div>
                  <div className="trend-detail-body">{trendBriefing.tool_update.summary}</div>
                  <div className="trend-detail-meta">
                    {trendBriefing.tool_update.source}
                    {trendBriefing.tool_update.published_at && ` · ${trendBriefing.tool_update.published_at.slice(0, 10)}`}
                    {trendBriefing.tool_update.url && (
                      <>
                        {" · "}
                        <a className="source-link" href={trendBriefing.tool_update.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문 보기 ↗</a>
                      </>
                    )}
                  </div>
                </div>
              )}
              {trendBriefing.developer_trend && (
                <div
                  className="trend-detail-item developer"
                  {...selectableHandlers({ type: "ai_smart_direction", title: trendBriefing.developer_trend.title, url: trendBriefing.developer_trend.url ?? "" })}
                >
                  <div className="trend-detail-title">
                    <span className="dot" />개발자 동향
                    <button
                      type="button" className="editorial-save-all-btn"
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={() => openFullTrendPicker({
                        mode: "fullTrend", label: "개발자 동향", title: trendBriefing.developer_trend!.title, body: trendBriefing.developer_trend!.summary,
                        bullets: null, source: trendBriefing.developer_trend!.source, url: trendBriefing.developer_trend!.url ?? null,
                      })}
                      title="이 항목 전체를 메모로 저장"
                    >
                      📥 전체 저장
                    </button>
                  </div>
                  <div className="trend-detail-subtitle">{trendBriefing.developer_trend.title}</div>
                  <div className="trend-detail-body">{trendBriefing.developer_trend.summary}</div>
                  <div className="trend-detail-meta">
                    {trendBriefing.developer_trend.source}
                    {trendBriefing.developer_trend.url && (
                      <>
                        {" · "}
                        <a className="source-link" href={trendBriefing.developer_trend.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문 보기 ↗</a>
                      </>
                    )}
                  </div>
                </div>
              )}
              {trendBriefing.practical_takeaways.length > 0 && (
                <div
                  className="trend-detail-item practical"
                  {...selectableHandlers({ type: "ai_smart_direction", title: "AI Trend Briefing · 실무 적용", url: "" })}
                >
                  <div className="trend-detail-title">
                    <span className="dot" />실무 적용
                    <button
                      type="button" className="editorial-save-all-btn"
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={() => openFullTrendPicker({ mode: "fullTrend", label: "실무 적용", title: null, body: "", bullets: trendBriefing.practical_takeaways, source: null, url: null })}
                      title="이 항목 전체를 메모로 저장"
                    >
                      📥 전체 저장
                    </button>
                  </div>
                  <ul className="trend-takeaways">
                    {trendBriefing.practical_takeaways.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
          {selectionMenu?.source.type === "ai_smart_direction" && radialMenuOverlay}
          {/* 이 줄이 없어서 AI Trend "전체 저장 → 기존 메모"가 아무 반응 없이 묻혔다 —
              confirmPendingSave가 openBigEditor()로 state는 세팅해도 편집창 JSX 자체가
              이 다이얼로그 안에 없었다(news/jobs엔 있었음). 새 메모 경로는 서버 액션만
              쓰기 때문에 정상 동작해서 증상이 "기존 메모만 안 됨"으로 보였다. */}
          {activeDialogKey === "trendBrief" && bigEditorNode}
          {selectionOverlays}
        </div>
      </dialog>

      {/* Job Description — Editorial Glass: "이 공고 분석하기" 기능은 삭제된 상태이므로 관련 CTA를 추가하지 않는다 */}
      <dialog className="glass-dialog" ref={jobsRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head editorial-head">
            <div className="editorial-head-titles">
              <div className="editorial-title-row">
                <h3>Job Description</h3>
                <span className="dialog-update-badge">기본 업데이트 시간 · 매일 오전 10시~11시</span>
              </div>
              <p className="dialog-subtitle">관심 직무 기준 추천 채용공고</p>
            </div>
            <div className="editorial-head-actions">
              <button className="close-btn" onClick={() => close(dialogs.jobs)}>✕</button>
            </div>
          </div>
          {!isLoggedIn ? (
            <div className="hint">로그인하면 실제 채용공고가 표시됩니다.</div>
          ) : hasLegacyRoles ? (
            <div className="job-role-reset-notice">
              <TriangleAlert className="role-reset-alert-icon" size={26} strokeWidth={2.2} aria-hidden="true" />
              <span className="role-reset-alert-badge">직무 재설정 필요</span>
              <p>
                관심 직무 설정이 새 AI 직군 체계로 변경되었습니다.<br />
                채용공고 추천을 받으려면 My Page에서 관심 직무와 우선순위를 다시 설정해 주세요.
              </p>
              <button type="button" className="meta-update-btn" onClick={() => { close(dialogs.jobs); openMyPage(); }}>
                관심 직무 다시 설정
              </button>
            </div>
          ) : !jobs ? (
            <AiLoadingStage title="오늘의 채용공고를 불러오는 중..." sub="관심 직무에 맞는 공고를 찾고 있어요." />
          ) : (
            <>
              {jobTab === "recommended" && jobs.lastUpdated && (
                <div className="editorial-meta-row hint">
                  🕐 마지막 업데이트: {formatUpdatedAt(jobs.lastUpdated)}
                  {jobsDelayed && (
                    <>
                      {!isAdmin && <span className="update-delay-badge">업데이트 지연</span>}
                      <button
                        type="button" className="meta-update-btn" title={isAdmin ? "횟수 제한 없음(관리자)" : "하루 최대 1회"}
                        onClick={handleRetryJobs}
                        disabled={jobsRetrying}
                        aria-busy={jobsRetrying}
                      >
                        {jobsRetrying ? "업데이트 중..." : "↻ 지금 업데이트"}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="job-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={jobTab === "recommended"} className={`job-tab ${jobTab === "recommended" ? "is-active" : ""}`} onClick={() => selectJobTab("recommended")}>추천 공고</button>
                <button type="button" role="tab" aria-selected={jobTab === "recent"} className={`job-tab ${jobTab === "recent" ? "is-active" : ""}`} onClick={() => selectJobTab("recent")}>최근 추천</button>
              </div>

              {jobTab === "recommended" && jobsFailed ? (
                <AiErrorState feature="jobs" isRetrying={jobsRetrying} onRetry={handleRetryJobs} />
              ) : (
                <div className="job-list">
                  {jobTab === "recommended" && (
                    jobs.jobs.length === 0
                      ? <div className="mock-item">아직 수집된 공고가 없습니다.</div>
                      : jobs.jobs.map(renderJobCard)
                  )}
                  {jobTab === "recent" && (
                    jobsRecent === null
                      ? <div className="hint">불러오는 중...</div>
                      : jobsRecent.length === 0
                        ? <div className="mock-item">아직 더 볼 이전 추천 공고가 없습니다.</div>
                        : jobsRecent.map(renderJobCard)
                  )}
                </div>
              )}
            </>
          )}
          {selectionMenu?.source.type === "job" && radialMenuOverlay}
          {activeDialogKey === "jobs" && bigEditorNode}
          {selectionOverlays}
        </div>
      </dialog>

      {/* Monthly MEMO 상세 */}
      {/* monthly-memo-dialog + memo-compose-open: 모바일에서 작성 중일 때 달력/목록을 숨기고
          작성 폼을 전체화면으로 키우는 CSS 훅(모바일 전용, 720px 이하에서만 동작) */}
      {/* onCancel(Esc/뒤로) 역시 기본 동작이 close()라 작성 중 내용이 유실됐다 — 바깥 클릭과 같은
          저장 경로로 돌린다. */}
      <dialog
        // compose-page + memo-edit-page: 모바일 작성 중에만 붙는다. 앞은 이 다이얼로그를 일반 흐름
        // 블록으로 만드는 훅이고, 뒤는 **모바일 메모 편집과 공유하는 마커**다(내부 스크롤러 제거·
        // 툴바 sticky·scrollTo/scrollIntoView 가드가 전부 그 클래스에 걸려 있다).
        className={`glass-dialog big tonedown monthly-memo-dialog${memoFormOpen ? ` memo-compose-open memo-compose-color-${formColor}` : ""}`}
        ref={memoRef} data-memo-theme={theme} onClick={onDialogBackdropClick}
        onCancel={(e) => { if (memoFormOpen) { e.preventDefault(); void handleMemoDialogBack(); } }}
      >
        <div className="dialog-inner">
          <div className="dialog-head" style={{ marginBottom: 4 }}>
            <h3 className="monthly-dialog-title"><span>Monthly MEMO</span><small>{memoDialogDateIso}</small></h3>
            <div className="dialog-head-right">
              {memoFormOpen && autosaveStatusNode}
              {memoFormOpen && (
                <div className="mobile-editor-head-actions">
                  <button type="button" aria-label="실행 취소" onClick={() => compactEditorRef.current?.undo()}><Undo2 size={18} strokeWidth={2} /></button>
                  <button type="button" aria-label="다시 실행" onClick={() => compactEditorRef.current?.redo()}><Redo2 size={18} strokeWidth={2} /></button>
                  <button type="button" className={`mobile-important-btn ${formImportant ? "active" : ""}`} aria-label="중요 메모" onClick={() => setFormImportant((v) => !v)}>{formImportant ? "★" : "☆"}</button>
                  <button type="button" className="mobile-more-btn" aria-label="메모 더보기" onClick={() => setMobileMemoMenuOpen(true)}>⋮</button>
                </div>
              )}
              <button className="close-btn" onClick={handleMemoDialogBack}>✕</button>
            </div>
          </div>

          <div ref={memoFormRef} className={`memo-form ${memoFormOpen ? "open" : ""}`}>
            <div className="form-meta-row">
              {/* compose mode(모바일)에서만 order:-1로 맨 위로 올리기 위한 래퍼 — display:contents라
                  데스크톱/평상시 레이아웃(form-meta-row 순서)에는 전혀 영향을 주지 않는다. */}
              <div className="memo-title-compose-row">
                <input
                  id="memo-create-title" name="memo-create-title"
                  type="text" className="form-title-input"
                  placeholder="제목"
                  value={formTitle} onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
                />
              </div>
              <MemoTypeDropdown value={formType} onChange={setFormType} />
              <label className="field-with-label sm"><span className="field-label">시작일</span><MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} /></label>
              <label className="field-with-label sm"><span className="field-label">종료일</span><MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} /></label>
              {memoDateError && <span className="memo-date-error" role="alert">{memoDateError}</span>}
              <span className={`star-toggle ${formImportant ? "active" : ""}`} title="중요 메모로 지정" onClick={() => setFormImportant((v) => !v)}>{formImportant ? "★" : "☆"}</span>
            </div>
            {formType === "todo" && (
              <div className="status-select-group">
                {STATUS_OPTIONS.map(([value, label, color, bg]) => (
                  <span
                    key={value}
                    className={`status-option ${formStatus === value ? "active" : ""}`}
                    style={formStatus === value ? { background: bg, color } : undefined}
                    onClick={() => setFormStatus(value)}
                  >
                    <span className="dot" style={{ background: color }} />{label}
                  </span>
                ))}
              </div>
            )}
            <div className="memo-color-action-row">
              <ColorSwatches value={formColor} onChange={setFormColor} />
              <button type="button" className="expand-btn" onClick={() => openBodyEditor("memo")}>
                <span aria-hidden="true">⛶</span> 확장
              </button>
            </div>

            <div className="textarea-row main">
              <MemoRichEditor
                key={`compact-${formSessionKey}`}
                ref={compactEditorRef}
                initialValue={formBody}
                bodyClassName={colorInputClass(formColor)}
                memoColor={formColor}
                onMemoColorChange={setFormColor}
                onChange={(html) => { setFormBodyWhileTyping(html); scheduleAutosave({ content: html }); }}
              />
            </div>

            <div className="form-footer-row">
              {editingMemoId ? (
                <button className="cancel-btn" onClick={() => handleDeleteMemo(editingMemoId)}>삭제</button>
              ) : <div />}
              <div className="form-actions">
                <button className="cancel-btn" onClick={() => setMemoFormOpen(false)}>취소</button>
                <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
              </div>
            </div>
          </div>

          <div className="memo-head" style={{ marginBottom: 8, marginTop: 2 }}>
            <div className="memo-nav">
              <div className="memo-nav-left">
                <span className="nav-group">
                  <button type="button" disabled={viewLoading} onClick={() => goToMonth(-1)}>‹</button>
                  <span>{viewYear}.{String(viewMonth0 + 1).padStart(2, "0")}</span>
                  <button type="button" disabled={viewLoading} onClick={() => goToMonth(1)}>›</button>
                </span>
                <button className="memo-add" onClick={goToToday}>Today</button>
              </div>
              {/* 캘린더 그리드와 같은 폭이라 오른쪽 끝(토요일 컬럼) 위로 온다 */}
              <button className="add-btn memo-create-desktop" onClick={() => (memoFormOpen ? setMemoFormOpen(false) : openCreateMemoForm())}>+ Create</button>
              {/* 모바일 전용 — 데스크톱 버튼은 CSS로 숨기고, 좁은 화면에서 memo-nav-left 옆 그리드 칸에 둔다 */}
              <button className="add-btn memo-create-mobile" onClick={() => (memoFormOpen ? setMemoFormOpen(false) : openCreateMemoForm())}>+ Create</button>
            </div>
          </div>
          <div className="cal-scroll-shell">
            <div className="cal-weekdays"><span style={{ color: "#e0446b" }}>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style={{ color: "#3b6fd8" }}>토</span></div>
            <div className="cal-grid">
              {bigCalCells.map((c, i) => (
                c.day === null ? <div key={i} className="cal-cell empty" /> : (
                  <div
                    key={i}
                    className={`cal-cell${c.day === today.day && viewYear === today.year && viewMonth0 === today.month0 ? " today" : ""}${c.day === memoDialogDay ? " selected" : ""}`}
                    onClick={() => { setMemoDialogDay(c.day!); setDateRangeMode("selected-day"); }}
                  >
                    <div className={`num ${c.numClass}`}>{c.day}</div>
                    {c.day === memoDialogDay && (
                      <button className="cal-cell-add" onClick={(e) => { e.stopPropagation(); openCreateMemoForm(); }} title="이 날짜에 메모 추가">+</button>
                    )}
                    {c.memos.map((m) => (
                      <span
                        key={m.id}
                        className={`memo-chip${m.is_important ? " star" : ""}`}
                        onClick={(e) => { e.stopPropagation(); openPostitView(m); }}
                      >
                        {m.is_important ? "★ " : ""}{m.emoji ? `${m.emoji} ` : ""}{m.title}
                      </span>
                    ))}
                    {c.overflow > 0 && <span className="cal-more-indicator" aria-label="더 많은 메모가 있어요">+{c.overflow}</span>}
                    {/* 모바일에서는 64px 셀에 칩 목록 대신 총 개수 배지만 보여준다(칩/더보기 표시는 CSS로 숨김) */}
                    {c.memos.length > 0 && (
                      <span className="mobile-cal-preview" aria-label={`메모 ${c.memos.length + c.overflow}개`}>
                        <span className="mobile-cal-total">{c.memos.length + c.overflow}</span>
                      </span>
                    )}
                  </div>
                )
              ))}
            </div>
          </div>

          <div className="keynote-divider"><span>✦</span></div>

          <div className="memo-toolbar">
            <input id="memo-search" name="memo-search" className="memo-search" placeholder="제목·본문 검색" value={memoSearch} onChange={(e) => setMemoSearch(e.target.value)} />
            <DateRangeSelector
              mode={dateRangeMode}
              customStart={customRangeStart}
              customEnd={customRangeEnd}
              todayIso={todayIso}
              onSelectMode={setDateRangeMode}
              onApplyCustomRange={(start, end) => { setCustomRangeStart(start); setCustomRangeEnd(end); setDateRangeMode("custom"); }}
            />
            <div className="memo-trash-wrap">
              <button
                type="button"
                className={`memo-trash-btn ${memoSelectionMode && selectedMemoIds.size > 0 ? "danger" : ""}`}
                onClick={handleMemoTrashClick}
              >
                <Trash2 size={16} strokeWidth={2.2} />
              </button>
              <span className="memo-trash-tooltip">
                {!memoSelectionMode ? "선택 삭제" : selectedMemoIds.size === 0 ? "선택 취소" : `선택한 메모 ${selectedMemoIds.size}개 삭제`}
              </span>
            </div>
            <div className="chip-row">
              {[["all", "전체"], ["todo", "Todo"], ["dev_note", "Dev Note"], ["free_note", "Free Note"], ["unfinished", "미완료"]].map(([key, label]) => (
                <span key={key} className={`chip chip-${key} ${typeFilter === key ? "active" : ""}`} onClick={() => setTypeFilter(key)}>{label}</span>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <div>
              {memosForMonth === null && <div className="hint">로그인하면 메모를 기록할 수 있습니다.</div>}
              {memosForMonth !== null && filteredMemos.length === 0 && (
                <div className="hint">
                  {isSearchingOrFiltering ? "검색 결과가 없습니다." : dateRangeMode === "selected-day" ? "이 날의 메모가 없습니다." : "표시할 메모가 없습니다."}
                </div>
              )}
              {filteredMemos.map((m) => (
                <div
                  key={m.id} className="memo-row"
                  onClick={() => (memoSelectionMode ? toggleMemoSelected(m.id) : openPostitView(m))}
                >
                  {memoSelectionMode && (
                    <input
                      id={`memo-select-${m.id}`} name={`memo-select-${m.id}`}
                      type="checkbox" className="memo-select-checkbox"
                      checked={selectedMemoIds.has(m.id)}
                      onChange={() => toggleMemoSelected(m.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <span
                    className={`star-toggle ${m.is_important ? "active" : ""}`}
                    title={m.is_pinned ? "고정 해제" : m.is_important ? "고정하기" : "중요 표시"}
                    onClick={(e) => void cycleMemoStar(m, e)}
                  >
                    {m.is_pinned ? "📌" : m.is_important ? "★" : "☆"}
                  </span>
                  <div className="body">
                    <div className="t"><span className={`type-badge ${m.memo_type}`}>{m.memo_type === "todo" ? "Todo" : m.memo_type === "dev_note" ? "Dev Note" : "Free Note"}</span>{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
                    <div className="s">
                      {m.status && <span className={`status-pill ${m.status === "planned" ? "planned" : m.status === "in_progress" ? "progress" : "done"}`}>{m.status === "planned" ? "예정" : m.status === "in_progress" ? "진행 중" : "완료"}</span>}
                      {m.start_date === m.end_date ? m.start_date : `${m.start_date} ~ ${m.end_date}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {postitHostDialogKey === "memo" && postitViewNode}
        {activeDialogKey === "memo" && bigEditorNode}
        {/* 🔴 compose가 **일반 페이지로 내려간 상태**에서는 이 안에 두면 안 된다 — 시트가 화면 밖으로 나간다.
            `.glass-dialog`에 `backdrop-filter: blur(30px) saturate(1.6)`이 걸려 있고,
            **backdrop-filter는 `position: fixed` 자손의 컬테이닝 블록을 만든다.**
            그래서 시트 백드롭(`position:fixed; inset:0`)이 뷰포트(684)가 아니라 **다이얼로그 높이**를 따른다
            (실측 375×1557), `align-items: flex-end`라 시트가 y=1418 = 화면 밖으로 간다
            = 사용자 신고 "더보기 누르면 팝업창이 밑에 가서 안 보임".
            일반메모는 순수 <div>라 이 문제가 없다 — 그래서 compose만 혼자 이상했다.
            모달로 떠 있을 때(비-compose 경로)는 top layer 위에 있어야 하므로 여기가 맞다. */}
        {memoFormOpen && !monthlyComposePage && renderMobileMemoOptionsSheet()}
        {confirmDialogNode}
      </dialog>

      {/* Key Notes */}
      <dialog
        className="glass-dialog big tonedown" ref={keynotesRef} data-memo-theme={theme} onClick={onDialogBackdropClick}
        onCancel={(e) => { if (pinnedFullView) { e.preventDefault(); setPinnedFullView(false); } }}
      >
        <div className="dialog-inner">
          <div className="dialog-head">
            {pinnedFullView ? (
              <button type="button" className="keynote-back-btn" onClick={() => setPinnedFullView(false)}>← Key Notes</button>
            ) : (
              <h3>Key Notes</h3>
            )}
            <button className="close-btn" onClick={() => (pinnedFullView ? setPinnedFullView(false) : close(dialogs.keynotes))}>✕</button>
          </div>

          {pinnedFullView ? (
            <>
              <p className="keynote-group-title">📌 고정 메모 <span className="keynote-drag-hint">{pinnedMemos.length}개 · 드래그해서 순서를 바꿀 수 있어요</span></p>
              {pinnedMemos.length === 0 ? (
                <div className="hint">중요 표시(☆→★)나 고정(📌)한 메모가 여기 모입니다.</div>
              ) : (
                <KeynoteCardList key={`pin-full-${keynotesOpenSeq}`} memos={pinnedMemos} pinned group="pinned" className="keynote-pinned-grid" onTap={openPostitView} />
              )}
            </>
          ) : (
            <>
              {pinnedMemos.length === 0 && priorityMemos.length === 0 && <div className="hint">중요 표시(☆→★)나 고정(📌)한 메모가 여기 모입니다.</div>}

              {pinnedMemos.length > 0 && (
                <>
                  <p className="keynote-group-title">
                    📌 고정 메모 <span className="keynote-drag-hint">— 드래그해서 순서를 바꿀 수 있어요</span>
                    <button type="button" className="keynote-fullview-btn" onClick={() => setPinnedFullView(true)}>전체보기</button>
                  </p>
                  <KeynoteCardList key={`pin-${keynotesOpenSeq}`} memos={pinnedMemos} pinned group="pinned" className="keynote-pinned-row" onTap={openPostitView} />
                </>
              )}

              {pinnedMemos.length > 0 && priorityMemos.length > 0 && <div className="keynote-divider"><span>✦</span></div>}

              {priorityMemos.length > 0 && (
                <>
                  <p className="keynote-group-title">
                    <span className="priority-star">★</span> 중요 메모
                    <span className="keynote-drag-hint">— 드래그해서 순서를 바꿀 수 있어요</span>
                  </p>
                  <KeynoteCardList key={`star-${keynotesOpenSeq}`} memos={priorityMemos} pinned={false} group="priority" className="keynote-rest-grid" onTap={openPostitView} />
                </>
              )}
            </>
          )}
        </div>
        {postitHostDialogKey === "keynotes" && postitViewNode}
        {activeDialogKey === "keynotes" && bigEditorNode}
        {confirmDialogNode}
      </dialog>

      {/* 본문 크게 보기 */}
      <dialog className="glass-dialog full body-editor" ref={bodyEditorRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head">
            <div className="body-editor-head-left">
              <h3>{bodyEditorTarget === "project" ? "프로젝트 내용" : "본문 작성"}</h3>
              {/* 색상 선택은 메모 전용 — 프로젝트 화면에는 넣지 않는다 */}
              {bodyEditorTarget === "memo" && <ColorSwatches value={formColor} onChange={setFormColor} />}
              {bodyEditorTarget === "project" && (
                <div className="proj-template-toggle" role="group" aria-label="본문 시작 방식">
                  <button type="button" className="proj-template-btn" onClick={() => applyProjectTemplate("bodyEditor")}>기본 템플릿</button>
                </div>
              )}
            </div>
            <div className="dialog-head-right">
              {bodyEditorTarget === "memo" && autosaveStatusNode}
              {bodyEditorTarget === "project" && projAutosaveStatusNode}
              <button className="close-btn" onClick={closeBodyEditor}>✕</button>
            </div>
          </div>
          <div className="dialog-body-scroll" ref={bodyEditorScrollRef} onScroll={onBodyEditorScroll}>
            {bodyEditorTarget === "project" && (
              <span className="proj-template-hint">템플릿을 선택하면 기본 구조가 자동으로 입력됩니다.</span>
            )}
            {/* News/Job/AI Trend → 기존 메모 삽입 context는 Quick Editor(bigEditorNode)에서 확장으로
                넘어와도 사라지면 안 된다(9~10절) — bigEditorNode는 언마운트되지만 pendingInsert 자체는
                살아있는 state이므로 여기서도 같은 한 줄 bar를 그대로 보여준다. dialog-body-scroll이
                더 이상 자체 스크롤하지 않고(아래 CSS) Editor 내부만 스크롤하므로, 본문을 아무리
                내려도 이 bar는 화면에 그대로 남는다. */}
            {bodyEditorTarget === "memo" && pendingInsert && (
              <div className="insert-bar">
                <span className="insert-bar-label">삽입 대기</span>
                <span className="insert-bar-preview" title={pendingInsert.text}>&ldquo;{pendingInsert.text}&rdquo;</span>
                {/* 🔴 세 경로를 준다. `onClick={insertPendingAtCursor}`로 함수를 그대로 넘기면
                안 된다 — 클릭 이벤트가 첫 인자(where)로 들어간다. 반드시 화살표로 감싼다. */}
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("start")}>맨 위</button>
            <button type="button" className="add-btn insert-at-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("end")}>맨 아래</button>
            <button type="button" className="add-btn" {...KEEP_EDITOR_FOCUS}
              onClick={() => void insertPendingAtCursor("cursor")}>커서 위치</button>
              </div>
            )}
            <MemoRichEditor
              key={`expand-${bodyEditorSessionKey}`}
              ref={bodyEditorHandleRef}
              initialValue={bodyEditorDraft}
              bodyClassName={`body-editor-textarea ${bodyEditorTarget === "memo" ? colorInputClass(formColor) : ""}`}
              placeholder={bodyEditorTarget === "project" ? PROJECT_BODY_PLACEHOLDER : "본문 — 여기서 길게 써도 됩니다"}
              enableTextColor={bodyEditorTarget === "project"}
              onChange={(html) => {
                setBodyEditorDraftWhileTyping(html);
                if (bodyEditorTarget === "memo") scheduleAutosave({ content: html });
                else scheduleProjectAutosave({ content: html }); // 신규 작성 중이면 editingProjectId가 없어 조용히 무시된다
              }}
            />
            {projTemplatePrompt === "bodyEditor" && projTemplatePromptNode}
          </div>
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button className="save-btn" onClick={closeBodyEditor}>완료</button>
          </div>
        </div>
        <ScrollTopButton ref={bodyEditorScrollBtnRef} onClick={scrollBodyEditorToTop} />
      </dialog>

      {/* Projects 목록 */}
      <dialog className="glass-dialog big tonedown projects-list-dialog" ref={projectsRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head">
            <div className="project-list-title-group">
              <h3>프로젝트 아이디어</h3>
              <span className="project-total-badge">{projectIdeaCount} Projects</span>
            </div>
            <button className="close-btn" onClick={() => close(dialogs.projects)}>✕</button>
          </div>

          {projectIdeas === null ? (
            <div className="hint">로그인하면 프로젝트 아이디어를 기록할 수 있습니다.</div>
          ) : (
            <>
              <div className="proj-toolbar">
                <input
                  id="proj-search" name="proj-search"
                  className="proj-search" placeholder="프로젝트 검색"
                  value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
                />
                <ProjectStatusFilterDropdown value={projectStatusFilter} onChange={setProjectStatusFilter} />
                <button className="add-btn proj-new-btn" onClick={openNewProject}>+ Project</button>
              </div>

              {projectIdeas.length === 0 ? (
                // 위 툴바에 이미 "+ Project" 버튼이 있다 — 목록이 비었을 때 여기 또 하나를 더 띄워
                // 같은 화면에 버튼이 두 개 뜨고 있었다. 안내 문구만 남긴다.
                <div className="proj-empty">
                  <div className="hint">아직 등록된 프로젝트가 없습니다.<br />새로운 아이디어를 기록해보세요.</div>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="hint">조건에 맞는 프로젝트가 없습니다.</div>
              ) : (
                <div className="proj-table">
                  <div className="proj-table-row proj-table-head project-table-header">
                    <span className="proj-col-name">프로젝트명</span>
                    <span className="proj-col-summary">한 줄 요약</span>
                    <span className="proj-col-status">상태</span>
                    <span className="proj-col-updated">최근 수정</span>
                  </div>
                  {filteredProjects.map((p) => (
                    <button type="button" key={p.id} className="proj-table-row project-list-row" onClick={() => openExistingProject(p)}>
                      <span className="proj-col-name project-list-title">{p.title}</span>
                      <span className="proj-col-summary project-list-summary">{p.summary}</span>
                      <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                      <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, today.year)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="proj-legend">
                <span className="proj-legend-label">상태별 색상 안내</span>
                <div className="proj-legend-row">
                  {PROJECT_STATUSES.map((s) => <ProjectStatusBadge key={s} status={s} />)}
                </div>
              </div>
            </>
          )}
        </div>
      </dialog>

      {/* Project 상세 — CREATE/EDIT는 Monthly Memo 본문 에디터 재사용, VIEW는 읽기 좋은 document 렌더 */}
      <dialog className="glass-dialog full tonedown" ref={projectDetailRef} onClick={onDialogBackdropClick}>
        <div
          className={`dialog-inner proj-detail-inner ${projMode !== "view" ? "proj-detail-editing" : ""} ${projMode === "edit" && editingProjectId ? "proj-detail-existing" : ""}`}
          ref={projMode === "view" ? projectDetailScrollRef : undefined}
          onScroll={projMode === "view" ? onProjectDetailScroll : undefined}
        >
          <div className="dialog-head proj-detail-head">
            {projMode !== "view" && (
              <div className="mobile-editor-head-actions mobile-project-head-actions">
                <button type="button" aria-label="실행 취소" onClick={() => projectEditorRef.current?.undo()}><Undo2 size={18} strokeWidth={2} /></button>
                <button type="button" aria-label="다시 실행" onClick={() => projectEditorRef.current?.redo()}><Redo2 size={18} strokeWidth={2} /></button>
                {editingProjectId && <button type="button" className="mobile-more-btn" aria-label="프로젝트 더보기" onClick={() => setMobileProjectMenuOpen(true)}>⋮</button>}
              </div>
            )}
            <button
              className="close-btn project-back-btn"
              aria-label="프로젝트 목록으로 돌아가기"
              onClick={() => {
                const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
                if (mobile) handleProjectDetailBack();
                else close(dialogs.projectDetail);
              }}
            >
              <span className="desktop-close-symbol">✕</span><span className="mobile-back-symbol">‹</span>
            </button>
          </div>

          {projMode === "view" ? (
            <>
              <div className="proj-view-head">
                <div className="proj-view-title-group">
                  <h2 className="proj-view-title">{projTitle}</h2>
                  {projSummary && <p className="proj-view-summary">{projSummary}</p>}
                </div>
                <ProjectStatusBadge status={projStatus} />
                {projUpdatedAt && (
                  <span className="proj-view-updated">
                    <CalendarDays size={14} strokeWidth={1.8} /> 업데이트 {formatProjectUpdated(projUpdatedAt, today.year)}
                  </span>
                )}
              </div>

              <div className="proj-note-label"><NotebookPen size={20} strokeWidth={1.9} /> 프로젝트 노트</div>
              <div
                className="rich-content-view proj-note-view"
                onClick={(e) => {
                  // 핵심 기능 체크만 inline 허용 — 본문 텍스트 변경은 [수정]에서 한다
                  const li = (e.target as HTMLElement).closest("li[data-checked]");
                  if (!li) return;
                  const all = Array.from(e.currentTarget.querySelectorAll("li[data-checked]"));
                  toggleProjectTask(all.indexOf(li));
                }}
                dangerouslySetInnerHTML={{ __html: projContent || "<p>(내용 없음)</p>" }}
              />

              <div className="form-actions" style={{ marginTop: 26 }}>
                <button className="cancel-btn" onClick={() => close(dialogs.projectDetail)}>취소</button>
                <button className="edit-btn" onClick={() => { setProjMode("edit"); setProjEditorKey((k) => k + 1); resetProjectDetailScroll(); }}>✎ 수정</button>
                <button className="save-btn" disabled={savingProject} onClick={handleSaveProject}>{savingProject ? "저장 중..." : "저장"}</button>
                <button className="delete-btn" onClick={handleDeleteProject}>🗑 삭제</button>
              </div>
            </>
          ) : (
            <>
              <div className="dialog-body-scroll" ref={projectDetailScrollRef} onScroll={onProjectDetailScroll}>
              {/* 우측 여백을 채우는 패널을 title 옆 한 줄에만 놓으면 그 아래(한줄요약·상태) 줄까지는
                  못 채운다는 게 4번째 지적의 핵심이었다 - "상단에만 쳐놓으면 뭐 함". 그래서 title
                  행 + summary 행을 왼쪽 스택(.proj-top-cluster-left)으로 묶고, 오른쪽에 두 행 높이를
                  전부 커버하는 패널 하나(.proj-coming-soon, align-items:stretch)를 둔다.
                  모바일에서는 .proj-top-cluster/-left를 display:contents로 지워서 .proj-form-grid,
                  .proj-summary-row, .mobile-project-summary-popover가 여전히 .dialog-body-scroll의
                  직계 flex 자식처럼 동작하게 한다 - 안 그러면 기존 order:-2/-1 재배치 트릭이 깨진다. */}
              <div className="proj-top-cluster">
                <div className="proj-top-cluster-left">
                  <div className="proj-form-grid">
                    <div className="proj-field">
                      <label className="proj-field-label" htmlFor="proj-title">프로젝트명</label>
                      <div className="mobile-project-title-row">
                        <input
                          id="proj-title" type="text" className="form-title-input" placeholder="프로젝트명을 입력하세요"
                          value={projTitle}
                          onChange={(e) => { setProjTitle(e.target.value); scheduleProjectAutosave({ title: e.target.value }); }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="proj-summary-row">
                    <div className="proj-field proj-summary-field">
                      <div className="proj-summary-field-head">
                        <label className="proj-field-label" htmlFor="proj-summary">한 줄 요약</label>
                        <span className="proj-summary-badge">최대 {SUMMARY_MAX_LENGTH}자</span>
                        {projAutosaveStatusNode}
                      </div>
                      <div className="proj-summary-input-wrap">
                        <input
                          id="proj-summary" type="text" placeholder="프로젝트를 한 줄로 요약해보세요"
                          maxLength={SUMMARY_MAX_LENGTH} value={projSummary}
                          onChange={(e) => {
                            const next = e.target.value.slice(0, SUMMARY_MAX_LENGTH);
                            setProjSummary(next);
                            scheduleProjectAutosave({ summary: next });
                          }}
                        />
                        <span className="proj-summary-counter">{projSummary.length} / {SUMMARY_MAX_LENGTH}</span>
                      </div>
                      {projSummaryError && <div className="proj-summary-error">{projSummaryError}</div>}
                    </div>
                    <div className="proj-field proj-field--status">
                      <span className="proj-field-label">상태</span>
                      <div className="mobile-project-status-row">
                        <ProjectStatusFilterDropdown
                          value={projStatus}
                          onChange={(v) => { setProjStatus(v); scheduleProjectAutosave({ status: v }); }}
                          includeAll={false}
                        />
                        <button type="button" className="mobile-project-summary-toggle" aria-expanded={mobileProjectSummaryOpen} onClick={() => setMobileProjectSummaryOpen((v) => !v)}>한 줄 요약⌄</button>
                      </div>
                    </div>
                  </div>

                  {/* 토글 바로 아래에 열려야 하므로 .proj-summary-row 직후에 둔다(데스크톱에서는 display:none) */}
                  {mobileProjectSummaryOpen && (
                    <div className="mobile-project-summary-popover">
                      <input
                        type="text" placeholder="프로젝트를 30자 이내로 요약해보세요"
                        maxLength={SUMMARY_MAX_LENGTH} value={projSummary}
                        onChange={(e) => { const next = e.target.value.slice(0, SUMMARY_MAX_LENGTH); setProjSummary(next); scheduleProjectAutosave({ summary: next }); }}
                        onBlur={() => setMobileProjectSummaryOpen(false)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      />
                      <span>{projSummary.length}/{SUMMARY_MAX_LENGTH}</span>
                    </div>
                  )}
                </div>

                {/* 리퀴드 글래스 오브 - Idea Build 결과 화면의 .idea-direction-orb + 배경 .blob을
                    그대로 가져왔다(사용자가 시안 중 "리퀴드 글래스 오브" 선택). 모바일에서는
                    통째로 숨긴다(dashboard.css (17)절). */}
                <div className="proj-coming-soon" aria-hidden="true">
                  <span className="proj-coming-soon-blob proj-coming-soon-blob-a" />
                  <span className="proj-coming-soon-blob proj-coming-soon-blob-b" />
                  <span className="proj-coming-soon-orb">
                    <Sparkles size={34} strokeWidth={1.9} />
                  </span>
                  <span className="proj-coming-soon-copy">
                    <span className="proj-coming-soon-label">기능 추가 예정</span>
                    <strong className="proj-coming-soon-main">곧, 새로운 기능</strong>
                    <span className="proj-coming-soon-sub">이 자리에서 프로젝트를 더 깊게 다룰 수 있게 됩니다</span>
                  </span>
                  <span className="proj-coming-soon-status">
                    <span className="proj-coming-soon-status-dot" />준비 중
                  </span>
                </div>
              </div>

              <div className="proj-content-head">
                <span className="proj-field-label">프로젝트 내용</span>
                <div className="proj-template-toggle" role="group" aria-label="본문 시작 방식">
                  <button type="button" className="proj-template-btn" onClick={() => applyProjectTemplate("form")}>기본 템플릿</button>
                </div>
                <span className="proj-template-hint">템플릿을 선택하면 기본 구조가 자동으로 입력됩니다.</span>
                <button type="button" className="expand-btn" onClick={() => openBodyEditor("project")}>
                  <Maximize2 size={14} strokeWidth={2} /> 확장
                </button>
              </div>

              <MemoRichEditor
                key={`project-${projEditorKey}`}
                ref={projectEditorRef}
                initialValue={projContent}
                bodyClassName="proj-body-input"
                placeholder={PROJECT_BODY_PLACEHOLDER}
                enableTextColor
                onChange={(html) => { setProjContentWhileTyping(html); scheduleProjectAutosave({ content: html }); }}
              />
              </div>

              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="cancel-btn" onClick={() => (projMode === "edit" ? setProjMode("view") : close(dialogs.projectDetail))}>취소</button>
                <button className="save-btn" disabled={savingProject} onClick={handleSaveProject}>{savingProject ? "저장 중..." : "저장"}</button>
              </div>
            </>
          )}
        </div>
        {/* 편집 중에는 위로가기를 띄우지 않는다(사용자 요청 2026-08-28 — 메모 쪽과 같은 이유로
            "조잡하다"). 보기 모드에는 그대로 남긴다. 12-2에서 지운 것은 문서 스크롤러용
            DocScrollTopButton이고, 이건 요소 스크롤러용이라 다른 물건이다. */}
        {projMode !== "edit" && <ScrollTopButton ref={projectDetailScrollBtnRef} onClick={scrollProjectDetailToTop} />}

        {projTemplatePrompt === "form" && projTemplatePromptNode}
        {renderMobileProjectOptionsSheet()}
        {confirmDialogNode}
      </dialog>

      {/* My Page — 기존 glass dialog 구조 그대로. 이메일은 read-only, 나머지는 최소 기능만. */}
      <dialog className="glass-dialog mypage-dialog" ref={myPageRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="mypage-header">
            <span className="mypage-avatar" aria-hidden="true"><UserRound size={30} strokeWidth={1.9} /></span>
            <div className="mypage-header-text">
              <h3 className="mypage-title">My Page</h3>
              <p className="mypage-subtitle">계정 정보와 설정을 관리하세요.</p>
            </div>
            {isAdmin && (
              <div className="mypage-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={myPageTab === "account"} onClick={() => setMyPageTab("account")}>My Page</button>
                <button type="button" role="tab" aria-selected={myPageTab === "status"} onClick={openSystemStatusTab}>System Status</button>
              </div>
            )}
            <button className="close-btn" onClick={() => close(dialogs.myPage)}>✕</button>
          </div>

          <div className="mypage-content">
            {myPageTab === "status" && isAdmin ? (
              <SystemStatusPanel
                days={systemStatus} loading={systemStatusLoading} error={systemStatusError}
                fetchedAt={systemStatusFetchedAt} onRefresh={refreshSystemStatus}
              />
            ) : (
              <>
                <section className="mypage-card">
                  <div className="mypage-card-heading"><UserRound size={18} strokeWidth={2.2} />계정 정보</div>
                  <p className="mypage-card-desc">기본 계정 정보를 확인하고 관리할 수 있습니다.</p>
                  <div className="mypage-account-grid">
                    <div className="mypage-field">
                      <span className="mypage-field-label">Email <em>(변경 불가)</em></span>
                      <div className="mypage-readonly">{email ?? "-"}</div>
                    </div>
                    <div className="mypage-field">
                      <label className="mypage-field-label" htmlFor="mypage-nickname">Nickname</label>
                      <input id="mypage-nickname" className="mypage-input" type="text" value={myNickname} onChange={(e) => setMyNickname(e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="mypage-card">
                  <div className="mypage-card-heading"><Briefcase size={18} strokeWidth={2.2} />관심 직무 설정</div>
                  <p className="mypage-card-desc">선택한 직무를 기준으로 매일 새로운 채용공고 4개를 제공합니다.</p>
                  {hasLegacyRoles && (
                    <p className="auth-error" role="alert">
                      관심 직무 체계가 AI 중심으로 변경되었습니다. 관심 직무와 우선순위를 다시 설정해 주세요.
                    </p>
                  )}
                  {/* Signup/Onboarding과 같은 컴포넌트를 재사용한다 — 화면마다 4직무를 따로 하드코딩하지 않는다 */}
                  <JobRolePicker value={myRoles} onChange={setMyRoles} name="mypage-roles" />
                </section>

                {/* 🔴 Google 로그인 전용 계정에는 **보안 설정 카드를 통째로 안 그린다**(사용자 결정 2026-08-30).
                    그 계정은 비밀번호 identity가 없어서 대조할 "현재 비밀번호"가 존재하지 않는다 —
                    예전엔 현재 비밀번호 칸만 숨기고 새 비밀번호 칸 둘은 남겼는데, 그러면
                    **세션만 있으면 비밀번호가 심어지는** 경로가 된다(빌려준 기기 하나 = 영구 접근).
                    ⚠️ 화면만 숨기는 걸로 끝내지 마라 — 서버 액션은 여전히 직접 호출된다.
                    actions/auth.ts의 changePassword가 같은 조건으로 거절한다. 둘은 한 쌍이다. */}
                {hasPasswordLogin && (
                  <section className="mypage-card">
                    <div className="mypage-card-heading"><Lock size={18} strokeWidth={2.2} />보안 설정</div>
                    <p className="mypage-card-desc">계정 보안을 위한 비밀번호를 관리할 수 있습니다.</p>
                    <WaveField
                      label="현재 비밀번호" id="mypage-pw-current" type="password" autoComplete="current-password" onFocus={revealMyPageField}
                      placeholder="본인 확인을 위해 현재 비밀번호를 입력하세요"
                      value={myCurrentPassword}
                      onChange={(e) => onCurrentPasswordChange(e.target.value)}
                      state={myCurrentPasswordState}
                    />
                    <WaveField
                      label="새 비밀번호" id="mypage-pw" type="password" required minLength={8} autoComplete="new-password" onFocus={revealMyPageField}
                      placeholder="8자 이상 입력해 주세요" value={myPassword} onChange={(e) => setMyPassword(e.target.value)}
                    />
                    <WaveField
                      label="비밀번호 확인" id="mypage-pw2" type="password" required minLength={8} autoComplete="new-password" onFocus={revealMyPageField}
                      placeholder="비밀번호를 한 번 더 입력하세요" value={myPasswordConfirm} onChange={(e) => setMyPasswordConfirm(e.target.value)}
                      state={myPasswordConfirmState}
                    />
                  </section>
                )}
              </>
            )}
          </div>

          {myPageTab === "account" && myPageMessage && (
            <p className={myPageMessage.kind === "ok" ? "auth-info" : "auth-error"} role="status">{myPageMessage.text}</p>
          )}

          {myPageTab === "account" && (
            <div className="form-actions" style={{ marginTop: 18 }}>
              {saveToast && <div className="mini-toast">성공적으로 저장되었습니다.</div>}
              <button className="save-btn" disabled={savingProfile} onClick={handleSaveProfile}>
                {savingProfile ? "저장 중..." : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </dialog>

      {/* AI Smart Direction — Today's Focus */}
      <dialog className="ai-direction-dialog" ref={focusRef} onClick={onDialogBackdropClick}>
        <div className="ai-direction-modal">
          {/* 생성 중에는 제목/설명과 Update Focus를 숨긴다 — 로딩 화면에 Update Focus와 Focus ON이
              동시에 남아 두 개의 죽은 버튼처럼 보이던 문제(닫기만 남긴다) */}
          <div className="ai-modal-header">
            {!focusGenerating && <span className="ai-modal-header-icon">⚡</span>}
            <div className="ai-modal-title-wrap">
              {!focusGenerating && (
                <>
                  <h3 className="ai-modal-title">Today&apos;s Focus</h3>
                  <p className="ai-modal-subtitle">오늘 먼저 확인하면 좋은 항목이에요</p>
                </>
              )}
            </div>
            <div className="ai-modal-header-actions">
              {focusDisplay && !focusGenerating && (
                <button type="button" className="glass-button focus-btn ai-modal-cta-btn" onClick={runFocus}>
                  <span>↻ Update Focus</span>
                </button>
              )}
              <button type="button" className="ai-modal-close" aria-label="닫기" onClick={() => close(dialogs.focus)}>✕</button>
            </div>
          </div>

          {!focusDisplay && !focusGenerating && (
            <div className="ai-run-step">
              <button className="glass-button focus-btn ai-cta-lg" onClick={runFocus}><span>⚡ Focus ON</span></button>
              <div className="hint">추가 입력 없이, 당신의 기록에서 오늘 먼저 확인할 항목을 찾습니다.</div>
            </div>
          )}
          {focusGenerating && (
            <AiLoadingStage title="데이터를 분석하는 중..." sub="메모와 프로젝트 기록에서 오늘 먼저 볼 항목을 고르고 있어요." />
          )}
          {focusError && <div className="hint">{focusError}</div>}
          {focusDisplay && !focusGenerating && (
            <>
              {focusDisplay.result.items.map((r) => {
                const [, statusLabel = "", ddayLabel = ""] = r.meta.split(" · ");
                return (
                  <div key={r.rank} className="focus-card">
                    <div className="focus-rank-number">{String(r.rank).padStart(2, "0")}</div>
                    <h4 className="focus-task-title">{r.title}</h4>
                    <div className="focus-chips">
                      <span className="focus-chip"><span className="focus-chip-dot todo" />Todo</span>
                      <span className="focus-chip"><span className={`focus-chip-dot ${statusLabel === "진행 중" ? "progress" : "todo"}`} />{statusLabel}</span>
                      <span className="focus-chip dday">{ddayLabel}</span>
                    </div>
                    <div className="focus-reason">
                      <div className="focus-reason-title"><span className="focus-reason-icon">✦</span>Why this first?</div>
                      <p className="focus-reason-text">{r.reason}</p>
                      <button type="button" className="focus-open-button" onClick={() => openFocusMemo(r.memoId, r.endDate)}>메모 열기 →</button>
                    </div>
                  </div>
                );
              })}

              <div className="focus-footer">
                <div className="focus-footer-top">
                  <span className="focus-update-badge">↻ {focusMeta?.updatedAt ? `${formatUpdatedAt(focusMeta.updatedAt)} 업데이트` : "업데이트 없음"}</span>
                  {focusMeta && focusMeta.history.length > 0 && (
                    <button type="button" className="history-toggle" aria-expanded={focusHistoryOpen} onClick={() => setFocusHistoryOpen((v) => !v)}>
                      History {focusHistoryOpen ? "︿" : "⌄"}
                    </button>
                  )}
                </div>
                <p className="focus-auto-update-note">언제든 상단의 Update Focus 버튼으로 다시 확인할 수 있어요.</p>
                {focusHistoryOpen && focusMeta && focusMeta.history.length > 0 && (
                  <div className="focus-history-preview">
                    <div className="focus-history-heading">최근 확인 기록</div>
                    <div className="focus-history-grid">
                      {focusMeta.history.map((h) => (
                        <button
                          type="button" key={h.version} className="focus-history-item"
                          style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                          onClick={() => viewFocusVersion(h.version)}
                        >
                          <div className="focus-history-item-title">v{h.version}</div>
                          <div className="focus-history-item-meta">{formatUpdatedAt(h.createdAt)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </dialog>

      {/* AI Smart Direction — Idea Build */}
      <dialog className="ai-direction-dialog" ref={ideaRef} onClick={onDialogBackdropClick}>
        <div className="ai-direction-modal">
          {/* 생성 중에는 제목/설명 영역과 Idea ON을 숨기고 중앙 로더에만 집중시킨다(수정지침 4.1절).
              닫기 버튼은 생성 중에도 남긴다 */}
          <div className="ai-modal-header">
            {!ideaGenerating && <span className="ai-modal-header-icon">💡</span>}
            <div className="ai-modal-title-wrap">
              {!ideaGenerating && (
                <>
                  <h3 className="ai-modal-title">Idea Build</h3>
                  <p className="ai-modal-subtitle">프로젝트 아이디어를 분석해<br />확장 방향을 제안해요</p>
                </>
              )}
            </div>
            <div className="ai-modal-header-actions">
              {/* 실제 재생성은 결과 하단의 [재생성] 버튼이 담당한다 — 여기 있는 건 장식용 배지라
                  클릭되지 않는다. 다만 오늘 횟수를 다 쓰면 지금처럼 비활성 상태로 보여준다. */}
              {ideaDisplay && !ideaGenerating && (
                <span
                  className="glass-button idea-btn ai-modal-cta-btn ai-cta-ornament"
                  data-exhausted={ideaExhausted}
                  aria-hidden="true"
                >
                  <span>💡 Idea ON</span>
                </span>
              )}
              <button type="button" className="ai-modal-close" aria-label="닫기" onClick={() => close(dialogs.idea)}>✕</button>
            </div>
          </div>

          {ideaGenerating && (
            <AiLoadingStage title="아이디어를 구체화하는 중..." sub="저장된 프로젝트 내용을 읽고 다음 발전 방향을 정리하고 있어요." />
          )}
          {!ideaGenerating && ideaError && (
            <>
              {ideaPickerBlock}
              <AiErrorState feature="idea" isRetrying={ideaGenerating} onRetry={runIdea} />
            </>
          )}
          {!ideaDisplay && !ideaGenerating && !ideaError && (
            <>
              {ideaPickerBlock}
              <div className="ai-run-step">
                <button className="glass-button idea-btn ai-cta-lg" onClick={runIdea}><span>💡 Idea ON</span></button>
                <div className="hint">저장된 프로젝트 아이디어만 바탕으로 분석합니다.</div>
              </div>
            </>
          )}
          {ideaDisplay && !ideaGenerating && !ideaError && (
            <>
              <div className="idea-badge">✦ IDEA · {String(ideaMeta?.usedCount ?? 1).padStart(2, "0")}</div>

              <div className="idea-result-card">
                <div className="idea-source-label">
                  {ideaDisplay.result.selectionMode === "random" ? "Random Pick" : "직접 선택"} · {ideaDisplay.result.projectStatus}
                </div>
                <h4 className="idea-source-title">{ideaDisplay.result.projectTitle}</h4>
                <div className="idea-source-divider" />

                <div className="idea-direction-hero">
                  <div className="idea-direction-orb">✦</div>
                  <div>
                    <div className="idea-direction-label">추천 방향</div>
                    <h5 className="idea-direction-title"><SentenceLines text={ideaDisplay.result.recommendationTitle} /></h5>
                  </div>
                </div>
                <div className="idea-source-only">🛡 저장된 아이디어 자료만 기반으로 분석했어요</div>

                <div className="idea-section">
                  <div className="idea-section-title">왜 이 방향인가요?</div>
                  <div className="idea-direction-box">
                    <div className="idea-direction-box-icon">◎</div>
                    <p style={{ margin: 0 }}><SentenceLines text={ideaDisplay.result.reason} /></p>
                  </div>
                </div>

                {ideaDisplay.result.whatToBuild && (
                  <div className="idea-section">
                    <div className="idea-section-title">무엇을 만들면 되나요?</div>
                    <p className="idea-section-body"><SentenceLines text={ideaDisplay.result.whatToBuild} /></p>
                  </div>
                )}

                <div className="idea-section">
                  <div className="idea-section-title">핵심 구현</div>
                  <ol className="idea-step-list">
                    {ideaDisplay.result.developmentSteps.map((s, i) => <li key={i}><SentenceLines text={s} /></li>)}
                  </ol>
                </div>

                {ideaDisplay.result.implementationFlow?.length > 0 && (
                  <div className="idea-section">
                    <div className="idea-section-title">구현 흐름</div>
                    <div className="idea-flow">
                      {ideaDisplay.result.implementationFlow.map((step, i) => (
                        <div key={i} className="idea-flow-step">{step}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="idea-section">
                  <div className="idea-section-title">예상 필요 기술</div>
                  <div className="idea-tech-list">
                    {ideaTechList(ideaDisplay.result).map((t) => (
                      <div key={t.name} className="idea-tech-chip">
                        <span className="idea-tech-name">{t.name}</span>
                        {t.reason && <span className="idea-tech-reason">{t.reason}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {ideaDisplay.result.completionCriteria?.length > 0 && (
                  <div className="idea-section">
                    <div className="idea-section-title">완료 기준</div>
                    <ul className="editorial-bullet-list">
                      {ideaDisplay.result.completionCriteria.map((c, i) => <li key={i}><SentenceLines text={c} /></li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="idea-actions">
                <button type="button" className="idea-action-button" onClick={() => copyText(ideaResultToText(ideaDisplay.result))}>📋 전체복사</button>
                <button type="button" className="idea-action-button primary" onClick={() => setIdeaProjectPicker(true)}>📁 프로젝트에 저장</button>
                <button type="button" className="idea-action-button secondary-sky" onClick={() => setPendingTitleOnlySave(true)}>🏷 프로젝트명만 저장</button>
                {ideaSaveToast && <div className="mini-toast idea-save-toast">저장되었습니다.</div>}
              </div>

              {ideaModeSelector}
              <button
                type="button"
                className="idea-regenerate-button"
                disabled={ideaExhausted}
                onClick={runIdea}
              >
                <span className="idea-regenerate-icon">↻</span>
                <span className="idea-regenerate-copy">
                  <span className="idea-regenerate-main">재생성</span>
                  <span className="idea-regenerate-sub">
                    {ideaExhausted
                      ? `오늘의 생성 횟수를 모두 사용했습니다 · ${ideaMeta?.maxCount}/${ideaMeta?.maxCount}`
                      : "다른 확장 방향으로 다시 생성"}
                  </span>
                </span>
              </button>

              <div className="idea-footer">
                <span className="idea-generation-meta">
                  {/* 관리자는 상한이 없으니 n/n 카운터를 아예 숨긴다 — 의미 없는 숫자다(ideaExhausted와 같은 기준). */}
                  {ideaMeta?.updatedAt ? `${formatUpdatedAt(ideaMeta.updatedAt)} 생성` : ""}
                  {!isAdmin && `${ideaMeta?.updatedAt ? " · " : ""}${ideaMeta?.usedCount ?? 0}/${ideaMeta?.maxCount ?? IDEA_MAX}`}
                </span>
                {ideaMeta && ideaMeta.history.length > 0 && (
                  <button type="button" className="history-toggle" aria-expanded={ideaHistoryOpen} onClick={() => setIdeaHistoryOpen((v) => !v)}>
                    History {ideaHistoryOpen ? "︿" : "⌄"}
                  </button>
                )}
              </div>
              {ideaHistoryOpen && ideaMeta && ideaMeta.history.length > 0 && (
                <div className="focus-history-preview">
                  <div className="focus-history-heading">이전 결과</div>
                  <div className="focus-history-grid">
                    {ideaMeta.history.map((h) => (
                      <button
                        type="button" key={h.version} className="focus-history-item"
                        style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
                        onClick={() => viewIdeaVersion(h.version)}
                      >
                        <div className="focus-history-item-title">v{h.version}</div>
                        <div className="focus-history-item-meta">{formatUpdatedAt(h.createdAt)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
        {/* 아래 오버레이들은 .ai-direction-modal 안이 아니라 dialog 직속이어야 한다. 전부 position:fixed로
            화면 전체를 덮는 오버레이인데, .ai-direction-modal에 backdrop-filter가 걸려 있어서
            그 안에 두면 fixed의 기준이 뷰포트가 아니라 모달 박스가 된다 — 모달 높이에 따라
            팝업이 화면 중앙이 아닌 엉뚱한 자리(아래쪽)에 떴다. dialog에는 backdrop-filter가 없다.

            ★ .idea-save-overlay 3개도 같은 이유로 여기 있어야 한다(2026-08-24). 모달 안에 두면 fixed가
              사실상 absolute처럼 동작해 모달의 **스크롤 콘텐츠 최상단**에 붙는다 — 아이디어를 생성하고
              저장 버튼까지 스크롤해 내려간 뒤 누르면 "맨 위로 스크롤해 올라가야 팝업이 보이는" 상태가 된다.
              6213줄의 place-items:center는 오버레이 자기 박스 안에서만 가운데였을 뿐이다.
            ※ 데스크톱 크롬 반응형(375px 에뮬레이션)에서는 이 증상이 재현되지 않는다 — 그 환경에서는
              .ai-direction-modal의 backdrop-filter가 none으로 계산돼 fixed가 뷰포트를 기준으로 잡는다.
              실기기에서만 터지므로 반응형 모드 실측으로 "정상"이라 판단하지 말 것. */}
        {ideaDisplay && !ideaGenerating && !ideaError && (
          <>
            {/* .idea-save-overlay — 모바일 규칙(dashboard.css)이 전부 이 클래스를 기준으로 쓰여 있는데
                3000 마크업엔 이 클래스가 아예 안 붙어 있어서 "글씨가 세로로 쏟아지고 배치가 엉망"인
                상태로 방치돼 있었다(규칙은 있는데 걸 고리가 없던 케이스). 3001 기준으로 맞춘다. */}
            {ideaProjectPicker && !pendingIdeaSave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setIdeaProjectPicker(false)}>
                <div className="panel copy-picker" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="idea-picker-back" aria-label="뒤로가기" onClick={() => setIdeaProjectPicker(false)}>‹</button>
                  <button className="close-btn" onClick={() => setIdeaProjectPicker(false)}>✕</button>
                  <div className="copy-picker-head">
                    <div className="copy-picker-title">어느 프로젝트에 저장할까요?</div>
                    <input
                      className="proj-search copy-picker-search" placeholder="프로젝트 검색"
                      value={ideaSaveSearch} onChange={(e) => setIdeaSaveSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button" className="add-btn proj-new-btn copy-picker-new-btn"
                    onClick={() => setPendingIdeaSave({ projectId: null, label: "새 프로젝트" })}
                  >
                    + 새 프로젝트 생성
                  </button>
                  {(projectIdeas ?? []).length > 0 && (
                    <div className="proj-table">
                      <div className="proj-table-row proj-table-head project-table-header">
                        <span className="proj-col-name">프로젝트명</span>
                        <span className="proj-col-summary">한 줄 요약</span>
                        <span className="proj-col-status">상태</span>
                        <span className="proj-col-updated">최근 수정</span>
                      </div>
                      {(projectIdeas ?? [])
                        .filter((p) => p.title.toLowerCase().includes(ideaSaveSearch.trim().toLowerCase()))
                        .map((p) => (
                        <button
                          type="button" key={p.id} className="proj-table-row project-list-row"
                          onClick={() => setPendingIdeaSave({ projectId: p.id, label: p.title })}
                        >
                          <span className="proj-col-name project-list-title">{p.title}</span>
                          <span className="proj-col-summary project-list-summary">{p.summary}</span>
                          <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                          <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, today.year)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {pendingTitleOnlySave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setPendingTitleOnlySave(false)}>
                <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="copy-picker-title">프로젝트명만 저장하시겠습니까?</div>
                  <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                    <button className="cancel-btn" onClick={() => setPendingTitleOnlySave(false)}>취소</button>
                    <button className="save-btn" onClick={confirmSaveIdeaTitleAsProject}>저장</button>
                  </div>
                </div>
              </div>
            )}
            {pendingIdeaSave && (
              <div className="postit-overlay fixed-overlay idea-save-overlay open" onClick={() => setPendingIdeaSave(null)}>
                <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="copy-picker-title">
                    {pendingIdeaSave.projectId ? `"${pendingIdeaSave.label}"에 이어붙이시겠습니까?` : "새 프로젝트로 저장하시겠습니까?"}
                  </div>
                  <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                    <button className="cancel-btn" onClick={() => setPendingIdeaSave(null)}>취소</button>
                    <button className="save-btn" onClick={confirmPendingIdeaSave}>저장</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {ideaSourcePickerNode}
        {confirmDialogNode}
      </dialog>

      {/* 포스트잇 단독 보기/편집 — 먼슬리 메모나 Today's Focus의 상세 모달을 통째로 열지 않고 포스트잇만 띄운다 */}
      <dialog className="glass-dialog postit-only" ref={postitOnlyRef} data-memo-theme={theme} onClick={onDialogBackdropClick}>
        {postitHostDialogKey === "postitOnly" && postitViewNode}
        {activeDialogKey === "postitOnly" && bigEditorNode}
        {confirmDialogNode}
      </dialog>

      {/* 임시 진단 패널 — ?debug=vp 가 붙은 주소에서만 뜬다. 실기기 iOS 값을 눈으로 봐야
          하는 동안만 유지하고, 원인이 확인되면 이 줄과 ViewportDebug.tsx를 같이 지운다. */}
      <ViewportDebug />
    </div>
  );
}
