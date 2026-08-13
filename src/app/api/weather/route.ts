import { NextResponse } from "next/server";
import { getWeatherAt } from "@/lib/weather";

// 클라이언트가 위치 기반 날씨를 받는 유일한 경로 — KMA authKey는 서버에만 있다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const region = searchParams.get("region") || "내 위치";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "invalid_coords" }, { status: 400 });
  }

  const weather = await getWeatherAt(lat, lon, region);
  if (!weather) return NextResponse.json({ error: "weather_fetch_failed" }, { status: 502 });
  return NextResponse.json(weather);
}
