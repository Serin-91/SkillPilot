"use client";

// PHASE 2 ⑨ — Dashboard.tsx의 **채용(Job Description)** 표현 JSX를 그대로 옮겨온 것이다.
// ⑨는 다른 항목과 달리 **두 단계로 갈랐다**(사용자 지시):
//   ⑨-a  `renderJobCard`(원본 280–382, 103줄) → 이 파일의 `JobCard`          ← 지금 이 커밋
//   ⑨-b  Jobs 다이얼로그 JSX(원본 3773–3853, 81줄) → 이 파일의 `JobsDialog`
// **파일은 하나로 유지한다**(사용자 지시: 불필요한 새 파일을 늘리지 마라). 카드와 다이얼로그는
// 같은 화면의 같은 책임이고 카드는 이 다이얼로그 안에서만 쓰인다.
//
// 🔴 **목적은 로직 개선이 아니라 표현 JSX 경계 분리다.** 동작·디자인 변경 0.
//   state 소유권 변경 0 · hook 이동 0 · ref 소유권 이동 0 · handler 로직 변경 0 ·
//   조건식 변경 0 · className/key/inline style 변경 0 · 새 Context 0 ·
//   source별(잡코리아/원티드/점핏) 데이터 처리 변경 0 · `parseJobTextSections` 변경 0 ·
//   Jobs 추천·선정·Soft Reserve·NEW 판정·career 판정·DB/API 변경 0.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 착수 전 소유권 실측 (2026-09-07) — `expandedJobUrl`은 **Dashboard에 남는다**
// ─────────────────────────────────────────────────────────────────────────────
// `expandedjoburl`을 **대소문자 무시**로 전수 조사한 결과 5곳이고, 그중 하나가 결정적이다:
//
//   | 줄  | 무엇                                          | ⑨ 구역 안? |
//   |-----|-----------------------------------------------|------------|
//   | 261 | `useState` 선언                                | 아니다      |
//   | 277 | `selectJobTab`이 탭 변경 시 null로 리셋         | 아니다      |
//   | 282 | `renderJobCard`가 읽는다 (`isExpanded`)         | **A(카드)** |
//   | 319 | `renderJobCard`의 상세보기 토글                  | **A(카드)** |
//   | 620 | `useDialogRegistry`의 `onOpen`이 null로 리셋     | **아니다 — 다이얼로그 밖이다** |
//
// 👉 **620줄이 답을 정했다.** 다이얼로그 열기 배선(`onOpen`)이 이 setter를 부르므로 state를
//    자식으로 내리면 그 배선이 끊긴다. 그래서 `useState`는 Dashboard에 두고 카드에는
//    **읽는 값(`expandedJobUrl`)과 setter 자신**을 그대로 내린다 — 소유권 이동이 아니다.
// 💀 `setExpandedJobUrl`을 `onToggle(url)` 같은 콜백으로 감싸지 않았다. 원본 토글식
//    `setExpandedJobUrl((v) => (v === j.url ? null : j.url))`을 **글자 그대로** 카드 안에 두는 것이
//    "setter/handler 의미 변경 없음"을 지키는 유일한 방법이다(⑤ 규약: handler는 래핑조차 하지 않는다).
//
// 💀💀 **측정 함정 — 이걸로 하마터면 "죽은 state"라고 오진했다.**
//    `grep "expandedJobUrl"`(소문자 e)은 **`setExpandedJobUrl`을 하나도 못 잡는다** —
//    `setExpandedJobUrl`에는 대문자 `E`가 들어 있어 부분문자열이 아니다. 첫 측정에서 261·282
//    두 줄만 나와 **"setter 호출이 0건 = 죽은 state"**로 읽었고, 파일을 직접 읽어서야 277·319·620을
//    발견했다. **camelCase 식별자는 `-i`로 세거나 어근(`expandedjoburl`)으로 세라.**
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 `renderJobCard` 두 사용처는 **같은 렌더 책임**이다 (실측)
// ─────────────────────────────────────────────────────────────────────────────
// 원본 3836 `jobs.jobs.map(renderJobCard)` / 3843 `jobsRecent.map(renderJobCard)` —
// **같은 함수 참조를 같은 방식으로 넘긴다.** 전달 데이터는 둘 다 `SavedJobRow`이고, 조건식·expanded
// 상태·click handler·className·key·source별 표시·상세 open/close가 **전부 카드 안에서 동일하게**
// 결정된다(탭이 다르다는 것만 다르고 카드는 탭을 모른다). 그래서 카드 하나로 충분하다.
//
// 💀 **그래서 호출부를 `.map((j) => <JobCard …/>)`로 바꾸지 않았다.** Dashboard에 얇은
//    `renderJobCard` 래퍼를 남겨 두 호출부가 `map(renderJobCard)` **그대로** 있게 했다 —
//    ① 두 호출부 diff가 0이고 ② `key`가 계속 **배열 요소 자신**에 붙어 reconciliation 기준이 안 바뀐다.
//    래퍼를 지우고 호출부를 펼치지 마라.

import type { Dispatch, MouseEvent, ReactNode, RefObject, SetStateAction } from "react";
import type { JobsView, SavedJobRow } from "@/lib/jobs/get-jobs";
import type { SourceType } from "@/lib/memo/types";
import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import { extractTechTags, parseJobTextSections, formatUpdatedAt } from "@/lib/dashboard/helpers";
import { hasUsableBody } from "@/lib/jobs/section-quality";
import { AiLoadingStage, AiErrorState } from "@/components/dashboard/presentational";

// Dashboard 안의 `SelSource`와 같은 모양이다. 그 타입을 export하려고 Dashboard를 고치지 않았다
// (⑪ `NewsSelSource`·⑬ `TrendSelSource`와 같은 이유) — 여기서 넘기는 값은 `{ type: "job", … }` 하나다.
type JobSelSource = { type: SourceType; title: string; url: string };

export type JobCardProps = {
  job: SavedJobRow;
  expandedJobUrl: string | null;
  setExpandedJobUrl: Dispatch<SetStateAction<string | null>>;
  todayIso: string;
  selectableHandlers: (source: JobSelSource) => Record<string, unknown>;
  openFullJobPicker: (j: SavedJobRow, techTags: string[]) => void;
};

// 추천 공고 / 최근 추천 두 탭이 같은 카드를 쓴다 — 접힌 요약(collapsed) + 상세보기 펼침(accordion).
export function JobCard({
  job: j, expandedJobUrl, setExpandedJobUrl, todayIso, selectableHandlers, openFullJobPicker,
}: JobCardProps) {
  const techTags = extractTechTags(j.role, j.responsibilities, j.required_text, j.preferred_text);
  const isExpanded = expandedJobUrl === j.url;
  const isExpired = !!j.deadline && j.deadline < todayIso;
  return (
    <div
      className={`editorial-card job-card${isExpired ? " is-expired" : ""}`}
      {...selectableHandlers({ type: "job", title: `${j.company} / ${j.title}`, url: j.url })}
    >
      <div className="editorial-top-row">
        {j.is_new && <span className="job-new-badge">NEW</span>}
        <span className="editorial-pill">{j.company}</span>
        {j.source_site && <span className="editorial-pill">{j.source_site}</span>}
        {isExpired && <span className="job-expired-badge">마감</span>}
        <div className="job-card-actions">
          <button
            type="button" className="editorial-save-all-btn"
            onMouseUp={(e) => e.stopPropagation()} onClick={() => openFullJobPicker(j, techTags)}
            title="이 채용공고 전체를 메모로 저장"
          >
            📥 전체 저장
          </button>
          <a className="editorial-link-icon" href={j.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()} title="원문 보기">↗</a>
        </div>
      </div>
      <h4 className="job-role-title">{j.title}</h4>
      <div className="job-meta-row">
        <span>👤 {j.career_requirement ?? "경력 무관"}</span>
        <span>🕓 마감 {j.deadline ?? "상시"}</span>
      </div>
      {techTags.length > 0 && (
        <div className="editorial-tags" style={{ marginBottom: 14 }}>
          {techTags.map((t) => <span key={t} className="editorial-tag">{t}</span>)}
        </div>
      )}
      <button
        type="button" className="job-detail-toggle"
        onMouseUp={(e) => e.stopPropagation()}
        onClick={() => setExpandedJobUrl((v) => (v === j.url ? null : j.url))}
      >
        {isExpanded ? "접기" : "상세보기"} {isExpanded ? <ChevronUp size={14} strokeWidth={2.2} /> : <ChevronDown size={14} strokeWidth={2.2} />}
      </button>
      {isExpanded && (
        <div className="job-detail-content">
          {j.responsibilities && (
            <div className="editorial-section">
              <div className="editorial-section-label">📋 주요 업무</div>
              {parseJobTextSections(j.responsibilities).map((group, gi) => (
                <div key={gi} className="editorial-subgroup">
                  {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                  <ul className="editorial-bullet-list">
                    {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {j.required_text && (
            <div className="editorial-section">
              <div className="editorial-section-label">🎯 자격요건</div>
              {parseJobTextSections(j.required_text).map((group, gi) => (
                <div key={gi} className="editorial-subgroup">
                  {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                  <ul className="editorial-bullet-list">
                    {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {j.preferred_text && (
            <div className="editorial-section">
              <div className="editorial-section-label">⭐ 우대사항</div>
              {parseJobTextSections(j.preferred_text).map((group, gi) => (
                <div key={gi} className="editorial-subgroup">
                  {group.heading && <div className="editorial-subheading">{group.heading}</div>}
                  <ul className="editorial-bullet-list">
                    {group.bullets.map((line, li) => <li key={li}>{line}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {/* 이미지로만 올라온 공고 — 세 필드가 전부 비거나 장식만 남았다. 예전엔 세 블록이 전부
              조건부라 상세 패널이 **완전히 빈 채로** 열렸다(라이브 81건 중 10건). OCR은 하지 않고,
              왜 비었는지와 원문 링크만 정직하게 준다. 마크업/클래스는 위 세 섹션과 동일하다. */}
          {!hasUsableBody(j) && (
            <div className="editorial-section">
              <div className="editorial-section-label">📄 본문 없음</div>
              <ul className="editorial-bullet-list">
                <li>
                  이미지로 올라온 공고라 본문 텍스트를 가져오지 못했습니다.{" "}
                  <a href={j.url} target="_blank" rel="noopener noreferrer" onMouseUp={(e) => e.stopPropagation()}>원문에서 확인하기 ↗</a>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑨-b — Jobs 다이얼로그 (원본 `Dashboard.tsx` 3688–3768, 81줄 · prop 19개)
// ─────────────────────────────────────────────────────────────────────────────
// ⑨-a가 차이 0으로 끝난 뒤에만 이 단계를 했다(사용자 지시). 위 JobCard와 **같은 파일**이다 —
// 카드는 이 다이얼로그 안에서만 쓰이므로 파일을 나눌 이유가 없다.
//
// 🔴 Dashboard에 그대로 남긴 것: state(`jobTab`·`expandedJobUrl`·`jobsRecent`·`jobsRetrying`) ·
//   ref(`jobsRef`) · hook(`jobsRecent` 지연조회 effect) · 데이터 fetch/계산(`jobsFailed`·`jobsDelayed`) ·
//   공유 handler(`handleRetryJobs`·`selectJobTab`·`openMyPage`) · open/close 게이트.
//   여기에는 **이미 계산된 값과 callback/node만** 넘어온다. 새 Context 0.
//
// - `close(dialogs.jobs)` 호출식은 호출부에 남겼다(⑤·⑧·⑩·⑪·⑬ 규약) — `close`·`dialogs`를 안 내린다.
//   💀 "직무 다시 설정" 버튼의 `() => { close(dialogs.jobs); openMyPage(); }`도 **두 호출이 한 식**이라
//      통째로 `onResetRoles`로 받는다. 쪼개서 내리면 실행 순서가 호출부 밖으로 나간다.
// - 마운트 게이트 식(`selectionMenu?.source.type === "job"` · `activeDialogKey === "jobs"`)은
//   호출부에서 계산해 **걸러진 node만** 넘긴다(⑩·⑪·⑬과 같은 규약).
// - `renderJobCard`는 Dashboard 소유 그대로 받는다 — 그 안에 `expandedJobUrl`이 닫혀 있고,
//   두 사용처가 `map(renderJobCard)` 형태를 유지해야 ⑨-a에서 증명한 diff 0이 그대로 살아 있다.
// - `AiLoadingStage`·`AiErrorState`·`formatUpdatedAt`·`TriangleAlert`은 공용이라 **직접 import**한다.

export type JobsDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDialogBackdropClick: (e: MouseEvent<HTMLDialogElement>) => void;
  onCloseClick: () => void;
  onResetRoles: () => void;
  isLoggedIn: boolean;
  hasLegacyRoles: boolean;
  jobs: JobsView | null;
  jobTab: "recommended" | "recent";
  selectJobTab: (tab: "recommended" | "recent") => void;
  jobsRecent: SavedJobRow[] | null;
  jobsFailed: boolean;
  jobsDelayed: boolean;
  jobsRetrying: boolean;
  isAdmin: boolean;
  onRetryJobs: () => void;
  renderJobCard: (j: SavedJobRow) => ReactNode;
  radialMenuNode: ReactNode;
  bigEditorNode: ReactNode;
  selectionOverlays: ReactNode;
};

export function JobsDialog({
  dialogRef, onDialogBackdropClick, onCloseClick, onResetRoles,
  isLoggedIn, hasLegacyRoles, jobs, jobTab, selectJobTab, jobsRecent,
  jobsFailed, jobsDelayed, jobsRetrying, isAdmin, onRetryJobs, renderJobCard,
  radialMenuNode, bigEditorNode, selectionOverlays,
}: JobsDialogProps) {
  return (
    <dialog className="glass-dialog" ref={dialogRef} onClick={onDialogBackdropClick}>
      <div className="dialog-inner">
        <div className="dialog-head editorial-head">
          <div className="editorial-head-titles">
            <div className="editorial-title-row">
              <h3>Job Description</h3>
              <span className="dialog-update-badge">기본 업데이트 시간 · 매일 오전 10시~11시</span>
            </div>
            <p className="dialog-subtitle">관심 직무 기준 추천 채용공고</p>
          </div>
          <div className="editorial-head-actions">
            <button className="close-btn" onClick={onCloseClick}>✕</button>
          </div>
        </div>
        {!isLoggedIn ? (
          <div className="hint">로그인하면 실제 채용공고가 표시됩니다.</div>
        ) : hasLegacyRoles ? (
          <div className="job-role-reset-notice">
            <TriangleAlert className="role-reset-alert-icon" size={26} strokeWidth={2.2} aria-hidden="true" />
            <span className="role-reset-alert-badge">직무 재설정 필요</span>
            <p>
              관심 직무 설정이 새 AI 직군 체계로 변경되었습니다.<br />
              채용공고 추천을 받으려면 My Page에서 관심 직무와 우선순위를 다시 설정해 주세요.
            </p>
            <button type="button" className="meta-update-btn" onClick={onResetRoles}>
              관심 직무 다시 설정
            </button>
          </div>
        ) : !jobs ? (
          <AiLoadingStage title="오늘의 채용공고를 불러오는 중..." sub="관심 직무에 맞는 공고를 찾고 있어요." />
        ) : (
          <>
            {jobTab === "recommended" && jobs.lastUpdated && (
              <div className="editorial-meta-row hint">
                🕐 마지막 업데이트: {formatUpdatedAt(jobs.lastUpdated)}
                {jobsDelayed && (
                  <>
                    {!isAdmin && <span className="update-delay-badge">업데이트 지연</span>}
                    <button
                      type="button" className="meta-update-btn" title={isAdmin ? "횟수 제한 없음(관리자)" : "하루 최대 1회"}
                      onClick={onRetryJobs}
                      disabled={jobsRetrying}
                      aria-busy={jobsRetrying}
                    >
                      {jobsRetrying ? "업데이트 중..." : "↻ 지금 업데이트"}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="job-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={jobTab === "recommended"} className={`job-tab ${jobTab === "recommended" ? "is-active" : ""}`} onClick={() => selectJobTab("recommended")}>추천 공고</button>
              <button type="button" role="tab" aria-selected={jobTab === "recent"} className={`job-tab ${jobTab === "recent" ? "is-active" : ""}`} onClick={() => selectJobTab("recent")}>최근 추천</button>
            </div>

            {jobTab === "recommended" && jobsFailed ? (
              <AiErrorState feature="jobs" isRetrying={jobsRetrying} onRetry={onRetryJobs} />
            ) : (
              <div className="job-list">
                {jobTab === "recommended" && (
                  jobs.jobs.length === 0
                    ? <div className="mock-item">아직 수집된 공고가 없습니다.</div>
                    : jobs.jobs.map(renderJobCard)
                )}
                {jobTab === "recent" && (
                  jobsRecent === null
                    ? <div className="hint">불러오는 중...</div>
                    : jobsRecent.length === 0
                      ? <div className="mock-item">아직 더 볼 이전 추천 공고가 없습니다.</div>
                      : jobsRecent.map(renderJobCard)
                )}
              </div>
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
