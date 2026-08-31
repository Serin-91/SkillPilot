import { COLLECTOR_UA } from "./sources.ts";
import { recordCollectError } from "./collect-trace.ts";
import type { ExtractedJobFields } from "./extract-fields";
import { todayKSTDateString } from "../news/kst.ts";

// 잡코리아 상세페이지는 Next.js App Router라 원티드의 __NEXT_DATA__ 같은 단일 JSON blob이 없다 —
// 실제 조회로 확인한 구조(2026-08-13):
//   - 회사명/제목: <title>{company} 채용 - {title} | 잡코리아</title> (og:title/writer meta로 교차 확인 가능)
//   - 경력/학력/급여/마감일: <meta name="description" content="경력 : .., 학력 : .., 급여 : .., 마감일 : ..">
//     한 줄에 안정적으로 들어있다(상시채용이면 "마감일 : 상시채용").
//   - 모집분야/고용형태: 실제 서버렌더 DOM에 <span>라벨</span> 다음 값 span이 온다.
//   - 상세 본문(주요업무/자격요건/우대사항)은 메인 HTML에 아예 없고 별도 iframe
//     (/Recruit/GI_Read_Comt_Ifrm?Gno={id})에서만 온다 — 브라우저 네트워크 탭으로 직접 확인함.
//   - "AI추천공고" 사이드바(다른 공고 추천 목록)는 메인 페이지에만 있고 이 iframe에는 없다 — 그래서
//     본문을 iframe에서만 읽으면 추천 영역 오염(TASK6 P0)이 애초에 구조적으로 안 생긴다.
// 2026-08-13 버그 수정 — 실제 라이브 계정으로 새로고침을 테스트하다가 두 가지를 발견했다:
//   1) <script>/<style> 내용까지 일반 태그 제거 규칙(`<[^>]+>`)만으로는 못 지운다 — 태그만 지워지고
//      그 안의 JS/CSS 코드가 그대로 평문 텍스트로 남아, 공백 없는 긴 URL 토큰(CDN 스크립트 경로 등)이
//      본문에 섞여 카드가 가로로 한없이 길어지는 원인이 됐다(메가존클라우드 공고 실제 사례).
//   2) `\s+`로 전부 공백 한 칸으로 뭉개면 <br>/</p>가 남긴 줄바꿈까지 사라져 여러 줄짜리 본문이 한 줄
//      쭉 나열된 것처럼 보인다 — jumpit.ts처럼 줄바꿈은 남기고 그 외 공백만 정리한다.
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 라벨 span 바로 다음의 값 텍스트만 좁은 window로 긁는다 — 모집분야/고용형태 둘 다 라벨 span 바로 뒤에
// 값이 오는 실제 구조를 그대로 이용한다(넓은 window로 다음 필드까지 섞이지 않게 짧게 끊는다).
// 2026-08-13 버그 수정 — ">${label}<" 매칭 뒤 고정 offset(label.length+2)만큼 건너뛰면 실제 닫는 태그가
// "</span>"처럼 2글자보다 길 때 태그 중간에서 slice가 시작돼 "/span>" 같은 조각이 그대로 값에 섞였다
// (live smoke로 employment_type에서 실제로 발견함). 라벨 뒤 첫 ">"(그 라벨을 감싼 태그의 닫는 지점)를
// 찾아 거기서부터 온전한 태그 경계로 시작하고, window 끝에서 잘린 불완전 태그도 미리 제거한다.
function domTextAfterLabel(html: string, label: string, window = 300): string {
  const labelIdx = html.indexOf(label);
  if (labelIdx === -1) return "";
  const closeTagEnd = html.indexOf(">", labelIdx + label.length);
  if (closeTagEnd === -1) return "";
  const start = closeTagEnd + 1;
  const raw = html.slice(start, start + window).replace(/<[^>]*$/, "");
  // stripTags가 이제 줄바꿈을 보존하므로(본문 추출용), 원래 한 줄짜리 라벨 값에는 줄바꿈을 다시 공백으로 접는다.
  return stripTags(raw).replace(/\n+/g, " ").trim();
}

function parseTitleTag(html: string): { company: string; title: string } | null {
  const m = html.match(/<title>(.*?)\s채용\s-\s(.*?)\s\|\s잡코리아<\/title>/);
  if (m) return { company: stripTags(m[1]), title: stripTags(m[2]) };
  const writer = html.match(/<meta name="writer" content="([^"]*)"/)?.[1]?.trim();
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]?.trim();
  if (writer && ogTitle) return { company: stripTags(writer), title: stripTags(ogTitle.replace(`${writer} 채용 - `, "")) };
  return null;
}

// 메타 description 한 줄이 경력/학력/급여/마감일을 이미 안정적으로 다 담고 있어(28절 실제 조회로 확인),
// DOM 트리를 여러 단 타고 내려가는 것보다 이게 훨씬 안전하다. 학력/급여 값 자체에 쉼표가 섞일 수 있어
// (예: "연봉 3,000만원") 4개 필드를 한 정규식으로 순서대로 파싱하지 않는다 — 경력/마감일만 각자 독립
// 정규식으로 뽑는다. "마감일"은 항상 description의 마지막 필드라 그 뒤 전부를 그대로 캡처하면 된다.
function parseMetaFacts(html: string): { career: string | null; deadlineText: string | null } {
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const career = desc.match(/경력\s*:\s*([^,]*),/)?.[1]?.trim() ?? null;
  const deadlineText = desc.match(/마감일\s*:\s*(.*)$/)?.[1]?.trim() ?? null;
  return { career, deadlineText };
}

// "2026.08.16" → "2026-08-16". "상시채용"이면 마감 없음(6-3절 — 상시채용은 active로 취급, deadline null).
function parseDeadline(deadlineText: string | null): string | null {
  if (!deadlineText) return null;
  const m = deadlineText.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null; // "상시채용" 등 날짜가 아니면 마감 없음으로 취급
}

// "수행업무"는 실제 라이브 계정 테스트에서 발견한 회사가 실제로 쓰는 동의어(솔트룩스 채용공고) —
// "주요업무"류 alias에 없어서 실제 업무 내용이 있는데도 responsibilities가 빈 문자열로 저장되고 있었다.
const HEADER_ALIASES: [keyof Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text">, string[]][] = [
  ["responsibilities", ["주요업무", "담당업무", "업무내용", "수행업무"]],
  ["required_text", ["자격요건", "지원자격", "이런 분을 찾고 있습니다", "필수사항", "필수요건"]],
  ["preferred_text", ["우대사항", "이런 분이면 더 좋습니다", "우대요건"]],
];

// 실제 채용공고 섹션 하나가 이보다 길 일은 없다 — 마지막으로 매칭된 라벨의 content는 다음 <b>가 없으면
// 문서 끝까지 통째로 잡히는데, 그 안에 무관한 꼬리 텍스트(footer/다른 섹션)가 섞여도 걸러낸다
// (실제 라이브 테스트에서 우대사항이 19,567자로 잡힌 사례 — 실제 내용은 앞쪽 일부뿐이었다).
const MAX_SECTION_LENGTH = 4000;

// 섹션 제목은 짧다. 이보다 길면 그건 라벨이 아니라 본문 덩어리다 — 실측으로 확인한 값이다:
// 나인이즈 공고의 214자짜리 회사 소개문이 "…포지션 및 자격요건…"을 품고 있어서
// `label.includes("자격요건")`으로 자격요건 라벨 판정을 받았고, required_text에 "( 1명 )"이 들어갔다.
const MAX_LABEL_LENGTH = 30;

// 라벨 없는 공고를 통째로 폴백할 때의 최소 본문 길이 — 아래 폴백 주석 참고(실측 근거).
const MIN_FALLBACK_BODY_LENGTH = 200;

// 💀💀 예전 구현은 `<b>`와 `</b>`를 같은 마커로 바꿔 통째로 split한 뒤 **"홀수 인덱스=라벨,
// 짝수=본문"이라는 위치(parity) 가정**으로 읽었다. 그 가정은 `<b>` 하나만 어긋나도 무너진다.
//
// 실제로 무너졌다(2026-08-30 ㈜나인이즈 공고, 라이브 재현): 여는 태그가 5개인데 그중 3개가
// `<b style="letter-spacing: 0px;">`였고 `/<b>/g`는 **속성이 붙은 것을 못 잡는다.**
// 마커가 7개(홀수)가 되어 짝이 밀렸고, `자격요건`이라는 문자열이 HTML에 멀쩡히 있는데도
// **짝수 자리로 떨어져 alias 검사조차 받지 못했다.** 결과가 "주요업무만 있는 공고"다.
//
// 🔴 정규식만 넓히면 오히려 더 나빠진다(실측): 회사 소개문이 라벨로 잡히고, 빈 라벨
// `<b style="..."><br></b>`가 `a.includes("")`로 **모든 alias에 매칭**된다.
//
// 그래서 parity를 버리고 원티드(`wanted.ts` JSON 키)·점핏(`jumpit.ts` `<dt>` 라벨 조회)처럼
// **"라벨을 찾아가는"** 방식으로 바꿨다. 라벨을 위치가 아니라 정규식으로 직접 잡고,
// 본문은 "이 라벨 끝 ~ 다음 라벨 시작"으로 뜬다. 태그가 몇 개 늘든 뒤 섹션이 안 죽는다.
//
// 🔴 `(?=[\s>])`를 지우지 마라. 없으면 **`<br>`이 여는 `<b>` 태그로 매칭된다**
//    (`<b` + `r` + `>` 이므로 `<b[^>]*>`에 그대로 걸린다). 그러면 본문 한가운데의 `<br>`부터
//    다음 `</b>`까지가 통째로 "라벨"이 되어 섹션이 또 밀린다 — parity 버그를 고치면서 정확히
//    같은 종류의 버그를 새로 만들 뻔했고, 아래 오프라인 회귀 테스트가 그걸 잡았다.
//    `b` 다음이 공백이거나 `>`일 때만 여는 태그로 본다.
// 🔴 2026-08-31 라이브 전수조사 — `<strong>`을 추가했다. 실측 40건 중 **11건이 `<strong>`을 쓰고**
//    그중 6건은 `<b>`가 하나도 없어 본문이 통째로 버려지고 있었다. 대표 사례(넥슨 메이플스토리
//    AI 엔지니어, Gno 49727184): `<strong>조직 소개 / 주요 업무 / 지원 자격 / 우대 사항</strong>`으로
//    완벽히 라벨링된 1,700자 공고인데 추출 결과가 **세 필드 전부 빈 문자열**이었다.
//    (`<B>` 대문자는 `gi` 플래그가 이미 처리한다 — 실측 40건 중 0건이라 별도 처리는 필요 없었다.)
const LABEL_RE = /<(?:b|strong)(?=[\s>])[^>]*>([\s\S]*?)<\/(?:b|strong)\s*>/gi;
export function extractDescriptionSections(iframeHtml: string): Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text"> {
  const hasLegacyLabels = /<(?:b|strong)(?=[\s>])[^>]*>/i.test(iframeHtml);

  const toText = (html: string) =>
    stripTags(html.replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")).trim();

  // 라벨 후보를 위치와 함께 전부 모은다(문서 순서).
  const raw: { label: string; end: number; start: number }[] = [];
  LABEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LABEL_RE.exec(iframeHtml)) !== null) {
    raw.push({ label: toText(m[1]), start: m.index, end: LABEL_RE.lastIndex });
  }
  // 🔴 라벨이 될 수 없는 것은 **경계 계산 전에** 버린다. 예전엔 루프 안에서 `continue`했는데,
  // 그러면 라벨로 쓰이지도 않는 것이 `marks[i+1].start`로 **다음 섹션의 끝을 잘라먹었다.**
  // `<strong>`을 라벨로 인정하는 순간 이게 실제 문제가 된다 — 본문 중간의 강조 `<strong>` 하나가
  // "주요업무"를 그 자리에서 끊는다. 빈 라벨(`a.includes("")`가 모든 alias에 매칭되는 함정)과
  // 30자 초과(굵게 처리된 본문 덩어리)를 여기서 걸러내면 둘 다 사라진다.
  // 그리고 **블록 첫머리에 있는 것만** 라벨로 본다. `<strong>`을 인정하는 순간 본문 중간의 강조
  // (`모델 배포와 <strong>실시간</strong> 추론 최적화`)가 그 자리에서 섹션을 끊기 때문이다 —
  // 실측에서 실제로 잘렸다(Gno 49834604, 주요업무 175 → 122자). 섹션 제목은 항상 여는 태그
  // 바로 다음에 오고, 강조는 문장 한가운데(앞이 글자)에 온다. 그 차이 하나면 갈린다.
  const startsBlock = (start: number) => {
    const before = iframeHtml.slice(0, start).replace(/(?:\s|&nbsp;)+$/i, "");
    return before === "" || before.endsWith(">");
  };
  const marks = raw.filter((r) => r.label && r.label.length <= MAX_LABEL_LENGTH && startsBlock(r.start));

  const result = { responsibilities: "", required_text: "", preferred_text: "" };
  for (let i = 0; i < marks.length; i++) {
    const label = marks[i].label;
    const content = toText(iframeHtml.slice(marks[i].end, marks[i + 1]?.start ?? iframeHtml.length));
    if (!content) continue;
    for (const [field, aliases] of HEADER_ALIASES) {
      if (result[field]) continue; // 첫 매칭만 사용
      // 🔴 2026-08-31 — 공백을 지우고 비교한다. 실측에서 "주요 업무"(넥슨 메이플스토리 등 다수)가
      //    alias "주요업무"와 **한 칸 차이로** 매칭되지 않아 섹션 분리에 실패하고 통짜 폴백으로 떨어졌다.
      const flat = label.replace(/\s+/g, "");
      if (aliases.some((a) => flat.includes(a) || a.includes(flat))) result[field] = content.slice(0, MAX_SECTION_LENGTH);
    }
  }
  // <b> 라벨이 아예 하나도 없으면(모던 Next.js 셸 페이지 등 legacy 포맷이 아닌 경우) iframe 전체를
  // 그대로 responsibilities로 덤프하지 않는다 — 이 경우 본문은 클라이언트 JS로만 렌더링돼 실제 내용이
  // 없고 script 잔여/셸 boilerplate만 남아 오히려 해가 된다(메가존클라우드 실제 사례). <b> 라벨은 있는데
  // alias만 못 찾은 경우(9-2절 JobKorea 예외)에 한해서만 폴백한다.
  //
  // 🔴 2026-08-31 — 조건을 "라벨이 있나"에서 **"본문이 실제로 있나"**로 바꿨다. 라이브 40건 실측에서
  //    라벨이 하나도 없는데 본문은 멀쩡한 공고가 다수였다(위로보틱스 2,011자 / 플라잎 4,400자) —
  //    전부 세 필드가 빈 채로 저장되고 있었다. 반대로 위 주석이 근거로 든 셸 페이지(Gno 49840603)는
  //    stripTags 결과가 **32자**다. 즉 두 경우를 가르는 것은 라벨의 유무가 아니라 **길이**다.
  //    200자: 셸(32자)과 실제 공고(2,000자+) 사이에 넉넉히 있는 값. 정확한 경계가 아니라 자릿수 구분이다.
  //    ponytail: 실측 두 무리가 60배 떨어져 있어 이 한 값으로 충분하다. 어긋나는 사례가 관찰되면 그때 조인다.
  //    ★ 조건이 "세 필드가 전부 비었나"가 아니라 **"주요업무가 비었나"**인 것도 실측 결과다.
  //      라벨이 자연어인 공고(카카오 계열, Gno 49755508: "합류하면 함께하게 될 업무예요")는
  //      우대사항만 alias에 걸리고 업무는 못 걸리는데, 예전 조건이면 폴백이 막혀 2,770자짜리
  //      본문이 195자로 줄었다. 주요업무가 비면 카드는 사실상 빈 카드다 — alias를 계속 늘리는
  //      대신(끝이 없다) 그 경우에도 전체 본문을 넣는다. 우대사항이 중복될 수 있지만 유실보다 낫다.
  if (!result.responsibilities) {
    const whole = stripTags(iframeHtml);
    if (hasLegacyLabels || whole.length >= MIN_FALLBACK_BODY_LENGTH) {
      result.responsibilities = whole.slice(0, MAX_SECTION_LENGTH);
    }
  }
  return result;
}

async function fetchDescriptionSections(giNo: string): Promise<Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text">> {
  try {
    const res = await fetch(
      `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${giNo}&isHiringCenter=false&hideMapView=false`,
      { headers: { "User-Agent": COLLECTOR_UA }, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return { responsibilities: "", required_text: "", preferred_text: "" };
    return extractDescriptionSections(await res.text());
  } catch {
    return { responsibilities: "", required_text: "", preferred_text: "" };
  }
}

export async function fetchJobKoreaJobDetail(url: string): Promise<ExtractedJobFields | null> {
  const giNo = url.match(/GI_Read\/(\d+)/)?.[1];
  if (!giNo) return null;

  const res = await fetch(url, {
    headers: { "User-Agent": COLLECTOR_UA },
    signal: AbortSignal.timeout(15_000),
  });
  // 404는 삭제/만료된 공고라 정상 흐름이다(28절 실제 조회로 확인 — "마감" 배너가 아니라 404).
  // 그 외(403 차단·429 레이트리밋·5xx)는 조용히 넘기면 "결과 없음"과 구분이 안 되므로 남긴다.
  if (!res.ok) { if (res.status !== 404) recordCollectError("잡코리아 상세", `HTTP ${res.status}`); return null; }
  const html = await res.text();

  const titleInfo = parseTitleTag(html);
  if (!titleInfo) return null; // 채용공고 페이지가 아니거나 구조가 다르면 실패로 간주

  const { career, deadlineText } = parseMetaFacts(html);
  const deadline = parseDeadline(deadlineText);
  // 6-3절 P0 — 절대 html.includes("마감")로 판정하지 않는다. 메타 마감일 값이 과거 날짜일 때만 reject한다.
  if (deadline && deadline < todayKSTDateString()) return null;

  const employmentType = domTextAfterLabel(html, "고용형태") || null;
  const role = domTextAfterLabel(html, "모집분야", 250) || titleInfo.title;

  const sections = await fetchDescriptionSections(giNo);

  return {
    is_job_posting: true,
    company: titleInfo.company,
    title: titleInfo.title,
    role,
    responsibilities: sections.responsibilities,
    required_text: sections.required_text,
    preferred_text: sections.preferred_text,
    career_requirement: career ?? "경력무관",
    deadline,
    posted_at: null,
    date_confidence: "unknown",
    employment_type: employmentType,
    source_job_id: giNo,
  };
}

// 잡코리아 검색 결과에서 실제 공고 상세 URL만 뽑는다(9절 discovery — 사이트 카테고리는 힌트일 뿐).
// stext 검색은 로그인 없이 공개 응답을 주는 걸 실제 조회로 확인함(2026-08-13).
export async function searchJobKorea(query: string, limit: number): Promise<{ url: string; title: string; content: string }[]> {
  const res = await fetch(`https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": COLLECTOR_UA },
    signal: AbortSignal.timeout(15_000),
  });
  // 검색이 막히면 여기서 빈 배열이 나가고 그 뒤 전 단계가 "0건"으로만 보인다.
  if (!res.ok) { recordCollectError("잡코리아 검색", `HTTP ${res.status}`); return []; }
  const html = await res.text();

  const ids = [...new Set([...html.matchAll(/Recruit\/GI_Read\/(\d+)/g)].map((m) => m[1]))];
  return ids.slice(0, limit).map((id) => ({
    url: `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`,
    title: "",
    content: "",
  }));
}
