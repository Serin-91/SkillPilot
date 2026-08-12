"use client";

import { useEffect, useRef, useState } from "react";

// 10절 — 링크 버튼 / Ctrl+K / 버블 메뉴 3곳 모두 이 팝오버 하나를 공유한다 (부모가 open을 제어).
export function LinkPopover({
  open, initialUrl, hasExistingLink, onApply, onRemove, onClose,
}: {
  open: boolean;
  initialUrl: string;
  hasExistingLink: boolean;
  onApply: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    requestAnimationFrame(() => inputRef.current?.focus());
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
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
  }, [open, initialUrl, onClose]);

  if (!open) return null;

  const UNSAFE_SCHEME = /^\s*(javascript|data|vbscript):/i;

  function apply() {
    const trimmed = url.trim();
    if (trimmed && !UNSAFE_SCHEME.test(trimmed)) onApply(trimmed);
    onClose();
  }

  return (
    <div className="link-popover mini-date-popup" ref={wrapRef} onMouseDown={(e) => e.stopPropagation()}>
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
