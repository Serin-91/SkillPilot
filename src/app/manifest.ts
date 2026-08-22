import type { MetadataRoute } from "next";

// Next 16 파일 규약 — app/manifest.ts 를 두면 /manifest.webmanifest 로 서빙된다.
// 규약 문서: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md
//
// 아이콘은 scripts/make-icons.mjs가 만든다. iOS는 이 목록을 읽지 않고 layout.tsx의
// apple-touch-icon만 보므로 둘 다 있어야 한다.
//
// ── PWA 현재 상태 (2026-08-23) ───────────────────────────────────────────────────────────────
// 홈 화면에 추가하면 주소창 없는 전체화면 앱으로 뜬다. 아이폰 실기기 확인 완료.
// 서비스워커·푸시 알림은 만들지 않기로 했다 — 대시보드가 전부 인증 뒤 동적 SSR이라 오프라인에
// 캐시해 둘 화면이 없고, 캐시 무효화라는 버그 표면만 새로 생긴다.
//
// **viewport-fit=cover는 꺼져 있다.** layout.tsx에 viewport export가 없으면 꺼진 상태다.
// 한 번 켰다가(97b8cf6) 되돌렸다(3aff952). 이 한 줄이 dashboard.css의 env(safe-area-inset-*)
// 43곳을 동시에 활성화하는데, 그 상태로는 화면 여러 곳이 한꺼번에 어긋나서 "이 증상이 cover
// 때문인지 원래 버그인지" 구분할 수가 없었다.
//
// 다시 켜려면 layout.tsx에 이것만 넣으면 된다(지우면 다시 꺼진다):
//   export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
//   ※ width/initialScale도 반드시 같이 적는다 — viewport export를 두는 순간 Next 기본 meta가 안 나간다.
// 켠 뒤 아이폰에서 확인할 것은 하나다: 글자나 버튼이 노치·홈인디케이터 띠에 물리는가.
// (대시보드 맨 아래 / 모바일 헤더 / 메모 전체화면의 ‹·⋮ / Monthly MEMO 저장 버튼 / Focus·Idea 모달 하단)
// 확인된 구멍이 하나 있었고 이미 고쳐뒀다 — .big-postit의 padding-bottom에만 safe-area-inset-bottom이
// 빠져 있어 본문 마지막 줄이 홈 인디케이터에 깔렸다(6f0342f). env()는 cover가 꺼져 있으면 0이라
// 지금은 무해하다. 전체 경위는 git log에 PWA_PLAN.md로 남아 있다(마지막 버전 8aeb30f).
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
