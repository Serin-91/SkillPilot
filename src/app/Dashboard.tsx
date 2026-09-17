"use client";

// useMemo는 마지막 사용처(filteredProjects)가 `useProjectWorkspace`로 가면서 여기서 안 쓴다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
// 옛 `dashboard.css` 한 덩어리(11,102줄)를 **줄 범위 그대로** 8개로 자른 것이다.
// 🔴 **이 import 순서가 캐스케이드다. 재배열하지 마라.**
//    셀렉터 613개가 2회 이상 등장한다(총 1,521회). 특이도가 같으면 **뒤에 온 것이 이긴다** —
//    "기능별로 예쁘게" 재배열하는 순간 그 613개의 승자가 바뀐다. 자른 경계는 전부 최상위 블록
//    사이이고, 8개를 이 순서로 이어붙이면 분할 전 파일과 **바이트 동일**했다.
//    지키는 장치: `npx tsx src/lib/dashboard/css-order.check.ts` (`npm run check`에 포함).
// 🔴 새 규칙은 **자기 기능 파일**에 넣어라. 06·07·08은 **동결**이다 — 날짜순 패치 레이어라
//    기능 owner가 없고 의미가 순서 자체에 들어 있다. 더 자라면 안 된다.
//
// 옛 주석·문서의 "dashboard.css NNNN절"을 찾는 법 — 아래 범위에서 파일을 고르고,
// 그 파일 안 줄번호 = NNNN − (범위 시작 − 1). 헤더를 넣지 않았으므로 이 식이 정확하다.
//   01  1–861      기반 토큰·리셋·글래스 · 헤더/날씨 · 대시보드 카드(AI Trend·Key Notes·Growth·Projects·Jobs)
//   02  862–1760   Monthly MEMO(달력·Create·드롭다운) · 복사픽커/원형메뉴/삽입바 · 공용 다이얼로그 · News/Job 상세
//   03  1761–2054  Tiptap 리치 에디터 · 서식 툴바 · 본문 렌더 공통 · 자동저장 pill
//   04  2055–2593  Today's Focus · Idea Build
//   05  2594–4261  Day11 헤더 회원분기·Guest Lock · My Page · System Status · 도움말/문의
//   06  4262–6952  🔴 B띠 — 2026-08-19~21 모바일 날짜순 패치(last-wins 누적)
//   07  6953–9495  🔴 C띠 — 2026-08-24 다크모드 Phase 2~4 + 같은 날 웹 수정분
//   08  9496–11102 🔴 D띠 — 메모/프로젝트 편집 페이지 · iOS 키보드/뷰포트(--app-vh·--kb-inset·safe-area·sticky)
import "./styles/dashboard/01-base-cards.css";
import "./styles/dashboard/02-memo-dialogs.css";
import "./styles/dashboard/03-rich-editor.css";
import "./styles/dashboard/04-focus-idea.css";
import "./styles/dashboard/05-account-help.css";
import "./styles/dashboard/06-mobile-patches.css";
import "./styles/dashboard/07-dark-theme.css";
import "./styles/dashboard/08-editor-viewport.css";
import "./auth.css";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
// SelectedNewsItem은 `useSelectionToMemo`로 갔다.
import type { JobsView, SavedJobRow } from "@/lib/jobs/get-jobs";
// MemoColor·MemoType·TodoStatus·ContentFormat·ContentMode는 폼 state와 함께
// `useMemoEditSession`으로 갔다 — 여기서는 더 안 쓴다(eslint no-unused-vars).
// SourceType은 `SelSource`와 함께 `useSelectionToMemo`로 갔다.
import type { Memo } from "@/lib/memo/types";
// Memo 소유권 리팩토링 1단계 — 폼 state 16 / ref 4 / 핸들러 11 / effect 1(날짜 검증)을
// `useMemoEditSession`으로 **그대로** 옮겼다. 구조분해로 받으므로 호출부 이름은 rename 0곳이다.
// 🔴 bodyEditor·activeMemoEditorRef·LIST/SHELL/INSERT는 그 파일 맨 위 주석대로 여기 남아 있다.
import { useMemoEditSession } from "@/lib/memo/useMemoEditSession";
import { buildMemoInput } from "@/lib/memo/memo-input";
// 2단계 — 목록·달력 데이터(state 15 / 파생 / useMemo 6 / effect 4)를 `useMemoListData`가 갖는다.
// 🔴 이 훅은 `useMemoEditSession`보다 **먼저** 호출돼야 한다(그쪽이 이쪽의 setter를 인자로 받는다).
//    `patchMemoInLists`는 편집 폼 state를 만지므로 순환을 피해 Dashboard에 다리로 남겼다.
import { useMemoListData } from "@/lib/memo/useMemoListData";
import {
  // copySelectionToMemo·copyFullNews/Job/Trend·getMemosForDateAction은 `useSelectionToMemo`로 갔다.
  createMemo, updateMemo, toggleImportant, setMemoPinned, recordMemoSource,
  getMemosForMonthAction,
} from "@/lib/actions/memo";
// newsFullBlockHtml·jobFullBlockHtml·trendFullBlockHtml은 `useSelectionToMemo`로 갔다.
import { toEditableHtml, htmlToPlainText, hasRichFormatting } from "@/lib/memo/rich-text";
import { type MemoRichEditorHandle } from "@/components/memo/MemoRichEditor";
// WaveField·JobRolePicker 값 import는 PHASE 1 ④에서 my-page-dialog.tsx로 옮겨갔다.
// `FieldState` 계산(myPasswordConfirmState/myCurrentPasswordState)은 `useMyPageSession`으로 갔다.
// RichMemoContent는 ④와 함께 postit-view.tsx로 갔다(2026-09-11) — 여기 사용처가 0이 됐다.
// PROJECT_STATUSES·PROJECT_TEMPLATE_HTML·toggleTaskItemInHtml은 `useProjectWorkspace`로 갔다.
import { type ProjectIdea } from "@/lib/project/types";
// Undo2/Redo2 — 예전엔 유니코드 글자 ↶(U+21B6)/↷(U+21B7)를 그대로 썼는데, SUIT·Noto Sans KR
// 어느 쪽에도 이 글리프가 없어서 모바일 브라우저가 제각각 폴백 폰트로 그렸다(굵기·크기가 전혀 안
// 맞는 기괴한 곡선 화살표로 보였다). 툴바 나머지가 이미 쓰고 있는 lucide 아이콘으로 통일한다.
// Lightbulb·FileText·Code2·TriangleAlert는 카드로, UserRound·LogOut·CircleHelp·Sun·Moon은 헤더로 갔다.
// Trash2는 monthly-memo-dialog.tsx로 갔다.
// CircleCheck·Dices·ScanSearch는 Idea Build JSX와 함께 idea-dialog.tsx로 갔다(2026-09-11).
// 🔴 Undo2·Redo2도 이제 여기 없다 — ②가 project-detail-dialog.tsx로, ①이
// memo-edit-form.tsx로 가져갔다(2026-09-11). 위 주석의 경위는 그 두 파일에서 유효하다.
import { SupportDialog, type SupportDialogHandle } from "@/components/support/SupportDialog";
// saveProjectIdea·deleteProjectIdea는 `useProjectWorkspace`로 갔다(Idea Build 쪽은 자기 훅에서 import한다).
// signOut은 헤더로 갔다(로그아웃 버튼이 거기 있다).
import type { JobRole } from "@/lib/jobs/roles";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { IDEA_MAX, type FocusView, type IdeaView } from "@/lib/ai/state";
import type { WeatherView } from "@/lib/weather";
import { useLiveWeather } from "@/lib/useLiveWeather";
// WeatherMeta·WeatherTempTrigger는 헤더로 갔다.

// PHASE 0 ② — 헬퍼를 역할별 파일로 옮겼다(docs/refactor-plan.md §4-2). 옮기기만 했고 로직 변경 없음.
import {
  // EMPTY_MEMOS·DateRangeMode·groupMemosByDay는 목록/달력과 함께 `useMemoListData`로 갔다.
  // NEWS_SOURCE_LOGOS·JOB_SITE_LOGOS·WEEKDAY_LABELS는 카드로 갔다.
  // JobTextGroup·parseJobTextSections는 `useSelectionToMemo`로 갔다.
  // SUMMARY_MAX_LENGTH는 `useProjectWorkspace`로 갔다.
  // STATUS_OPTIONS·postitColorClass는 ④와 함께 postit-view.tsx로 갔다(2026-09-11).
  // colorInputClass는 ①과 함께 memo-edit-form.tsx로 갔다(2026-09-11).
  // KEEP_EDITOR_FOCUS는 ⑤(삽입 대기 bar)와 함께 big-editor.tsx로 갔다(2026-09-11).
  isoDate,
} from "@/lib/dashboard/helpers";
import {
  // PreviewRow·GuestLockCard·AiLoadingStage는 카드로 갔다.
  // ProjectStatusBadge는 Idea Build JSX와 함께 idea-dialog.tsx로 갔다(2026-09-11).
  // ScrollTopButton은 ④와 함께 postit-view.tsx로 갔다(2026-09-11).
  ConfirmDialog,
  ProjectTemplatePrompt,
} from "@/components/dashboard/presentational";
// IdeaSourcePicker도 같은 이동으로 idea-dialog.tsx가 직접 import한다.
import { IdeaDialog } from "@/components/dashboard/idea-dialog";
import { MyPageDialog } from "@/components/dashboard/my-page-dialog";
import { ProjectsListDialog } from "@/components/dashboard/projects-list-dialog";
import { ProjectDetailShell } from "@/components/dashboard/project-detail-dialog";
import { MemoHeadActions, QuickEditForm, MemoEditForm, MobileMemoOptionsSheet, MemoEditPageShell } from "@/components/dashboard/memo-edit-form";
import { BigEditorInsertBar, BigEditorActions, BigEditorOverlay, BigEditorPageShell } from "@/components/dashboard/big-editor";
import { PostitView } from "@/components/dashboard/postit-view";
import { KeynotesDialog } from "@/components/dashboard/keynotes-dialog";
import { BodyEditorDialog } from "@/components/dashboard/body-editor-dialog";
import { FocusDialog } from "@/components/dashboard/focus-dialog";
import { NewsDialog } from "@/components/dashboard/news-dialog";
import { TrendDialog } from "@/components/dashboard/trend-dialog";
import { JobCard, JobsDialog } from "@/components/dashboard/jobs-dialog";
// 🔴 widgets.tsx에서 가져오던 것이 이제 0개라 import 자체를 뚝였다. 어디로 갔는지만 남긴다:
//   RadialSelectionMenu·MobileSelectionActionBar → selection-overlays.tsx
//   DateRangeSelector → monthly-memo-dialog.tsx
//   MemoTypeDropdown → memo-edit-form.tsx(①) · MiniDatePicker → memo-edit-form.tsx(⑥, 2026-09-11)
import {
  useIsoLayoutEffect, useScrollTopButton,
} from "@/lib/dashboard/hooks";
import { useDialogRegistry } from "@/lib/dashboard/useDialogRegistry";
import { useMyPageSession } from "@/lib/dashboard/useMyPageSession";
import { useIdeaBuild } from "@/lib/dashboard/useIdeaBuild";
import { useNewsTrendFeed } from "@/lib/dashboard/useNewsTrendFeed";
import { useJobsFeed } from "@/lib/dashboard/useJobsFeed";
import { useMindsetBar } from "@/lib/dashboard/useMindsetBar";
import { useTodaysFocus } from "@/lib/dashboard/useTodaysFocus";
import { useProjectWorkspace } from "@/lib/dashboard/useProjectWorkspace";
// PHASE 1 — 헤더/카드 JSX만 옮긴 프레젠테이션 컴포넌트. 소유권 이동 0.
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
// PHASE 2 — 선택→메모 저장. `SelSource`는 `pendingInsert` state 타입이라 여기서도 쓴다(타입만).
import { useSelectionToMemo, type SelSource } from "@/lib/dashboard/useSelectionToMemo";
import { RadialMenuOverlay, SelectionOverlays } from "@/components/dashboard/selection-overlays";
// PHASE 3 — Monthly MEMO 다이얼로그 본문 조립. Memo 소유권은 두 훅에 그대로 있다.
import { MonthlyMemoDialogBody } from "@/components/dashboard/monthly-memo-dialog";
import {
  MindsetCard, NewsCard, JobsCard, TrendCard, MonthlyMemoCard, ProjectsCard, KeyNotesCard,
} from "@/components/dashboard/dashboard-cards";
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
  // 오늘 날짜 — **선언 위치만 옮겼다**(원래 `useRouter()` 아래). 아래 두 피드 훅이 fallback
  // payload에서 쓰는데 그 자리가 여기보다 아래였다. 계산식·값은 그대로다.
  const todayIso = isoDate(today.year, today.month0, today.day);

  // Briefing 피드 — News·AI Trend와 Jobs는 **서로 참조가 0인 별개 payload**라 훅을 둘로 나눴다.
  // state 9 · effect 5 · 함수 4 · 파생값 10이 그리로 갔고, 본문은 그대로다.
  // 🔴 훅 호출을 이 자리에서 옮기지 마라 — 옮긴 hook 호출이 전부 이 구간에 있었으므로
  //   여기서 부르면 훅 호출 순서가 추출 전과 **완전히 같다**.
  const {
    briefing, briefingRetrying, handleRetryBriefing,
    newsItems, activeNewsItems, newsFailed, newsDelayed,
    newsHistoryDate, setNewsHistoryDate, historyDateLabel,
    trendHistoryDate, setTrendHistoryDate, trendBriefing, toolUpdates, skillSignals, hasSkillSection,
  } = useNewsTrendFeed({ initialBriefing, newsHistory, isLoggedIn, isAdmin, todayIso });
  const {
    jobs, jobsRetrying, handleRetryJobs, jobsFailed, jobsDelayed,
    jobTab, setJobTab, selectJobTab, expandedJobUrl, setExpandedJobUrl, jobsRecent,
  } = useJobsFeed({ initialJobs, isLoggedIn, isAdmin, jobRolePriority, todayIso });

  // 추천 공고 / 최근 추천 두 탭이 같은 카드를 쓴다 — 접힌 요약(collapsed) + 상세보기 펼침(accordion).
  // PHASE 2 ⑨-a — 카드 본문 JSX(103줄)는 components/dashboard/jobs-dialog.tsx의 JobCard로 옮겼다.
  // 🔴 `expandedJobUrl` state는 **여기 남는다** — 620줄 `useDialogRegistry.onOpen`이 그 setter를
  //    부르므로(다이얼로그 밖이다) 자식으로 내리면 그 배선이 끊긴다. 카드에는 값과 setter를 그대로 넘긴다.
  // 🔴 이 래퍼를 지우고 호출부를 `.map((j) => <JobCard …/>)`로 펼치지 마라 — 두 호출부를
  //    `map(renderJobCard)` 그대로 두는 것이 diff를 0으로 유지하고, `key`도 계속 배열 요소 자신에 붙는다.
  function renderJobCard(j: SavedJobRow) {
    return (
      <JobCard
        key={j.id}
        job={j}
        expandedJobUrl={expandedJobUrl}
        setExpandedJobUrl={setExpandedJobUrl}
        todayIso={todayIso}
        selectableHandlers={selectableHandlers}
        openFullJobPicker={openFullJobPicker}
      />
    );
  }

  const router = useRouter();

  // 뉴스/채용 수동 새로고침은 삭제됐다 — 예약 생성 + 당일 최초 접속 fallback으로만 갱신된다.

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
  // 🔴🔴 2026-09-08 — 프로젝트 편집도 **일반 페이지**로. HANDOFF 55-8이 지정한 구조 전환이다.
  //
  // 프로젝트 편집은 옛 구조 네 조건을 전부 갖고 있었다(11-11~11-13절이 못박은 그 넷):
  //   ① fixed 껍데기(모달 <dialog>) ② 배경 스크롤 잠금 ③ 내부 단일 스크롤러 ④ sticky 툴바
  // 넷이 같이 있으면 WebKit #191204 승격이 **구조적으로 허용**되고, ②가 있으면 되돌릴 문서조차 없다.
  // `a95cefd`가 메모를 문서 스크롤러로 옮길 때 프로젝트는 그 결정에서 빠졌다.
  //
  // 실기기 판독(2026-09-08)이 값으로는 못 푼다는 것을 증명했다: `push=130 vvTop=130 dlgTop=130`.
  // dialog엔 transform이 없는데 rect가 +130이다 — 시각 기준이면 −130, 레이아웃 기준이면 0이어야
  // 하는데 **둘 다 아니다.** 같은 순간 부모(dialog)가 130인데 자식(shell)이 1이다. 즉 승격 뒤에는
  // 우리 좌표가 한 프레임으로 표현되지 않아서 `여백=43`이 계속 "정상"으로 찍혔다.
  // 9529절이 이미 적어뒀다: "한 번 승격되면 배경 잠금 때문에 되돌릴 수도 상쇄할 수도 없었다."
  //
  // ★ **모바일 편집에서는 다이얼로그를 아예 열지 않는다.** 그래서
  //   ① 모달 fixed 껍데기가 없고 ② `useDialogRegistry`의 배경 잠금은 `activeDialogKey`가
  //   "projectDetail"이 될 일이 없어 **자동으로 안 걸린다**(훅을 한 줄도 안 고친다).
  //   ③④는 아래 CSS(`.proj-edit-page`)가 걷는다.
  // 💀 `close(); show()`로 **모달만 푸는 방식은 쓰지 않는다.** 572~587절이 먼슬리 Create에서
  //    이미 시도하고 폐기한 처방이다 — show()의 focusing steps가 툴바 버튼을 잡고,
  //    `.glass-dialog`의 backdrop-filter가 fixed 자손의 컨테이닝 블록을 만들어 ⋮ 시트를 화면 밖으로
  //    보내고, `.dialog-head`가 sticky top:-18로 잘렸다. 껍데기를 안 쓰면 셋 다 자리가 없어진다.
  // ★ 마커 클래스 `.memo-edit-page`를 **재사용한다**(먼슬리 `fa2b555`와 같은 처방). 그러면
  //   `useViewportHeight`의 scrollTo 가드와 `MemoRichEditor`의 scrollIntoView 가드가 공짜로 붙는다.
  //   평행한 두 번째 메커니즘을 만들지 않는다.
  // ⚠️ 편집 폼(`<ProjectDetailEdit>`)은 **한 벌만 마운트한다** — 아래 JSX가 다이얼로그와 페이지 중
  //   한쪽에만 넣는다. 두 벌이 되면 `projectEditorRef`를 공유해 "마지막 사본이 이긴다"(지뢰표).
  const [projectPageOpen, setProjectPageOpen] = useState(false);
  const projectEditPage = isMobileView && projectPageOpen;
  // 전체화면 편집 페이지(메모 수정 / 먼슬리 Create / 메모로 저장) 중 하나라도 문서를 차지하고 있나.
  // 배경 스크롤 잠금 cleanup이 **이전 렌더의 클로저**라 값을 직접 못 읽어서 ref로 넘긴다(1806절).
  // 값은 mobileEditActive가 정해지는 렌더 하단에서 매 렌더 갱신한다.
  // TODAY 카드 진입 2단계용 — 다이얼로그 잠금이 걸린 다음 커밋에 이 메모로 편집 페이지를 연다.
  const fullPageEditorRef = useRef(false);
  // 다이얼로그 레지스트리 — activeDialogKey / open / close / onDialogBackdropClick /
  // <dialog> close 이벤트 캡처 / 배경 스크롤 잠금 effect를 `useDialogRegistry`로 **그대로** 옮겼다(PHASE 0 ①).
  // 🔴 그 파일 맨 위 주석을 먼저 읽어라 — goingFullPage 분기와 비동기 close 가드가 거기 있다.
  // ref 12개와 위 `dialogs` 리터럴은 여기 남겼다(JSX가 ref={newsRef}로 직접 쓰는 자리가 40군데다).
  const { activeDialogKey, setActiveDialogKey, open, close, onDialogBackdropClick } = useDialogRegistry({
    dialogs,
    monthlyComposePage,
    bigEditorPage,
    fullPageEditorRef,
    // open()이 key를 확정한 **뒤** 도는 원문 꼬리 그대로. Dashboard 지역 state를 지우는 부분이다.
    onOpen: (key) => {
      if (key !== "bodyEditor") {
        setPostitViewMemo(null);
        setBigEditorOpen(false);
      }
      if (key === "news") setNewsHistoryDate(null);
      if (key === "jobs") { setJobTab("recommended"); setExpandedJobUrl(null); }
      // 🔴 AI Trend도 새로 열면 오늘로 되돌린다 — News와 **같은 계약**인데 이 한 줄이 없었다
      //    (2026-09-09 실기기 신고, `3f999da` 회귀 아님: onOpen은 그 커밋에서 글자 그대로였고
      //    `setTrendHistoryDate(null)`이 여기 들어간 적이 한 번도 없다).
      //    ⚠️ News와 state를 합치지 마라 — 둘은 각자 자기 날짜를 기억하는 것이 계약이다.
      if (key === "trendBrief") setTrendHistoryDate(null);
      // 🔴 Briefing 3개는 새로 열 때 **항상 맨 위**에서 시작한다.
      //    `<dialog>`는 닫혀도 자식이 마운트돼 있어 scrollTop이 저절로 안 돌아간다
      //    (CLAUDE.md 지뢰표 "`<dialog>` 안에서 화면이 바뀌면 스크롤러를 손으로 0으로 돌려라").
      //    세 화면의 스크롤러는 전부 `.dialog-inner` 하나다(실측 375×684).
      //    ⚠️ **여기 키를 늘리지 마라** — 편집창·메모처럼 위치가 유지돼야 하는 화면이 있고,
      //    모든 다이얼로그를 top reset하는 것은 이 앱의 계약이 아니다.
      if (key === "news" || key === "jobs" || key === "trendBrief") {
        const scroller = dialogs[key].current?.querySelector<HTMLElement>(".dialog-inner");
        if (scroller) scroller.scrollTop = 0;   // behavior:"smooth"는 쓰지 마라(지뢰표)
      }
    },
    // 8장 — 팝업 바깥(backdrop) 클릭의 특수 경로. true를 돌려주면 기본 닫기를 하지 않는다.
    onBackdropIntercept: (el) => {
      // Key Notes의 고정 메모 전체보기 중에는 바깥 클릭도 모달을 통째로 닫지 않고 한 단계만 되돌아간다.
      if (el === keynotesRef.current && keynoteFullView) { setKeynoteFullView(null); return true; }
      // bodyEditor는 draft를 formBody/projContent로 되돌리고 이전 activeDialogKey(뉴스·채용·AI트렌드
      // 등)를 복원해야 하므로, 바깥 클릭도 그 로직을 갖춘 closeBodyEditor를 그대로 태운다.
      if (el === bodyEditorRef.current) { closeBodyEditor(); return true; }
      // Monthly MEMO는 여기서 close()만 하면 작성 중이던 내용이 그대로 사라졌다 — +Create는
      // editingMemoId가 없어서 자동저장 대상이 아니라, 바깥을 터치하는 순간 draft가 통째로 유실됐다.
      // 뒤로가기 버튼과 같은 경로(날짜 검증 + draft 저장)를 태워서 같은 결과가 되게 한다.
      if (el === memoRef.current && memoFormOpen) { void handleMemoDialogBack(); return true; }
      return false;
    },
  });
  // My Page / 계정 — state 15 · ref 2 · 함수 6이 `useMyPageSession`으로 갔다(본문 그대로).
  // 🔴 `open`을 받아야 해서 호출이 useDialogRegistry **아래**다. 옮길 당시 이 클러스터를
  //   훅 밖(비-JSX)에서 참조하는 곳이 0개라 위치를 내려도 안전했다 — 위로 올리지 마라.
  // `openMyPage`만 따로 꺼낸다 — 헤더·JobsDialog가 부르는 bridge라 MyPageDialog로 흘려보내지 않는다.
  const { openMyPage, ...myPageProps } = useMyPageSession({ nickname, jobRolePriority, hasPasswordLogin, dialogs, open, close });
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
  // 🔴🔴 프로젝트 편집 페이지가 뜨는 동안 **호스트 다이얼로그를 닫는다.**
  //
  // 모바일에서 프로젝트로 들어오는 경로는 프로젝트 목록 다이얼로그(`.projects-list-dialog`)다.
  // 그건 모달이라 top layer에 있고, 열려 있는 한 우리 페이지를 그대로 덮는다 — 게다가 배경 잠금
  // (body{position:fixed})까지 걸려 있어 문서가 굴러가지 않는다(= 구조 전환이 무의미해진다).
  // ★ "메모로 저장"(bigEditorPage)이 쓰는 것과 **정확히 같은 처방**이다. 새 메커니즘이 아니다.
  //   어디서 왔는지 기억했다가 나갈 때 되돌려 놓는다 — 안 그러면 목록 보다가 나왔을 때 대시보드로 튄다.
  const projectHostKeyRef = useRef<keyof typeof dialogs | null>(null);
  useEffect(() => {
    if (!projectEditPage) return;
    const host = activeDialogKey;
    if (host) { projectHostKeyRef.current = host; close(dialogs[host]); }
    window.scrollTo(0, 0);
    return () => {
      const back = projectHostKeyRef.current;
      projectHostKeyRef.current = null;
      if (back) open(dialogs[back]);
    };
    // activeDialogKey를 의존성에 넣으면 호스트를 닫는 순간(null이 됨) cleanup이 돌아 즉시
    // 되돌아간다. 진입 시점의 값만 필요하므로 projectEditPage 하나만 본다(bigEditorPage와 동일).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectEditPage]);
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

  // MindSet — state 2 · ref 2 · 함수 3이 `useMindsetBar`로 갔다(본문 그대로).
  // 🔴 입력칸 JSX(데스크톱/모바일 두 벌)는 Dashboard에 그대로 있고, `guardLogin()` 게이트도
  //   거기 남는다 — 훅은 그 JSX가 쓰는 값 4개만 돌려준다.
  const { mindset, mindsetSaved, fitMindsetToBox, saveMindsetNow } = useMindsetBar({ initialMindset });

  // 🔴🔴 Memo 소유권 2단계 — 목록·달력 데이터를 `useMemoListData`가 갖는다.
  //   월간 달력 state / 필터·검색 / 기간 조회 / 중요 메모 미러 / 선택모드 / 달력 useMemo 6개가
  //   전부 그 안이다. 여기서 부르는 이유는 인자가 전부 props(=이 지점에서 이미 준비됨)이기 때문이고,
  //   **`useMemoEditSession`보다 먼저** 있어야 한다 — 그쪽이 이쪽의 setter를 인자로 받는다.
  //   반환은 구조분해라 호출부 이름이 그대로다(rename 0).
  const {
    viewYear, setViewYear,
    viewMonth0, setViewMonth0,
    setViewMemos,
    setMemosForMonthState,
    viewLoading,
    memoDialogDay, setMemoDialogDay,
    memoDialogDateIso,
    dateRangeMode, setDateRangeMode,
    customRangeStart, setCustomRangeStart,
    customRangeEnd, setCustomRangeEnd,
    typeFilter, setTypeFilter,
    memoSearch, setMemoSearch,
    isSearchingOrFiltering,
    filteredMemos,
    memoSelectionMode, selectedMemoIds,
    toggleMemoSelected, handleMemoTrashClick,
    setImportantMemosState,
    pinnedMemos, priorityMemos,
    weekPreview, todayMemoItems, nextMemo, bigCalCells,
    incompleteTodoCount, dueTodayCount,
    goToMonth, goToToday, showMonthAt, refreshAfterMemoChange,
    dayOrderKey, commitDayOrder, dayOrderPending,
  } = useMemoListData({ today, todayIso, memosForMonth, importantMemos, askConfirm });

  // (`contentFormatFor`는 `buildMemoInput`이 대신 계산해서 Dashboard에서 쓸 일이 없어졌다 —
  //  훅 안 autosave 경로는 계속 쓴다.)
  // 🔴 Monthly MEMO 폼 state 16개 · 본문 ref · contentFormatFor/readFormBody/setFormBody 계열은
  //   `useMemoEditSession`으로 옮겼다(아래 askConfirm 뒤에서 호출한다). 여기서 호출할 수 없는
  //   이유는 그 훅이 `setPostitViewMemo`/`postitEditMode`/`closePostitView` 등 아래에서 선언되는
  //   값을 인자로 받기 때문이다 — 선언 위치만 내려갔고 값·순서는 그대로다.
  const [bodyEditorSessionKey, setBodyEditorSessionKey] = useState(0);
  const [mobileMemoMenuOpen, setMobileMemoMenuOpen] = useState(false);
  const [mobileProjectMenuOpen, setMobileProjectMenuOpen] = useState(false);
  // (목록 필터·검색·기간 조회·filteredMemos는 `useMemoListData`로 옮겼다.)
  // (`mobileProjectSummaryOpen`과 그 바깥클릭 effect는 `useProjectWorkspace`로 옮겼다 —
  //  읽기·쓰기가 전부 Project라 훅이 owner다. 이 훅은 예전에 setter만 주입받고 있었다.)

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
  // 🔴 시트 마크업은 memo-edit-form.tsx로 옮겼다(⑥). 가드와 **세 호출부는 그대로**다 —
  //   편집 페이지에만 마운트가 빠져 ⋮가 죽었던 사고가 있던 자리라 호출부를 줄이지 마라.
  function renderMobileMemoOptionsSheet() {
    return mobileMemoMenuOpen && (
      <MobileMemoOptionsSheet
        setMobileMemoMenuOpen={setMobileMemoMenuOpen}
        formStartDate={formStartDate} setFormStartDate={setFormStartDate}
        formEndDate={formEndDate} setFormEndDate={setFormEndDate}
        formType={formType} formStatus={formStatus} setFormStatus={setFormStatus}
        memoDateError={memoDateError} editingMemoId={editingMemoId}
        handleDeleteMemo={handleDeleteMemo} todayIso={todayIso}
      />
    );
  }
  function scrollToMemoForm() {
    requestAnimationFrame(() => memoFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
  // 🔴🔴🔴 2026-09-02 (20+라운드) — **여기가 진입 스크롤의 원인이었다. 값이 아니라 소유권이다.**
  //
  // 확정된 재현 조건은 두 조건의 **교집합**이다(synthetic A/B 3건으로 갈랐다):
  //     ① 편집 페이지 문서가 뷰포트를 넘는다(maxScroll > 0)  ② **이 경로**로 진입한다
  // 실기기 판독 — 셋 다 대시보드 스크롤(~1434)을 물려받고 착지값이 maxScroll에 비례한다:
  //     __TESTB_meta (maxScroll  0)  +17ms y=1434
  //     __TESTA_content(maxScroll 64) +30ms y=30
  //     __TESTD_bq_added(maxScroll 95)+54ms y=42
  // 👉 content 구조·blockquote·memo_source 메타데이터는 **전부 무관**이다. "개발자 동향만"으로
  //    보였던 것은 실사용에서 ①을 만드는 메모가 그것뿐이기 때문이다.
  //
  // 구조 대조 — 정상 경로에는 배경 스크롤의 **소유자**가 있다:
  //     먼슬리·Key Notes: 다이얼로그가 이미 열려 있어 1902절 잠금 effect가 body를 소유하고,
  //                       전환 시 그 effect의 cleanup이 goingFullPage 절차를 실행한다
  //                       (top=0 → 강제 리플로우 → 복원 → scrollTo(0,0)). **기기에서 검증된 절차다.**
  //     TODAY(이 함수):   모바일에서 open()을 아예 안 불러 activeDialogKey가 null이고,
  //                       그래서 그 effect가 조기 return한다 = **소유자가 없다.**
  //                       openDetailEditInPlace의 entryLockRef가 손으로 흉내냈지만 해제 effect가
  //                       **같은 커밋에서** 풀어 수명이 ~0ms였다(그래서 아무 일도 안 했다).
  //
  // ✅ 처방: 새 기전을 만들지 않고 **정상 경로와 같은 상태 기계를 태운다.** 두 단계로 나눈다 —
  //    ① 이 함수는 다이얼로그만 열고 메모를 pending에 넣는다(잠금 effect가 이 커밋에서 body를 잠근다)
  //    ② 아래 effect가 **다음 커밋**에 openPostitView를 부른다. 그때 body는 이미 fixed이므로
  //       openDetailEditInPlace가 "이미 잠겨 있다" 분기를 타고, 다이얼로그를 닫으면서
  //       1902절 cleanup의 goingFullPage가 돈다 = 먼슬리와 **완전히 같은 경로**.
  // ⚠️ 옛 주석(아래 보존)이 "모바일에서는 껍데기를 열지 않는다"고 한 이유는 open()의
  //    `scrollTo(0, scrollY)`가 대시보드 y를 복원해 clamp된다는 것이었다. 그건 **잠금이 없을 때의
  //    이야기다** — 잠금이 걸리면 top:-y로 붙잡고 cleanup이 0으로 되돌린다(먼슬리가 그렇게 산다).
  // ⚠️ 데스크톱 동작은 한 줄도 안 바뀐다(예전에도 open()을 불렀다).
  // 💀 2026-09-03 — `06d6715`의 2단계(pendingTodayMemo)를 걷었다. 그 처방은 이 경로에
  // **배경 스크롤의 소유자**를 만들어 주려던 것이고, 26절이 대시보드 스크롤을 요소로 옮기면서
  // 소유할 문서 스크롤 자체가 없어졌다(실기기 확인 완료). 한 단계로 되돌린다.
  function openPostitFromDashboard(m: Memo) {
    open(dialogs.postitOnly);
    openPostitView(m);
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
      const input = buildMemoInput({
        title: formTitle, body, contentMode: formContentMode, emoji: formEmoji,
        memoType: formType, status: formStatus,
        startDate: formStartDate, endDate: formEndDate,
        color: formColor, isImportant: formImportant,
      });
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
  // (loadMemoIntoForm은 `useMemoEditSession`으로 옮겼다.)
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
      // 💀 2026-09-03 삭제 — 선제 `window.scrollTo(0, 0)`과 `entryLockRef` 진입 잠금.
      // 둘 다 "대시보드가 문서를 굴려둔 상태로 들어온다"를 전제한 보정이었다. 26절이 대시보드
      // 스크롤을 **요소로** 옮겨 그 전제 자체가 사라졌다(문서 maxScroll이 항상 0 = 물려받을 값이 없다).
      // 실기기 확인 완료 후 제거(인계 26-5). 되살리지 마라 — 되살릴 이유가 생겼다면 그건
      // 대시보드가 다시 문서를 굴리고 있다는 뜻이고, 그때 고칠 것은 이 보정이 아니라 그쪽이다.
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
  // (refreshAfterMemoChange는 `useMemoListData`로 옮겼다.)
  // 🔴🔴 Memo 소유권 1단계 — 폼 state + 자동저장 + 저장/삭제를 `useMemoEditSession`이 갖는다.
  //   여기서 부르는 이유는 인자 11개가 전부 이 지점까지 준비되기 때문이다(위 state 선언들 +
  //   아래 함수 선언들은 hoisting으로 이미 초기화돼 있다). **더 위로 올리지 마라** —
  //   `setPostitViewMemo`/`postitEditMode`는 useState라 TDZ에 걸린다.
  //   반환은 구조분해라 호출부 180곳의 이름이 그대로다(rename 0).
  //
  // 🔴 `pendingInsert`는 원래 아래 INSERT 구역(선택 삽입)에서 선언됐는데, `loadMemoIntoForm`이
  //   `setPendingInsert(null)`을 부르므로 훅보다 먼저 있어야 한다(useState는 hoisting이 없다).
  //   **선언 위치만** 올렸다 — 초기값·타입·읽는 자리는 전부 그대로다.
  //   `SelSource`는 `type` 선언이라 아래에 있어도 컴파일에는 문제가 없다.
  const [pendingInsert, setPendingInsert] = useState<{ text: string; html?: string; source: SelSource } | null>(null);
  const {
    editingMemoId, setEditingMemoId,
    formTitle, setFormTitle,
    formType, setFormType,
    formStatus, setFormStatus,
    formStartDate, setFormStartDate,
    formEndDate, setFormEndDate,
    formImportant, setFormImportant,
    formPinned, setFormPinned,
    formColor, setFormColor,
    formBody, setFormBody, setFormBodyWhileTyping,
    formContentMode,
    formEmoji,
    formSessionKey, setFormSessionKey,
    savingMemo,
    memoDateError,
    autosaveStatus,
    autosaveTimerRef,
    readFormBody,
    openCreateMemoForm, loadMemoIntoForm, patchLocalMemo, scheduleAutosave,
    validateMemoDates, handleSaveMemo, handleDeleteMemo,
  } = useMemoEditSession({
    memoDialogDateIso,
    postitEditMode,
    refreshAfterMemoChange,
    setViewMemos,
    setMemosForMonthState,
    setPostitViewMemo,
    setMemoFormOpen,
    setPostitEditMode,
    setPendingInsert,
    closeBigEditor,
    closePostitView,
    askConfirm,
    theme, scrollToMemoForm,
  });

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
    const input = buildMemoInput({
      title: formTitle, body, contentMode: formContentMode, emoji: formEmoji,
      memoType: formType, status: formStatus,
      startDate: formStartDate, endDate: formEndDate,
      color: formColor, isImportant: formImportant,
    });
    if (id) patchLocalMemo(id, input as Partial<Memo>);
    setMemoFormOpen(false);
    const result = id ? await updateMemo(id, input) : await createMemo(input);
    if (result && "error" in result) { alert(result.error); return; }
    if (!id && "id" in result && typeof result.id === "string") setEditingMemoId(result.id);
    await refreshAfterMemoChange();
  }
  // (handleDeleteMemo는 `useMemoEditSession`으로 옮겼다.)

  // (선택모드 state와 날짜 변경 시 초기화 effect는 `useMemoListData`로 옮겼다.
  //  선택삭제 2함수도 ⑪에서 그훅으로 옮겼다 — `askConfirm`만 주입한다.)

  // (Key Notes의 importantMemosState 미러와 pinned/priority 파생은 `useMemoListData`로 옮겼다.)
  // 전체보기는 고정/중요 **두 그룹이 같은 장치를 공유한다** — 어느 그룹을 펼쳤는지만 담는다.
  // (예전엔 고정 전용 boolean이었다. 두 개의 boolean으로 늘리면 둘 다 true인 상태가 생긴다.)
  const [keynoteFullView, setKeynoteFullView] = useState<"pinned" | "priority" | null>(null);
  // 다이얼로그를 열 때마다 이 값을 올려 KeynoteCardList를 새로 마운트한다 = 드래그 순서를 서버
  // 순서로 되돌리는 스냅샷. 예전엔 부모가 snapshot()을 직접 불렀는데, 그러려면 드래그 순서 state가
  // 부모에 있어야 했다 — 그게 곧 "카드 한 칸 옮길 때마다 Dashboard 전체 재렌더"의 원인이었다.
  const [keynotesOpenSeq, setKeynotesOpenSeq] = useState(0);
  function openKeyNotes() {
    setKeynotesOpenSeq((n) => n + 1);
    setKeynoteFullView(null);
    open(dialogs.keynotes);
  }

  // base: 중요 목록에 **없던** 메모를 다시 넣을 때 쓸 원본. 중요 해제(OFF)는 목록에서 아예 빼므로,
  // 바로 다시 켜면(ON) `existing`이 undefined라 예전엔 **다시 들어오지 못했다** — Key Notes 안에서
  // OFF→ON 하면 메모가 서버 payload가 올 때까지 목록에서 사라져 있었다(실측 ~6초).
  function patchMemoInLists(id: string, patch: Partial<Memo>, base?: Memo) {
    setViewMemos((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setImportantMemosState((prev) => {
      if (!prev) return prev;
      const existing = prev.find((m) => m.id === id) ?? base;
      const withoutIt = prev.filter((m) => m.id !== id);
      const updated = existing ? { ...existing, ...patch } : null;
      // 배열 위치는 의미가 없다 — priorityMemos가 orderPriorityMemos로 다시 세운다.
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
    // 서버 toggleImportant와 **같은 값**이어야 한다 — pin_order를 빼면 화면만 옛 순서를 들고 있다.
    // 🔴 서버 toggleImportant와 **같은 값**이어야 한다. ON 쪽에 pin_order를 넣지 마라 —
    //   서버는 켤 때 pin_order를 건드리지 않으므로, 여기서만 null로 만들면 옛 stale row
    //   (is_important=false인데 pin_order가 남은 1건)에서 화면이 서버와 어긋나 한 번 튄다.
    //   옛 순서 부활은 **해제 쪽 사본을 정규화**해서 막는다(아래 postitViewMemo 미러).
    const patch: Partial<Memo> = m.is_important
      ? { is_important: false, is_pinned: false, pinned_at: null, pin_order: null }
      : { is_important: true };
    patchMemoInLists(m.id, patch, m);
    await toggleImportant(m.id);
  }
  // 🔴 선언 순서 주의: `cycleMemoStar`가 이걸 부르므로 **그보다 위에** 있어야 한다.
  //   아래로 내리면 hoisted forward reference가 되고, 그러면 React Compiler가
  //   `[PruneHoistedContexts] Rewrite hoisted function references` Todo로 **Dashboard 전체 분석을
  //   포기한다** — 그 순간 이 파일의 react-hooks 검사가 통째로 조용해진다(2026-09-11 실측).
  async function handleTogglePin(id: string, isPinned: boolean) {
    // 🔴 고정 해제도 서버(setMemoPinned false)와 같은 값이어야 한다 — 서버는 `pinned_at`·`pin_order`
    //   까지 null로 내리는데 예전 사본은 `is_pinned`만 내려서, 해제된 메모가 **옛 Pin 순서를 그대로
    //   들고** 일반 중요 그룹으로 떨어졌다(중요 OFF→ON과 같은 부류의 구멍이다).
    const patch: Partial<Memo> = isPinned
      ? { is_pinned: false, pinned_at: null, pin_order: null }
      : { is_pinned: true, is_important: true };
    patchMemoInLists(id, patch);
    await setMemoPinned(id, !isPinned);
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

  // 프로젝트 아이디어 — state 14 · ref 4 · 함수 15 · effect 1 · useMemo 1이
  // `useProjectWorkspace`로 갔다(본문 그대로 · rename 0).
  //
  // 🔴 **bodyEditor는 Dashboard가 소유한다.** 메모↔프로젝트 양방향 다리라 훅에 넣으면 순환이 된다.
  //   훅 → bodyEditor : 아래 세 접근자를 주입한다.
  //   bodyEditor → 훅 : readProjContent·setProjContent·setProjEditorKey를 훅이 반환하고,
  //                     openBodyEditor/closeBodyEditor가 그것을 쓴다.
  //   ⚠️ `readBodyEditorDraft`·`setBodyEditorDraft`는 아래 bodyEditor 절의 **function 선언**이라
  //     호이스팅되어 여기서 참조해도 안전하다(실제 호출은 전부 이벤트 핸들러 뒤라 TDZ가 아니다).
  //
  // 🔴 autosave 4종(projAutosaveTimerRef·editingProjectIdRef·scheduleProjectAutosave·
  //   discardPendingProjectAutosave)은 훅 안에 한 묶음으로 있고 앞의 셋은 반환하지 않는다.
  //   밖에서 만지면 신규 작성 중 중복 insert가 되살아난다.
  const {
    projMode, setProjMode, editingProjectId,
    projTitle, setProjTitle, projStatus, setProjStatus, projSummary, setProjSummary,
    projContent, setProjContentWhileTyping, projUpdatedAt, projSummaryError, savingProject,
    projEditorKey, setProjEditorKey, projTemplatePrompt, setProjTemplatePrompt,
    mobileProjectSummaryOpen, setMobileProjectSummaryOpen,
    projectSearch, setProjectSearch, projectStatusFilter, setProjectStatusFilter,
    projAutosaveStatus, filteredProjects,
    projectIdeaCount, projectDevCount, projectDraftCount, projectIdeaOnlyCount,
    openNewProject, closeProjectDetail, openExistingProject,
    applyProjectTemplate, appendProjectTemplate, toggleProjectTask,
    handleSaveProject, handleDeleteProject, handleProjectDetailBack, scheduleProjectAutosave,
    readProjContent, setProjContent,
  } = useProjectWorkspace({
    projectIdeas, dialogs, open, close,
    setProjectPageOpen, setMobileProjectMenuOpen,
    resetProjectDetailScroll, askConfirm,
    readBodyEditorDraft, setBodyEditorDraft, setBodyEditorSessionKey,
  });

  // 작성창/확장 창 둘 다 같은 확인 팝업을 쓴다 — 지금 열려있는 다이얼로그 쪽에서만 렌더링한다.
  // 🔴 **가드는 여기 남는다**(사용처가 `=== "form"` / `=== "bodyEditor"`로 고른다) — 이 값은
  //   예전처럼 **항상 요소**다. 여기서 조건을 걸면 두 사용처의 truthy/삼항 검사가 갈린다.
  const projTemplatePromptNode = (
    <ProjectTemplatePrompt onCancel={() => setProjTemplatePrompt(false)} onAppend={appendProjectTemplate} />
  );
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
  }, [bodyEditorSessionKey]);

  // (24절 자동저장 — autosaveStatus/autosaveTimerRef/patchLocalMemo/scheduleAutosave는
  //  `useMemoEditSession`으로 **한 묶음으로** 옮겼다. 축소 가드의 기준(memoBodyBaselineRef)이
  //  그 안에 있으므로 하나만 도로 꺼내지 마라.)
  // 포스트잇 수정(Quick/Detail Edit) 전용 — 우측 상단 눈에 잘 띄는 위치에 크게 배치한다.
  // .big-postit는 position:relative라 absolute 자식이 정확히 그 박스 기준으로 붙는다.
  const autosaveStatusCorner =
    autosaveStatus === "saving" ? <span className="autosave-status autosave-status-corner">저장 중...</span>
    : autosaveStatus === "saved" ? <span className="autosave-status autosave-status-corner saved">저장됨 ✓</span>
    : null;
  // 자동저장 표시는 어디서나 같은 디자인(우측 상단 pill)을 쓴다 — corner 하나로 통일했다.
  const autosaveStatusNode = autosaveStatusCorner;

  // AI Smart Direction — Today's Focus
  // state 5 · effect 1 · 함수 2가 `useTodaysFocus`로 갔다(본문 그대로).
  // 🔴 아래 `openFocusMemo`는 **여기 남는다** — Focus state를 하나도 안 쓰고 Memo state와
  //   `openPostitFromDashboard`만 부르는 **Focus → Memo 다리**라 Dashboard 몫이다.
  //   훅에 콜백으로 주입하지도 마라(그 순간 훅이 Memo 흐름을 알게 된다).
  const {
    focusMeta, focusDisplay, focusGenerating, focusError,
    focusHistoryOpen, setFocusHistoryOpen, runFocus, viewFocusVersion,
  } = useTodaysFocus({ focusView });
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

  // AI Smart Direction — Idea Build
  // state 16 · effect 1 · 함수 5 · 파생값 3이 `useIdeaBuild`로 갔다(본문 그대로).
  // 🔴 훅 호출을 이 자리에서 옮기지 마라 — 옮긴 useState 16개와 effect 1개가 전부 이 구간에
  //   있었으므로, 여기서 부르면 훅 호출 순서가 추출 전과 **완전히 같다**.
  // 🔴🔴 2026-09-11 — Idea Build 전용 JSX 3덩어리(`ideaModeSelector`·`ideaPickerBlock`·
  //   `ideaSourcePickerNode`, 71줄)를 **`idea-dialog.tsx`로 옮겼다.** 그래서 그 셋 전용으로
  //   따로 꺼내던 값 11개의 rest 분해가 사라지고, 훅 반환이 통째로 `<IdeaDialog>`로 간다.
  //   Dashboard는 이제 Idea Build의 **구현 세부(버튼 구조·조건부 마크업)를 소유하지 않는다.**
  //   ⚠️ 되돌려서 JSX를 여기로 다시 끌어오지 마라 — 그러면 rest 분해도 같이 돌아온다.
  const ideaDialogProps = useIdeaBuild({ ideaView, isAdmin, projectIdeas, setConfirmDialog });

  // 선택→메모 저장 — state 3 · ref 1 · 함수 12 · effect 1이 `useSelectionToMemo`로 갔다(본문 그대로).
  //
  // 🔴 옛 Audit의 "ref injection 필요"는 **오분류였다.** 에디터 ref 4개를 고르는 것은
  //   아래 `activeMemoEditorRef`+`insertPendingAtCursor`(pendingInsert 클러스터)이고,
  //   이 클러스터는 `setPendingInsert` 하나만 부른다. 실측: 비-JSX 외부 참조 0 ·
  //   dialog registry 접촉 0 · 에디터 ref 접촉 0 · 의존성 5.
  // 🔴 **두 클러스터를 다시 합치지 마라** — 그 경계가 이 훅이 성립하는 유일한 이유다.
  const {
    selectionMenu, setSelectionMenu,
    memoPicker, setMemoPicker,
    pendingSave, setPendingSave,
    selectableHandlers, copySelectionText, openMemoPickerForDate,
    openFullNewsPicker, openFullJobPicker, openFullTrendPicker,
    changeMemoPickerDate, confirmPendingSave,
  } = useSelectionToMemo({ todayIso, theme, openBigEditor, setPendingInsert, refreshAfterMemoChange });
  // 기존 메모에 붙일 때는 자동 삽입하지 않고, 편집창을 열어 이 내용을 보여준 뒤 사용자가 원하는 위치에 직접 넣게 한다 (6~10절)
  // html은 전체저장(뉴스/채용공고/AI Trend)에서만 채운다 — 리치 에디터엔 이걸 넣어야 <h3> 헤딩이
  // 살아서 "새 메모 생성"과 같은 제목 크기로 들어간다(평문만 넣으면 헤딩이 본문 크기로 죽었다).
  // text는 미리보기 배너·memo_source 기록·plain textarea 경로용 평문이라 그대로 둔다.
  // 🔴 `pendingInsert` useState 선언은 위 `useMemoEditSession` 호출 **앞**으로 올라갔다 —
  //   `loadMemoIntoForm`이 새 세션마다 `setPendingInsert(null)`을 부르는데, 여기 두면 훅 인자로
  //   넘길 때 TDZ에 걸린다. 값·타입·호출부는 그대로고 선언 위치만 옮겼다.
  const bigEditorHandleRef = useRef<MemoRichEditorHandle>(null);
  // "확장"(bodyEditor)으로 넘어가면 bigEditorNode 쪽 JSX가 activeDialogKey 조건에서 빠져 언마운트되고
  // bigEditorHandleRef도 함께 사라진다 — bodyEditor 자신의 에디터 인스턴스를 가리키는 별도 ref가 필요하다.
  const bodyEditorHandleRef = useRef<MemoRichEditorHandle>(null);
  // Quick Editor(bigEditorNode)에 두었던 caret을 확장(bodyEditor)의 새 에디터 인스턴스에 그대로 복구하기 위한 값
  const pendingCursorPosRef = useRef<{ from: number; to: number } | null>(null);

  // 편집창 상단 액션 줄(실행취소 / 다시실행 / 중요·고정 / 더보기).
  // 🔴 예전엔 이 블록이 포스트잇 상세 편집에만 있었다 — 그래서 뉴스·채용공고·AI Trend에서
  // "메모로 복사"로 열리는 bigEditorNode는 상단이 통째로 비어 실행취소조차 못 했다.
  // 두 곳이 같은 폼 state(formImportant/formPinned/editingMemoId)를 공유하고 에디터 handle만
  // 다르므로, 40줄을 복제하지 않고 handle만 인자로 받는다.
  function memoHeadActions(editorRef: React.RefObject<MemoRichEditorHandle | null>) {
    return (
      <MemoHeadActions
        editorRef={editorRef} editingMemoId={editingMemoId}
        formImportant={formImportant} setFormImportant={setFormImportant}
        formPinned={formPinned} setFormPinned={setFormPinned}
        handleTogglePin={handleTogglePin} setMobileMemoMenuOpen={setMobileMemoMenuOpen}
      />
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


  // (weekPreview / todayMemoItems / nextMemo는 `useMemoListData`로 옮겼다.)
  function ddayLabel(endDate: string): string {
    const diff = Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000);
    return diff >= 0 ? `D-${diff}` : `D+${-diff}`;
  }
  // (카드용 카운트 6개는 memo 2개=`useMemoListData` / project 4개=`useProjectWorkspace`로 옮겼다.)
  // 주간달력에서 날짜를 눌러 Monthly MEMO를 여는 경로.
  // 🔴 **월 데이터 로드는 `useMemoListData.showMonthAt`이 갖는다**(2026-09-12) — 년/월/일 설정 ·
  //   캐시 선반영 · race token fetch가 전부 거기 있다(그 훅이 `getMemosForMonthAction`과
  //   관련 state를 이미 소유해서 새 의존이 0이었다). 여기 남는 것은 **화면 전환 절반**뿐이다.
  //   되돌려서 fetch를 이 파일로 다시 가져오지 마라.
  function openMemoModalAt(y: number, m0: number, day: number) {
    showMonthAt(y, m0, day);
    setMemoFormOpen(false);
    open(dialogs.memo);
  }

  // (Monthly MEMO 상세 달력의 memosByDay / bigCalCells는 `useMemoListData`로 옮겼다.)

  // 포스트잇 확대 보기 — 원문만 보여주고, "수정" 버튼을 눌러야 편집 팝업으로 넘어간다.
  // "전체 보기"를 누르면 같은 postitViewMemo를 그대로 더 큰 레이아웃(expanded)으로만 다시 그린다 — 별도 state 없음.
  // Quick Edit — 포스트잇 "수정"의 작고 가벼운 편집 폼. 제목/타입/날짜/색상/짧은 본문만, 상세 툴바 없음(6절)
  const quickEditFormNode = postitEditMode === "quick" && (
    <QuickEditForm
      formTitle={formTitle} setFormTitle={setFormTitle} formType={formType} setFormType={setFormType}
      formStartDate={formStartDate} setFormStartDate={setFormStartDate}
      formEndDate={formEndDate} setFormEndDate={setFormEndDate}
      formBody={formBody} setFormBody={setFormBody}
      formColor={formColor} setFormColor={setFormColor}
      formImportant={formImportant} setFormImportant={setFormImportant}
      memoDateError={memoDateError} editingMemoId={editingMemoId}
      savingMemo={savingMemo} todayIso={todayIso}
      scheduleAutosave={scheduleAutosave} handleSaveMemo={handleSaveMemo}
      handleDeleteMemo={handleDeleteMemo} closePostitView={closePostitView}
    />
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
  // 🔴 폼 몸통은 components/dashboard/memo-edit-form.tsx로 옮겼다(재-Audit ①).
  //   이 래퍼를 없애지 마라 — 세 호출부가 이 시그니처(ref·onCancel·opts)를 그대로 쓰고 있고,
  //   그래서 추출 전후 호출부가 한 글자도 안 바뀌었다. ref는 여기(Dashboard) 소유 그대로다.
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
    return (
      <MemoEditForm
        editorRef={editorRef} onCancel={onCancel} opts={opts}
        formTitle={formTitle} setFormTitle={setFormTitle} formType={formType} setFormType={setFormType}
        formStatus={formStatus} setFormStatus={setFormStatus}
        formStartDate={formStartDate} setFormStartDate={setFormStartDate}
        formEndDate={formEndDate} setFormEndDate={setFormEndDate}
        formBody={formBody} setFormBodyWhileTyping={setFormBodyWhileTyping}
        formColor={formColor} setFormColor={setFormColor} formSessionKey={formSessionKey}
        memoDateError={memoDateError} savingMemo={savingMemo} todayIso={todayIso}
        scheduleAutosave={scheduleAutosave}
        handleSaveMemo={handleSaveMemo} openBodyEditor={openBodyEditor}
        postitScrollRef={postitScrollRef} onPostitScroll={onPostitScroll}
      />
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
  // 🔴 projectEditPage도 여기 합류한다 — 프로젝트 목록 다이얼로그(모달, 배경 잠금)에서 페이지로
  //    넘어가므로 그 잠금 cleanup이 "대시보드 스크롤을 복원할지"를 이 값으로 정한다. 빠뜨리면
  //    `scrollTo(0, 대시보드 y)`가 방금 뜬 편집 페이지를 엉뚱한 데로 굴린다(지뢰 #3).
  fullPageEditorRef.current = mobileEditActive || monthlyComposePage || bigEditorPage || projectEditPage;
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
    // 🔴 projectEditPage도 여기서 반환해야 한다 — 이 화면의 theme-color는 아래 배경복사
    // effect가 **페이지 배경에서 파생시키므로**, 둘이 같이 쓰면 마지리에 도는 족이 이긴다.
    if (mobileEditActive || monthlyComposePage || bigEditorPage || projectEditPage) return;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0d19" : "#d9cbff");
  }, [theme, mobileEditActive, monthlyComposePage, bigEditorPage, projectEditPage]);
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
    if (!mobileEditActive && !monthlyComposePage && !bigEditorPage && !projectEditPage) return;
    // 메모지 자체를 가리킨다 — 메모 편집·메모로 저장은 포스트잇 div, Create는 다이얼로그 안쪽 박스다.
    // 🔴 프로젝트 편집 페이지도 같은 주체다 — 그 페이지는 메모지가 아니라 유리 다이얼로그
    // 가 쓰던 gradient를 불통명으로 깔았고(dashboard.css `.proj-edit-page`), 여기서 그 값을 그대로
    // body/html/--memo-canvas/theme-color로 파생시킨다. 새 새깔을 정하지 않는다 — 한 값에서 나와야
    // 이은매가 생기지 않는다(11-18/11-23이 말하는 그 경계선).
    const paper = document.querySelector<HTMLElement>(".memo-edit-page.big-postit, .proj-edit-page");
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
  }, [mobileEditActive, monthlyComposePage, bigEditorPage, projectEditPage, formColor, theme]);
  const mobileEditPageNode = mobileEditActive && postitViewMemo && (
    <MemoEditPageShell
      formColor={formColor} theme={theme}
      onClose={() => void handlePostitBack()}
    >
      {memoHeadActions(detailEditorRef)}
      {autosaveStatusCorner}
      {detailEditFormNode}
    </MemoEditPageShell>
  );
  // 🔴 먼슬리 Create = **일반메모 편집과 같은 노드**다. className도 자식 구성도 위와 동일하고,
  // 다른 것은 (1) 본문 에디터 ref (2) 취소 동작 (3) 뒤로가기 핸들러뿐이다.
  // 이 셋만 다르면 "같은 화면"이 되고, 지금까지 Create만 겪던 증상들은 발생할 자리가 없어진다.
  // ⚠️ 폼 마크업을 여기 복사하지 마라 — memoEditForm 한 벌만 쓴다(두 벌이 되면 한쪽만 고쳐진다).
  const composePageNode = monthlyComposePage && (
    <MemoEditPageShell
      formColor={formColor} theme={theme}
      onClose={() => void handleMemoDialogBack()}
    >
      {memoHeadActions(compactEditorRef)}
      {autosaveStatusCorner}
      {memoEditForm(compactEditorRef, () => setMemoFormOpen(false))}
    </MemoEditPageShell>
  );
  // 🔴 오버레이·메모지 껍데기와 **보기 상태 마크업**은 components/dashboard/postit-view.tsx로 옮겼다(재-Audit ④).
  //   여기 남는 것은 조립뿐이다 — 마운트 게이트(postitHostDialogKey) · 세 host 조건 · ref 소유
  //   (detailEditorRef·postitScrollRef) · 폼 한 벌(quick/detailEditFormNode) · 상태 정규화가 전부 Dashboard 것이다.
  // 🔴🔴 편집 알맹이는 **children으로** 넘긴다. `memoHeadActions(detailEditorRef)`처럼 ref를 품은 노드를
  //   일반 prop 위치로 옮기면 `react-hooks/refs`가 새로 뜬다(⑦에서 NEW 2건 → children으로 되돌려 0).
  const postitViewNode = postitViewMemo && (
    <PostitView
      memo={postitViewMemo}
      theme={theme}
      editMode={postitEditMode}
      formColor={formColor}
      expanded={postitExpanded}
      onOverlayClick={postitEditMode === "detail" ? () => setPostitEditMode(null) : closePostitView}
      onCloseClick={() => {
        const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
        if (mobile) void handlePostitBack();
        else if (postitEditMode === "detail") setPostitEditMode(null);
        else closePostitView();
      }}
      onToggleImportant={(e) => {
        const wasImportant = postitViewMemo.is_important;
        handleToggleImportant(postitViewMemo, e);
        // 🔴 해제할 때 `pin_order`·`pinned_at`까지 같이 비운다 — 서버와 같은 정규화다.
        //   이 사본이 옛 pin_order를 들고 있으면, 바로 다시 ★를 켤 때 그 값이 그대로
        //   `handleToggleImportant(postitViewMemo)`의 base로 들어가 **옛 수동 위치가
        //   부활한다**(2026-09-10 실기기 신고: Key Notes 창 안에서만 재현).
        setPostitViewMemo((v) => (v
          ? (wasImportant
              ? { ...v, is_important: false, is_pinned: false, pinned_at: null, pin_order: null }
              : { ...v, is_important: true })
          : v));
      }}
      onTogglePin={() => {
        const { id, is_pinned } = postitViewMemo;
        handleTogglePin(id, is_pinned);
        // 위 handleTogglePin과 같은 정규화 — 해제 시 옛 Pin 순서를 사본에 남기지 않는다.
        setPostitViewMemo((v) => (v
          ? (v.is_pinned
              ? { ...v, is_pinned: false, pinned_at: null, pin_order: null }
              : { ...v, is_pinned: true, is_important: true })
          : v));
      }}
      postitScrollRef={postitScrollRef}
      onPostitScroll={onPostitScroll}
      scrollBtnRef={postitScrollBtnRef}
      onScrollTop={scrollPostitToTop}
      onExpand={expandPostitView}
      onEdit={() => openPostitEdit(postitViewMemo)}
      onDelete={() => handleDeleteMemo(postitViewMemo.id)}
      optionsSheetNode={postitEditMode ? renderMobileMemoOptionsSheet() : null}
    >
      <>
        {postitEditMode && memoHeadActions(detailEditorRef)}
        {(postitEditMode === "quick" || postitEditMode === "detail") && autosaveStatusCorner}
        {postitEditMode === "quick" ? quickEditFormNode : postitEditMode === "detail" ? detailEditFormNode : null}
      </>
    </PostitView>
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
          <BigEditorInsertBar pendingInsert={pendingInsert} insertPendingAtCursor={insertPendingAtCursor} />
        ) : null,
        // 이 화면은 "취소"가 없고(✕가 그 역할) 대신 삭제가 있다.
        actions: (
          <BigEditorActions savingMemo={savingMemo} handleSaveMemo={handleSaveMemo}
            editingMemoId={editingMemoId} handleDeleteMemo={handleDeleteMemo} />
        ),
      })}
    </>
  );
  // 데스크톱(그리고 예외 경로)의 옛 껍데기 — 화면을 덮는 fixed 오버레이.
  const bigEditorNode = bigEditorOpen && !bigEditorPage && (
    <BigEditorOverlay theme={theme} formColor={formColor} pendingInsert={pendingInsert} onClose={closeBigEditor}>
      {bigEditorInner}
    </BigEditorOverlay>
  );
  // 🔴🔴 모바일 "메모로 저장" = 일반 페이지. 메모 수정·먼슬리 Create와 **같은 구조**다.
  //
  // 여기는 먼슬리 Create보다 훨씬 싸다 — 이 노드는 원래부터 `.postit.big-postit`이라
  // `.memo-edit-page` 마커만 붙이면 그 화면의 CSS·가드가 **그대로** 적용된다(먼슬리는 규칙
  // 64개가 `dialog` 타입 셀렉터에 묶여 있어서 엘리먼트를 유지해야 했다).
  // 바깥의 `.postit-overlay`(fixed 껍데기)를 걷어내는 것이 이 변경의 전부다.
  const bigEditorPageNode = bigEditorPage && (
    <BigEditorPageShell theme={theme} formColor={formColor} pendingInsert={pendingInsert}>
      {bigEditorInner}
    </BigEditorPageShell>
  );

  const confirmDialogNode = confirmDialog && (
    <ConfirmDialog confirmDialog={confirmDialog} setConfirmDialog={setConfirmDialog} />
  );

  // RadialSelectionMenu는 document mousedown으로 "바깥 클릭 시 닫기"를 감지한다 — News·Job 다이얼로그에
  // 둘 다 무조건 삽입하면 숨겨진 쪽 인스턴스도 같은 리스너를 달게 되고, 그게 매번 "바깥 클릭"으로 오인해
  // 토글 클릭의 mousedown 시점에 공유 state를 먼저 지워버려 버튼이 눌러도 반응 없는 것처럼 보인다.
  // 그래서 이 부분만 selectionMenu.source.type이 맞는 다이얼로그에서만 렌더링한다.
  // 🔴 프로젝트 상세/편집 본문 **한 벌**. 모바일은 일반 페이지(.proj-edit-page), 데스크톱은 모달
  //    <dialog> 안에 들어간다. 둘 중 **한 곳에만** 마운트한다(폼 두 벌 = ref 공유 사고).
  // 🔴 Project 상세/편집 껍데기는 project-detail-dialog.tsx의 `ProjectDetailShell`로 옮겼다(재-Audit ②).
  //   ref 3개는 여기 소유 그대로고 아래로 내려주기만 한다. **한 번에 한 곳에만** 마운트하는
  //   계약(모바일=페이지 / 그 외=<dialog>)도 아래 호출부에 그대로 남아 있다.
  const projDetailBody = (
    <ProjectDetailShell
      projMode={projMode} editingProjectId={editingProjectId} projTitle={projTitle}
      setProjTitle={setProjTitle} projSummary={projSummary} setProjSummary={setProjSummary}
      projSummaryError={projSummaryError} projStatus={projStatus} setProjStatus={setProjStatus}
      projContent={projContent} setProjContentWhileTyping={setProjContentWhileTyping} projUpdatedAt={projUpdatedAt}
      projEditorKey={projEditorKey} setProjEditorKey={setProjEditorKey} setProjMode={setProjMode}
      savingProject={savingProject} today={today} projectEditorRef={projectEditorRef}
      projectDetailScrollRef={projectDetailScrollRef} projectDetailScrollBtnRef={projectDetailScrollBtnRef} onProjectDetailScroll={onProjectDetailScroll}
      scrollProjectDetailToTop={scrollProjectDetailToTop} resetProjectDetailScroll={resetProjectDetailScroll} mobileProjectMenuOpen={mobileProjectMenuOpen}
      setMobileProjectMenuOpen={setMobileProjectMenuOpen} mobileProjectSummaryOpen={mobileProjectSummaryOpen} setMobileProjectSummaryOpen={setMobileProjectSummaryOpen}
      toggleProjectTask={toggleProjectTask} handleSaveProject={handleSaveProject} handleDeleteProject={handleDeleteProject}
      handleProjectDetailBack={handleProjectDetailBack} closeProjectDetail={closeProjectDetail} scheduleProjectAutosave={scheduleProjectAutosave}
      applyProjectTemplate={applyProjectTemplate} openBodyEditor={openBodyEditor} projTemplatePrompt={projTemplatePrompt}
      projTemplatePromptNode={projTemplatePromptNode} projAutosaveStatusNode={projAutosaveStatusNode} confirmDialogNode={confirmDialogNode}
    />
  );
  // PHASE 2 — 오버레이 JSX 80줄은 components/dashboard/selection-overlays.tsx로 그대로 옮겼다.
  //   변수는 그대로 둬서 아래 3개 다이얼로그의 node prop 호출부가 한 글자도 안 바뀐다.
  const radialMenuOverlay = selectionMenu && (
    <RadialMenuOverlay
      selectionMenu={selectionMenu}
      copySelectionText={copySelectionText}
      openMemoPickerForDate={openMemoPickerForDate}
      setSelectionMenu={setSelectionMenu}
      todayIso={todayIso}
    />
  );
  // News·Job 다이얼로그 안에서만 써야 top layer 위에 뜬다(1절) — 두 다이얼로그에 그대로 중복 삽입한다
  // News·Job 다이얼로그 안에서만 써야 top layer 위에 뜬다(1절) — 두 다이얼로그에 그대로 중복 삽입한다
  const selectionOverlays = (
    <SelectionOverlays
      memoPicker={memoPicker}
      pendingSave={pendingSave}
      setMemoPicker={setMemoPicker}
      setPendingSave={setPendingSave}
      changeMemoPickerDate={changeMemoPickerDate}
      confirmPendingSave={confirmPendingSave}
      todayIso={todayIso}
      confirmDialogNode={confirmDialogNode}
    />
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
      // 🔴 projectEditPage도 이 마커를 쓴다 — `.sp-body.memo-edit-page-open`이 대시보드(`.page`/`.blob`)를
      //    접고 `min-height: 0`으로 문서 바닥의 108px 슬랙을 걷는다(9599절). data-memo-theme는 **안 붙인다** —
      //    그건 메모지 8색 팔레트용이고 프로젝트 편집은 메모지가 아니다.
      className={`sp-body${mobileEditActive || monthlyComposePage || bigEditorPage || projectEditPage ? " memo-edit-page-open" : ""}`}
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
          {/* PHASE 1 — 헤더 JSX 73줄은 components/dashboard/dashboard-header.tsx로 **그대로** 옮겼다.
              state·ref·effect 이동 0. 값·콜백만 prop으로 내려준다(DOM·className 변경 0). */}
          <DashboardHeader
            router={router}
            weather={weather}
            region={region}
            airQuality={airQuality}
            warnings={warnings}
            isLoggedIn={isLoggedIn}
            openMyPage={openMyPage}
            nickname={nickname}
            theme={theme}
            toggleTheme={toggleTheme}
            supportDialogRef={supportDialogRef}
          />

          <SupportDialog ref={supportDialogRef} isLoggedIn={isLoggedIn} />

          {/* PHASE 1 — 카드 7개 JSX 361줄은 components/dashboard/dashboard-cards.tsx로 **그대로** 옮겼다.
              🔴 소유권은 하나도 안 옮겼다 — state·autosave·dialog orchestration·mobile 분기는
              전부 여기와 기존 훅에 그대로 있고, 카드는 렌더링만 한다.
              🔴 `dialogs`/`open`을 통째로 넘기는 것은 원문 호출식(`open(dialogs.news)`)을
              글자 그대로 유지하기 위해서다 — 카드가 레지스트리를 소유하는 것이 아니다. */}
          <div className="dashboard-grid">
            <MindsetCard
              mindset={mindset}
              mindsetSaved={mindsetSaved}
              guardLogin={guardLogin}
              fitMindsetToBox={fitMindsetToBox}
              saveMindsetNow={saveMindsetNow}
            />
            <NewsCard
              guardLogin={guardLogin} open={open} dialogs={dialogs}
              isLoggedIn={isLoggedIn} briefing={briefing} newsItems={newsItems}
            />
            <JobsCard
              guardLogin={guardLogin} open={open} dialogs={dialogs}
              isLoggedIn={isLoggedIn} hasLegacyRoles={hasLegacyRoles} jobs={jobs}
            />
            <TrendCard guardLogin={guardLogin} open={open} dialogs={dialogs} />
            <MonthlyMemoCard
              guardLogin={guardLogin} open={open} dialogs={dialogs}
              goToToday={goToToday} setMemoFormOpen={setMemoFormOpen}
              today={today} weekPreview={weekPreview}
              openMemoModalAt={openMemoModalAt} todayMemoItems={todayMemoItems}
              dueTodayCount={dueTodayCount} incompleteTodoCount={incompleteTodoCount}
              openPostitFromDashboard={openPostitFromDashboard} ddayLabel={ddayLabel}
              nextMemo={nextMemo} openCreateMemoForm={openCreateMemoForm}
            />
            <ProjectsCard
              guardLogin={guardLogin} open={open} dialogs={dialogs}
              isLoggedIn={isLoggedIn} openNewProject={openNewProject}
              projectIdeaCount={projectIdeaCount} projectIdeaOnlyCount={projectIdeaOnlyCount}
              projectDraftCount={projectDraftCount} projectDevCount={projectDevCount}
            />
            <KeyNotesCard
              theme={theme} isLoggedIn={isLoggedIn} pinnedMemos={pinnedMemos}
              guardLogin={guardLogin} openKeyNotes={openKeyNotes}
            />
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
      {/* PHASE 2 ⑪ — News 다이얼로그는 components/dashboard/news-dialog.tsx로 옮겼다.
          🔴 마운트 게이트 식(`selectionMenu?.source.type === "news"` · `activeDialogKey === "news"`)과
             `close(dialogs.news)` 호출식은 **여기 남긴다** — ⑤·⑧·⑩과 같은 규약이다. */}
      <NewsDialog
        dialogRef={newsRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.news)}
        isLoggedIn={isLoggedIn}
        briefing={briefing}
        newsHistory={newsHistory}
        newsHistoryDate={newsHistoryDate}
        setNewsHistoryDate={setNewsHistoryDate}
        historyDateLabel={historyDateLabel}
        newsDelayed={newsDelayed}
        newsFailed={newsFailed}
        isAdmin={isAdmin}
        briefingRetrying={briefingRetrying}
        onRetryBriefing={handleRetryBriefing}
        activeNewsItems={activeNewsItems}
        selectableHandlers={selectableHandlers}
        onOpenFullNewsPicker={openFullNewsPicker}
        radialMenuNode={selectionMenu?.source.type === "news" ? radialMenuOverlay : null}
        bigEditorNode={activeDialogKey === "news" ? bigEditorNode : null}
        selectionOverlays={selectionOverlays}
      />

      {/* AI Trend Briefing — 뉴스 + GitHub Changelog + Hugging Face를 종합한 분석.
          메인 카드는 카테고리 제목만, 실제 내용은 여기서만 보여준다. 근거가 없는 섹션은 서버에서 null로 온다 */}
      {/* PHASE 2 ⑬ — AI Trend 다이얼로그는 components/dashboard/trend-dialog.tsx로 옮겼다(249줄).
          🔴 마운트 게이트 식(`selectionMenu?.source.type === "ai_smart_direction"` ·
             `activeDialogKey === "trendBrief"`)과 `close(dialogs.trendBrief)` 호출식은
             **여기 남긴다** — ⑤·⑧·⑩·⑪과 같은 규약이다.
          🔴 `trendBriefing`·`toolUpdates`·`skillSignals`·`hasSkillSection`도 여기서 계산한 값을
             그대로 내린다(그 넷은 `trendHistoryDate` 하나에서 파생되는 사슬이다 — 위 214줄 주석). */}
      <TrendDialog
        dialogRef={trendBriefRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.trendBrief)}
        isLoggedIn={isLoggedIn}
        briefing={briefing}
        newsHistory={newsHistory}
        trendHistoryDate={trendHistoryDate}
        setTrendHistoryDate={setTrendHistoryDate}
        historyDateLabel={historyDateLabel}
        newsDelayed={newsDelayed}
        isAdmin={isAdmin}
        briefingRetrying={briefingRetrying}
        onRetryBriefing={handleRetryBriefing}
        trendBriefing={trendBriefing}
        toolUpdates={toolUpdates}
        skillSignals={skillSignals}
        hasSkillSection={hasSkillSection}
        selectableHandlers={selectableHandlers}
        openFullTrendPicker={openFullTrendPicker}
        radialMenuNode={selectionMenu?.source.type === "ai_smart_direction" ? radialMenuOverlay : null}
        bigEditorNode={activeDialogKey === "trendBrief" ? bigEditorNode : null}
        selectionOverlays={selectionOverlays}
      />

      {/* Job Description — Editorial Glass: "이 공고 분석하기" 기능은 삭제된 상태이므로 관련 CTA를 추가하지 않는다 */}
      {/* PHASE 2 ⑨-b — Jobs 다이얼로그는 components/dashboard/jobs-dialog.tsx로 옮겼다(81줄).
          🔴 마운트 게이트 식(`selectionMenu?.source.type === "job"` · `activeDialogKey === "jobs"`)과
             `close(dialogs.jobs)` 호출식은 **여기 남긴다** — ⑤·⑧·⑩·⑪·⑬과 같은 규약이다.
          🔴 `onResetRoles`는 `close`와 `openMyPage` **두 호출이 한 식**이라 통째로 넘긴다(순서 보존).
          🔴 `renderJobCard`도 여기 소유다 — 그 안에 `expandedJobUrl`이 닫혀 있고, 두 사용처가
             `map(renderJobCard)` 형태를 유지해야 ⑨-a에서 증명한 diff 0이 그대로 살아 있다. */}
      <JobsDialog
        dialogRef={jobsRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.jobs)}
        onResetRoles={() => { close(dialogs.jobs); openMyPage(); }}
        isLoggedIn={isLoggedIn}
        hasLegacyRoles={hasLegacyRoles}
        jobs={jobs}
        jobTab={jobTab}
        selectJobTab={selectJobTab}
        jobsRecent={jobsRecent}
        jobsFailed={jobsFailed}
        jobsDelayed={jobsDelayed}
        jobsRetrying={jobsRetrying}
        isAdmin={isAdmin}
        onRetryJobs={handleRetryJobs}
        renderJobCard={renderJobCard}
        radialMenuNode={selectionMenu?.source.type === "job" ? radialMenuOverlay : null}
        bigEditorNode={activeDialogKey === "jobs" ? bigEditorNode : null}
        selectionOverlays={selectionOverlays}
      />

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
        {/* PHASE 3 — 다이얼로그 본문 203줄은 components/dashboard/monthly-memo-dialog.tsx로
            **그대로** 옮겼다. 조립만 이동했고 Memo 소유권(useMemoEditSession · useMemoListData)은
            그대로다. 🔴 아래 형제 노드 넷(postitViewNode · bigEditorNode · 모바일 옵션 시트 ·
            confirmDialogNode)은 KEEP 영역이라 여기 남는다 — 마운트 위치가 곧 동작 계약이다. */}
        <MonthlyMemoDialogBody
          editingMemoId={editingMemoId}
          formTitle={formTitle} setFormTitle={setFormTitle}
          formType={formType} setFormType={setFormType}
          formStatus={formStatus} setFormStatus={setFormStatus}
          formStartDate={formStartDate} setFormStartDate={setFormStartDate}
          formEndDate={formEndDate} setFormEndDate={setFormEndDate}
          formImportant={formImportant} setFormImportant={setFormImportant}
          formColor={formColor} setFormColor={setFormColor}
          formBody={formBody} setFormBodyWhileTyping={setFormBodyWhileTyping}
          formSessionKey={formSessionKey} savingMemo={savingMemo} memoDateError={memoDateError}
          scheduleAutosave={scheduleAutosave} handleSaveMemo={handleSaveMemo} handleDeleteMemo={handleDeleteMemo}
          viewYear={viewYear} viewMonth0={viewMonth0} viewLoading={viewLoading}
          memoDialogDay={memoDialogDay} setMemoDialogDay={setMemoDialogDay}
          memoDialogDateIso={memoDialogDateIso}
          dateRangeMode={dateRangeMode} setDateRangeMode={setDateRangeMode}
          customRangeStart={customRangeStart} setCustomRangeStart={setCustomRangeStart}
          customRangeEnd={customRangeEnd} setCustomRangeEnd={setCustomRangeEnd}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          memoSearch={memoSearch} setMemoSearch={setMemoSearch}
          dayOrderKey={dayOrderKey} commitDayOrder={commitDayOrder} dayOrderPending={dayOrderPending}
          isSearchingOrFiltering={isSearchingOrFiltering} filteredMemos={filteredMemos}
          memoSelectionMode={memoSelectionMode} selectedMemoIds={selectedMemoIds}
          bigCalCells={bigCalCells} goToMonth={goToMonth} goToToday={goToToday}
          memosForMonth={memosForMonth} today={today} todayIso={todayIso}
          memoFormOpen={memoFormOpen} setMemoFormOpen={setMemoFormOpen}
          memoFormRef={memoFormRef} compactEditorRef={compactEditorRef}
          autosaveStatusNode={autosaveStatusNode}
          openBodyEditor={openBodyEditor} openCreateMemoForm={openCreateMemoForm}
          openPostitView={openPostitView}
          handleMemoDialogBack={handleMemoDialogBack} handleMemoTrashClick={handleMemoTrashClick}
          toggleMemoSelected={toggleMemoSelected} cycleMemoStar={cycleMemoStar}
          setMobileMemoMenuOpen={setMobileMemoMenuOpen}
        />
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
      <KeynotesDialog
        dialogRef={keynotesRef}
        theme={theme}
        onDialogBackdropClick={onDialogBackdropClick}
        onCancel={(e) => { if (keynoteFullView) { e.preventDefault(); setKeynoteFullView(null); } }}
        onCloseClick={() => (keynoteFullView ? setKeynoteFullView(null) : close(dialogs.keynotes))}
        keynoteFullView={keynoteFullView}
        setKeynoteFullView={setKeynoteFullView}
        pinnedMemos={pinnedMemos}
        priorityMemos={priorityMemos}
        keynotesOpenSeq={keynotesOpenSeq}
        onTap={openPostitView}
        postitViewNode={postitHostDialogKey === "keynotes" ? postitViewNode : null}
        bigEditorNode={activeDialogKey === "keynotes" ? bigEditorNode : null}
        confirmDialogNode={confirmDialogNode}
      />

      {/* 본문 크게 보기 */}
      <BodyEditorDialog
        dialogRef={bodyEditorRef}
        onDialogBackdropClick={onDialogBackdropClick}
        bodyEditorTarget={bodyEditorTarget}
        formColor={formColor}
        setFormColor={setFormColor}
        applyProjectTemplate={applyProjectTemplate}
        autosaveStatusNode={autosaveStatusNode}
        projAutosaveStatusNode={projAutosaveStatusNode}
        onClose={closeBodyEditor}
        scrollRef={bodyEditorScrollRef}
        onScroll={onBodyEditorScroll}
        scrollBtnRef={bodyEditorScrollBtnRef}
        onScrollToTop={scrollBodyEditorToTop}
        pendingInsert={pendingInsert}
        insertPendingAtCursor={insertPendingAtCursor}
        bodyEditorSessionKey={bodyEditorSessionKey}
        bodyEditorHandleRef={bodyEditorHandleRef}
        bodyEditorDraft={bodyEditorDraft}
        setBodyEditorDraftWhileTyping={setBodyEditorDraftWhileTyping}
        scheduleAutosave={scheduleAutosave}
        scheduleProjectAutosave={scheduleProjectAutosave}
        projTemplatePromptNode={projTemplatePrompt === "bodyEditor" ? projTemplatePromptNode : null}
      />

      {/* Projects 목록 */}
      {/* PHASE 1 ⑤ — 본문 61줄은 components/dashboard/projects-list-dialog.tsx로 **그대로** 옮겼다.
          state·handler 소유권은 이제 `useProjectWorkspace`에 있다(자식으로 내린 것은 여전히 0개). 특히
          filteredProjects는 그 훅의 useMemo가 계산한 결과를 그대로 넘긴다 — 계산을 자식으로
          내리면 memo가 쪼개져 필터 결과가 달라질 수 있다. ✕의 close 호출식만 여기 남겼다. */}
      <ProjectsListDialog
        dialogRef={projectsRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.projects)}
        projectIdeaCount={projectIdeaCount}
        projectIdeas={projectIdeas}
        projectSearch={projectSearch}
        setProjectSearch={setProjectSearch}
        projectStatusFilter={projectStatusFilter}
        setProjectStatusFilter={setProjectStatusFilter}
        openNewProject={openNewProject}
        filteredProjects={filteredProjects}
        openExistingProject={openExistingProject}
        todayYear={today.year}
      />

      {/* 🔴🔴 프로젝트 편집 = 일반 페이지(문서가 유일한 스크롤러). 위 projectEditPage 주석이 근거다.
          `.memo-edit-page` 마커를 재사용해 useViewportHeight의 scrollTo 가드와
          MemoRichEditor의 scrollIntoView 가드를 그대로 물려받는다(새 기전 금지). */}
      {projectEditPage && (
        <div className="proj-edit-page memo-edit-page" data-theme={theme}>
          {projDetailBody}
        </div>
      )}
      {/* Project 상세 — CREATE/EDIT는 Monthly Memo 본문 에디터 재사용, VIEW는 읽기 좋은 document 렌더 */}
      <dialog className="glass-dialog full tonedown" ref={projectDetailRef} onClick={onDialogBackdropClick}>
        {/* 🔴 프로젝트 편집 페이지가 떠 있으면 여기 마운트하지 않는다 — 폼을 두 벌 마운트하면
            projectEditorRef를 공유해 "마지막 사본이 이긴다"(지뢰표). 정확히 한 곳에만 있어야 한다. */}
        {!projectEditPage && projDetailBody}
      </dialog>

      {/* My Page — 기존 glass dialog 구조 그대로. 이메일은 read-only, 나머지는 최소 기능만. */}
      {/* PHASE 1 ④ — 본문 98줄은 components/dashboard/my-page-dialog.tsx로 **그대로** 옮겼다.
          `<dialog>` 엘리먼트와 className은 그대로고, ✕의 close(dialogs.myPage) 호출식만 여기 남겼다.
          state·핸들러는 `useMyPageSession`이 소유한다 — **prop 이름과 값은 하나도 안 바뀌었고**
          `{...myPageProps}`가 그 25개를 원래 이름 그대로 편다(훅 반환 키 = 여기 prop 이름).
          아래 6개는 My Page 소유가 아니라 Dashboard/props 소유라 그대로 명시한다. */}
      <MyPageDialog
        {...myPageProps}
        dialogRef={myPageRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.myPage)}
        isAdmin={isAdmin}
        email={email}
        hasLegacyRoles={hasLegacyRoles}
        hasPasswordLogin={hasPasswordLogin}
      />

      {/* AI Smart Direction — Today's Focus */}
      {/* PHASE 1 ⑥ — 본문 88줄은 components/dashboard/focus-dialog.tsx로 **그대로** 옮겼다.
          state 6개·handler 3개·focusView 재동기화 effect·runFocus의 5초 타이머는 전부 여기 남아
          있다(자식으로 내린 것 0개). 조건 없이 항상 마운트되는 것도 그대로다.
          ✕의 close(dialogs.focus) 호출식만 여기 남겼다. */}
      <FocusDialog
        dialogRef={focusRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.focus)}
        focusGenerating={focusGenerating}
        focusDisplay={focusDisplay}
        focusError={focusError}
        focusMeta={focusMeta}
        focusHistoryOpen={focusHistoryOpen}
        setFocusHistoryOpen={setFocusHistoryOpen}
        runFocus={runFocus}
        openFocusMemo={openFocusMemo}
        viewFocusVersion={viewFocusVersion}
      />

      {/* AI Smart Direction — Idea Build */}
      {/* PHASE 1 ⑦ — 본문 271줄은 components/dashboard/idea-dialog.tsx로 **그대로** 옮겼다.
          ✕의 close(dialogs.idea) 호출식도 여기 남긴다. `&&` 가드 없이 항상 마운트되던 것 그대로다.
          state·handler·effect·파생계산은 이제 `useIdeaBuild`가 소유한다 — **prop 이름과 값은
          하나도 안 바뀌었고** `{...ideaDialogProps}`가 훅 반환 키를 원래 이름 그대로 편다.
          🔴 2026-09-11(후보 ③) — Idea 전용 JSX 3덩어리가 그 파일로 가면서 spread가 **20 → 31개**가
          됐다(옛 rest 분해 11개가 그리로 흘러간다). 그래서 여기 명시하는 것은 dialog 배선·앱 전역
          props·cross-feature 노드 **8개뿐**이다. 이 8개를 훅으로 밀어 넣으려 하지 마라. */}
      <IdeaDialog
        {...ideaDialogProps}
        dialogRef={ideaRef}
        onDialogBackdropClick={onDialogBackdropClick}
        onCloseClick={() => close(dialogs.idea)}
        isAdmin={isAdmin}
        IDEA_MAX={IDEA_MAX}
        projectIdeas={projectIdeas}
        today={today}
        confirmDialogNode={confirmDialogNode}
      />

      {/* 포스트잇 단독 보기/편집 — 먼슬리 메모나 Today's Focus의 상세 모달을 통째로 열지 않고 포스트잇만 띄운다 */}
      <dialog className="glass-dialog postit-only" ref={postitOnlyRef} data-memo-theme={theme} onClick={onDialogBackdropClick}>
        {postitHostDialogKey === "postitOnly" && postitViewNode}
        {activeDialogKey === "postitOnly" && bigEditorNode}
        {confirmDialogNode}
      </dialog>

    </div>
  );
}
