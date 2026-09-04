"use client";

// PHASE 1 ④ — Dashboard.tsx의 My Page(설정) 다이얼로그를 **그대로 옮겨온** 것이다.
// 계획서 §2 결합도 표: 92줄 / 참조 26개 중 **23개가 전용** / 공유 3 — "가장 깨끗한 후보"로 적힌 항목.
//
// 🔴 **옮기기만 했다. 로직·CSS·state 소유권·mount 타이밍을 하나도 바꾸지 않았다**(계획서 §7-2).
//   - state 26개는 전부 Dashboard에 그대로 있다. 여기로 내린 것은 **0개**다.
//   - `<dialog>` 엘리먼트를 그대로 유지한다. 💀 `<div>`로 바꾸면 `dialog` 타입 셀렉터에 묶인
//     CSS가 통째로 죽는다(지뢰표: "편집 화면을 일반 페이지로 옮길 때 `<div>`로 바꾸지 마라").
//     `className="glass-dialog mypage-dialog"`도 한 글자도 바꾸지 않았다 —
//     `html.kb-open dialog.glass-dialog.mypage-dialog .dialog-inner`가 `--kb-inset`을 먹이는
//     규칙이 이 클래스 조합에 걸려 있다(지뢰표 "껍데기는 넷이다" 행).
//   - `ref`는 Dashboard의 `myPageRef` 객체를 **그대로** prop으로 받아 붙인다. 레지스트리
//     (`dialogs.myPage`)가 가리키는 대상이 바뀌지 않아야 open/close가 그대로 동작한다.
//   - ✕ 버튼의 `close(dialogs.myPage)` 호출식은 **호출부(Dashboard)에 남겼다** — `close`와
//     `dialogs`를 자식으로 내리지 않기 위해서다. 클로저가 같은 모듈이라 동작은 동일하다.

import type { RefObject } from "react";
import { UserRound, Briefcase, Lock } from "lucide-react";
import { WaveField, type FieldState } from "@/components/auth/WaveField";
import { JobRolePicker } from "@/components/auth/JobRolePicker";
import { SystemStatusPanel } from "@/components/dashboard/widgets";
import type { DayStatus } from "@/lib/actions/admin-status";
import type { SystemStatusErrorState } from "@/lib/dashboard/helpers";
import type { JobRole } from "@/lib/jobs/roles";

export type MyPageDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: React.MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  isAdmin: boolean;
  myPageTab: "account" | "status";
  setMyPageTab: (tab: "account" | "status") => void;
  openSystemStatusTab: () => void;
  systemStatus: DayStatus[] | null;
  systemStatusLoading: boolean;
  systemStatusError: SystemStatusErrorState | null;
  systemStatusFetchedAt: string | null;
  refreshSystemStatus: () => void;
  email: string | null;
  myNickname: string;
  setMyNickname: (value: string) => void;
  hasLegacyRoles: boolean;
  myRoles: JobRole[];
  setMyRoles: (roles: JobRole[]) => void;
  hasPasswordLogin: boolean;
  revealMyPageField: (e: React.FocusEvent<HTMLInputElement>) => void;
  myCurrentPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  myCurrentPasswordState: FieldState;
  myPassword: string;
  setMyPassword: (value: string) => void;
  myPasswordConfirm: string;
  setMyPasswordConfirm: (value: string) => void;
  myPasswordConfirmState: FieldState;
  myPageMessage: { kind: "ok" | "error"; text: string } | null;
  saveToast: boolean;
  savingProfile: boolean;
  handleSaveProfile: () => void;
};

export function MyPageDialog({
  dialogRef, onDialogBackdropClick, onCloseClick, isAdmin,
  myPageTab, setMyPageTab, openSystemStatusTab,
  systemStatus, systemStatusLoading, systemStatusError, systemStatusFetchedAt, refreshSystemStatus,
  email, myNickname, setMyNickname, hasLegacyRoles, myRoles, setMyRoles,
  hasPasswordLogin, revealMyPageField,
  myCurrentPassword, onCurrentPasswordChange, myCurrentPasswordState,
  myPassword, setMyPassword, myPasswordConfirm, setMyPasswordConfirm, myPasswordConfirmState,
  myPageMessage, saveToast, savingProfile, handleSaveProfile,
}: MyPageDialogProps) {
  return (
      <dialog className="glass-dialog mypage-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
        <div className="dialog-inner">
          <div className="mypage-header">
            <span className="mypage-avatar" aria-hidden="true"><UserRound size={30} strokeWidth={1.9} /></span>
            <div className="mypage-header-text">
              <h3 className="mypage-title">My Page</h3>
              <p className="mypage-subtitle">계정 정보와 설정을 관리하세요.</p>
            </div>
            {isAdmin && (
              <div className="mypage-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={myPageTab === "account"} onClick={() => setMyPageTab("account")}>My Page</button>
                <button type="button" role="tab" aria-selected={myPageTab === "status"} onClick={openSystemStatusTab}>System Status</button>
              </div>
            )}
            <button className="close-btn" onClick={onCloseClick}>✕</button>
          </div>

          <div className="mypage-content">
            {myPageTab === "status" && isAdmin ? (
              <SystemStatusPanel
                days={systemStatus} loading={systemStatusLoading} error={systemStatusError}
                fetchedAt={systemStatusFetchedAt} onRefresh={refreshSystemStatus}
              />
            ) : (
              <>
                <section className="mypage-card">
                  <div className="mypage-card-heading"><UserRound size={18} strokeWidth={2.2} />계정 정보</div>
                  <p className="mypage-card-desc">기본 계정 정보를 확인하고 관리할 수 있습니다.</p>
                  <div className="mypage-account-grid">
                    <div className="mypage-field">
                      <span className="mypage-field-label">Email <em>(변경 불가)</em></span>
                      <div className="mypage-readonly">{email ?? "-"}</div>
                    </div>
                    <div className="mypage-field">
                      <label className="mypage-field-label" htmlFor="mypage-nickname">Nickname</label>
                      <input id="mypage-nickname" className="mypage-input" type="text" value={myNickname} onChange={(e) => setMyNickname(e.target.value)} />
                    </div>
                  </div>
                </section>

                <section className="mypage-card">
                  <div className="mypage-card-heading"><Briefcase size={18} strokeWidth={2.2} />관심 직무 설정</div>
                  <p className="mypage-card-desc">선택한 직무를 기준으로 매일 새로운 채용공고 4개를 제공합니다.</p>
                  {hasLegacyRoles && (
                    <p className="auth-error" role="alert">
                      관심 직무 체계가 AI 중심으로 변경되었습니다. 관심 직무와 우선순위를 다시 설정해 주세요.
                    </p>
                  )}
                  {/* Signup/Onboarding과 같은 컴포넌트를 재사용한다 — 화면마다 4직무를 따로 하드코딩하지 않는다 */}
                  <JobRolePicker value={myRoles} onChange={setMyRoles} name="mypage-roles" />
                </section>

                {/* 🔴 Google 로그인 전용 계정에는 **보안 설정 카드를 통째로 안 그린다**(사용자 결정 2026-08-30).
                    그 계정은 비밀번호 identity가 없어서 대조할 "현재 비밀번호"가 존재하지 않는다 —
                    예전엔 현재 비밀번호 칸만 숨기고 새 비밀번호 칸 둘은 남겼는데, 그러면
                    **세션만 있으면 비밀번호가 심어지는** 경로가 된다(빌려준 기기 하나 = 영구 접근).
                    ⚠️ 화면만 숨기는 걸로 끝내지 마라 — 서버 액션은 여전히 직접 호출된다.
                    actions/auth.ts의 changePassword가 같은 조건으로 거절한다. 둘은 한 쌍이다. */}
                {hasPasswordLogin && (
                  <section className="mypage-card">
                    <div className="mypage-card-heading"><Lock size={18} strokeWidth={2.2} />보안 설정</div>
                    <p className="mypage-card-desc">계정 보안을 위한 비밀번호를 관리할 수 있습니다.</p>
                    <WaveField
                      label="현재 비밀번호" id="mypage-pw-current" type="password" autoComplete="current-password" onFocus={revealMyPageField}
                      placeholder="본인 확인을 위해 현재 비밀번호를 입력하세요"
                      value={myCurrentPassword}
                      onChange={(e) => onCurrentPasswordChange(e.target.value)}
                      state={myCurrentPasswordState}
                    />
                    <WaveField
                      label="새 비밀번호" id="mypage-pw" type="password" required minLength={8} autoComplete="new-password" onFocus={revealMyPageField}
                      placeholder="8자 이상 입력해 주세요" value={myPassword} onChange={(e) => setMyPassword(e.target.value)}
                    />
                    <WaveField
                      label="비밀번호 확인" id="mypage-pw2" type="password" required minLength={8} autoComplete="new-password" onFocus={revealMyPageField}
                      placeholder="비밀번호를 한 번 더 입력하세요" value={myPasswordConfirm} onChange={(e) => setMyPasswordConfirm(e.target.value)}
                      state={myPasswordConfirmState}
                    />
                  </section>
                )}
              </>
            )}
          </div>

          {myPageTab === "account" && myPageMessage && (
            <p className={myPageMessage.kind === "ok" ? "auth-info" : "auth-error"} role="status">{myPageMessage.text}</p>
          )}

          {myPageTab === "account" && (
            <div className="form-actions" style={{ marginTop: 18 }}>
              {saveToast && <div className="mini-toast">성공적으로 저장되었습니다.</div>}
              <button className="save-btn" disabled={savingProfile} onClick={handleSaveProfile}>
                {savingProfile ? "저장 중..." : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </dialog>
  );
}
