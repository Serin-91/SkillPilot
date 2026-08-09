import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 기능 모달을 여는 Server Action 맨 앞에서 호출 — 비회원은 /login으로 보낸다.
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return user;
  redirect("/login");
}
