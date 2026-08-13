import { containsTerm } from "./filter.ts";

// 신입·주니어 Soft Priority(SkillPilot 채용공고 — 신입·주니어 우선 추천 추가 지침) — 직무(AI role) 분류와는
// 별개 축이다. career_requirement(신뢰도 최상) → required_text → title/role의 명시적 Senior/Lead/Principal만
// 순서대로 본다. preferred_text는 hard 판정에 아예 쓰지 않는다(3년 우대 한 줄만으로 경력직 단정 금지, 4절).
export type CareerTier = "entry" | "junior" | "experienced" | "unknown";

// 숫자가 들어간 term은 여기 두지 않는다 — "0년"을 plain substring으로 찾으면 "10년"/"20년" 안에서도
// 우연히 매칭된다(containsTerm의 단어경계 검사는 순수 ASCII 영숫자 term에만 적용되고, 한글이 섞인
// "0년" 같은 term은 안전하지 않다). 숫자 판정은 전부 tierFromYearsText의 정규식(\d+ 전체 캡처)으로만 한다.
const ENTRY_TERMS = ["신입 지원 가능", "신입 가능", "신입/경력", "신입·경력", "신입", "경력 무관", "경력무관", "채용연계형 인턴", "인턴"];
const EXPERIENCED_TERMS = ["Senior", "Lead", "Principal"];

// "N년 이상"/"N~M년"/"N년 이하"/"N년 내외" 같은 표현에서 최소 요구 연차를 뽑는다 — \d+가 전체 숫자를
// 캡처하므로 지시서가 예시로 든 숫자(1,2,3,4,5,7)에 없는 값(6년 이상 등)도, 두 자릿수도 안전하게 같은
// 규칙(0:entry, 1~2:junior, 3+:experienced)으로 판단한다.
function tierFromYearsText(text: string): CareerTier | null {
  const atLeast = text.match(/(\d+)\s*년\s*이상/);
  if (atLeast) {
    const years = Number(atLeast[1]);
    return years >= 3 ? "experienced" : years >= 1 ? "junior" : "entry";
  }
  const range = text.match(/(\d+)\s*[~\-]\s*(\d+)\s*년/);
  if (range) {
    const min = Number(range[1]);
    return min >= 3 ? "experienced" : min >= 1 ? "junior" : "entry";
  }
  const atMost = text.match(/(\d+)\s*년\s*(?:이하|내외)/);
  if (atMost) {
    const years = Number(atMost[1]);
    return years <= 2 ? "junior" : null; // "3년 이하" 같은 애매한 상한 표현은 확신 없이 unknown으로 둔다
  }
  // "0년"만 단독으로 쓰인 경우(3절 ENTRY 예시) — 앞자리가 숫자가 아닐 때만("10년"의 "0년"과 구분).
  if (/(?<![0-9])0\s*년/.test(text)) return "entry";
  return null;
}

function scanForTier(text: string): CareerTier | null {
  if (!text) return null;
  if (ENTRY_TERMS.some((t) => containsTerm(text, t))) return "entry";
  if (EXPERIENCED_TERMS.some((t) => containsTerm(text, t))) return "experienced";
  return tierFromYearsText(text);
}

export function classifyCareerTier(fields: {
  career_requirement: string | null;
  required_text: string;
  title: string;
  role: string;
}): CareerTier {
  const fromCareerRequirement = scanForTier(fields.career_requirement ?? "");
  if (fromCareerRequirement) return fromCareerRequirement;
  const fromRequiredText = scanForTier(fields.required_text);
  if (fromRequiredText) return fromRequiredText;
  // 본문에 명확한 신호가 없으면 title/role의 명시적 Senior/Lead/Principal만 신뢰한다(preferred_text는 안 본다).
  const titleText = `${fields.title} ${fields.role}`;
  if (EXPERIENCED_TERMS.some((t) => containsTerm(titleText, t))) return "experienced";
  return "unknown";
}

export function isEntryFriendly(tier: CareerTier): boolean {
  return tier === "entry" || tier === "junior";
}
