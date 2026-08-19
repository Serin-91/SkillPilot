"use client";

import { useLiveWeather } from "@/lib/useLiveWeather";
import type { WeatherView } from "@/lib/weather";
import WeatherMeta from "@/components/weather/WeatherMeta";
import WeatherTempTrigger from "@/components/weather/WeatherTempTrigger";

export default function AuthWeather({ initial }: { initial: WeatherView }) {
  const { weather, region, airQuality, warnings } = useLiveWeather(initial);
  return (
    <div className="auth-weather">
      <div className="auth-weather-line1">
        {/* 기온 탭 → 지역·습도 툴팁. Dashboard 헤더와 같은 컴포넌트를 쓴다. */}
        <WeatherTempTrigger
          weather={weather} region={region}
          tempClassName="auth-weather-temp" iconClassName="auth-weather-icon"
        />
        {weather && weather.humidity !== null && (
          <span className="auth-weather-detail">{` · 습도 ${weather.humidity}%`}</span>
        )}
      </div>
      <WeatherMeta region={region} airQuality={airQuality} warnings={warnings} />
    </div>
  );
}
