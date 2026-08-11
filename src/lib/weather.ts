// 기상청 API허브 초단기예보(getUltraSrtFcst) — 서버 전용. 클라이언트는 이 파일을 절대 import하지 않고
// /api/weather를 통해서만 값을 받는다 (authKey를 브라우저에 노출하지 않기 위함).
import { nowKST } from "@/lib/news/kst";

const SEOUL = { lat: 37.5665, lon: 126.978 };
const KMA_ENDPOINT = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst";

export type WeatherView = { tempC: number; icon: string; label: string; humidity: number | null; region: string } | null;

// 기상청 동네예보 격자(nx, ny) 변환 — 공식 DFS(Lambert Conformal Conic) 좌표변환식.
// 위경도→격자 변환용 외부 API를 별도로 부르지 않기 위해 순수 함수로 로컬 계산한다.
function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0 * (Math.PI / 180);
  const SLAT2 = 60.0 * (Math.PI / 180);
  const OLON = 126.0 * (Math.PI / 180);
  const OLAT = 38.0 * (Math.PI / 180);
  const XO = 43;
  const YO = 136;

  const re = RE / GRID;
  const sn = Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) / Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5));
  const sf = (Math.pow(Math.tan(Math.PI * 0.25 + SLAT1 * 0.5), sn) * Math.cos(SLAT1)) / sn;
  const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + OLAT * 0.5), sn);

  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + (lat * Math.PI) / 180 / 2), sn);
  let theta = (lon * Math.PI) / 180 - OLON;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// 초단기예보는 매시 30분에 생성되어 45분부터 조회 가능 — 45분 전이면 아직 이전 시각 발표분을 써야 한다.
function baseSlot(kst: Date, hoursBack: number): { baseDate: string; baseTime: string } {
  const d = new Date(kst);
  if (d.getUTCMinutes() < 45) d.setUTCHours(d.getUTCHours() - 1);
  d.setUTCHours(d.getUTCHours() - hoursBack, 30, 0, 0);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return { baseDate: `${y}${m}${day}`, baseTime: `${h}30` };
}

// SKY: 초단기예보는 1(맑음)/3(구름많음)/4(흐림)만 쓴다 — 2(구름조금)는 이 API에 없는 코드.
function describeSky(sky: string): { icon: string; label: string } {
  if (sky === "1") return { icon: "☀️", label: "맑음" };
  if (sky === "3") return { icon: "⛅", label: "구름많음" };
  return { icon: "☁️", label: "흐림" };
}

// PTY: 초단기예보 전용 코드(0/1/2/3/5/6/7) — 단기예보의 4(소나기)는 여기 없다. PTY!=0이면 SKY보다 우선한다.
function describePty(pty: string): { icon: string; label: string } | null {
  switch (pty) {
    case "1": return { icon: "🌧️", label: "비" };
    case "2": return { icon: "🌨️", label: "비/눈" };
    case "3": return { icon: "❄️", label: "눈" };
    case "5": return { icon: "🌦️", label: "빗방울" };
    case "6": return { icon: "🌨️", label: "빗방울눈날림" };
    case "7": return { icon: "🌨️", label: "눈날림" };
    default: return null; // "0" = 없음
  }
}

type KmaItem = { category: string; fcstDate: string; fcstTime: string; fcstValue: string };

async function fetchSlot(nx: number, ny: number, baseDate: string, baseTime: string): Promise<KmaItem[] | null> {
  const authKey = process.env.KMA_AUTH_KEY;
  if (!authKey) return null;

  const url =
    `${KMA_ENDPOINT}?authKey=${encodeURIComponent(authKey)}&pageNo=1&numOfRows=100&dataType=JSON` +
    `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

  const res = await fetch(url, { next: { revalidate: 600 } }); // 격자 기준 10분 캐시
  if (!res.ok) return null;

  const data = await res.json();
  if (data?.response?.header?.resultCode !== "00") return null;

  const items = data?.response?.body?.items?.item;
  return Array.isArray(items) ? items : null;
}

// 같은 fcstDate+fcstTime의 T1H/REH/SKY/PTY를 한 세트로 묶어, 현재 이후 가장 가까운 시각을 고른다.
function pickNearestSet(items: KmaItem[]): Record<string, string> | null {
  const byTime = new Map<string, Record<string, string>>();
  for (const it of items) {
    const key = `${it.fcstDate}${it.fcstTime}`;
    if (!byTime.has(key)) byTime.set(key, {});
    byTime.get(key)![it.category] = it.fcstValue;
  }
  const keys = [...byTime.keys()].sort();
  for (const key of keys) {
    const set = byTime.get(key)!;
    if (set.T1H !== undefined && set.REH !== undefined && set.SKY !== undefined && set.PTY !== undefined) {
      return set;
    }
  }
  return null;
}

// 위도/경도 기준으로 날씨를 가져온다 — 서버(SSR 초기값)와 /api/weather 라우트(클라이언트 위치 기반) 양쪽에서 재사용.
export async function getWeatherAt(lat: number, lon: number, region: string): Promise<WeatherView> {
  try {
    const { nx, ny } = latLonToGrid(lat, lon);
    const kst = nowKST();

    const slot0 = baseSlot(kst, 0);
    let items = await fetchSlot(nx, ny, slot0.baseDate, slot0.baseTime);
    if (!items) {
      const slot1 = baseSlot(kst, 1); // NO_DATA 1회만 이전 슬롯 fallback
      items = await fetchSlot(nx, ny, slot1.baseDate, slot1.baseTime);
    }
    if (!items) return null;

    const set = pickNearestSet(items);
    if (!set) return null;

    const tempC = Number(set.T1H);
    const humidity = Number(set.REH);
    if (!Number.isFinite(tempC)) return null;

    const pty = describePty(set.PTY);
    const { icon, label } = pty ?? describeSky(set.SKY);

    return {
      tempC: Math.round(tempC),
      icon,
      label,
      humidity: Number.isFinite(humidity) ? Math.round(humidity) : null,
      region,
    };
  } catch {
    return null;
  }
}

// SSR 초기값(자바스크립트 실행 전 첫 화면) — 이후 클라이언트에서 실제 위치로 갱신된다.
export async function getSeoulWeather(): Promise<WeatherView> {
  return getWeatherAt(SEOUL.lat, SEOUL.lon, "서울특별시"); // 클라이언트 역지오코딩이 돌려주는 표기와 맞춰 새로고침 시 깜빡임 방지
}
