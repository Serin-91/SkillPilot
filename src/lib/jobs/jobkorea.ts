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
// 🔴 alias는 **공백을 지운 뒤** 비교한다(아래 flat). 그래서 여기 적는 표기에 공백이 있어도 되고,
//    "주요업무"/"주요 업무" 같은 표기 변이를 양쪽 다 적을 필요가 없다(3절 "표기 변이는 양쪽 다 넣어라"의
//    비용을 정규화로 없앤 것이다). 예전엔 정규화가 alias 쪽엔 없어서 "이런 분을 찾고 있습니다"처럼
//    공백이 든 alias가 **한 번도 매칭될 수 없었다**(라벨은 공백이 지워진 채로 왔다).
const HEADER_ALIASES: [keyof Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text">, string[]][] = [
  ["responsibilities", ["주요업무", "담당업무", "업무내용", "수행업무", "하는 일", "업무 소개", "주요 역할", "담당 역할"]],
  ["required_text", ["자격요건", "지원자격", "이런 분을 찾고 있습니다", "필수사항", "필수요건", "자격조건", "필요역량", "지원조건", "자격 및 경험"]],
  ["preferred_text", ["우대사항", "이런 분이면 더 좋습니다", "우대요건", "우대조건", "이런 경험이 있으면 좋아요", "이런 분이면 좋습니다"]],
];
const FLAT_ALIASES = HEADER_ALIASES.map(([field, aliases]) => [field, aliases.map((a) => a.replace(/\s+/g, ""))] as const);

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
// 🔴 2026-09-01 — 라벨이 `<b>`/`<strong>`만은 아니다. 이 둘만 보면 제목을 `<h3>`/`<p class="tit">`/
//    `<span style="font-weight:700">`/`<font>`로 다는 공고가 전부 "라벨 0개"로 떨어져 통짜 폴백이
//    되고 **모든 내용이 responsibilities 한 칸에** 들어간다. 소스만 늘리고 **판정은 그대로 둔다** —
//    아래 필터(비어있지 않음 / 30자 이하 / startsBlock / 계열 1개)가 새 소스에도 똑같이 걸린다.
//    ⚠️ `<p>`/`<span>`을 무조건 인정하면 본문 문단이 전부 라벨이 된다. 그래서 **속성으로 좁힌다**:
//      - `<p>`는 class에 `tit`(=tit/title)가 있을 때만 — 잡코리아 에디터가 실제로 쓰는 제목 클래스다.
//      - `<span>`은 inline style이 **실제로 굵게**일 때만(`bold`/600~900). 색·크기만 준 span은 라벨이 아니다.
//    ⚠️ `(?=[\s>])`는 `<b>`와 같은 이유로 전부 유지한다(`<br>`이 `<b...>`로 잡히는 함정).
const LABEL_SOURCES: RegExp[] = [
  /<(?:b|strong)(?=[\s>])[^>]*>([\s\S]*?)<\/(?:b|strong)\s*>/gi,
  /<h[1-6](?=[\s>])[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi,
  /<p(?=\s)[^>]*class=["'][^"']*tit[^"']*["'][^>]*>([\s\S]*?)<\/p\s*>/gi,
  /<span(?=\s)[^>]*style=["'][^"']*font-weight\s*:\s*(?:bold|[6-9]00)[^"']*["'][^>]*>([\s\S]*?)<\/span\s*>/gi,
  /<font(?=[\s>])[^>]*>([\s\S]*?)<\/font\s*>/gi,
];

// 🔴 종결 라벨 — **경계는 만들지만 필드는 절대 안 채운다.** 마지막 섹션이 문서 끝까지 달려서
//    전형절차/근무조건/복리후생/접수방법 같은 꼬리 텍스트를 통째로 삼키는 것을 막는다.
//    (alias 계열에 안 걸리므로 태그 라벨로 잡히면 이미 경계 역할만 한다 — 문제는 **평문**으로 적힌
//     꼬리다. 그래서 아래 `cutAtTerminator`가 섹션 본문 안의 평문 꼬리 줄에서도 자른다.)
//    ⚠️ 부분일치로 자르면 "복리후생: 4대보험, 중식제공" 같은 **본문 한 줄**에서 잘린다.
//    한 줄이 장식·콜론을 걷어낸 뒤 **정확히** 이 목록의 한 항목일 때만 자른다.
const TERMINATORS = new Set([
  "전형절차", "채용절차", "근무조건", "근무환경", "복리후생", "복지혜택",
  "접수방법", "지원방법", "제출서류", "기타사항", "유의사항", "참고사항",
  "회사소개", "기업소개",
]);
const LINE_DECOR = /^[\s▶▷■□●○◆◇★☆·•ㆍ※–—*\-[\]()]*(?:\d+[.)])?[\s▶▷■□●○◆◇★☆·•ㆍ※–—*\-[\]()]*|[\s:：.\-–—[\]()]*$/g;
const flatten = (s: string) => s.replace(LINE_DECOR, "").replace(/\s+/g, "");

// 섹션 본문이 평문 종결 라벨 줄에 닿으면 거기서 끊는다(태그 패스·평문 패스 공용).
function cutAtTerminator(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim().length <= MAX_LABEL_LENGTH && TERMINATORS.has(flatten(l)));
  return at === -1 ? text : lines.slice(0, at).join("\n").trim();
}

// ── ld+json JobPosting — 메타데이터의 정본 ──────────────────────────────────────────────────
// 라이브 81건 전수조사(2026-09-01): `<script type="application/ld+json">`의 JobPosting이 **81/81**에
// 있고 datePosted / validThrough / employmentType / hiringOrganization도 전부 81/81이었다.
// 그래서 날짜·회사·고용형태는 여기서 읽는다 — 특히 posted_at은 이 소스가 생기기 전까지
// **항상 null**이었고 date_confidence도 항상 "unknown"이었다(wanted.ts는 confirm_time으로 high를 준다).
// 🔴 단, `description`은 쓰지 않는다. 91자짜리 SEO 템플릿("㈜X에서 정규직 경력 채용을 진행합니다…")이라
//    본문이 0자다. 섹션 파싱은 여전히 iframe 본문 휴리스틱이 한다.
type JobPostingLd = {
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string } | string;
};

export function parseJobPostingLd(html: string): JobPostingLd | null {
  // 페이지에 ld+json 블록이 여러 개다(BreadcrumbList/Organization 등). 전부 훑어 JobPosting만 고른다.
  // 한 블록이 깨져도 다음 블록을 계속 본다 — 하나 실패로 전체를 포기하면 폴백이 과하게 자주 돈다.
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const graph = (data as { "@graph"?: unknown })?.["@graph"];
    const nodes = Array.isArray(data) ? data : Array.isArray(graph) ? graph : [data];
    for (const node of nodes) {
      const t = (node as { "@type"?: unknown })?.["@type"];
      const types = Array.isArray(t) ? t : [t];
      if (types.includes("JobPosting")) return node as JobPostingLd;
    }
  }
  return null;
}

// "2026-09-30", "2026-09-30T23:59:59+09:00" 어느 쪽이 와도 앞 10자만 쓴다(KST 벽시계 날짜).
export function ldDateOnly(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

// 🔴 schema.org enum(FULL_TIME / INTERN / CONTRACTOR …)이면 **DOM의 한글 값을 우선한다.**
//    training hard filter(filter.ts TRAINING_EMPLOYMENT_TERMS)는 "연수생/교육생/훈련생/수강생"이라는
//    한글 문자열만 본다 — enum으로 덮는 순간 그 관문이 아무 소리 없이 무력해진다.
//    ld는 한글 값을 줄 때만 정본으로 쓰고, 그 외에는 폴백(DOM)이 이긴다.
export function ldEmploymentType(value: JobPostingLd["employmentType"]): string | null {
  const text = (Array.isArray(value) ? value.join(", ") : value ?? "").trim();
  if (!text) return null;
  return /^[A-Z_ ,]+$/.test(text) ? null : text;
}

export function extractDescriptionSections(iframeHtml: string): Pick<ExtractedJobFields, "responsibilities" | "required_text" | "preferred_text"> {
  const hasLegacyLabels = /<(?:b|strong)(?=[\s>])[^>]*>/i.test(iframeHtml);

  const toText = (html: string) =>
    stripTags(html.replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")).trim();

  // 라벨 후보를 위치와 함께 전부 모은다(문서 순서).
  const raw: { label: string; end: number; start: number }[] = [];
  for (const re of LABEL_SOURCES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(iframeHtml)) !== null) {
      raw.push({ label: toText(m[1]), start: m.index, end: re.lastIndex });
    }
  }
  // 소스가 여럿이라 **겹치는 후보**가 생긴다(`<p class="tit"><b>주요업무</b></p>`는 둘 다 매칭).
  // 바깥 것(먼저 시작하고 더 긴 것)만 남긴다 — 안쪽까지 남기면 라벨이 바로 다음 라벨의 start로
  // 자기 본문을 0자로 잘라먹는다.
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  let lastEnd = -1;
  const deduped = raw.filter((r) => (r.start >= lastEnd ? ((lastEnd = r.end), true) : false));
  raw.length = 0;
  raw.push(...deduped);
  // 🔴 라벨이 될 수 없는 것은 **경계 계산 전에** 버린다. 예전엔 루프 안에서 `continue`했는데,
  // 그러면 라벨로 쓰이지도 않는 것이 `marks[i+1].start`로 **다음 섹션의 끝을 잘라먹었다.**
  // `<strong>`을 라벨로 인정하는 순간 이게 실제 문제가 된다 — 본문 중간의 강조 `<strong>` 하나가
  // "주요업무"를 그 자리에서 끊는다. 빈 라벨(`a.includes("")`가 모든 alias에 매칭되는 함정)과
  // 30자 초과(굵게 처리된 본문 덩어리)를 여기서 걸러내면 둘 다 사라진다.
  // 그리고 **블록 첫머리에 있는 것만** 라벨로 본다. `<strong>`을 인정하는 순간 본문 중간의 강조
  // (`모델 배포와 <strong>실시간</strong> 추론 최적화`)가 그 자리에서 섹션을 끊기 때문이다 —
  // 실측에서 실제로 잘렸다(Gno 49834604, 주요업무 175 → 122자). 섹션 제목은 항상 여는 태그
  // 바로 다음에 오고, 강조는 문장 한가운데(앞이 글자)에 온다. 그 차이 하나면 갈린다.
  // 🔴 여는 태그와 라벨 사이에 **장식**이 끼는 실물이 많다: `<p>▶ <b>주요업무</b></p>`,
  //    `<p>■<b>자격요건</b></p>`, `<td>1. <b>우대사항</b></td>`. 공백만 걷어내면 앞이 "▶"/"■"/"1."로
  //    끝나 라벨이 통째로 버려지고 **앞 섹션이 그 내용을 삼킨다.** 불릿·번호·HTML 엔티티까지 걷는다.
  //    느슨하게 만들되 경계는 유지한다 — 문장 한가운데 강조(`모델 배포와 <strong>실시간</strong>`)는
  //    앞이 글자("…배포와")로 끝나므로 여전히 라벨이 아니다(오프라인 회귀가 이걸 지킨다).
  const DECOR_TAIL = /(?:\s|&nbsp;|&#160;|&ensp;|&emsp;|&thinsp;|[▶▷■□●○◆◇★☆·•ㆍ※–—*\-]|\d+[.)]|\[\d+\])+$/i;
  const startsBlock = (start: number) => {
    const before = iframeHtml.slice(0, start).replace(DECOR_TAIL, "");
    return before === "" || before.endsWith(">");
  };
  const marks = raw.filter((r) => r.label && r.label.length <= MAX_LABEL_LENGTH && startsBlock(r.start));

  const result = { responsibilities: "", required_text: "", preferred_text: "" };
  for (let i = 0; i < marks.length; i++) {
    const label = marks[i].label;
    const content = cutAtTerminator(toText(iframeHtml.slice(marks[i].end, marks[i + 1]?.start ?? iframeHtml.length)));
    if (!content) continue;
    // 🔴 2026-08-31 — 공백을 지우고 비교한다. 실측에서 "주요 업무"(넥슨 메이플스토리 등 다수)가
    //    alias "주요업무"와 **한 칸 차이로** 매칭되지 않아 섹션 분리에 실패하고 통짜 폴백으로 떨어졌다.
    const flat = label.replace(/\s+/g, "");
    // 🔴 예전엔 `flat.includes(a) || a.includes(flat)`였다. 뒤쪽(역방향)이 치명적이었다:
    //    `<b>업무</b>시간: 09-18시`의 라벨 "업무"가 "주요업무".includes("업무")로 주요업무에 붙어
    //    responsibilities에 "시간: 09-18시"가 들어가고, `if (result[field]) continue` 때문에
    //    **진짜 주요업무가 나중에 와도 막힌다.** "요건"→자격요건, "사항"→우대사항도 같다.
    //    라벨이 alias를 **온전히 품을 때만** 인정한다(역방향은 버린다).
    const hits = FLAT_ALIASES.filter(([, aliases]) => aliases.some((a) => flat.includes(a)));
    // 🔴 그리고 alias 계열을 **둘 이상** 품은 라벨은 라벨이 아니라 문장이다 —
    //    `<b>아래 주요업무와 자격요건을 확인하세요</b>`(23자, 30자 상한 아래)가 두 필드를 동시에
    //    가로채고 그 뒤 진짜 섹션을 전부 막았다. 길이로는 못 거르니 계열 수로 거른다.
    if (hits.length !== 1) continue;
    const [field] = hits[0];
    if (result[field]) continue; // 첫 매칭만 사용
    result[field] = content.slice(0, MAX_SECTION_LENGTH);
  }

  // 🔴 최후수단 — **태그가 아예 없는 평문 라벨**. 많은 공고가 `주요업무`를 그냥 자기 줄에 적는다.
  //    태그 기반이 이미 통했으면(라벨 2개 이상) 절대 돌지 않는다 — 태그로 판정된 경계를 평문 추측이
  //    덮어쓰면 지금 잘 되는 공고가 망가진다. 조건 (a) 30자 이하 (b) alias 계열 **정확히 1개**
  //    (c) 그 줄 하나가 통째로 라벨. 종결 라벨 줄은 여기서도 경계로만 쓴다(필드는 안 채운다).
  if (marks.length < 2) {
    const lines = toText(iframeHtml).split("\n");
    const labelAt: { field: keyof typeof result; line: number }[] = [];
    const bounds: number[] = [];
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t || t.length > MAX_LABEL_LENGTH) return;
      if (TERMINATORS.has(flatten(t))) { bounds.push(i); return; }
      const flat = t.replace(/\s+/g, "");
      const hits = FLAT_ALIASES.filter(([, aliases]) => aliases.some((a) => flat.includes(a)));
      if (hits.length !== 1) return;
      labelAt.push({ field: hits[0][0], line: i });
      bounds.push(i);
    });
    for (const { field, line } of labelAt) {
      if (result[field]) continue;
      const end = bounds.find((b) => b > line) ?? lines.length;
      const content = lines.slice(line + 1, end).join("\n").trim();
      if (content) result[field] = content.slice(0, MAX_SECTION_LENGTH);
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

  // ld+json이 정본, 기존 정규식/meta 파싱은 폴백이다(ld가 없거나 깨졌을 때만 쓴다).
  const ld = parseJobPostingLd(html);
  const { career, deadlineText } = parseMetaFacts(html);
  const deadline = ldDateOnly(ld?.validThrough) ?? parseDeadline(deadlineText);
  // 6-3절 P0 — 절대 html.includes("마감")로 판정하지 않는다. 마감일 값이 과거 날짜일 때만 reject한다.
  if (deadline && deadline < todayKSTDateString()) return null;

  const postedAt = ldDateOnly(ld?.datePosted);
  const ldCompany = typeof ld?.hiringOrganization === "string"
    ? ld.hiringOrganization
    : ld?.hiringOrganization?.name;
  const employmentType = ldEmploymentType(ld?.employmentType) ?? (domTextAfterLabel(html, "고용형태") || null);
  const role = domTextAfterLabel(html, "모집분야", 250) || titleInfo.title;

  const sections = await fetchDescriptionSections(giNo);

  return {
    is_job_posting: true,
    company: ldCompany?.trim() || titleInfo.company,
    title: titleInfo.title,
    role,
    responsibilities: sections.responsibilities,
    required_text: sections.required_text,
    preferred_text: sections.preferred_text,
    career_requirement: career ?? "경력무관",
    deadline,
    posted_at: postedAt,
    // wanted.ts와 같은 규칙 — 소스가 게시일을 직접 준 경우에만 high다.
    date_confidence: postedAt ? "high" : "unknown",
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
