import { notifyApiFailure } from "@/lib/jobs/notify";

// 로컬 개발용 수동 테스트 엔드포인트 — 배포 환경에서는 막는다(누구나 호출해 메일을 발송시킬 수 없도록).
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  try {
    await notifyApiFailure("테스트", new Error("테스트 메일 발송"));
    return Response.json({ success: true, message: "테스트 메일 발송 완료" });
  } catch (error) {
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
