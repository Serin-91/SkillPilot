"use client";

import { useEffect, useRef, useState } from "react";

const RECENT_KEY = "skillpilot_recent_emojis";

function getRecentEmojis(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.slice(0, 3) : [];
  } catch {
    return [];
  }
}

function pushRecentEmoji(emoji: string) {
  const next = [emoji, ...getRecentEmojis().filter((e) => e !== emoji)].slice(0, 3);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "중요·강조", emojis: ["📌", "⭐", "🔥", "💡", "🎯", "✨"] },
  { label: "작업 상태", emojis: ["✅", "⏳", "🔄", "⚠️", "❗", "🚫"] },
  { label: "프로젝트·개발", emojis: ["💻", "🛠️", "⚙️", "🧩", "🚀", "🐛"] },
  { label: "메모·일정·자료", emojis: ["📝", "📂", "📅", "⏰", "📚", "🔍"] },
];

// 11~12절 — 본문 삽입용/대표 이모지 선택용 팝오버를 공용으로 쓴다. onRemove가 있으면 "제거" 버튼도 보인다.
export function EmojiPopover({
  triggerLabel, triggerClassName, triggerTitle, onSelect, onRemove,
}: {
  triggerLabel: React.ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  onSelect: (emoji: string) => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecent(getRecentEmojis());
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(emoji: string) {
    pushRecentEmoji(emoji);
    onSelect(emoji);
    setOpen(false);
  }

  return (
    <div className="emoji-popover-wrap" ref={wrapRef}>
      <button
        type="button" className={triggerClassName ?? "toolbar-btn"} title={triggerTitle ?? "이모지"}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div className="emoji-popup mini-date-popup">
          {recent.length > 0 && (
            <div className="emoji-group emoji-group-recent">
              <div className="emoji-group-label">최근 사용</div>
              <div className="emoji-grid">
                {recent.map((e) => (
                  <button key={`recent-${e}`} type="button" className="emoji-cell" onClick={() => pick(e)}>{e}</button>
                ))}
              </div>
            </div>
          )}
          {EMOJI_GROUPS.map((g) => (
            <div className="emoji-group" key={g.label}>
              <div className="emoji-group-label">{g.label}</div>
              <div className="emoji-grid">
                {g.emojis.map((e) => (
                  <button key={e} type="button" className="emoji-cell" onClick={() => pick(e)}>{e}</button>
                ))}
              </div>
            </div>
          ))}
          {onRemove && (
            <button type="button" className="cancel-btn sm emoji-remove-btn" onClick={() => { onRemove(); setOpen(false); }}>
              대표 이모지 제거
            </button>
          )}
        </div>
      )}
    </div>
  );
}
