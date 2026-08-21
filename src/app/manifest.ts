import type { MetadataRoute } from "next";

// Next 16 파일 규약 — app/manifest.ts 를 두면 /manifest.webmanifest 로 서빙된다.
// 규약 문서: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md
//
// viewport-fit=cover는 여기가 아니라 layout.tsx의 viewport export에서 정한다. 지금은 일부러
// 켜지 않았다 — dashboard.css의 safe-area 규칙 43곳이 한꺼번에 활성화되면서 모바일 레이아웃이
// 통째로 바뀔 수 있어서, 아이폰 실기기로 확인한 뒤 별도로 켠다(PWA_PLAN.md 3절·7절).
//
// 아이콘은 scripts/make-icons.mjs가 만든다. iOS는 이 목록을 읽지 않고 layout.tsx의
// apple-touch-icon만 보므로 둘 다 있어야 한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkillPilot",
    short_name: "SkillPilot",
    description: "AI·개발 동향과 채용공고를 정리하는 개인 맞춤형 학습·기록 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    // .sp-body 배경 그라디언트의 시작색
    // (linear-gradient(135deg, #d9cbff 0%, #cfe9ff 45%, #f6d2f1 100%))
    theme_color: "#d9cbff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
