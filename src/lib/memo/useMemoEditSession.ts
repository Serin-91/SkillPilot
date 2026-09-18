"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 메모 편집 세션 — 폼 state + 자동저장 + 저장/삭제.
// (Memo 소유권 리팩토링 1단계. 로직은 한 글자도 안 고쳤다 — "옮기면서 고치기 금지".)
//
// 여기 모인 것: 폼 state 16개 / ref 4개 / 핸들러 11개 / effect 1개(날짜 검증).
//
// 🔴 여기 **안 들어온** 것과 그 이유 — 되돌리지 마라:
//   ① `openBodyEditor`/`closeBodyEditor`와 `bodyEditorDraft/Target/SessionKey`,
//      그리고 caret 복원 effect(`pendingCursorPosRef` → `bodyEditorHandleRef`).
//      `bodyEditorTarget === "project"` 분기가 `setProjContent`/`setProjEditorKey`/`readProjContent`를
//      부른다 — 이걸 들이면 **Memo 훅이 Project state를 소유**하게 된다.
//   ② `activeMemoEditorRef` — `activeDialogKey`/`bigEditorOpen`/`postitEditMode`/`memoFormOpen`
//      **네 그룹**의 state를 읽어 ref 4개 중 하나를 고른다. 어느 한 훅에도 속하지 않는다.
//   ③ 목록(LIST)·열기/닫기(SHELL)·삽입(INSERT) 영역 전부. 2단계(`useMemoListData`) 이후다.
//
// ✅ 저장 payload 3중 복제는 `memo-input.ts`의 **`buildMemoInput()` 한 곳으로 합쳤다**(2026-09-12).
//   `handlePostitBack` / `handleSaveMemo` / `handleMemoDialogBack` 셋이 그 함수를 쓴다 —
//   필드를 추가하거나 규칙을 바꿀 때 **거기 한 곳만** 고쳐라. 여기로 다시 복제하지 마라.
//   🔴 `contentFormatFor`는 그대로 남는다 — autosave 경로(아래 `scheduleAutosave`)가 따로 쓴다.
//
// 🔴 자동저장은 되돌릴 수 없는 쓰기다. `scheduleAutosave` · `autosaveTimerRef` ·
//   `memoBodyBaselineRef` · `formBodyRef`/`formBodyFlushRef`는 **한 묶음**이다. 하나라도 밖으로
//   빼면 축소 가드가 조용히 죽는다.

import { useRef, useState } from "react";
import type { Memo, MemoColor, MemoType, TodoStatus, ContentFormat, ContentMode } from "./types";
import { defaultMemoColor } from "./types";
import { toEditableHtml, htmlToPlainText, hasRichFormatting } from "./rich-text";
import { buildMemoInput } from "./memo-input";
import { createMemo, updateMemo, deleteMemo, getMemosForDateAction } from "@/lib/actions/memo";
import { withCleanup } from "@/lib/with-cleanup";

// 이 비율보다 더 줄면 자동저장을 멈춘다. 사람이 지운 것이라면 저장 버튼/‹로 명시적으로 저장된다.
// 짧은 메모는 한두 문장만 지워도 비율이 크게 떨어지므로 최소 길이를 같이 둔다.
const AUTOSAVE_SHRINK_RATIO = 0.5;
const AUTOSAVE_SHRINK_MIN_CHARS = 200;

export function useMemoEditSession(opts: {
  /** 새 폼의 시작일/종료일 초기값. LIST 소유(`viewYear`/`viewMonth0`/`memoDialogDay`)라 인자로 받는다. */
  memoDialogDateIso: string;
  /** 저장 후 View로 복귀할지 폼을 닫을지 가른다 (SHELL 소유). */
  postitEditMode: "quick" | "detail" | null;
  /** 저장/삭제 뒤 목록 갱신 (LIST 소유). 반환값을 그대로 쓴다 — 왕복 한 번을 아끼는 자리다. */
  refreshAfterMemoChange: () => Promise<Memo[]>;
  /** 🔴 `patchLocalMemo`가 쓰는 셋. 하나라도 빠지면 "메모를 껐다 켜야 보인다"가 재발한다. */
  setViewMemos: React.Dispatch<React.SetStateAction<Memo[]>>;
  setMemosForMonthState: React.Dispatch<React.SetStateAction<Memo[] | null>>;
  setPostitViewMemo: React.Dispatch<React.SetStateAction<Memo | null>>;
  setMemoFormOpen: (v: boolean) => void;
  setPostitEditMode: (v: "quick" | "detail" | null) => void;
  /** `loadMemoIntoForm`이 새 세션을 시작할 때 대기 중 삽입을 지운다 (INSERT 소유). */
  setPendingInsert: (v: null) => void;
  closeBigEditor: () => void;
  closePostitView: () => void;
  askConfirm: (message: string, onConfirm: () => void | Promise<void>, confirmLabel?: string, hideCancel?: boolean) => void;
  /** Create 초기 색상을 정하는 데만 쓴다(`defaultMemoColor`). 테마 소유는 SHELL이다. */
  theme: "light" | "dark";
  /** 🔴 `memoFormRef`를 받지 **않고** 스크롤 동작만 받는다 — ref 소유를 퍼뜨리지 않기 위해서다.
   *  ref는 그걸 JSX에 달아 쓰는 Dashboard에 그대로 있다. 여기로 옮기지 마라. */
  scrollToMemoForm: () => void;
}) {
  const {
    memoDialogDateIso, postitEditMode, refreshAfterMemoChange, theme, scrollToMemoForm,
    setViewMemos, setMemosForMonthState, setPostitViewMemo,
    setMemoFormOpen, setPostitEditMode, setPendingInsert,
    closeBigEditor, closePostitView, askConfirm,
  } = opts;

  // Monthly MEMO 폼 — editingMemoId가 null이면 새 메모 생성
  // (memoFormOpen 자체는 Dashboard에 남았다 — 배경 스크롤 잠금 effect가 그걸 봐야 해서다.)
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<MemoType>("free_note");
  const [formStatus, setFormStatus] = useState<TodoStatus>("planned");
  const [formStartDate, setFormStartDate] = useState(memoDialogDateIso);
  const [formEndDate, setFormEndDate] = useState(memoDialogDateIso);
  const [formImportant, setFormImportant] = useState(false);
  const [formPinned, setFormPinned] = useState(false);
  const [formColor, setFormColor] = useState<MemoColor>("yellow");
  const [formBody, setFormBodyState] = useState("");
  // 본문 최신값은 항상 이 ref에 동기적으로 들어간다. 리치 에디터(Tiptap)는 키 입력마다 onChange를
  // 주는데, 그때마다 setState로 Dashboard(이 컴포넌트 하나가 화면 전체를 그린다)를 리렌더하면
  // 타이핑이 눈에 띄게 밀렸다 — "입력 버퍼링"의 실제 원인이다(자동저장 문구가 아니다).
  // 그래서 타이핑 중에는 ref만 갱신하고 state는 입력이 멈춘 뒤에 한 번 따라가게 한다.
  // 저장·자동저장·나가기 판정은 전부 readFormBody()로 ref를 읽으므로 state가 늦어도 유실이 없다.
  const formBodyRef = useRef("");
  const formBodyFlushRef = useRef<number | null>(null);
  // content_format은 "이 본문이 실제로 무엇인가"를 나타내야 한다. 예전엔 UI 토글(formContentMode)만
  // 보고 quick이면 무조건 "plain"으로 저장했는데, 간단 메모도 같은 MemoRichEditor를 쓰고 모바일
  // 서식툴바는 hideToolbar와 무관하게 항상 뜬다 — 즉 quick 모드에서도 링크·굵게를 넣을 수 있다.
  // 그러면 저장된 본문은 리치 HTML인데 포맷은 plain이라, 다시 열 때 htmlToPlainText로 납작해져
  // 넣은 링크가 통째로 사라졌다(실측: htmlToPlainText가 <a>를 지우고 텍스트만 남긴다).
  // 내용에 실제 서식이 있으면 모드와 무관하게 rich_html로 저장한다.
  function contentFormatFor(body: string): ContentFormat {
    return formContentMode === "document" || hasRichFormatting(body) ? "rich_html" : "plain";
  }
  function readFormBody() {
    return formBodyRef.current;
  }
  function cancelFormBodyFlush() {
    if (formBodyFlushRef.current !== null) {
      window.clearTimeout(formBodyFlushRef.current);
      formBodyFlushRef.current = null;
    }
  }
  // 자동저장 축소 가드의 기준값 — "이 편집 세션이 시작될 때 본문이 얼마였나". `setFormBody`는
  // 새 세션 초기화·모드 전환처럼 **의도적으로 본문을 통째로 갈아끼우는** 자리에서만 불리므로
  // 여기가 기준을 세울 유일한 지점이다(타이핑 경로 setFormBodyWhileTyping은 기준을 만지지 않는다).
  const memoBodyBaselineRef = useRef("");
  // 즉시 반영이 필요한 경로(새 세션 초기화, 모드 전환, 삽입 등)
  function setFormBody(html: string) {
    formBodyRef.current = html;
    memoBodyBaselineRef.current = html;
    cancelFormBodyFlush();
    setFormBodyState(html);
  }
  // 리치 에디터 타이핑 경로 — ref는 즉시, state는 입력이 멈춘 뒤에만
  function setFormBodyWhileTyping(html: string) {
    formBodyRef.current = html;
    cancelFormBodyFlush();
    formBodyFlushRef.current = window.setTimeout(() => {
      formBodyFlushRef.current = null;
      setFormBodyState(formBodyRef.current);
    }, 300);
  }
  // 간단 메모(quick, plain textarea) / 상세 메모(document, Tiptap) — formBody는 항상 현재 모드가 만드는
  // 형식(plain 또는 rich HTML) 그대로를 담는다. 전환 시점에만 명시적으로 변환한다 (36~37절)
  const [formContentMode, setFormContentMode] = useState<ContentMode>("quick");
  const [formEmoji, setFormEmoji] = useState<string | null>(null);
  // 편집 대상이 바뀔 때마다 올려서 MemoRichEditor를 key로 강제 재마운트 — Tiptap은 textarea처럼
  // value prop만으로 내용이 갱신되지 않아서, 새 세션을 시작할 때마다 새로 초기화한다.
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [savingMemo, setSavingMemo] = useState(false);

  // Create 진입 — Dashboard에서 **그대로 옮겨왔다**(재-Audit 후보 ⑪). 초기값 정책 무변경.
  // 위 loadMemoIntoForm(Edit)과 한 쌍이다: 폼 state 14개를 세팅하는 주체가 이제 둘 다 여기다.
  // 🔴 `memoFormRef`는 **Dashboard에 그대로 둔다** — JSX가 쓰는 ref라 여기로 끌고 오면 ref 소유가
  //   번진다. 스크롤은 ref를 가진 쪽이 준 `scrollToMemoForm` 콜백을 부르기만 한다.
  function openCreateMemoForm() {
    setEditingMemoId(null);
    setFormTitle("");
    setFormType("free_note");
    setFormStatus("planned");
    setFormStartDate(memoDialogDateIso);
    setFormEndDate(memoDialogDateIso);
    setFormImportant(false);
    setFormPinned(false);
    setFormColor(defaultMemoColor(theme));
    setFormBody("");
    setFormContentMode("document"); // Monthly MEMO + Create = 상세 메모 생성으로 단일화 (간단 메모는 포스트잇 전용)
    setFormEmoji(null);
    setFormSessionKey((k) => k + 1);
    setMemoFormOpen(true);
    scrollToMemoForm();
  }

  // Quick Edit/Detail Edit/bigEditorNode(뉴스·채용공고 등)이 모두 공유하는 폼 상태 채우기.
  // target 모드가 "quick"인데 원본이 document(rich_html)면 서식을 제거한 plain text로 내려서 보여준다.
  function loadMemoIntoForm(m: Memo, mode: ContentMode) {
    setPendingInsert(null);
    setEditingMemoId(m.id);
    setFormTitle(m.is_auto_title ? "" : m.title);
    setFormType(m.memo_type);
    setFormStatus(m.status ?? "planned");
    setFormStartDate(m.start_date);
    setFormEndDate(m.end_date);
    setFormImportant(m.is_important);
    setFormPinned(m.is_pinned);
    setFormColor(m.color);
    setFormContentMode(mode);
    setFormBody(
      mode === "document"
        ? toEditableHtml(m.content, m.content_format)
        : (m.content_format === "rich_html" ? htmlToPlainText(m.content ?? "") : (m.content ?? ""))
    );
    setFormEmoji(m.emoji);
    setFormSessionKey((k) => k + 1);
  }

  // 시작일이 종료일보다 늦어도 아무 경고 없이 저장되던 버그 — 저장 경로가 셋(저장 버튼 /
  // Monthly MEMO ‹ 나가기 / 포스트잇 ‹ 나가기)인데 전부 검사가 없었다. 세 경로가 같은 폼 상태를
  // 쓰므로 여기 한 곳에서만 막는다. ISO(YYYY-MM-DD)라 문자열 비교로 충분하다.
  // 저장 시점에만 검사하면 memoFormOpen이 false인 경로(다이얼로그 하단 상시 폼 등)나
  // 저장 없이 닫히는 흐름에서 문구가 아예 안 뜬다. 날짜가 바뀌는 즉시 검사해 두면
  // 어느 화면(웹 폼 / 포스트잇 수정 / ⋮ 시트)에서 고르든 바로 경고가 보인다.
  const memoDateError: string | null =
    formStartDate && formEndDate && formStartDate > formEndDate
      ? "시작일이 종료일보다 늦을 수 없습니다."
      : null;
  function validateMemoDates() {
    return !memoDateError;
  }

  // 24절 — 자동 저장. 기존 메모를 편집 중일 때만(신규 작성은 아직 id가 없어 대상이 없다) 입력이
  // 멈추고 1초 뒤 조용히 저장한다. 목록/카드가 세션 중 즉시 최신 상태를 보이도록 로컬 상태도 같이 갱신한다.
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patchLocalMemo(id: string, patch: Partial<Memo>) {
    // 🔴 빈 제목 = "제목을 그대로 둔다"는 뜻이다. 자동 생성 제목(메모1·메모2…) 메모를 열면
    // loadMemoIntoForm이 편집칸을 **일부러 빈 값으로** 채우므로 저장 payload의 title이 ""로 온다.
    // 서버 updateMemo도 같은 이유로 빈 title을 버린다(actions/memo.ts). 낙관적 갱신만 이 계약을
    // 어기면 목록의 제목이 사라졌다가 refreshAfterMemoChange가 끝나야 돌아온다(실측 2.0초 공백).
    const safe: Partial<Memo> = { ...patch };
    if (safe.title !== undefined && !safe.title.trim()) delete safe.title;
    const apply = (list: Memo[]) => list.map((mm) => (mm.id === id ? { ...mm, ...safe } : mm));
    setViewMemos((prev) => apply(prev));
    setMemosForMonthState((prev) => (prev ? apply(prev) : prev));
    // postitViewMemo는 목록이 아니라 상세 오버레이가 들고 있는 별도 스냅샷이다 — 여기서 같이
    // 갱신하지 않으면 오버레이 안에서 편집·자동저장을 해도 화면은 열 때의 옛 내용을 계속 그린다.
    // (링크를 넣어도 메모를 껐다 켜야 보이던 원인. 색상에서도 같은 증상이 따로 보고된 적 있다.)
    setPostitViewMemo((prev) => (prev && prev.id === id ? { ...prev, ...safe } : prev));
  }
  // 제목도 본문과 같은 디바운스로 자동저장한다 — 둘 다 formTitle/formBody 최신값을 기준으로 하나의
  // 타이머를 공유하므로, 제목/본문을 거의 동시에 고쳐도 마지막 타이핑 기준으로 둘 다 함께 저장된다.
  function scheduleAutosave(overrides: Partial<{ title: string; content: string }> = {}) {
    if (!editingMemoId) return;
    const id = editingMemoId;
    const title = overrides.title ?? formTitle;
    const content = overrides.content ?? readFormBody();
    // 🔴🔴 자동저장은 **되돌릴 수 없는** 쓰기다. 본문이 갑자기 대부분 사라진 상태를 그대로 서버에
    // 덮어쓰면 사용자가 몇 시간 쓴 메모가 영구히 없어진다("글 내용이 반쯤 날아간다", 2026-08-26).
    // 그런 급격한 축소는 사용자가 직접 지운 게 아니라 **버그일 가능성이 높다** — 실제로 이 프로젝트에서
    // 두 가지 경로가 확인됐다(hasRichFormatting 오판 → htmlToPlainText 납작화, 그리고 원인 미확정 경로).
    // 사람이 진짜로 지웠다면 저장 버튼이나 ‹(handleSaveMemo/handlePostitBack)로 명시적으로 저장된다 —
    // 그 경로는 이 가드를 거치지 않으므로 정상적인 전체 삭제는 그대로 된다.
    // 여기서 막는 것은 **자동**저장뿐이고, 막을 때는 조용히 넘어가지 않고 콘솔에 남긴다.
    const prevText = htmlToPlainText(memoBodyBaselineRef.current).length;
    const nextText = htmlToPlainText(content).length;
    if (prevText >= AUTOSAVE_SHRINK_MIN_CHARS && nextText < prevText * AUTOSAVE_SHRINK_RATIO) {
      console.error("[memo] 자동저장 취소 — 본문이 갑자기 줄었다(버그 의심). 저장 버튼이나 ‹로는 그대로 저장된다.", { id, prevText, nextText });
      return;
    }
    memoBodyBaselineRef.current = content;
    const format: ContentFormat = contentFormatFor(content);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        // 🔴 반환값을 버리면 안 된다. updateMemo는 제목이 예약 패턴(메모1·메모2…)이면 저장하지 않고
        // `{ error }`를 돌려주는데, 예전엔 그걸 무시하고 "저장됨 ✓"까지 띄웠다 — 화면은 저장됐다고
        // 하는데 서버엔 아무것도 안 들어간 상태다(‹로 나갈 때 handlePostitBack이 그제서야 alert한다).
        // 자동저장에서 alert을 띄우면 타이핑을 끊으므로, **거짓말만 멈춘다**: 상태를 idle로 되돌리고
        // 로컬 상태도 건드리지 않는다(scheduleProjectAutosave가 이미 쓰던 처리와 같다).
        const result = await updateMemo(id, { title, content, content_format: format });
        if (result && "error" in result) { setAutosaveStatus("idle"); return; }
        const trimmedTitle = title.trim();
        patchLocalMemo(id, { content, content_format: format, ...(trimmedTitle ? { title: trimmedTitle, is_auto_title: false } : {}) });
        setAutosaveStatus("saved");
        setTimeout(() => setAutosaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        // 세션 만료·네트워크 실패로 throw되면 예전엔 "저장 중..."이 영원히 붙어 있었다(unhandled rejection).
        console.error("[memo] 자동저장 실패", e);
        setAutosaveStatus("idle");
      }
    }, 1000);
  }

  async function handleSaveMemo() {
    if (!validateMemoDates()) return;
    // "저장" 버튼은 지금 값을 바로 반영하므로, 대기 중인 자동저장 타이머가 1초 뒤 같은 내용을 또 저장하는
    // 중복 요청을 막는다.
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    setSavingMemo(true);
    await withCleanup(async () => {
      // 🔴 예전엔 `readFormBody()`를 **두 번** 불렀다(content · content_format 각각). 동기 ref 읽기라
      //   두 값이 갈릴 수는 없지만, 한 번만 읽어 넘기는 쪽이 다른 두 호출부와 같은 모양이다.
      const body = readFormBody();
      const input = buildMemoInput({
        title: formTitle, body, contentMode: formContentMode, emoji: formEmoji,
        memoType: formType, status: formStatus,
        startDate: formStartDate, endDate: formEndDate,
        color: formColor, isImportant: formImportant,
      });
      const result = editingMemoId ? await updateMemo(editingMemoId, input) : await createMemo(input);
      if (result && "error" in result) { alert(result.error); return; }
      const savedId = editingMemoId;
      // 저장 체감 속도 — 예전엔 여기서 refreshAfterMemoChange가 끝난 뒤에도 방금 저장한 메모 하나
      // 보자고 getMemosForDateAction을 또 한 번(왕복 3번째) 불렀다. refreshAfterMemoChange가 이미
      // 받아온 목록에 그 메모가 있으면(같은 달/오늘 보기 중이면 거의 항상 있다) 그걸 그대로 쓰고,
      // 정말 범위 밖일 때만(다른 달 보다가 그 메모를 열었던 경우 등) 예전처럼 따로 가져온다.
      const refreshed = await refreshAfterMemoChange();
      // Quick Edit/Detail Edit 둘 다 저장 후 같은 오버레이에서 View로 복귀해 결과를 바로 보여준다
      // (예전엔 Quick Edit만 저장 즉시 닫혔는데, 사용자가 갑자기 닫히는 느낌이라 Detail Edit와 통일했다).
      // 그 외(Create/기존 폼)는 기존대로 닫는다.
      if (postitEditMode === "quick" || postitEditMode === "detail") {
        // 버그: 색상 등을 바꿔 저장하면 View로 돌아가는 순간 postitViewMemo가 아직 저장 전 값이라
        // 이전 색으로 한 프레임 렌더된 뒤, 아래 fetch가 끝나야 새 색으로 바뀌었다(깜빡임의 원인).
        // View로 전환하기 전에 방금 저장한 값으로 먼저 낙관적 병합해두면 처음부터 새 색으로 뜬다 —
        // 서버 fetch는 그대로 두어 auto_title 등 서버 계산 필드까지 마저 맞춘다.
        // title은 patchLocalMemo와 같은 계약이다 — 빈 값이면 덮어쓰지 않고 원래 제목을 지킨다.
        if (savedId) setPostitViewMemo((v) => (v ? { ...v, ...input, title: input.title.trim() || v.title } : v));
        setPostitEditMode(null);
        if (savedId) {
          const alreadyFetched = refreshed.find((mm) => mm.id === savedId);
          const fresh = alreadyFetched ?? (await getMemosForDateAction(input.start_date)).find((mm) => mm.id === savedId);
          if (fresh) setPostitViewMemo(fresh);
        }
      } else {
        setMemoFormOpen(false);
        closeBigEditor();
      }
    }, () => setSavingMemo(false));
  }

  function handleDeleteMemo(id: string) {
    askConfirm("이 메모를 삭제할까요?", async () => {
      await deleteMemo(id);
      setMemoFormOpen(false);
      closeBigEditor();
      // 🔴 세 setter를 손으로 부르면 **되돌아갈 화면을 잃는다.** 그 셋만 내리면
      // 편집 페이지가 언마운트되면서 `memo-edit-page-open`이 풀려 대시보드가 그대로 드러난다
      // — 먼슬리 메모/키노트에서 삭제했는데 메인으로 튕기는 신고가 이것이다.
      // 호스트 다이얼로그 복원(postitHostKeyRef)은 closePostitView가 **이미** 하고 있다.
      // 되돌리는 로직을 두 벌로 만들지 말고 그 한 곳을 쓴다.
      closePostitView();
      await refreshAfterMemoChange();
    });
  }

  // 🔴 반환 키는 **호출부 이름을 그대로 유지**하려고 구조분해용으로 편평하게 낸다(rename 0곳).
  //   훅 밖 사용이 0회인 것은 일부러 뺐다(실측): setSavingMemo · setMemoDateError · setAutosaveStatus ·
  //   formBodyRef · formBodyFlushRef · memoBodyBaselineRef · cancelFormBodyFlush.
  //   **다시 넣지 마라** — 밖에서 만지면 자동저장 축소 가드의 기준이 깨진다.
  // 🔴 ⑪ 이후 `setFormContentMode`·`setFormEmoji`는 **반환하지 않는다** — `openCreateMemoForm`이
  //   이리로 오면서 훅 밖 사용이 0회가 됐다(값 `formContentMode`·`formEmoji`는 렌더에 쓰여 남긴다).
  //   폼 초기화를 밖에서 직접 하려고 다시 넣지 마라 — Create/Edit 진입 경로가 다시 갈라진다.
  return {
    editingMemoId, setEditingMemoId,
    formTitle, setFormTitle,
    formType, setFormType,
    formStatus, setFormStatus,
    formStartDate, setFormStartDate,
    formEndDate, setFormEndDate,
    formImportant, setFormImportant,
    formPinned, setFormPinned,
    formColor, setFormColor,
    formBody, setFormBody, setFormBodyWhileTyping,
    formContentMode,
    formEmoji,
    formSessionKey, setFormSessionKey,
    savingMemo,
    memoDateError,
    autosaveStatus,
    autosaveTimerRef,
    contentFormatFor, readFormBody,
    openCreateMemoForm, loadMemoIntoForm, patchLocalMemo, scheduleAutosave,
    validateMemoDates, handleSaveMemo, handleDeleteMemo,
  };
}
