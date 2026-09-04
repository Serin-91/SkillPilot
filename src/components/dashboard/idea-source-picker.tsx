"use client";

// PHASE 1 ③ — Dashboard.tsx의 `ideaSourcePickerNode`(자료 선택 팝업)를 **그대로 옮겨온** 것이다.
// 계획서 §2 실측 결합도 표에서 공유 식별자 3개로 가장 낮은 항목이라 PHASE 1의 첫 추출 단위다.
//
// 🔴 **옮기기만 했다. 로직은 한 글자도 안 고쳤다**(계획서 §7-2).
//   - state를 이 컴포넌트 안으로 내리지 않았다. `ideaSourceSearch`는 Dashboard에 그대로 있고
//     value/onChange로 받는다 — 내리면 리렌더 범위가 바뀌어 "옮기기"가 아니라 "고치기"가 된다.
//   - `ideaSourcePickerOpen && (...)` 가드도 호출부(Dashboard)에 그대로 남겼다. 여기서 open을
//     받아 내부에서 null을 반환하는 형태로 바꾸면 mount/unmount 타이밍이 달라진다.
//   - 클래스 문자열·onClick 본문·`e.stopPropagation()` 위치·요소 순서 전부 원문과 동일하다.

import { type ProjectIdea } from "@/lib/project/types";
import type { IdeaGenerationMode } from "@/lib/ai/idea";
import { formatProjectUpdated } from "@/lib/dashboard/helpers";
import { ProjectStatusBadge } from "@/components/dashboard/presentational";

export type IdeaSourcePickerProps = {
  ideaPickableProjects: ProjectIdea[];
  ideaSourceSearch: string;
  setIdeaSourceSearch: (value: string) => void;
  setIdeaSourcePickerOpen: (value: boolean) => void;
  setIdeaGenMode: (mode: IdeaGenerationMode | null) => void;
  setIdeaRandomPulse: (value: boolean) => void;
  setIdeaRetryPinnedId: (value: string | null) => void;
  todayYear: number;
};

export function IdeaSourcePicker({
  ideaPickableProjects,
  ideaSourceSearch,
  setIdeaSourceSearch,
  setIdeaSourcePickerOpen,
  setIdeaGenMode,
  setIdeaRandomPulse,
  setIdeaRetryPinnedId,
  todayYear,
}: IdeaSourcePickerProps) {
  return (
    <div
      // 목록이 비면 바텀시트 모양이 안 맞는다 — 아래 idea-picker-empty가 가운데 카드로 되돌린다.
      className={`postit-overlay fixed-overlay idea-source-picker-anchor open${ideaPickableProjects.length === 0 ? " idea-picker-empty" : ""}`}
      onClick={() => setIdeaSourcePickerOpen(false)}
    >
      <div className="panel copy-picker idea-source-picker" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="idea-picker-back" aria-label="뒤로가기" onClick={() => setIdeaSourcePickerOpen(false)}>‹</button>
        <button className="close-btn" onClick={() => setIdeaSourcePickerOpen(false)}>✕</button>
        <div className="copy-picker-head">
          <div className="copy-picker-title">어떤 프로젝트를 확장할까요?</div>
          <input
            className="proj-search copy-picker-search" placeholder="프로젝트 검색"
            value={ideaSourceSearch} onChange={(e) => setIdeaSourceSearch(e.target.value)}
          />
        </div>
        {ideaPickableProjects.length === 0 ? (
          <div className="hint">Idea Build를 사용할 프로젝트가 없습니다.</div>
        ) : (
          <div className="proj-table">
            <div className="proj-table-row proj-table-head project-table-header">
              <span className="proj-col-name">프로젝트명</span>
              <span className="proj-col-summary">한 줄 요약</span>
              <span className="proj-col-status">상태</span>
              <span className="proj-col-updated">최근 수정</span>
            </div>
            {ideaPickableProjects
              .filter((p) => p.title.toLowerCase().includes(ideaSourceSearch.trim().toLowerCase()))
              .map((p) => (
              <button
                type="button" key={p.id} className="proj-table-row project-list-row"
                onClick={() => { setIdeaGenMode({ kind: "specific", projectId: p.id }); setIdeaRandomPulse(false); setIdeaRetryPinnedId(null); setIdeaSourcePickerOpen(false); }}
              >
                <span className="proj-col-name project-list-title">{p.title}</span>
                <span className="proj-col-summary project-list-summary">{p.summary}</span>
                <span className="proj-col-status"><ProjectStatusBadge status={p.status} /></span>
                <span className="proj-col-updated project-list-updated">{formatProjectUpdated(p.updated_at, todayYear)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
