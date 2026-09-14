"use client";

// Dashboard.tsx에서 **그대로 옮겨온** News + AI Trend 피드 (Dashboard ownership Audit 3순위-A).
// 로직은 한 글자도 안 고쳤다 — `useMyPageSession`·`useIdeaBuild`와 같은 이동 전용 추출이다.
//
// 🔴 News와 AI Trend를 **한 훅이 소유하는 이유**: 서버가 주는 `briefing` payload **하나**가
//   둘을 같이 먹인다(`selectedNews` → News, `trendBrief` → Trend, 거기서 `toolUpdates`·
//   `skillSignals`·`hasSkillSection`이 파생). 가르면 fetch가 두 벌이 되거나 한쪽이 다른 쪽
//   state를 받아야 한다 — **더 쪼개지 마라.**
//
// 🔴 Jobs는 여기 넣지 마라. `briefing`을 **코드에서 한 번도 참조하지 않는** 별개 payload다
//   (`useJobsFeed.ts`가 소유한다).
//
// 🔴 `setNewsHistoryDate`는 `useDialogRegistry.onOpen`(뉴스 다이얼로그를 열 때 오늘로 되돌린다)이
//   부르므로 반드시 반환한다. **registry 로직 자체를 이 훅으로 가져오지 마라.**

import { useEffect, useState } from "react";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
import { retryBriefing as retryBriefingAction, getBriefingView as getBriefingViewAction } from "@/lib/actions/briefing";
import { isPastManualRefreshWindow } from "@/lib/news/kst";
import { withCleanup } from "@/lib/with-cleanup";

export function useNewsTrendFeed(opts: {
  initialBriefing: BriefingView | null;
  newsHistory: BriefingHistoryDay[];
  isLoggedIn: boolean;
  isAdmin: boolean;
  todayIso: string;
}) {
  const { initialBriefing, newsHistory, isLoggedIn, isAdmin, todayIso } = opts;

  const [briefing, setBriefing] = useState(initialBriefing);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setBriefing(initialBriefing), [initialBriefing]);
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
  const [briefingRetrying, setBriefingRetrying] = useState(false);
  async function handleRetryBriefing() {
    if (briefingRetrying) return;
    setBriefingRetrying(true);
    await withCleanup(async () => {
      const res = await retryBriefingAction();
      if ("ok" in res) setBriefing(res.view);
      else alert(res.error);
    }, () => setBriefingRetrying(false));
  }
  // 메인 카드는 항상 오늘 것만 — 히스토리 선택은 상세 다이얼로그 안에서만 적용된다
  const newsItems = briefing?.selectedNews ?? [];
  // AI Trend 히스토리 — **News와 독립**이다(다이얼로그가 열려 있는 동안 각자 자기 날짜를
  // 기억한다. News에서 9.5를 봐도 AI Trend는 그대로다). 상태를 합치면 한쪽을 고칠 때
  // 다른 쪽이 같이 움직인다.
  // ⚠️ 단, **다시 열 때는 둘 다 오늘로 되돌아간다** — News와 같은 계약이고 그 리셋은
  //    `useDialogRegistry.onOpen`(Dashboard)이 한다. 여기서 초기화하지 마라.
  const [trendHistoryDate, setTrendHistoryDate] = useState<string | null>(null);
  // 🔴 이 한 줄이 AI Trend 상세의 **단일 기준**이다 — 아래 toolUpdates·skillSignals와 다이얼로그
  //   JSX(업계 영향·개발자 동향·도구·서비스·역량 시그널·실무 적용)가 전부 여기서 파생되므로,
  //   날짜를 바꾸면 모든 하위 섹션이 함께 바뀐다. **평행 분기를 만들지 마라.**
  const trendBriefing = trendHistoryDate
    ? (newsHistory.find((h) => h.date === trendHistoryDate)?.trendBrief ?? null)
    : (briefing?.trendBrief ?? null);
  // 🔴🔴 2026-09-05 — `도구·서비스`는 **과거 데이터 전용**이 됐다(신규 생성은 만들지 않는다).
  //   공식 제품·API·도구 업데이트는 News > Official이 전담한다는 제품 결정이고, Trend는 그 자리를
  //   `역량 시그널`로 대체했다. 이 계산을 지우지 마라 — 09-04까지의 행에는 tool_update(s)가 그대로
  //   들어 있고, 그 날짜를 조회하면 아래 블록이 여전히 그려져야 한다(히스토리 호환).
  // 도구·서비스는 2026-09-03부터 1~3건(tool_updates)이다. 과거 데이터는 단건(tool_update)만
  // 갖고 있으므로 그걸 배열 하나로 감싸 **렌더 경로를 하나로 유지**한다(평행 분기를 만들지 않는다).
  const toolUpdates = trendBriefing?.tool_updates?.length
    ? trendBriefing.tool_updates
    : trendBriefing?.tool_update
      ? [trendBriefing.tool_update]
      : [];
  // 역량 시그널 — 신규 생성만 이 키를 갖는다(과거 행은 undefined).
  // 🔴🔴 2026-09-05 v2 — **`[]`(신규·0건)와 `undefined`(과거 행·키 없음)를 구분한다.**
  //   AI Trend는 4체제가 **고정 정보구조**라, 신규 행이면 시그널이 0건이어도 섹션을 그리고
  //   빈 상태 문구를 보여준다(사용자 지시). 반대로 과거 행은 이 키가 아예 없고 그 자리를
  //   `도구·서비스` 블록이 차지하므로, 없는 섹션을 새로 만들어 붙이면 과거 화면이 달라진다.
  //   → `?? []`로 뭉개지 마라. 그 한 줄이 두 경우를 구분 불가능하게 만든다.
  const skillSignals = trendBriefing?.skill_signals ?? null;
  const hasSkillSection = skillSignals !== null;
  // generatedAt이 null인 건 get-briefing.ts의 최종 실패 fallback뿐이다 — 이때만 진짜 오류로 본다
  // (오늘 조건에 맞는 뉴스가 0건인 정상적인 경우는 generatedAt이 채워져 있다).
  const newsFailed = !!briefing && briefing.generatedAt === null;
  // "지금 업데이트" 버튼은 오늘 정상 4건이 없고(stale) KST 11:01도 지났고, 지금 processing 중이 아닐 때만 노출한다 —
  // 10:10~11:00 사이는 cron이 아직 안 돌았을 뿐인 정상 범위라 지연으로 취급하지 않는다.
  // 관리자 계정은 상한이 없으므로(actions/briefing.ts) 지연 상태가 아니어도 항상 버튼을 노출한다 —
  // 결과를 여러 번 돌려보는 게 이 계정의 용도다.
  const newsDelayed = isAdmin || (!!briefing?.stale && isPastManualRefreshWindow());
  // 뉴스 히스토리 — 오늘(null)이 기본, 어제/그저께 날짜를 고르면 그날 캐시로 바꿔 보여준다.
  const [newsHistoryDate, setNewsHistoryDate] = useState<string | null>(null);
  const activeNewsItems = newsHistoryDate ? (newsHistory.find((h) => h.date === newsHistoryDate)?.selectedNews ?? []) : newsItems;
  function historyDateLabel(date: string): string {
    const [, m, d] = date.split("-");
    return `${Number(m)}.${Number(d)}`;
  }

  return {
    briefing,
    briefingRetrying,
    handleRetryBriefing,
    newsItems,
    activeNewsItems,
    newsFailed,
    newsDelayed,
    newsHistoryDate, setNewsHistoryDate,
    historyDateLabel,
    trendHistoryDate, setTrendHistoryDate,
    trendBriefing,
    toolUpdates,
    skillSignals,
    hasSkillSection,
  };
}
