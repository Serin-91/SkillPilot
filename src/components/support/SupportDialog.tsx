"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CircleHelp, ArrowLeft, Newspaper, TrendingUp, Briefcase, CalendarDays,
  Bookmark, FolderKanban, Target, Lightbulb, MessageCircle, CircleCheck,
  PenLine, Heart, MapPin, MousePointerClick, TriangleAlert, RotateCcw,
} from "lucide-react";
import { sendFeedback, sendBugReport } from "@/lib/actions/support";
import { FEEDBACK_TYPES, BUG_FEATURES } from "@/lib/support-options";

export type SupportDialogHandle = { openHelp: () => void };

type HelpBlock = { heading?: string; paragraphs?: string[]; bullets?: string[] };
type HelpTopic = { id: string; title: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; cardBlurb: string; intro: string; blocks: HelpBlock[] };

// 도움말 8개 기능 카드 — 문구는 최신 구현(특히 Today's Focus 기한초과 규칙, Idea Build 하루 2회)에 맞춰 작성했다.
const HELP_TOPICS: HelpTopic[] = [
  {
    id: "news", title: "News", icon: Newspaper,
    cardBlurb: "매일 주요 AI·Tech 뉴스를 확인하고 필요한 내용을\n메모로 저장하세요.",
    intro: "매일 AI·Tech 관련 최신 뉴스를 확인할 수 있습니다.",
    blocks: [{ bullets: [
      "주요 뉴스를 하루 최대 4건까지 확인할 수 있습니다.",
      "각 뉴스에서 제목, 출처, 게시일과 함께 핵심 요약을 제공합니다.",
      "Why it matters에서는 이 뉴스가 왜 중요한지, 개발자에게 어떤 의미가 있는지를 쉽게\n확인할 수 있습니다.",
      "오늘뿐 아니라 저장된 어제·그저께 결과도 다시 확인할 수 있습니다.",
      "기사에서 필요한 문장을 드래그해 선택한 뒤 복사하거나 Monthly MEMO에 저장할 수\n있습니다.",
      "필요한 경우 기사 전체 내용도 Monthly MEMO에 저장할 수 있습니다.",
      "원문 보기를 이용하면 해당 뉴스의 원문 페이지를 확인할 수 있습니다.",
    ] }],
  },
  {
    id: "ai-trend", title: "AI Trend Briefing", icon: TrendingUp,
    cardBlurb: "뉴스와 개발 생태계에서 오늘 주목할 AI 흐름을\n한눈에 확인하세요.",
    intro: "뉴스와 개발 생태계의 흐름을 바탕으로 오늘 주목할 AI 트렌드를 정리합니다.\n단순히 뉴스를 다시 나열하는 것이 아니라, 아래 관점으로 오늘 확인할 만한 흐름을 정리합니다.",
    blocks: [
      { heading: "업계 영향", paragraphs: ["새로운 모델, 서비스, 기업의 변화가 AI 업계와 개발 환경에 어떤 영향을 줄 수 있는지\n정리합니다."] },
      { heading: "도구·서비스 업데이트", paragraphs: ["AI 모델, API, 개발 도구, 플랫폼 등 개발자가 실제로 접할 수 있는 주요 업데이트와 변화를\n정리합니다."] },
      { heading: "개발자 동향", paragraphs: ["개발자들이 주목하고 있는 모델, 오픈소스, 개발 도구와 기술 흐름을 확인할 수 있도록\n정리합니다."] },
      { heading: "실무 적용", paragraphs: ["해당 흐름이 실제 개발, 학습, 개인 프로젝트 또는 서비스 구현에 어떻게 연결될 수 있는지 실무\n관점에서 정리합니다."] },
      { heading: "추가 기능", bullets: [
        "필요한 문장을 드래그해 선택하여 복사하거나 Monthly MEMO에 저장할 수 있습니다.",
        "필요한 경우 전체 내용을 Monthly MEMO에 저장할 수 있습니다.",
      ] },
    ],
  },
  {
    id: "job-description", title: "Job Description", icon: Briefcase,
    cardBlurb: "관심 직무 기반의 최신 채용공고를 매일 확인하세요.",
    intro: "설정한 관심 직무를 기준으로 추천 채용공고를 확인할 수 있습니다.",
    blocks: [
      { bullets: [
        "가입 또는 My Page에서 선택한 관심 직무와 우선순위를 기준으로 채용공고를 구성합니다.",
        "매일 유효한 채용공고 4건을 추천하며, 새로 확인된 적합 공고를 우선 제공합니다.",
        "신규 공고가 부족한 경우에는 이전에 추천된 공고 중 아직 채용 중인 적합 공고를 함께 추천할 수 있습니다.",
        "회사명, 공고명, 출처, 경력, 마감일을 확인할 수 있습니다.",
        "주요 업무, 자격요건, 우대사항을 공고 내용에 맞춰 확인할 수 있습니다.",
        "공고에 실제로 등장하는 주요 기술은 기술 태그로 확인할 수 있습니다.",
        "처음 추천되는 공고는 NEW 표시로 확인할 수 있습니다.",
        "현재 추천 공고 외에 이전에 추천된 유효 공고는 '최근 추천'에서 다시 확인할 수 있습니다.",
        "필요한 문장을 선택하여 Monthly MEMO에 저장하거나, 공고 전체를 저장할 수 있습니다.",
        "원문 링크를 통해 실제 채용공고 페이지를 확인할 수 있습니다.",
      ] },
      { heading: "관심 직무를 바꾸면", paragraphs: ["관심 직무를 변경해도 이미 생성된 오늘의 채용공고는 그대로 유지되며, 변경된 설정은\n다음 채용공고 생성부터 적용됩니다."] },
    ],
  },
  {
    id: "monthly-memo", title: "Monthly MEMO", icon: CalendarDays,
    cardBlurb: "날짜별로 메모를 기록하고 필요한 정보를\n저장하세요.",
    intro: "할 일, 학습 기록, 개발 기록, 참고 자료 등을 날짜별로 관리하는 공간입니다.",
    blocks: [
      { heading: "Todo", paragraphs: ["해야 할 일을 기록하고 예정 / 진행 중 / 완료 상태로 관리합니다."] },
      { heading: "Dev Note", paragraphs: ["개발 중 발생한 문제, 원인, 해결 과정, 새롭게 배운 내용을 기록할 때 사용합니다."] },
      { heading: "Free Note", paragraphs: ["참고 자료, 아이디어 등 형식에 제한 없이 자유롭게 기록할 때 사용합니다."] },
      { heading: "추가 기능", bullets: [
        "시작일과 종료일을 설정해 일정 기간에 걸친 메모를 관리할 수 있습니다.",
        "중요한 메모는 별표로 표시할 수 있습니다.",
        "중요한 메모 중 필요한 항목은 Pin으로 고정할 수 있습니다.",
        "달력에서 날짜별 메모를 확인할 수 있습니다.",
        "News, AI Trend Briefing, Job Description에서 필요한 내용을 Monthly MEMO로\n가져올 수 있습니다.",
        "메모 작성 영역의 확장 기능을 이용하면 더 큰 편집 화면에서 긴 내용을 작성할 수 있습니다.",
        "제목, 강조, 목록, 체크리스트, 링크 등 편집 도구로 내용을 정리할 수 있습니다.",
      ] },
    ],
  },
  {
    id: "key-notes", title: "Key Notes", icon: Bookmark,
    cardBlurb: "중요한 내용과 인사이트를 Key Notes에 기록하고\n관리하세요.",
    intro: "중요하게 표시한 메모를 따로 모아 빠르게 확인하는 공간입니다. Key Notes는 크게\nPin과 Priority로 나뉩니다.",
    blocks: [
      { heading: "Pin", bullets: [
        "중요 메모 중 사용자가 직접 Pin으로 고정한 메모입니다.",
        "Pin은 중요 메모에만 설정할 수 있습니다.",
        "Pin 메모는 드래그하여 원하는 순서로 정렬할 수 있습니다.",
        "전체보기를 이용하면 확대된 화면에서 고정 메모를 한 번에 확인하고 관리할 수 있습니다.",
      ] },
      { heading: "Priority", bullets: [
        "별표로 중요 표시했지만 Pin으로 고정하지 않은 메모를 모아 보여줍니다.",
        "중요한 메모를 빠르게 확인할 때 사용할 수 있습니다.",
      ] },
      { heading: "공통", bullets: [
        "Key Notes에서 메모를 열어 내용을 확인할 수 있습니다.",
        "현재 제공되는 수정 진입 방식에 따라 Quick Edit / Detail Edit 등 기존 편집 기능으로\n이어질 수 있습니다.",
      ] },
    ],
  },
  {
    id: "projects", title: "Projects", icon: FolderKanban,
    cardBlurb: "프로젝트 아이디어를 관리하고 체크리스트로\n진행 상황을 추적하세요.",
    intro: "프로젝트 아이디어와 진행 내용을 한곳에서 기록하고 관리합니다.",
    blocks: [{ bullets: [
      "프로젝트명과 한 줄 요약을 작성할 수 있습니다.",
      "프로젝트 상태를 아이디어 / 기획안작성 / 개발중 / 완료로 관리할 수 있습니다.",
      "프로젝트 목적, 핵심 기능, 대상 사용자, 상세 내용을 기록할 수 있습니다.",
      "기본 템플릿을 선택하면 프로젝트를 정리하기 위한 기본 구조가 자동으로 입력됩니다.",
      "핵심 기능은 체크리스트 형태로 관리할 수 있습니다.",
      "프로젝트명과 요약으로 검색할 수 있습니다.",
      "상태별 필터를 이용해 필요한 프로젝트만 볼 수 있습니다.",
      "작성한 프로젝트는 Idea Build의 기반 자료로 사용됩니다.",
    ] }],
  },
  {
    id: "todays-focus", title: "Today's Focus", icon: Target,
    cardBlurb: "오늘의 우선순위 할 일 3가지를 확인하고\n집중하세요.",
    intro: "시작일이 되었지만 아직 완료되지 않은 Todo 중 우선 확인할 항목을 최대 3개까지 정리합니다.",
    blocks: [
      { heading: "후보 기준", bullets: [
        "완료된 Todo는 제외됩니다.",
        "시작일이 오늘이거나 이미 지난 Todo가 후보에 포함됩니다.",
        "마감일이 지났더라도 미완료 상태라면 후보에서 제외하지 않습니다.",
        "기한이 지난 Todo는 기한초과 D+N 형태로 확인할 수 있습니다.",
      ] },
      { heading: "우선순위", bullets: [
        "진행 중이면서 기한이 초과된 Todo와, 오늘 마감 / D-1 / D-2처럼 마감이 임박한 Todo를 먼저 확인합니다.",
        "그다음 진행 중인 Todo를 우선합니다.",
        "상태가 예정이지만 이미 기한이 지난 Todo도 후보에 포함됩니다.",
        "이후 일반 예정 Todo를 정렬합니다.",
        "같은 조건에서는 마감일, 중요 여부, 시작일 등 정해진 기준으로 순서를 계산합니다.",
      ] },
      { heading: "결과", bullets: [
        "최대 3개의 Todo를 보여줍니다.",
        "각 항목의 D-day를 확인할 수 있습니다.",
        "Why this first에서 해당 Todo가 먼저 선정된 이유를 확인할 수 있습니다.",
        "필요할 때 다시 계산할 수 있으며 횟수 제한은 없습니다.",
      ] },
      { paragraphs: ["Today's Focus는 생성형 AI가 임의로 할 일을 추천하는 기능이 아닙니다. Todo의 날짜,\n진행 상태, 중요 여부 등 정해진 우선순위 규칙에 따라 계산되는 기능입니다."] },
    ],
  },
  {
    id: "idea-build", title: "Idea Build", icon: Lightbulb,
    cardBlurb: "AI가 제안하는 아이디어를 통해 프로젝트를\n발전시켜 보세요.",
    intro: "저장해둔 프로젝트를 바탕으로 다음 발전 방향을 구체화하는 AI 기능입니다.",
    blocks: [
      { bullets: [
        "사용자가 프로젝트를 직접 선택할 수 있습니다.",
        "완료되지 않은 프로젝트 중 하나를 랜덤으로 선택할 수도 있습니다.",
        "선택한 프로젝트의 현재 상태와 작성된 내용을 바탕으로 다음 발전 방향을 제안합니다.",
        "추천 이유를 확인할 수 있습니다.",
        "실제로 만들 내용과 개발 단계를 확인할 수 있습니다.",
        "구현 흐름을 확인할 수 있습니다.",
        "필요한 기술과 각 기술이 필요한 이유를 확인할 수 있습니다.",
        "테스트 가능한 완료 기준을 함께 제공합니다.",
        "결과를 기존 프로젝트에 추가할 수 있습니다.",
        "결과 전체를 새 프로젝트로 저장할 수 있습니다.",
        "생성한 결과는 당일 History에서 다시 확인할 수 있습니다.",
      ] },
      { paragraphs: [
        "Idea Build는 사용자의 기존 프로젝트와 무관한 새 프로젝트를 임의로 만들어내는 기능이\n아닙니다. 사용자가 이미 작성한 프로젝트를 기반으로 다음 발전 방향을 구체화하는 기능입니다.",
        "Idea Build는 하루 최대 2회 사용할 수 있습니다.",
      ] },
    ],
  },
];

// Idea Build 결과 카드를 그대로 재사용한다 — 소제목은 점 불릿 대신 보라색 체크 아이콘,
// 목록은 idea-step-list의 숫자 원(1·2·3...) 디자인을 그대로 가져온다.
function HelpBlockView({ block }: { block: HelpBlock }) {
  return (
    <div className="idea-section">
      {block.heading && (
        <div className="idea-section-title help-subheading">
          <CircleCheck size={16} strokeWidth={2.4} className="help-subheading-check" aria-hidden="true" />
          {block.heading}
        </div>
      )}
      {block.paragraphs?.map((p, i) => <p key={i} className="idea-section-body" style={{ marginBottom: 10 }}>{p}</p>)}
      {block.bullets && (
        <ol className="idea-step-list help-detail-list">
          {block.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ol>
      )}
    </div>
  );
}

function HelpHome({ onSelectTopic }: { onSelectTopic: (id: string) => void }) {
  return (
    <>
      <div className="help-hero">
        <div className="help-hero-copy">
          <h2>도움말</h2>
          <p>SkillPilot의 주요 기능과 사용 방법을 확인해보세요.</p>
        </div>
        <span className="help-hero-icon"><CircleHelp size={40} strokeWidth={1.8} /></span>
      </div>

      <div className="help-section-title">
        <h3>시작하기</h3>
        <p>SkillPilot의 주요 기능을 선택해 자세한 사용 방법을 확인해보세요.</p>
      </div>

      <div className="help-feature-grid">
        {HELP_TOPICS.map((topic) => {
          const Icon = topic.icon;
          return (
            <button type="button" key={topic.id} className="help-feature-card" onClick={() => onSelectTopic(topic.id)}>
              <span className="help-feature-icon"><Icon size={22} strokeWidth={1.9} /></span>
              <span className="help-feature-copy">
                <strong>{topic.title}</strong>
                <span>{topic.cardBlurb}</span>
              </span>
              <span className="help-feature-chevron" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HelpDetail({ topic, onBack }: { topic: HelpTopic; onBack: () => void }) {
  const Icon = topic.icon;
  return (
    <div className="help-detail">
      <button type="button" className="help-detail-back" onClick={onBack}><ArrowLeft size={16} /> 도움말</button>
      <div className="idea-result-card">
        <header>
          <div className="help-detail-title-row">
            <span className="idea-direction-orb"><Icon size={26} strokeWidth={1.9} /></span>
            <h2 className="idea-source-title" style={{ fontSize: 28 }}>{topic.title}</h2>
          </div>
          <p className="idea-section-body help-detail-intro">{topic.intro}</p>
        </header>
        {topic.blocks.map((block, i) => <HelpBlockView key={i} block={block} />)}
      </div>
    </div>
  );
}

type SuccessVariant = "feedback" | "bug";
const SUCCESS_CONTENT: Record<SuccessVariant, { icon: string; title: string; desc: string }> = {
  feedback: { icon: "✨", title: "✨ 소중한 의견 남겨주셔서 감사합니다.", desc: "더 나은 SkillPilot을 만드는 데 소중히 반영하겠습니다. 💜" },
  bug: { icon: "🛠️", title: "🛠️ 버그를 제보해주셔서 감사합니다.", desc: "불편을 줄일 수 있도록 꼼꼼히 확인하겠습니다. 🔎" },
};

function SubmissionSuccessCard({ variant }: { variant: SuccessVariant }) {
  const c = SUCCESS_CONTENT[variant];
  return (
    <div className="submission-success-card" role="status" aria-live="polite">
      <span className="submission-success-icon" aria-hidden="true">{c.icon}</span>
      <span className="submission-success-copy">
        <span className="submission-success-title">{c.title}</span>
        <span className="submission-success-desc">{c.desc}</span>
      </span>
    </div>
  );
}

function InquiryLoginRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="inquiry-login-required">
      <p className="inquiry-login-title">의견 및 버그 문의는 로그인 후 이용할 수 있어요.</p>
      <p className="inquiry-login-sub">로그인하면 의견 보내기와 버그 신고를 이용할 수 있습니다.</p>
      <button type="button" className="save-btn" onClick={onLogin}>Log in</button>
    </div>
  );
}

function FeedbackForm({ path }: { path: string }) {
  const [type, setType] = useState<string>(FEEDBACK_TYPES[0]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" } | { kind: "error"; text: string } | null>(null);

  async function handleSubmit() {
    if (submitting || !content.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await sendFeedback(type, content, path);
      if ("error" in res) { setResult({ kind: "error", text: res.error }); return; }
      setResult({ kind: "ok" });
      setContent("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="support-form">
      <div className="support-field">
        <label>유형</label>
        <div className="status-select-group">
          {FEEDBACK_TYPES.map((t) => (
            <span
              key={t}
              className={`status-option ${type === t ? "active" : ""} ${t === "개발자 우쭈쭈 🐣" ? "status-option--tight" : ""}`}
              onClick={() => setType(t)}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="support-field">
        <label htmlFor="support-feedback-content">내용</label>
        <textarea
          id="support-feedback-content" className="big-body-input support-textarea" value={content} onChange={(e) => setContent(e.target.value)}
          placeholder={type === "개발자 우쭈쭈 🐣" ? "개발자에게 힘이 되는 한마디를 남겨주세요 :)" : "의견을 자유롭게 작성해주세요."}
        />
      </div>
      {result?.kind === "ok" && <SubmissionSuccessCard variant="feedback" />}
      {result?.kind === "error" && <p className="auth-error" role="alert">{result.text}</p>}
      <div className="support-submit-row">
        <button type="button" className="support-submit" disabled={submitting || !content.trim()} onClick={handleSubmit}>
          {submitting ? "전송 중..." : "보내기"}
        </button>
      </div>
    </div>
  );
}

function BugForm({ path }: { path: string }) {
  const [feature, setFeature] = useState<string>("");
  const [featureOpen, setFeatureOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" } | { kind: "error"; text: string } | null>(null);

  async function handleSubmit() {
    if (submitting || !feature || !content.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await sendBugReport(feature, content, path);
      if ("error" in res) { setResult({ kind: "error", text: res.error }); return; }
      setResult({ kind: "ok" });
      setContent("");
      setFeature("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="support-form">
      <div className="support-field">
        <label>문제가 발생한 기능</label>
        <div className="support-feature-dropdown">
          <button
            type="button"
            className="support-feature-trigger"
            aria-haspopup="listbox"
            aria-expanded={featureOpen}
            onClick={() => setFeatureOpen((v) => !v)}
          >
            <span>{feature || "선택"}</span><span className={`proj-filter-chevron ${featureOpen ? "open" : ""}`}>⌄</span>
          </button>
          {featureOpen && (
            <div className="support-feature-panel" role="listbox">
              {BUG_FEATURES.map((f) => (
                <button
                  type="button" key={f} role="option" aria-selected={feature === f}
                  className="support-feature-option"
                  onClick={() => { setFeature(f); setFeatureOpen(false); }}
                >
                  <span className="support-feature-dot" />{f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="support-field">
        <label htmlFor="support-bug-content">문제 내용</label>
        <textarea
          id="support-bug-content" className="big-body-input support-textarea" value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="어떤 문제가 발생했는지 자세히 작성해주세요."
        />
        <p className="support-field-hint">가능하면 문제 발생 순서와 기대했던 동작을 함께 적어주세요.</p>
      </div>
      {result?.kind === "ok" && <SubmissionSuccessCard variant="bug" />}
      {result?.kind === "error" && <p className="auth-error" role="alert">{result.text}</p>}
      <div className="support-submit-row">
        <button type="button" className="support-submit" disabled={submitting || !feature || !content.trim()} onClick={handleSubmit}>
          {submitting ? "전송 중..." : "보내기"}
        </button>
      </div>
    </div>
  );
}

type HelperCard = { icon: ComponentType<{ size?: number; strokeWidth?: number }>; title: string; desc: string; example: string };

const FEEDBACK_HELPER_CARDS: HelperCard[] = [
  { icon: Lightbulb, title: "기능 제안", desc: "이런 기능이 있으면 더 편할 것 같은 아이디어", example: "예: 새 기능, 자동화, 서비스 연동" },
  { icon: PenLine, title: "개선 의견", desc: "기존 기능에서 아쉽거나 불편했던 부분", example: "예: 사용 흐름, 버튼 위치, 문구, 디자인" },
  { icon: MessageCircle, title: "기타", desc: "분류하기 애매하지만 전하고 싶은 이야기", example: "예: 전체 사용 경험, 궁금한 점, 작은 제안" },
  { icon: Heart, title: "개발자 우쭈쭈🐣", desc: "잘 만든 기능이나 마음에 쏙 든 포인트", example: "예: 이 기능, 디테일 너무 좋아요!" },
];

const BUG_HELPER_CARDS: HelperCard[] = [
  { icon: MapPin, title: "발생 위치", desc: "문제가 생긴 화면이나 기능", example: "예: News, Monthly MEMO, Project" },
  { icon: MousePointerClick, title: "직전 행동", desc: "문제가 생기기 전에 했던 행동", example: "예: 저장, 삭제, 버튼 클릭, 탭 이동" },
  { icon: TriangleAlert, title: "문제 현상", desc: "실제로 어떤 문제가 발생했는지", example: "예: 화면이 안 열림, 저장 안 됨, 내용이 사라짐" },
  { icon: RotateCcw, title: "재현 여부", desc: "같은 행동을 다시 했을 때도 발생하는지", example: "예: 항상 발생 / 가끔 발생 /\n한 번만 발생" },
];

// 의견/버그 입력폼 오른쪽 보조 패널 — 왼쪽 폼과 같은 컴포넌트를 쓰고 variant로 카드 내용/accent만 바꾼다.
function FeedbackHelperPanel({ variant }: { variant: "feedback" | "bug" }) {
  const isBug = variant === "bug";
  const cards = isBug ? BUG_HELPER_CARDS : FEEDBACK_HELPER_CARDS;
  return (
    <aside className={`feedback-helper-panel${isBug ? " feedback-helper-panel--bug" : ""}`}>
      <p className="feedback-helper-title">{isBug ? "🔎 빠르게 확인하려면 알려주세요" : "✨ 이런 의견을 기다리고 있어요"}</p>
      <div className="feedback-helper-grid">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div className={`feedback-helper-card${c.title === "개발자 우쭈쭈🐣" ? " feedback-helper-card--cheer" : ""}`} key={c.title}>
              <div className="feedback-helper-card-title"><Icon size={15} strokeWidth={2.2} />{c.title}</div>
              <p className="feedback-helper-card-desc">
                {c.desc}
                <span className="feedback-helper-example">{c.example}</span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="feedback-helper-footer">
        {isBug
          ? "오류 문구가 있다면 함께 적어주시면 확인에 도움이 됩니다."
          : <>구체적인 상황이나 이유를 함께 적어주시면<br />개선 방향을 이해하는 데 더 도움이 됩니다.</>}
      </p>
    </aside>
  );
}

function InquiryPanel({ path }: { path: string }) {
  const [tab, setTab] = useState<"feedback" | "bug">("feedback");
  return (
    <div className="inquiry-panel">
      <div className="inquiry-intro">
        <div className="help-detail-title-row">
          <span className="help-feature-icon"><MessageCircle size={22} strokeWidth={1.9} /></span>
          <h2>의견 · 버그 문의</h2>
        </div>
        <p>SkillPilot을 사용하면서 떠오른 의견이나 발견한 문제를 알려주세요.</p>
      </div>
      <div className="inquiry-subtabs support-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "feedback"} onClick={() => setTab("feedback")}>의견 보내기</button>
        <button type="button" role="tab" aria-selected={tab === "bug"} onClick={() => setTab("bug")}>버그 신고</button>
      </div>
      <div className="inquiry-content-layout">
        {tab === "feedback" ? <FeedbackForm path={path} /> : <BugForm path={path} />}
        <FeedbackHelperPanel variant={tab} />
      </div>
    </div>
  );
}

// Header의 ?(도움말) / 말풍선(의견·버그 문의) 아이콘이 여는 공통 dialog — News/Job Description과 같은
// .glass-dialog 시스템을 그대로 재사용한다(크기/backdrop/close 동작을 새로 만들지 않는다).
export const SupportDialog = forwardRef<SupportDialogHandle, { isLoggedIn: boolean }>(
  function SupportDialog({ isLoggedIn }, ref) {
    const router = useRouter();
    const path = usePathname();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [supportTab, setSupportTab] = useState<"help" | "inquiry">("help");
    const [helpTopic, setHelpTopic] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      openHelp() {
        setSupportTab("help");
        setHelpTopic(null);
        dialogRef.current?.showModal();
      },
    }));

    function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
      if (e.target === e.currentTarget) e.currentTarget.close();
    }

    const activeTopic = helpTopic ? HELP_TOPICS.find((t) => t.id === helpTopic) ?? null : null;

    return (
      <dialog className="glass-dialog support-dialog" ref={dialogRef} onClick={onBackdropClick}>
        <div className="dialog-inner support-dialog-inner">
          <div className="dialog-head support-dialog-head">
            <div className="support-tabs" role="tablist">
              <button
                type="button" role="tab" aria-selected={supportTab === "help"}
                onClick={() => { setSupportTab("help"); setHelpTopic(null); }}
              >도움말</button>
              <button type="button" role="tab" aria-selected={supportTab === "inquiry"} onClick={() => setSupportTab("inquiry")}>
                의견 · 버그 문의
              </button>
            </div>
            <button className="close-btn" onClick={() => dialogRef.current?.close()}>✕</button>
          </div>

          <div className="support-dialog-body">
            {supportTab === "help" ? (
              activeTopic ? (
                <HelpDetail topic={activeTopic} onBack={() => setHelpTopic(null)} />
              ) : (
                <HelpHome onSelectTopic={setHelpTopic} />
              )
            ) : isLoggedIn ? (
              <InquiryPanel path={path} />
            ) : (
              <InquiryLoginRequired onLogin={() => { dialogRef.current?.close(); router.push("/login"); }} />
            )}
          </div>
        </div>
      </dialog>
    );
  }
);
