"use client";

// Dashboard.tsx에서 **그대로 옮겨온** Job Description 피드 (Dashboard ownership Audit 3순위-B).
// 로직은 한 글자도 안 고쳤다 — `useNewsTrendFeed`와 같은 이동 전용 추출이다.
//
// 🔴 News/Trend와 **별개 훅인 이유**: `jobs`는 자기 payload·effect·서버 액션을 갖고
//   `briefing`을 **코드에서 한 번도 참조하지 않는다**(주석에만 나온다). 소유 단위는
//   서버 payload 하나다 — 한 훅에 묶으면 무관한 둘을 이름 하나로 덮는 것이 된다.
//
// 🔴 `renderJobCard`는 **Dashboard에 남아 있다**(JSX 함수라 `.ts` 훅에 못 들어간다).
//   그 함수가 `selectableHandlers`·`openFullJobPicker`로 잇는 **선택 → 메모 저장 경로**도
//   Dashboard가 그대로 bridge한다 — **이 훅이 Memo를 알 필요는 0이고, 그렇게 유지해라.**
//   훅은 카드가 쓰는 `expandedJobUrl`/`setExpandedJobUrl`만 돌려준다.
//
// 🔴 `setJobTab`·`setExpandedJobUrl`은 `useDialogRegistry.onOpen`(Jobs 다이얼로그를 열 때
//   탭을 recommended로 되돌리고 펼친 상세를 접는다)이 부르므로 반드시 반환한다.
//   **registry 로직 자체를 이 훅으로 가져오지 마라.**

import { useEffect, useState } from "react";
import type { JobsView, SavedJobRow } from "@/lib/jobs/get-jobs";
import type { JobRole } from "@/lib/jobs/roles";
import {
  retryJobs as retryJobsAction,
  getJobsView as getJobsViewAction,
  getJobsRecentView as getJobsRecentViewAction,
} from "@/lib/actions/jobs";
import { isPastManualRefreshWindow } from "@/lib/news/kst";

export function useJobsFeed(opts: {
  initialJobs: JobsView | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  jobRolePriority: JobRole[];
  todayIso: string;
}) {
  const { initialJobs, isLoggedIn, isAdmin, jobRolePriority, todayIso } = opts;

  const [jobs, setJobs] = useState(initialJobs);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setJobs(initialJobs), [initialJobs]);
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
  const [jobsRetrying, setJobsRetrying] = useState(false);
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
  // lastUpdated가 null인 건 정상 성공(4건) batch가 한 번도 없었다는 뜻이다 — 이때만 진짜 오류로 본다
  // (news의 newsFailed와 동일한 기준. 과거 성공 배치가 있으면 stale로 보여주지 오류로 취급하지 않는다).
  const jobsFailed = !!jobs && jobs.lastUpdated === null;
  // incomplete(오늘 배치인데 4건 미만)도 재시도 대상이다 — partial 결과를 화면에 띄우기
  // 시작하면서 그런 날은 stale=false가 됐다. stale만 보면 복구 버튼이 사라진다.
  const jobsDelayed = !jobs?.todayProcessing && (isAdmin || ((!!jobs?.stale || !!jobs?.incomplete) && isPastManualRefreshWindow()));
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

  return {
    jobs,
    jobsRetrying,
    handleRetryJobs,
    jobsFailed,
    jobsDelayed,
    jobTab, setJobTab,
    selectJobTab,
    expandedJobUrl, setExpandedJobUrl,
    jobsRecent,
  };
}
