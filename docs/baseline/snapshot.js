// 리팩토링 기준선 스냅샷 v2 — 반드시 docs/baseline/README.md의 "함정 4개"를 먼저 읽어라.
// 콘솔에 통째로 붙여넣으면 함수가 심어진다. 재로드하면 날아가므로 매번 다시 심어야 한다
// (localStorage의 __snapjs2 키에 압축본이 있어 `eval(localStorage.getItem('__snapjs2'))` 한 줄로도 된다).
//
// 🔴 기준선은 이미 떠 있다(README 해시표). __snap2를 부르면 **기준선을 덮어쓴다** — 부르지 마라.
//    비교만 할 때는 __cmp2 만 쓴다.

window.__PROPS = ['display','position','width','height','margin','padding','background-image',
  'background-color','color','border','box-shadow','font-size','line-height','flex','overflow',
  'transform','opacity','z-index','word-break','white-space'];

window.__hash = function (s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * 31 + i) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
};

// 함정 ① — 무한 애니메이션 5개(blob×3 · sun-icon · circle)를 0프레임에 세운다.
// 없으면 아무것도 안 고쳐도 그 5개가 매번 다르게 나온다.
//
// 함정 ⑤ 🔴 이 함수는 CSSTransition도 currentTime=0으로 보낸다 = **바뀌기 전 값**이 기록된다.
//    기준선을 뜰 때도 그랬으니, 전후를 **같은 방법으로만** 재라.
//    a.finish() 같은 것으로 조건을 바꾸면 그 자리가 전부 "달라졌다"로 뜬다(실제로 33개 났다).
//    조건을 바꿨으면 기준선도 다시 떠야 한다. 섞어 쓰지 마라.
window.__frozen = function (fn) {
  const anims = document.getAnimations();
  const st = anims.map(x => ({ x, t: x.currentTime, p: x.playState }));
  st.forEach(({ x }) => { try { x.pause(); x.currentTime = 0; } catch (e) {} });
  try { return fn(); }
  finally { st.forEach(({ x, t, p }) => { try { x.currentTime = t; if (p === 'running') x.play(); } catch (e) {} }); }
};

// dialog 13개를 open 속성만 붙여 자식 computed를 살린다.
// ⚠️ close()를 부르지 않는다 — 앱의 close 이벤트·저장 경로를 안 태우기 위해서다.
window.__withDialogsOpen = function (fn) {
  const ds = [...document.querySelectorAll('dialog')];
  const was = ds.map(d => d.hasAttribute('open'));
  ds.forEach(d => d.setAttribute('open', ''));
  try { return fn(); }
  finally { ds.forEach((d, i) => { if (!was[i]) d.removeAttribute('open'); }); }
};

// 함정 ② — 키는 순서번호가 아니라 DOM 경로다. head의 개발용 <script> 개수가 매 로드마다 달라서
// 순서번호로는 앞에서 2개만 늘어도 뒤 전부가 밀린다.
window.__path = function (el) {
  const parts = [];
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const p = n.parentElement; if (!p) break;
    let i = 0;
    for (const s of p.children) { if (s === n) break; if (s.tagName === n.tagName) i++; }
    parts.push(n.tagName + (i ? '[' + i + ']' : ''));
  }
  return parts.reverse().join('>');
};

window.__snapMap = function (withDialogs) {
  const run = () => window.__frozen(() => {
    const m = {};
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
      const cs = getComputedStyle(el);
      m[window.__path(el)] = window.__hash(window.__PROPS.map(p => cs.getPropertyValue(p)).join('|'));
    }
    return m;
  });
  return withDialogs ? window.__withDialogsOpen(run) : run();
};

// 함정 ④ — 테마는 앱 방식으로만 바꾼다. data-theme를 손으로 붙이면 앱이 되돌려놓아 경합한다.
// 이걸 부른 뒤 **반드시 재로드**해야 layout.tsx 인라인 스크립트가 첫 페인트 전에 적용한다.
window.__prepTheme = function (t) {
  try { localStorage.setItem('skillpilot_theme', t); } catch (e) {}
  document.cookie = 'skillpilot_theme=' + t + ';path=/;max-age=31536000;samesite=lax';
  return { prepped: t };
};

// 뉴스·채용이 비동기로 늘어난다. 요소 수가 3회 연속 같아질 때까지 기다린다.
window.__settle = async function () {
  let last = -1, same = 0, t = 0;
  while (t < 60000) {
    const n = document.body.querySelectorAll('*').length;
    if (n === last) { if (++same >= 3) break; } else { same = 0; last = n; }
    await new Promise(r => setTimeout(r, 1500)); t += 1500;
  }
  return { els: last, waited: t, stable: same >= 3,
    theme: document.documentElement.getAttribute('data-theme'), w: innerWidth, h: innerHeight };
};

// 🔴 기준선을 새로 뜬다. 이미 있으면 부르지 마라.
window.__snap2 = function (label) {
  const out = {};
  for (const v of ['closed', 'open']) {
    const m = window.__snapMap(v === 'open');
    localStorage.setItem('__b2:' + label + ':' + v, JSON.stringify(m));
    out[v] = { n: Object.keys(m).length,
      hash: window.__hash(Object.keys(m).sort().map(k => k + '=' + m[k]).join('\n')) };
  }
  return { label, ...out };
};

// 지금 화면을 기준선과 비교한다.
// `값이다른것`이 0이면 통과. `생긴것`/`없어진것`은 뉴스·채용 내용 차이일 수 있다(회귀 신호 아님).
window.__cmp2 = function (label, variant) {
  const saved = JSON.parse(localStorage.getItem('__b2:' + label + ':' + variant) || 'null');
  const now = window.__snapMap(variant === 'open');
  const nowHash = window.__hash(Object.keys(now).sort().map(k => k + '=' + now[k]).join('\n'));
  if (!saved) return { nowHash, note: 'localStorage에 기준선 없음 — README 해시표와 nowHash를 비교해라' };
  const changed = [], added = [], removed = [];
  for (const k in saved) (k in now) ? (saved[k] !== now[k] && changed.push(k)) : removed.push(k);
  for (const k in now) if (!(k in saved)) added.push(k);
  return { label, variant, nowHash, savedN: Object.keys(saved).length, nowN: Object.keys(now).length,
    '값이다른것': changed.length, '생긴것': added.length, '없어진것': removed.length,
    changed: changed.slice(0, 30), added: added.slice(0, 10), removed: removed.slice(0, 10) };
};

// 달라진 요소 하나의 속성을 라이브로 뜯어본다.
window.__inspectPath = function (p) {
  const el = [document.body, ...document.body.querySelectorAll('*')].find(e => window.__path(e) === p);
  if (!el) return { error: 'no ' + p };
  const cs = getComputedStyle(el);
  return { tag: el.tagName, cls: String(el.className),
    props: Object.fromEntries(window.__PROPS.map(x => [x, cs.getPropertyValue(x)])) };
};

// 🔴 판정 법 — `값이다른것`이 0이 아니면 기준선만으로는 회귀 여부를 못 가린다.
//    반드시 **대조군**을 같이 재라:
//      1) 변경을 되돌린 상태에서 재서 달라진 요소 집합을 얻고
//      2) 변경을 얹은 상태에서 재서 집합을 얻은 다음
//      3) 두 집합이 같으면 그 변경은 화면을 안 바꾼 것이다. 다르면 그 차집합이 회귀다.
//    날씨처럼 실시간으로 바뀌는 상자는 글자 폭이 달라져 항상 5~7개가 뜬다 — 회귀가 아니다.
//
// ⚠️ Browser 패널이 숨겨지면 페이지 타이머가 억제되고 트랜지션이 안 끝난다.
//    로딩 대기를 페이지 안(setTimeout)에 두면 도구가 타임아웃한다 — 도구 쪽 wait을 써라.
//    타임아웃 난 호출은 페이지에서 계속 돌아 동결/복원이 어긋난다. 그러면 **재로드로 지우고** 다시 시작해라.
'baseline v2 ready — __prepTheme → 재로드 → __settle() → __cmp2(label, "closed"|"open")';
