"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 임시 진단 패널 — 모바일 Project "한 줄 요약" input의 caret/selection이 iOS에서만 깨지는 건
// (`OPEN-MOBILE-PROJECT-SUMMARY-IOS-CARET`)의 **원인 계측**이다. 고치는 코드가 아니다.
//
// 🔴 `?debugSummaryCaret=1` 이 붙은 주소에서만 동작한다. 그 밖에서는 effect가 첫 줄에서 빠져나가고
//    컴포넌트가 null을 반환한다 — DOM 0 · listener 0 · timer 0 · log 0 · 동작 변화 0.
//
// 🔴 왜 필요한가: 데스크톱 Chrome에서는 이 버그가 재현되지 않는다. `d074648`에서 로컬 실측만 믿고
//    `onBlur` self-unmount를 원인으로 지목했다가 사용자 iPhone에서 그대로 재현돼 **기각**됐다
//    (그 패치는 되돌렸다). 그래서 이번에는 추측하지 않고 실기기에서 "collapsed caret이 전체선택으로
//    바뀌는 정확한 순간"을 잡는다. 사용자는 iOS Safari/PWA에서 콘솔을 볼 수 없으므로 Copy로 꺼낸다.
//
// 🔴 개인정보: 한줄요약 **문장 내용을 기록하지 않는다**(길이만). 제목·본문도 기록하지 않는다.
//    요소 서술자는 tag/id/class까지만 쓴다 — textContent는 어디에서도 읽지 않는다.
//
// 🔴 패널 위치: 관찰 대상(한줄요약)은 화면 **위쪽**이라 패널은 **아래쪽**에 최소 크기로 둔다.
//    ViewportDebug.tsx의 교훈대로 `position: fixed`는 키보드가 뜨면 시각 뷰포트 밖으로 밀릴 수
//    있어서 visualViewport의 offsetTop+height로 직접 붙인다. 로그는 메모리에 남으므로 패널이
//    잠깐 안 보여도 키보드를 내리면 다시 읽을 수 있다.

const FLAG = "debugSummaryCaret";
const INPUT_SEL = ".mobile-project-summary-popover input";
const MAX_ROWS = 500;
const FALLBACK_ID = "summary-caret-debug-fallback";

const EVENTS = [
  "touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup",
  "focus", "focusin", "click", "select", "beforeinput", "input",
  "compositionstart", "compositionupdate", "compositionend", "blur",
];
// 이 이벤트 뒤에는 지연 스냅샷을 남긴다 — WebKit은 한 번의 탭에 selection을 여러 번 바꾼다.
const DEFERRED_AFTER = new Set(["touchstart", "pointerdown", "focus", "touchend", "click"]);
const DEFER_MS = [0, 50, 150, 300];

const WEBKIT_PROPS = [
  "-webkit-user-select", "user-select",
  "-webkit-touch-callout", "touch-action",
  "-webkit-appearance", "appearance",
  "-webkit-text-size-adjust",
  "-webkit-tap-highlight-color",
];

type Row = Record<string, unknown>;

function desc(n: unknown): string {
  if (n == null) return "null";
  if (n === document) return "#document";
  if (typeof window !== "undefined" && n === window) return "#window";
  const el = n as Element;
  if (!el.nodeName) return String(n);
  const tag = el.nodeName.toLowerCase();
  const id = el.id ? "#" + el.id : "";
  const raw = typeof el.className === "string" ? el.className : "";
  const cls = raw.trim() ? "." + raw.trim().split(/\s+/).slice(0, 3).join(".") : "";
  return tag + id + cls;
}

function findInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(INPUT_SEL);
}

// 🔴 값 자체는 절대 담지 않는다 — 길이만.
function selSnap(): Row {
  const i = findInput();
  if (!i) return { input: "GONE" };
  return {
    start: i.selectionStart,
    end: i.selectionEnd,
    dir: i.selectionDirection,
    len: i.value.length,
    isActive: document.activeElement === i,
    connected: i.isConnected,
  };
}

function vvSnap(): Row {
  const vv = window.visualViewport;
  return {
    vvW: vv ? Math.round(vv.width) : null,
    vvH: vv ? Math.round(vv.height) : null,
    vvTop: vv ? Math.round(vv.offsetTop) : null,
    vvLeft: vv ? Math.round(vv.offsetLeft) : null,
    vvScale: vv ? Number(vv.scale.toFixed(3)) : null,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    scrollX: Math.round(window.scrollX),
    scrollY: Math.round(window.scrollY),
  };
}

function rectSnap(): Row | null {
  const i = findInput();
  if (!i) return null;
  const r = i.getBoundingClientRect();
  return {
    l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right),
    b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height),
  };
}

type DebugApi = { rows: Row[]; clear: () => void; text: () => string };

export function SummaryCaretDebug() {
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState("");
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    // 🔴 플래그가 없으면 여기서 끝 — listener도 timer도 만들지 않는다.
    if (new URLSearchParams(window.location.search).get(FLAG) !== "1") return;

    const t0 = performance.now();
    const rows: Row[] = [];
    const timers: number[] = [];
    let cssDone = false;

    const push = (row: Row) => {
      if (rows.length >= MAX_ROWS) return;
      rows.push({ t: Math.round(performance.now() - t0), ...row });
    };

    // ancestor chain의 WebKit 계열 computed 값 — 첫 상호작용 때 한 번만.
    const captureCss = () => {
      if (cssDone) return;
      const i = findInput();
      if (!i) return;
      cssDone = true;
      const chain: Row[] = [];
      let el: Element | null = i;
      while (el && chain.length < 12) {
        const cs = getComputedStyle(el);
        const o: Row = { el: desc(el) };
        WEBKIT_PROPS.forEach((p) => { o[p] = cs.getPropertyValue(p) || "(unset)"; });
        chain.push(o);
        el = el.parentElement;
      }
      push({ ev: "@@CSS_CHAIN", chain });
    };

    const snapshot = (label: string) => push({ ev: label, sel: selSnap() });

    const onEvent = (e: Event) => {
      const i = findInput();
      const onInput = !!i && (e.target === i || (e.target instanceof Node && i.contains(e.target)));
      const row: Row = { ev: e.type, target: desc(e.target), onSummaryInput: onInput, sel: selSnap() };

      if (e.type === "pointerdown" || e.type === "touchstart") {
        captureCss();
        const p = e as PointerEvent;
        const t = (e as TouchEvent).touches?.[0];
        const x = t ? t.clientX : p.clientX;
        const y = t ? t.clientY : p.clientY;
        if (typeof x === "number" && typeof y === "number") {
          const rect = rectSnap();
          row.touch = {
            clientX: Math.round(x), clientY: Math.round(y),
            pageX: Math.round(t ? t.pageX : p.pageX), pageY: Math.round(t ? t.pageY : p.pageY),
            relX: rect ? Math.round(x - (rect.l as number)) : null,
            relY: rect ? Math.round(y - (rect.t as number)) : null,
          };
          // 🔴 z-index가 아니라 **실제 hit-test 결과**를 믿는다.
          row.hitTop = desc(document.elementFromPoint(x, y));
          row.hitStack = document.elementsFromPoint(x, y).slice(0, 6).map(desc);
        }
        row.path = (e.composedPath ? e.composedPath() : []).slice(0, 8).map(desc);
        row.rect = rectSnap();
        row.vv = vvSnap();
      }

      push(row);

      if (DEFERRED_AFTER.has(e.type)) {
        const type = e.type;
        requestAnimationFrame(() => {
          snapshot(type + ":raf1");
          requestAnimationFrame(() => snapshot(type + ":raf2"));
        });
        // 유한 타이머만 — 무한 반복 없음.
        DEFER_MS.forEach((ms) => {
          timers.push(window.setTimeout(() => snapshot(type + ":+" + ms + "ms"), ms));
        });
      }
    };

    const onSelectionChange = () => push({ ev: "selectionchange", sel: selSnap() });
    const onVv = (e: Event) => push({ ev: "vv:" + e.type, vv: vvSnap(), sel: selSnap(), rect: rectSnap() });

    EVENTS.forEach((ev) => document.addEventListener(ev, onEvent, true));
    document.addEventListener("selectionchange", onSelectionChange);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);

    // 패널을 시각 뷰포트 하단에 붙인다(키보드가 떠도 따라온다).
    const place = () => {
      if (!vv) { setAnchor({ top: window.innerHeight - 44, left: 8 }); return; }
      setAnchor({ top: vv.offsetTop + vv.height - 44, left: vv.offsetLeft + 8 });
    };
    place();
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);

    const tick = window.setInterval(() => setCount(rows.length), 400);

    const w = window as unknown as { __summaryCaretLog?: DebugApi };
    w.__summaryCaretLog = {
      rows,
      clear: () => { rows.length = 0; cssDone = false; },
      text: () => JSON.stringify({
        ua: navigator.userAgent,
        standalone: window.matchMedia("(display-mode: standalone)").matches,
        startedAt: new Date().toISOString(),
        viewportAtStart: vvSnap(),
        rows,
      }, null, 1),
    };

    return () => {
      EVENTS.forEach((ev) => document.removeEventListener(ev, onEvent, true));
      document.removeEventListener("selectionchange", onSelectionChange);
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
      timers.forEach(clearTimeout);
      clearInterval(tick);
      delete w.__summaryCaretLog;
    };
  }, []);

  // 플래그 OFF면 anchor가 없어 아무것도 그리지 않는다.
  if (!anchor) return null;

  const api = (window as unknown as { __summaryCaretLog?: DebugApi }).__summaryCaretLog;

  const copy = async () => {
    const text = api ? api.text() : "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied("복사됨");
    } catch {
      // clipboard 거부 시 fallback — 사용자가 상자에서 직접 길게 눌러 복사한다.
      // 🔴 id로 중복을 막는다 — 안 그러면 Copy를 누를 때마다 상자가 쌓인다. Clear가 걷어낸다.
      dropFallback();
      const ta = document.createElement("textarea");
      ta.id = FALLBACK_ID;
      ta.value = text;
      ta.readOnly = true;
      ta.style.cssText = "position:fixed;left:4px;bottom:52px;width:calc(100% - 8px);height:38vh;z-index:2147483647;font-size:11px";
      document.body.appendChild(ta);
      ta.select();
      setCopied("아래 상자에서 복사 · Clear로 닫기");
    }
    window.setTimeout(() => setCopied(""), 2500);
  };

  return createPortal(
    <div
      style={{
        position: "fixed", top: anchor.top, left: anchor.left, zIndex: 2147483647,
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px", borderRadius: 8,
        background: "rgba(20,16,40,.92)", color: "#fff",
        font: "600 11px/1 system-ui, sans-serif", pointerEvents: "auto",
      }}
    >
      <span>caret log {count}</span>
      <button type="button" onClick={() => { api?.clear(); dropFallback(); setCount(0); setCopied(""); }} style={BTN}>Clear</button>
      <button type="button" onClick={copy} style={BTN}>Copy</button>
      {copied ? <span style={{ fontWeight: 400 }}>{copied}</span> : null}
    </div>,
    document.body,
  );
}

function dropFallback() {
  document.getElementById(FALLBACK_ID)?.remove();
}

const BTN: React.CSSProperties = {
  padding: "4px 7px", borderRadius: 6, border: 0,
  background: "#6c5ce7", color: "#fff", font: "600 11px/1 system-ui, sans-serif",
};
