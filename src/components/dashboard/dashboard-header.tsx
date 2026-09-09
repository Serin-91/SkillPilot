"use client";

// Dashboard.tsx의 상단 헤더 JSX를 **그대로 옮겼다**(들여쓰기만 6칸 줄임 · 내용 변경 0).
// state·ref·effect는 하나도 옮기지 않았다 — Dashboard가 값과 콜백을 prop으로 내려준다.
// 🔴 `SupportDialog` 자체는 헤더 밖 형제라 Dashboard에 남았고, 여기서는 그 ref만 받아
//   도움말 버튼이 `supportDialogRef.current?.openHelp()`를 부른다(원문 그대로).

import { UserRound, LogOut, CircleHelp, Sun, Moon } from "lucide-react";
import WeatherMeta from "@/components/weather/WeatherMeta";
import WeatherTempTrigger from "@/components/weather/WeatherTempTrigger";
import { signOut } from "@/lib/actions/auth";
import type { SupportDialogHandle } from "@/components/support/SupportDialog";
import type { LiveWeather } from "@/lib/useLiveWeather";

export function DashboardHeader({
  router, weather, region, airQuality, warnings,
  isLoggedIn, openMyPage, nickname, theme, toggleTheme, supportDialogRef,
}: {
  router: { push: (href: string) => void; refresh: () => void };
  weather: LiveWeather["weather"];
  region: LiveWeather["region"];
  airQuality: LiveWeather["airQuality"];
  warnings: LiveWeather["warnings"];
  isLoggedIn: boolean;
  openMyPage: () => void;
  nickname: string | null;
  theme: "light" | "dark";
  toggleTheme: () => void;
  supportDialogRef: React.RefObject<SupportDialogHandle | null>;
}) {
  return (
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
  );
}
