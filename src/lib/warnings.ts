// 기상청 기상특보 조회서비스 — 서버 전용. 클라이언트는 /api/weather-warnings로만 접근한다.
//
// ponytail: 이 서비스에 "지역별 현재발효 상태"를 구조화된 필드로 주는 endpoint가 없다(getWthrWrnList는
// 발표 제목/시각만 주는 목록, getWthrWrnMsg의 t6 필드에 최신 통보문 기준 "전국 특보 현황"이 자연어로 들어있음).
// 그래서 t6 텍스트("o 폭염주의보 : 경기도(김포, 화성, ...)" 형식)를 파싱한다 — 문구 형식이 바뀌면 깨질 수 있는
// heuristic. 기상청이 구조화된 현황 API를 열면 그걸로 교체.

const BASE = "https://apis.data.go.kr/1360000/WthrWrnInfoService";
const NATIONWIDE_STN_ID = "108";

const ALLOWED_TYPES = ["한파", "폭염", "호우", "대설", "강풍"] as const;
type WarningType = (typeof ALLOWED_TYPES)[number];
type WarningLevel = "주의보" | "경보";
export type WeatherWarning = { type: WarningType; level: WarningLevel; label: string };

const LEVEL_RANK: Record<WarningLevel, number> = { 경보: 0, 주의보: 1 };

// 통보문 t6가 시도명을 표기하는 여러 형태(구 명칭·특별자치도 개편 전후)를 하나의 짧은 root로 정규화.
// 이 root는 AirKorea sidoName 매핑(useLiveWeather의 airKoreaSido)과 동일한 값을 쓴다.
const SIDO_ROOT: Record<string, string> = {
  "서울특별시": "서울", "서울": "서울",
  "부산광역시": "부산", "부산": "부산",
  "대구광역시": "대구", "대구": "대구",
  "인천광역시": "인천", "인천": "인천",
  "광주광역시": "광주", "광주": "광주",
  "대전광역시": "대전", "대전": "대전",
  "울산광역시": "울산", "울산": "울산",
  "세종특별자치시": "세종", "세종": "세종",
  "경기도": "경기", "경기": "경기",
  "강원도": "강원", "강원특별자치도": "강원", "강원": "강원",
  "충청북도": "충북", "충북": "충북",
  "충청남도": "충남", "충남": "충남",
  "전라북도": "전북", "전북특별자치도": "전북", "전북": "전북",
  "전라남도": "전남", "전남": "전남",
  "경상북도": "경북", "경북": "경북",
  "경상남도": "경남", "경남": "경남",
  "제주도": "제주", "제주특별자치도": "제주", "제주": "제주",
};

function sidoRoot(raw: string): string | null {
  return SIDO_ROOT[raw.trim()] ?? null;
}

// "o 폭염주의보 : 경기도(김포, 화성, 파주남부)" → { type: "폭염", level: "주의보", regionText: "경기도(...)" }
function parseStatusLine(line: string): { type: WarningType; level: WarningLevel; regionText: string } | null {
  const m = line.trim().match(/^o\s*(.+?)(주의보|경보)\s*:\s*(.+)$/);
  if (!m) return null;
  const [, typeRaw, level, regionText] = m;
  const type = ALLOWED_TYPES.find((t) => t === typeRaw.trim());
  if (!type) return null;
  return { type, level: level as WarningLevel, regionText };
}

// "경기도(김포, 화성), 강원특별자치도(춘천)" → [{sido:"경기도", districts:["김포","화성"]}, ...]
function parseRegionChunks(regionText: string): { sido: string; districts: string[] }[] {
  const chunks: { sido: string; districts: string[] }[] = [];
  const re = /([가-힣]+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(regionText))) {
    chunks.push({ sido: m[1], districts: m[2].split(",").map((s) => s.trim()).filter(Boolean) });
  }
  return chunks;
}

function matchesRegion(regionText: string, sidoRootTarget: string, districtCandidates: string[]): boolean {
  for (const chunk of parseRegionChunks(regionText)) {
    if (sidoRoot(chunk.sido) !== sidoRootTarget) continue;
    if (chunk.districts.some((d) => districtCandidates.includes(d))) return true;
  }
  return false;
}

async function latestBulletinTmFc(serviceKey: string): Promise<string | null> {
  const url = `${BASE}/getWthrWrnList?serviceKey=${encodeURIComponent(serviceKey)}&pageNo=1&numOfRows=1&dataType=JSON&stnId=${NATIONWIDE_STN_ID}`;
  const res = await fetch(url, { next: { revalidate: 300 } }); // 약 5분 캐시
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.response?.header?.resultCode !== "00") return null;
  const item = data?.response?.body?.items?.item?.[0];
  return item?.tmFc ? String(item.tmFc) : null;
}

async function bulletinStatusText(serviceKey: string, tmFc: string): Promise<string | null> {
  const url = `${BASE}/getWthrWrnMsg?serviceKey=${encodeURIComponent(serviceKey)}&pageNo=1&numOfRows=1&dataType=JSON&stnId=${NATIONWIDE_STN_ID}&tmFc=${tmFc}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.response?.header?.resultCode !== "00") return null;
  const item = data?.response?.body?.items?.item?.[0];
  return typeof item?.t6 === "string" ? item.t6 : null;
}

// sido는 AirKorea와 동일한 짧은 root("경기", "서울" ...)를 받는다.
export async function getActiveWarningsFor(sido: string | null, districtCandidates: string[]): Promise<WeatherWarning[] | null> {
  const serviceKey = process.env.AIRKOREA_SERVICE_KEY;
  if (!serviceKey || !sido || districtCandidates.length === 0) return null;

  try {
    const tmFc = await latestBulletinTmFc(serviceKey);
    if (!tmFc) return null;
    const statusText = await bulletinStatusText(serviceKey, tmFc);
    if (statusText === null) return null; // 조회 실패 — "특보 없음"과 구분해 상위에서 영역만 생략

    const found: WeatherWarning[] = [];
    for (const line of statusText.split(/\r?\n/)) {
      const parsed = parseStatusLine(line);
      if (parsed && matchesRegion(parsed.regionText, sido, districtCandidates)) {
        found.push({ type: parsed.type, level: parsed.level, label: `${parsed.type}${parsed.level}` });
      }
    }

    const deduped = new Map<WarningType, WeatherWarning>();
    for (const w of found) {
      const existing = deduped.get(w.type);
      if (!existing || LEVEL_RANK[w.level] < LEVEL_RANK[existing.level]) deduped.set(w.type, w);
    }
    return [...deduped.values()].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  } catch {
    return null;
  }
}
