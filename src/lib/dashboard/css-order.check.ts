// 자체 점검: `npx tsx src/lib/dashboard/css-order.check.ts`
//
// 지키는 것: **분할된 dashboard CSS 8개의 import 순서 = 캐스케이드**.
// 옛 `dashboard.css`(11,102줄)를 줄 범위 그대로 잘랐고, 합치면 분할 전과 바이트 동일했다.
// 셀렉터 613개가 2회 이상 등장하므로(총 1,521회) 특이도가 같으면 **뒤에 온 것이 이긴다** —
// import 한 줄을 빠뜨리거나 순서를 바꾸면 그 613개의 승자가 조용히 바뀐다.
// `tsc`도 `npm run check`의 나머지도 이걸 못 잡는다. 그래서 여기서 센다.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIR = "src/app/styles/dashboard";
const ENTRY = "src/app/Dashboard.tsx";

const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith(".css")).sort();
const source = fs.readFileSync(ENTRY, "utf8");
const imported = [...source.matchAll(/^import\s+"\.\/styles\/dashboard\/([^"]+)";$/gm)].map((m) => m[1]);

// ① 디스크에 있는 파일은 전부 import돼 있어야 한다 (새 파일을 만들고 import를 잊는 사고)
assert.deepEqual(imported.slice().sort(), onDisk,
  `${DIR}의 CSS 파일과 ${ENTRY}의 import 목록이 다르다 — 파일만 만들고 import를 빠뜨렸거나 그 반대다`);

// ② import 순서는 파일명 숫자 접두 순서여야 한다 (= 옛 dashboard.css의 줄 순서)
assert.deepEqual(imported, onDisk,
  `import 순서가 파일명 순서와 다르다. 🔴 이 순서가 캐스케이드다 — 재배열하지 마라.\n  실제: ${imported.join(" → ")}`);

// ③ 숫자 접두가 1부터 빈틈없이 이어져야 한다 (잘린 조각이 통째로 빠진 것을 잡는다)
const nums = onDisk.map((f) => Number(f.slice(0, 2)));
assert.deepEqual(nums, nums.map((_, i) => i + 1),
  `파일명 숫자 접두에 빈틈이 있다 — 조각 하나가 통째로 사라졌을 수 있다: ${onDisk.join(", ")}`);

// ④ 각 파일이 최상위에서 닫혀 있어야 한다. 중괄호가 안 맞으면 다음 파일의 첫 규칙이
//    앞 파일의 열린 블록 안으로 빨려 들어간다(= 조용한 캐스케이드 파괴).
//    🔴 CSS 문법 오류는 `tsc`도 `npm run check`도 안 잡는다 — dev만 죽는다.
let totalBytes = 0;
for (const f of onDisk) {
  const css = fs.readFileSync(path.join(DIR, f), "utf8");
  totalBytes += Buffer.byteLength(css);
  let depth = 0, i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") { const e = css.indexOf("*/", i + 2); i = e === -1 ? css.length : e + 2; continue; }
    const c = css[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1; i = j + 1; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; assert.ok(depth >= 0, `${f}: 여는 중괄호보다 닫는 중괄호가 많다 (offset ${i})`); }
    i++;
  }
  assert.equal(depth, 0, `${f}: 중괄호가 ${depth}개 열린 채 끝난다 — 다음 파일이 이 블록 안으로 빨려 들어간다`);
}

console.log(`css-order.check: ${onDisk.length}개 파일 · ${totalBytes.toLocaleString()}B · import 순서/연번/중괄호 OK`);
