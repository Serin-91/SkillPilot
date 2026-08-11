import { NextResponse } from "next/server";
import { getActiveWarningsFor } from "@/lib/warnings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sido = searchParams.get("sido");
  const district = (searchParams.get("district") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const warnings = await getActiveWarningsFor(sido, district);
  if (warnings === null) return NextResponse.json({ error: "warnings_unavailable" }, { status: 502 });
  return NextResponse.json({ warnings });
}
