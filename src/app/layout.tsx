import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "SkillPilot",
  description: "AI·개발 동향과 채용공고를 정리하는 개인 맞춤형 학습·기록 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT.css" />
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
