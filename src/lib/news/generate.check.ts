// 자체 점검: `npx tsx src/lib/news/generate.check.ts`
// dev 입력 스냅샷(withDevInput)의 세 갈래만 검사한다. 네트워크·DB·Gemini 불필요.
//
// 왜 이 검사가 필요한가: 이 스냅샷은 **재현용 보존**이고, 깨져도 화면에는 아무 증상이 없다.
// 조용히 안 저장되면 며칠 뒤 "또 재생 불가"를 만나게 된다 — 그래서 검사로 붙잡는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withDevInput, DEV_SNAPSHOT_MAX_CHARS, TAKEAWAY_EVIDENCE_RE } from "./generate.ts";
import { groundTakeaways } from "./trend-brief.ts";
import { stripDevInput } from "./get-briefing.ts";
import { DEV_DESCRIPTION_MAX_CHARS, MAX_DEV_ITEMS_PER_SOURCE } from "./sources.ts";
import type { DevEcosystem } from "./dev-ecosystem.ts";
import type { TrendBriefResult } from "./trend-brief.ts";

const dev: DevEcosystem = {
  github: [{ title: "Copilot code review can now approve PRs", description: "설명", published_at: "2026-09-02T00:00:00.000Z", url: "https://github.blog/x", source: "GitHub" }],
  huggingface: [{ title: "deepseek-ai/X", description: "태스크: text-generation", published_at: "2026-09-01T00:00:00.000Z", url: "https://huggingface.co/deepseek-ai/X", source: "Hugging Face" }],
};
const brief: TrendBriefResult = {
  industry_impact: { content: "흐름", points: ["흐름"] },
  tool_update: null, developer_trend: null,
  practical_takeaways: ["무언가를 해본다. 오늘 바뀌었기 때문이다. (근거: GitHub · X)"],
};

// ① 정상 — dev_input이 붙고 나머지 필드는 그대로다
{
  const stored = withDevInput(brief, dev);
  assert.ok(stored && "dev_input" in stored);
  assert.deepEqual(stored.dev_input, dev, "가공 없이 그대로 저장해야 한다 — 가공하면 '모델이 본 것'과 어긋난다");
  assert.deepEqual(stripDevInput(stored), brief, "벗기면 생성 결과와 완전히 같아야 한다");
}

// ②🔴 brief가 null이면 null을 유지한다 — 스냅샷 때문에 null이 객체가 되면
//     화면이 "AI Trend 있음"으로 오판해 빈 섹션을 그린다
assert.equal(withDevInput(null, dev), null, "생성 실패한 날을 스냅샷이 되살리면 안 된다");

// ③ 상한을 넘으면 스냅샷만 버리고 브리핑은 정상 저장한다
{
  const huge: DevEcosystem = { github: Array.from({ length: 400 }, () => ({ ...dev.github[0], description: "가".repeat(400) })), huggingface: [] };
  const stored = withDevInput(brief, huge);
  assert.ok(stored, "상한을 넘어도 브리핑 자체는 살아야 한다");
  assert.equal("dev_input" in stored, false, "상한 초과 시 스냅샷은 빠진다");
  assert.deepEqual(stored, brief);
}

// ④ 하위 호환 — dev_input이 없는 옛 행은 손대지 않는다
assert.deepEqual(stripDevInput(brief), brief, "옛 행은 그대로 통과해야 한다");
assert.equal(stripDevInput(null), null);

// ⑤🔴 **컷을 올려도 스냅샷이 안 죽는지**를 상수만으로 계산해 지킨다 (2026-09-05).
//
// 왜 필요한가: `DEV_DESCRIPTION_MAX_CHARS`를 400 → 2000으로 올렸다. 이 컷은 소스당
// `MAX_DEV_ITEMS_PER_SOURCE`건 × 2소스에 걸리므로, 누가 또 올리면 상한(64,000)에 닿는다.
// 닿는 순간 ③번 경로로 빠져 **스냅샷이 조용히 사라지고 화면에는 아무 증상이 없다** — 며칠 뒤에야
// "또 재생 불가"로 발견된다. 그래서 사람의 판단이 아니라 계산으로 붙잡는다.
// (설계안이 "이미 초과 중"이라고 적었던 것은 DB 실측으로 틀린 것으로 확인됐다 — generate.ts 주석)
{
  const worst: DevEcosystem = {
    github: Array.from({ length: MAX_DEV_ITEMS_PER_SOURCE }, (_, i) => ({
      title: "가".repeat(120), description: "가".repeat(DEV_DESCRIPTION_MAX_CHARS),
      published_at: "2026-09-05T00:00:00.000Z", url: `https://github.blog/${i}`, source: "GitHub" as const,
    })),
    huggingface: Array.from({ length: MAX_DEV_ITEMS_PER_SOURCE }, (_, i) => ({
      title: "가".repeat(120), description: "가".repeat(DEV_DESCRIPTION_MAX_CHARS),
      published_at: "2026-09-05T00:00:00.000Z", url: `https://huggingface.co/${i}`, source: "Hugging Face" as const,
    })),
  };
  const size = JSON.stringify(worst).length;
  const stored = withDevInput(brief, worst);
  assert.ok(
    size < DEV_SNAPSHOT_MAX_CHARS,
    `최악 스냅샷 ${size}자가 상한 ${DEV_SNAPSHOT_MAX_CHARS}자를 넘는다 — ` +
    `DEV_DESCRIPTION_MAX_CHARS(${DEV_DESCRIPTION_MAX_CHARS})나 MAX_DEV_ITEMS_PER_SOURCE(${MAX_DEV_ITEMS_PER_SOURCE})를 ` +
    `올렸으면 상한도 같이 올려라. 안 그러면 스냅샷이 조용히 버려진다`
  );
  assert.ok(stored && "dev_input" in stored, "최악의 경우에도 스냅샷은 저장돼야 한다");
  console.log(`  ⑤ 최악 스냅샷 ${size}자 / 상한 ${DEV_SNAPSHOT_MAX_CHARS}자 (${(size / DEV_SNAPSHOT_MAX_CHARS * 100).toFixed(1)}%) — 여유 있음`);
}

// ⑥🔴🔴 크론이 **새벽 행을 먼저 지운 뒤에** "오늘 것이 있나"를 묻는지 — 순서가 전부다 (2026-09-06).
//
// 왜 이 검사인가: cutoff 판정 자체는 kst.check.ts가 이미 지킨다. 09-05에 터진 것은 판정이 아니라
// **순서**였다. `briefingExistsForToday()`는 generated_at을 안 보므로, 새벽 행이 남은 채로 먼저
// 물으면 그 답은 항상 true고 크론은 생성을 건너뛴다. 실측: 02:41 Test 계정 1행 → 10:38 크론이
// backfill로 그걸 4명에게 복사(5행 해시 전원 동일) → 역량 시그널이 하루 종일 "없습니다"였다.
// cron_runs에는 success·5/5로 남아서 **관리자 페이지로는 안 보인다.** 그래서 검사가 필요하다.
//
// 순수 함수로는 순서를 못 잡는다(DB·네트워크가 필요하다). 소스에서 호출 위치만 본다 — 값싸고,
// 누가 순서를 되돌리거나 clearPreCron 호출을 지우면 그 자리에서 실패한다.
{
  // ⚠️ 주석을 먼저 걷는다 — 두 이름 다 route.ts 주석에서 설명되고 있어서, 원문 그대로 indexOf하면
  //    코드가 아니라 그 주석 위치를 재서 순서가 거꾸로 나온다(이 검사를 처음 돌렸을 때 실제로 그랬다).
  const route = readFileSync(new URL("../../app/api/cron/briefing/route.ts", import.meta.url), "utf8")
    .replace(/^\s*\/\/.*$/gm, "");
  const clearAt = route.indexOf("clearPreCronBriefingRows(today");
  const existsAt = route.indexOf("briefingExistsForToday()");
  assert.ok(clearAt > 0, "크론이 clearPreCronBriefingRows를 아예 안 부른다 — 새벽 테스트 한 번이 그날 브리핑을 통째로 차지한다");
  assert.ok(existsAt > 0, "briefingExistsForToday 호출을 못 찾았다 — 이 검사의 전제가 깨졌으니 검사부터 고쳐라");
  assert.ok(
    clearAt < existsAt,
    "clearPreCronBriefingRows가 briefingExistsForToday보다 뒤에 있다 — 그러면 새벽 행이 남은 채로 " +
    "판정돼 크론이 생성을 건너뛰고 backfill이 새벽 결과를 전 회원에게 복사한다(09-05 실측)"
  );
  // 채용 쪽 같은 규칙도 같이 세운다 — 한쪽만 남으면 다음 사람이 "briefing엔 원래 없다"로 읽는다.
  assert.ok(route.includes("clearPreCronBatches(today"), "채용 쪽 clearPreCronBatches 호출이 사라졌다");
}

// ⑦🔴🔴 저장 형태(groundTakeaways) ↔ 파싱(recentTakeawayEvidence)의 **왕복 계약** (2026-09-06).
//
// 실무 적용 반복을 막으려면 "어제 무엇을 근거로 썼나"를 읽어와야 하는데, 저장은 trend-brief.ts가
// `${action} ${why} (근거: ${source} · ${shortTitle(title)})` 문자열로 하고 파싱은 generate.ts의
// 정규식이 한다. **파일이 갈려 있어 한쪽만 바뀌면 조용히 어긋난다** — 그러면 목록이 늘 0건이 되고
// 증상은 "반복이 다시 시작됐다"뿐이라 며칠 뒤에야 발견된다. 그래서 실제 출력으로 왕복시킨다.
{
  const pool = [{ title: "Upcoming deprecation of selected GitHub Copilot models", source: "GitHub" }];
  const { takeaways } = groundTakeaways(
    [{
      action: "Gemini 3.5/3.6 Flash를 3.8 Flash로 바꿔 같은 코딩 작업을 돌리고 응답 속도를 비교한다.",
      why_today: "구형 플래시 모델의 지원 종료 일정이 공지됐기 때문이다.",
      evidence_title: "Upcoming deprecation of selected GitHub Copilot models",
    }],
    pool
  );
  assert.equal(takeaways.length, 1, "왕복 테스트의 전제가 깨졌다 — 저장 쪽부터 확인해라");

  const m = TAKEAWAY_EVIDENCE_RE.exec(takeaways[0].trim());
  assert.ok(m, `저장 형태를 파싱하지 못했다 — 두 파일이 어긋났다: ${JSON.stringify(takeaways[0].slice(-70))}`);
  assert.equal(m[1].trim(), "GitHub", "source가 어긋난다");
  assert.ok(
    pool[0].title.startsWith(m[2].trim().replace(/…$/, "")),
    `title이 어긋난다: 파싱 "${m[2]}" vs 원본 "${pool[0].title}"`
  );

  // 52자 넘는 제목은 `…`로 잘려 저장된다 — 잘린 채로도 파싱은 성공해야 한다(힌트 용도라 충분하다).
  const longPool = [{ title: "A".repeat(80), source: "Hugging Face" }];
  const long = groundTakeaways(
    [{ action: "이 재료로 무언가를 해보고 결과를 비교해 결정한다.", why_today: "오늘 새로 공개됐기 때문이다.", evidence_title: "A".repeat(80) }],
    longPool
  ).takeaways[0];
  const lm = TAKEAWAY_EVIDENCE_RE.exec(long.trim());
  assert.ok(lm, "잘린 제목이 파싱되지 않는다");
  assert.equal(lm[1].trim(), "Hugging Face");
  assert.ok(lm[2].endsWith("…"), "52자 초과 제목은 …로 잘려야 한다(shortTitle 계약)");

  // 근거 표기가 없는 옛 행(2026-09-03 이전)은 조용히 건너뛴다 — 예외를 던지면 안 된다.
  assert.equal(TAKEAWAY_EVIDENCE_RE.exec("근거 표기가 없던 시절의 실무 적용 문장입니다."), null);
}

// ⑧🔴🔴 관리자 테스트 생성(previewBriefing)은 **운영 데이터를 한 줄도 쓰지 않는다** (2026-09-06).
//
// 이 계약이 깨지면 증상이 즉시 안 보인다 — 테스트가 조용히 `briefing`을 만들고, 그게 다음 날
// `recentlyUsedUrls`·`recentTakeawayEvidence`의 "과거 데이터"가 되며, 최악은 09-05처럼 그날 크론을
// 통째로 막는 것이다(HANDOFF 38절). 그래서 소스에서 **쓰기 호출이 없다는 것**을 직접 센다.
{
  const src = readFileSync(new URL("../actions/briefing.ts", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const preview = src.slice(src.indexOf("export async function previewBriefing"), src.indexOf("export async function retryBriefing"));
  assert.ok(preview.length > 200, "previewBriefing을 못 찾았다 — 이 검사의 전제가 깨졌다");

  for (const forbidden of ["generateBriefingFor", "recordRunStart", "recordRunEnd", ".delete(", ".upsert(", ".insert(", ".update(", "recordManualRefreshSuccess"]) {
    assert.equal(
      preview.includes(forbidden),
      false,
      `previewBriefing이 "${forbidden}"를 부른다 — 테스트 생성이 운영 데이터를 건드리면 안 된다(사용자 조건 2·3).`
    );
  }
  // 생성은 **크론과 같은 함수**여야 한다. 두 벌이 되면 그쪽만 규칙이 어긋난다.
  assert.ok(preview.includes("buildBriefingPayload("), "previewBriefing이 공용 생성 함수를 쓰지 않는다");
  // persist=false로 넘겨야 source_article 적재까지 꺼진다(인자 순서: supabase, skipDedup, persist).
  assert.ok(
    /buildBriefingPayload\(\s*admin\s*,\s*false\s*,\s*false\s*\)/.test(preview),
    "previewBriefing은 buildBriefingPayload(admin, false, false)여야 한다 — skipDedup=false(크론과 같은 입력) · persist=false(무저장)"
  );
  // 관리자 외에는 파이프라인이 돌면 안 된다(RSS·Gemini 비용).
  assert.ok(preview.includes("isAdminEmail"), "previewBriefing에 관리자 게이트가 없다");

  // 반대로 운영 경로는 **그대로 저장해야 한다** — 사용자 수동 갱신까지 dry-run으로 바꾸면 안 된다.
  const retry = src.slice(src.indexOf("export async function retryBriefing"));
  assert.ok(retry.includes("generateBriefingFor"), "retryBriefing(운영 업데이트)은 실제 저장을 유지해야 한다");
}

// ⑨ 콘텐츠를 실제로 만드는 **세 경로 전부** cron_runs.details에 newsStats를 남긴다 (2026-09-18).
//
// admin-status.ts는 `manualRun ?? cronRun ?? fallbackRun`의 newsStats를 읽는데, fallback 경로만
// 쓰는 쪽이 빠져 있었다 — reader는 있고 writer가 없어서, 그 경로가 그날 콘텐츠를 만든 날
// (09-04·09-08 실측)은 관리자 페이지의 뉴스 funnel이 영구히 "-"였다. 읽는 쪽은 조용히 null을
// 받으므로 증상이 안 보인다. 그래서 **쓰는 쪽 세 곳을 소스에서 직접 센다.**
{
  const writers: [string, string][] = [
    ["크론", "../../app/api/cron/briefing/route.ts"],
    ["접속 fallback", "./get-briefing.ts"],
    ["수동 지금 업데이트", "../actions/briefing.ts"],
  ];
  for (const [label, rel] of writers) {
    const body = readFileSync(new URL(rel, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const ends = body.split("recordRunEnd(").slice(1).filter((s) => s.slice(0, 200).includes('"success"'));
    assert.ok(ends.length > 0, `${label}: recordRunEnd(..., "success") 호출을 못 찾았다 — 이 검사의 전제가 깨졌다`);
    assert.ok(
      ends.some((s) => s.slice(0, 400).includes("newsStats")),
      `${label} 경로가 성공 기록에 newsStats를 남기지 않는다 — admin-status.ts가 그 날의 뉴스 funnel을 표시할 수 없다.`
    );
  }
}

console.log("generate.check.ts (dev 입력 스냅샷 + 크론 pre-cron 정리 순서 + 실무 적용 근거 왕복 + preview 무저장 + newsStats writer 3경로) OK");
