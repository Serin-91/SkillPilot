"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./dashboard.css";
import "./auth.css";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
import type { SelectedNewsItem } from "@/lib/news/select";
import type { JobsView, SavedJobRow } from "@/lib/jobs/get-jobs";
import type { Memo, MemoColor, MemoType, TodoStatus, SourceType, ContentFormat, ContentMode } from "@/lib/memo/types";
import {
  createMemo, updateMemo, deleteMemo, toggleImportant, setMemoPinned, reorderPinnedMemos, recordMemoSource,
  copySelectionToMemo as copySelectionToMemoAction,
  copyFullNewsToMemo as copyFullNewsToMemoAction,
  copyFullJobToMemo as copyFullJobToMemoAction,
  copyFullTrendToMemo as copyFullTrendToMemoAction,
  getMemosForDateAction, getMemosForMonthAction, getMemosForRangeAction,
} from "@/lib/actions/memo";
import { toEditableHtml, htmlToPlainText, hasRichFormatting, plainTextToHtml, newsFullBlockHtml, jobFullBlockHtml, trendFullBlockHtml } from "@/lib/memo/rich-text";
import { MemoRichEditor, type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
import { WaveField, type FieldState } from "@/components/auth/WaveField";
import { JobRolePicker } from "@/components/auth/JobRolePicker";
import { RichMemoContent } from "@/components/memo/RichMemoContent";
import { EmojiPopover } from "@/components/memo/EmojiPopover";
import { PROJECT_STATUSES, type ProjectIdea } from "@/lib/project/types";
import { PROJECT_TEMPLATE_HTML, PROJECT_BODY_PLACEHOLDER, toggleTaskItemInHtml } from "@/lib/project/template";
import { Lightbulb, FileText, Code2, CircleCheck, Dices, Trash2, UserRound, LogOut, Lock, Maximize2, NotebookPen, CalendarDays, Briefcase, CircleHelp, ArrowUp, ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import { SupportDialog, type SupportDialogHandle } from "@/components/support/SupportDialog";
import { saveProjectIdea, deleteProjectIdea } from "@/lib/actions/project";
import { signOut, updateProfile, changePassword, updateMindset } from "@/lib/actions/auth";
import type { JobRole } from "@/lib/jobs/roles";
import { IDEA_MAX, type FocusView, type IdeaView } from "@/lib/ai/state";
import type { FocusResult } from "@/lib/ai/focus";
import type { IdeaResult } from "@/lib/ai/idea";
import { ideaTechList, ideaResultToText } from "@/lib/ai/idea-text";
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

const STATUS_OPTIONS = [
  ["planned", "예정", "#c62828", "rgba(255,196,196,.55)"],
  ["in_progress", "진행 중", "#2c4f9e", "rgba(163,208,255,.5)"],
  ["completed", "완료", "#1a7a3a", "rgba(150,230,170,.55)"],
] as const;

const MEMO_COLORS = ["yellow", "pink", "green", "blue", "purple", "white", "black", "darkgray"] as const;

// 뉴스사/채용사이트 로고 — 직접 제공받은 Asset만 사용, 외부에서 새로 받아오지 않는다
const NEWS_SOURCE_LOGOS: Record<string, string> = {
  "AI타임스": "/logos/aitimes.png",
  "ZDNet Korea": "/logos/zdnet.jpg",
  "TechCrunch": "/logos/techcrunch.webp",
  "MIT News AI": "/logos/mit.png",
  "Ars Technica AI": "/logos/arstechnica.png",
};
const JOB_SITE_LOGOS: Record<string, string> = {
  "원티드": "/logos/wanted.png",
  "점핏": "/logos/jumpit.png",
  "잡코리아": "/logos/jobkorea.png",
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
      current.bullets.push(line.replace(/^[\s•\-*·]+/, "").trim());
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
function ProjectStatusFilterDropdown({ value, onChange, includeAll = true }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = includeAll ? ["전체", ...PROJECT_STATUSES] : [...PROJECT_STATUSES];
  const currentSlug = value === "전체" ? "all" : PROJECT_STATUS_META[value]?.slug ?? "idea";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div className="proj-filter-dropdown" ref={rootRef}>
      <button type="button" className="proj-filter-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="proj-filter-trigger-value">
          <span className={`project-status-filter-chip project-status-filter-chip--${currentSlug}`} />
          {value}
        </span>
        <span className={`proj-filter-chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && (
        <div className="proj-filter-panel">
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
      )}
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
      className={`mini-date-popup${portal ? " mobile-options-date-popup" : ""}${popupClassName ? ` ${popupClassName}` : ""}`}
      style={portal ? { position: "fixed", zIndex: 9999, top: "auto", bottom: 155, left: "50%", right: "auto", width: 210, margin: 0, padding: 8, borderRadius: 14, transform: "translateX(-50%)", display: "block", visibility: "visible", opacity: 1 } : undefined}
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
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
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
      <div className="mobile-selection-actions" aria-label="선택 문장 작업">
        {showCalendar && (
          <div className="mobile-selection-calendar">
            <MiniDatePicker value={todayIso} onChange={onPickDate} inline todayIso={todayIso} />
          </div>
        )}
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
function useScrollTopButton() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  function onScroll() {
    setVisible((ref.current?.scrollTop ?? 0) > SCROLL_TOP_THRESHOLD);
  }
  function scrollToTop() {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }
  // <dialog>는 닫혀 있어도 자식 DOM이 계속 마운트돼 있어 scrollTop이 저절로 0으로 돌아가지 않는다 —
  // 다이얼로그/편집창을 새로 열 때 호출해 이전 세션의 스크롤 위치와 버튼 노출 상태를 지운다.
  function resetScroll() {
    if (ref.current) ref.current.scrollTop = 0;
    setVisible(false);
  }
  return { ref, visible, onScroll, scrollToTop, resetScroll };
}
function ScrollTopButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`scroll-top-btn ${visible ? "is-visible" : ""}`} onClick={onClick} aria-label="맨 위로 이동">
      <ArrowUp size={18} strokeWidth={2.2} />
    </button>
  );
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ponytail: vercel.json의 cron 스케줄과 수동 동기화 — 스케줄을 바꾸면 이 값도 같이 바꿔야 한다.
const CRON_SCHEDULED_TIME_KST = "10:10";

const SYSTEM_STATUS_BADGE_CLASS: Record<DayStatusLabel, string> = {
  "정상": "ok",
  "일부 실패": "partial",
  "실패": "failed",
  "실패 후 복구": "recovered",
  "기록 없음": "empty",
};

type SystemStatusErrorState = { message: string; reason: "forbidden" | "query_failed"; at: string };

// 오늘 하루 요약이 아니라 "최근 7일 중 가장 최근" 기준 — 오늘 아직 기록이 없어도 최근 정상 실행/최근
// 오류를 계속 보여줘야 운영자가 "언제부터 문제였는지"를 바로 알 수 있다.
function buildSystemOverview(days: DayStatus[]) {
  const today = days[0];
  const newsText = today.newsOk === null ? "-" : !today.newsOk ? "실패" : today.newsCount !== null ? `정상 · ${today.newsCount}건` : "정상";
  // aiTrendOk는 이번 실행에서 실제로 생성을 시도했을 때만 기록된다 — 이미 생성돼 있어 스킵한 경우와
  // "기록 자체가 없는" 경우를 구분한다(추적 안 되는 걸 임의로 "정상"이라 하지 않는다).
  const aiTrendText = today.aiTrendOk !== null ? (today.aiTrendOk ? "정상" : "실패") : today.newsSkipped ? "스킵(이미 생성됨)" : "-";
  const jobUsers = today.jobUsers;
  const jobFailures = today.jobFailures ?? 0;

  let lastSuccessAt: string | null = null;
  let lastError: { message: string; at: string } | null = null;
  for (const day of days) {
    if (!lastSuccessAt && (day.label === "정상" || day.label === "일부 실패" || day.label === "실패 후 복구")) {
      lastSuccessAt = day.cronFinishedAt ?? day.fallbackAt ?? day.finalGeneratedAt;
    }
    if (!lastError && day.errorMessage) lastError = { message: day.errorMessage, at: day.cronStartedAt ?? day.fallbackAt ?? day.date };
    if (lastSuccessAt && lastError) break;
  }

  return { overallLabel: today.label, newsText, aiTrendText, jobUsers, jobFailures, lastSuccessAt, lastError };
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
          <div className="sysstatus-overview-item"><span>AI Trend</span><span>{overview.aiTrendText}</span></div>
          <div className="sysstatus-overview-item">
            <span>Job Description</span>
            <span className="sysstatus-job-breakdown">
              {overview.jobUsers === null ? "-" : <><span>┌ 사용자 {overview.jobUsers}명</span><span>└ 실패 {overview.jobFailures}명</span></>}
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
  const newsText = day.newsOk === null ? "-" : !day.newsOk ? "실패" : day.newsCount !== null ? `정상 · ${day.newsCount}건` : "정상";

  return (
    <div className="sysstatus-rows">
      <div className="sysstatus-row"><span>예약 실행</span><span>{CRON_SCHEDULED_TIME_KST}</span></div>
      <div className="sysstatus-row"><span>실제 시작</span><span>{day.cronStartedAt ? formatUpdatedAt(day.cronStartedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>완료</span><span>{day.cronFinishedAt ? formatUpdatedAt(day.cronFinishedAt) : "-"}</span></div>
      <div className="sysstatus-row"><span>News</span><span>{newsText}</span></div>
      <div className="sysstatus-row">
        <span>Job</span>
        <span className="sysstatus-job-breakdown">
          {day.jobUsers === null ? "-" : <><span>┌ 사용자 {day.jobUsers}명</span><span>└ 실패 {day.jobFailures ?? 0}명</span></>}
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
  nickname: string | null;
  email: string | null;
  jobRolePriority: JobRole[];
  hasLegacyRoles: boolean;
  mindset: string;
};

export default function Dashboard({ weather: initialWeather, briefing: initialBriefing, jobs: initialJobs, newsHistory, today, memosForMonth, importantMemos, projectIdeas, focusView, ideaView, isLoggedIn, isAdmin, nickname, email, jobRolePriority, hasLegacyRoles, mindset: initialMindset }: DashboardProps) {
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
        setJobs({ jobs: [], lastUpdated: null, jobDate: todayIso, stale: true, todayProcessing: false, pending: false });
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
  const newsDelayed = !!briefing?.stale && isPastManualRefreshWindow();
  const jobsDelayed = !!jobs?.stale && !jobs?.todayProcessing && isPastManualRefreshWindow();
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
    if (jobTab === "recent" && jobsRecent === null && jobs) {
      getJobsRecentViewAction(jobs.jobs.map((j) => j.url)).then(setJobsRecent);
    }
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
  const [myPassword, setMyPassword] = useState("");
  const [myPasswordConfirm, setMyPasswordConfirm] = useState("");
  const myPasswordConfirmState: FieldState = myPassword.length > 0 && myPassword.length < 8
    ? { kind: "error", message: "비밀번호는 8자 이상 입력해주세요." }
    : myPasswordConfirm.length === 0
      ? null
      : myPassword === myPasswordConfirm
        ? { kind: "success", message: "비밀번호가 일치합니다." }
        : { kind: "error", message: "비밀번호가 일치하지 않습니다." };
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
    setMyPassword("");
    setMyPasswordConfirm("");
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
    setSavingProfile(true);
    try {
      const result = await updateProfile(myNickname, myRoles, myRoles);
      if (result.error) { setMyPageMessage({ kind: "error", text: result.error }); return; }
      if (myPassword) {
        const pwResult = await changePassword(myPassword, myPasswordConfirm);
        if (pwResult.error) { setMyPageMessage({ kind: "error", text: pwResult.error }); return; }
        setMyPassword("");
        setMyPasswordConfirm("");
      }
      setMyPageMessage(null);
      router.refresh();
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
  const [activeDialogKey, setActiveDialogKey] = useState<keyof typeof dialogs | null>(null);
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
    e.currentTarget.close();
    const key = Object.entries(dialogs).find(([, ref]) => ref.current === e.currentTarget)?.[0] as keyof typeof dialogs | undefined;
    if (key) setActiveDialogKey((cur) => (cur === key ? null : cur));
  }

  // MindSet — 계정(profiles.mindset)에 저장. 입력이 멈추고 800ms 뒤 조용히 저장한다(메모 자동저장과 같은 패턴).
  const [mindset, setMindset] = useState(initialMindset);
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
  const [memoFormOpen, setMemoFormOpen] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<MemoType>("free_note");
  const [formStatus, setFormStatus] = useState<TodoStatus>("planned");
  const [formStartDate, setFormStartDate] = useState(memoDialogDateIso);
  const [formEndDate, setFormEndDate] = useState(memoDialogDateIso);
  const [formImportant, setFormImportant] = useState(false);
  const [formPinned, setFormPinned] = useState(false);
  const [formColor, setFormColor] = useState<MemoColor>("yellow");
  const [formBody, setFormBody] = useState("");
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
  const [mobileProjectSummaryOpen, setMobileProjectSummaryOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [memoSearch, setMemoSearch] = useState("");
  const isSearchingOrFiltering = memoSearch.trim().length > 0 || typeFilter !== "all";

  // 하단 목록 날짜 범위 필터 — 선택일/이번 달/기간/전체 기간. 메모 유형 필터와 독립적으로 조합된다.
  // 기본값은 "이번 달"(Monthly MEMO 기능명에 맞춰 월 단위 조회가 자연스럽다).
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>("month");
  const [customRangeStart, setCustomRangeStart] = useState<string | null>(null);
  const [customRangeEnd, setCustomRangeEnd] = useState<string | null>(null);
  // "기간"/"전체 기간"은 현재 불러온 달(viewMemos) 밖의 데이터가 필요해 별도로 조회한다.
  const [rangeMemos, setRangeMemos] = useState<Memo[]>([]);
  useEffect(() => {
    if (dateRangeMode === "all") {
      getMemosForRangeAction(null, null).then(setRangeMemos);
    } else if (dateRangeMode === "custom" && customRangeStart && customRangeEnd) {
      getMemosForRangeAction(customRangeStart, customRangeEnd).then(setRangeMemos);
    }
  }, [dateRangeMode, customRangeStart, customRangeEnd]);

  const memoListScope =
    dateRangeMode === "selected-day" ? dayMemos
    : dateRangeMode === "month" ? viewMemos
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
      if (target.closest(".mobile-options-sheet") || target.closest(".mobile-more-btn")) return;
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
    setFormColor("yellow");
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
    ref: postitScrollRef, visible: postitScrollVisible,
    onScroll: onPostitScroll, scrollToTop: scrollPostitToTop, resetScroll: resetPostitScroll,
  } = useScrollTopButton();
  const {
    ref: projectDetailScrollRef, visible: projectDetailScrollVisible,
    onScroll: onProjectDetailScroll, scrollToTop: scrollProjectDetailToTop, resetScroll: resetProjectDetailScroll,
  } = useScrollTopButton();
  const {
    ref: bodyEditorScrollRef, visible: bodyEditorScrollVisible,
    onScroll: onBodyEditorScroll, scrollToTop: scrollBodyEditorToTop, resetScroll: resetBodyEditorScroll,
  } = useScrollTopButton();
  function openPostitView(m: Memo) {
    setPostitExpanded(false);
    setPostitEditMode(null);
    setPostitViewMemo(m);
    resetPostitScroll();
  }
  // "전체 보기"로 넘어가며 닫아버린 host dialog(Monthly MEMO/Key Notes)를 기억해뒀다가, 전체 보기를
  // 닫을 때 그 자리로 되돌아가기 위한 참조 — expandPostitView에서 채우고 closePostitView에서 소비한다
  const postitHostKeyRef = useRef<"memo" | "keynotes" | null>(null);
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
  const [bigEditorOpen, setBigEditorOpen] = useState(false);
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
    if (m.content_mode === "document" && hasRichFormatting(toEditableHtml(m.content, m.content_format))) {
      openDetailEditInPlace(m);
    } else {
      loadMemoIntoForm(m, "quick");
      setPostitEditMode("quick");
    }
  }
  // 전체 보기(Detail View) 안에서 "수정" — 같은 오버레이를 유지한 채 내부 상태만 Detail Edit로 전환한다(8·17절)
  function openDetailEditInPlace(m: Memo) {
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
  // (한때 router.refresh()를 빼고 필요한 것만 따로 불러오게 최적화했었는데, 그 변경 이후
  // 포스트잇 저장 시 다이얼로그가 통째로 닫히는 버그가 보고돼 일단 원래 방식으로 되돌렸다.)
  async function refreshAfterMemoChange() {
    router.refresh();
    const sameMonth = viewYear === today.year && viewMonth0 === today.month0;
    const [memos, todayMemos] = await Promise.all([
      getMemosForMonthAction(viewYear, viewMonth0),
      sameMonth ? Promise.resolve(null) : getMemosForMonthAction(today.year, today.month0),
    ]);
    setViewMemos(memos);
    setMemosForMonthState(sameMonth ? memos : todayMemos!);
  }
  async function handleSaveMemo() {
    // "저장" 버튼은 지금 값을 바로 반영하므로, 대기 중인 자동저장 타이머가 1초 뒤 같은 내용을 또 저장하는
    // 중복 요청을 막는다.
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    setSavingMemo(true);
    try {
      const input = {
        title: formTitle,
        content: formBody,
        content_format: (formContentMode === "document" ? "rich_html" : "plain") as ContentFormat,
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
      await refreshAfterMemoChange();
      // Quick Edit/Detail Edit 둘 다 저장 후 같은 오버레이에서 View로 복귀해 결과를 바로 보여준다
      // (예전엔 Quick Edit만 저장 즉시 닫혔는데, 사용자가 갑자기 닫히는 느낌이라 Detail Edit와 통일했다).
      // 그 외(Create/기존 폼)는 기존대로 닫는다.
      if (postitEditMode === "quick" || postitEditMode === "detail") {
        setPostitEditMode(null);
        if (savedId) {
          const fresh = (await getMemosForDateAction(input.start_date)).find((mm) => mm.id === savedId);
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
    const hasDraft = Boolean(formTitle.trim() || htmlToPlainText(formBody).trim());
    if (!editingMemoId && !hasDraft) {
      setMemoFormOpen(false);
      return;
    }
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    setSavingMemo(true);
    setAutosaveStatus("saving");
    try {
      const input = {
        title: formTitle,
        content: formBody,
        content_format: (formContentMode === "document" ? "rich_html" : "plain") as ContentFormat,
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
      if (result && "error" in result) { alert(result.error); setAutosaveStatus("idle"); return; }
      if (!editingMemoId && "id" in result && typeof result.id === "string") setEditingMemoId(result.id);
      if (editingMemoId) patchLocalMemo(editingMemoId, input as Partial<Memo>);
      await refreshAfterMemoChange();
      setAutosaveStatus("saved");
      await new Promise((resolve) => setTimeout(resolve, 520));
      setMemoFormOpen(false);
      setAutosaveStatus("idle");
    } finally {
      setSavingMemo(false);
    }
  }
  function handleDeleteMemo(id: string) {
    askConfirm("이 메모를 삭제할까요?", async () => {
      await deleteMemo(id);
      setMemoFormOpen(false);
      closeBigEditor();
      setPostitViewMemo(null);
      setPostitExpanded(false);
      setPostitEditMode(null);
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
  // Key Notes 상세의 Pin 영역 Drag & Drop — 서버 순서(pinnedMemos)를 다이얼로그를 열 때 한 번 복사해와서
  // 드래그 중에는 이 로컬 배열만 바로 다시 그리고, 드롭이 끝나면 pin_order로 저장한다.
  const [pinnedDragOrder, setPinnedDragOrder] = useState<string[] | null>(null);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  // pinnedDragOrder는 다이얼로그를 열 때 한 번만 찍은 스냅샷이라, 그 안에서 새로 고정/해제하면
  // pinnedMemos는 바뀌어도 이 순서엔 반영이 안 돼 나갔다 와야 보였다 — 없어진 id는 버리고 새로 생긴 id는 뒤에 붙인다.
  const displayedPinnedMemos = pinnedDragOrder
    ? (() => {
        const known = pinnedDragOrder.filter((id) => pinnedMemos.some((m) => m.id === id));
        const extra = pinnedMemos.filter((m) => !known.includes(m.id)).map((m) => m.id);
        return [...known, ...extra].map((id) => pinnedMemos.find((m) => m.id === id)).filter(Boolean) as Memo[];
      })()
    : pinnedMemos;
  const [pinnedFullView, setPinnedFullView] = useState(false);
  function openKeyNotes() {
    setPinnedDragOrder(pinnedMemos.map((m) => m.id));
    setPinnedFullView(false);
    open(dialogs.keynotes);
  }
  function handlePinDragOver(overId: string) {
    if (!draggingPinId || draggingPinId === overId) return;
    setPinnedDragOrder((prev) => {
      const order = prev ?? pinnedMemos.map((m) => m.id);
      const from = order.indexOf(draggingPinId);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1) return order;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, draggingPinId);
      return next;
    });
  }
  async function handlePinDrop() {
    const order = pinnedDragOrder;
    setDraggingPinId(null);
    if (!order) return;
    await reorderPinnedMemos(order);
    router.refresh();
  }
  // 가로 미리보기(.keynote-pinned-row)와 전체보기(.keynote-pinned-grid) 둘 다 같은 카드를 쓴다 — 컨테이너만 다르다.
  function renderPinnedCard(m: Memo) {
    return (
      <div
        key={m.id}
        className={`postit ${postitColorClass(m.color)}${draggingPinId === m.id ? " dragging" : ""}`}
        draggable
        onDragStart={() => setDraggingPinId(m.id)}
        onDragOver={(e) => { e.preventDefault(); handlePinDragOver(m.id); }}
        onDrop={(e) => { e.preventDefault(); handlePinDrop(); }}
        onDragEnd={() => setDraggingPinId(null)}
        onClick={() => openPostitView(m)}
      >
        <span className="pin">📌</span>
        <div className="postit-title">{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
        {m.content && <div className="postit-body">{m.content_format === "rich_html" ? htmlToPlainText(m.content) : m.content}</div>}
        <div className="s">{m.memo_type} · {m.start_date}{m.content_mode === "document" && <span className="memo-detail-badge"> · 상세 ›</span>}</div>
      </div>
    );
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
  const [projContent, setProjContent] = useState("");
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

  function openNewProject() {
    setProjMode("create");
    setEditingProjectId(null);
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
    setProjMode("view");
    setEditingProjectId(p.id);
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
    const current = target === "bodyEditor" ? bodyEditorDraft : projContent;
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
    const next = toggleTaskItemInHtml(projContent, index);
    setProjContent(next);
    if (!editingProjectId) return;
    await saveProjectIdea(editingProjectId, {
      title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: next,
    });
    router.refresh();
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
      const result = await saveProjectIdea(editingProjectId, {
        title: projTitle, status: projStatus, summary, content_md: projContent,
      });
      if (result.error) { alert(result.error); return; }
      close(dialogs.projectDetail);
      router.refresh();
    } finally {
      setSavingProject(false);
    }
  }
  function handleDeleteProject() {
    if (!editingProjectId) return;
    askConfirm("이 프로젝트 아이디어를 삭제할까요?", async () => {
      await deleteProjectIdea(editingProjectId);
      close(dialogs.projectDetail);
      router.refresh();
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
    setSavingProject(true);
    try {
      const result = await saveProjectIdea(editingProjectId, {
        title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: projContent,
      });
      if (result.error) { alert(result.error); return; }
      if (!editingProjectId && result.id) setEditingProjectId(result.id);
      router.refresh();
      close(dialogs.projectDetail);
    } finally {
      setSavingProject(false);
    }
  }

  // Monthly Memo와 같은 방식 — 입력이 멈추고 1초 뒤 조용히 저장한다. 신규 작성 중(editingProjectId
  // 없음)에도 제목이 있으면 저장을 걸어 새 row를 만들고, 그 id를 editingProjectId로 채워 이후
  // 자동저장이 같은 row를 계속 update하게 한다 — 드래그 등으로 창을 실수로 벗어나도 내용이 남는다.
  const [projAutosaveStatus, setProjAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const projAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleProjectAutosave(overrides: Partial<{ title: string; status: string; summary: string; content: string }> = {}) {
    const id = editingProjectId;
    const title = overrides.title ?? projTitle;
    const status = overrides.status ?? projStatus;
    const summary = overrides.summary ?? projSummary;
    const content = overrides.content ?? projContent;
    if (!title.trim()) return; // 제목 없이는 저장하지 않는다(서버 액션도 동일하게 막는다)
    if (projAutosaveTimerRef.current) clearTimeout(projAutosaveTimerRef.current);
    projAutosaveTimerRef.current = setTimeout(async () => {
      setProjAutosaveStatus("saving");
      const result = await saveProjectIdea(id, { title, status, summary: summary.trim(), content_md: content });
      if (result.error) { setProjAutosaveStatus("idle"); return; }
      if (!id && result.id) setEditingProjectId(result.id);
      setProjAutosaveStatus("saved");
      setTimeout(() => setProjAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    }, 1000);
  }
  const projAutosaveStatusNode =
    projAutosaveStatus === "saving" ? <span className="autosave-status">저장 중...</span>
    : projAutosaveStatus === "saved" ? <span className="autosave-status saved">저장됨 ✓</span>
    : null;

  // 본문 크게 보기 — 메모와 프로젝트가 같은 확장 editor/modal/state를 공유한다.
  // 확장 전/후 내용은 같은 draft state를 쓰므로 열었다 닫아도 내용이 그대로 유지된다.
  const [bodyEditorDraft, setBodyEditorDraft] = useState("");
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
    setBodyEditorDraft(target === "project" ? projContent : formBody);
    setBodyEditorSessionKey((k) => k + 1);
    resetBodyEditorScroll();
    open(dialogs.bodyEditor);
  }
  function closeBodyEditor() {
    if (bodyEditorTarget === "project") {
      setProjContent(bodyEditorDraft);
      setProjEditorKey((k) => k + 1);
    } else {
      setFormBody(bodyEditorDraft);
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
  }
  // 제목도 본문과 같은 디바운스로 자동저장한다 — 둘 다 formTitle/formBody 최신값을 기준으로 하나의
  // 타이머를 공유하므로, 제목/본문을 거의 동시에 고쳐도 마지막 타이핑 기준으로 둘 다 함께 저장된다.
  function scheduleAutosave(overrides: Partial<{ title: string; content: string }> = {}) {
    if (!editingMemoId) return;
    const id = editingMemoId;
    const title = overrides.title ?? formTitle;
    const content = overrides.content ?? formBody;
    const format: ContentFormat = formContentMode === "document" ? "rich_html" : "plain";
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      await updateMemo(id, { title, content, content_format: format });
      const trimmedTitle = title.trim();
      patchLocalMemo(id, { content, content_format: format, ...(trimmedTitle ? { title: trimmedTitle, is_auto_title: false } : {}) });
      setAutosaveStatus("saved");
      setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
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
      open(dialogs.postitOnly);
      openPostitView(target);
    }
  }

  // AI Smart Direction — Idea Build (기획안 8.3·8.5.2절)
  function ideaDisplayFrom(view: IdeaView | null) {
    return view?.current && view.currentId && isIdeaResult(view.current)
      ? { id: view.currentId, result: view.current, savedMemoId: view.savedMemoId }
      : null;
  }
  const [ideaMeta, setIdeaMeta] = useState(ideaView);
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
      <div className="idea-step-label">분석할 프로젝트</div>
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
  const ideaSourcePickerNode = ideaSourcePickerOpen && (
    <div className="postit-overlay fixed-overlay open" onClick={() => setIdeaSourcePickerOpen(false)}>
      <div className="panel copy-picker idea-source-picker" onClick={(e) => e.stopPropagation()}>
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
      setConfirmDialog({ message: "아이디어를 만들 프로젝트를 선택해 주세요.", confirmLabel: "확인", hideCancel: true, onConfirm: () => {} });
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
    router.refresh();
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
    router.refresh();
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
  const [pendingInsert, setPendingInsert] = useState<{ text: string; source: SelSource } | null>(null);
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
  });
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
  // 전체 저장(fullNews/fullJob/fullTrend)을 "현재 커서 위치에 삽입" 흐름에 태우기 위한 순수 텍스트 변환 —
  // 서버가 만드는 것과 같은 HTML block을 그대로 만들고 태그만 걷어낸다(서식은 잃지만 구조는 줄바꿈으로 남는다)
  function fullSaveToSourceAndText(content: Extract<MemoPickerContent, { mode: "fullNews" | "fullJob" | "fullTrend" }>): { source: SelSource; text: string } {
    if (content.mode === "fullNews") {
      const html = newsFullBlockHtml(content.sourceTitle, content.sourceUrl, content.summary, content.reason, content.tags);
      return { source: { type: "news", title: content.sourceTitle, url: content.sourceUrl }, text: htmlToPlainText(html) };
    }
    if (content.mode === "fullJob") {
      const html = jobFullBlockHtml(content.title, content.company, content.sourceSite, content.career, content.deadline, content.sourceUrl, content.categories);
      return { source: { type: "job", title: `${content.company} / ${content.title}`, url: content.sourceUrl }, text: htmlToPlainText(html) };
    }
    const html = trendFullBlockHtml(content.label, content.title, content.body, content.bullets, content.source, content.url);
    return { source: { type: "ai_smart_direction", title: content.title ?? content.label, url: content.url ?? "" }, text: htmlToPlainText(html) };
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

    const { source, text } = content.mode === "selection" ? content : fullSaveToSourceAndText(content);

    if (memoId) {
      const freshMemos = await getMemosForDateAction(date);
      const target = freshMemos.find((mm) => mm.id === memoId);
      if (target) {
        openBigEditor(target);
        setPendingInsert({ text, source });
      }
      return;
    }

    if (content.mode === "selection") {
      const result = await copySelectionToMemoAction({
        date, memoId: null, sourceType: source.type, sourceTitle: source.title, sourceUrl: source.url, selectedText: text,
      });
      if ("error" in result) { alert(result.error); return; }
      await refreshAfterMemoChange();
      return;
    }

    const result = content.mode === "fullNews"
      ? await copyFullNewsToMemoAction({
          date, memoId: null, sourceTitle: content.sourceTitle, sourceUrl: content.sourceUrl,
          summary: content.summary, reason: content.reason, tags: content.tags,
        })
      : content.mode === "fullJob"
      ? await copyFullJobToMemoAction({
          date, memoId: null, title: content.title, company: content.company, sourceSite: content.sourceSite,
          career: content.career, deadline: content.deadline, sourceUrl: content.sourceUrl, categories: content.categories,
        })
      : await copyFullTrendToMemoAction({
          date, memoId: null, label: content.label, title: content.title,
          body: content.body, bullets: content.bullets, source: content.source, url: content.url,
        });
    if ("error" in result) { alert(result.error); return; }
    await refreshAfterMemoChange();
  }
  // 9~10절 — "현재 커서 위치에 삽입": textarea의 실제 캐럿 위치에 선택한 문장만 그대로 넣는다.
  // (예전엔 "---\n\n## 뉴스에서 추가\n출처...\n원문..." 헤딩 블록을 같이 붙였는데, 그건 빼고 순수 텍스트만.)
  // 출처 정보는 화면에 안 넣는 대신 memo_source 테이블에 별도로 기록한다.
  async function insertPendingAtCursor() {
    if (!pendingInsert || !editingMemoId) return;
    if (formContentMode === "document") {
      // 확장(bodyEditor)으로 넘어간 상태면 bigEditorNode는 언마운트돼 있으므로 bodyEditor 쪽 ref를 쓴다.
      const target = activeDialogKey === "bodyEditor" ? bodyEditorHandleRef : bigEditorHandleRef;
      target.current?.insertTextAtCursor(pendingInsert.text);
    } else {
      // 간단 메모는 caret 위치 API가 없는 plain textarea이므로 44절 그대로 plain text로 append한다
      const next = formBody ? `${formBody}\n${pendingInsert.text}` : pendingInsert.text;
      setFormBody(next);
      scheduleAutosave({ content: next });
    }
    await recordMemoSource(editingMemoId, pendingInsert.source.type, pendingInsert.source.title, pendingInsert.source.url, pendingInsert.text);
    setPendingInsert(null);
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
  async function openMemoModalAt(y: number, m0: number, day: number) {
    const memos = await getMemosForMonthAction(y, m0);
    setViewYear(y); setViewMonth0(m0); setViewMemos(memos); setMemoDialogDay(day);
    setMemoFormOpen(false);
    open(dialogs.memo);
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
        <input
          className="big-title-input"
          value={formTitle}
          placeholder="제목 (비워두면 자동 생성)"
          onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
        />
        <span className={`star-toggle ${formImportant ? "active" : ""}`} title="중요 메모로 지정" onClick={() => setFormImportant((v) => !v)}>
          {formImportant ? "★" : "☆"}
        </span>
      </div>
      <div className="big-meta-row">
        <MemoTypeDropdown value={formType} onChange={setFormType} />
        <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
        <span>~</span>
        <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
      </div>
      <ColorSwatches value={formColor} onChange={setFormColor} />
      <div className="textarea-row">
        <textarea
          className="memo-quick-editor big-body-input"
          placeholder="간단한 내용을 입력하세요..."
          value={formBody}
          onChange={(e) => { setFormBody(e.target.value); scheduleAutosave({ content: e.target.value }); }}
        />
      </div>
      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="cancel-btn" onClick={closePostitView}>취소</button>
        <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
        {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>🗑 삭제</button>}
      </div>
    </>
  );

  // Detail Edit — 전체 보기 안에서 같은 오버레이를 유지한 채 상세 에디터로 전환한다(8·17절, 기존 상세 폼 재사용)
  const detailEditFormNode = postitEditMode === "detail" && (
    <>
      <div className="big-title-row">
        <input
          className="big-title-input"
          value={formTitle}
          placeholder="제목 (비워두면 자동 생성)"
          onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
        />
      </div>
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
      <div className="textarea-row" ref={postitScrollRef} onScroll={onPostitScroll}>
        <MemoRichEditor
          key={`postit-detail-${formSessionKey}`}
          ref={detailEditorRef}
          initialValue={formBody}
          bodyClassName="big-body-input"
          hideToolbar
          memoColor={formColor}
          onMemoColorChange={setFormColor}
          onChange={(html) => { setFormBody(html); scheduleAutosave({ content: html }); }}
        />
      </div>
      <div className="form-actions" style={{ marginTop: 22 }}>
        <button className="cancel-btn" onClick={() => setPostitEditMode(null)}>취소</button>
        <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
      </div>
    </>
  );

  // postitViewNode는 Monthly MEMO/postitOnly/Key Notes 세 다이얼로그에 전부 중복 삽입돼(아래 참고)
  // postitViewMemo가 세팅되면 세 군데서 동시에 마운트된다 — 그 안(quickEditFormNode/detailEditFormNode)의
  // input에 id/name을 주면 브라우저가 "같은 폼에 동일 id가 여러 개"라고 경고한다. 라벨(htmlFor)로
  // 참조하는 곳도 없으니 이 안의 input들은 id/name 없이 둔다.
  const postitViewNode = postitViewMemo && (
    <div className="postit-overlay open" onClick={postitEditMode === "detail" ? () => setPostitEditMode(null) : closePostitView}>
      <div
        className={`postit big-postit ${postitColorClass(postitEditMode ? formColor : postitViewMemo.color)} ${postitExpanded ? "expanded" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={() => {
          const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
          if (mobile) closePostitView();
          else if (postitEditMode === "detail") setPostitEditMode(null);
          else closePostitView();
        }}>✕</button>
        {postitEditMode && (
          <div className="mobile-editor-head-actions mobile-postit-head-actions">
            <button type="button" aria-label="실행 취소" onClick={() => detailEditorRef.current?.undo()}>↶</button>
            <button type="button" aria-label="다시 실행" onClick={() => detailEditorRef.current?.redo()}>↷</button>
            <button type="button" className={`mobile-important-btn ${formImportant || formPinned ? "active" : ""}`} aria-label={formPinned ? "고정 메모" : "중요 메모"} onClick={() => {
              if (editingMemoId && formPinned) void handleTogglePin(editingMemoId, true);
              else setFormImportant((v) => !v);
            }}>{formPinned ? "📌" : formImportant ? "★" : "☆"}</button>
            <button type="button" className="mobile-more-btn" aria-label="메모 더보기" onClick={() => setMobileMemoMenuOpen(true)}>⋮</button>
          </div>
        )}
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
                    📌 {postitViewMemo.is_pinned ? "Unpin" : "Pin"}
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
        {postitEditMode !== "quick" && <ScrollTopButton visible={postitScrollVisible} onClick={scrollPostitToTop} />}
      </div>
      {postitEditMode && renderMobileMemoOptionsSheet()}
    </div>
  );

  // Key Notes 포스트잇 · 먼슬리 메모 목록 클릭 시 여는 큰 편집 팝업 (5-5·8절) — 두 다이얼로그 모두에 중복 삽입한다
  const bigEditorNode = bigEditorOpen && (
    <div className="postit-overlay open" onClick={closeBigEditor}>
      <div className={`postit big-postit ${postitColorClass(formColor)}${pendingInsert ? " has-insert-banner" : ""}`} onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={closeBigEditor}>✕</button>
        {autosaveStatusCorner}
        <div className="big-title-row">
          {/* bigEditorNode는 openBigEditor(News/Job/AI Trend → 기존 메모 삽입)에서만 열리는 전용
              다이얼로그다 — 대표 이모지 선택도, 중요/Pin 설정도 이 저장 단계에서는 제공하지 않는다.
              (기존엔 "!pendingInsert"로만 이모지를 숨겼는데, 삽입 버튼을 누르면 pendingInsert가
              null이 되면서 이모지가 다시 나타나는 버그가 있었다 — 이 다이얼로그 자체가 항상 이
              흐름이므로 조건 없이 아예 렌더링하지 않는다.) 중요 표시·Pin은 저장 후 Monthly MEMO/
              Key Notes에서 설정한다. */}
          <input
            id="body-editor-title" name="body-editor-title"
            className="big-title-input"
            value={formTitle}
            placeholder="제목 (비워두면 자동 생성)"
            onChange={(e) => { setFormTitle(e.target.value); scheduleAutosave({ title: e.target.value }); }}
          />
        </div>
        <div className="big-meta-row">
          <MemoTypeDropdown value={formType} onChange={setFormType} />
          <MiniDatePicker value={formStartDate} onChange={setFormStartDate} todayIso={todayIso} />
          <span>~</span>
          <MiniDatePicker value={formEndDate} onChange={setFormEndDate} todayIso={todayIso} />
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
          {/* detailEditFormNode와 동일한 위치·동작의 확장 버튼 — 별도 Editor를 새로 만들지 않고
              기존 bodyEditor(전체 화면, 서식툴바 포함)를 그대로 재사용한다. */}
          <button className="expand-btn" style={{ marginLeft: "auto" }} onClick={() => openBodyEditor("memo")}>
            <span aria-hidden="true">⛶</span> 확장
          </button>
        </div>
        <ColorSwatches value={formColor} onChange={setFormColor} />
        {/* 본문 Editor가 메인 콘텐츠 — 삽입 대기 안내는 높이가 절대 늘어나지 않는 한 줄짜리 bar로만 둔다 */}
        {pendingInsert && (
          <div className="insert-bar">
            <span className="insert-bar-label">삽입 대기</span>
            <span className="insert-bar-preview" title={pendingInsert.text}>&ldquo;{pendingInsert.text}&rdquo;</span>
            <button type="button" className="add-btn" onClick={insertPendingAtCursor}>현재 커서 위치에 삽입</button>
          </div>
        )}
        <div className="textarea-row">
          {/* Quick Editor 기준(quickEditFormNode/detailEditFormNode)과 동일하게 서식툴바는 숨긴다 —
              서식은 "확장"으로 넘어간 bodyEditor에서만 노출한다. */}
          <MemoRichEditor
            key={`big-${formSessionKey}`}
            ref={bigEditorHandleRef}
            initialValue={formBody}
            bodyClassName="big-body-input"
            hideToolbar
            onChange={(html) => { setFormBody(html); scheduleAutosave({ content: html }); }}
          />
        </div>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="save-btn" disabled={savingMemo} onClick={handleSaveMemo}>{savingMemo ? "저장 중..." : "저장"}</button>
          {editingMemoId && <button className="delete-btn" onClick={() => handleDeleteMemo(editingMemoId)}>삭제</button>}
        </div>
      </div>
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
            <button
              type="button" className="idea-action-button primary copy-picker-new-btn"
              onClick={() => setPendingSave({ memoId: null, label: "새 메모" })}
            >
              + 새 메모 생성
            </button>
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
              {pendingSave.memoId ? `"${pendingSave.label}"에 붙여넣으시겠습니까?` : "새 메모로 저장하시겠습니까?"}
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
    <div className="sp-body">
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
                  {weather ? (
                    <>
                      <span className="weather-temp">{weather.tempC}°C</span> <span className="sun-icon">{weather.icon}</span>
                      <span className="weather-detail">
                        {weather.label}{weather.humidity !== null && ` · 습도 ${weather.humidity}%`}
                      </span>
                    </>
                  ) : "날씨 불러오는 중"}
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
                  <button type="button" className="header-icon-btn" title="도움말" aria-label="도움말" onClick={() => supportDialogRef.current?.openHelp()}>
                    <CircleHelp size={17} strokeWidth={2} />
                  </button>
                  <button type="button" className="header-logout-btn" onClick={() => signOut()} title="로그아웃" aria-label="로그아웃">
                    <LogOut size={17} strokeWidth={2} />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="header-signup-btn" onClick={() => router.push("/login")}>Sign up</button>
                  <button type="button" className="header-icon-btn" title="도움말" aria-label="도움말" onClick={() => supportDialogRef.current?.openHelp()}>
                    <CircleHelp size={17} strokeWidth={2} />
                  </button>
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
                onChange={(e) => { if (guardLogin()) onMindsetChange(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  saveMindsetNow(mindset);
                  e.currentTarget.blur();
                }}
              />
              <textarea
                className="mindset-input mindset-input-mobile"
                rows={2}
                placeholder="한 줄로 나만의 다짐, 각오, 목표를 입력해 보세요."
                value={mindset}
                onFocus={(e) => { if (!guardLogin()) e.target.blur(); }}
                onChange={(e) => { if (guardLogin()) onMindsetChange(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  saveMindsetNow(mindset);
                  e.currentTarget.blur();
                }}
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
                      key={i} logo={NEWS_SOURCE_LOGOS[n.source]} title={n.title}
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
                      logo={j.source_site ? JOB_SITE_LOGOS[j.source_site] : undefined}
                      logoClass={j.source_site === "원티드" ? "wanted-logo" : undefined}
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
                        <div key={m.id} className="today-item" onClick={(e) => { e.stopPropagation(); if (guardLogin()) { open(dialogs.postitOnly); openPostitView(m); } }}>
                          <span className="today-item-icon">{m.is_important ? "★" : m.memo_type === "todo" ? (m.status === "completed" ? "☑" : "☐") : "•"}</span>
                          <span className="today-item-title-group">
                            <span className="today-item-title">{m.title}</span>
                            {m.memo_type === "todo" && <span className="today-item-dday">{ddayLabel(m.end_date)}</span>}
                          </span>
                        </div>
                      ))}
                      {todayMemoItems.length > 3 && <div className="hint">+ {todayMemoItems.length - 3}개 더보기</div>}
                    </>
                  ) : nextMemo ? (
                    <>
                      <div className="hint">오늘 등록된 메모가 없어요.</div>
                      <div className="today-label" style={{ marginTop: 10 }}>NEXT</div>
                      <div className="next-item" onClick={(e) => { e.stopPropagation(); if (guardLogin()) { open(dialogs.postitOnly); openPostitView(nextMemo); } }}>
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
              <button className="add-btn proj-new-btn" onClick={(e) => { e.stopPropagation(); if (guardLogin()) openNewProject(); }}>+ New Project</button>
              </>
              )}
            </div>

            <div className="panel keynotes-panel">
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
                      <span className="update-delay-badge">업데이트 지연</span>
                      <button
                        type="button" className="meta-update-btn" title="하루 최대 1회"
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
              {newsDelayed && (
                <>
                  <span className="update-delay-badge">업데이트 지연</span>
                  <button
                    type="button" className="meta-update-btn" title="하루 최대 1회"
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
                      <span className="update-delay-badge">업데이트 지연</span>
                      <button
                        type="button" className="meta-update-btn" title="하루 최대 1회"
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
      <dialog className={`glass-dialog big tonedown monthly-memo-dialog${memoFormOpen ? ` memo-compose-open memo-compose-color-${formColor}` : ""}`} ref={memoRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="dialog-head" style={{ marginBottom: 4 }}>
            <h3 className="monthly-dialog-title"><span>Monthly MEMO</span><small>{memoDialogDateIso}</small></h3>
            <div className="dialog-head-right">
              {memoFormOpen && autosaveStatusNode}
              {memoFormOpen && (
                <div className="mobile-editor-head-actions">
                  <button type="button" aria-label="실행 취소" onClick={() => compactEditorRef.current?.undo()}>↶</button>
                  <button type="button" aria-label="다시 실행" onClick={() => compactEditorRef.current?.redo()}>↷</button>
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
                onChange={(html) => { setFormBody(html); scheduleAutosave({ content: html }); }}
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
                  <span className={`star-toggle ${m.is_important ? "active" : ""}`} onClick={(e) => handleToggleImportant(m, e)}>
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
        {postitViewNode}
        {activeDialogKey === "memo" && bigEditorNode}
        {memoFormOpen && renderMobileMemoOptionsSheet()}
        {confirmDialogNode}
      </dialog>

      {/* Key Notes */}
      <dialog
        className="glass-dialog big tonedown" ref={keynotesRef} onClick={onDialogBackdropClick}
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
                <div className="keynote-pinned-grid">{displayedPinnedMemos.map(renderPinnedCard)}</div>
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
                  <div className="keynote-pinned-row">{displayedPinnedMemos.map(renderPinnedCard)}</div>
                </>
              )}

              {pinnedMemos.length > 0 && priorityMemos.length > 0 && <div className="keynote-divider"><span>✦</span></div>}

              {priorityMemos.length > 0 && (
                <>
                  <p className="keynote-group-title"><span className="priority-star">★</span> 중요 메모</p>
                  <div className="keynote-rest-grid">
                    {priorityMemos.map((m) => (
                      <div key={m.id} className={`postit ${postitColorClass(m.color)}`} onClick={() => openPostitView(m)}>
                        <span className="pin star">★</span>
                        <div className="postit-title">{m.emoji ? `${m.emoji} ` : ""}{m.title}</div>
                        {m.content && <div className="postit-body">{m.content_format === "rich_html" ? htmlToPlainText(m.content) : m.content}</div>}
                        <div className="s">{m.memo_type} · {m.start_date}{m.content_mode === "document" && <span className="memo-detail-badge"> · 상세 ›</span>}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {postitViewNode}
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
                <button type="button" className="add-btn" onClick={insertPendingAtCursor}>현재 커서 위치에 삽입</button>
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
                setBodyEditorDraft(html);
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
        <ScrollTopButton visible={bodyEditorScrollVisible} onClick={scrollBodyEditorToTop} />
      </dialog>

      {/* Projects 목록 */}
      <dialog className="glass-dialog big tonedown" ref={projectsRef} onClick={onDialogBackdropClick}>
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
                <div className="proj-empty">
                  <div className="hint">아직 등록된 프로젝트가 없습니다.<br />새로운 아이디어를 기록해보세요.</div>
                  <button className="add-btn proj-new-btn" onClick={openNewProject}>+ Project</button>
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
          className={`dialog-inner proj-detail-inner ${projMode !== "view" ? "proj-detail-editing" : ""}`}
          ref={projMode === "view" ? projectDetailScrollRef : undefined}
          onScroll={projMode === "view" ? onProjectDetailScroll : undefined}
        >
          <div className="dialog-head proj-detail-head">
            {projMode !== "view" && (
              <div className="mobile-editor-head-actions mobile-project-head-actions">
                <button type="button" aria-label="실행 취소" onClick={() => projectEditorRef.current?.undo()}>↶</button>
                <button type="button" aria-label="다시 실행" onClick={() => projectEditorRef.current?.redo()}>↷</button>
                <button type="button" className="mobile-more-btn" aria-label="프로젝트 더보기" onClick={() => setMobileProjectMenuOpen(true)}>⋮</button>
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
              <span className="desktop-close-symbol">✕</span><span className="mobile-back-symbol">‹ 목록</span>
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
              <div className="proj-form-grid proj-form-grid--compact">
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
                onChange={(html) => { setProjContent(html); scheduleProjectAutosave({ content: html }); }}
              />
              </div>

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

              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="cancel-btn" onClick={() => (projMode === "edit" ? setProjMode("view") : close(dialogs.projectDetail))}>취소</button>
                <button className="save-btn" disabled={savingProject} onClick={handleSaveProject}>{savingProject ? "저장 중..." : "저장"}</button>
              </div>
            </>
          )}
        </div>
        <ScrollTopButton visible={projectDetailScrollVisible} onClick={scrollProjectDetailToTop} />

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

                <section className="mypage-card">
                  <div className="mypage-card-heading"><Lock size={18} strokeWidth={2.2} />보안 설정</div>
                  <p className="mypage-card-desc">계정 보안을 위한 비밀번호를 관리할 수 있습니다.</p>
                  <WaveField
                    label="새 비밀번호" id="mypage-pw" type="password" required minLength={8} autoComplete="new-password"
                    placeholder="8자 이상 입력해 주세요" value={myPassword} onChange={(e) => setMyPassword(e.target.value)}
                  />
                  <WaveField
                    label="비밀번호 확인" id="mypage-pw2" type="password" required minLength={8} autoComplete="new-password"
                    placeholder="비밀번호를 한 번 더 입력하세요" value={myPasswordConfirm} onChange={(e) => setMyPasswordConfirm(e.target.value)}
                    state={myPasswordConfirmState}
                  />
                </section>
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
                  data-exhausted={(ideaMeta?.usedCount ?? 0) >= (ideaMeta?.maxCount ?? IDEA_MAX)}
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
                    <h5 className="idea-direction-title">{ideaDisplay.result.recommendationTitle}</h5>
                  </div>
                </div>
                <div className="idea-source-only">🛡 저장된 아이디어 자료만 기반으로 분석했어요</div>

                <div className="idea-section">
                  <div className="idea-section-title">왜 이 방향인가요?</div>
                  <div className="idea-direction-box">
                    <div className="idea-direction-box-icon">◎</div>
                    <p style={{ margin: 0 }}>{ideaDisplay.result.reason}</p>
                  </div>
                </div>

                {ideaDisplay.result.whatToBuild && (
                  <div className="idea-section">
                    <div className="idea-section-title">무엇을 만들면 되나요?</div>
                    <p className="idea-section-body">{ideaDisplay.result.whatToBuild}</p>
                  </div>
                )}

                <div className="idea-section">
                  <div className="idea-section-title">핵심 구현</div>
                  <ol className="idea-step-list">
                    {ideaDisplay.result.developmentSteps.map((s, i) => <li key={i}>{s}</li>)}
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
                      {ideaDisplay.result.completionCriteria.map((c, i) => <li key={i}>{c}</li>)}
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
                disabled={(ideaMeta?.usedCount ?? 0) >= (ideaMeta?.maxCount ?? IDEA_MAX)}
                onClick={runIdea}
              >
                <span className="idea-regenerate-icon">↻</span>
                <span className="idea-regenerate-copy">
                  <span className="idea-regenerate-main">재생성</span>
                  <span className="idea-regenerate-sub">
                    {(ideaMeta?.usedCount ?? 0) >= (ideaMeta?.maxCount ?? IDEA_MAX)
                      ? `오늘의 생성 횟수를 모두 사용했습니다 · ${ideaMeta?.maxCount}/${ideaMeta?.maxCount}`
                      : "다른 확장 방향으로 다시 생성"}
                  </span>
                </span>
              </button>

              <div className="idea-footer">
                <span className="idea-generation-meta">
                  {ideaMeta?.updatedAt ? `${formatUpdatedAt(ideaMeta.updatedAt)} 생성 · ` : ""}{ideaMeta?.usedCount ?? 0}/{ideaMeta?.maxCount ?? IDEA_MAX}
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

              {ideaProjectPicker && !pendingIdeaSave && (
                <div className="postit-overlay fixed-overlay open" onClick={() => setIdeaProjectPicker(false)}>
                  <div className="panel copy-picker" onClick={(e) => e.stopPropagation()}>
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
                <div className="postit-overlay fixed-overlay open" onClick={() => setPendingTitleOnlySave(false)}>
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
                <div className="postit-overlay fixed-overlay open" onClick={() => setPendingIdeaSave(null)}>
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
        </div>
      </dialog>

      {/* 포스트잇 단독 보기/편집 — 먼슬리 메모나 Today's Focus의 상세 모달을 통째로 열지 않고 포스트잇만 띄운다 */}
      <dialog className="glass-dialog postit-only" ref={postitOnlyRef} onClick={onDialogBackdropClick}>
        {postitViewNode}
        {activeDialogKey === "postitOnly" && bigEditorNode}
        {confirmDialogNode}
      </dialog>
    </div>
  );
}
