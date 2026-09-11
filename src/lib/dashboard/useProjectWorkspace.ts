"use client";

// Dashboard.tsx에서 **그대로 옮겨온** Project 워크스페이스 (Dashboard ownership Audit 6순위 · 마지막 후보).
// 로직은 한 글자도 안 고쳤다 — useMyPageSession·useIdeaBuild와 같은 이동 전용 추출이다.
//
// 여기 모인 것: CREATE/VIEW/EDIT 3모드 폼 state / 본문 ref+디바운스 flush / 목록 검색·상태 필터 /
//               템플릿 삽입 / 저장·삭제·뒤로가기 / 자동저장(디바운스 + 신규 insert id 재사용).
//
// 🔴 **autosave 4종은 한 묶음이다** — projAutosaveTimerRef · editingProjectIdRef ·
//   scheduleProjectAutosave · discardPendingProjectAutosave. 넷 다 훅 안에만 있고 앞의 셋은 밖으로
//   반환하지 않는다. 밖에서 타이머나 id ref를 만지면 **신규 작성 중 중복 insert**가 되살아난다
//   (아래 scheduleProjectAutosave 주석의 t=0~2100 시나리오가 그것이다).
//
// 🔴 **bodyEditor는 이 훅이 소유하지 않는다.** 메모↔프로젝트를 잇는 다리라 Dashboard에 남는다.
//   방향이 양쪽이므로 Dashboard가 중재자다:
//     훅 → bodyEditor : readBodyEditorDraft·setBodyEditorDraft·setBodyEditorSessionKey를 주입받는다
//     bodyEditor → 훅 : readProjContent·setProjContent·setProjEditorKey 3개를 반환한다
//   훅 안에 bodyEditor state를 들이면 그 순간 순환이 된다. 넣지 마라.
//
// 🔴 **JSX는 Dashboard가 소유한다**(이 파일은 .ts다). projTemplatePromptNode ·
//   projAutosaveStatusNode · projDetailBody · 목록 다이얼로그 · 카드 통계 · 모바일 시트는
//   전부 Dashboard에 남고, 그것들이 쓰는 값만 여기서 반환한다. .tsx로 바꾸지 마라.
//
// 🔴 projectEditPage / projectPageOpen도 Dashboard 소유다 — mobileEditActive ·
//   monthlyComposePage · bigEditorPage와 나란히 서는 **4개짜리 레이아웃 플래그**라
//   여기로 끌고 오면 메모·먼슬리 편집 레이아웃이 Project 훅에 묶인다. setter만 주입받는다.

import { useEffect, useMemo, useRef, useState } from "react";
import { saveProjectIdea, deleteProjectIdea } from "@/lib/actions/project";
import { SUMMARY_MAX_LENGTH } from "@/lib/dashboard/helpers";
import { toEditableHtml, htmlToPlainText } from "@/lib/memo/rich-text";
import { PROJECT_TEMPLATE_HTML, toggleTaskItemInHtml } from "@/lib/project/template";
import { PROJECT_STATUSES, type ProjectIdea } from "@/lib/project/types";

export function useProjectWorkspace(opts: {
  projectIdeas: ProjectIdea[] | null;
  /** ref 묶음을 그대로 받는다 — 본문이 원문대로 dialogs.projectDetail을 쓰게 하려는 것뿐이다. */
  dialogs: { projectDetail: React.RefObject<HTMLDialogElement | null> };
  open: (d: React.RefObject<HTMLDialogElement | null>) => void;
  close: (d: React.RefObject<HTMLDialogElement | null>) => void;
  setProjectPageOpen: (v: boolean) => void;
  setMobileProjectMenuOpen: (v: boolean) => void;
  resetProjectDetailScroll: () => void;
  askConfirm: (message: string, onConfirm: () => void | Promise<void>, confirmLabel?: string, hideCancel?: boolean) => void;
  /** bodyEditor(확장 창)는 Dashboard 소유다 — 템플릿 삽입 경로에서만 쓰려고 받는다. */
  readBodyEditorDraft: () => string;
  setBodyEditorDraft: (value: string | ((prev: string) => string)) => void;
  setBodyEditorSessionKey: React.Dispatch<React.SetStateAction<number>>;
}) {
  const {
    projectIdeas, dialogs, open, close,
    setProjectPageOpen, setMobileProjectMenuOpen,
    resetProjectDetailScroll, askConfirm,
    readBodyEditorDraft, setBodyEditorDraft, setBodyEditorSessionKey,
  } = opts;

  // 프로젝트 아이디어 — CREATE(새 작성) / VIEW(읽기) / EDIT(수정) 3개 모드를 같은 다이얼로그가 담당한다.
  // 본문은 Monthly Memo의 MemoRichEditor를 그대로 재사용한다(프로젝트 전용 에디터를 새로 만들지 않는다).
  const [projMode, setProjMode] = useState<"create" | "view" | "edit">("create");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projTitle, setProjTitle] = useState("");
  const [projStatus, setProjStatus] = useState<string>(PROJECT_STATUSES[0]);
  const [projSummary, setProjSummary] = useState("");
  // 프로젝트 본문도 메모 본문과 같은 이유로 ref를 최신값의 기준으로 둔다(위 formBodyRef 주석 참고).
  const [projContent, setProjContentState] = useState("");
  const projContentRef = useRef("");
  const projContentFlushRef = useRef<number | null>(null);
  function readProjContent() {
    return projContentRef.current;
  }
  function setProjContent(value: string | ((prev: string) => string)) {
    const next = typeof value === "function" ? value(projContentRef.current) : value;
    projContentRef.current = next;
    if (projContentFlushRef.current !== null) {
      window.clearTimeout(projContentFlushRef.current);
      projContentFlushRef.current = null;
    }
    setProjContentState(next);
  }
  function setProjContentWhileTyping(html: string) {
    projContentRef.current = html;
    if (projContentFlushRef.current !== null) window.clearTimeout(projContentFlushRef.current);
    projContentFlushRef.current = window.setTimeout(() => {
      projContentFlushRef.current = null;
      setProjContentState(projContentRef.current);
    }, 300);
  }
  const [projUpdatedAt, setProjUpdatedAt] = useState<string | null>(null);
  const [projSummaryError, setProjSummaryError] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [projEditorKey, setProjEditorKey] = useState(0); // 템플릿 삽입/모드 전환 시 Tiptap 재마운트용
  // false | "form"(작성창 안 에디터) | "bodyEditor"(확장 창) — 어느 쪽에서 템플릿을 눌렀는지 기억해야
  // "추가" 확인 후 같은 곳에 적용할 수 있다.
  const [projTemplatePrompt, setProjTemplatePrompt] = useState<false | "form" | "bodyEditor">(false);
  // 프로젝트 편집 화면의 "한 줄 요약⌄" 토글이 여는 팝업. 🔴 예전엔 state가 Dashboard에 있고 이 훅이
  // setter만 주입받았는데, 읽는 곳도 쓰는 곳도 전부 Project라 여기로 owner를 옮겼다(주입 인자 −1).
  const [mobileProjectSummaryOpen, setMobileProjectSummaryOpen] = useState(false);
  // 팝업/토글 밖을 누르면 닫는다.
  useEffect(() => {
    if (!mobileProjectSummaryOpen) return;
    function closeSummaryOnOutsidePress(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".mobile-project-summary-popover") || target.closest(".mobile-project-summary-toggle")) return;
      setMobileProjectSummaryOpen(false);
    }
    document.addEventListener("pointerdown", closeSummaryOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeSummaryOnOutsidePress, true);
  }, [mobileProjectSummaryOpen]);

  // 프로젝트 목록 — 검색+상태 필터 (목록은 Database Table로, 서버에서 이미 최근 수정일 내림차순으로 온다)
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>("전체");
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return (projectIdeas ?? []).filter((p) => {
      if (projectStatusFilter !== "전체" && p.status !== projectStatusFilter) return false;
      if (q && !p.title.toLowerCase().includes(q) && !(p.summary ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projectIdeas, projectSearch, projectStatusFilter]);

  // 🔴 다른 프로젝트로 갈아타기 전에 **대기 중인 자동저장을 반드시 버린다.** 남겨두면 1초 뒤
  // 그 타이머가 방금 떠난 화면의 제목·본문을 지금 열린 프로젝트에 덮어쓴다(신규로 열었으면 그
  // 내용으로 row를 하나 더 만든다). 저장 버튼·‹ 나가기 경로는 이미 같은 정리를 하고 있다.
  function discardPendingProjectAutosave() {
    if (projAutosaveTimerRef.current) { clearTimeout(projAutosaveTimerRef.current); projAutosaveTimerRef.current = null; }
  }
  function openNewProject() {
    discardPendingProjectAutosave();
    setProjMode("create");
    setEditingProjectId(null);
    editingProjectIdRef.current = null;
    setProjTitle("");
    setProjStatus(PROJECT_STATUSES[0]);
    setProjSummary("");
    setProjContent("");
    setProjUpdatedAt(null);
    setProjSummaryError(null);
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    setProjEditorKey((k) => k + 1);
    resetProjectDetailScroll();
    openProjectShell();
  }
  // 프로젝트 편집 껍데기를 연다 — 모바일은 일반 페이지, 데스크톱은 기존 모달 그대로.
  // 🔴 모바일에서 `open(dialogs.projectDetail)`을 **부르지 않는 것**이 구조 전환의 핵심이다.
  //    부르면 모달 fixed 껍데기(①)와 배경 잠금(②)이 같이 따라온다.
  function openProjectShell() {
    const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    if (mobile) { setProjectPageOpen(true); window.scrollTo(0, 0); return; }
    open(dialogs.projectDetail);
  }
  // 프로젝트 편집을 닫는다 — 페이지/모달 어느 쪽으로 열렸든 한 곳에서 내린다.
  // 🔴 두 경로를 따로 닫지 마라. 한쪽만 내리면 페이지가 남은 채 대시보드가 가려진다
  //    (`.sp-body.memo-edit-page-open`이 `.page`를 display:none으로 접기 때문).
  //    모달이 아니었으면 close()는 no-op이고 activeDialogKey도 그대로다 — 안전하다.
  function closeProjectDetail() {
    setProjectPageOpen(false);
    close(dialogs.projectDetail);
  }
  function openExistingProject(p: ProjectIdea) {
    // 모바일은 postit과 동일하게 읽기전용 View를 건너뛰고 바로 편집 폼으로 들어간다(자동저장이라 안전)
    discardPendingProjectAutosave();
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;
    setProjMode(isMobile ? "edit" : "view");
    setEditingProjectId(p.id);
    editingProjectIdRef.current = p.id;
    setProjTitle(p.title);
    setProjStatus(p.status);
    setProjSummary(p.summary ?? "");
    // content_format 컬럼으로 판별한다 — 서식 없는 rich_html 본문(순수 <p> 문단)을 문자열 추측으로 plain 오판하면
    // 태그가 그대로 이스케이프되어 노출되므로 hasRichFormatting 휴리스틱을 쓰지 않는다
    setProjContent(toEditableHtml(p.content_md, p.content_format));
    setProjUpdatedAt(p.updated_at);
    setProjSummaryError(null);
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    setProjEditorKey((k) => k + 1);
    resetProjectDetailScroll();
    openProjectShell();
  }
  // 자유 형식 = 목차를 자동으로 넣지 않을 뿐, 에디터 기능은 기본 템플릿과 완전히 동일하다.
  // 본문이 이미 있으면 절대 덮어쓰지 않고 "아래에 추가할까요?"를 먼저 물어본다.
  // 작성창 안 에디터(form)와 확장 창(bodyEditor)이 같은 로직을 쓰되 대상 state만 다르다.
  function applyProjectTemplate(target: "form" | "bodyEditor" = "form") {
    const current = target === "bodyEditor" ? readBodyEditorDraft() : readProjContent();
    if (htmlToPlainText(current).trim().length > 0) { setProjTemplatePrompt(target); return; }
    if (target === "bodyEditor") { setBodyEditorDraft(PROJECT_TEMPLATE_HTML); setBodyEditorSessionKey((k) => k + 1); }
    else { setProjContent(PROJECT_TEMPLATE_HTML); setProjEditorKey((k) => k + 1); }
  }
  function appendProjectTemplate() {
    if (projTemplatePrompt === "bodyEditor") {
      setBodyEditorDraft((prev) => prev + PROJECT_TEMPLATE_HTML);
      setBodyEditorSessionKey((k) => k + 1);
    } else {
      setProjContent((prev) => prev + PROJECT_TEMPLATE_HTML);
      setProjEditorKey((k) => k + 1);
    }
    setProjTemplatePrompt(false);
  }
  // VIEW에서 핵심 기능 체크만 즉시 반영한다 — [수정] 진입 없이 바로 저장까지 간다.
  async function toggleProjectTask(index: number) {
    const next = toggleTaskItemInHtml(readProjContent(), index);
    setProjContent(next);
    if (!editingProjectId) return;
    await saveProjectIdea(editingProjectId, {
      title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: next,
    });
    // 이하 프로젝트 저장/삭제 경로 전부 router.refresh()를 뺐다 — saveProjectIdea/deleteProjectIdea가
    // revalidatePath("/")를 부르므로 그 액션 응답이 새 projectIdeas를 실어 온다. projectIdeas는 로컬
    // 미러가 없어 prop을 직접 읽는 유일한 값인데, 액션 응답의 재렌더가 그 prop을 갱신해준다
    // (근거: refreshAfterMemoChange 주석).
  }
  async function handleSaveProject() {
    const summary = projSummary.trim();
    if (summary.length > SUMMARY_MAX_LENGTH) {
      setProjSummaryError(`한 줄 요약은 최대 ${SUMMARY_MAX_LENGTH}자까지 입력할 수 있습니다.`);
      return;
    }
    // 대기 중인 자동저장 타이머가 뒤늦게 같은 내용을 또 insert(신규 작성 중 중복 row)하지 않도록 막는다.
    if (projAutosaveTimerRef.current) { clearTimeout(projAutosaveTimerRef.current); projAutosaveTimerRef.current = null; }
    setProjSummaryError(null);
    setSavingProject(true);
    try {
      // ref로 읽는 이유는 handleProjectDetailBack과 같다 — 자동저장이 방금 만든 row를 놓치면 중복 insert가 된다.
      const id = editingProjectIdRef.current;
      const result = await saveProjectIdea(id, {
        title: projTitle, status: projStatus, summary, content_md: readProjContent(),
      });
      if (result.error) { alert(result.error); return; }
      if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
      closeProjectDetail();
    } finally {
      setSavingProject(false);
    }
  }
  function handleDeleteProject() {
    if (!editingProjectId) return;
    askConfirm("이 프로젝트 아이디어를 삭제할까요?", async () => {
      await deleteProjectIdea(editingProjectId);
      closeProjectDetail();
    });
  }
  // 모바일 ‹ 목록 버튼 — 디바운스된 자동저장이 아직 안 걸렸을 수 있으니 나가기 전에 즉시 한 번 저장한다.
  async function handleProjectDetailBack() {
    setMobileProjectMenuOpen(false);
    setMobileProjectSummaryOpen(false);
    if (projMode === "view" || !projTitle.trim()) { closeProjectDetail(); return; }
    if (savingProject) return;
    if (projAutosaveTimerRef.current) {
      clearTimeout(projAutosaveTimerRef.current);
      projAutosaveTimerRef.current = null;
    }
    // 메모 쪽(handlePostitBack)과 같은 이유로 창을 **먼저** 닫고 저장은 뒤에서 보낸다 —
    // 모바일/PWA에서 ‹를 누르고 서버 왕복 한 번을 멈춘 채 기다리던 구간이다.
    // 🔴 state가 아니라 ref다 — 자동저장이 방금 만든 row의 id는 아직 state에 안 들어와 있을 수
    // 있고, 그러면 여기서 같은 내용을 한 번 더 insert한다(scheduleProjectAutosave 주석의 그 창).
    const id = editingProjectIdRef.current;
    const input = { title: projTitle, status: projStatus, summary: projSummary.trim(), content_md: readProjContent() };
    closeProjectDetail();
    const result = await saveProjectIdea(id, input);
    if (result.error) { alert(result.error); return; }
    if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
  }

  // Monthly Memo와 같은 방식 — 입력이 멈추고 1초 뒤 조용히 저장한다. 신규 작성 중(editingProjectId
  // 없음)에도 제목이 있으면 저장을 걸어 새 row를 만들고, 그 id를 editingProjectId로 채워 이후
  // 자동저장이 같은 row를 계속 update하게 한다 — 드래그 등으로 창을 실수로 벗어나도 내용이 남는다.
  const [projAutosaveStatus, setProjAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const projAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 🔴🔴 신규 프로젝트의 id는 **타이머가 터지는 시점**에 읽어야 한다 — 스케줄 시점에 읽으면 중복 insert가 난다.
  //
  // 예전엔 `const id = editingProjectId`를 스케줄 시점에 잡았다. 신규 작성 흐름을 그대로 따라가면:
  //   t=0     제목 입력 → 스케줄(id=null), 타이머 T1
  //   t=1000  T1 발화 → insert 시작(아직 응답 없음)
  //   t=1100  이어서 타이핑 → 스케줄. editingProjectId는 **아직 null**이라 id=null로 또 잡힌다 → T2
  //   t=1300  insert 응답 → setEditingProjectId(새 id)
  //   t=2100  T2 발화 → id가 null이므로 **두 번째 insert** = 같은 프로젝트가 목록에 두 벌
  // 디바운스는 "대기 중인 타이머"만 지우지 이미 발화해 왕복 중인 저장은 못 지운다. 1초 넘게
  // 이어 치기만 하면 재현되므로 신규 작성에서는 사실상 상시 발생하는 경로다.
  // 최신 id를 ref로 들고 발화 시점에 읽는다 — setEditingProjectId 뒤 커밋에서 이 effect가 맞춰준다.
  const editingProjectIdRef = useRef<string | null>(null);
  useEffect(() => { editingProjectIdRef.current = editingProjectId; }, [editingProjectId]);
  function scheduleProjectAutosave(overrides: Partial<{ title: string; status: string; summary: string; content: string }> = {}) {
    const title = overrides.title ?? projTitle;
    const status = overrides.status ?? projStatus;
    const summary = overrides.summary ?? projSummary;
    const content = overrides.content ?? readProjContent();
    if (!title.trim()) return; // 제목 없이는 저장하지 않는다(서버 액션도 동일하게 막는다)
    if (projAutosaveTimerRef.current) clearTimeout(projAutosaveTimerRef.current);
    projAutosaveTimerRef.current = setTimeout(async () => {
      const id = editingProjectIdRef.current; // 스케줄 시점이 아니라 **지금** 읽는다(위 주석)
      setProjAutosaveStatus("saving");
      try {
        const result = await saveProjectIdea(id, { title, status, summary: summary.trim(), content_md: content });
        if (result.error) { setProjAutosaveStatus("idle"); return; }
        // 다음 타이머가 같은 row를 update하도록 ref를 **즉시** 채운다. setEditingProjectId는
        // 커밋 뒤에야 반영되므로 그것만 믿으면 위 중복 insert 창이 그대로 남는다.
        if (!id && result.id) { editingProjectIdRef.current = result.id; setEditingProjectId(result.id); }
        setProjAutosaveStatus("saved");
        setTimeout(() => setProjAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        // 세션 만료·네트워크 실패로 throw되면 예전엔 "저장 중..."이 영원히 남았다(unhandled rejection).
        console.error("[project] 자동저장 실패", e);
        setProjAutosaveStatus("idle");
      }
    }, 1000);
  }

  // 카드용 상태별 카운트 — Dashboard에서 **그대로 옮겨왔다**(계산식 무변경).
  // 원본 `projectIdeas`가 이 훅의 인자라 소유자는 여기다. Dashboard는 카드에 넘기기만 한다.
  const projectIdeaCount = projectIdeas?.length ?? 0;
  const projectDevCount = (projectIdeas ?? []).filter((p) => p.status === "개발중").length;
  const projectDraftCount = (projectIdeas ?? []).filter((p) => p.status === "기획안작성").length;
  const projectIdeaOnlyCount = (projectIdeas ?? []).filter((p) => p.status === "아이디어").length;

  // 반환 키 = Dashboard의 기존 변수 이름 그대로다(rename 0). 아래 12개는 훅 밖 사용이 0회라
  // **반환하지 않는다** — 밖에서 만지면 autosave 계약이 깨진다:
  //   setEditingProjectId · setProjContentState · projContentRef · projContentFlushRef ·
  //   setProjUpdatedAt · setProjSummaryError · setSavingProject · setProjAutosaveStatus ·
  //   projAutosaveTimerRef · editingProjectIdRef · discardPendingProjectAutosave · openProjectShell
  return {
    projMode, setProjMode,
    editingProjectId,
    projTitle, setProjTitle,
    projStatus, setProjStatus,
    projSummary, setProjSummary,
    projContent, setProjContentWhileTyping,
    projUpdatedAt,
    projSummaryError,
    savingProject,
    projEditorKey, setProjEditorKey,
    projTemplatePrompt, setProjTemplatePrompt,
    mobileProjectSummaryOpen, setMobileProjectSummaryOpen,
    projectSearch, setProjectSearch,
    projectStatusFilter, setProjectStatusFilter,
    projAutosaveStatus,
    filteredProjects,
    projectIdeaCount, projectDevCount, projectDraftCount, projectIdeaOnlyCount,
    openNewProject, closeProjectDetail, openExistingProject,
    applyProjectTemplate, appendProjectTemplate,
    toggleProjectTask,
    handleSaveProject, handleDeleteProject, handleProjectDetailBack,
    scheduleProjectAutosave,
    // bodyEditor 다리 — Dashboard의 openBodyEditor/closeBodyEditor가 쓰는 3개
    readProjContent, setProjContent,
  };
}
