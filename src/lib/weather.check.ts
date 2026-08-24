// 자체 점검: `npx tsx src/lib/weather.check.ts` (generate.check.ts와 같은 방식 — weather.ts가 경로
// 별칭 @/lib/...를 쓰기 때문에 node의 type stripping만으로는 해석이 안 된다).
// tsx는 CJS로 변환하므로 top-level await를 못 쓴다 — 전부 main() 안에 둔다.
//
// 2026-08-24 실제 사고 재현: 기상청 API 응답이 안 와서 /reset-password 정적 프리렌더가 60초 상한에
// 세 번 걸렸고 **Vercel 배포가 통째로 실패**했다. withDeadline은 그 재발을 막는 장치다.
// "느려도 결국 오면 되지"가 아니라 **정해진 시간에 반드시 끝난다**가 이 함수의 계약이다.
import assert from "node:assert/strict";
import { withDeadline } from "./weather.ts";

const never = <T,>() => new Promise<T>(() => {}); // 영원히 안 끝나는 응답 = 사고 당시 상황
const after = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

async function main() {
  // ── 계약 1: 안 끝나는 약속이어도 데드라인에 fallback으로 끝난다 ─────────────────────
  const t = Date.now();
  assert.equal(await withDeadline(never<string>(), 50, "fallback"), "fallback", "응답이 안 오면 fallback이다");
  const dt = Date.now() - t;
  assert.ok(dt >= 45 && dt < 400, `데드라인 근처에서 끝나야 한다 (실제 ${dt}ms)`);

  // ── 계약 2: 제때 오면 그 값을 그대로 준다 (데드라인이 값을 가로채면 안 된다) ──────────
  assert.equal(await withDeadline(after(10, "real"), 200, "fallback"), "real");

  // ── 계약 3: 거부(reject)도 fallback이다 — 던지면 페이지가 통째로 죽는다 ───────────────
  assert.equal(await withDeadline(Promise.reject(new Error("network")), 200, null), null);

  // ── 계약 4: null fallback이 그대로 전달된다 (WeatherView가 null 가능 타입이라 실제 쓰임) ──
  assert.equal(await withDeadline(never<string | null>(), 30, null), null);

  // ── 계약 5: 늦게 도착한 응답이 이미 확정된 결과를 뒤집지 않는다 ──────────────────────
  // (race를 잘못 짜면 fallback으로 끝난 뒤 늦은 값이 또 resolve되며 미묘한 버그를 만든다)
  const v = await withDeadline(after(120, "late"), 30, "fallback");
  assert.equal(v, "fallback");
  await after(150, null); // 늦은 응답이 도착할 시간을 준다
  assert.equal(v, "fallback", "이미 확정된 값은 늦은 응답에 바뀌지 않는다");

  // ── 계약 6: 대기 중인 다른 작업이 없어도 데드라인이 반드시 울린다 ──────────────────
  // 예전엔 타이머에 unref()를 걸었다가 여기서 걸렸다 — unref된 타이머는 이벤트 루프를 살려두지
  // 않아서, 이 체크가 아무것도 출력하지 않고 exit 0으로 조용히 끝났다(계약 1~5가 통과한 게
  // 아니라 아예 실행되지 않은 것이다). 이 파일이 "OK"를 찍는다는 사실 자체가 그 회귀 감시다.
  assert.equal(await withDeadline(never<number>(), 40, -1), -1, "다른 핸들이 없어도 데드라인은 울린다");

  console.log("weather.check.ts OK");
}

void main();
