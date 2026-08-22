// 자체 점검: node --test 없이 그냥 `node src/lib/jobs/roles.check.ts`로 돌린다(Node 24 type stripping).
// 2026-08-13 AI 중심 개편 — 배분 규칙(4 / 3+1 / 2+1+1 / 2+1+1+0, 우선순위 기반)이 깨지면 여기서 바로 터진다.
// 체크리스트 토글은 이 모듈과 무관하므로 project/template.check.ts로 분리했다.
import assert from "node:assert/strict";
import {
  getDailyRoleQuota, validateInterestedJobRoles, validatePriorityOrder, reconcilePriority,
  isLegacyJobRole, hasLegacyJobRoles, needsJobRoleReset, DAILY_JOB_LIMIT, JOB_ROLE_ORDER, type JobRole,
} from "./roles.ts";

const D = "2026-08-09";

// 1개 / 2개 / 3개 선택은 날짜와 무관하게 고정 배분, priorityRoles[0]이 항상 1순위(최소 배분 보장)
assert.deepEqual(getDailyRoleQuota(["llm_ai_agent"], D), { llm_ai_agent: 4 });
assert.deepEqual(getDailyRoleQuota(["llm_ai_agent", "applied_ai_ml"], D), { llm_ai_agent: 3, applied_ai_ml: 1 });
assert.deepEqual(
  getDailyRoleQuota(["llm_ai_agent", "applied_ai_ml", "ai_platform_mlops"], D),
  { llm_ai_agent: 2, applied_ai_ml: 1, ai_platform_mlops: 1 }
);
// 우선순위를 뒤집으면 배분도 그대로 뒤집힌다 — canonical 순서로 재정렬되면 안 된다
assert.deepEqual(getDailyRoleQuota(["applied_ai_ml", "llm_ai_agent"], D), { applied_ai_ml: 3, llm_ai_agent: 1 });

// 4개 선택은 1·2순위 고정(2+1), 3·4순위 중 하루 1개만 받고 날짜마다 교대한다(연속된 날은 반드시 parity가 바뀐다)
const four: JobRole[] = ["llm_ai_agent", "applied_ai_ml", "ai_platform_mlops", "ai_service_backend"];
const qA = getDailyRoleQuota(four, "2026-08-09");
const qB = getDailyRoleQuota(four, "2026-08-10");
for (const q of [qA, qB]) {
  assert.equal(Object.values(q).reduce((a, b) => a + b, 0), DAILY_JOB_LIMIT);
  assert.equal(q.llm_ai_agent, 2, "1순위는 4개 선택에서도 항상 최소 2건");
  assert.equal(q.applied_ai_ml, 1);
  assert.equal(q.ai_platform_mlops + q.ai_service_backend, 1, "3·4순위 중 하루 1개만");
}
assert.notEqual(qA.ai_platform_mlops, qB.ai_platform_mlops, "연속된 날에 3·4순위 교대가 안 됨");

// 새 slug만 허용, old slug는 거부, 중복 제거·canonical order 정규화, 0개는 거부
assert.deepEqual(validateInterestedJobRoles(["applied_ai_ml", "llm_ai_agent", "applied_ai_ml"]), ["llm_ai_agent", "applied_ai_ml"]);
assert.equal(validateInterestedJobRoles([]), null);
assert.equal(validateInterestedJobRoles(["backend"]), null);
assert.equal(validateInterestedJobRoles(["ai_ml"]), null);
assert.equal(validateInterestedJobRoles("llm_ai_agent"), null);

// validatePriorityOrder — validateInterestedJobRoles와 같은 허용 규칙이지만 입력 순서를 보존한다
assert.deepEqual(validatePriorityOrder(["applied_ai_ml", "llm_ai_agent"]), ["applied_ai_ml", "llm_ai_agent"]);
assert.equal(validatePriorityOrder([]), null);
assert.equal(validatePriorityOrder(["backend"]), null);

// legacy 감지 — 4-2/4-3절: legacy slug가 하나라도 섞이면(mixed 포함) true, 순수 new만이면 false
assert.equal(isLegacyJobRole("backend"), true);
assert.equal(isLegacyJobRole("llm_ai_agent"), false);
assert.equal(hasLegacyJobRoles(["backend"]), true);
assert.equal(hasLegacyJobRoles(["llm_ai_agent", "backend"]), true, "mixed old/new도 legacy로 감지해야 함");
assert.equal(hasLegacyJobRoles(["llm_ai_agent", "applied_ai_ml"]), false);
assert.equal(needsJobRoleReset(["ai_ml", "backend"]), true);
assert.equal(needsJobRoleReset(["ai_platform_mlops", "ai_service_backend"]), false);
assert.equal(needsJobRoleReset([]), false);

// 관심 직무 우선순위 재정리 — priority 없는 기존 사용자는 현재 선택 순서로 기본값을 받는다
assert.deepEqual(reconcilePriority(["llm_ai_agent", "applied_ai_ml"], []), ["llm_ai_agent", "applied_ai_ml"]);
// 저장된 순서를 그대로 존중한다(선택 집합과 일치하면 순서 유지)
assert.deepEqual(reconcilePriority(["llm_ai_agent", "applied_ai_ml"], ["applied_ai_ml", "llm_ai_agent"]), ["applied_ai_ml", "llm_ai_agent"]);
// 체크 해제된 직무는 저장된 순서에 남아 있어도 제거되고, 나머지는 배열 순서로 재정렬된다
assert.deepEqual(
  reconcilePriority(["applied_ai_ml", "ai_platform_mlops"], ["applied_ai_ml", "llm_ai_agent", "ai_platform_mlops"]),
  ["applied_ai_ml", "ai_platform_mlops"]
);
// 새로 체크한 직무는 기존 순서를 건드리지 않고 마지막에 붙는다
assert.deepEqual(
  reconcilePriority(["llm_ai_agent", "applied_ai_ml", "ai_service_backend"], ["llm_ai_agent", "applied_ai_ml"]),
  ["llm_ai_agent", "applied_ai_ml", "ai_service_backend"]
);
// legacy/허용되지 않은 값은 조용히 무시한다(조작된 입력 방어, legacy row 마이그레이션 안전 처리)
assert.deepEqual(reconcilePriority(["llm_ai_agent"], ["llm_ai_agent", "backend"]), ["llm_ai_agent"]);


// ── 우선순위 경우의 수 전수 검증 (2026-08-23) ────────────────────────────────────────────────
// "직무 4개를 각각 다른 우선순위로 두면 경우의 수가 많은데 다 제대로 도는가"를 손으로 확인할 수는
// 없으니 전부 돌려본다. 1~4개 선택 × 모든 순열 × 1년 366일 = 실제로 나올 수 있는 모든 조합이다.
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}
const ALL_ROLES = [...JOB_ROLE_ORDER];
// 연말·연초를 반드시 걸치게 잡는다 — 교대가 해를 넘길 때 끊기던 버그가 여기서 잡혔다.
const DATES_2026 = Array.from({ length: 800 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10)
);

let combos = 0;
for (let size = 1; size <= ALL_ROLES.length; size++) {
  // size개를 고르는 모든 조합 → 그 조합의 모든 우선순위 순열
  const subsets = ALL_ROLES.reduce<JobRole[][]>((acc, r) => [...acc, ...acc.map((sub) => [...sub, r])], [[]])
    .filter((sub) => sub.length === size);
  for (const subset of subsets) {
    for (const order of permutations(subset)) {
      for (const date of DATES_2026) {
        combos++;
        const quota = getDailyRoleQuota(order, date);
        const total = Object.values(quota).reduce((a, b) => a + b, 0);
        assert.equal(total, DAILY_JOB_LIMIT, `합계가 ${DAILY_JOB_LIMIT}이어야 한다: ${order} / ${date} / ${JSON.stringify(quota)}`);
        assert.deepEqual(Object.keys(quota).sort(), [...order].sort(), "고른 직무만 quota에 있어야 한다");
        // 1순위는 언제나 가장 많이 받는다 — 우선순위를 바꾸면 결과가 실제로 따라 바뀐다는 뜻이다.
        for (const r of order.slice(1)) {
          assert.ok(quota[order[0]] >= quota[r], `1순위(${order[0]})가 ${r}보다 적으면 안 된다: ${JSON.stringify(quota)}`);
        }
      }
    }
  }
}

// 4개를 고른 경우 3·4순위는 하루 1자리를 날짜로 번갈아 갖는다 — 어느 한쪽도 영영 굶지 않아야 한다.
for (const order of permutations(ALL_ROLES)) {
  for (let i = 0; i + 1 < DATES_2026.length; i++) {
    const a = getDailyRoleQuota(order, DATES_2026[i]);
    const b = getDailyRoleQuota(order, DATES_2026[i + 1]);
    const third = order[2], fourth = order[3];
    assert.equal(a[third] + a[fourth], 1, "3·4순위는 하루에 합쳐서 1자리다");
    assert.equal(a[third] + b[third], 1, `3순위(${third})는 이틀에 한 번 받아야 한다`);
    assert.equal(a[fourth] + b[fourth], 1, `4순위(${fourth})도 이틀에 한 번 받아야 한다`);
  }
}

// 같은 직무를 두 번 넣어도 중복은 제거되고 순서는 보존된다(화면에서 같은 항목이 두 번 잡히는 경우 대비).
assert.deepEqual(validatePriorityOrder(["llm_ai_agent", "llm_ai_agent", "ai_service_backend"]),
  ["llm_ai_agent", "ai_service_backend"], "중복 입력은 하나로 합치고 순서는 그대로 둔다");
const dupQuota = getDailyRoleQuota(["llm_ai_agent", "llm_ai_agent"], "2026-08-23");
assert.equal(Object.values(dupQuota).reduce((a, b) => a + b, 0), DAILY_JOB_LIMIT, "중복 입력이어도 합계는 4다");

console.log(`우선순위 조합 ${combos.toLocaleString()}가지 전수 통과`);

console.log("roles.check.ts OK");
