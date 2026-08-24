// 기상청 API허브 초단기실황(getUltraSrtNcst) + 초단기예보(getUltraSrtFcst) — 서버 전용. 클라이언트는 이 파일을 절대 import하지 않고
// /api/weather를 통해서만 값을 받는다 (authKey를 브라우저에 노출하지 않기 위함).
import { nowKST } from "@/lib/news/kst";

const SEOUL = { lat: 37.5665, lon: 126.978 };
const KMA_BASE = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0";
// 초단기실황 — 현재 기온/습도/강수형태(T1H/REH/PTY)의 실제 관측값. 같은 KMA_AUTH_KEY를 그대로 쓴다.
const KMA_NCST_ENDPOINT = `${KMA_BASE}/getUltraSrtNcst`;
// 초단기예보 — 실황에는 없는 SKY(하늘상태)만 여기서 가져온다.
const KMA_FCST_ENDPOINT = `${KMA_BASE}/getUltraSrtFcst`;

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

// 초단기실황은 매시 정각 관측, API 제공은 관측 후 10분부터 — 10분 전이면 아직 이전 시각 값을 써야 한다.
function ncstBaseSlot(kst: Date, hoursBack: number): { baseDate: string; baseTime: string } {
  const d = new Date(kst);
  if (d.getUTCMinutes() < 10) d.setUTCHours(d.getUTCHours() - 1);
  d.setUTCHours(d.getUTCHours() - hoursBack, 0, 0, 0);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return { baseDate: `${y}${m}${day}`, baseTime: `${h}00` };
}

// 초단기예보는 매시 30분에 생성되어 45분부터 조회 가능 — 45분 전이면 아직 이전 시각 발표분을 써야 한다.
function fcstBaseSlot(kst: Date, hoursBack: number): { baseDate: string; baseTime: string } {
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

// PTY: 초단기실황/초단기예보 공통 코드(0/1/2/3/5/6/7) — 단기예보의 4(소나기)는 여기 없다. PTY!=0이면 SKY보다 우선한다.
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
type KmaNcstItem = { category: string; obsrValue: string };

async function fetchKma<T>(endpoint: string, nx: number, ny: number, baseDate: string, baseTime: string): Promise<T[] | null> {
  const authKey = process.env.KMA_AUTH_KEY;
  if (!authKey) return null;

  const url =
    `${endpoint}?authKey=${encodeURIComponent(authKey)}&pageNo=1&numOfRows=100&dataType=JSON` +
    `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

  // 개별 호출 타임아웃. 이게 없으면 응답이 안 오는 동안 무한정 기다린다 — 실제로 Vercel
  // 빌드(iad1, 미국 동부)에서 기상청 API 응답이 안 와서 /reset-password 프리렌더가 60초
  // 상한에 세 번 걸려 **배포가 통째로 실패**했다. 날씨는 있으면 좋은 정보지 페이지를 못 그릴
  // 이유가 아니다. 실패하면 null을 주고, 클라이언트(AuthWeather/useLiveWeather)가 나중에 채운다.
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) }); // 격자 기준 10분 캐시
  } catch {
    return null; // 타임아웃 / DNS / 네트워크 오류
  }
  if (!res.ok) return null;

  const data = await res.json();
  if (data?.response?.header?.resultCode !== "00") return null;

  const items = data?.response?.body?.items?.item;
  return Array.isArray(items) ? items : null;
}

// 초단기실황 — fcstDate/fcstTime 그룹핑이 필요한 예보와 달리 한 base_date/base_time에 카테고리당 값이 하나뿐이다.
function ncstValueMap(items: KmaNcstItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const it of items) map[it.category] = it.obsrValue;
  return map;
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
// 현재 기온/습도/강수형태는 초단기실황(관측값)을 우선 쓰고, 실황에 없는 SKY(하늘상태)만 초단기예보에서 가져온다.
// 실황 조회에 실패하면 기존처럼 초단기예보 값(T1H/REH/PTY/SKY)으로 통째로 대체해 화면이 깨지지 않게 한다.
// 호출 한 번의 전체 상한. getWeatherAt은 실황·예보를 각각 fallback까지 최대 4번 순차 호출하므로
// 개별 타임아웃(4초)만으로는 최악 16초가 되고, 정적 페이지 3개면 프리렌더 60초 상한에 다시 닿는다.
// 여기서 통째로 끊는다.
//
// ★ 타이머에 unref()를 걸지 않는다. 처음엔 "빌드 워커 종료를 붙잡지 않게" 걸었는데, unref된
//   타이머는 이벤트 루프를 살려두지 않으므로 **대기 중인 다른 핸들이 없으면 데드라인이 아예 안
//   울리고 이 약속이 영영 안 끝난다.** 자체 점검이 조용히 종료(exit 0, 출력 없음)하면서 드러났다.
//   실제 경로에서는 fetch가 루프를 붙잡고 있어 우연히 동작했을 뿐이다.
//   지연 걱정은 필요 없다 — p가 끝나는 즉시 clearTimeout하고, p 자신도 fetch의 4초 abort로
//   반드시 끝난다. 타이머가 종료를 늦추는 경우는 실질적으로 없다.
const WEATHER_DEADLINE_MS = 6000;
export function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    void p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); },
    );
  });
}

export function getWeatherAt(lat: number, lon: number, region: string): Promise<WeatherView> {
  return withDeadline(fetchWeatherAt(lat, lon, region), WEATHER_DEADLINE_MS, null);
}

async function fetchWeatherAt(lat: number, lon: number, region: string): Promise<WeatherView> {
  try {
    const { nx, ny } = latLonToGrid(lat, lon);
    const kst = nowKST();

    // 실황(관측)과 예보는 서로 아무 의존관계가 없다 — 아래에서 값을 합칠 때 처음 만난다.
    // 예전엔 두 체인을 순차로 await해서 정상 2회 / fallback까지 최악 4회가 **직렬**로 쌓였고,
    // 개별 4초 × 4 = 16초가 6초 데드라인을 그냥 넘겨 날씨가 통째로 null이 되는 구간이 있었다.
    // 체인 안의 fallback은 순서를 지켜야 하니 그대로 두고, 두 체인만 나란히 굴린다 — 최악 8초.
    const [ncstItems, fcstItems] = await Promise.all([
      (async () => {
        const slot0 = ncstBaseSlot(kst, 0);
        const first = await fetchKma<KmaNcstItem>(KMA_NCST_ENDPOINT, nx, ny, slot0.baseDate, slot0.baseTime);
        if (first) return first;
        const slot1 = ncstBaseSlot(kst, 1); // NO_DATA 1회만 이전 시각 fallback
        return fetchKma<KmaNcstItem>(KMA_NCST_ENDPOINT, nx, ny, slot1.baseDate, slot1.baseTime);
      })(),
      (async () => {
        const slot0 = fcstBaseSlot(kst, 0);
        const first = await fetchKma<KmaItem>(KMA_FCST_ENDPOINT, nx, ny, slot0.baseDate, slot0.baseTime);
        if (first) return first;
        const slot1 = fcstBaseSlot(kst, 1); // NO_DATA 1회만 이전 슬롯 fallback
        return fetchKma<KmaItem>(KMA_FCST_ENDPOINT, nx, ny, slot1.baseDate, slot1.baseTime);
      })(),
    ]);

    const ncstMap = ncstItems ? ncstValueMap(ncstItems) : null;
    const ncstOk = !!ncstMap && ncstMap.T1H !== undefined && ncstMap.REH !== undefined && ncstMap.PTY !== undefined;
    const fcstSet = fcstItems ? pickNearestSet(fcstItems) : null;

    if (!ncstOk && !fcstSet) return null;

    // 실황 성공 시 T1H/REH/PTY는 실황, SKY는 예보 — 실황 실패 시 예보 값을 통째로 fallback
    const tempRaw = ncstOk ? ncstMap!.T1H : fcstSet!.T1H;
    const humidityRaw = ncstOk ? ncstMap!.REH : fcstSet!.REH;
    const ptyRaw = ncstOk ? ncstMap!.PTY : fcstSet!.PTY;
    const skyRaw = fcstSet?.SKY;

    const tempC = Number(tempRaw);
    const humidity = Number(humidityRaw);
    if (!Number.isFinite(tempC)) return null;

    // 기상청 원본 소수값을 그대로 쓴다(27.6 → 27.6°C) — 임의로 반올림하지 않는다.
    const pty = describePty(ptyRaw);
    const { icon, label } = pty ?? describeSky(skyRaw ?? ""); // 예보 SKY까지 없으면 describeSky 기본값(흐림)으로 안전하게 처리

    return {
      tempC,
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
