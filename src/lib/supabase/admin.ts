import { createClient } from "@supabase/supabase-js";

// RLS를 우회하는 서버 전용 클라이언트 — service_role 키는 절대 클라이언트에 노출하지 않는다.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
