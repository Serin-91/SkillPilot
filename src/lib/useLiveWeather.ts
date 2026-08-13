"use client";

import { useEffect, useState } from "react";
import type { WeatherView } from "@/lib/weather";
import type { AirQualityData } from "@/lib/air-quality";
import type { WeatherWarning } from "@/lib/warnings";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10분 — 이 안에서는 새로고침해도 재조회하지 않아 값·지역명이 흔들리지 않는다
const CACHE_KEYS = {
  weather: "skillpilot:weather", region: "skillpilot:region",
  airQuality: "skillpilot:air-quality", warnings: "skillpilot:warnings",
} as const;

// BigDataCloud principalSubdivisionCode(ISO 3166-2:KR) → AirKorea sidoName / 기상특보 지역 매칭에 쓰는 짧은 표기.
const AIRKOREA_SIDO: Record<string, string> = {
  "KR-11": "서울", "KR-26": "부산", "KR-27": "대구", "KR-28": "인천",
  "KR-29": "광주", "KR-30": "대전", "KR-31": "울산", "KR-50": "세종",
  "KR-41": "경기", "KR-42": "강원", "KR-43": "충북", "KR-44": "충남",
  "KR-45": "전북", "KR-46": "전남", "KR-47": "경북", "KR-48": "경남",
  "KR-49": "제주",
};

export type LiveWeather = {
  weather: WeatherView;
  region: string;
  airQuality: AirQualityData;
  warnings: WeatherWarning[];
};

type LocationInfo = {
  displayRegion: string;
  airKoreaSido: string | null;
  districtCandidates: string[];
};

// localityInfo.administrative는 [국가, 시도, (시도 중복), 시/군/구, (동 — 있을 때도/없을 때도 있음] 순서로 온다.
// adminLevel<=7까지만 남기고 마지막 항목을 시/군/구 후보로 쓴다 — 동 단위(adminLevel 8+)는 AirKorea
// 측정소명과 맞지 않아 제외. "시"/"군"으로 끝나면 접미사를 뗀 표기도 후보에 더한다(측정소명이 종종 접미사를 뺀다).
function districtsOf(admin: { name: string; adminLevel?: number }[]): string[] {
  const tier = admin.filter((a) => (a.adminLevel ?? 0) <= 7);
  const last = tier[tier.length - 1];
  if (!last?.name) return [];
  const stripped = last.name.replace(/(시|군)$/, "");
  return stripped === last.name ? [last.name] : [last.name, stripped];
}

// 키 없이 쓸 수 있는 무료 역지오코딩 — 위경도 → 표시 지역명 + AirKorea/기상특보 매칭용 정보.
// GPS든 IP든 위치 정보는 항상 이 응답 하나에서만 뽑는다 — AirKorea/특보 때문에 따로 호출하지 않는다.
async function locationInfoOf(lat: number, lon: number): Promise<LocationInfo> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`);
    const data = await res.json();
    const displayRegion = data.principalSubdivision || data.city || data.locality || "내 위치";
    const airKoreaSido = AIRKOREA_SIDO[data.principalSubdivisionCode] ?? null;
    const districtCandidates = districtsOf(data.localityInfo?.administrative ?? []);
    return { displayRegion, airKoreaSido, districtCandidates };
  } catch {
    return { displayRegion: "내 위치", airKoreaSido: null, districtCandidates: [] };
  }
}

function coordsFromGeolocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 600_000 }
    );
  });
}

// GPS 권한 거부/미지원(대부분 데스크톱 브라우저) 시 IP 기반 위치로 대체
async function coordsFromIp(): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null;
    return { lat: data.latitude, lon: data.longitude };
  } catch {
    return null;
  }
}

async function fetchWeather(lat: number, lon: number, region: string): Promise<WeatherView> {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}&region=${encodeURIComponent(region)}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function fetchAirQuality(sido: string | null, districts: string[]): Promise<AirQualityData> {
  if (!sido || districts.length === 0) return null;
  try {
    const res = await fetch(`/api/air-quality?sido=${encodeURIComponent(sido)}&district=${encodeURIComponent(districts.join(","))}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// null = 조회 실패(권한/지역 매칭 없음 포함), [] = 정상 조회했지만 활성 특보 없음 — 캐시 여부를 가르는 구분이라 구별한다.
async function fetchWarnings(sido: string | null, districts: string[]): Promise<WeatherWarning[] | null> {
  if (!sido || districts.length === 0) return null;
  try {
    const res = await fetch(`/api/weather-warnings?sido=${encodeURIComponent(sido)}&district=${encodeURIComponent(districts.join(","))}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.warnings) ? data.warnings : null;
  } catch {
    return null;
  }
}

// 넷 다 성공했을 때만 캐시한다 — 실패를 캐시하면 일시적 오류가 TTL 내내 "값 없음"으로 굳어버린다.
function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    return Date.now() - at < CACHE_TTL_MS ? value : null;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // 프라이빗 모드 등 sessionStorage 접근 불가 — 캐싱만 못 할 뿐 기능엔 지장 없다
  }
}

// 서버가 내려준 서울 고정값(initial)으로 먼저 그리고, 브라우저 위치(GPS→IP 순)로 날씨/대기질/특보를
// 독립적으로 갱신한다. 셋 중 하나가 늦거나 실패해도 나머지 표시를 기다리거나 깨뜨리지 않는다.
export function useLiveWeather(initial: WeatherView): LiveWeather {
  const [weather, setWeather] = useState(initial);
  const [region, setRegion] = useState(initial?.region ?? "서울특별시");
  const [airQuality, setAirQuality] = useState<AirQualityData>(null);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);

  useEffect(() => {
    const cachedWeather = readCache<WeatherView>(CACHE_KEYS.weather);
    const cachedRegion = readCache<string>(CACHE_KEYS.region);
    const cachedAir = readCache<AirQualityData>(CACHE_KEYS.airQuality);
    const cachedWarnings = readCache<WeatherWarning[]>(CACHE_KEYS.warnings);
    if (cachedWeather) setWeather(cachedWeather);
    if (cachedRegion) setRegion(cachedRegion);
    if (cachedAir) setAirQuality(cachedAir);
    if (cachedWarnings) setWarnings(cachedWarnings);
    if (cachedWeather && cachedRegion && cachedAir && cachedWarnings) return; // 넷 다 있으면 이번 마운트는 위치 재요청 없이 끝낸다

    let cancelled = false;

    async function upgrade() {
      const coords = (await coordsFromGeolocation()) ?? (await coordsFromIp());
      if (!coords || cancelled) return;

      const location = await locationInfoOf(coords.lat, coords.lon);
      if (cancelled) return;
      if (!cachedRegion) { setRegion(location.displayRegion); writeCache(CACHE_KEYS.region, location.displayRegion); } // 지역명은 날씨/대기질/특보보다 먼저 표시

      if (!cachedWeather) {
        fetchWeather(coords.lat, coords.lon, location.displayRegion).then((w) => {
          if (!w || cancelled) return;
          setWeather(w); writeCache(CACHE_KEYS.weather, w);
        });
      }
      if (!cachedAir) {
        fetchAirQuality(location.airKoreaSido, location.districtCandidates).then((a) => {
          if (!a || cancelled) return;
          setAirQuality(a); writeCache(CACHE_KEYS.airQuality, a);
        });
      }
      if (!cachedWarnings) {
        fetchWarnings(location.airKoreaSido, location.districtCandidates).then((w) => {
          if (w === null || cancelled) return;
          setWarnings(w); writeCache(CACHE_KEYS.warnings, w);
        });
      }
    }

    upgrade();
    return () => { cancelled = true; };
  }, []);

  return { weather, region, airQuality, warnings };
}
