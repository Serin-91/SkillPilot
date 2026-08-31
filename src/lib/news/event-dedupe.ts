import type { Candidate } from "./rss.ts";
import { scoreArticle } from "./filter.ts";

// 🔴🔴 같은 사건이 후보 슬롯을 잡아먹는 것을 막는다 — **출처별 배분(distributeByScore) 전에** 돈다.
//
// 왜 여기인가 (2026-08-31 라이브 전수조사):
//   "하루 4건을 못 채운다"가 몇 주째 반복됐는데, 원인은 좋은 기사가 없어서가 아니라
//   **후보 30칸이 30개의 서로 다른 사건이 아니어서**였다. 실측한 겹침:
//     · 앤트로픽 소니·워너 저작권 소송 — AI타임스 1 + TechCrunch 1 = 2칸, 1개 사건
//     · 이해민 AI수석 인사          — ZDNet 3 + AI타임스 1     = 4칸, 1개 사건
//   하필 그 칸들이 대부분 **AI타임스가 아닌 후보**라, 모델이 중복을 걷어내면 다른 매체 쪽에
//   고를 것이 남지 않는다 → 최종 동일 출처 상한(2)에서 그대로 멈춰 2~3건으로 끝난다.
//
// 그래서 손대는 곳은 **후보 풀의 실질 다양성**뿐이다. 품질 기준(SYSTEM_PROMPT 1~5,
// 기관 보도자료 제외 규칙)과 최종 동일 출처 상한(MAX_SELECTED_PER_SOURCE)은 **하나도 안 건드린다.**
//
// ⚠️ 기존 중복 제거는 그대로 남는다. 이건 그 앞에 한 겹 더 두는 것이고, 최종 선택 뒤의
//    `storyKey` 검사(select.ts)는 **안전장치로 계속 유지한다** — 여기서 못 접은 것을 거기서 잡는다.

// 사건 판정에 **의미 없는** 낱말. 이걸 안 빼면 "AI ... 공개" 두 기사가 서로 같은 사건이 된다
// (실측: 통과 51건 중 제목에 "공개"가 들어간 것이 9건).
const STOPWORDS = new Set([
  "ai", "인공지능", "생성형", "기술", "서비스", "개발", "개발자", "기업", "산업", "시장",
  "공개", "출시", "발표", "도입", "적용", "지원", "강화", "확대", "추진", "진행", "예정",
  "위해", "통해", "관련", "대한", "이번", "올해", "내년", "최대", "최초", "새로운",
  "the", "a", "an", "to", "of", "for", "with", "and", "in", "on", "at", "is", "its",
  "new", "how", "why", "what", "you", "we", "us", "it", "as", "by", "from", "that", "this",
]);

// 🔴 **국문/영문 표기를 같은 id로 접는다.** 이게 없으면 교차언어 중복을 절대 못 잡는다 —
// "소니·워너, 앤트로픽에 저작권 소송"과 "Sony Music, Warner sue Anthropic"은 **공유 낱말이 0개**다.
//
// 🔴🔴 그리고 **제품은 만든 회사로 접는다**(클로드→anthropic, 제미나이→google). 이걸 안 하면
//    회사+자사제품이 늘 같이 등장해 "고유명사 2개 공유"가 **아무 의미가 없어진다.**
//    실측으로 실제 오병합이 나왔다(2026-08-31 1차 구현): 구글 제미나이 기사 4건
//    (제미나이 라이브 에이전트 / 제미나이 노트북 / 제미나이 3.8 플래시 / 제미나이 옴니 1.1)이
//    {google, gemini} 2개를 공유한다는 이유로 **서로 다른 4개 사건이 하나로 묶였다.**
//    회사로 접으면 공유 entity가 {google} 1개가 되어 아래 ①에 안 걸린다.
// ⚠️ 목록은 실제 후보에 등장한 것만 넣는다 — 추측으로 늘리면 엉뚱한 병합이 생긴다.
const ENTITY_ALIASES: [string, string[]][] = [
  ["anthropic", ["anthropic", "앤트로픽", "앤스로픽", "claude", "클로드", "opus", "오퍼스"]],
  ["openai", ["openai", "오픈ai", "chatgpt", "챗gpt", "gpt", "codex", "코덱스"]],
  ["google", ["google", "구글", "gemini", "제미나이", "제미니"]],
  ["meta", ["meta", "메타", "llama", "라마"]],
  ["microsoft", ["microsoft", "마이크로소프트", "copilot", "코파일럿"]],
  ["xai", ["grok", "그록", "xai", "머스크", "musk"]],
  ["nvidia", ["nvidia", "엔비디아"]],
  ["apple", ["apple", "애플"]],
  ["amazon", ["amazon", "아마존", "aws"]],
  ["tesla", ["tesla", "테슬라"]],
  ["waymo", ["waymo", "웨이모"]],
  ["samsung", ["samsung", "삼성"]],
  ["huggingface", ["hugging face", "huggingface", "허깅페이스", "허깅 페이스"]],
  ["deepseek", ["deepseek", "딥시크"]],
  ["mistral", ["mistral", "미스트랄"]],
  ["tencent", ["tencent", "텐센트"]],
  ["sony", ["sony", "소니"]],
  ["warner", ["warner", "워너"]],
  ["kt", ["kt"]],
  ["naver", ["naver", "네이버"]],
  ["kakao", ["kakao", "카카오"]],
  ["lg", ["lg", "엘지"]],
];

// entity로 이미 세는 표기는 내용어에서 **뺀다.** 안 빼면 같은 사실이 두 번 세어져
// "고유명사 1개 + 내용어 2개"(아래 ②)가 사실상 "고유명사 1개"가 된다 — 위 제미나이 오병합이
// entity를 회사로 접은 뒤에도 ②로 되살아난다(실측으로 확인하고 이 줄을 넣었다).
const ALIAS_WORDS = new Set(ENTITY_ALIASES.flatMap(([, a]) => a.flatMap((x) => x.split(" "))));

// 한국어 조사. 붙어 있으면 "이해민"과 "이해민은"이 다른 낱말이 된다 — 후속 보도를 못 알아본다.
// 형태소 분석을 들이지 않고 흔한 것만 뗀다. 3글자 이상일 때만 떼서 "정부"가 "정"이 되는 일을 막는다.
const PARTICLES = ["에서", "으로", "에게", "이라", "라고", "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만"];

// 같은 사건이라도 후속 보도가 며칠 뒤에 나온다. 그렇다고 창을 넓게 잡으면 "앤트로픽이 또 뭘 했다"
// 류의 다른 사건이 묶인다. **후보 단계**는 50건 중 하나를 잘못 지우는 비용이 작으므로 좁게 간다.
const SAME_EVENT_HOURS = 48;
// 🔴 **최종 4건을 검사할 때는 창을 lookback 전체로 넓힌다.** 두 단계는 비용이 정반대다:
//   · 후보 단계 — 잘못 합치면 멀쩡한 기사가 풀에서 사라진다. 풀은 50건이니 보수적으로.
//   · 최종 단계 — 못 잡으면 **같은 뉴스가 화면에 두 장** 뜬다. 비교 대상은 4건뿐이고
//     이미 조직 1곳 + 내용어 2개를 공유한다는 조건을 통과한 쌍이라 애매하지 않다.
// 실측(2026-08-31)이 이 값을 정했다: "앤트로픽, 펜타곤 공급망 리스크 지정 소송서 첫 승소"(TechCrunch,
// 8/28 12:46Z)와 "미 연방법원, 앤트로픽의 국가안보상 공급망 위험 지정 조치에 위법 판결"(ZDNet,
// 8/31 01:02Z)이 **시차 60.3시간**이라 48시간 창을 그냥 통과해 두 장 다 실렸다.
// lookback이 최대 5일이므로 후보로 함께 존재할 수 있는 최대 시차가 곧 이 값이다.
export const FINAL_SAME_EVENT_HOURS = 5 * 24;

function normalize(title: string): string {
  return (title ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stripParticle(w: string): string {
  if (w.length < 3) return w;
  for (const p of PARTICLES) {
    if (w.length - p.length >= 2 && w.endsWith(p)) return w.slice(0, -p.length);
  }
  return w;
}

// 제목에서 뜻을 가진 낱말만. 형태소 분석기 없이도 충분한 이유: 여기서 필요한 것은
// "두 제목이 같은 사건어를 여럿 공유하는가"뿐이고, 판정은 **보수적이어야** 하기 때문이다.
export function contentWords(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalize(title).split(" ")) {
    if (raw.length < 2 || ALIAS_WORDS.has(raw)) continue;
    const w = stripParticle(raw);
    if (w.length >= 2 && !STOPWORDS.has(w) && !ALIAS_WORDS.has(w)) out.add(w);
  }
  return out;
}

// 제목에 등장하는 조직을 표기·제품명과 무관한 id로.
export function entitiesOf(title: string): Set<string> {
  const text = normalize(title);
  const out = new Set<string>();
  for (const [id, aliases] of ENTITY_ALIASES) {
    if (aliases.some((a) => text.includes(a))) out.add(id);
  }
  return out;
}

function sharedCount<T>(a: Set<T>, b: Set<T>): number {
  let n = 0;
  for (const v of a) if (b.has(v)) n++;
  return n;
}

// 🔴 **보수적으로** 판정한다 — 애매하면 합치지 않는다. 잘못 합치면 멀쩡한 기사가 후보에서
//    통째로 사라지는데, 안 합치면 지금과 같을 뿐이다. 손실이 대칭이 아니다.
// 세 갈래 중 하나라도 맞고 + 게시일이 48시간 안이면 같은 사건으로 본다:
//   ① 서로 다른 조직 2곳 이상 공유 — 교차언어 쌍이 여기서 잡힌다(소니+워너+앤트로픽 = 3).
//      조직 셋이 우연히 한 제목에 같이 나올 일은 드물다.
//   ② 조직 1곳 + 내용어 2개       — 같은 언어의 후속 보도
//   ③ 내용어 3개 이상            — 조직명이 없는 사건(인사·정책 등)
// 조직 **1곳만** 공유하는 것은 합치지 않는다. "앤트로픽 MHS 공개"와 "앤트로픽 정렬 연구"는
// 서로 다른 사건인데 둘 다 anthropic 하나만 공유한다 — 그 선을 넘으면 오병합이 시작된다.
export function isSameEvent(a: Candidate, b: Candidate): boolean {
  return isSameEventTitles(a.title, a.publishedAt, b.title, b.publishedAt);
}

// 제목+게시일만으로 같은 판정을 한다. 최종 선정 결과(SelectedNewsItem)는 Candidate가 아니라
// published_at이 문자열이라 그대로 못 넘긴다 — 판정 로직을 두 벌로 만들지 않으려고 여기를 연다.
export function isSameEventTitles(
  aTitle: string, aAt: Date | string, bTitle: string, bAt: Date | string,
  maxHours: number = SAME_EVENT_HOURS,
): boolean {
  const a = { title: aTitle, publishedAt: new Date(aAt) } as Candidate;
  const b = { title: bTitle, publishedAt: new Date(bAt) } as Candidate;
  const hours = Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours > maxHours) return false;
  const ents = sharedCount(entitiesOf(a.title), entitiesOf(b.title));
  const words = sharedCount(contentWords(a.title), contentWords(b.title));
  if (ents >= 2) return true;
  if (ents >= 1 && words >= 2) return true;
  return words >= 3;
}

export type EventCluster = { representative: Candidate; dropped: Candidate[] };

// 대표 하나만 남긴다. **단일연결(single-link) 클러스터링을 쓰지 않는다** — A~B, B~C가 맞으면
// A~C가 아니어도 셋이 한 덩어리가 되어(연쇄) 무관한 기사가 사라진다. 점수가 가장 높은 것을
// 대표로 세우고 **대표와 직접 맞는 것만** 흡수하는 star 방식이라 연쇄가 구조적으로 없다.
// 대표 선정은 scoreArticle 순 — "같은 사건의 여러 기사 중 가장 품질 점수가 높은 하나"다.
export function clusterByEvent(candidates: Candidate[]): EventCluster[] {
  const ranked = [...candidates]
    .map((c, i) => ({ c, s: scoreArticle(c), i }))
    // 점수 동률이면 최신 기사를 대표로. 그것도 같으면 원래 순서를 지켜 결과가 결정적이게 한다.
    .sort((x, y) => y.s - x.s || y.c.publishedAt.getTime() - x.c.publishedAt.getTime() || x.i - y.i);

  const taken = new Set<number>();
  const clusters: EventCluster[] = [];
  for (const head of ranked) {
    if (taken.has(head.i)) continue;
    taken.add(head.i);
    const dropped: Candidate[] = [];
    for (const other of ranked) {
      if (taken.has(other.i)) continue;
      if (isSameEvent(head.c, other.c)) {
        taken.add(other.i);
        dropped.push(other.c);
      }
    }
    clusters.push({ representative: head.c, dropped });
  }
  return clusters;
}

// 파이프라인이 쓰는 입구. 대표만 남긴 목록과, 몇 건이 접혔는지(관리자 패널 수치용)를 돌려준다.
export function dedupeByEvent(candidates: Candidate[]): { kept: Candidate[]; merged: number } {
  const clusters = clusterByEvent(candidates);
  return {
    kept: clusters.map((c) => c.representative),
    merged: clusters.reduce((n, c) => n + c.dropped.length, 0),
  };
}
