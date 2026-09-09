"use client";

// Dashboard.tsx의 대시보드 카드 7개 JSX를 **그대로 옮겼다**(들여쓰기만 8칸 줄임 · 내용 변경 0).
// 🔴 이 파일은 **렌더링만** 한다 — state·ref·effect·data logic·autosave·dialog orchestration은
//   전부 Dashboard와 기존 훅이 그대로 소유하고, 여기서는 값과 콜백을 prop으로 받는다.
// 🔴 `dialogs`/`open`은 원문 호출식(`open(dialogs.news)`)을 글자 그대로 유지하려고 받는다.
//   카드가 dialog 레지스트리를 소유하는 것이 아니다.
// 🔴 MindSet·Projects의 데스크톱/모바일 분기 JSX도 원문 그대로다(새 분기 만들지 않았다).

import { Lightbulb, FileText, Code2, TriangleAlert } from "lucide-react";
import { PreviewRow, GuestLockCard, AiLoadingStage } from "@/components/dashboard/presentational";
import { NEWS_SOURCE_LOGOS, JOB_SITE_LOGOS, WEEKDAY_LABELS, postitColorClass } from "@/lib/dashboard/helpers";
import type { Memo } from "@/lib/memo/types";
import type { BriefingView } from "@/lib/news/get-briefing";
import type { JobsView } from "@/lib/jobs/get-jobs";
import type { useMemoListData } from "@/lib/memo/useMemoListData";

type DialogRef = React.RefObject<HTMLDialogElement | null>;
type OpenFn = (d: DialogRef) => void;
type MemoListData = ReturnType<typeof useMemoListData>;

export function MindsetCard({ mindset, mindsetSaved, guardLogin, fitMindsetToBox, saveMindsetNow }: {
  mindset: string;
  mindsetSaved: boolean;
  guardLogin: () => boolean;
  fitMindsetToBox: (el: HTMLInputElement | HTMLTextAreaElement, composing: boolean) => void;
  saveMindsetNow: (v: string) => void;
}) {
  return (
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
  );
}

export function NewsCard({ guardLogin, open, dialogs, isLoggedIn, briefing, newsItems }: {
  guardLogin: () => boolean;
  open: OpenFn;
  dialogs: { news: DialogRef };
  isLoggedIn: boolean;
  briefing: BriefingView | null;
  newsItems: BriefingView["selectedNews"];
}) {
  return (
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
  );
}

export function JobsCard({ guardLogin, open, dialogs, isLoggedIn, hasLegacyRoles, jobs }: {
  guardLogin: () => boolean;
  open: OpenFn;
  dialogs: { jobs: DialogRef };
  isLoggedIn: boolean;
  hasLegacyRoles: boolean;
  jobs: JobsView | null;
}) {
  return (
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
  );
}

export function TrendCard({ guardLogin, open, dialogs }: {
  guardLogin: () => boolean;
  open: OpenFn;
  dialogs: { trendBrief: DialogRef };
}) {
  return (
    <div className="panel trend-panel" onClick={() => { if (guardLogin()) open(dialogs.trendBrief); }}>
      <p className="label">AI Trend Briefing</p>
      <p className="smart-subtitle">오늘의 AI 흐름을 한눈에 확인하세요</p>
      <div className="trend-layout">
        <div className="trend-visual">
          {/* 🔴 2026-09-05 — 네 라벨이 상세 4섹션과 **같아야 한다**(제품 결정).
              `도구·서비스` → `역량 시그널`. 이 칸은 이미지가 아니라 markup이라
              자산 안에 남는 글자가 없다(public/에 트렌드 일러스트 0건, 전수 확인). */}
          <span className="trend-bubble industry">업계 영향</span>
          <span className="trend-bubble developer">개발자 동향</span>
          <span className="trend-bubble skill">역량 시그널</span>
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
  );
}

export function MonthlyMemoCard({
  guardLogin, open, dialogs, goToToday, setMemoFormOpen, today, weekPreview,
  openMemoModalAt, todayMemoItems, dueTodayCount, incompleteTodoCount,
  openPostitFromDashboard, ddayLabel, nextMemo, openCreateMemoForm,
}: {
  guardLogin: () => boolean;
  open: OpenFn;
  dialogs: { memo: DialogRef; focus: DialogRef };
  goToToday: () => void;
  setMemoFormOpen: (v: boolean) => void;
  today: { year: number; month0: number; day: number };
  weekPreview: MemoListData["weekPreview"];
  openMemoModalAt: (y: number, m0: number, day: number) => void;
  todayMemoItems: Memo[];
  dueTodayCount: number;
  incompleteTodoCount: number;
  openPostitFromDashboard: (m: Memo) => void;
  ddayLabel: (endDate: string) => string;
  nextMemo: Memo | null;
  openCreateMemoForm: () => void;
}) {
  return (
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
  );
}

export function ProjectsCard({
  guardLogin, open, dialogs, isLoggedIn, openNewProject,
  projectIdeaCount, projectIdeaOnlyCount, projectDraftCount, projectDevCount,
}: {
  guardLogin: () => boolean;
  open: OpenFn;
  dialogs: { projects: DialogRef; idea: DialogRef };
  isLoggedIn: boolean;
  openNewProject: () => void;
  projectIdeaCount: number;
  projectIdeaOnlyCount: number;
  projectDraftCount: number;
  projectDevCount: number;
}) {
  return (
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
  );
}

export function KeyNotesCard({ theme, isLoggedIn, pinnedMemos, guardLogin, openKeyNotes }: {
  theme: "light" | "dark";
  isLoggedIn: boolean;
  pinnedMemos: Memo[];
  guardLogin: () => boolean;
  openKeyNotes: () => void;
}) {
  return (
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
  );
}
