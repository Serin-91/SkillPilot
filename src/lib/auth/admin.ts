const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

// System Status 탭 등 관리자 전용 기능의 유일한 판별 지점 — 이메일을 여기 말고 다른 곳에 하드코딩하지 않는다.
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.trim().toLowerCase());
}
