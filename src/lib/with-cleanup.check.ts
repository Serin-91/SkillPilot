// 자체 점검: `npx tsx src/lib/with-cleanup.check.ts`
//
// 지키는 것: `withCleanup`이 **옛 `try/finally`와 정확히 같게** 동작한다.
// 호출부 9곳이 전부 "로딩 플래그를 반드시 푼다"를 여기에 맡기고 있다 — 이 계약이 깨지면
// 화면이 "저장 중…"에 영구히 갇히고 버튼이 죽는다(useTodaysFocus 주석이 적어둔 실제 사고).
// 정상 종료 / early return / throw 세 경로를 전부 센다. 하나라도 빠지면 그 경로만 조용히 샌다.
import assert from "node:assert/strict";
import { withCleanup } from "@/lib/with-cleanup";

let cases = 0;
const run = async (label: string, fn: () => Promise<void>) => { cases++; await fn().catch((e) => { throw new Error(label + " → " + e.message); }); };

async function main() {
await run("① 정상 종료", async () => {
  let cleaned = 0;
  const r = await withCleanup(async () => "done", () => { cleaned++; });
  assert.equal(r, "done", "body의 반환값이 그대로 나와야 한다");
  assert.equal(cleaned, 1, "정상 종료에서 cleanup이 정확히 1번");
});

await run("② early return", async () => {
  let cleaned = 0, after = false;
  await withCleanup(async () => {
    if (1 > 0) return;          // 호출부의 `if (result.error) { ...; return; }` 모양
    after = true;
  }, () => { cleaned++; });
  assert.equal(after, false, "return 뒤 코드는 실행되지 않는다");
  assert.equal(cleaned, 1, "🔴 early return에서도 cleanup이 실행돼야 한다 — 옛 finally의 핵심");
});

await run("③ throw — cleanup 실행 + 에러 재전파", async () => {
  let cleaned = 0, caught: unknown = null;
  await withCleanup(async () => { throw new Error("boom"); }, () => { cleaned++; })
    .catch((e) => { caught = e; });
  assert.equal(cleaned, 1, "🔴 throw에서도 cleanup이 실행돼야 한다 — 안 되면 로딩이 영구 고착된다");
  assert.ok(caught instanceof Error && caught.message === "boom",
    "🔴 에러를 삼키면 안 된다 — 옛 try/finally도 삼키지 않았다");
});

await run("④ cleanup은 body보다 나중에, 정확히 한 번", async () => {
  const order: string[] = [];
  await withCleanup(async () => { order.push("body"); }, () => { order.push("cleanup"); });
  assert.deepEqual(order, ["body", "cleanup"], "순서는 body → cleanup");
});

await run("⑤ 음성 대조 — cleanup을 안 부르는 구현이면 ②가 잡힌다", async () => {
  // 일부러 틀린 구현(finally 없이 정상 경로에서만 정리)을 만들어, 위 ②가 실제로 실패하는지 확인한다.
  const broken = async <T,>(body: () => Promise<T>, cleanup: () => void) => { const r = await body(); cleanup(); return r; };
  let cleaned = 0;
  await broken(async () => { throw new Error("x"); }, () => { cleaned++; }).catch(() => {});
  assert.equal(cleaned, 0, "틀린 구현은 throw에서 cleanup을 건너뛴다 — 그래서 ③이 의미가 있다");
});

console.log(`with-cleanup.check: OK — ${cases}개 경로(정상·early return·throw·순서·음성대조)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
