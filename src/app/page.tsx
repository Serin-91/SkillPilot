import { redirect } from "next/navigation";
import Dashboard from "./Dashboard";
import { createClient } from "@/lib/supabase/server";
import { getBriefingHistory, type BriefingHistoryDay } from "@/lib/news/get-briefing";
import { todayKSTDateString } from "@/lib/news/kst";
import { getMemosForMonth, getImportantMemos } from "@/lib/memo/queries";
import type { Memo } from "@/lib/memo/types";
import { getProjectIdeas } from "@/lib/project/queries";
import type { ProjectIdea } from "@/lib/project/types";
import { getFocusView, getIdeaView, type FocusView, type IdeaView } from "@/lib/ai/state";
import { getProfile, type Profile } from "@/lib/profile/queries";
import { getSeoulWeather } from "@/lib/weather";
import { isAdminEmail } from "@/lib/auth/admin";

export default async function Home() {
  const supabase = await createClient();
  const weatherPromise = getSeoulWeather(); // 비회원에게도 허용되는 유일한 데이터
  const { data: { user: realUser } } = await supabase.auth.getUser();
  const userId = realUser?.id ?? null;

  const [todayYear, todayMonth, todayDay] = todayKSTDateString().split("-").map(Number);
  const today = { year: todayYear, month0: todayMonth - 1, day: todayDay };

  // 비회원은 아래 쿼리를 한 건도 실행하지 않는다 — Dashboard는 정적 Lock Preview만 렌더링한다.
  // News/Job Description은 여기서 아예 조회하지 않는다 — 항상 null로 내려주고 클라이언트가
  // getBriefingView/getJobsView로 마운트 후 따로 불러온다(대시보드 SSR을 막지 않기 위해).
  let profile: Profile | null = null;
  let memosForMonth: Memo[] | null = null;
  let importantMemos: Memo[] | null = null;
  let projectIdeas: ProjectIdea[] | null = null;
  let focusView: FocusView | null = null;
  let ideaView: IdeaView | null = null;
  let newsHistory: BriefingHistoryDay[] = [];

  if (userId) {
    profile = await getProfile(supabase, userId);
    // auth/callback이 최초 진입 시점에만 온보딩으로 보낸다 — 그 뒤로 profiles가 어떤 경로로든
    // 관심 직무가 빈 채로 남으면(가입 중 실패 등) 여기서도 다시 걸러 온보딩으로 보낸다.
    if (!profile || profile.interested_job_roles.length === 0) redirect("/onboarding");
    // News/Job Description은 여기서 기다리지 않는다 — fallback 생성(RSS/Gemini, Tavily 호출)이
    // 대시보드 전체 SSR을 막지 않도록 클라이언트 마운트 후 getBriefingView/getJobsView로 따로 불러온다.
    [memosForMonth, importantMemos, projectIdeas, focusView, ideaView, newsHistory] = await Promise.all([
      getMemosForMonth(supabase, userId, today.year, today.month0),
      getImportantMemos(supabase, userId),
      getProjectIdeas(supabase, userId),
      getFocusView(supabase, userId),
      getIdeaView(supabase, userId),
      getBriefingHistory(supabase, userId),
    ]);
  }

  const weather = await weatherPromise;

  return (
    <Dashboard
      weather={weather}
      briefing={null}
      jobs={null}
      newsHistory={newsHistory}
      today={today}
      memosForMonth={memosForMonth}
      importantMemos={importantMemos}
      projectIdeas={projectIdeas}
      focusView={focusView}
      ideaView={ideaView}
      isLoggedIn={!!userId}
      isAdmin={isAdminEmail(realUser?.email)}
      nickname={profile?.nickname ?? null}
      email={realUser?.email ?? null}
      interestedRoles={profile?.interested_job_roles ?? []}
      jobRolePriority={profile?.job_role_priority ?? []}
      mindset={profile?.mindset ?? ""}
    />
  );
}
