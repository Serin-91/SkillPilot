// 자체 점검: node --test 없이 그냥 `node src/lib/jobs/roles.check.ts`로 돌린다(Node 24 type stripping).
// 배분 규칙(4 / 2+2 / 2+1+1 / 1+1+1+1)이 깨지면 여기서 바로 터진다.
// 체크리스트 토글은 이 모듈과 무관하므로 project/template.check.ts로 분리했다.
import assert from "node:assert/strict";
import { getDailyRoleQuota, validateInterestedJobRoles, reconcilePriority, DAILY_JOB_LIMIT, type JobRole } from "./roles.ts";

const D = "2026-08-09";

// 1개 / 2개 / 4개 선택은 날짜와 무관하게 고정 배분
assert.deepEqual(getDailyRoleQuota(["ai_ml"], D), { ai_ml: 4 });
assert.deepEqual(getDailyRoleQuota(["backend", "frontend"], D), { backend: 2, frontend: 2 });
assert.deepEqual(getDailyRoleQuota(["backend", "frontend", "ai_ml", "data_engineer"], D),
  { backend: 1, frontend: 1, ai_ml: 1, data_engineer: 1 });

// 3개 선택은 2+1+1이고, 추가 1개를 받는 직무가 날짜마다 순환한다
const three: JobRole[] = ["backend", "frontend", "ai_ml"];
const winners = new Set<string>();
for (const date of ["2026-08-09", "2026-08-10", "2026-08-11"]) {
  const q = getDailyRoleQuota(three, date);
  assert.equal(Object.values(q).reduce((a, b) => a + b, 0), DAILY_JOB_LIMIT);
  assert.deepEqual(Object.values(q).sort(), [1, 1, 2]);
  winners.add(Object.keys(q).find((r) => q[r] === 2)!);
}
assert.equal(winners.size, 3, "3일 연속 같은 직무가 추가 1개를 받으면 순환이 깨진 것");

// 허용 slug만, 중복 제거, canonical order 정규화, 0개는 거부
assert.deepEqual(validateInterestedJobRoles(["ai_ml", "backend", "ai_ml"]), ["backend", "ai_ml"]);
assert.equal(validateInterestedJobRoles([]), null);
assert.equal(validateInterestedJobRoles(["백엔드 개발자"]), null);
assert.equal(validateInterestedJobRoles("backend"), null);

// 관심 직무 우선순위 재정리 — priority 없는 기존 사용자는 현재 선택 순서로 기본값을 받는다
assert.deepEqual(reconcilePriority(["backend", "ai_ml"], []), ["backend", "ai_ml"]);
// 저장된 순서를 그대로 존중한다(선택 집합과 일치하면 순서 유지)
assert.deepEqual(reconcilePriority(["backend", "ai_ml"], ["ai_ml", "backend"]), ["ai_ml", "backend"]);
// 체크 해제된 직무는 저장된 순서에 남아 있어도 제거되고, 나머지는 1부터 재정렬(=배열 순서)된다
assert.deepEqual(reconcilePriority(["ai_ml", "frontend"], ["ai_ml", "backend", "frontend"]), ["ai_ml", "frontend"]);
// 새로 체크한 직무는 기존 순서를 건드리지 않고 마지막에 붙는다
assert.deepEqual(reconcilePriority(["backend", "ai_ml", "data_engineer"], ["backend", "ai_ml"]), ["backend", "ai_ml", "data_engineer"]);
// 허용되지 않은 값은 조용히 무시한다(조작된 입력 방어)
assert.deepEqual(reconcilePriority(["backend"], ["backend", "존재하지않는직무"]), ["backend"]);

console.log("roles.check.ts OK");
