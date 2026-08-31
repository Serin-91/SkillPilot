// 자체 점검: `node src/lib/news/event-dedupe.check.ts` (Node 24 type stripping).
// 이 파일이 지키는 것은 딱 하나 — **보수적 병합**이다. 잘못 합치면 멀쩡한 기사가 후보에서
// 통째로 사라지고, 안 합치면 지금과 같을 뿐이다. 손실이 대칭이 아니므로 오병합 쪽을 더 세게 막는다.
import assert from "node:assert/strict";
import { clusterByEvent, dedupeByEvent, isSameEvent, isSameEventTitles, FINAL_SAME_EVENT_HOURS, contentWords, entitiesOf } from "./event-dedupe.ts";
import type { Candidate } from "./rss.ts";

const BASE = new Date("2026-08-30T09:00:00+09:00");
let seq = 0;
const mk = (title: string, source = "AI타임스", hoursOffset = 0, summary = ""): Candidate => ({
  title,
  summary,
  url: `https://example.com/${++seq}`,
  source,
  publishedAt: new Date(BASE.getTime() + hoursOffset * 3_600_000),
});

// ── 정규화 ────────────────────────────────────────────────────────────────
// 제품은 만든 회사로 접힌다. 이게 이 모듈의 핵심 knob이다.
assert.deepEqual([...entitiesOf("구글, '제미나이 라이브'에 에이전트 탑재")], ["google"]);
assert.deepEqual([...entitiesOf("Anthropic's Claude gets a new mode")], ["anthropic"]);
// 회사·제품 표기는 내용어에서 빠진다 — 안 빼면 같은 사실이 두 번 세어진다.
assert.ok(!contentWords("구글, '제미나이 3.8 플래시' 내부 테스트").has("제미나이"));
assert.ok(contentWords("구글, '제미나이 3.8 플래시' 내부 테스트").has("플래시"));
// 조사를 뗀다 — "이해민"과 "이해민은"이 다른 낱말이면 후속 보도를 못 알아본다.
assert.ok(contentWords("청와대 AI 정책 맡는 이해민은 누구").has("이해민"));
// 2글자 낱말은 조사를 떼지 않는다("정부" → "정"이 되면 안 된다).
assert.ok(contentWords("새 정부 조직 개편안 확정").has("정부"));

// ── ① 교차언어 병합: 이걸 못 잡으면 이 모듈은 존재 의미가 없다 ────────────────
// 실측 사례(2026-08-31 라이브). 두 제목은 **공유 낱말이 0개**라 낱말 겹침만으로는 절대 못 잡는다.
const sonyKo = mk("소니·워너, 앤트로픽에 저작권 소송...\"클로드 훈련용 음악 무단 취득\"");
const sonyEn = mk('Sony Music, Warner sue Anthropic, alleging a "brazen campaign"', "TechCrunch", 3);
assert.equal(isSameEvent(sonyKo, sonyEn), true, "교차언어 동일 사건을 못 잡았다");

// ── ② 🔴 오병합 회귀: 1차 구현이 실제로 저지른 실수 ────────────────────────────
// {google, gemini} 두 entity를 공유한다는 이유로 **서로 다른 4개 사건**이 하나로 묶였다.
// 제품을 회사로 접고, 회사 표기를 내용어에서 뺀 것이 이 회귀를 막는다.
const gem = [
  mk("구글, '제미나이 라이브'에 에이전트 탑재…음성으로 일정·이메일 제어"),
  mk("구글, 구매한 전자책과 '제미나이 노트북' 연결…'전문가 인텔리전스' 공개", "AI타임스", 2),
  mk("구글, '제미나이 3.8 플래시' 내부 테스트 포착...'월간 출시' 속도전", "AI타임스", 4),
  mk("구글, '제미나이 옴니 1.1 플래시' 공개…영상 생성·편집 제어 기능 대폭 강화", "AI타임스", 6),
];
for (let i = 0; i < gem.length; i++) {
  for (let j = i + 1; j < gem.length; j++) {
    assert.equal(isSameEvent(gem[i], gem[j]), false, `제미나이 오병합 회귀 — ${i}번과 ${j}번`);
  }
}
assert.equal(dedupeByEvent(gem).kept.length, 4, "서로 다른 4개 사건이 접혔다");

// 같은 회사의 서로 다른 사건도 마찬가지 — 조직 1곳만 공유하는 것은 합치지 않는다.
assert.equal(
  isSameEvent(
    mk("앤트로픽, AI와 물리 장비 잇는 'MHS' 공개"),
    mk("앤트로픽 \"AI가 인간 대신 정렬 작업 수행…안전성 크게 높였다\"", "AI타임스", 5),
  ),
  false,
  "같은 회사의 다른 사건을 합쳤다",
);

// ── ③ 게시일 근접성 게이트 ─────────────────────────────────────────────────
assert.equal(isSameEvent(sonyKo, mk(sonyEn.title, "TechCrunch", 72)), false, "48시간을 넘겼는데 합쳤다");

// ── ④ 대표는 품질 점수가 가장 높은 하나 ────────────────────────────────────
// HIGH_VALUE_TERMS("에이전트")가 있는 쪽이 점수가 높다 — 그쪽이 대표여야 한다.
const plain = mk("소니·워너, 앤트로픽 상대 소송 제기");
const rich = mk("소니·워너, 앤트로픽 상대 소송…AI 에이전트 학습 데이터 저작권 쟁점", "TechCrunch", 1);
const cl = clusterByEvent([plain, rich]);
assert.equal(cl.length, 1, "같은 사건이 안 접혔다");
assert.equal(cl[0].representative.url, rich.url, "점수가 낮은 쪽이 대표가 됐다");

// ── ⑤ 연쇄(single-link) 금지 ───────────────────────────────────────────────
// A~B, B~C인데 A≁C일 때 셋이 한 덩어리가 되면 무관한 기사가 사라진다. star 방식이라 그럴 수 없다.
// 대표(A)와 직접 맞지 않는 C는 반드시 자기 클러스터를 갖는다.
{
  const a = mk("엔비디아 소니 공동 개발 로보틱스 플랫폼 발표");
  const b = mk("소니 워너 음악 저작권 협의 착수", "ZDNet Korea", 1);
  const c = mk("워너 스튜디오 제작 파이프라인 개편", "ZDNet Korea", 2);
  const out = clusterByEvent([a, b, c]);
  const total = out.reduce((n, x) => n + 1 + x.dropped.length, 0);
  assert.equal(total, 3, "입력이 유실됐다");
  for (const cluster of out) {
    for (const d of cluster.dropped) {
      assert.ok(isSameEvent(cluster.representative, d), "대표와 직접 맞지 않는 기사가 흡수됐다(연쇄)");
    }
  }
}

// ── ⑥ 결정성 — 같은 입력이면 순서가 달라도 같은 결과 ──────────────────────
{
  const items = [sonyKo, sonyEn, ...gem];
  const a = dedupeByEvent(items).kept.map((c) => c.url).sort();
  const b = dedupeByEvent([...items].reverse()).kept.map((c) => c.url).sort();
  assert.deepEqual(a, b, "입력 순서에 따라 결과가 달라진다");
}

// ── ⑦ 아무것도 안 잃는다 ───────────────────────────────────────────────────
assert.equal(dedupeByEvent([]).kept.length, 0);
{
  const one = [mk("단독 기사")];
  assert.equal(dedupeByEvent(one).kept.length, 1);
  assert.equal(dedupeByEvent(one).merged, 0);
}

// ── ⑧ 최종 안전장치용 넓은 창 (FINAL_SAME_EVENT_HOURS) ────────────────────
// 실측(2026-08-31): 같은 법원 판결을 두 매체가 60.3시간 간격으로 보도해 최종 4건에 **둘 다** 실렸다.
// 후보 단계(48h)는 그대로 두고 최종 검사만 lookback 전체(5일)로 넓힌다 — 두 단계의 비용이 정반대다.
{
  const tcTitle = "앤트로픽, 펜타곤 공급망 리스크 지정 소송서 첫 승소";
  const zdTitle = "미 연방법원, 앤트로픽의 국가안보상 공급망 위험 지정 조치에 위법 판결";
  const tcAt = "2026-08-28T12:46:12.000Z";
  const zdAt = "2026-08-31T01:02:40.000Z";   // 60.3시간 차이
  assert.equal(isSameEventTitles(tcTitle, tcAt, zdTitle, zdAt), false, "후보 단계(48h)는 그대로여야 한다");
  assert.equal(
    isSameEventTitles(tcTitle, tcAt, zdTitle, zdAt, FINAL_SAME_EVENT_HOURS), true,
    "최종 검사(5일 창)가 같은 사건을 못 잡았다",
  );
  // 넓힌 창이 **다른 사건**까지 묶으면 안 된다 — 같은 회사(앤트로픽)의 무관한 기사가 63.6시간 차이로 있었다.
  assert.equal(
    isSameEventTitles("앤트로픽, AI와 물리 장비 잇는 'MHS' 공통 규격 공개", "2026-08-28T09:28:56.000Z",
      zdTitle, zdAt, FINAL_SAME_EVENT_HOURS), false,
    "넓힌 창이 다른 사건을 묶었다",
  );
}

console.log("event-dedupe.check.ts OK");
