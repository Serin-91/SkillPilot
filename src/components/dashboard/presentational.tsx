"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 프레젠테이션 컴포넌트 (PHASE 0 ② 2순위).
// props만 받고 자체 state가 없는 것들이다. 로직은 한 글자도 안 고쳤다.
//
// 🔴 wrapForPortal / PORTAL_CONTEXT_CLASSES는 한 벌이다 — 따로 떼지 마라.

import { type MemoColor, MEMO_COLORS } from "@/lib/memo/types";
import { Lock, ArrowUp } from "lucide-react";
import { splitSentences } from "@/lib/ai/idea-text";
import { PROJECT_STATUS_META, AI_ERROR_COPY, KEEP_EDITOR_FOCUS } from "@/lib/dashboard/helpers";

// Idea Build 본문을 문장마다 줄바꿈해 렌더한다. <li> 안에서도 쓰이므로 <p>가 아니라 display:block
// span으로 끊는다 — li 안에 p를 넣으면 목록 마커와 첫 줄 baseline이 어긋난다.
// 문장이 하나뿐이면 span 하나라 기존 렌더와 시각적으로 동일하다.
export function SentenceLines({ text }: { text: string }) {
  return (
    <>
      {splitSentences(text).map((line, i) => (
        <span key={i} className="sentence-line">{line}</span>
      ))}
    </>
  );
}

// News/Job 미리보기 한 줄 — 왼쪽 소스 로고(없으면 생략) + 제목 + 보조 메타 텍스트
export function PreviewRow({ logo, title, meta, flat, logoClass }: { logo?: string; title: string; meta: string; flat?: boolean; logoClass?: string }) {
  return (
    <div className={`preview-row${flat ? " job-row" : ""}`}>
      {logo && (
        <div className={`row-logo-box${logoClass ? ` ${logoClass}` : ""}`}>
          <img src={logo} alt="" className="row-logo-img" />
        </div>
      )}
      <div className="preview-row-body">
        <div className="t">{title}</div>
        <div className="s">{meta}</div>
      </div>
    </div>
  );
}

// 비회원용 정적 Lock Preview — 실제 데이터를 blur 처리하는 게 아니라 아예 조회하지 않고
// 이 카드만 렌더링한다. 가짜 뉴스 제목/회사명은 넣지 않는다.
export function GuestLockCard({ kicker, title, description }: { kicker: string; title: string; description: React.ReactNode }) {
  return (
    <div className="guest-lock-card">
      <div className="guest-lock-kicker">{kicker}</div>
      <div className="guest-lock-title">{title}</div>
      <p className="guest-lock-description">{description}</p>
      <span className="guest-lock-action"><Lock size={18} strokeWidth={2.2} /> Sign in to view</span>
    </div>
  );
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const meta = PROJECT_STATUS_META[status] ?? PROJECT_STATUS_META["아이디어"];
  return (
    <span className={`project-status-badge project-status-badge--${meta.slug}`}>
      <span className="project-status-badge__dot" />
      {status}
    </span>
  );
}

// 프로젝트 상태 dropdown — 목록 필터(전체 포함)와 상세 페이지 상태 선택(전체 제외) 둘 다 여기서 재사용한다.
// native select는 옵션 팝업을 OS가 그려서 glass 톤·color chip을 못 입히므로 custom dropdown 사용
// 패널을 포털로 꺼내면 조상이 바뀌어서 조상 클래스에 의존하는 CSS가 통째로 안 먹는다.
// 실측으로 10개 규칙이 여기 걸려 있었다(.proj-detail-editing .proj-filter-panel의 width:98px !important,
// .proj-toolbar .project-status-filter-option의 크기, .projects-list-dialog .proj-toolbar ... 등).
// 그래서 원래 있던 자리의 조상 클래스들을 같은 중첩 순서로 다시 만들어 씌운다. 각 래퍼는
// display:contents라 상자를 만들지 않는다 — 셀렉터 매칭에만 참여하고 레이아웃에는 영향이 없다.
// (CSS를 10곳 고쳐 포털용 셀렉터를 덧붙이는 방법도 있지만, 그러면 앞으로 이 화면 규칙을 만질 때마다
//  두 벌을 맞춰 써야 한다. 조상을 재현하는 쪽이 고칠 곳이 없다.)
export const PORTAL_CONTEXT_CLASSES = ["projects-list-dialog", "proj-toolbar", "proj-detail-editing"];
export function wrapForPortal(node: React.ReactNode, from: HTMLElement | null): React.ReactNode {
  if (!from) return node;
  const chain = PORTAL_CONTEXT_CLASSES.filter((c) => from.closest(`.${c}`));
  // 바깥쪽부터 안쪽으로 중첩한다 — `.a .b .panel` 같은 규칙은 a와 b가 서로 다른 조상이어야 맞는다.
  return chain.reduceRight<React.ReactNode>(
    (child, cls) => <div className={cls} style={{ display: "contents" }}>{child}</div>,
    node
  );
}

export function ColorSwatches({ value, onChange }: { value: MemoColor; onChange: (c: MemoColor) => void }) {
  return (
    <div className="color-swatches">
      <span className="field-label">색상</span>
      {MEMO_COLORS.map((c) => (
        <span key={c} className={`swatch ${c} ${value === c ? "selected" : ""}`} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

// workspace `_reference/참고_구조&스타일/로딩중스타일.html`(Warp Loader) 포팅 — Today's Focus/Idea Build 생성 중 표시
export function WarpLoader() {
  return (
    <div className="warp-loader">
      <div className="ring" /><div className="ring" /><div className="ring" /><div className="ring" />
      <div className="core-glow" />
    </div>
  );
}

// Today's Focus·Idea Build 생성 중 화면. 로더 하나에 작은 문구만 있으면 넓은 모달이 휑해 보여서,
// 결과 카드가 들어올 자리를 스켈레톤으로 미리 잡아준다. 가짜 진행률(%)이나 단계 표시는 넣지 않는다.
export function AiLoadingStage({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="ai-loading-stage">
      <div className="ai-loading-orb"><WarpLoader /></div>
      <h4 className="ai-loading-title">{title}</h4>
      <p className="ai-loading-sub">{sub}</p>
      <div className="ai-loading-skeleton" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}

export function AiErrorState({ feature, isRetrying, onRetry }: { feature: keyof typeof AI_ERROR_COPY; isRetrying: boolean; onRetry: () => void }) {
  const copy = AI_ERROR_COPY[feature];
  return (
    <div className="ai-error-state">
      <div className="ai-error-state-icon-wrap" aria-hidden="true"><span className="ai-error-state-icon">⚠</span></div>
      <h4 className="ai-error-state-title">{copy.title}</h4>
      <p className="ai-error-state-desc">{copy.description}</p>
      <button type="button" className="ai-error-state-btn" onClick={onRetry} disabled={isRetrying} aria-busy={isRetrying}>
        {isRetrying ? "다시 시도 중..." : "다시 시도"}
      </button>
      {copy.helperText && <div className="ai-error-state-helper">🛡 {copy.helperText}</div>}
    </div>
  );
}

// ref는 React 19에서 함수 컴포넌트의 평범한 prop이다 — 별도 이름(btnRef 등)으로 넘기면
// react-hooks/refs가 "render 중 ref 접근"으로 오탐하므로 그대로 ref로 받는다.
export function ScrollTopButton({ ref, onClick }: { ref: React.Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    // 🔴 onPointerDown preventDefault — 이 버튼만 그게 빠져 있었다(실행취소·다시실행·삽입 버튼엔 전부 있다).
    // 없으면 탭하는 순간 본문이 blur돼 키보드가 닫히고, 그러면 --kb-inset이 326→0으로 떨어지면서
    // 편집창 padding-bottom이 그만큼 줄어 **스크롤러 높이가 도중에 바뀐다** — 그 리플로우가
    // scrollTo({behavior:"smooth"}) 애니메이션 한가운데서 일어나 스크롤이 멈춘 채로 남는다.
    // 포커스를 지키면 키보드가 그대로라 리플로우 자체가 없고, 맨 위로 간 뒤 바로 이어서 칠 수도 있다.
    <button type="button" ref={ref} className="scroll-top-btn" {...KEEP_EDITOR_FOCUS} onClick={onClick} aria-label="맨 위로 이동">
      <ArrowUp size={18} strokeWidth={2.2} />
    </button>
  );
}

// (2026-08-28: 문서 스크롤 페이지용 위로가기 DocScrollTopButton을 넣었다가 **사용자 요청으로 뺐다** —
//  "그냥 없애자, 뭔가 너무 조잡하다". 다시 만들지 마라. 요소 스크롤러를 쓰는 다른 화면
//  (본문 확장·프로젝트 상세·포스트잇 보기)의 ScrollTopButton은 그대로 둔다.)

// Dashboard.tsx에서 **그대로 옮겨온** 프로젝트 기본템플릿 추가 확인 팝업. 마크업·className·핸들러 무변경.
// 🔴 **작성창(`"form"`)과 확장창(`"bodyEditor"`) 둘이 같은 팝업을 쓴다** — 그래서 owner가
//   project-detail-dialog가 아니라 여기(공용 presentational)다. 한쪽 다이얼로그에 두면 나머지가
//   형제 파일을 import하게 되고, 마크업을 두 벌로 복제하면 팔레트처럼 어긋나기 시작한다.
// 🔴 **가드는 Dashboard와 각 사용처에 남아 있다** — 이 컴포넌트는 조건을 모른다. 여기로 옮기지 마라
//   (`projTemplatePromptNode`는 예전처럼 **항상 요소**여야 두 사용처의 truthy/삼항 검사가 안 갈린다).
// 🔴 `ConfirmDialog`와 달리 overlay에 `fixed-overlay`가 **없다** — 원본 그대로다. 합치지 마라.
export function ProjectTemplatePrompt({ onCancel, onAppend }: { onCancel: () => void; onAppend: () => void }) {
  return (
    <div className="postit-overlay open" onClick={onCancel}>
      <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="copy-picker-title">현재 내용이 있습니다.<br />기본 템플릿을 현재 내용 아래에 추가할까요?</div>
        <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="cancel-btn" onClick={onCancel}>취소</button>
          <button className="save-btn" onClick={onAppend}>추가</button>
        </div>
      </div>
    </div>
  );
}

// Dashboard.tsx에서 **그대로 옮겨온** 공용 확인 팝업(재-Audit 후보 ⑧). 마크업·className·핸들러 무변경.
// 🔴 **state와 askConfirm은 Dashboard가 계속 소유한다** — 여기는 props만 받는 presentational이다.
//   그리고 `confirmDialog && (...)` **가드도 Dashboard에 남겨 뒀다**. 그래야 confirmDialogNode의 값이
//   예전처럼 null이라 7개 사용처(직접 렌더 4 · prop 전달 3)가 한 글자도 안 바뀐다.
//   여기로 가드를 옮기면 노드가 "항상 요소"가 되어 prop 쪽 truthy 검사가 갈린다. 옮기지 마라.
export function ConfirmDialog({ confirmDialog, setConfirmDialog }: {
  confirmDialog: { message: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; hideCancel?: boolean };
  setConfirmDialog: (v: null) => void;
}) {
  return (
    <div className="postit-overlay fixed-overlay open" onClick={() => setConfirmDialog(null)}>
      <div className="panel copy-picker confirm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="copy-picker-title">{confirmDialog.message}</div>
        <div className="form-actions" style={{ justifyContent: "center", marginTop: 16 }}>
          {!confirmDialog.hideCancel && <button className="cancel-btn" onClick={() => setConfirmDialog(null)}>취소</button>}
          <button
            className="save-btn"
            onClick={async () => {
              const { onConfirm } = confirmDialog;
              setConfirmDialog(null);
              // 삭제 등은 실패해도 여기서 조용히 묻히지 않도록 await하고, 실패 시 사용자에게 알린다 —
              // handleDeleteMemo/handleDeleteProject 쪽은 성공(await 통과) 이후에만 UI에서 지운다.
              try {
                await onConfirm();
              } catch (err) {
                console.error(err);
                alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
              }
            }}
          >
            {confirmDialog.confirmLabel ?? "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}
