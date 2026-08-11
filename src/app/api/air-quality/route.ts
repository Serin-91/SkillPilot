import { NextResponse } from "next/server";
import { getAirQualityFor } from "@/lib/air-quality";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sido = searchParams.get("sido");
  const district = (searchParams.get("district") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const airQuality = await getAirQualityFor(sido, district);
  if (!airQuality) return NextResponse.json({ error: "air_quality_unavailable" }, { status: 502 });
  return NextResponse.json(airQuality);
}
