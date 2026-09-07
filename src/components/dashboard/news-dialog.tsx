"use client";

// PHASE 2 ⑪ — Dashboard.tsx의 **News 다이얼로그**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 3712–3818, 코드 106줄 · Dashboard 스코프 참조 22개)
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다**(사용자 지시). 동작·디자인 변경 0.
//   state 소유권 변경 0 · hook 이동 0 · ref 소유권 이동 0 · handler 로직 변경 0 ·
//   조건식 의미 변경 0 · className/key/inline style 변경 0 · 새 Context 0.
//
// 🔴 **왜 ⑨·⑬이 아니라 ⑪을 먼저 했나** — 09-07 재측정에서 셋 중 결합도가 가장 낮았다
//   (주석·문자열·구역 지역변수를 걷고 센 값):
//     ⑨ 채용   214줄 / 참조 24 / state 7 / 함수 13 / open·close 3회
//     ⑪ 뉴스   128줄 / 참조 22 / state 5 / 함수 13 / open·close 2회   ← 전 항목 최소
//     ⑬ Trend  252줄 / 참조 24 / state 5 / 함수 15 / open·close 2회
//   ⑨는 `expandedJobUrl`/`setExpandedJobUrl`이라는 **전용 state 소유권**과 두 곳에서 쓰이는
//   `renderJobCard`가 걸려 있어 "소유권을 안 옮긴다" 규약과 정면으로 부딪힌다. ⑪은 그게 없다.
//
// 🔴 **마운트 게이트 식은 Dashboard에 남겼다.** 이 컴포넌트는 **이미 걸러진 node만** 받는다
//   (`radialMenuNode` = `selectionMenu?.source.type === "news" ? radialMenuOverlay : null`,
//    `bigEditorNode` = `activeDialogKey === "news" ? bigEditorNode : null`).
//   ⑩ keynotes-dialog와 같은 규약이다 — 조건을 자식으로 내리면 그 판단이 두 벌이 되고,
//   지뢰표의 *"같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 마지막 사본이 이긴다"*가 되살아난다.
//   ⚠️ `bigEditorNode`는 `bigEditorHandleRef`가 붙는 자리다. 게이트를 여기로 내리지 마라.
//
// - ✕의 `close(dialogs.news)` **호출식은 호출부(Dashboard)에 남겼다** — ⑤·⑧·⑩과 같은 규약이고
//   `close`(55곳)·`dialogs`(58곳)를 자식으로 내리지 않기 위해서다.
// - `activeNewsItems`는 Dashboard가 `newsHistoryDate`로 고른 결과다.
//   💀 여기서 다시 계산하지 마라 — 그러면 날짜 선택 로직이 두 벌이 된다(⑤ `filteredProjects`와 같은 이유).
// - `historyDateLabel`도 Dashboard 소유 함수를 **그대로 받는다.** 순수 함수처럼 보여도
//   여기로 옮기면 소유권 이동이고, 그건 이번 단계의 금지 항목이다.
// - `AiLoadingStage`·`AiErrorState`·`formatUpdatedAt`은 이미 공용 모듈에 있으므로 **직접 import**한다
//   (prop으로 받지 않는다 — ⑥ focus-dialog·⑦ idea-dialog와 같다).
// - className·이모지·문구·`key`·`<span>` 구조를 한 글자도 바꾸지 않았다. CSS는 건드리지 않았다.

import type { Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from "react";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
import type { SelectedNewsItem } from "@/lib/news/select";
import type { SourceType } from "@/lib/memo/types";
import { AiLoadingStage, AiErrorState } from "@/components/dashboard/presentational";
import { formatUpdatedAt } from "@/lib/dashboard/helpers";

// Dashboard 안의 `SelSource`와 같은 모양이다. 그 타입을 export하려고 Dashboard를 고치지 않았다 —
// 이 컴포넌트가 실제로 넘기는 값은 `{ type: "news", ... }` 하나뿐이다.
type NewsSelSource = { type: SourceType; title: string; url: string };

export type NewsDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  isLoggedIn: boolean;
  briefing: BriefingView | null;
  newsHistory: BriefingHistoryDay[];
  newsHistoryDate: string | null;
  setNewsHistoryDate: Dispatch<SetStateAction<string | null>>;
  historyDateLabel: (date: string) => string;
  newsDelayed: boolean;
  newsFailed: boolean;
  isAdmin: boolean;
  briefingRetrying: boolean;
  onRetryBriefing: () => void;
  activeNewsItems: SelectedNewsItem[];
  selectableHandlers: (source: NewsSelSource) => Record<string, unknown>;
  onOpenFullNewsPicker: (n: SelectedNewsItem) => void;
  radialMenuNode: ReactNode;
  bigEditorNode: ReactNode;
  selectionOverlays: ReactNode;
};

export function NewsDialog({
  dialogRef, onDialogBackdropClick, onCloseClick,
  isLoggedIn, briefing, newsHistory, newsHistoryDate, setNewsHistoryDate, historyDateLabel,
  newsDelayed, newsFailed, isAdmin, briefingRetrying, onRetryBriefing,
  activeNewsItems, selectableHandlers, onOpenFullNewsPicker,
  radialMenuNode, bigEditorNode, selectionOverlays,
}: NewsDialogProps) {
  return (
    <dialog className="glass-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
      <div className="dialog-inner">
        <div className="dialog-head editorial-head">
          <div className="editorial-head-titles">
            <div className="editorial-title-row">
              <h3>News</h3>
              <span className="dialog-update-badge">기본 업데이트 시간 · 매일 오전 10시~11시</span>
            </div>
            <p className="dialog-subtitle">오늘의 AI · 개발 핵심 브리핑</p>
          </div>
          <div className="editorial-head-actions">
            <button className="close-btn" onClick={onCloseClick}>✕</button>
          </div>
        </div>
        {!isLoggedIn ? (
          <div className="hint">로그인하면 실제 뉴스가 표시됩니다.</div>
        ) : !briefing ? (
          <AiLoadingStage title="오늘의 뉴스를 불러오는 중..." sub="오늘 발행된 AI·Tech 기사를 모으고 있어요." />
        ) : (
          <>
            {newsHistory.length > 0 && (
              <div className="history-chip-row">
                <button type="button" className={`history-chip ${newsHistoryDate === null ? "active" : ""}`} onClick={() => setNewsHistoryDate(null)}>오늘</button>
                {newsHistory.map((h) => (
                  <button
                    type="button" key={h.date} className={`history-chip ${newsHistoryDate === h.date ? "active" : ""}`}
                    onClick={() => setNewsHistoryDate(h.date)}
                  >
                    {historyDateLabel(h.date)}
                  </button>
                ))}
              </div>
            )}
            {newsHistoryDate === null && briefing.generatedAt && (
              <div className="editorial-meta-row hint">
                🕐 마지막 업데이트: {formatUpdatedAt(briefing.generatedAt)}
                {newsDelayed && (
                  <>
                    {!isAdmin && <span className="update-delay-badge">업데이트 지연</span>}
                    <button
                      type="button" className="meta-update-btn" title={isAdmin ? "횟수 제한 없음(관리자)" : "하루 최대 1회"}
                      onClick={onRetryBriefing}
                      disabled={briefingRetrying}
                      aria-busy={briefingRetrying}
                    >
                      {briefingRetrying ? "업데이트 중..." : "↻ 지금 업데이트"}
                    </button>
                  </>
                )}
              </div>
            )}
            {newsHistoryDate === null && newsFailed ? (
              <AiErrorState feature="news" isRetrying={briefingRetrying} onRetry={onRetryBriefing} />
            ) : (
              <>
                {activeNewsItems.length === 0 && <div className="mock-item">{newsHistoryDate ? "해당 날짜에 저장된 뉴스가 없습니다." : "오늘은 조건에 맞는 핵심 뉴스가 없습니다."}</div>}
                {activeNewsItems.map((n, i) => (
              <div key={i} className="editorial-card selectable-content" {...selectableHandlers({ type: "news", title: `${n.source} / ${n.title}`, url: n.url })}>
                <div className="editorial-top-row">
                  <span className="editorial-pill">{n.source}</span>
                  <span className="editorial-date">{new Date(n.published_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" })}</span>
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()} onClick={() => onOpenFullNewsPicker(n)}
                    title="이 뉴스 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                  <a className="editorial-link-icon" href={n.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()} title="원문 보기">↗</a>
                </div>
                <h4 className="editorial-title">{n.title}</h4>
                {/* 문단 배열(2026-09-03 작성 2단계)이 있으면 실제 블록으로 그린다 — 화면이 LLM의
                    `\n`에 의존하지 않게 된다. 없는 과거 데이터는 기존 경로(문자열 + pre-line) 그대로. */}
                {n.summary_paras?.length
                  ? n.summary_paras.map((p, pi) => <p key={pi} className="editorial-summary editorial-para">{p}</p>)
                  : <p className="editorial-summary">{n.summary}</p>}
                <div className="editorial-section">
                  <div className="editorial-section-label">✨ Why it matters</div>
                  {n.why_paras?.length
                    ? n.why_paras.map((p, pi) => <div key={pi} className="editorial-section-body editorial-para">{p}</div>)
                    : <div className="editorial-section-body">{n.reason_selected}</div>}
                </div>
                {n.related_concepts.length > 0 && (
                  <div className="editorial-section">
                    <div className="editorial-section-label">관련 개념</div>
                    <div className="editorial-tags">
                      {n.related_concepts.map((c, ci) => <span key={ci} className="editorial-tag">{c}</span>)}
                    </div>
                  </div>
                )}
                {n.uncertainty && (
                  <div className="editorial-section">
                    <div className="editorial-section-label editorial-uncertainty-label">⚠ 확인되지 않은 내용</div>
                    <div className="editorial-section-body editorial-uncertainty-body">{n.uncertainty}</div>
                  </div>
                )}
              </div>
            ))}
              </>
            )}
          </>
        )}
        {radialMenuNode}
        {bigEditorNode}
        {selectionOverlays}
      </div>
    </dialog>
  );
}
