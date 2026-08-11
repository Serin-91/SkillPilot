"use client";

import { useLiveWeather } from "@/lib/useLiveWeather";
import type { WeatherView } from "@/lib/weather";
import WeatherMeta from "@/components/weather/WeatherMeta";

export default function AuthWeather({ initial }: { initial: WeatherView }) {
  const { weather, region, airQuality, warnings } = useLiveWeather(initial);
  return (
    <div className="auth-weather">
      <div className="auth-weather-line1">
        <span aria-hidden="true">{weather?.icon ?? "☀️"}</span>
        {weather ? (
          <span className="auth-weather-detail">
            <span className="auth-weather-temp">{weather.tempC}°C</span>
            {weather.humidity !== null && ` · 습도 ${weather.humidity}%`}
          </span>
        ) : "날씨 불러오는 중"}
      </div>
      <WeatherMeta region={region} airQuality={airQuality} warnings={warnings} />
    </div>
  );
}
