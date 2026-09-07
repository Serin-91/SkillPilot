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

import type { Dispatch, SetStateAction } from "react";
import type { SavedJobRow } from "@/lib/jobs/get-jobs";
import type { SourceType } from "@/lib/memo/types";
import { ChevronDown, ChevronUp } from "lucide-react";
import { extractTechTags, parseJobTextSections } from "@/lib/dashboard/helpers";
import { hasUsableBody } from "@/lib/jobs/section-quality";

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
