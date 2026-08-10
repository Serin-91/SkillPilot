// Open-Meteo — API 키 없이 쓸 수 있는 무료 날씨 API (기획안에 날씨 소스 지정 없어 가장 간단한 걸 택함)
const SEOUL = { lat: 37.5665, lon: 126.978 };

export type WeatherView = { tempC: number; icon: string; label: string; humidity: number | null; region: string } | null;

// WMO weather code → 아이콘 + 한글 상태. 헤더에 "27°C ☀️ 맑음 · 습도 60% · 서울"로 표시된다.
function describeCode(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "맑음" };
  if (code === 1 || code === 2) return { icon: "🌤️", label: "구름 조금" };
  if (code === 3) return { icon: "☁️", label: "흐림" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "안개" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄️", label: "눈" };
  if ([95, 96, 99].includes(code)) return { icon: "🌧️", label: "비" }; // 뇌우도 사용자가 지정한 5종 안에서는 '비'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "🌧️", label: "비" };
  return { icon: "🌤️", label: "구름 조금" };
}

// 위도/경도 기준으로 날씨를 가져온다 — 서버(SSR 초기값)와 클라이언트(위치 기반 갱신) 양쪽에서 재사용.
export async function getWeatherAt(lat: number, lon: number, region: string): Promise<WeatherView> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FSeoul`,
      { next: { revalidate: 600 } } // 10분 캐시 — 요청마다 부를 필요 없음
    );
    if (!res.ok) return null;
    const data = await res.json();
    const tempC = data?.current?.temperature_2m;
    if (typeof tempC !== "number") return null;
    const humidity = data?.current?.relative_humidity_2m;
    const { icon, label } = describeCode(data.current.weather_code);
    return {
      tempC: Math.round(tempC),
      icon,
      label,
      humidity: typeof humidity === "number" ? Math.round(humidity) : null,
      region,
    };
  } catch {
    return null;
  }
}

// SSR 초기값(자바스크립트 실행 전 첫 화면) — 이후 클라이언트에서 실제 위치로 갱신된다.
export async function getSeoulWeather(): Promise<WeatherView> {
  return getWeatherAt(SEOUL.lat, SEOUL.lon, "서울");
}
