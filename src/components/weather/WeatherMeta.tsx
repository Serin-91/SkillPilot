"use client";

import { useEffect, useRef, useState } from "react";
import type { AirQualityData } from "@/lib/air-quality";
import type { WeatherWarning } from "@/lib/warnings";

// 대기질/특보 트리거 하나 — hover(desktop)/focus(keyboard)/tap(mobile) 전부로 열리고, 바깥을 누르면 닫힌다.
// AQ와 특보 둘 다 같은 모양을 쓰므로 여기서 한 번만 구현하고 WeatherMeta가 "동시에 하나만 열림"을 조율한다.
function Trigger({
  label, isOpen, open, close, children,
}: { label: string; isOpen: boolean; open: () => void; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, [isOpen, close]);

  return (
    <span className="weather-meta-item" ref={ref} onMouseEnter={open} onMouseLeave={close}>
      <button
        type="button"
        className="weather-meta-trigger"
        onFocus={open}
        onBlur={close}
        onClick={(e) => { e.stopPropagation(); open(); }}
      >
        {label}
      </button>
      {isOpen && <span className="weather-tooltip" role="tooltip">{children}</span>}
    </span>
  );
}

// 헤더 날씨 2번째 줄 — 지역명 + 대기질 요약 + (있을 때만) 기상특보. Dashboard/AuthWeather가 공유한다.
export default function WeatherMeta({
  region, airQuality, warnings,
}: { region: string; airQuality: AirQualityData; warnings: WeatherWarning[] }) {
  const [openTrigger, setOpenTrigger] = useState<"aq" | "warn" | null>(null);
  const closeAq = () => setOpenTrigger((t) => (t === "aq" ? null : t));
  const closeWarn = () => setOpenTrigger((t) => (t === "warn" ? null : t));

  const warningLabel =
    warnings.length === 1 ? `⚠️ ${warnings[0].label}` : warnings.length > 1 ? `⚠️ 특보 ${warnings.length}건` : null;

  return (
    <span className="weather-meta">
      <span className="weather-meta-item weather-region">{region}</span>

      {airQuality && (
        <Trigger
          label={`🍃 대기질 ${airQuality.summaryLevel}`}
          isOpen={openTrigger === "aq"}
          open={() => setOpenTrigger("aq")}
          close={closeAq}
        >
          <strong>◉ 미세먼지</strong> {airQuality.pm10.value}㎍/㎥<br />
          <strong>✦ 초미세먼지</strong> {airQuality.pm25.value}㎍/㎥
        </Trigger>
      )}

      {warningLabel && (
        warnings.length === 1 ? (
          <span className="weather-meta-item">{warningLabel}</span>
        ) : (
          <Trigger label={warningLabel} isOpen={openTrigger === "warn"} open={() => setOpenTrigger("warn")} close={closeWarn}>
            {warnings.map((w) => <span key={w.type}>{w.label}</span>)}
          </Trigger>
        )
      )}
    </span>
  );
}
