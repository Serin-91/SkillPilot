"use client";

import { useEffect, useState } from "react";
import { getWeatherAt, type WeatherView } from "@/lib/weather";

// 키 없이 쓸 수 있는 무료 역지오코딩 — 위경도 → 도시명 (Open-Meteo는 역지오코딩을 지원하지 않음)
async function regionOf(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
    const data = await res.json();
    return data.city || data.locality || "내 위치";
  } catch {
    return "내 위치";
  }
}

// GPS 권한 거부/미지원(대부분 데스크톱 브라우저) 시 IP 기반 위치로 대체
async function fromIp(): Promise<WeatherView> {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null;
    return getWeatherAt(data.latitude, data.longitude, data.city || "내 위치");
  } catch {
    return null;
  }
}

// 서버가 내려준 서울 고정값(initial)으로 먼저 그리고, 브라우저 위치(GPS→IP 순)로 조용히 갱신한다.
export function useLiveWeather(initial: WeatherView): WeatherView {
  const [weather, setWeather] = useState(initial);

  useEffect(() => {
    let cancelled = false;

    async function upgrade() {
      if (!navigator.geolocation) {
        const w = await fromIp();
        if (w && !cancelled) setWeather(w);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const region = await regionOf(latitude, longitude);
          const w = await getWeatherAt(latitude, longitude, region);
          if (w && !cancelled) setWeather(w);
        },
        async () => {
          const w = await fromIp();
          if (w && !cancelled) setWeather(w);
        },
        { timeout: 5000, maximumAge: 600_000 }
      );
    }

    upgrade();
    return () => { cancelled = true; };
  }, []);

  return weather;
}
