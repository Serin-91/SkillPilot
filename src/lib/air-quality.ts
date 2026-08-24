// 한국환경공단 AirKorea 시도별 실시간 측정정보 — 서버 전용. 클라이언트는 /api/air-quality로만 접근한다.

const AIRKOREA_ENDPOINT = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

type Level = "좋음" | "보통" | "나쁨" | "매우나쁨";

export type AirQualityData = {
  summaryLevel: Level;
  pm10: { value: number; level: Level };
  pm25: { value: number; level: Level };
} | null;

type Station = {
  stationName: string;
  mangName: string;
  pm10Value?: string;
  pm25Value?: string;
  pm10Flag?: string;
  pm25Flag?: string;
  pm10Grade1h?: string;
  pm25Grade1h?: string;
};

const GRADE_LABEL: Record<number, Level> = { 1: "좋음", 2: "보통", 3: "나쁨", 4: "매우나쁨" };
const SEVERITY: Record<Level, number> = { 좋음: 1, 보통: 2, 나쁨: 3, 매우나쁨: 4 };

function pm10LevelFromValue(v: number): Level {
  if (v <= 30) return "좋음";
  if (v <= 80) return "보통";
  if (v <= 150) return "나쁨";
  return "매우나쁨";
}

function pm25LevelFromValue(v: number): Level {
  if (v <= 15) return "좋음";
  if (v <= 35) return "보통";
  if (v <= 75) return "나쁨";
  return "매우나쁨";
}

// "-", "", null, NaN, 음수, 통신장애 flag는 모두 무효 처리. PM10/PM2.5는 서로 독립적으로 검사한다.
function validPm(raw: string | undefined, flag: string | undefined): number | null {
  if (flag && flag !== "정상") return null;
  if (raw === undefined || raw === null || raw === "" || raw === "-") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function grade1hLevel(raw: string | undefined): Level | null {
  const idx = Number(raw);
  return idx >= 1 && idx <= 4 ? GRADE_LABEL[idx] : null;
}

// 1순위: 현재 지역명과 정확히 일치하는 측정소. 동일 이름이 여럿이면 도시대기 우선.
// 후보 전부와 불일치하면 null — 다른 구/평균값으로 대체하지 않는다.
function selectStation(stations: Station[], districtCandidates: string[]): Station | null {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
  for (const candidate of districtCandidates) {
    const target = normalize(candidate);
    const matches = stations.filter((s) => normalize(s.stationName) === target);
    if (matches.length === 0) continue;
    if (matches.length === 1) return matches[0];
    return matches.find((s) => s.mangName === "도시대기") ?? matches[0];
  }
  return null;
}

export async function getAirQualityFor(sido: string | null, districtCandidates: string[]): Promise<AirQualityData> {
  const serviceKey = process.env.AIRKOREA_SERVICE_KEY;
  if (!serviceKey || !sido || districtCandidates.length === 0) return null;

  try {
    const url =
      `${AIRKOREA_ENDPOINT}?serviceKey=${encodeURIComponent(serviceKey)}&returnType=json` +
      `&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=1&ver=1.3`;

    // 타임아웃 없이 두면 응답이 안 오는 동안 무한정 기다린다 — weather.ts가 같은 이유로 배포를
    // 통째로 실패시킨 적이 있다(f0f7066). 이 함수는 /api/air-quality를 통해 모든 클라이언트가
    // 마운트마다 호출하므로, 늦으면 값을 포기하고 null을 준다(대기질 영역만 생략된다).
    const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) }); // 시도 단위 10분 캐시 — 같은 시도 사용자끼리 공유
    if (!res.ok) return null;

    const data = await res.json();
    const items: Station[] | undefined = data?.response?.body?.items;
    if (!Array.isArray(items) || items.length === 0) return null;

    const station = selectStation(items, districtCandidates);
    if (!station) return null;

    const pm10Value = validPm(station.pm10Value, station.pm10Flag);
    const pm25Value = validPm(station.pm25Value, station.pm25Flag);
    if (pm10Value === null || pm25Value === null) return null; // 둘 중 하나라도 무효면 종합 등급을 만들지 않는다

    const pm10Level = grade1hLevel(station.pm10Grade1h) ?? pm10LevelFromValue(pm10Value);
    const pm25Level = grade1hLevel(station.pm25Grade1h) ?? pm25LevelFromValue(pm25Value);
    const summaryLevel = SEVERITY[pm10Level] >= SEVERITY[pm25Level] ? pm10Level : pm25Level;

    return {
      summaryLevel,
      pm10: { value: Math.round(pm10Value), level: pm10Level },
      pm25: { value: Math.round(pm25Value), level: pm25Level },
    };
  } catch {
    return null;
  }
}
