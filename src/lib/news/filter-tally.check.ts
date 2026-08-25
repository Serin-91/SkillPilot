// 실행: npx tsx src/lib/news/filter-tally.check.ts
//
// 관리자 페이지의 "News 파싱" 줄은 이 tally가 전부다. 숫자가 틀리면 화면이 조용히 거짓을 말하고,
// 그건 "정상 4건 / 5명"만 있던 예전 상태보다 더 나쁘다(틀린 근거로 판단하게 되므로).
// 검사 대상은 (1) 탈락 사유가 배타적으로 한 번만 세지는가 (2) 통과+탈락 = 수집 총계가 맞는가
// (3) lookback을 넓혀 재실행할 때 tally가 리셋되는가 — (3)이 특히 중요하다. 이어서 더하면
// 같은 기사가 두 번 잡혀 "탈락 32건"이 "64건"으로 부풀고, 합계가 수집 건수를 넘어버린다.
import assert from "node:assert/strict";
import { hardFilter } from "./generate";
import type { Candidate } from "./rss";

const day = 24 * 60 * 60 * 1000;
const mk = (title: string, url: string, daysAgo: number): Candidate => ({
  source: "테스트", title, summary: "", url, publishedAt: new Date(Date.now() - daysAgo * day),
});

// AI 키워드가 있는 제목 / 없는 제목
const AI = "OpenAI 신규 모델 공개";
const NOT_AI = "여수 보건사업 추경 36억";

const raw: Candidate[] = [
  mk(AI, "https://a.test/1", 0),      // 통과
  mk(AI, "https://a.test/2", 1),      // 통과
  mk(NOT_AI, "https://a.test/3", 0),  // 주제 미해당
  mk(NOT_AI, "https://a.test/4", 0),  // 주제 미해당
  mk(AI, "https://a.test/5", 9),      // 기간 초과 (lookback 3/5 모두 초과)
  mk(AI, "https://a.test/6", 4),      // lookback 3일이면 초과, 5일이면 통과
  mk(AI, "https://a.test/7", 0),      // 이미 쓴 URL → 중복
  mk(AI, "https://a.test/2", 1),      // 배치 내 같은 URL 재등장 → 중복
];
const used = new Set(["https://a.test/7"]);

// --- lookback 3일 ---
let t = { rejectedOld: 0, rejectedTopic: 0, rejectedDup: 0 };
let passed = hardFilter(raw, used, 3, t);
assert.equal(passed.length, 2, "3일: /1 /2만 통과");
assert.equal(t.rejectedTopic, 2, "주제 미해당 2건");
assert.equal(t.rejectedOld, 2, "3일 기준 기간 초과 2건(/5 9일, /6 4일)");
assert.equal(t.rejectedDup, 2, "중복 2건(usedUrls /7, 배치 내 /2)");
// 합계가 수집 총계와 맞아야 한다 — 어느 사유에도 안 잡혀 사라지는 기사가 있으면 화면 숫자가 어긋난다.
assert.equal(passed.length + t.rejectedOld + t.rejectedTopic + t.rejectedDup, raw.length, "통과+탈락 = 수집");

// --- lookback 5일로 넓혀 재실행: tally를 반드시 새로 시작해야 한다 ---
t = { rejectedOld: 0, rejectedTopic: 0, rejectedDup: 0 };
passed = hardFilter(raw, used, 5, t);
assert.equal(passed.length, 3, "5일: /1 /2 /6 통과");
assert.equal(t.rejectedOld, 1, "5일 기준 기간 초과는 /5 하나뿐");
assert.equal(t.rejectedTopic, 2);
assert.equal(t.rejectedDup, 2);
assert.equal(passed.length + t.rejectedOld + t.rejectedTopic + t.rejectedDup, raw.length, "통과+탈락 = 수집");

// --- 리셋을 안 하고 이어서 더하면 합계가 수집 건수를 넘는다(회귀 방지용 반례) ---
const shared = { rejectedOld: 0, rejectedTopic: 0, rejectedDup: 0 };
hardFilter(raw, used, 3, shared);
const after3 = { ...shared };
hardFilter(raw, used, 5, shared);
const total = hardFilter(raw, used, 5).length + shared.rejectedOld + shared.rejectedTopic + shared.rejectedDup;
assert.ok(total > raw.length, "tally를 공유하면 합계가 수집 건수를 넘는다 — buildCandidateList가 리셋하는 이유");
assert.ok(shared.rejectedTopic > after3.rejectedTopic, "공유 시 같은 기사가 두 번 세진다");

// tally를 안 넘겨도 필터 결과는 같아야 한다(통계는 부가 기능이다)
assert.equal(hardFilter(raw, used, 5).length, 3);

console.log("filter-tally.check.ts 통과");
