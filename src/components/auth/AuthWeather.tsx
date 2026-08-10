"use client";

import { useLiveWeather } from "@/lib/useLiveWeather";
import type { WeatherView } from "@/lib/weather";

export default function AuthWeather({ initial }: { initial: WeatherView }) {
  const weather = useLiveWeather(initial);
  return (
    <div className="auth-weather">
      <span aria-hidden="true">{weather?.icon ?? "☀️"}</span>
      {weather ? <><span className="auth-weather-temp">{weather.tempC}°C</span> · {weather.region}</> : "서울"}
    </div>
  );
}
