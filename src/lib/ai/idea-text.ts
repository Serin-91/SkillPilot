import type { IdeaResult, IdeaTech } from "./idea";

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
