"use client";

import { useEffect, useState } from "react";
import { getWeatherAt, type WeatherView } from "@/lib/weather";

const CACHE_KEY = "skillpilot:weather";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 — 이 안에서는 새로고침해도 재조회하지 않아 값·지역명이 흔들리지 않는다

// 키 없이 쓸 수 있는 무료 역지오코딩 — 위경도 → 도시명 (Open-Meteo는 역지오코딩을 지원하지 않음)
// GPS 경로든 IP 경로든 지역명은 항상 여기 하나로만 뽑는다 — 소스가 갈리면 "서울"/"Seoul"/"서울특별시"처럼
// 새로고침마다 다른 표기가 나온다.
async function regionOf(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
    const data = await res.json();
    return data.city || data.locality || "내 위치";
  } catch {
    return "내 위치";
  }
}

async function fromCoords(lat: number, lon: number): Promise<WeatherView> {
  const region = await regionOf(lat, lon);
  return getWeatherAt(lat, lon, region);
}

// GPS 권한 거부/미지원(대부분 데스크톱 브라우저) 시 IP 기반 위치로 대체
async function fromIp(): Promise<WeatherView> {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null;
    return fromCoords(data.latitude, data.longitude);
  } catch {
    return null;
  }
}

function readCache(): WeatherView | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, weather } = JSON.parse(raw) as { at: number; weather: WeatherView };
    return Date.now() - at < CACHE_TTL_MS ? weather : null;
  } catch {
    return null;
  }
}

function writeCache(weather: WeatherView) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), weather }));
  } catch {
    // 프라이빗 모드 등 sessionStorage 접근 불가 — 캐싱만 못 할 뿐 기능엔 지장 없다
  }
}

// 서버가 내려준 서울 고정값(initial)으로 먼저 그리고, 브라우저 위치(GPS→IP 순)로 조용히 갱신한다.
export function useLiveWeather(initial: WeatherView): WeatherView {
  const [weather, setWeather] = useState(initial);

  useEffect(() => {
    const cached = readCache();
    if (cached) { setWeather(cached); return; }

    let cancelled = false;
    function commit(w: WeatherView) {
      if (!w || cancelled) return;
      setWeather(w);
      writeCache(w);
    }

    async function upgrade() {
      if (!navigator.geolocation) {
        commit(await fromIp());
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => commit(await fromCoords(pos.coords.latitude, pos.coords.longitude)),
        async () => commit(await fromIp()),
        { timeout: 5000, maximumAge: 600_000 }
      );
    }

    upgrade();
    return () => { cancelled = true; };
  }, []);

  return weather;
}
