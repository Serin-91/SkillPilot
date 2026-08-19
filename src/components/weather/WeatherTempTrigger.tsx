"use client";

import { useState } from "react";
import { WeatherTrigger } from "./WeatherMeta";
import type { WeatherView } from "@/lib/weather";

// 기온 pill을 탭하면 지역·습도를 대기질 툴팁과 똑같은 모양으로 띄운다.
// 모바일에서는 헤더 폭이 없어 지역·습도 텍스트(.weather-detail/.weather-region)를 숨기는데,
// 그러면 정보 자체를 볼 길이 없어져서 대기질과 같은 방식으로 되돌려준다.
// Dashboard 헤더와 로그인/가입 페이지가 같은 컴포넌트를 쓴다(클래스만 prefix로 다르다).
export default function WeatherTempTrigger({
  weather, region, tempClassName, iconClassName,
}: {
  weather: WeatherView; region: string; tempClassName: string; iconClassName: string;
}) {
  const [open, setOpen] = useState(false);
  if (!weather) return <>날씨 불러오는 중</>;

  return (
    <WeatherTrigger
      itemClassName="weather-temp-item"
      label={
        <>
          <span className={tempClassName}>{weather.tempC}°C</span>
          <span className={iconClassName}>{weather.icon}</span>
        </>
      }
      isOpen={open}
      open={() => setOpen(true)}
      close={() => setOpen(false)}
    >
      <strong>◉ 지역</strong> {region}
      {weather.humidity !== null && (
        <>
          <br />
          <strong>✦ 습도</strong> {weather.humidity}%
        </>
      )}
    </WeatherTrigger>
  );
}
