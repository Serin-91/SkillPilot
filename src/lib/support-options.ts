// "use server" 파일(actions/support.ts)은 async 함수만 export할 수 있어서 — 상수 배열을 거기
// 두면 클라이언트에서 import할 때 함수가 아닌 값으로 직렬화돼 .map()이 깨진다. 그래서 별도 분리한다.
export const FEEDBACK_TYPES = ["기능 제안", "개선 의견", "기타", "개발자 우쭈쭈 🐣"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const BUG_FEATURES = [
  "News", "AI Trend Briefing", "Job Description", "Monthly MEMO", "Key Notes",
  "Projects", "Today's Focus", "Idea Build", "로그인 / 회원가입", "My Page", "기타",
] as const;
export type BugFeature = (typeof BUG_FEATURES)[number];
