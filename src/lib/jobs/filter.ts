import { JOB_ROLE_CONFIG, JOB_ROLE_ORDER, type JobRole } from "./roles";

// 기존의 `LLM·AI 서비스 개발자` 단일 고정 목표와 특정 직군 제외 규칙은 폐기됐다.
// 이제 분류 기준은 로그인 회원이 선택한 관심 직무뿐이다(JOB_RECOMMENDATION_POLICY).

function scoreRole(text: string, role: JobRole): number {
  const lower = text.toLowerCase();
  return JOB_ROLE_CONFIG[role].keywords.filter((k) => lower.includes(k.toLowerCase())).length;
}

// 공고 제목·직무 설명·자격요건·기술 스택을 합친 텍스트로 가장 잘 맞는 직무를 고른다.
// 키워드가 딱 1개만 스치는 공고는 "단순 언급"으로 보고 적합 공고로 인정하지 않는다.
const MIN_SCORE = 2;

export function classifyJobRole(text: string, allowed: readonly JobRole[] = JOB_ROLE_ORDER): { role: JobRole; score: number } | null {
  let best: { role: JobRole; score: number } | null = null;
  for (const role of allowed) {
    const score = scoreRole(text, role);
    if (score >= MIN_SCORE && (!best || score > best.score)) best = { role, score };
  }
  return best;
}

// 특정 직무 기준 적합도 — quota 배분 시 직무별 정렬에 쓴다(0이면 그 직무엔 부적합).
export function roleFitScore(text: string, role: JobRole): number {
  const score = scoreRole(text, role);
  return score >= MIN_SCORE ? score : 0;
}
