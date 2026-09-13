import { Type } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGenAIClient } from "./client";

// Idea Build 전용 모델 — 하루 2회로 줄인 대신 다른 기능(뉴스/채용공고 등, gemini-3.5-flash-lite)보다
// 상위 품질 모델을 쓴다.
// 모델명은 의도적으로 지정한 값이다("3.5"/"3.6" 등 표준 세대와 다르게 보여도 오탈자·버그 아님) —
// 코드 리뷰/버그 점검 시 다시 지적하지 말 것.
const IDEA_BUILD_MODEL = "gemini-3.6-flash";

// Idea Build가 실제로 다루는 상태 — "완료"는 후보에서 제외한다
const IDEA_CANDIDATE_STATUSES = ["아이디어", "기획안작성", "개발중"] as const;

// 기술은 이름만으로는 왜 필요한지 알 수 없어 이번 구현에서의 용도를 함께 받는다(수정지침 7.6절).
// 구 스키마(string[])로 저장된 row도 화면에서 그대로 읽히도록 필드명은 requiredTechnologies를 유지한다.
export type IdeaTech = { name: string; reason: string };

export type IdeaResult = {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  selectionMode: "specific" | "random";
  recommendationTitle: string;
  reason: string;
  whatToBuild: string;
  developmentSteps: string[];
  implementationFlow: string[];
  requiredTechnologies: IdeaTech[];
  completionCriteria: string[];
};

type ProjectRow = { id: string; title: string; summary: string | null; status: string; content_md: string | null };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recommendationTitle: { type: Type.STRING },
    reason: { type: Type.STRING },
    whatToBuild: { type: Type.STRING },
    developmentSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    implementationFlow: { type: Type.ARRAY, items: { type: Type.STRING } },
    requiredTechnologies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { name: { type: Type.STRING }, reason: { type: Type.STRING } },
        required: ["name", "reason"],
      },
    },
    completionCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["recommendationTitle", "reason", "whatToBuild", "developmentSteps", "implementationFlow", "requiredTechnologies", "completionCriteria"],
};

type ModelOutput = {
  recommendationTitle: string; reason: string; whatToBuild: string;
  developmentSteps: string[]; implementationFlow: string[];
  requiredTechnologies: IdeaTech[]; completionCriteria: string[];
};

const isFilledString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isStringArray = (v: unknown, min: number, max: number): v is string[] =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(isFilledString);

// 수정지침 14절 — 필수 필드가 빠졌거나 개수 범위를 벗어나면 실패로 보고 한 번만 재시도한다(무한 재시도 금지).
function isValidModelOutput(v: unknown): v is ModelOutput {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isFilledString(o.recommendationTitle) &&
    isFilledString(o.reason) &&
    isFilledString(o.whatToBuild) &&
    isStringArray(o.developmentSteps, 3, 5) &&
    isStringArray(o.implementationFlow, 2, 10) &&
    Array.isArray(o.requiredTechnologies) && o.requiredTechnologies.length > 0 &&
    o.requiredTechnologies.every((t) => !!t && typeof t === "object" && isFilledString((t as IdeaTech).name)) &&
    isStringArray(o.completionCriteria, 2, 4)
  );
}

// 모든 상태 공통 System Prompt
const COMMON_IDEA_BUILD_PROMPT = `당신은 SkillPilot의 Idea Build 엔진입니다.

당신의 역할은 사용자가 이미 저장한 프로젝트를 바탕으로,
현재 프로젝트 상태에서 가장 가치 있는 다음 발전 방향 단 하나를 찾아
실제로 개발 작업으로 옮길 수 있을 정도로 구체화하는 것입니다.

이 기능은 새로운 무관 프로젝트를 창작하는 아이디어 생성기가 아닙니다.
반드시 제공된 프로젝트의 상태, 프로젝트명, 한 줄 요약, 상세 내용만 근거로 판단하세요.

[절대 규칙]
1. 한 번의 응답에서 추천 방향은 정확히 1개만 제시합니다.
2. 프로젝트에 없는 기능, 구현 상태, 문제, 버그, 사용자의 기술 경험을 사실처럼 만들어내지 않습니다.
3. 입력에 없는 정보가 필요하더라도 추측으로 채우지 않습니다.
4. 현재 프로젝트의 핵심 목적을 임의로 변경하지 않습니다.
5. 기존 프로젝트와 직접 관련 없는 범용 아이디어를 추천하지 않습니다.
6. 개인/학습 프로젝트 범위를 지나치게 벗어나는 대형 상용 서비스 수준의 확장을 기본 답으로 제시하지 않습니다.
7. 사용자가 이미 결정한 기능이나 방향을 이유 없이 폐기하지 않습니다.
8. 추천 이유에는 반드시 제공된 프로젝트 내용에서 확인한 구체적인 근거를 포함합니다.
9. 이미 존재하는 기능을 새로운 아이디어인 것처럼 다시 추천하지 않습니다.
10. 예상 필요 기술에는 이 추천을 실제 구현하는 데 직접 필요한 기술만 포함합니다.
11. 기존 프로젝트의 기술 스택으로 해결 가능한 경우 이를 우선하며, 불필요한 새 라이브러리나 기술을 추가하지 않습니다.
12. 여러 대안을 나열하지 말고 현재 프로젝트에서 가치가 가장 높은 하나만 선택합니다.

[중요: 구체성 기준]

다음 수준의 추상적인 표현만으로 설명을 끝내지 마세요.
- 입력 검증 구현 / API 로직 개선 / 프롬프트 최적화
- 사용자 경험 개선 / 데이터 관리 개선 / 성능 최적화

이러한 개념을 사용해야 한다면 반드시
- 어떤 데이터를 / 어느 시점에서 / 어떤 조건으로 / 어떻게 처리하고
- 결과적으로 무엇이 달라지는지
까지 설명하세요.

결과를 읽은 사용자가 "그래서 다음 개발 작업으로 정확히 무엇을 만들면 되는가?"를 이해할 수 있어야 합니다.

[출력 구조]
1. recommendationTitle
   - 추천 방향 1개. 짧고 명확하게, 무엇을 개선하는지 알 수 있게 작성합니다.
   - 나쁜 예: "LLM 요청 최적화 로직 구축", "데이터 처리 개선", "사용자 경험 개선"
   - 좋은 예: "불완전한 프로젝트 입력은 AI 호출 전에 차단하는 Request Guard 추가"
2. reason
   - 왜 이 방향이 필요한지, 반드시 현재 프로젝트 내용과 직접 연결해 설명합니다.
   - "현재 프로젝트에는 A가 정의되어 있지만 B는 아직 구체화되어 있지 않습니다" 형태를 권장합니다.
   - "요즘 트렌드라서", "많은 서비스가 사용해서" 같은 외부 근거는 금지합니다.
3. whatToBuild
   - 실제로 무엇을 만들면 되는지 사용자 또는 시스템 동작 기준으로 구체화합니다.
4. developmentSteps
   - 실제 개발 작업 단위 3~5개. 추상적인 키워드 나열은 금지합니다.
   - 나쁜 예: "입력 검증", "프롬프트 최적화"
   - 좋은 예: "project_idea의 title/summary/content_md 중 실제 값이 있는 필드를 검사한다"
5. implementationFlow
   - 입력 → 처리 → 판단 → 결과 구조의 간단한 데이터 흐름을 단계별 문자열 배열로 제시합니다.
   - 이번 추천에 필요하지 않은 단계는 억지로 넣지 않습니다.
6. requiredTechnologies
   - name(기술명)과 reason(이번 구현에서 왜 필요한지)을 함께 제시합니다.
   - SkillPilot은 Next.js·TypeScript·Supabase·Gemini API를 사용합니다. 기존 스택으로 해결 가능하면 그것을 우선하고,
     OpenAI 전용 도구처럼 현재 스택과 무관한 기술을 근거 없이 추천하지 마세요.
7. completionCriteria
   - 구현 완료 여부를 판단할 수 있는 테스트 가능한 조건 2~4개.

응답은 충분히 구체적이어야 하지만 프로젝트 전체 구현 명세서를 생성하듯 과도하게 길어서는 안 됩니다.`;

// 수정지침 11절 — 상태별 Prompt 끝에 공통으로 붙이는 구체성 규칙
const STATUS_PROMPT_SUFFIX = `

[출력 구체성 추가 규칙]

선택한 발전 방향을 단순한 아이디어 설명에서 끝내지 마세요.
사용자가 바로 다음 개발 작업을 판단할 수 있도록
- 무엇을 만들지 / 어떤 데이터 또는 기능을 사용할지 / 핵심 구현 단계
- 구현 흐름 / 필요한 기술과 이유 / 완료 기준
까지 구체화하세요.

단, 입력에 없는 현재 구현 상태를 만들어내서는 안 됩니다.`;

// 상태별 전용 지침
const STATUS_PROMPTS: Record<string, string> = {
  "아이디어": `[현재 프로젝트 상태: 아이디어]

이 프로젝트는 아직 초기 아이디어 단계입니다.

당신의 핵심 역할은 이 아이디어의 중심을 유지하면서,
막연한 생각을 실제로 만들 수 있는 프로젝트 방향으로 한 단계 구체화하는 것입니다.

다음 순서로 판단하세요.
1. 프로젝트명, 한 줄 요약, 상세내용에서 사용자가 만들고 싶은 핵심 대상을 파악합니다.
2. 현재 아이디어에서 가장 중요한 가치 또는 문제를 찾습니다.
3. 실제 프로젝트로 만들기 위해 현재 가장 모호하거나 비어 있는 부분을 찾습니다.
4. 여러 방향을 나열하지 말고 가장 효과적인 구체화 방향 하나를 선택합니다.
5. 개인 또는 학습 프로젝트 규모에서 실제 구현 가능한 수준인지 확인합니다.

추천은 다음 종류 중 현재 프로젝트에 가장 필요한 형태가 될 수 있습니다.
- 핵심 사용자 흐름 구체화 / 문제 정의 명확화 / 핵심 기능 중심축 결정
- MVP 범위 축소 또는 정리 / 기존 아이디어와 직접 연결되는 차별점 구체화 / 구현 가능한 서비스 흐름 제안

주의:
- 새로운 별도 프로젝트를 만들어내지 마세요.
- 프로젝트명만 보고 내용을 추측하지 마세요.
- 아직 초기 아이디어라는 이유로 수많은 기능을 한 번에 추가하지 마세요.
- 인프라, MLOps, 대규모 아키텍처처럼 현재 단계보다 지나치게 앞선 제안을 우선하지 마세요.
- 상세내용이 없다면 제목과 한 줄 요약에서 확인 가능한 범위까지만 판단하세요.`,

  "기획안작성": `[현재 프로젝트 상태: 기획안작성]

이 프로젝트는 이미 기본 아이디어가 정해졌고 상세 기획을 작성하거나 정리하는 단계입니다.

당신의 역할은 새로운 아이디어를 다시 만드는 것이 아니라,
현재 기획을 읽고 가장 중요한 빈틈 또는 보강 지점 하나를 찾아 개선 방향을 제안하는 것입니다.

다음 순서로 판단하세요.
1. 상세내용에서 이미 결정된 핵심 목적과 기능을 먼저 파악합니다.
2. 이미 결정된 사항은 그대로 존중합니다.
3. 사용자 흐름, 기능 연결, 데이터 흐름, 범위, 예외 처리 중 현재 가장 불명확하거나 취약한 부분을 찾습니다.
4. 그중 실제 구현에 들어가기 전에 해결 가치가 가장 높은 하나를 선택합니다.
5. 기존 기획 전체를 다시 설계하지 않고 최소한의 확장 또는 보강으로 해결 가능한 방향을 우선합니다.

추천 가능한 관점: 누락된 핵심 UX Flow / 기능 간 연결 부족 / 모호한 기능 정의 / 너무 큰 MVP 범위 /
중요한 데이터 흐름 누락 / 실패·예외 상황 미정의 / 이미 정의된 핵심 기능의 취약한 부분

절대 하지 말아야 할 것:
- 기획안에 이미 존재하는 기능을 새 아이디어처럼 다시 제안
- 사용자가 제외한 기능 재추가 / 현재 프로젝트 목적을 변경 / 대규모 신규 기능 묶음을 추가
- 기획에 없는 구현 완료 상태를 가정 / 상세내용을 충분히 읽지 않고 제목이나 한 줄 요약만으로 판단

추천 이유를 작성할 때는 가능한 경우 "현재 기획에는 A가 있지만 B가 아직 정의되지 않았다"처럼
입력 내용과 직접 연결해서 설명하세요.`,

  "개발중": `[현재 프로젝트 상태: 개발중]

이 프로젝트는 현재 실제 구현이 진행 중입니다.

당신의 역할은 새로운 프로젝트 아이디어를 제안하는 것이 아니라,
현재 개발 중인 프로젝트의 목적과 이미 정의된 기능을 유지하면서
실제 가치 또는 완성도를 높일 수 있는 다음 개선 방향 하나를 찾는 것입니다.

다음 순서로 판단하세요.
1. 현재 상세내용에서 이미 구현되었거나 구현 예정인 핵심 기능을 파악합니다.
2. 기능들이 서로 어떤 흐름으로 연결되는지 확인합니다.
3. 프로젝트의 핵심 가치가 실제 사용자 흐름에서 충분히 살아 있는지 봅니다.
4. 중복 과정, 연결 부족, 사용성 문제, 활용되지 않는 데이터, 핵심 기능 완성도 중 가장 가치가 높은 개선 지점을 찾습니다.
5. 현재 구조를 크게 흔들지 않고 적용 가능한 방향을 우선합니다.

추천 가능한 관점: 기존 핵심 기능 간 연결 강화 / 사용자 흐름 단순화 / 중복 과정 제거 /
현재 기능 활용도 증가 / 핵심 기능 완성도 향상 / 기존 데이터의 더 나은 활용 / 프로젝트 목적에 직접 연결되는 작은 기능 보강

절대 하지 말아야 할 것:
- 프로젝트를 전혀 다른 서비스로 바꾸기 / 대규모 리팩터링을 기본 답으로 제시 / 사용 중인 기술 스택을 이유 없이 교체
- 입력에 없는 버그, 성능 저하, 구현 여부를 사실처럼 단정 / 포트폴리오용으로 기술·기능 추가
- 이미 구현 중인 핵심 기능을 무시하고 처음부터 다시 만들라고 제안

추천 이유는 반드시 현재 프로젝트 내용에서 관찰한 구조 또는 기능을 근거로 작성하세요.`,
};

// User Prompt
function buildUserPrompt(project: ProjectRow, avoidHeadlines: string[]): string {
  const avoidBlock = avoidHeadlines.length
    ? `\n\n이미 제안했던 추천 방향이다. 이번에는 이것들과 뚜렷하게 다른 각도로 제안하라:\n${avoidHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "";
  return `다음 프로젝트를 분석해 Idea Build 결과를 생성하세요.

[프로젝트 상태]
${project.status}

[프로젝트명]
${project.title}

[한 줄 요약]
${project.summary?.trim() || "작성되지 않음"}

[상세 내용]
${project.content_md?.trim() || "작성되지 않음"}

위 프로젝트의 현재 상태에 맞춰, 가장 가치 있는 다음 발전 방향 정확히 1개만 제안하세요.
입력에 없는 사실은 추측하지 마세요.${avoidBlock}`;
}

async function fetchProjectById(supabase: SupabaseClient, userId: string, projectId: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("project_idea")
    .select("id, title, summary, status, content_md")
    .eq("user_id", userId)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProjectRow | null) ?? null;
}

// Random 후보 — 완료 제외. LLM에는 넘기지 않고 서버 Math.random으로만 고른다
async function fetchRandomCandidates(supabase: SupabaseClient, userId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("project_idea")
    .select("id, title, summary, status, content_md")
    .eq("user_id", userId)
    .in("status", IDEA_CANDIDATE_STATUSES);
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

// pinnedProjectId — random 생성이 실패한 뒤 재시도할 때, 같은 프로젝트로만 다시 시도하기 위한 값이다.
// 값이 있으면 새로 뽑지 않고 그 프로젝트를 그대로 다시 쓴다("Random을 다시 돌리지 말 것" 요구사항).
export type IdeaGenerationMode =
  | { kind: "specific"; projectId: string }
  | { kind: "random"; pinnedProjectId?: string };

async function callModel(project: ProjectRow, avoidHeadlines: string[]): Promise<ModelOutput | null> {
  const statusPrompt = STATUS_PROMPTS[project.status];
  const systemPrompt = `${COMMON_IDEA_BUILD_PROMPT}\n\n${statusPrompt ? statusPrompt + STATUS_PROMPT_SUFFIX : ""}`;
  const ai = getGenAIClient();
  const response = await ai.models.generateContent({
    model: IDEA_BUILD_MODEL,
    contents: `${systemPrompt}\n\n${buildUserPrompt(project, avoidHeadlines)}`,
    // 재생성해도 매번 같은 결과만 나오던 문제 — temperature 기본값이 낮아 입력이 짧고 단순하면
    // 사실상 결정적으로 수렴한다. 다양성을 위해 명시적으로 올린다 (직전 결과 회피 지시와 함께 사용)
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 1.15 },
  });
  const parsed = JSON.parse(response.text ?? "{}");
  return isValidModelOutput(parsed) ? parsed : null;
}

// project_idea 한 건을 상태에 맞는 전략으로 분석해 발전 방향 1개를 만든다.
// project_id/title/status/selection_mode는 모델이 아니라 서버가 채운다(환각 방지).
export async function generateIdeaDirection(
  supabase: SupabaseClient, userId: string,
  mode: IdeaGenerationMode = { kind: "random" }, avoidHeadlines: string[] = [], avoidProjectId: string | null = null,
  // Gemini 호출이 실패해도 어떤 프로젝트로 시도했는지 호출자(runIdea)가 알 수 있도록 넘겨준다 —
  // random 모드 재시도를 같은 프로젝트로 고정하려면 실패 시점에도 project id가 필요하다.
  onProjectResolved?: (project: { id: string; title: string }) => void
): Promise<IdeaResult | null> {
  let project: ProjectRow | null;
  let selectionMode: "specific" | "random";

  if (mode.kind === "specific") {
    project = await fetchProjectById(supabase, userId, mode.projectId);
    selectionMode = "specific";
  } else {
    selectionMode = "random";
    project = mode.pinnedProjectId ? await fetchProjectById(supabase, userId, mode.pinnedProjectId) : null;
    if (project?.status === "완료") project = null;
    // pin된 프로젝트가 그 사이 삭제/완료됐으면 pin이 죽은 채로 같은 에러가 무한 반복되므로, 새로 랜덤을 뽑는다.
    if (!project) {
      let candidates = await fetchRandomCandidates(supabase, userId);
      if (avoidProjectId && candidates.length > 1) {
        const withoutLast = candidates.filter((c) => c.id !== avoidProjectId);
        if (withoutLast.length > 0) candidates = withoutLast;
      }
      project = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }
  }
  // 완료 프로젝트는 Idea Build 대상에서 제외한다 — 직접 선택 UI에서도 걸러주지만 서버에서도 한 번 더 막는다
  if (!project || project.status === "완료") return null;
  onProjectResolved?.({ id: project.id, title: project.title });

  // 최소 필드 검증에 실패하면 한 번만 재시도하고, 그래도 안 되면 실패로 처리한다(무한 재시도 금지)
  const output = (await callModel(project, avoidHeadlines)) ?? (await callModel(project, avoidHeadlines));
  if (!output) return null;

  return {
    projectId: project.id,
    projectTitle: project.title,
    projectStatus: project.status,
    selectionMode,
    recommendationTitle: output.recommendationTitle,
    reason: output.reason,
    whatToBuild: output.whatToBuild,
    developmentSteps: output.developmentSteps.slice(0, 5),
    implementationFlow: output.implementationFlow,
    requiredTechnologies: output.requiredTechnologies.map((t) => ({ name: t.name, reason: t.reason ?? "" })),
    completionCriteria: output.completionCriteria.slice(0, 4),
  };
}
