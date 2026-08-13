// 자체 점검: `npx tsx src/lib/jobs/generate.check.ts`로 돌린다 — generate.ts가 "@/lib/..." 경로 별칭을
// import해서 roles.check.ts처럼 plain node로는(경로 별칭을 못 풂) 못 돌린다.
// 2026-08-13 버그 — bucketByMatchedRole이 검색 source가 아니라 matchedRole로 묶는지 검증한다.
// 이게 깨지면 quota[role] 체크가 잘못된 role을 세서 하루 4건 제한이 새고(5~6건), get-jobs.ts의
// "정확히 4건" 요구를 못 맞춰 배치 전체가 조용히 무효 처리된다.
import assert from "node:assert/strict";
import { bucketByMatchedRole, type CollectedJob } from "./generate.ts";
import type { JobRole } from "./roles.ts";

function job(url: string, matchedRole: JobRole): CollectedJob {
  return {
    url, site: "테스트", sourceRole: null, matchedRole, fit: 1, careerTier: "unknown",
    fields: {
      is_job_posting: true, company: "c", title: "t", role: "", responsibilities: "", required_text: "",
      preferred_text: "", career_requirement: "", deadline: null, posted_at: null, date_confidence: "unknown",
    },
  };
}

const roles: JobRole[] = ["llm_ai_agent", "ai_platform_mlops", "ai_service_backend"];

// llm_ai_agent 검색으로 찾았지만 실제로는 ai_platform_mlops로 재분류된 후보 — 검색 source가 아니라
// matchedRole 버킷(인덱스 1)에 들어가야 한다. 예전 버그는 이걸 role[0](llm_ai_agent) 버킷에 남겨뒀다.
const mixed = [
  job("https://a", "llm_ai_agent"),
  job("https://b", "ai_platform_mlops"), // 검색은 llm_ai_agent로 했다고 가정해도 matchedRole은 이거
  job("https://c", "ai_service_backend"),
];
const buckets = bucketByMatchedRole(roles, mixed);
assert.deepEqual(buckets[0].map((j) => j.url), ["https://a"], "llm_ai_agent 버킷에는 실제로 그 role인 것만");
assert.deepEqual(buckets[1].map((j) => j.url), ["https://b"], "ai_platform_mlops로 재분류된 건 1번 버킷으로 가야 함");
assert.deepEqual(buckets[2].map((j) => j.url), ["https://c"]);

// 같은 URL이 여러 role 검색에서 중복 발견돼도 한 번만 센다 — 안 그러면 quota가 중복으로 채워진다.
const dup = [job("https://a", "llm_ai_agent"), job("https://a", "llm_ai_agent")];
assert.equal(bucketByMatchedRole(roles, dup)[0].length, 1, "같은 url은 dedup되어야 함");

console.log("generate.check.ts OK");
