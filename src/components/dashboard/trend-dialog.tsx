"use client";

// PHASE 2 ⑬ — Dashboard.tsx의 **AI Trend Briefing 다이얼로그**를 그대로 옮겨온 것이다.
// (원본 `Dashboard.tsx` 3741–3989, 249줄 · Dashboard 스코프 참조 22개)
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다**(사용자 지시). 동작·디자인 변경 0.
//   state 소유권 변경 0 · hook 이동 0 · ref 소유권 이동 0 · handler 로직 변경 0 ·
//   조건식 의미 변경 0 · className/key/inline style 변경 0 · 새 Context 0 ·
//   데이터 가공/생성 로직 변경 0.
//
// 🔴 **왜 ⑨가 아니라 ⑬을 먼저 했나** — 줄수가 아니라 **소유권 위험**으로 골랐다(51-3 재측정):
//     ⑨ 채용   214줄 / state 7 / 함수 13 — `expandedJobUrl` **전용 state** + 두 곳에서 쓰이는
//              `renderJobCard`가 "state/ref/hook 소유권을 Dashboard에서 옮기지 않는다" 규약과 충돌
//     ⑬ Trend  252줄 / state 5 / 함수 15 — 전용 소유권 없음. 줄수만 많다
//   👉 ⑨는 그 방침을 먼저 정하고 시작해야 한다. ⑬에는 그 결정이 필요 없다.
//
// 🔴 **경계는 눈으로 찍지 않았다**(51-3에서 두 번 틀린 자리다). 원본에서 `<dialog>` 여는 줄부터
//   같은 들여쓰기의 `</dialog>`를 찾아 3741–3989로 고정하고, 그 구간의 `<dialog`:`</dialog>`가
//   1:1인지(각 1개) 세고, 3990이 빈 줄이며 3991부터 다음 형제(Job Description)인 것까지 확인했다.
//
// 🔴 **마운트 게이트 식은 Dashboard에 남겼다.** 이 컴포넌트는 **이미 걸러진 node만** 받는다
//   (`radialMenuNode` = `selectionMenu?.source.type === "ai_smart_direction" ? radialMenuOverlay : null`,
//    `bigEditorNode` = `activeDialogKey === "trendBrief" ? bigEditorNode : null`).
//   ⑩·⑪과 같은 규약이다 — 조건을 자식으로 내리면 그 판단이 두 벌이 되고, 지뢰표의
//   *"같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 마지막 사본이 이긴다"*가 되살아난다.
//   ⚠️ `bigEditorNode`는 `bigEditorHandleRef`가 붙는 자리다. 게이트를 여기로 내리지 마라 —
//      원본 주석이 적어둔 대로, 이 줄이 없으면 "전체 저장 → 기존 메모"가 조용히 묻힌다.
//
// - ✕의 `close(dialogs.trendBrief)` **호출식은 호출부(Dashboard)에 남겼다** — ⑤·⑧·⑩·⑪ 규약이고
//   `close`·`dialogs`를 자식으로 내리지 않기 위해서다.
// - `trendBriefing` · `toolUpdates` · `skillSignals` · `hasSkillSection`은 **Dashboard 소유 그대로 받는다.**
//   💀 여기서 다시 계산하지 마라 — 원본 주석이 *"이 한 줄이 AI Trend 상세의 단일 기준이다.
//      평행 분기를 만들지 마라"*라고 못박은 자리다(`trendBriefing`이 날짜에서 파생되고 나머지 셋이
//      거기서 또 파생된다). 자식에서 재계산하면 그 파생 사슬이 두 벌이 된다.
// - `historyDateLabel`도 Dashboard 소유 함수를 **그대로 받는다.** 순수 함수처럼 보여도 옮기면
//   소유권 이동이고 그건 이번 단계의 금지 항목이다(⑪과 동일).
// - `AiLoadingStage`·`AiErrorState`·`formatUpdatedAt`·`evidenceTitlesOf`·`evidenceSourcesOf`는
//   이미 공용 모듈이라 **직접 import**한다(prop 아님 — ⑥·⑦·⑪과 같다).
// - className·이모지·문구·`key`·`<span>` 구조를 한 글자도 바꾸지 않았다. CSS는 건드리지 않았다.
//
// ⚠️ 원본과 **문자 단위로 다른 곳은 다음뿐이고, 전부 런타임 무영향이다**:
//   ① 참조 이름(`trendBriefRef`→`dialogRef` 등)  ② 게이트 식 → 걸러진 node prop
//   ③ `skillSignals` 3곳에 `!`(non-null assertion) 추가. 원본은 같은 스코프의
//      `const hasSkillSection = skillSignals !== null`에서 TS의 aliased-condition narrowing이
//      걸려 `!` 없이 통과했는데, prop으로 분리되면 TS가 그 관계를 모른다. `!`는 컴파일 시
//      **완전히 지워지는 타입 단정**이라 출력 JS가 동일하고, 같은 블록의 형제 줄들이
//      이미 `skillSignals!`를 쓰고 있어 표기도 그쪽에 맞춘 것이다.

import type { Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from "react";
import type { BriefingView, BriefingHistoryDay } from "@/lib/news/get-briefing";
import type { TrendBriefResult, TrendSkillSignal, TrendToolUpdate } from "@/lib/news/trend-brief";
import type { SourceType } from "@/lib/memo/types";
import { AiLoadingStage, AiErrorState } from "@/components/dashboard/presentational";
import { formatUpdatedAt } from "@/lib/dashboard/helpers";
import { evidenceTitlesOf, evidenceSourcesOf } from "@/lib/news/trend-brief";

// Dashboard 안의 `SelSource` / `Extract<MemoPickerContent, { mode: "fullTrend" }>`와 같은 모양이다.
// 그 타입들을 export하려고 Dashboard를 고치지 않았다(⑪의 `NewsSelSource`와 같은 이유) —
// 이 컴포넌트가 실제로 넘기는 값은 `{ type: "ai_smart_direction", ... }`와 fullTrend 하나뿐이다.
type TrendSelSource = { type: SourceType; title: string; url: string };
type TrendPickerContent = {
  mode: "fullTrend"; label: string; title: string | null; body: string;
  bullets: string[] | null; source: string | null; url: string | null;
};

export type TrendDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  isLoggedIn: boolean;
  briefing: BriefingView | null;
  newsHistory: BriefingHistoryDay[];
  trendHistoryDate: string | null;
  setTrendHistoryDate: Dispatch<SetStateAction<string | null>>;
  historyDateLabel: (date: string) => string;
  newsDelayed: boolean;
  isAdmin: boolean;
  briefingRetrying: boolean;
  onRetryBriefing: () => void;
  trendBriefing: TrendBriefResult | null;
  toolUpdates: TrendToolUpdate[];
  skillSignals: TrendSkillSignal[] | null;
  hasSkillSection: boolean;
  selectableHandlers: (source: TrendSelSource) => Record<string, unknown>;
  openFullTrendPicker: (content: TrendPickerContent) => void;
  radialMenuNode: ReactNode;
  bigEditorNode: ReactNode;
  selectionOverlays: ReactNode;
};

export function TrendDialog({
  dialogRef, onDialogBackdropClick, onCloseClick,
  isLoggedIn, briefing, newsHistory, trendHistoryDate, setTrendHistoryDate, historyDateLabel,
  newsDelayed, isAdmin, briefingRetrying, onRetryBriefing,
  trendBriefing, toolUpdates, skillSignals, hasSkillSection,
  selectableHandlers, openFullTrendPicker,
  radialMenuNode, bigEditorNode, selectionOverlays,
}: TrendDialogProps) {
  return (
    <dialog className="glass-dialog compact" ref={dialogRef} onClick={onDialogBackdropClick}>
      <div className="dialog-inner">
        <div className="dialog-head"><h3>AI Trend Briefing</h3><button className="close-btn" onClick={onCloseClick}>✕</button></div>
        {/* 최근 3일 열람 — News와 **같은 클래스·같은 패턴**을 재사용한다(새 CSS 없음).
            날짜 상태만 각자 갖는다(trendHistoryDate ↔ newsHistoryDate). */}
        {isLoggedIn && newsHistory.length > 0 && (
          <div className="history-chip-row">
            <button type="button" className={`history-chip ${trendHistoryDate === null ? "active" : ""}`} onClick={() => setTrendHistoryDate(null)}>오늘</button>
            {newsHistory.map((h) => (
              <button
                type="button" key={h.date} className={`history-chip ${trendHistoryDate === h.date ? "active" : ""}`}
                onClick={() => setTrendHistoryDate(h.date)}
              >
                {historyDateLabel(h.date)}
              </button>
            ))}
          </div>
        )}
        {/* 트렌드 브리핑은 뉴스와 같은 briefing 행에 저장돼 있어 갱신 시각이 뉴스와 항상 동일하다.
            과거 날짜를 보는 중에는 숨긴다 — 그 시각은 오늘 행의 것이라 지금 화면과 어긋난다(News와 동일). */}
        {trendHistoryDate === null && briefing?.generatedAt && (
          <div className="editorial-meta-row hint">
            🕐 마지막 업데이트: {formatUpdatedAt(briefing.generatedAt)}
            {/* 트렌드 브리핑은 어차피 그날 뉴스를 재료로 만든다 — "전체 재생성"과 "트렌드만"을
                따로 둘 이유가 없어서 News 쪽과 같은 "지금 업데이트" 하나로 합쳤다. */}
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
        {!isLoggedIn ? (
          <div className="hint">로그인하면 오늘의 AI 트렌드 분석을 볼 수 있습니다.</div>
        ) : !briefing ? (
          <AiLoadingStage title="오늘의 AI 트렌드를 불러오는 중..." sub="뉴스와 개발 생태계 자료를 종합하고 있어요." />
        ) : !trendBriefing ? (
          // 과거 날짜에 trend_brief가 없는 것은 **오류가 아니다**(그날 뉴스만 생성됐거나 AI Trend가
          // 실패한 날이다). 재시도 버튼을 띄우면 오늘 것을 다시 만들게 되므로 News와 같은 안내로 가른다.
          trendHistoryDate ? (
            <div className="mock-item">해당 날짜에 저장된 AI 트렌드가 없습니다.</div>
          ) : (
            <AiErrorState feature="briefing" isRetrying={briefingRetrying} onRetry={onRetryBriefing} />
          )
        ) : (
          <>
            {trendBriefing.industry_impact && (
              <div
                className="trend-detail-item industry"
                {...selectableHandlers({ type: "ai_smart_direction", title: "AI Trend Briefing · 업계 영향", url: "" })}
              >
                <div className="trend-detail-title">
                  <span className="dot" />업계 영향
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={() => openFullTrendPicker({
                      mode: "fullTrend", label: "업계 영향", title: null,
                      // content는 points를 `\n`으로 join한 값이다 — rich-text가 `<p>` 여러 개로 쪼갠다.
                      body: trendBriefing.industry_impact!.content,
                      bullets: null, source: null, url: null,
                    })}
                    title="이 항목 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                </div>
                {/* points(2~3개)가 있으면 실제 블록으로 그린다. 없는 과거 데이터는 content 한 덩어리. */}
                {trendBriefing.industry_impact.points?.length
                  ? trendBriefing.industry_impact.points.map((p, pi) => (
                      <div key={pi} className="trend-detail-body trend-para">{p}</div>
                    ))
                  : <div className="trend-detail-body">{trendBriefing.industry_impact.content}</div>}
              </div>
            )}
            {trendBriefing.developer_trend && (
              <div
                className="trend-detail-item developer"
                {...selectableHandlers({ type: "ai_smart_direction", title: trendBriefing.developer_trend.title, url: trendBriefing.developer_trend.url ?? "" })}
              >
                <div className="trend-detail-title">
                  <span className="dot" />개발자 동향
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={() => openFullTrendPicker({
                      mode: "fullTrend", label: "개발자 동향", title: trendBriefing.developer_trend!.title, body: trendBriefing.developer_trend!.summary,
                      bullets: null, source: trendBriefing.developer_trend!.source, url: trendBriefing.developer_trend!.url ?? null,
                    })}
                    title="이 항목 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                </div>
                <div className="trend-detail-subtitle">{trendBriefing.developer_trend.title}</div>
                <div className="trend-detail-body">{trendBriefing.developer_trend.summary}</div>
                <div className="trend-detail-meta">
                  {trendBriefing.developer_trend.source}
                  {trendBriefing.developer_trend.url && (
                    <>
                      {" · "}
                      <a className="source-link" href={trendBriefing.developer_trend.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문 보기 ↗</a>
                    </>
                  )}
                </div>
              </div>
            )}
            {/* 🔴 2026-09-05 — `도구·서비스`를 대체한 섹션. **새 시각 언어를 만들지 않았다** —
                다른 세 섹션과 같은 .trend-detail-item / -title / -subtitle / -body / -meta / .trend-subitem을
                그대로 써서 좌측선·정렬·본문 폭·typography·간격·light/dark·모바일 규칙을 공유한다.
                읽는 순서는 역량명(subtitle) → 왜 지금(body) → 준비 포인트(body) → 근거(meta)다. */}
            {hasSkillSection && (
              <div
                className="trend-detail-item skill"
                {...selectableHandlers({ type: "ai_smart_direction", title: "AI Trend Briefing · 역량 시그널", url: "" })}
              >
                <div className="trend-detail-title">
                  <span className="dot" />역량 시그널
                  {/* 0건이면 저장할 것이 없다 — 버튼만 감춘다(제목·좌측선·간격은 그대로). */}
                  {skillSignals!.length > 0 && (
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={() => openFullTrendPicker({
                      mode: "fullTrend", label: "역량 시그널",
                      title: skillSignals!.length === 1 ? skillSignals![0].skill : null,
                      // 여러 건이면 항목마다 한 문단씩 — rich-text가 개행을 `<p>`로 쪼갠다(도구·서비스가 쓰던 방식 그대로).
                      body: skillSignals!.length === 1
                        ? `${skillSignals![0].why_now} 준비 포인트: ${skillSignals![0].prepare_focus}`
                        : skillSignals!.map((s) => `${s.skill} — ${s.why_now} 준비 포인트: ${s.prepare_focus}`).join("\n"),
                      bullets: null,
                      source: [...new Set(skillSignals!.flatMap((s) => evidenceSourcesOf(s)))].join(" · "),
                      url: null,
                    })}
                    title="이 항목 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                  )}
                </div>
                {/* 🔴 0건도 정상 출력이다 — 억지로 만들지 않는다. 기존 본문 클래스를 그대로 써서
                    네 영역의 위치·정렬·간격이 흔들리지 않게 한다(새 클래스·새 규칙 없음). */}
                {skillSignals!.length === 0 && (
                  <div className="trend-detail-body">
                    오늘은 여러 자료에서 공통으로 확인되는 뚜렷한 역량 시그널이 없습니다.
                  </div>
                )}
                {skillSignals!.map((s, si) => (
                  <div key={si} className={si > 0 ? "trend-subitem" : undefined}>
                    <div className="trend-detail-subtitle">{s.skill}</div>
                    <div className="trend-detail-body">{s.why_now}</div>
                    <div className="trend-detail-body"><strong>준비 포인트</strong> · {s.prepare_focus}</div>
                    {/* 근거는 코드가 대조에 성공한 **입력 제목**이다(모델이 쓴 문자열이 아니다).
                        v2부터 2~3개이고, v1 행은 단건이라 evidenceTitlesOf가 배열로 맞춰준다. */}
                    <div className="trend-detail-meta">
                      근거 · {evidenceSourcesOf(s).join(" · ")}
                      {evidenceTitlesOf(s).map((t, ti) => (
                        <span key={ti} className="trend-evidence-title"> · {t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* tool_updates(1~3건)가 있으면 그걸, 없으면 과거 데이터의 tool_update 한 건을 그린다 */}
            {toolUpdates.length > 0 && (
              <div
                className="trend-detail-item tools"
                {...selectableHandlers({ type: "ai_smart_direction", title: toolUpdates[0].title, url: toolUpdates[0].url ?? "" })}
              >
                <div className="trend-detail-title">
                  <span className="dot" />도구·서비스
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={() => openFullTrendPicker({
                      mode: "fullTrend", label: "도구·서비스",
                      title: toolUpdates.length === 1 ? toolUpdates[0].title : null,
                      // 여러 건이면 항목마다 한 문단씩 — rich-text가 `\n`을 `<p>`로 쪼갠다.
                      body: toolUpdates.length === 1
                        ? toolUpdates[0].summary
                        : toolUpdates.map((t) => `${t.title} — ${t.summary}`).join("\n"),
                      bullets: null,
                      source: toolUpdates.map((t) => t.source).join(" · "),
                      url: toolUpdates.length === 1 ? toolUpdates[0].url ?? null : null,
                    })}
                    title="이 항목 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                </div>
                {toolUpdates.map((t, ti) => (
                  <div key={ti} className={ti > 0 ? "trend-subitem" : undefined}>
                    <div className="trend-detail-subtitle">{t.title}</div>
                    <div className="trend-detail-body">{t.summary}</div>
                    <div className="trend-detail-meta">
                      {t.source}
                      {t.published_at && ` · ${t.published_at.slice(0, 10)}`}
                      {t.url && (
                        <>
                          {" · "}
                          <a className="source-link" href={t.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문 보기 ↗</a>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {trendBriefing.practical_takeaways.length > 0 && (
              <div
                className="trend-detail-item practical"
                {...selectableHandlers({ type: "ai_smart_direction", title: "AI Trend Briefing · 실무 적용", url: "" })}
              >
                <div className="trend-detail-title">
                  <span className="dot" />실무 적용
                  <button
                    type="button" className="editorial-save-all-btn"
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={() => openFullTrendPicker({ mode: "fullTrend", label: "실무 적용", title: null, body: "", bullets: trendBriefing.practical_takeaways, source: null, url: null })}
                    title="이 항목 전체를 메모로 저장"
                  >
                    📥 전체 저장
                  </button>
                </div>
                <ul className="trend-takeaways">
                  {trendBriefing.practical_takeaways.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
        {radialMenuNode}
        {/* 이 줄이 없어서 AI Trend "전체 저장 → 기존 메모"가 아무 반응 없이 묻혔다 —
            confirmPendingSave가 openBigEditor()로 state는 세팅해도 편집창 JSX 자체가
            이 다이얼로그 안에 없었다(news/jobs엔 있었음). 새 메모 경로는 서버 액션만
            쓰기 때문에 정상 동작해서 증상이 "기존 메모만 안 됨"으로 보였다. */}
        {bigEditorNode}
        {selectionOverlays}
      </div>
    </dialog>
  );
}
