// 파싱 결과의 **품질 판정**만 담는 순수 모듈 — 네트워크도 AI도 import하지 않는다.
// 🔴 Dashboard(클라이언트 컴포넌트)가 여기서 hasUsableBody를 가져다 쓴다. 그래서 이 파일에
//    @google/genai를 끌고 오는 import를 절대 넣지 마라 — 클라이언트 번들에 모델 SDK가 실린다.
//    LLM 정규화는 normalize.ts에 있고, 그쪽이 이 파일을 import한다(반대 방향은 없다).

export type BodySections = {
  responsibilities: string;
  required_text: string;
  preferred_text: string;
};

// 불릿·번호·구분선만 남은 값을 "내용 있음"으로 세면 안 된다. jobkorea 실측에서 "ㆍ" 한 글자,
// "- " 두 글자짜리 섹션이 실제로 저장돼 있었다(라벨 바로 뒤 장식 줄만 잡힌 경우).
const DECOR_ONLY = /[\s▶▷■□●○◆◇★☆·•ㆍ※–—*\-_=[\]()·:：.,]/g;
export function flattenForCompare(text: string): string {
  return text.replace(/\s+/g, "");
}
function meaningfulLength(text: string): number {
  return text.replace(DECOR_ONLY, "").length;
}

// 값이 있긴 한데 쓸모가 없는 상태. 10자는 "ㆍ학력 : 학사" 같은 최소 실물보다 짧은 자리로 잡았다.
export const MIN_SECTION_LENGTH = 10;
export function isDegenerateSection(text: string | null | undefined): boolean {
  return meaningfulLength(text ?? "") < MIN_SECTION_LENGTH;
}

// 세 필드가 전부 쓸모없으면 화면에 보여줄 본문이 하나도 없다(= 이미지 공고).
export function hasUsableBody(s: { responsibilities?: string | null; required_text?: string | null; preferred_text?: string | null } | null | undefined): boolean {
  if (!s) return false;
  return !isDegenerateSection(s.responsibilities) || !isDegenerateSection(s.required_text) || !isDegenerateSection(s.preferred_text);
}

// LLM을 부를 가치가 있는 최소 본문 길이. jobkorea.ts의 MIN_FALLBACK_BODY_LENGTH와 같은 근거다 —
// 실측에서 이미지 공고(셸 32자)와 실제 공고(2,000자+)가 60배 떨어져 있었다.
export const MIN_REAL_BODY_LENGTH = 200;

// 한 섹션이 본문의 이 비율 이상을 차지하면 "섹션 분리에 실패하고 통째로 삼킨 것"으로 본다.
// 실측: 텍스트 공고 71건 중 36건이 responsibilities 한 칸에 본문 90% 이상을 담고 있었다.
const SWALLOW_RATIO = 0.9;

// ponytail: 판정이 소스 중립이다 — 원티드/점핏처럼 소스가 섹션을 직접 선언하는 공고도
// requirements/preferred가 비어 있으면 "responsibilities가 본문의 100%"라 LOW로 떨어져 LLM을
// 한 번 쓴다. 실측상 그 비율이 문제가 될 만큼 크면 소스별로 게이트를 나눠라(지금은 근거 없음).
// 파싱을 믿을 수 있나. LOW면(그리고 본문이 실제로 있으면) normalize.ts가 LLM 재추출을 시도한다.
export function parseConfidence(sections: BodySections, bodyText: string): "high" | "low" {
  const values = [sections.responsibilities, sections.required_text, sections.preferred_text];
  if (values.every((v) => !v?.trim())) return "low";           // 세 필드 전부 빈 값
  if (isDegenerateSection(sections.responsibilities)) return "low"; // 주요업무가 비면 사실상 빈 카드
  if (values.some((v) => v?.trim() && isDegenerateSection(v))) return "low"; // "ㆍ"만 남은 필드
  const bodyLen = flattenForCompare(bodyText).length;
  if (bodyLen > 0 && values.some((v) => flattenForCompare(v ?? "").length >= bodyLen * SWALLOW_RATIO)) return "low";
  return "high";
}
