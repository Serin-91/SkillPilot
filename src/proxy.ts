import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/onboarding",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // API 라우트는 각자 자기 인증(세션 확인 또는 CRON_SECRET)을 하므로 여기서 리다이렉트하지 않는다.
  if (request.nextUrl.pathname.startsWith("/api/")) return response;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response; // Supabase 프로젝트 연결 전 로컬 개발용

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isDevelopmentPreview = process.env.NODE_ENV === "development" &&
    request.nextUrl.pathname === "/mobile-preview";
  const isPublic = request.nextUrl.pathname === "/" || isDevelopmentPreview ||
    PUBLIC_PATHS.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 이미 로그인된 사용자가 로그인/가입 폼으로 다시 들어가지 않게 한다.
  // (onboarding·reset-password는 로그인 상태에서도 그 흐름을 완료해야 하므로 여기서 제외한다)
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

// _vercel/* 는 Vercel 플랫폼이 직접 서비스하는 경로(Analytics·Speed Insights 스크립트와 수집
// 엔드포인트)다 — 미들웨어가 가로채면 비로그인 방문자의 스크립트 요청이 /login으로 리다이렉트돼
// 측정이 통째로 빠진다. 정적 자원들과 같이 matcher에서 제외한다.
// 확장자 목록에 폰트(woff2/woff/ttf/otf)가 빠져 있었다 — public/ 의 정적 파일 중 이미지가 아닌 것은
// 전부 이 미들웨어를 타서, 비로그인 방문자에겐 /login으로 307 리다이렉트되고(폰트가 아예 안 뜬다)
// 로그인 사용자에겐 파일 한 개마다 supabase.auth.getUser() 왕복이 하나씩 더 붙었다.
export const config = {
  matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)"],
};
