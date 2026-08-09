import Link from "next/link";
import { getSeoulWeather } from "@/lib/weather";
import "../../app/auth.css";

// Log in / Sign up / Forgot / Reset / Onboarding이 전부 공유하는 Auth Shell.
// 기능명·버튼·탭·field label은 영어, 설명·helper·오류 안내는 한글(AUTH_DESIGN 언어 규칙).
export default async function AuthShell({
  tab, title, subtitle, children,
}: {
  tab?: "login" | "signup";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const weather = await getSeoulWeather();

  return (
    <div className="auth-page">
      <div className="auth-topbar">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/skillpilot-header-logo.png" alt="SkillPilot" className="auth-topbar-logo" />
        </Link>
        <div className="auth-weather">
          <span aria-hidden="true">{weather?.icon ?? "☀️"}</span>
          {weather ? <><span className="auth-weather-temp">{weather.tempC}°C</span> · {weather.region}</> : "서울"}
        </div>
      </div>

      <main className="auth-shell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/skillpilot-header-logo.png" alt="" className="auth-card-logo" />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {tab && (
          <nav className="auth-tabs" aria-label="인증 방식 선택">
            <Link href="/login" className="auth-tab" data-active={tab === "login"} aria-current={tab === "login" ? "page" : undefined}>Log in</Link>
            <Link href="/signup" className="auth-tab" data-active={tab === "signup"} aria-current={tab === "signup" ? "page" : undefined}>Sign up</Link>
          </nav>
        )}

        {children}
      </main>
    </div>
  );
}
