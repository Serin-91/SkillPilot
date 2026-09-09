"use client";

// Dashboard.tsx에서 **그대로 옮겨온** 선택→메모 저장 클러스터.
// 뉴스/채용공고/AI Trend에서 문장을 드래그하거나 항목을 통째로 "메모에 저장"하는 흐름 전체다.
//
// 🔴 옛 Audit은 이 클러스터를 "에디터 ref 4개를 가로질러 ref injection이 필요"하다고 봤는데
//   **오분류였다.** ref 4개를 고르는 것은 `activeMemoEditorRef`+`insertPendingAtCursor`
//   (pendingInsert 클러스터)이고, 여기는 `setPendingInsert` **하나만** 부른다.
//   실측(f36b138): 비-JSX 외부 참조 0 · dialog registry 접촉 0 · 에디터 ref 접촉 0.
//
// 🔴 **pendingInsert 클러스터와 다시 합치지 마라.** 여기는 "무엇을 넣을지"를 정해
//   `setPendingInsert`로 넘기는 데서 끝나고, "어느 에디터에 넣을지"는 Dashboard가 정한다.
//   그 경계가 이 훅이 성립하는 유일한 이유다.
//
// 🔴 dialog를 열지 않는다(`open`/`close`/`dialogs` 의존 0). 기존 메모에 붙일 때는
//   `openBigEditor`를 주입받아 부르고, 그 창을 여는 책임은 Dashboard에 그대로 있다.
//
// 🔴 JSX(원형 메뉴·메모 피커 오버레이)는 이 파일에 없다 — `.ts`다.
//   components/dashboard/selection-overlays.tsx가 렌더링만 한다.

import { useEffect, useRef, useState } from "react";
import {
  copySelectionToMemo as copySelectionToMemoAction,
  copyFullNewsToMemo as copyFullNewsToMemoAction,
  copyFullJobToMemo as copyFullJobToMemoAction,
  copyFullTrendToMemo as copyFullTrendToMemoAction,
  getMemosForDateAction,
} from "@/lib/actions/memo";
import { parseJobTextSections, type JobTextGroup } from "@/lib/dashboard/helpers";
import { htmlToPlainText, newsFullBlockHtml, jobFullBlockHtml, trendFullBlockHtml } from "@/lib/memo/rich-text";
import { defaultMemoColor, type Memo, type SourceType } from "@/lib/memo/types";
import type { SelectedNewsItem } from "@/lib/news/select";
import type { SavedJobRow } from "@/lib/jobs/get-jobs";

/** `pendingInsert` state의 타입이라 Dashboard도 이 타입을 쓴다(런타임 값 아님). */
export type SelSource = { type: SourceType; title: string; url: string };

export function useSelectionToMemo(opts: {
  todayIso: string;
  theme: "light" | "dark";
  /** 기존 메모에 붙일 때 그 메모의 편집창을 여는 것은 Dashboard 책임이다. */
  openBigEditor: (m: Memo) => void;
  setPendingInsert: (v: { text: string; html?: string; source: SelSource } | null) => void;
  refreshAfterMemoChange: () => Promise<unknown>;
}) {
  const { todayIso, theme, openBigEditor, setPendingInsert, refreshAfterMemoChange } = opts;

  // 뉴스/채용공고/AI Trend Briefing 문장 드래그 선택 → 원형 메뉴 → 복사 또는 날짜 선택 → 메모장에 복사 (6.2절)
  // 드래그한 문장 하나(selection) 또는 기사/공고/트렌드 항목 전체(fullNews·fullJob·fullTrend) — 메모 피커·저장 확인
  // 팝업은 넷 다 공유하고, 실제 저장 액션만 mode에 따라 분기한다
  type MemoPickerContent =
    | { mode: "selection"; source: SelSource; text: string }
    | { mode: "fullNews"; sourceTitle: string; sourceUrl: string; summary: string; reason: string; tags: string[] }
    | { mode: "fullJob"; title: string; company: string; sourceSite: string; career: string; deadline: string; sourceUrl: string; categories: { label: string; groups: JobTextGroup[] }[] }
    | { mode: "fullTrend"; label: string; title: string | null; body: string; bullets: string[] | null; source: string | null; url: string | null };
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string; source: SelSource } | null>(null);
  const [memoPicker, setMemoPicker] = useState<{ date: string; content: MemoPickerContent; memos: Memo[] } | null>(null);
  const [pendingSave, setPendingSave] = useState<{ memoId: string | null; label: string } | null>(null);

  const selectionContextRef = useRef<{ source: SelSource; element: HTMLDivElement } | null>(null);

  // <dialog>가 showModal()로 열리면 브라우저 top layer에 올라가서, 그 바깥의 fixed 요소는
  // z-index와 무관하게 항상 다이얼로그 밑에 깔린다 — 그래서 선택 메뉴는 같은 dialog 안에,
  // dialog 기준 좌표(absolute)로 넣어야 하고, 여기서도 dialog 기준으로 좌표를 계산한다.
  function cacheCurrentSelection(source: SelSource, selectableEl: HTMLDivElement): boolean {
    const dialogEl = selectableEl.closest("dialog");
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !sel || sel.rangeCount === 0 || !dialogEl) return false;
    const range = sel.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    if (!selectableEl.contains(commonNode.nodeType === Node.TEXT_NODE ? commonNode.parentNode : commonNode)) return false;
    // 드래그가 "끝나는" 지점 = 마지막 줄의 오른쪽 아래 — 여러 줄 선택이어도 마지막 클라이언트 rect를 쓴다
    const rects = range.getClientRects();
    const endRect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
    const dialogRect = dialogEl.getBoundingClientRect();
    const top = Math.min(Math.max(56, endRect.bottom - dialogRect.top + 8), dialogRect.height - 96);
    const left = Math.min(Math.max(70, endRect.right - dialogRect.left), dialogRect.width - 64);
    // 버튼을 누르는 순간 브라우저 selection이 사라져도 이 캐시를 복사·저장에 계속 사용한다.
    setSelectionMenu({ x: left, y: top, text, source });
    return true;
  }
  function detectSelection(source: SelSource, selectableEl: HTMLDivElement, delay = 0) {
    window.setTimeout(() => {
      cacheCurrentSelection(source, selectableEl);
    }, delay);
  }
  // 마우스는 onMouseUp으로 충분하지만, iOS/Android의 길게 누르기 선택은 mouseup이 없거나
  // Selection 반영이 늦을 수 있어 pointer/touch 이벤트와 selectionchange 리스너(아래)로 보강한다.
  function selectableHandlers(source: SelSource) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        selectionContextRef.current = { source, element: e.currentTarget };
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget, e.pointerType === "mouse" ? 0 : 100),
      onMouseUp: (e: React.MouseEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget),
      onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => detectSelection(source, e.currentTarget, 180),
    };
  }
  // 모바일 네이티브 선택 핸들(파란 물방울)로 범위를 조정할 때는 pointerup/touchend가 안 뜨는 경우가 있어
  // selectionchange로 한 번 더 잡는다 — 데스크톱에서는 mobile.matches가 false라 아무 영향 없다.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 720px)");
    let timer: number | null = null;
    function onSelectionChange() {
      if (!mobile.matches || !selectionContextRef.current) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const context = selectionContextRef.current;
        if (context) cacheCurrentSelection(context.source, context.element);
      }, 80);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      if (timer !== null) window.clearTimeout(timer);
    };
    // ★ 의존성 배열 []가 반드시 있어야 한다. 없으면(예전 상태) 매 렌더마다 이 이펙트가 다시 돌면서
    //   cleanup이 clearTimeout(timer)를 호출한다 — 그런데 cacheCurrentSelection이 setSelectionMenu를
    //   부르므로 렌더가 일어나고, 그 렌더의 cleanup이 다음 80ms 디바운스를 죽인다. 스스로를 취소하는
    //   구조라 모바일 네이티브 선택 핸들로 범위를 조정하면 마지막 조정이 조용히 사라졌다.
    //   (timer도 렌더마다 null로 초기화돼 디바운스 상태 자체를 잃었다.)
    //   []로 고정해도 안전하다 — 이 클로저가 읽는 것은 selectionContextRef(ref)와
    //   setSelectionMenu(안정적)뿐이고, cacheCurrentSelection은 컴포넌트 state를 읽지 않는다
    //   (파라미터 + DOM API + setSelectionMenu 뿐이다). 그래서 첫 렌더의 클로저를 잡아도 stale이 없다.
    // ⚠️ 원문에 있던 `eslint-disable-next-line react-hooks/exhaustive-deps` 한 줄은 훅으로 옮긴 뒤
    //    규칙이 더 이상 지적하지 않아 "불필요한 disable"로 잡혀서 제거했다. 의존성 배열 []는 그대로다.
  }, []);
  async function copySelectionText(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* 클립보드 권한 없으면 무시 */ }
  }
  async function openMemoPickerForDate(date: string, source: SelSource, text: string) {
    setSelectionMenu(null);
    const memos = await getMemosForDateAction(date);
    setMemoPicker({ date, content: { mode: "selection", source, text }, memos });
  }
  // "전체 저장" — 뉴스/채용공고 카드에서 문장을 고르지 않고 바로 통째로 메모에 저장한다. 오늘 날짜 기준.
  async function openFullSavePicker(content: MemoPickerContent) {
    const memos = await getMemosForDateAction(todayIso);
    setMemoPicker({ date: todayIso, content, memos });
  }
  function openFullNewsPicker(n: SelectedNewsItem) {
    openFullSavePicker({
      mode: "fullNews", sourceTitle: n.title, sourceUrl: n.url,
      summary: n.summary, reason: n.reason_selected, tags: n.related_concepts,
    });
  }
  function openFullJobPicker(j: SavedJobRow, techTags: string[]) {
    openFullSavePicker({
      mode: "fullJob", title: j.title, company: j.company, sourceSite: j.source_site ?? "",
      career: j.career_requirement ?? "경력 무관", deadline: j.deadline ?? "상시", sourceUrl: j.url,
      categories: [
        { label: `📋 주요 업무${techTags.length ? ` · ${techTags.join(", ")}` : ""}`, groups: j.responsibilities ? parseJobTextSections(j.responsibilities) : [] },
        { label: "🎯 자격요건", groups: j.required_text ? parseJobTextSections(j.required_text) : [] },
        { label: "⭐ 우대사항", groups: j.preferred_text ? parseJobTextSections(j.preferred_text) : [] },
      ],
    });
  }
  function openFullTrendPicker(content: Extract<MemoPickerContent, { mode: "fullTrend" }>) {
    openFullSavePicker(content);
  }
  // 전체 저장도 드래그 선택 흐름과 같이 "날짜를 고른 뒤 새 메모/기존 메모"를 정할 수 있어야 한다는
  // 요청 — 기존엔 오늘 날짜로 고정이었다. 날짜를 바꾸면 그 날짜의 메모 목록을 다시 불러온다.
  async function changeMemoPickerDate(iso: string) {
    const memos = await getMemosForDateAction(iso);
    setMemoPicker((cur) => (cur ? { ...cur, date: iso, memos } : cur));
  }
  // 전체 저장(fullNews/fullJob/fullTrend)을 "현재 커서 위치에 삽입" 흐름에 태우기 위한 순수 텍스트 변환 —
  // 서버가 만드는 것과 같은 HTML block을 그대로 만들고 태그만 걷어낸다(서식은 잃지만 구조는 줄바꿈으로 남는다)
  function fullSaveToSourceAndText(content: Extract<MemoPickerContent, { mode: "fullNews" | "fullJob" | "fullTrend" }>): { source: SelSource; text: string; html: string } {
    if (content.mode === "fullNews") {
      const html = newsFullBlockHtml(content.sourceTitle, content.sourceUrl, content.summary, content.reason, content.tags);
      return { source: { type: "news", title: content.sourceTitle, url: content.sourceUrl }, text: htmlToPlainText(html), html };
    }
    if (content.mode === "fullJob") {
      const html = jobFullBlockHtml(content.title, content.company, content.sourceSite, content.career, content.deadline, content.sourceUrl, content.categories);
      return { source: { type: "job", title: `${content.company} / ${content.title}`, url: content.sourceUrl }, text: htmlToPlainText(html), html };
    }
    const html = trendFullBlockHtml(content.label, content.title, content.body, content.bullets, content.source, content.url);
    return { source: { type: "ai_smart_direction", title: content.title ?? content.label, url: content.url ?? "" }, text: htmlToPlainText(html), html };
  }
  // 3-2절 — 실제 저장 전에 한 번 확인. 신규 메모는 바로 채워 생성하고, 기존 메모는 편집창을 열어
  // 사용자가 직접 위치를 골라 "현재 커서 위치에 삽입"으로 넣게 한다 — 드래그한 문장이든 기사/공고
  // 전체든 기존 메모에 붙일 때는 항상 이 방식으로 통일한다.
  async function confirmPendingSave() {
    if (!pendingSave || !memoPicker) return;
    const { memoId } = pendingSave;
    const { date, content } = memoPicker;
    setPendingSave(null);
    setMemoPicker(null);

    // 드래그 선택은 문장 하나라 평문 그대로, 전체저장은 헤딩이 살아야 하므로 html까지 함께 넘긴다.
    const resolved = content.mode === "selection"
      ? { source: content.source, text: content.text, html: undefined as string | undefined }
      : fullSaveToSourceAndText(content);
    const { source, text, html } = resolved;

    if (memoId) {
      const freshMemos = await getMemosForDateAction(date);
      const target = freshMemos.find((mm) => mm.id === memoId);
      if (target) {
        openBigEditor(target);
        setPendingInsert({ text, html, source });
      }
      return;
    }

    if (content.mode === "selection") {
      const result = await copySelectionToMemoAction({
        date, memoId: null, sourceType: source.type, sourceTitle: source.title, sourceUrl: source.url, selectedText: text,
        color: defaultMemoColor(theme),
      });
      if ("error" in result) { alert(result.error); return; }
      await refreshAfterMemoChange();
      return;
    }

    const result = content.mode === "fullNews"
      ? await copyFullNewsToMemoAction({
          date, memoId: null, sourceTitle: content.sourceTitle, sourceUrl: content.sourceUrl,
          summary: content.summary, reason: content.reason, tags: content.tags,
          color: defaultMemoColor(theme),
        })
      : content.mode === "fullJob"
      ? await copyFullJobToMemoAction({
          date, memoId: null, title: content.title, company: content.company, sourceSite: content.sourceSite,
          career: content.career, deadline: content.deadline, sourceUrl: content.sourceUrl, categories: content.categories,
          color: defaultMemoColor(theme),
        })
      : await copyFullTrendToMemoAction({
          date, memoId: null, label: content.label, title: content.title,
          body: content.body, bullets: content.bullets, source: content.source, url: content.url,
          color: defaultMemoColor(theme),
        });
    if ("error" in result) { alert(result.error); return; }
    await refreshAfterMemoChange();
  }

  // 반환 키 = Dashboard의 기존 이름 그대로다(rename 0). 훅 밖 사용이 0회인
  // `cacheCurrentSelection` · `detectSelection` · `openFullSavePicker` ·
  // `fullSaveToSourceAndText` · `selectionContextRef`는 반환하지 않는다.
  return {
    selectionMenu, setSelectionMenu,
    memoPicker, setMemoPicker,
    pendingSave, setPendingSave,
    selectableHandlers,
    copySelectionText,
    openMemoPickerForDate,
    openFullNewsPicker,
    openFullJobPicker,
    openFullTrendPicker,
    changeMemoPickerDate,
    confirmPendingSave,
  };
}
