"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AirQualityData } from "@/lib/air-quality";
import type { WeatherWarning } from "@/lib/warnings";

// 대기질/특보/기온 트리거 하나 — hover(desktop)/focus(keyboard)/tap(mobile) 전부로 열리고, 바깥을 누르면 닫힌다.
// 같은 모양을 쓰는 곳이 여럿이라 여기서 한 번만 구현하고 export한다(기온 트리거는 WeatherTempTrigger).
export function WeatherTrigger({
  label, isOpen, open, close, itemClassName = "", children,
}: {
  label: React.ReactNode; isOpen: boolean; open: () => void; close: () => void;
  itemClassName?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  // left는 트리거의 가운데 좌표이고 툴팁은 translateX(-50%)로 그 위에 걸친다 — 트리거가 화면 오른쪽 끝에
  // 붙어 있으면(모바일 헤더의 기온/대기질이 그렇다) 절반이 화면 밖으로 나간다. 실제 폭을 재서 가둔다.
  useLayoutEffect(() => {
    if (!isOpen || !tooltipPosition || !tipRef.current) return;
    const half = tipRef.current.offsetWidth / 2;
    const clamped = Math.min(Math.max(tooltipPosition.left, 8 + half), window.innerWidth - 8 - half);
    if (Math.abs(clamped - tooltipPosition.left) > 0.5) setTooltipPosition({ ...tooltipPosition, left: clamped });
  }, [isOpen, tooltipPosition]);

  useLayoutEffect(() => {
    if (!isOpen || !ref.current) return;
    const position = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltipPosition({ top: rect.bottom + 7, left: rect.left + rect.width / 2 });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, [isOpen, close]);

  return (
    <span className={`weather-meta-item ${itemClassName}`} ref={ref} onMouseEnter={open} onMouseLeave={close}>
      {/* stopPropagation을 걸면 다른 트리거를 눌러도 이 툴팁의 document 리스너가 안 돌아 둘이 같이 열린다.
          트리거끼리 서로 닫히게 하려고 전파를 막지 않는다(헤더 조상에는 click 핸들러가 없다). */}
      <button
        type="button"
        className="weather-meta-trigger"
        onFocus={open}
        onBlur={close}
        onClick={open}
      >
        {label}
      </button>
      {isOpen && (
        <span
          ref={tipRef}
          className="weather-tooltip"
          role="tooltip"
          style={tooltipPosition ? { position: "fixed", top: tooltipPosition.top, left: tooltipPosition.left } : undefined}
        >
          {children}
        </span>
      )}
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
        <WeatherTrigger
          label={`🍃 대기질 ${airQuality.summaryLevel}`}
          isOpen={openTrigger === "aq"}
          open={() => setOpenTrigger("aq")}
          close={closeAq}
        >
          <strong>◉ 미세먼지</strong> {airQuality.pm10.value}㎍/㎥<br />
          <strong>✦ 초미세먼지</strong> {airQuality.pm25.value}㎍/㎥
        </WeatherTrigger>
      )}

      {warningLabel && (
        warnings.length === 1 ? (
          <span className="weather-meta-item">{warningLabel}</span>
        ) : (
          <WeatherTrigger label={warningLabel} isOpen={openTrigger === "warn"} open={() => setOpenTrigger("warn")} close={closeWarn}>
            {warnings.map((w) => <span key={w.type}>{w.label}</span>)}
          </WeatherTrigger>
        )
      )}
    </span>
  );
}
