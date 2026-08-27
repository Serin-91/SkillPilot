// 실행: npx tsx src/lib/news/kst.check.ts
//
// 검사 대상은 "이 배치가 크론이 만든 건가" 판정 하나다. 이게 틀리면 두 방향으로 다 터진다:
// 느슨하면 새벽 수동 배치가 아침 크론을 계속 스킵시키고(2026-08-25 실측), 빡세면 크론이 자기가
// 방금 만든 배치를 지우고 재수집해 하루에 두 번 돈다.
import assert from "node:assert/strict";
import { isBeforeDailyGenerationTime, dailyGenerationCutoffISO } from "./kst.ts";

// KST 예약 시각은 10:10 = UTC 01:10. UTC 기준으로 경계 앞뒤를 직접 넣는다.
assert.equal(isBeforeDailyGenerationTime("2026-08-24T16:38:24.746Z"), true, "KST 01:38 — 실제로 아침 크론을 죽인 그 배치");
assert.equal(isBeforeDailyGenerationTime("2026-08-25T01:09:59.000Z"), true, "KST 10:09:59 — 예약 1초 전");
assert.equal(isBeforeDailyGenerationTime("2026-08-25T01:10:00.000Z"), false, "KST 10:10:00 — 예약 정시는 크론 몫");
assert.equal(isBeforeDailyGenerationTime("2026-08-25T02:05:33.000Z"), false, "KST 11:05 — Hobby 지연 실측값(08-24 크론)");
assert.equal(isBeforeDailyGenerationTime("2026-08-25T14:59:00.000Z"), false, "KST 23:59 — 같은 날 늦은 시각도 예약 이후다");
assert.equal(isBeforeDailyGenerationTime("2026-08-25T15:00:00.000Z"), true, "KST 다음날 00:00 — 자정을 넘기면 다시 '예약 전'이다");

// cutoff는 오늘 KST 10:10을 가리켜야 한다. 그 값 자신은 "예약 전"이 아니다(경계 포함 방향 확인) —
// 이 두 함수가 CRON_SCHEDULED_MIN을 공유하는지가 여기서 드러난다.
const cutoff = dailyGenerationCutoffISO();
assert.equal(isBeforeDailyGenerationTime(cutoff), false, "cutoff 자신은 예약 이후로 판정돼야 한다");
assert.equal(isBeforeDailyGenerationTime(new Date(new Date(cutoff).getTime() - 1000).toISOString()), true, "cutoff 1초 전은 예약 전");
// cutoff는 오늘(KST) 날짜여야 한다 — offset을 잘못 더하면 어제나 내일 10:10이 나온다.
const cutoffKSTDate = new Date(new Date(cutoff).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const todayKSTDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
assert.equal(cutoffKSTDate, todayKSTDate, "cutoff는 오늘 KST 날짜의 예약 시각이어야 한다");
assert.equal(new Date(new Date(cutoff).getTime() + 9 * 3600e3).toISOString().slice(11, 16), "10:10");

console.log("kst.check.ts 통과");
