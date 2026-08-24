import type { IdeaResult, IdeaTech } from "./idea";

// Idea Build 본문을 문장 단위로 끊는다 — Gemini가 한 단락에 여러 문장을 붙여 내려주면 읽기 어려워서
// 화면에서 문장마다 줄을 바꾼다(복사 텍스트는 ideaResultToText 그대로 두고 표시만 바꾼다).
//
// 마침표/물음표/느낌표 **뒤에 공백이 오는 경우만** 문장 경계로 본다. 뒤 공백을 요구하는 게 핵심이다 —
// 그게 없으면 "3.5배", "v1.2", "GPT-4.0" 같은 소수점·버전 표기에서 줄이 갈린다.
// 닫는 괄호·인용부호가 문장부호 뒤에 붙는 경우("...했다.)")도 같이 넘긴다.
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?][)\]"'”’]?)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// requiredTechnologies는 구 스키마에서 string[]였다 — 그때 저장된 History row도 그대로 열리도록
// 렌더링·복사 양쪽에서 {name, reason} 모양으로 맞춰준다. 이게 없으면 구 row에서 t.name이 undefined다.
export function ideaTechList(result: IdeaResult): IdeaTech[] {
  const raw = (result.requiredTechnologies ?? []) as unknown as (string | Partial<IdeaTech>)[];
  return raw
    .map((t) => (typeof t === "string" ? { name: t, reason: "" } : { name: t?.name ?? "", reason: t?.reason ?? "" }))
    .filter((t) => t.name.length > 0);
}

// 복사·"프로젝트에 저장"이 같은 텍스트를 쓴다. 새 필드(whatToBuild/implementationFlow/completionCriteria)는
// 구 row에는 없으므로 있을 때만 블록을 붙인다.
export function ideaResultToText(result: IdeaResult): string {
  const blocks = [
    `${result.selectionMode === "random" ? "Random Pick" : "직접 선택"} · ${result.projectStatus} · ${result.projectTitle}`,
    result.recommendationTitle,
    `왜 이 방향인가요?\n${result.reason}`,
  ];
  if (result.whatToBuild) blocks.push(`무엇을 만들면 되나요?\n${result.whatToBuild}`);
  blocks.push(`핵심 구현:\n${(result.developmentSteps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  if (result.implementationFlow?.length) blocks.push(`구현 흐름:\n${result.implementationFlow.join("\n↓\n")}`);
  const techs = ideaTechList(result);
  if (techs.length) blocks.push(`예상 필요 기술:\n${techs.map((t) => (t.reason ? `- ${t.name}: ${t.reason}` : `- ${t.name}`)).join("\n")}`);
  if (result.completionCriteria?.length) blocks.push(`완료 기준:\n${result.completionCriteria.map((c) => `• ${c}`).join("\n")}`);
  return blocks.join("\n\n");
}
