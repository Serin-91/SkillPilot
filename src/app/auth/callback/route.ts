import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile/queries";

// Supabase 이메일 링크(가입 확인·비밀번호 재설정)와 Google OAuth가 code와 함께 여기로 돌아온다
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 비밀번호 재설정처럼 목적지가 정해진 흐름은 그대로 보낸다.
      if (next !== "/" && next !== "/onboarding") return NextResponse.redirect(`${origin}${next}`);

      // 관심 직무가 없는 회원(Google 신규 가입 포함)은 최소 onboarding을 먼저 완료해야 한다.
      const { data: { user } } = await supabase.auth.getUser();
      const profile = user ? await getProfile(supabase, user.id) : null;
      const needsOnboarding = !profile || profile.interested_job_roles.length === 0;
      return NextResponse.redirect(`${origin}${needsOnboarding ? "/onboarding" : "/"}`);
    }

    // 코드 교환 실패(링크 만료, 이미 사용된 링크 등) — Supabase 원문 메시지는 서버 로그로만 남기고
    // 사용자에게는 원인과 무관하게 고정된 한국어 안내만 보여준다.
    console.error("auth callback exchangeCodeForSession failed:", error.message);
    const loginUrl = new URL(`${origin}/login`);
    loginUrl.searchParams.set("error", "인증 링크가 만료되었거나 이미 사용되었습니다. 다시 시도해주세요.");
    return NextResponse.redirect(loginUrl);
  }

  const errorDescription = searchParams.get("error_description");
  const loginUrl = new URL(`${origin}/login`);
  if (errorDescription) loginUrl.searchParams.set("error", errorDescription);
  return NextResponse.redirect(loginUrl);
}
