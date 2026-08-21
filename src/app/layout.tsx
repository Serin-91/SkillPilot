import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 메모 영역 전용 폰트. 예전엔 dashboard.css 첫 줄의 @import url(fonts.googleapis.com/...)로 받았는데,
// CSS @import는 최악의 로딩 경로다 — dashboard.css를 받아 파싱해야 비로소 구글 CSS를 요청하고, 그걸
// 받아야 gstatic의 woff2를 요청한다(왕복 3번 직렬). 그 사이 렌더가 막힌다.
// next/font/google로 바꾸면 빌드 때 self-host돼서 서드파티 왕복이 0이 된다(위 Geist와 같은 방식).
// preload는 끈다 — 메모는 첫 화면 아래라 본문 폰트(SUIT)의 preload 우선순위를 뺏으면 안 된다.
const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "SkillPilot",
  description: "AI·개발 동향과 채용공고를 정리하는 개인 맞춤형 학습·기록 시스템",
  // iOS는 manifest.ts의 icons를 읽지 않는다 — 홈 화면 아이콘은 오직 apple-touch-icon만 본다.
  // statusBarStyle은 "default"로 둔다. "black-translucent"는 상태바 아래로 콘텐츠를 밀어넣어
  // viewport-fit=cover와 같은 문제를 일으키므로, 그건 2단계에서 같이 검토한다(PWA_PLAN.md 7절).
  appleWebApp: {
    capable: true,
    title: "SkillPilot",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} h-full antialiased`}
    >
      <head>
        {/* SUIT은 self-host한다(@font-face는 globals.css). 폰트 파일 URL을 CSS 파싱까지 기다리지
            않고 HTML 파싱 즉시 받기 시작하도록 preload를 건다 — 본문 전체가 쓰는 폰트라 항상 필요하다. */}
        <link rel="preload" href="/fonts/SUIT-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Analytics(방문자·페이지뷰) / Speed Insights(실사용자 성능 지표) — 루트 레이아웃에
            한 번만 두면 모든 페이지에 적용된다. 로컬(dev)에서는 아무것도 전송하지 않고, Vercel에
            배포된 뒤 각 대시보드 탭에서 데이터가 쌓인다. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
