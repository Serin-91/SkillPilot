"use client";

// Dashboard.tsx에서 **그대로 옮겨온** My Page / 계정 세션 (Dashboard ownership Audit 1순위).
// 로직은 한 글자도 안 고쳤다 — `useDialogRegistry`·`useMemoEditSession`과 같은 이동 전용 추출이다.
//
// 여기 모인 것: 프로필(닉네임·관심 직무) / 비밀번호 변경(현재 비밀번호 실시간 대조 포함) /
//               System Status 탭(관리자) / My Page 열기·저장.
//
// 🔴 이 훅은 `open`이 필요하므로 **`useDialogRegistry` 호출 뒤에** 불러야 한다.
//   훅 순서는 항상 같아야 하니 조건부로 부르지 마라. 옮길 당시 이 클러스터의 심볼을
//   훅 밖(비-JSX)에서 참조하는 곳은 **0개**였다 — 그래서 위치를 내려도 안전했다.
//
// 🔴 `myPageRef`와 `dialogs` 리터럴은 **Dashboard에 그대로 남는다**(useDialogRegistry와 같은 이유).
//   훅은 `dialogs`를 인자로 받아 원문 그대로 `open(dialogs.myPage)`를 부른다.

import { useRef, useState } from "react";
import { type FieldState } from "@/components/auth/WaveField";
import { updateProfile, changePassword, verifyCurrentPassword } from "@/lib/actions/auth";
import { getSystemStatus as getSystemStatusAction, type DayStatus } from "@/lib/actions/admin-status";
import { type SystemStatusErrorState } from "@/lib/dashboard/helpers";
import type { JobRole } from "@/lib/jobs/roles";

export function useMyPageSession(opts: {
  nickname: string | null;
  jobRolePriority: JobRole[];
  hasPasswordLogin: boolean;
  /** ref 묶음을 그대로 받는다 — 본문이 원문대로 `dialogs.myPage`를 쓰게 하려는 것뿐이다. */
  dialogs: { myPage: React.RefObject<HTMLDialogElement | null> };
  open: (d: React.RefObject<HTMLDialogElement | null>) => void;
  close: (d: React.RefObject<HTMLDialogElement | null>) => void;
}) {
  const { nickname, jobRolePriority, hasPasswordLogin, dialogs, open, close } = opts;


  // My Page — 기존 dialog 구조를 그대로 쓴다. 닉네임/관심 직무/비밀번호 변경/로그아웃만 둔다.
  const [myNickname, setMyNickname] = useState(nickname ?? "");
  // myRoles는 체크된 집합이자 그 순서 그대로 priority다(JobRolePicker의 value와 동일한 패턴) — 초기값은
  // 저장된 우선순위(jobRolePriority)를 쓴다.
  const [myRoles, setMyRoles] = useState<JobRole[]>(jobRolePriority);
  const [myPageMessage, setMyPageMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  // 이메일 링크가 아니라 My Page 안에서 바로 변경한다
  // 현재 비밀번호 — 세션만으로 비밀번호를 바꿀 수 있으면 잠깐 빌려준 기기 하나가 계정 탈취가 된다.
  // 검증은 서버(actions/auth.ts changePassword)가 하고, 여기서는 값만 받아 넘긴다.
  const [myCurrentPassword, setMyCurrentPassword] = useState("");
  const [myPassword, setMyPassword] = useState("");
  const [myPasswordConfirm, setMyPasswordConfirm] = useState("");
  const myPasswordConfirmState: FieldState = myPassword.length > 0 && myPassword.length < 8
    ? { kind: "error", message: "비밀번호는 8자 이상 입력해주세요." }
    : myPasswordConfirm.length === 0
      ? null
      : myPassword === myPasswordConfirm
        ? { kind: "success", message: "비밀번호가 일치합니다." }
        : { kind: "error", message: "비밀번호가 일치하지 않습니다." };
  // 🔴 현재 비밀번호 "일치 여부"를 **타이핑 중에** 보여준다(사용자 요청 3회).
  //
  // 확인칸은 두 값을 비교하면 끝이지만 이건 서버만 아는 값이라, 예전 구현은 "저장을 눌러야"
  // 문구가 떴다 — 그게 신고가 세 번 반복된 이유다. 값이 아니라 **문제 정의**가 달랐다.
  // 이제 입력이 멈추고 500ms 뒤 verifyCurrentPassword를 부른다(메모 자동저장과 같은 디바운스 패턴).
  //
  // ⚠️ 응답이 순서를 바꿔 도착하면 옛 판정이 새 입력을 덮는다 — 요청마다 seq를 붙여
  //    **마지막 요청의 응답만** 반영한다. 그 사이 값이 또 바뀌면 그 응답은 버린다.
  const [myCurrentPasswordError, setMyCurrentPasswordError] = useState<string | null>(null);
  const [myCurrentPwCheck, setMyCurrentPwCheck] = useState<"idle" | "checking" | "match" | "wrong">("idle");
  const pwCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pwCheckSeq = useRef(0);
  function onCurrentPasswordChange(value: string) {
    setMyCurrentPassword(value);
    if (myCurrentPasswordError) setMyCurrentPasswordError(null);
    if (pwCheckTimer.current) clearTimeout(pwCheckTimer.current);
    if (!value) { setMyCurrentPwCheck("idle"); return; }
    setMyCurrentPwCheck("checking");
    const seq = ++pwCheckSeq.current;
    pwCheckTimer.current = setTimeout(async () => {
      const r = await verifyCurrentPassword(value).catch(() => null);
      if (seq !== pwCheckSeq.current) return;   // 더 최근 입력이 있다 — 이 응답은 버린다
      setMyCurrentPwCheck(r?.match ? "match" : "wrong");
    }, 500);
  }
  const myCurrentPasswordState: FieldState = myCurrentPasswordError
    ? { kind: "error", message: myCurrentPasswordError }
    : myCurrentPwCheck === "match"
      ? { kind: "success", message: "현재 비밀번호가 일치합니다." }
      : myCurrentPwCheck === "wrong"
        ? { kind: "error", message: "현재 비밀번호가 일치하지 않습니다." }
        : null;   // idle·checking에는 문구를 안 띄운다 — 확인 중 깜빡이는 게 더 산만하다
  // 🔴 비밀번호 칸을 탭하면 **스크롤러 위쪽으로 데려온다.**
  //
  // 껍데기에 `--kb-inset`을 먹인 것(dashboard.css)으로 "칸이 키보드 뒤에 깔린다"는 풀렸지만,
  // 그것만으로는 칸이 **키보드 바로 위**에 걸린다. 거기는 크롬의 autofill 액세서리 바
  // (열쇠·카드 칩)가 사는 자리라 그 칩들이 칸을 덮는다 — 그 바는 우리가 못 없앤다(지뢰표
  // "키보드 위는 우리 영역이 아니다"). 없앨 수 없으면 **칸을 그 위로 올리는 수밖에 없다.**
  //
  // ⚠️ `block: "start"`가 아니라 `"center"`다. start면 칸이 스크롤러 맨 위에 붙어 라벨(wave-label)이
  //    잘리고, 아래 보조문구("일치합니다")가 화면 밖으로 나간다. center는 라벨·문구를 같이 데려온다.
  // ⚠️ 지연 250ms: 키보드가 올라오며 `vv.height`가 줄어든 **뒤에** 재야 맞는 자리로 간다.
  //    0ms면 아직 키보드 전 높이라 엉뚱한 데로 간다. (메모 편집의 캐럿 노출과 달리 여기는
  //    요소 스크롤러라 지뢰표의 "캐럿 소유자" 규칙과 충돌하지 않는다 — 그 규칙은
  //    `.memo-edit-page`(문서가 스크롤러) 전용이다.)
  // ⚠️ `behavior: "auto"` — smooth는 실측상 420ms 멈춰 있다가 움직여서 그 사이 리플로우가 끼면
  //    멈춘 채 남는다(지뢰표).
  function revealMyPageField(e: React.FocusEvent<HTMLInputElement>) {
    // 🔴 input이 아니라 **래퍼**를 굴린다 — 라벨(wave-label)과 아래 보조문구
    //    ("일치합니다")까지 한 덩어리로 데려와야 한다. input만 굴리면 라벨이 위로 잘린다.
    // 🔴 `.mypage-field`(닉네임 칸)도 같이 잡는다 — 그쪽은 래퍼가 `.wave-field`가 아니라
    //    폴백(`e.currentTarget` = input)으로 떨어져 라벨 "Nickname"이 잘렸다. 여기 한 곳만
    //    넓히면 두 칸이 같은 규칙을 쓴다 — 닉네임 전용 경로를 새로 만들지 마라.
    // 🔴 `block: "start"` — center로는 액세서리 바(열쇠·카드 칩)를 못 피한다는 신고를 받았다.
    //    start로 올리고, 라벨이 스크롤러 천장에 붙지 않게 여유는 CSS `scroll-margin-top`이 준다
    //    (dashboard.css `.mypage-card .wave-field`). 값을 여기 px로 박지 않는 이유는 그 여유가
    //    레이아웃(safe-area·패딩) 쪽 값이라서다.
    const el = (e.currentTarget.closest(".wave-field, .mypage-field") as HTMLElement | null) ?? e.currentTarget;
    window.setTimeout(() => el.scrollIntoView({ block: "start", behavior: "auto" }), 250);
  }
  // System Status(관리자 전용) — 탭을 처음 열 때만 서버에서 가져오고, 이후 같은 모달 세션에서는 재사용한다.
  // "상태 다시 확인" 버튼도 이 fetch 함수를 그대로 다시 부른다(cron/뉴스/채용 재실행은 안 함, 조회만).
  const [myPageTab, setMyPageTab] = useState<"account" | "status">("account");
  const [systemStatus, setSystemStatus] = useState<DayStatus[] | null>(null);
  const [systemStatusError, setSystemStatusError] = useState<SystemStatusErrorState | null>(null);
  const [systemStatusFetchedAt, setSystemStatusFetchedAt] = useState<string | null>(null);
  const [systemStatusLoading, setSystemStatusLoading] = useState(false);
  function openMyPage() {
    setMyNickname(nickname ?? "");
    setMyRoles(jobRolePriority);
    setMyCurrentPassword("");
    setMyPassword("");
    setMyPasswordConfirm("");
    setMyCurrentPasswordError(null);
    setMyCurrentPwCheck("idle");
    pwCheckSeq.current++;   // 진행 중인 대조 응답을 버린다
    setMyPageMessage(null);
    setMyPageTab("account");
    open(dialogs.myPage);
  }
  function refreshSystemStatus() {
    setSystemStatusLoading(true);
    setSystemStatusError(null);
    getSystemStatusAction()
      .then((result) => {
        if ("error" in result) setSystemStatusError({ message: result.error, reason: result.reason, at: result.at });
        else { setSystemStatus(result.days); setSystemStatusFetchedAt(result.fetchedAt); }
      })
      .catch((e) => setSystemStatusError({ message: e instanceof Error ? e.message : String(e), reason: "query_failed", at: new Date().toISOString() }))
      .finally(() => setSystemStatusLoading(false));
  }
  function openSystemStatusTab() {
    setMyPageTab("status");
    if (systemStatus || systemStatusLoading) return;
    refreshSystemStatus();
  }
  // 비밀번호 변경도 이 버튼 하나로 처리한다 — 새 비밀번호를 입력했을 때만 같이 반영한다
  async function handleSaveProfile() {
    if (myPassword.length > 0 && (myPassword.length < 8 || myPassword !== myPasswordConfirm)) {
      setMyPageMessage({ kind: "error", text: "비밀번호를 확인해주세요." });
      return;
    }
    // 서버도 같은 것을 막지만, 왕복 한 번을 아끼고 어느 칸이 비었는지 바로 알려준다.
    // 폼 아래 공통 자리가 아니라 **그 칸 밑**에 그린다 — 어느 칸 얘기인지가 문구에 안 들어간다.
    if (myPassword.length > 0 && hasPasswordLogin && !myCurrentPassword) {
      setMyCurrentPasswordError("현재 비밀번호를 입력해주세요.");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await updateProfile(myNickname, myRoles, myRoles);
      if (result.error) { setMyPageMessage({ kind: "error", text: result.error }); return; }
      if (myPassword) {
        const pwResult = await changePassword(myCurrentPassword, myPassword, myPasswordConfirm);
        if (pwResult.error) {
          if ("field" in pwResult && pwResult.field === "current") setMyCurrentPasswordError(pwResult.error);
          else setMyPageMessage({ kind: "error", text: pwResult.error });
          return;
        }
        setMyCurrentPassword("");
        setMyPassword("");
        setMyPasswordConfirm("");
        setMyCurrentPasswordError(null);
    setMyCurrentPwCheck("idle");
    pwCheckSeq.current++;   // 진행 중인 대조 응답을 버린다
      }
      setMyPageMessage(null);
      // router.refresh() 없음 — updateProfile이 revalidatePath("/")를 부르므로 그 액션 응답이 이미
      // 새 props를 실어 온다(refreshAfterMemoChange 주석 참고).
      setSaveToast(true);
      setTimeout(() => { setSaveToast(false); close(dialogs.myPage); }, 1200);
    } finally {
      setSavingProfile(false);
    }
  }

  return {
    myNickname, setMyNickname,
    myRoles, setMyRoles,
    myPageMessage,
    savingProfile,
    saveToast,
    myCurrentPassword,
    myPassword, setMyPassword,
    myPasswordConfirm, setMyPasswordConfirm,
    myPasswordConfirmState,
    myCurrentPasswordState,
    onCurrentPasswordChange,
    revealMyPageField,
    myPageTab, setMyPageTab,
    systemStatus,
    systemStatusError,
    systemStatusFetchedAt,
    systemStatusLoading,
    refreshSystemStatus,
    openSystemStatusTab,
    openMyPage,
    handleSaveProfile,
  };
}
