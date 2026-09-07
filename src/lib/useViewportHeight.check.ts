// useViewportHeight의 튐 방어 검사 — 실기기 실측값으로만 판정한다.
//
// 왜 검사가 필요한가: 이 분기가 회귀하면 **자동 새로고침에서만** 실패한다. 손가락이 화면에
// 있으면 곧 정상 resize가 와서 자기 보정되므로, 수동으로는 아무리 눌러봐도 안 나온다.
// 사용자가 "반쯤 짤렸다가 바로 돌아온다"고 신고한 그 창이고, 수치를 잡을 수도 없었다.
//
// 🔴 지뢰표 규칙: "0이 나와야 한다" 검사에는 **음성 대조를 같은 블록에** 박아라.
//    여기서는 ② 블록이 그것이다 — 방어가 통째로 죽어도 ①만 있으면 초록불이 된다.

import assert from "node:assert/strict";
import { isSpikedViewportHeight } from "./useViewportHeight";

// ── ① 튐은 반드시 걸러진다 (실기기 실측, iPhone Chrome + 네이버 키보드, 684px 화면) ──
// 이 파일 본체 93~96줄이 기록한 두 값이다.
assert.equal(isSpikedViewportHeight(341, 684, false), true, "50% 튐(vvH=341)이 안 걸렸다");
assert.equal(isSpikedViewportHeight(113, 684, false), true, "83% 튐(vvH=113)이 안 걸렸다");
// 주소창이 접힌 큰 뷰포트 기준에서도 같은 튐이 온다
assert.equal(isSpikedViewportHeight(341, 792, false), true, "inner=792에서 341 튐이 안 걸렸다");

// ── ② 음성 대조: 정상값은 **반드시 통과**해야 한다 ──
// 이 블록이 없으면 `return true`로 굳어도 ①이 전부 통과해 초록불이 된다.
// 그러면 vv 이벤트가 통째로 죽어 --app-vh/--kb-inset이 영원히 갱신되지 않는다.
assert.equal(isSpikedViewportHeight(684, 684, false), false, "정상 동일값이 튐으로 걸렸다");
// 주소창 접힘/펴짐 — 실기기 792↔684, 최대 어긋남 14%
assert.equal(isSpikedViewportHeight(684, 792, false), false, "주소창 접힘(684/792)이 튐으로 걸렸다");
assert.equal(isSpikedViewportHeight(792, 684, false), false, "vv가 더 큰 경우가 튐으로 걸렸다");
// 진짜 리사이즈·회전 — vv와 inner가 **같이** 움직이므로 비율이 유지된다
assert.equal(isSpikedViewportHeight(400, 400, false), false, "진짜 리사이즈(400/400)가 튐으로 걸렸다");
assert.equal(isSpikedViewportHeight(375, 375, false), false, "가로 회전(375/375)이 튐으로 걸렸다");

// ── ③ 편집 중에는 절대 걸지 않는다 ──
// 그때 vv가 떨어지는 것은 정상이다(키보드가 실제로 가린다). 여기서 걸면 --kb-inset이
// 갱신되지 않아 키보드 보정이 통째로 죽는다 = 이 파일이 경고하는 "스크롤 잠김".
assert.equal(isSpikedViewportHeight(341, 684, true), false, "편집 중인데 가드가 걸렸다");
assert.equal(isSpikedViewportHeight(113, 684, true), false, "편집 중인데 가드가 걸렸다(극단값)");
// focusout 직후 — 키보드는 열려 있는데 activeElement가 버튼이라 editing=false인 찰나.
// 이 iOS는 키보드가 열릴 때 innerHeight도 같이 줄이므로(파일 상단 12~20줄) 둘 다 358이고 통과한다.
assert.equal(isSpikedViewportHeight(358, 358, false), false, "focusout 찰나가 튐으로 걸렸다");

// ── ④ 경계값 — 임계는 innerHeight의 66%다 (684 × 0.66 = 451.44) ──
// 💀 이 블록이 처음에 틀렸다. 451을 "66% 바로 위"로 적었는데 451 < 451.44라 **아래**다.
//    검사가 그 실수를 잡았다 — 경계값은 계산해서 넣지 말고 곱해서 확인해라.
assert.equal(684 * 0.66, 451.44, "임계 계산이 바뀌었다 — 아래 두 줄을 다시 재라");
assert.equal(isSpikedViewportHeight(452, 684, false), false, "임계 바로 위(452)가 걸렸다");
assert.equal(isSpikedViewportHeight(451, 684, false), true, "임계 바로 아래(451)가 안 걸렸다");

console.log("useViewportHeight.check.ts OK — 튐 3건 차단 / 정상 6건 통과(음성 대조) / 편집 중 3건 무개입");
