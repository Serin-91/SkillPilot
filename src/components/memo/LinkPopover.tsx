"use client";

import { useEffect, useRef, useState } from "react";

// 10절 — 링크 버튼 / Ctrl+K / 버블 메뉴 3곳 모두 이 팝오버 하나를 공유한다 (부모가 open을 제어).
export function LinkPopover({
  open, initialUrl, hasExistingLink, anchor, onApply, onRemove, onClose,
}: {
  open: boolean;
  initialUrl: string;
  hasExistingLink: boolean;
  // 에디터 본문 기준 커서 좌표 — 없으면 CSS 기본 위치를 그대로 쓴다.
  anchor?: { top: number; left: number };
  onApply: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!wrapRef.current || wrapRef.current.contains(target)) return;
      // 링크 버튼(🔗)은 토글이다 — 그런데 mousedown이 click보다 먼저 오므로, 여기서 먼저 닫아버리면
      // 곧바로 실행되는 버튼의 onClick이 "닫혀 있네"라고 보고 다시 열어버린다. 그래서 아무리 눌러도
      // 링크창이 닫히지 않았다. 토글 버튼을 누른 경우는 이 핸들러가 관여하지 않고 onClick에 맡긴다.
      if (target instanceof Element && target.closest("[data-link-toggle]")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript):/i;

  function apply() {
    const trimmed = url.trim();
    if (trimmed && !UNSAFE_SCHEME.test(trimmed)) onApply(trimmed);
    onClose();
  }

  return (
    <div
      className="link-popover mini-date-popup"
      ref={wrapRef}
      style={anchor ? { top: anchor.top, left: anchor.left } : undefined}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        id="link-popover-url"
        name="link-popover-url"
        type="text"
        className="link-popover-input"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
        }}
      />
      <div className="link-popover-actions">
        {hasExistingLink && (
          <button type="button" className="cancel-btn sm" onClick={() => { onRemove(); onClose(); }}>링크 제거</button>
        )}
        <button type="button" className="save-btn" onClick={apply}>적용</button>
      </div>
    </div>
  );
}
