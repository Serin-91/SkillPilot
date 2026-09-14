"use client";

// Dashboard.tsx에서 **그대로 옮겨온** Idea Build 세션 (Dashboard ownership Audit 2순위).
// 로직은 한 글자도 안 고쳤다 — `useMyPageSession`·`useMemoEditSession`과 같은 이동 전용 추출이다.
//
// 여기 모인 것: 생성 모드 선택(직접/랜덤) / 생성·재시도 / 히스토리 조회 /
//               결과를 프로젝트로 저장(제목만 · 내용 이어붙이기).
//
// 🔴 JSX 3덩어리(`ideaModeSelector` · `ideaPickerBlock` · `ideaSourcePickerNode`)는
//   **Dashboard에 그대로 남겼다.** 이 파일은 `.ts`이고, JSX 조립은 Dashboard 몫이라는 경계다
//   (그래서 그 셋이 쓰는 값 11개를 이 훅이 반환한다). 옮기려고 `.tsx`로 바꾸지 마라.
//
// 🔴 이 훅은 Project **state를 건드리지 않는다** — `saveProjectIdea` 서버 액션만 부른다.
//   그래서 Projects와 분리돼 있고, 여기에 Project state를 끌어오지 마라.

import { useEffect, useState } from "react";
import { IDEA_MAX, type IdeaView } from "@/lib/ai/state";
import type { IdeaGenerationMode } from "@/lib/ai/idea";
import { isIdeaResult } from "@/lib/dashboard/helpers";
import { runIdea as runIdeaAction, getAiResultVersion } from "@/lib/actions/ai";
import { ideaResultToText } from "@/lib/ai/idea-text";
import { saveProjectIdea } from "@/lib/actions/project";
import { PROJECT_STATUSES, type ProjectIdea } from "@/lib/project/types";
import { toEditableHtml, plainTextToHtml } from "@/lib/memo/rich-text";
import { withCleanup } from "@/lib/with-cleanup";

/** Dashboard의 `confirmDialog` state와 같은 모양 — 훅이 알림 팝업 하나만 띄운다. */
type ConfirmDialogState = {
  message: string; confirmLabel?: string;
  onConfirm: () => void | Promise<void>; hideCancel?: boolean;
} | null;

export function useIdeaBuild(opts: {
  ideaView: IdeaView | null;
  isAdmin: boolean;
  projectIdeas: ProjectIdea[] | null;
  /** runIdea가 "프로젝트를 먼저 고르라"는 알림 하나를 띄운다. Dashboard 소유 state다. */
  setConfirmDialog: (v: ConfirmDialogState) => void;
}) {
  const { ideaView, isAdmin, projectIdeas, setConfirmDialog } = opts;

  // AI Smart Direction — Idea Build
  function ideaDisplayFrom(view: IdeaView | null) {
    return view?.current && view.currentId && isIdeaResult(view.current)
      ? { id: view.currentId, result: view.current, savedMemoId: view.savedMemoId }
      : null;
  }
  const [ideaMeta, setIdeaMeta] = useState(ideaView);
  // 관리자는 하루 상한을 받지 않는다 — 서버(actions/ai.ts:50)는 이미 그렇게 동작하는데
  // 버튼 disabled가 isAdmin을 안 봐서 "서버는 허용, 화면은 잠김" 상태였다(2회에서 막힌 원인).
  const ideaExhausted = !isAdmin && (ideaMeta?.usedCount ?? 0) >= (ideaMeta?.maxCount ?? IDEA_MAX);
  const [ideaDisplay, setIdeaDisplay] = useState(ideaDisplayFrom(ideaView));
  // focusView와 같은 문제 — 자정 지나 서버가 새 ideaView(usedCount 0, current 없음)를 내려줘도
  // 마운트 시 1회만 읽은 이 state는 안 바뀌어서 어제 결과/횟수가 그대로 남아있었다.
  useEffect(() => {
    setIdeaMeta(ideaView);
    setIdeaDisplay(ideaDisplayFrom(ideaView));
  }, [ideaView]);
  const [ideaGenerating, setIdeaGenerating] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [ideaHistoryOpen, setIdeaHistoryOpen] = useState(false);
  // 어떤 프로젝트 아이디어를 확장할지 — 직접 선택 / 랜덤(매번 새로 뽑음).
  // null = 아직 아무것도 선택 안 함 — 기본값을 "random"으로 두면 아무 버튼도 안 누르고 Idea ON을
  // 눌러도 조용히 랜덤으로 생성돼버리는 문제가 있어(runIdea에서 null이면 선택을 강제한다).
  const [ideaGenMode, setIdeaGenMode] = useState<IdeaGenerationMode | null>(null);
  const [ideaSourcePickerOpen, setIdeaSourcePickerOpen] = useState(false);
  const [ideaSourceSearch, setIdeaSourceSearch] = useState("");
  // 랜덤은 기본값이라 이미 선택된 채로 열리는 경우가 많다 — 그 상태에서 다시 눌러도 색이 그대로라
  // "눌렀다"는 게 안 보이는 문제가 있다. 눌렀을 때 진한 보라로 바뀌고, [재생성]을 눌러 실제로
  // 생성이 시작되기 전까지는(runIdea에서 해제) 그 색을 유지한다.
  const [ideaRandomPulse, setIdeaRandomPulse] = useState(false);
  // random 생성이 실패했을 때 어떤 프로젝트를 시도했는지 기억해둔다 — 재시도는 이 프로젝트로만 하고
  // 매번 새로 뽑지 않는다. 성공하거나 사용자가 직접 모드를 바꾸면 비운다.
  const [ideaRetryPinnedId, setIdeaRetryPinnedId] = useState<string | null>(null);
  // 완료 프로젝트는 Idea Build 대상에서 제외한다 — 직접 선택 목록에도 노출하지 않는다
  const ideaPickableProjects = (projectIdeas ?? []).filter((p) => p.status !== "완료");
  const ideaSourceProject = ideaGenMode && ideaGenMode.kind === "specific" ? ideaPickableProjects.find((p) => p.id === ideaGenMode.projectId) : null;
  async function viewIdeaVersion(version: number) {
    const res = await getAiResultVersion("idea", version);
    if (!isIdeaResult(res.result)) return;
    setIdeaDisplay({ id: res.id, result: res.result, savedMemoId: res.savedMemoId });
  }

  async function runIdea() {
    if (ideaGenerating) return;
    if (!ideaGenMode) {
      setConfirmDialog({
        message: "진행할 프로젝트를 선택하거나 '랜덤' 버튼을 먼저 눌러주세요.",
        confirmLabel: "확인", hideCancel: true, onConfirm: () => {},
      });
      return;
    }
    setIdeaGenerating(true);
    setIdeaError(null);
    setIdeaRandomPulse(false);
    // random 모드에서 이전 실패로 프로젝트가 고정돼 있으면 그 프로젝트로만 재시도한다 — 다시 뽑지 않는다.
    const effectiveMode: IdeaGenerationMode =
      ideaGenMode.kind === "random" && ideaRetryPinnedId
        ? { kind: "random", pinnedProjectId: ideaRetryPinnedId }
        : ideaGenMode;
    // 서버 액션은 실패해도 throw하지 않고 {error, projectId?}를 돌려준다 — 그래도 예상 밖의 네트워크
    // 오류 등에 대비해 catch는 남겨둔다(runFocus와 동일한 이중 방어).
    // 정리(로딩 해제)는 withCleanup이 맡는다 — 옛 `finally`와 동작이 같고, 아래 early `return`에서도 실행된다.
    await withCleanup(async () => {
      try {
        // 로딩 애니메이션이 순간적으로 스쳐 지나가지 않도록 최소 5초는 보여준다 (실제 요청과 동시에 대기)
        const [res] = await Promise.all([runIdeaAction(effectiveMode), new Promise((r) => setTimeout(r, 5000))]);
        if ("error" in res) {
          setIdeaError(res.error);
          if (ideaGenMode.kind === "random" && res.projectId) setIdeaRetryPinnedId(res.projectId);
          return;
        }
        setIdeaRetryPinnedId(null);
        // 생성이 끝나면 선택을 비운다 — [재생성]은 이전 선택을 그대로 재사용해 조용히 또 생성해버렸다.
        // 이제 다시 프로젝트/랜덤을 고르지 않으면 위 guard의 알림 팝업이 뜬다.
        setIdeaGenMode(null);
        setIdeaMeta(res.view);
        if (res.view.current && res.view.currentId) {
          setIdeaDisplay({ id: res.view.currentId, result: res.view.current, savedMemoId: res.view.savedMemoId });
        }
      } catch {
        setIdeaError("생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    }, () => setIdeaGenerating(false));
  }
  // 아이디어 빌드 결과를 프로젝트로 저장
  const [ideaSaveToast, setIdeaSaveToast] = useState(false);
  async function saveIdeaTitleAsProject() {
    if (!ideaDisplay) return;
    const result = await saveProjectIdea(null, { title: ideaDisplay.result.recommendationTitle, status: PROJECT_STATUSES[0], summary: "", content_md: "" });
    if (result.error) { alert(result.error); return; }
    setIdeaSaveToast(true);
    setTimeout(() => setIdeaSaveToast(false), 1500);
  }
  const [pendingTitleOnlySave, setPendingTitleOnlySave] = useState(false);
  async function confirmSaveIdeaTitleAsProject() {
    setPendingTitleOnlySave(false);
    await saveIdeaTitleAsProject();
  }
  // 내용 저장은 어느 프로젝트에 저장할지 고를 수 있어야 한다 — 새 프로젝트 생성 또는 기존 프로젝트에 이어붙이기
  const [ideaProjectPicker, setIdeaProjectPicker] = useState(false);
  const [ideaSaveSearch, setIdeaSaveSearch] = useState("");
  const [pendingIdeaSave, setPendingIdeaSave] = useState<{ projectId: string | null; label: string } | null>(null);
  async function confirmPendingIdeaSave() {
    if (!pendingIdeaSave || !ideaDisplay) return;
    const { projectId } = pendingIdeaSave;
    setPendingIdeaSave(null);
    setIdeaProjectPicker(false);
    const existing = projectId ? (projectIdeas ?? []).find((p) => p.id === projectId) : null;
    // ideaResultToText()는 개행만 있는 순문 텍스트다 — 기존 rich HTML 뒤에 이어붙이려면 memo의 saveBlockToMemo와
    // 동일하게 HTML 블록으로 변환해야 한다(그대로 concat하면 태그 이스케이프/개행 손실이 생긴다)
    const ideaTextHtml = plainTextToHtml(ideaResultToText(ideaDisplay.result));
    const input = existing
      ? { title: existing.title, status: existing.status, summary: existing.summary ?? "", content_md: existing.content_md ? `${toEditableHtml(existing.content_md, existing.content_format)}${ideaTextHtml}` : ideaTextHtml }
      : { title: "프로젝트명", status: PROJECT_STATUSES[0], summary: "", content_md: ideaTextHtml };
    const result = await saveProjectIdea(existing?.id ?? null, input);
    if (result.error) { alert(result.error); return; }
    setIdeaSaveToast(true);
    setTimeout(() => setIdeaSaveToast(false), 1500);
  }

  return {
    // ① Dashboard에 남은 JSX 3덩어리가 쓰는 것
    ideaGenMode, setIdeaGenMode,
    ideaRandomPulse, setIdeaRandomPulse,
    setIdeaRetryPinnedId,
    ideaSourcePickerOpen, setIdeaSourcePickerOpen,
    ideaSourceProject,
    ideaPickableProjects,
    ideaSourceSearch, setIdeaSourceSearch,
    // ② IdeaDialog가 쓰는 것
    ideaGenerating,
    ideaDisplay,
    ideaError,
    ideaMeta,
    ideaExhausted,
    ideaHistoryOpen, setIdeaHistoryOpen,
    runIdea,
    viewIdeaVersion,
    ideaProjectPicker, setIdeaProjectPicker,
    pendingTitleOnlySave, setPendingTitleOnlySave,
    pendingIdeaSave, setPendingIdeaSave,
    confirmSaveIdeaTitleAsProject,
    confirmPendingIdeaSave,
    ideaSaveSearch, setIdeaSaveSearch,
    ideaSaveToast,
  };
}
