// 자체 점검: `node src/lib/project/template.check.ts`로 돌린다(Node 24 type stripping).
// 체크리스트 토글이 깨지면 여기서 바로 터진다.
import assert from "node:assert/strict";
import { toggleTaskItemInHtml, PROJECT_TEMPLATE_HTML } from "./template.ts";

// 체크리스트 토글 — 지정한 항목 하나만 뒤집고 나머지는 그대로
const toggled = toggleTaskItemInHtml(PROJECT_TEMPLATE_HTML, 1);
assert.equal((toggled.match(/data-checked="true"/g) ?? []).length, 1);
assert.equal((toggled.match(/data-checked="false"/g) ?? []).length, 2);
assert.equal(toggleTaskItemInHtml(toggled, 1), PROJECT_TEMPLATE_HTML, "다시 누르면 원래대로 돌아와야 한다");

console.log("template.check.ts OK");
