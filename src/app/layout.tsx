import type { Metadata, Viewport } from "next";
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

// PWA 2단계 — viewport-fit=cover (PWA_PLAN.md 7절).
//
// 이 한 줄이 <meta name="viewport">에 viewport-fit=cover를 붙인다. 그러면 페이지가 노치·홈
// 인디케이터 영역까지 화면 맨 끝으로 확장되고, 그 대가로 그 띠를 피해야 하는 책임이 CSS로 넘어온다.
// 그 책임을 지는 게 env(safe-area-inset-*)인데 — 이 값은 viewport-fit=cover가 있을 때만 실제
// 숫자를 주고 없으면 무조건 0이다. 즉 dashboard.css에 43군데 써 둔 safe-area 코드가 지금까지
// 한 번도 실행된 적이 없다가 이 줄과 함께 한꺼번에 켜진다.
//
// 되돌리려면 이 export 하나만 지우면 원래대로(1단계 상태) 돌아간다.
export const viewport: Viewport = {
  // Next 기본값과 같은 값을 명시한다 — viewport export를 두는 순간 기본 meta는 나가지 않으므로
  // 여기 안 적으면 사라진다.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
