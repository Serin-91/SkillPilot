// 자체 점검: `node src/lib/layout-invariants.check.ts`
//
// 판정 함수가 틀리면 검사 전체가 거짓 안심이 된다 — "통과했는데 사용자 화면은 깨져 있음"이
// 이 프로젝트에서 실제로 여러 번 났다. 그래서 판정을 숫자 입력으로 직접 검증한다.
// 각 케이스는 실기기/로컬 실측에서 나온 값이다(2026-08-26 ~ 27).
import assert from "node:assert/strict";
import { judge, failures, SCROLLER_BOTTOM_TOLERANCE, type Measured } from "./layout-invariants.ts";

// 실측 기준 "정상" 상태 (375×684, 키보드 326px, 포스트잇 상세 편집, 패널 닫힘)
const healthy: Measured = {
  liveScrollers: 1,
  deadScrollers: 0,
  coveredTop: 39,        // 툴바만
  scrollMarginTop: 48,
  kbInset: 326,
  shellPadBottom: 326,   // 0 + safe(0) + kb-inset
  scrollerBottom: 358,
  visibleBottom: 358,
  vvOffsetTop: 0,
  shellTop: 0,
};
const with_ = (p: Partial<Measured>): Measured => ({ ...healthy, ...p });
const failing = (m: Measured) => failures(judge(m)).map((f) => f.name);

assert.deepEqual(failing(healthy), [], "정상 상태에서는 아무것도 안 걸려야 한다");
assert.equal(judge(healthy).length, 6, "불변식은 6개다 — 늘리면 이 숫자도 같이 올려라");

// ① 스크롤러가 둘이면 손가락이 엉뚱한 것을 굴린다("스크롤 잠김" 신고 대부분)
assert.deepEqual(failing(with_({ liveScrollers: 2 })), ["스크롤러 1개"]);
assert.deepEqual(failing(with_({ liveScrollers: 0 })), ["스크롤러 1개"], "0개도 비정상이다");

// ② 유령 스크롤러 — .sp-body가 overflow-x:hidden 한 줄로 이 상태가 됐던 그 건
assert.deepEqual(failing(with_({ deadScrollers: 1 })), ["유령 스크롤러 0개"]);

// ③ 덮는 높이 > scrollMargin.top → 캐럿이 패널 뒤 → iOS가 화면을 민다
//    실측: 패널 없음 39 / T 97 / 메모색상 97 / ⋯ 136, 예전 마진은 48 고정이었다.
for (const covered of [97, 136]) {
  assert.deepEqual(failing(with_({ coveredTop: covered, scrollMarginTop: 48 })),
    ["덮는 높이 ≤ scrollMargin.top"], `덮음 ${covered} > 48이면 걸려야 한다`);
}
// 지금 구현(실제 높이를 재서 넣음)은 통과해야 한다
assert.deepEqual(failing(with_({ coveredTop: 97, scrollMarginTop: 105 })), []);
assert.deepEqual(failing(with_({ coveredTop: 136, scrollMarginTop: 144 })), []);
assert.deepEqual(failing(with_({ coveredTop: 48, scrollMarginTop: 48 })), [], "같으면 통과(경계)");

// ④ 껍데기가 --kb-inset을 안 먹는 상태 — 프로젝트 편집창이 28px로 굳어 있던 그 건.
//    padding이 298px 모자라면 스크롤러가 그만큼 아래로 내려가 키보드 뒤에 깔린다(실측 649/785).
//    두 값을 따로 주는 게 아니라 **같이** 움직여야 실제 상태를 모형화한 것이다.
assert.deepEqual(failing(with_({ shellPadBottom: 28, scrollerBottom: 358 + (326 - 28) })), [
  "껍데기가 --kb-inset을 먹는다", "스크롤러 아랫변 == 키보드 상단",
], "padding이 모자라면 아랫변도 같이 어긋난다");
assert.deepEqual(failing(with_({ kbInset: 0, shellPadBottom: 24, scrollerBottom: 684, visibleBottom: 684 })), [],
  "키보드가 없으면 inset 검사는 건너뛴다");

// ⑤ 스크롤러 아랫변 — 위면 죽은 여백, 아래면 글이 키보드 뒤로 숨는다
assert.deepEqual(failing(with_({ scrollerBottom: 334 })), ["스크롤러 아랫변 == 키보드 상단"], "24px 죽은 여백");
assert.deepEqual(failing(with_({ scrollerBottom: 649 })), ["스크롤러 아랫변 == 키보드 상단"], "키보드 뒤로 291px 숨음");
assert.deepEqual(failing(with_({ scrollerBottom: 358 + SCROLLER_BOTTOM_TOLERANCE })), [], "허용 오차 안은 통과");
assert.deepEqual(failing(with_({ scrollerBottom: 358 + SCROLLER_BOTTOM_TOLERANCE + 1 })),
  ["스크롤러 아랫변 == 키보드 상단"], "허용 오차를 넘으면 걸린다");

// ⑥ iOS 화면 밀기 — 되돌리기가 안 돌면 vvTop이 남는다(실측 278일 때 본문이 47px만 보였다)
assert.deepEqual(failing(with_({ vvOffsetTop: 278, shellTop: -277 })), ["iOS 밀기가 상쇄됨"],
  "상쇄가 안 되면 껍데기가 -277에 있다 — 그게 실패 신호다");
// 🔴 vvTop이 남아 있어도 --vv-push로 상쇄돼 껍데기가 제자리면 **통과**다.
//    판정을 vvTop으로 하면 제대로 고쳐도 계속 실패로 떠서 검사를 못 믿게 된다.
assert.deepEqual(failing(with_({ vvOffsetTop: 45, shellTop: 0 })), [],
  "밀렸지만 상쇄됐으면 정상이다");

// 여러 개가 동시에 깨지는 상황도 전부 잡아야 한다 — 실제로 다섯이 동시에 있었던 적이 있다
const chaos = with_({
  liveScrollers: 3, deadScrollers: 2, coveredTop: 136,
  shellPadBottom: 28, scrollerBottom: 656, vvOffsetTop: 278, shellTop: -277,
});
assert.equal(failures(judge(chaos)).length, 6, "동시 파손은 전부 나열되어야 한다 — 하나만 보고 끝내지 마라");

// detail 문자열이 비어 있으면 화면에서 원인을 못 읽는다
for (const inv of judge(chaos)) assert.ok(inv.detail.length > 0, `${inv.name}에 수치가 없다`);


// ── 실기기 실측 케이스 (2026-08-27, iPhone Chrome + 네이버 키보드, ?debug=vp 스크린샷) ──────
// 사용자가 보낸 숫자를 그대로 넣는다. 추측이 아니라 **그 화면**이 다시 나오면 걸리게 하려는 것이다.

// (A) 키보드 닫힘 상태 — 예전 구현은 여기서 거짓 실패를 냈다.
//     scrollerBottom 659 / visibleBottom 684 / padBottom 24. 키보드가 없으면 스크롤러 아랫변이
//     화면 끝과 같을 이유가 없다(그 24px은 평상시 여백이다). 그래서 ⑤는 키보드가 있을 때만 본다.
assert.deepEqual(failing({
  liveScrollers: 1, deadScrollers: 0, coveredTop: 39, scrollMarginTop: 105,
  kbInset: 0, shellPadBottom: 24, scrollerBottom: 659, visibleBottom: 684, vvOffsetTop: 0, shellTop: 0,
}), [], "키보드가 닫혀 있으면 아랫변 검사는 건너뛴다 — 거짓 실패를 내면 검사를 안 믿게 된다");

// (B) 키보드 열림 + iOS가 45px 밀어버린 상태 — 실제 신고 화면.
//     shell이 t=-45로 올라가 스크롤러 아랫변이 295가 되고, 그 45px이 그대로 죽은 여백으로 보인다.
//     밀기와 아랫변 어긋남은 **같은 원인의 두 얼굴**이라 둘 다 걸려야 정상이다.
assert.deepEqual(failing({
  liveScrollers: 1, deadScrollers: 0, coveredTop: 39, scrollMarginTop: 105,
  kbInset: 343, shellPadBottom: 343, scrollerBottom: 295, visibleBottom: 341, vvOffsetTop: 45, shellTop: -45,
}), ["스크롤러 아랫변 == 키보드 상단", "iOS 밀기가 상쇄됨"],
  "45px 밀림은 46px 죽은 여백으로 나타난다 — 둘 다 잡아야 원인이 하나임을 알 수 있다");

// (C) 밀기만 없었다면 같은 수치가 전부 통과한다는 것 — 패딩 계산 자체는 맞았다는 증거.
//     684(shell) - 343(pad) = 341 = 키보드 상단. 즉 고칠 것은 밀기뿐이다.
assert.deepEqual(failing({
  liveScrollers: 1, deadScrollers: 0, coveredTop: 39, scrollMarginTop: 105,
  kbInset: 343, shellPadBottom: 343, scrollerBottom: 341, visibleBottom: 341, vvOffsetTop: 0, shellTop: 0,
}), [], "밀기가 없으면 우리 패딩 계산은 정확히 맞는다");

console.log("layout-invariants.check.ts OK");
