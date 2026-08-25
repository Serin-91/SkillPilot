import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
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
    // suppressHydrationWarning — 아래 인라인 스크립트가 서버 HTML에는 없는 data-theme 속성을
    // <html>에 붙이므로, 이게 없으면 하이드레이션 불일치 경고가 매 로드마다 뜬다.
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} h-full antialiased`}
    >
      <head>
        {/* SUIT은 self-host한다(@font-face는 globals.css). 폰트 파일 URL을 CSS 파싱까지 기다리지
            않고 HTML 파싱 즉시 받기 시작하도록 preload를 건다 — 본문 전체가 쓰는 폰트라 항상 필요하다. */}
        <link rel="preload" href="/fonts/SUIT-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* PWA standalone의 상태바 색. manifest.ts의 theme_color는 설치 시점에 박혀 런타임에 안
            바뀌므로, 실제로 색을 따라가는 건 이 meta다. 기본값은 manifest와 같은 라이트 색이고
            아래 스크립트와 Dashboard의 토글이 다크로 갈아끼운다.
            ※ Next의 viewport.themeColor export로 옮기지 말 것 — 그 export를 두는 순간 Next 기본
              viewport meta가 안 나가고, width/initialScale을 손으로 적다가 viewport-fit=cover를
              같이 켜면 env(safe-area-inset-*) 43곳이 한꺼번에 활성화된다(manifest.ts 주석 참고).
              게다가 themeColor의 조건부 값은 prefers-color-scheme 미디어쿼리뿐이라 OS 설정을 안
              읽기로 한 이 앱에서는 쓸 수가 없다.
            ※ 순서 제약은 없다 - 아래 스크립트가 meta를 못 찾으면 직접 만들기 때문이다. next/script의
              beforeInteractive는 추가 위치와 무관하게 head에 주입되므로(Next 문서) 이 meta보다
              앞에 놓일 수 있고, 예전처럼 querySelector 결과를 그냥 및으면 그때 theme-color가 죽는다. */}
        <meta name="theme-color" content="#d9cbff" />
        {/* FOUC 방지 — 렌더 전에 data-theme을 확정한다. React state로 하면 첫 페인트가 라이트로
            나간 뒤 이펙트에서 다크로 바뀌어 화면이 번쩍인다. 저장값이 'dark'가 아니면 전부
            라이트다(신규 방문자 = 라이트). OS 테마는 여기서도 읽지 않는다. */}
        {/* 맨 <script>로 두면 React가 "Encountered a script tag while rendering React component"을
            띄운다 - 클라이언트 렌더 경로에서는 이 태그가 실행되지 않기 때문이다(react-dom 경고).
            next/script + strategy="beforeInteractive"가 이 용도의 공식 경로다: 서버 초기 HTML에
            심어지고 Next 모듈보다 먼저 실행되며, 항상 head 안에 주입된다(Next 문서 script.md).
            id는 인라인 스크립트에 필수다. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var t=localStorage.getItem('skillpilot_theme')==='dark'?'dark':'light';` +
              `document.documentElement.setAttribute('data-theme',t);` +
              `var m=document.querySelector('meta[name="theme-color"]');` +
              `if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');` +
              `(document.head||document.documentElement).appendChild(m);}` +
              `m.setAttribute('content',t==='dark'?'#0b0d19':'#d9cbff');}catch(e){}})();`,
          }}
        />
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
