@AGENTS.md

# SkillPilot — 작업 규칙

## 🛑 0순위 — 코드를 열기 전에

### 1단계. 먼저 **묻는다**. 읽는 게 아니다.

> **"이거 예전에는 됐나? 언제부터 안 됐나? 뭐 추가하고 나서인가?"**

되던 게 깨진 거면 **회귀**고, 회귀는 문서가 아니라 **git이 답을 갖고 있다.**

```bash
git log --oneline -S "<그 기능의 클래스명/함수명>" -- <파일>   # 10초면 나온다
git show <그 커밋> -- <파일> | grep "^[-+].*<관련 셀렉터>"      # 뭐가 같이 딸려 왔는지
```

**2026-08-26: 이 질문 하나를 안 해서 10라운드, 7시간을 태웠다.** 사용자가 9라운드째에
"위로가기 생기면서 이지랄난 것 같은데"라고 던졌고, `git log -S` 한 번에 원인 줄이 나왔다.
그 9라운드 동안 나는 계속 **코드를 읽고 있었다.** 증상에서 원인을 찾으려 하지 말고
**"뭐가 바뀌어서 깨졌나"에서 시작해라.**

### 2단계. 그 다음에 읽는다.

1. **[🕳️ 지뢰밭 모임 — 버그 회고록](https://app.notion.com/p/3c665d3c83098190850ee3de98477f45)** (Notion)
2. **[HANDOFF_NEXT_CLAUDE.md](HANDOFF_NEXT_CLAUDE.md)** — 최신 절부터.
3. 아래 **3절 지뢰 표**. "스크롤 잠김"이면 **7절 2분 절차**.

**이 순서를 안 지켜서 태운 라운드가 최소 30번이다.** 답이 없어서가 아니라 안 읽고 시작해서다.

### 🔴 읽기가 안 통하는 세 가지 함정 (2026-08-26에 전부 밟았다)

- **목록이 있으면 재보지 않고 고른다.** "스크롤 잠김"은 손끝 느낌이 같은 원인이 다섯 개 이상이다.
  지뢰 표에서 제일 비슷한 걸 갖다 붙이는 순간 **실측을 건너뛴다.** 문서가 길수록
  "아는 것 같은 기분"만 늘고 측정은 줄어든다.
- **용의자를 알리바이 하나로 풀어주지 마라.** "리렌더가 범인인가?" → "prosemirror가 스크롤
  복원은 안 하네" → **리렌더를 용의선상에서 통째로 뺐다.** 스크롤 복원은 안 하지만
  **DOM 속성은 다시 쓴다**는 걸 안 봤고, 진짜 원인이 바로 그거였다. 한 가지로 무죄를 주고
  수사를 끝내지 마라 — **그 용의자가 할 수 있는 다른 일을 전부 세라.**
- **매 라운드 진짜 버그를 고쳐도 사용자 버그가 아닐 수 있다.** 고칠 때마다 진전된 느낌이 들어
  멈추지 못한다. **진짜 버그를 고치는 것 ≠ 증상이 사라지는 것.** 증상이 남았으면 아직 못 고친 것이다.

### 기록 의무 (사용자 명시 요구, 2026-08-26)

- **같은 증상을 2번 이상 고쳤는데 또 나오면** → 값을 또 만지지 말고 기록한다.
  무엇을 쟀고 · 무엇을 **안** 쟀고 · 왜 내 측정이 사용자가 보는 것을 못 봤는지까지 쓴다.
- **고쳤을 때도 기록한다.** "고쳤다"가 아니라 **어떻게** 고쳤는지 — 진짜 원인, 실측 수치(전/후),
  그리고 **검증 못 한 경로**. 셋 중 하나라도 빠지면 다음 세션이 같은 지뢰를 다시 밟는다.

**기록 위치는 두 곳이다 (예전엔 셋이었다):**

| 무엇 | 어디 | 형식 |
|---|---|---|
| **규칙** ("하지 마라") | **이 파일 3절 표** | 1행. 이미 있는 행이면 **고쳐라, 새로 만들지 마라** |
| **근거** (실측 수치·경위·미검증) | **[docs/incidents.md](docs/incidents.md)** | 원인 1줄 + 실측 + 미검증 (11-10절이 기준 예시) |

> 🔴 **셋에 쓰라는 규칙이 오히려 사고를 냈다.** 같은 사건이 Notion 지뢰밭 · HANDOFF 11절 ·
> 이 표에 **세 벌**로 존재했고(2026-08-26 실측: 채용공고 5라운드 / 포스트잇 3라운드 / 다크 로고
> 3라운드 / 스크롤 잠김 7라운드가 전부 중복), 한 벌만 고쳐지자 **표 자신이 틀린 값을 갖게 됐다**
> (아래 "grep은 규칙이 있나만 답한다" 참고). 세 벌은 세 배 안전한 게 아니라 **어긋날 자리가 셋**이다.
> **Notion 지뢰밭은 정본이 아니다** — 사람이 읽는 회고이고, 기계가 믿을 정본은 repo 쪽 둘이다
> (git으로 버전 관리되고, grep 되고, 매 세션 자동 로드된다).

### 🔴 grep은 "규칙이 있나"만 답한다 — "이기고 있나"는 실측이다

이 표 자체가 **틀린 적이 있다.** "편집 껍데기 셋 중 프로젝트만 `--kb-inset`이 없다"고 적혀 있었는데,
실측하니 **작성 폼도 안 먹고 있었다**(규칙은 있는데 특이도로 지고 있었다, 2026-08-26).
`grep -n "kb-inset"`으로 확인을 끝내지 마라. **열어놓고 computed value를 읽어라.**

```javascript
// 편집창을 연 뒤: --kb-inset:326px + html.kb-open 주입 → 껍데기의 실제 padding-bottom
getComputedStyle(shell).paddingBottom     // "326px" 계열이어야 한다. "28px"면 진 것이다.
```

## 0. 이 프로젝트의 전제

**Web / Mobile browser / PWA는 하나의 기능 범위다.** 세 환경 중 하나만 보고 고치면
나머지 둘이 깨진다. 기능 추가·버그 수정 모두 세 환경을 함께 설계한다.

단, 환경별 코드를 따로 만드는 게 목적이 아니다. 공통 로직·공통 컴포넌트·반응형 CSS를
먼저 쓰고, **실제 동작이나 플랫폼 제약이 다른 경우에만** 분기한다.
같은 기능을 Web용·Mobile용·PWA용으로 세 번 만들지 않는다.

## 0-1. Notion 상태 동기화 — 작업 완료 게이트

**→ [AGENTS.md](AGENTS.md)에 있다.** 이 파일 첫 줄의 `@AGENTS.md`가 매 세션 그 내용을 그대로
불러오므로, 여기 다시 적으면 **같은 규칙이 두 벌 로드된다**(실측 2026-08-26: 핵심 문구 7개가
양쪽에 전부 존재). 두 벌이 되는 순간 한쪽만 고쳐져 어긋나기 시작한다 — 정본은 AGENTS.md 하나다.

요약만: 코드·디자인·DB·API·운영을 **실제로 변경하는** 작업은 관련 Notion 문서의 상태·본문·검증
증거까지 갱신해야 완료다. 진단·리뷰·설명 같은 **읽기 전용 요청은 Notion을 건드리지 않는다.**

## 1. 구현 전에 할 것

- 이번 변경과 **직접 관련된** 기존 코드만 확인한다(전체 탐색 금지).
- 재사용할 수 있는 로직/UI/패턴이 이미 있는지 본다.
- 공통 컴포넌트나 공통 CSS를 건드린다면 **어느 화면들에서 쓰는지 먼저 grep**한다.
  화면 하나를 고치려고 전역 스타일을 바꾸지 않는다.
- 정상 동작 중인 Web UI를 Mobile/PWA 작업 때문에 바꾸지 않는다.

## 2. 레이아웃 원칙 (여기서 대부분의 사고가 났다)

특정 기기 한 대에 맞춘 보정 대신 구조로 대응한다.

- flex / grid, `min-height: 0`, `overflow`, `min/max-width`, `env(safe-area-inset-*)`,
  breakpoint 를 우선 쓴다. 남은 공간은 **브라우저가 계산하게** 둔다.
- `calc(100dvh - 126px)` 같은 매직넘버 금지. 이미 이 파일에서 여러 번 사고를 냈다.
- CSS로 안 되는 것(키보드 높이, visual viewport)만 JS로 계산한다.
- 같은 보정값을 두 곳 이상에서 중복 계산하지 않는다.

### 입력창 / 모달 / 전체화면 UI 체크리스트

- 모바일 키보드가 올라왔을 때 주요 UI가 가려지지 않는가
- 내부 스크롤과 페이지 스크롤이 충돌하지 않는가 (**스크롤러는 하나만** — 아래 참조)
- header / content / action 영역이 유지되는가
- iOS safe-area에 버튼이 겹치지 않는가
- PWA standalone에서 화면 끝이 잘리지 않는가

## 3. 이 프로젝트의 지뢰 (반복해서 밟았다)

수정 전에 반드시 읽는다. 각 항목은 실기기에서 실제로 터진 것들이다.

| 지뢰 | 규칙 |
|---|---|
| **💀💀 캐럿 노출을 "iOS보다 먼저" 하려고 디바운스를 풀지 마라 — 넣었다가 같은 날 되돌렸다** | 캐럿 노출이 `vv.resize`가 **멈춘 뒤 120ms**에만 도는 게 답답해 보인다: 키보드 애니메이션 내내 캐럿이 가려져 있고, 그 사이 iOS가 화면을 밀면(`vv.offsetTop > 0`) 배경 스크롤 잠금(`body{position:fixed}`) 때문에 `window.scrollTo(0,0)`으로 **되돌릴 수 없다**(실측 2026-08-27: `bodyPos=fixed`인데 `vvTop=45` 고착, 그 45px이 그대로 죽은 여백). 그래서 resize마다 즉시 한 번 더 부르게 했더니 — **명백히 더 나빠졌다.** 상단 7~9줄에서만 나던 여백 이상이 **메모 전역**으로 번졌다. 키보드가 열리는 동안 resize는 여러 번 오고, 매번 스크롤하면 **아직 끝나지 않은 레이아웃**을 기준으로 맞춰져 애니메이션 중간값마다 틀린 자리로 끌려간다. **정확한 스크롤은 레이아웃이 끝난 뒤에만 가능하다 — 그 전에 움직이면 빨리 가는 게 아니라 틀린 데로 간다.** iOS의 밀기를 막고 싶으면 스크롤 타이밍이 아니라 **밀 이유를 없애는 쪽**으로 가라(`--kb-inset` 스파이크 차단 등). 참고: 신고가 "5~9줄만"이었던 것은 그 밴드가 **키보드가 올라오며 새로 가려지는 구간**이라 노출이 필요한 유일한 구간이기 때문이다(1~4줄은 키보드가 올라와도 그대로 보인다) — 그 관찰 자체는 여전히 유효하다. |
| **🔴 `--kb-inset`이 튄 값을 그대로 쓰면 스크롤러가 찌그러진다** | 실기기 이력(iPhone Chrome + 네이버 키보드, 684px 화면): 정상 `inset=343 vvH=341`(50%) 중간에 **`inset=571 vvH=113`(83%)**이 섞인다. `vv.height`가 113까지 떨어지는 찰나(키보드 애니메이션·키보드 자체 패널 전환)가 있고, 그 571을 padding-bottom에 넣으면 스크롤러가 거의 0이 되어 캐럿이 사라지고 → 위 줄의 iOS 밀기로 이어진다. **화면의 2/3를 넘는 inset은 실제 키보드 높이가 아니라 튄 값이다 — 직전 값을 유지해라**(`MAX_KEYBOARD_RATIO`). |
| **🔴🔴 `scrollMargin.top`은 고정값이면 안 된다 — 덮는 것이 `absolute`면 높이에 안 잡힌다** | 서식툴바 패널(T / 메모색상 / ⋯)은 `position: absolute`라 툴바 박스 높이(실측 **39px**)에 **안 잡히면서** 본문을 덮는다. 실측(375×684, 포스트잇 상세 편집) **실제 가려지는 높이: 패널 없음 39 · T 97 · 메모색상 97 · ⋯ 136**. 그런데 `scrollMargin.top`이 **48 고정**이라 패널을 열면 49~88px이 모자랐다 — `scrollIntoView`가 캐럿을 위에서 48px 지점에 놓는데 거기가 **패널 뒤**라 캐럿이 안 보이고, 그러면 **iOS가 화면 전체를 민다**(`vv.offsetTop > 0`) → `--kb-inset` 패딩과 이중 보정 → 편집창이 위로 나가고 화면에 padding만 남는다 = **"여백이 절반까지 차올라 글이 가려진다"**. 신고가 **"하단 터치는 괜찮고 상단·중단만 이상하다"**였던 것도 같은 이유다 — 캐럿이 아래쪽이면 `bottom` 마진만 쓰인다. **숫자를 다시 찍지 말고 실제 덮이는 높이를 재서 넣어라**(`useLayoutEffect`로 패널 rect의 bottom − 스크롤러 top, 현재 구현: 48 / 105 / 105 / 144). 점검: `(패널 ?? 툴바).getBoundingClientRect().bottom - 스크롤러.top`이 `scrollMargin.top`보다 크면 진 것이다. |
| **🔴🔴 편집 스크롤러에 `onScroll`+`setState`를 달지 마라 — 그게 캐럿을 죽인다** | Dashboard는 **화면 전체를 그리는 한 개짜리 컴포넌트**라, 스크롤 한 번의 setState가 `MemoRichEditor`까지 리렌더한다 → tiptap `useEditor`가 `editor.setOptions()`를 부르고(@tiptap/react `onRender`) → `view.setProps()` + `view.updateState()` → ProseMirror가 `outerDeco`를 다시 계산해 **`view.dom`의 속성(`contenteditable` 포함)을 다시 쓴다** → **WebKit은 포커스된 contenteditable의 속성이 재작성되면 blur시킨다.** 그 blur 하나에서 신고 증상이 전부 나온다: 캐럿 사라짐 → 키보드 닫힘 → `--kb-inset` 326→0 → 껍데기 padding 축소 → 스크롤러 `clientHeight` 233→520(실측) → **그 리플로우가 스크롤을 되돌린다**("위로가기 안 먹힘") → 편집 풀려 보기모드. **"메모를 고쳤을 때만" 나던 이유**: 안 고쳤으면 키보드가 안 떠 있어 잃을 포커스가 없다. 회귀 지점은 `90c679e`(위로가기 도입) — 그 전엔 `.textarea-row`에 `onScroll`이 **아예 없었다.** 버튼 노출처럼 **다른 것에 영향 없는 순수 표시값은 state가 아니라 `classList.toggle`로** 해라(현재 `useScrollTopButton`). |
| **🔴🔴 `pointerdown` preventDefault로는 포커스를 못 지킨다 — `mousedown`도 같이 막아라** | WebKit(iOS Safari·Chrome 공통)에서 포커스/blur를 실제로 움직이는 것은 **`mousedown`**이고, `pointerdown`의 preventDefault는 뒤따르는 **호환 mousedown을 막지 않는다.** 이 표에 "편집창 안 모든 버튼에 `onPointerDown preventDefault`가 붙었는지 세라"가 있었고 실제로 다 붙어 있었는데 **틀린 이벤트에** 붙어 있었다. 잘 동작하던 `.mobile-rich-toolbar`만 유일하게 `onMouseDown`을 썼다는 게 단서였다. 지금은 `KEEP_EDITOR_FOCUS`(Dashboard.tsx) 하나를 버튼 5개에 spread한다 — **새 버튼은 반드시 이걸 써라. 반쪽만 붙이면 같은 지뢰다.** |
| **🔴🔴 `--kb-inset` 계산 4대 규칙 — 전부 `useViewportHeight.ts` 한 함수 얘기다** | 네 행으로 흩어져 있던 것을 합쳤다. 하나라도 어기면 증상이 똑같이 "스크롤 잠김/여백 이상"으로 나와서 서로 구분이 안 된다. ① **`innerHeight - vv.height`로 구하지 마라.** 이 iOS는 키보드가 열릴 때 `innerHeight`도 `vv.height`와 **똑같이** 줄인다(실측 684→358 / 684→358) — 뺄셈이 영원히 0이라 보정이 통째로 죽는다. 대신 **편집 중이 아닐 때의 `vv.height`를 baseline으로 저장**하고 그 차이를 쓴다. 0이 되면 편집창이 키보드 뒤까지 늘어나고 iOS가 최후수단으로 **화면 전체를 밀어버린다**(`vv.offsetTop > 0`). ② **baseline을 `focus` 이벤트에서 갱신하지 마라.** `focusout` 시점엔 **키보드가 아직 열려 있는데** activeElement가 body·버튼으로 바뀌어 `isEditing()`이 false가 된다 — baseline이 **눌린 높이 358**로 덮이고 그때부터 `inset = 358-358 = 0`이다. **제목 input → 본문처럼 키보드를 닫지 않고 포커스만 옮기는 경로**가 최악이다(뒤따르는 resize가 없어 틀린 값이 굳는다 = "어떤 때는 되고 어떤 때는 잠긴다"). ③ **`vv.scroll`로도 갱신하지 마라 — `resize`만.** `vv.addEventListener("scroll", syncResize)` 한 줄이 규칙을 어기고 있었다(**이름이 `syncResize`라 같은 부류로 묶인 것**). `vv.scroll`은 viewport가 **패닝될 때** 뜨고 "키보드가 닫혔다"를 보장하지 않는데, 하필 그 패닝이 키보드 올라오는 중에 일어나고 `window.scrollTo(0,0)`(iOS 밀기 되돌리기)이 한 번 더 쏜다 → **편집 진입 직후에만** 여백이 크고 정직한 resize가 오면 스스로 맞는다(= "오락가락"). ④ **`round`가 아니라 `floor`.** `vv.height`가 소수라 `round`면 326.5가 **327로 올라가** 그 1px이 `padding-bottom`에 얹힌다. 반올림 오차는 **항상 여백을 키우는 쪽으로만** 틀린다. `floor`는 최대 1px 덜 비우고 `html.kb-open` 쿠션이 흡수한다. **쿠션 아래는 브라우저 autofill 액세서리 바 자리라 `vv.height` 밖이고 우리가 못 그린다.** |
| **🔴 다크에서 "작아 보인다"는 대개 크기가 아니라 경계 문제다** | 메모 색상 점 8개는 전부 19px로 **같았다.** 다른 건 ① 안쪽 흰 링(`inset 0 0 0 2px`) — 밝은 색은 자기 색과 뭉쳐 19px로 읽히는데 검정은 링이 후광이 돼 알맹이 13px만 보인다 ② 테두리 대비 — 실측 패널 배경 `rgb(18,22,40)` vs 검정 점 `rgb(23,23,26)`으로 **거의 같은 색**이라 원이 배경에 먹히고, 테두리 `rgba(255,255,255,.18)`은 너무 흐려 경계를 못 그린다(진회색 `rgb(58,58,64)`은 배경보다 밝아 멀쩡했다 — "진회색은 되는데 검정만 안 된다"의 정체). **색마다 규칙을 만들지 마라(팔레트 바뀌면 또 어긋난다) — 링을 빼고 테두리 하나(.55)를 올려 8개를 똑같이 세운다.** 눈으로 크기를 재지 말고 배경색과 채움색을 **실측해서 대비를 봐라.** |
| **같은 기능 버튼이 화면마다 크기가 다르면 사용자가 바로 알아본다** | 뒤로가기 `‹`가 뉴스·채용·마이페이지·AI는 공용 블록의 **38px/34px**인데 메모(포스트잇 상세/수정, 먼슬리 Create)만 `34px/30px`로 줄이는 **메모 전용 override**가 따로 있었다. 점검은 눈이 아니라 전수 조사로: `[...document.querySelectorAll('.close-btn')]`를 돌며 `getComputedStyle(b,'::before').fontSize`로 **그룹을 세라 — 답은 항상 1개 그룹이다.** 위치는 버튼 박스 쪽 공용 규칙(top/left)이 정하므로 글리프 크기 규칙을 지워도 안 움직인다. |
| **`overflow` 한 축만 적으면 반대 축이 승격된다** | 스펙: 한 축이 `auto`/`scroll`/`hidden`이면 반대 축의 `visible`이 **`auto`로 승격**된다. 내용 높이만큼 자라는 박스면 `scrollHeight == clientHeight`인 **"굴릴 수 없는 스크롤러"**가 되고, iOS는 그걸 만나면 터치를 거기서 멈춘다 — 진짜 스크롤러는 안 움직인다. **2026-08-26: 앱 최상위 `.sp-body`가 바로 그 상태였다**(`overflow-x: hidden` 한 줄, 실측 2639/2639). 메모·프로젝트·모든 다이얼로그가 그 밑이라 "스크롤 잠김" 신고 대부분이 여기로 수렴한다. `.job-tabs`도 같은 한 줄로 **1px 스크롤러**(38/37)가 돼 채용 상세가 "한 문장만 스크롤되고 멈췄다". **클리핑이 필요하면 `hidden`이 아니라 `overflow-x: clip; overflow-y: visible`을 써라 — `clip`은 반대 축을 승격시키지 않는다**(Safari 16+). 세로 스크롤러엔 `overflow-x: hidden`을 같이 적는다. **양쪽 축을 항상 명시할 것.** 점검은 손으로 세지 말고 이 프로브를 돌려라: `[...document.querySelectorAll('*')].filter(e=>{const c=getComputedStyle(e);return /auto|scroll/.test(c.overflowY)&&e.scrollHeight-e.clientHeight<=2})` — **열려 있는 다이얼로그 안에서** 결과가 0이어야 한다. |
| **💀💀💀 "스타일은 전부 정상인데 스크롤이 안 된다"면 스타일 읽기를 멈춰라 — 안 나타나는 층이 둘 있다** | 2026-08-28, 4라운드를 이렇게 태웠다. 실기기 판독이 **전부 정상**이었다: `body=static` · `dialog[open]=0` · `.sp-body clip/visible` · 굴릴 수 없는 스크롤러 0개 · 조상 체인 전부 `ta=auto` · 덮는 오버레이 없음. 그런데 손가락으로는 안 굴러갔다. **computed style에 흔적을 남기지 않는 층이 둘이다: ① 제스처가 스크롤로 라우팅되는가(`touch-action`) ② 누가 스크롤을 되돌리는가(`window.scrollTo` / `scrollIntoView`).** 스타일만 읽으면 영원히 못 찾는다. 🔴 그리고 `?debug=vp`의 **"굴릴 수 없는 스크롤러" 목록은 죽은 것만 센다** — 살아서 끝까지 굴러간 스크롤러는 거기 안 잡히므로 **"None"을 무죄로 읽지 마라.** 처방은 계측 둘이고, 둘 다 10줄이면 만든다: **(a) `scrollTo(0, y+120)` 후 `scrollY`를 읽어 되돌린다** — `ok`면 스크롤러는 멀쩡하고 문제는 제스처다. 이때 **`before`가 `max`와 같으면** 누가 max보다 큰 값으로 굴린 뒤 clamp된 것이다(실기기 `ok (1226→1346, max 1226)` 한 줄이 원인을 통째로 특정했다). **(b) `window.scrollTo`를 감싸서 제스처 도중 호출을 센다** — 되돌리는 범인이 이름 없이 잡힌다. 전체 기록은 docs/incidents.md 11-15절. |
| **💀💀💀 구조를 바꿨으면 옛 구조를 전제로 한 보정을 **전부** 세라 — 여섯 개가 살아남았다** | `a95cefd`가 모바일 메모 편집을 (fixed 껍데기 + 배경 잠금 + 내부 스크롤러) → **문서가 스크롤러**로 바꿨다. 구조는 바뀌었는데 **옛 전제 위에 쓰인 보정들이 그 결정에서 빠진 채 살아남았고**, 하나 고칠 때마다 다음 게 드러나 6라운드가 됐다: `--kb-inset` padding / 60vh 여유 / 배경 잠금 cleanup의 `scrollTo(0, 대시보드y)` / `touch-action` 부재 / iOS 밀기 되돌리기 `scrollTo(0,0)` / 캐럿 노출 `scrollIntoView()`. **셋(3·5·6)이 전부 "누가 문서를 되돌리는가"였다** — 옛 구조에서 무해했던 스크롤 호출이 문서가 스크롤러가 되는 순간 전부 화면 전체를 움직인다. **구조 커밋에 "이 경로에서는 X를 안 쓴다"고 적었으면, X를 쓰는 곳을 `grep`으로 전수 조사해서 같은 커밋에서 전부 막아라.** 실제로 그 문장이 CSS 주석과 인계문서에 **이미 있었는데** 여섯 곳 중 두 곳만 반영돼 있었다. |
| **🔴🔴 편집 화면을 "일반 페이지"로 옮길 때 `<div>`로 바꾸지 마라 — 셀렉터가 `dialog`에 묶여 있다** | 먼슬리 Create를 메모 수정처럼 옮기는 작업(2026-08-28). compose 관련 CSS 규칙 **77개 중 64개가 `dialog` 타입 셀렉터로 시작한다**(실측: `grep -o "dialog[a-z.-]*\.memo-compose-open[^,{]*" \| wc -l`). 평범한 `<div>`로 옮기면 그 64개가 한꺼번에 죽어 화면이 통째로 무너진다. **엘리먼트는 `<dialog>`로 두고 모달만 풀어라** — 비모달 `<dialog open>`은 top layer 밖이라 `position: static`이면 일반 흐름 블록이 되고 셀렉터는 전부 그대로 매치된다. 전환은 `close()` → `show()`. 🔴 그런데 **`close` 이벤트는 비동기라** 그 시점엔 이미 다시 열려 있다 — 그걸 "닫혔다"로 읽으면 `activeDialogKey`가 null이 되고 잠금 cleanup의 `scrollTo(0, 대시보드 y)`가 돌아 화면이 튄다(지뢰 #3 재발). 플래그 말고 **실제 상태를 봐라**: `if ((e.target as HTMLDialogElement).open) return;` 🔴 그리고 마커 클래스는 **`.memo-edit-page`를 재사용해라** — 내부 스크롤러 제거·툴바 sticky·`scrollTo`/`scrollIntoView` 가드·대시보드 감추기가 전부 거기 걸려 있어서 공짜로 따라온다. **평행한 두 번째 메커니즘을 만들지 마라.** 걷어야 할 옛 보정은 여섯이다(`--kb-inset` padding / `100dvh`+`overflow:hidden` / 내부 스크롤러 `overflow-y:auto` / `--vv-push` transform(`!important`라 이쪽도 필요) / 60vh 쿠션+min-height / 배경 스크롤 잠금). ⚠️ 껍데기(`.dialog-inner`)의 `min-height`는 **0이 아니라 `100dvh`** — 0으로 두면 메모지가 263px에서 끊기고 캔버스가 드러난다(실측). 경위는 docs/incidents.md 11-17절. |
| **💀💀💀 "하단에 검은칸이 뜬다" = `body` 배경색이다. theme-color도 액세서리 바도 아니다** | 2026-08-28, 이걸 **세 라운드** 헛짚었다(액세서리 바 네이티브설 → theme-color 동적 변경 → theme-color 로드시점 진단). 답은 문헌에 있었고 **사용자가 먼저 짚어줬다**("내가 말하는 검은칸은 메인바탕색인것같아"). 🔴 **오버스크롤(고무줄)과 키보드 주변에서 iOS가 보는 것은 `body`의 배경색 하나뿐이다 — 자식 요소 배경은 그 영역에 안 쓰인다**([근거](https://dev.to/a-dev/css-overscroll-behavior-rubber-banding-the-right-color-behind-the-page-when-you-pull-it-47mj)). 사이트 배경과 테마가 어긋나면 하단 가장자리로 배경이 "샌다". 네이버 메모에 이 현상이 없는 이유도 같다. 실측: 메모지 `background-color`는 **`rgba(0,0,0,0)`**(색은 전부 `background-image` gradient 안에 있다)인데 `body`는 `rgb(11,13,25)` — 그 어긋남이 검은칸이다. **처방: 편집 페이지가 열려 있는 동안 메모지의 `backgroundImage`+`backgroundColor`를 `body`에 그대로 복사한다.** 색을 새로 정하지 마라 — "메모지 색 네 번째 벌"이 되고 팔레트가 바뀌면 어긋난다. 문자열을 통째로 복사하므로 다크 메모지의 2레이어도 자동으로 따라온다. ⚠️ 그리고 **진단과 수정을 합치지 마라** — "편집 중에만 밝게"를 바로 넣었더니 실패했을 때 "그 영역을 안 칠하는 것"인지 "동적 변경이 무시되는 것"인지 구분이 안 돼 라운드를 하나 더 썼다. 경위는 docs/incidents.md 11-18절. |
| **🔴 문서가 스크롤러인 페이지에서는 `useScrollTopButton`이 영원히 안 뜬다** | 그 훅은 `ref.current.scrollTop` = **요소 스크롤러**를 본다. 구조를 옮긴 화면(모바일 메모 편집·먼슬리 Create)엔 내부 스크롤러가 없어서(문서가 스크롤러) 항상 0을 읽는다. 실측 2026-08-28: `scrollY=400`인데 안 뜸. 게다가 버튼이 `postitViewNode` 안에만 있어서 그 페이지엔 **렌더링조차 안 되고 있었다**(`.memo-edit-page` 안에 0개) — 구조 이전 때 같이 빠졌고 사용자가 먼저 발견했다. 문서용은 `DocScrollTopButton`(window `scroll` + `classList` 토글)이고 **`position: fixed`여야 한다**(absolute면 내용과 함께 스크롤돼 올라간다). ⚠️ **useState를 들이지 마라** — 스크롤마다 리렌더가 돌면 tiptap이 contenteditable 속성을 다시 써서 WebKit이 blur시킨다(850절 주석). ⚠️ 이 패널에서는 프로그래매틱 스크롤에 **window scroll 이벤트가 안 뜬다**(실측 0→444, 리스너 0회) — 토글 검증은 `dispatchEvent(new Event('scroll'))`로 해라. |
| **💀💀💀 "메모지 아래에 검은칸" = iOS가 **키보드 높이만큼 문서 스크롤 범위를 늘린다**(가상영역). 고무줄도 theme-color도 아니다** | 2026-08-28, **5라운드**를 태웠다. 키보드가 올라오면 iOS는 콘텐츠 아래에 여백을 만들고 **그게 스크롤 범위에 들어간다** — 거기엔 우리 요소가 없어서 캔버스(body 배경)가 보인다([근거](https://www.ycow-dev.com/blog/posts/issues/ios_virtual_keyboards): "가상키보드가 생기며 만들어지는 가상영역이 스크롤 범위에 들어왔다", "Android와 달리 innerHeight와 visualViewport.height가 동일해져서 여백 감지가 어렵다" = **이 파일이 이미 적어둔 684→358/684→358 그 값이다**). 💀 **내가 4라운드를 헛짚은 단 하나의 이유: 키보드가 없는 상태에서 재고 "빈 자리 없음"이라고 세 번 보고했다.** 사용자는 처음부터 "수정할 때"라고 말하고 있었다 — **증상이 나는 조건에서 재라.** 처방(CSS만): `min-height: 100lvh`로 항상 가장 큰 뷰포트를 덮고(툴바가 접히면 `100dvh`가 보이는 영역보다 작아진다), `html.kb-open`일 때 `min-height: calc(100lvh + var(--kb-inset))`로 가상영역을 메모지로 덮는다. 🔴 **`padding`만으론 안 된다** — `border-box`라 padding이 높이 안쪽으로 먹혀서 내용이 짧으면 1px도 안 커진다(실측: Create 빈 메모에서 padding 0→326px인데 높이 684 그대로). 내용이 긴 화면에서는 padding만으로도 자라서 **한쪽 화면만 보면 고쳐진 걸로 착각한다 — 두 화면을 다 재라.** 경위는 docs/incidents.md 11-19절. |
| **💀💀💀 브라우저 자기 표면(키보드 위 영역 등)의 명암은 **루트의 `color-scheme`**이 정한다 — 하위 요소에 걸면 안 먹는다** | "수정 중 메모지 아래에 뒷배경이 뜬다"를 **여섯 라운드** 태운 끝의 답이다(2026-08-28). 🔴 실기기 계측(`?debug=vp`)이 방향을 뒤집었다: `메모지 아랫변=389 / vvH=385` → 메모지가 보이는 영역을 **4px 넘겨서 덮고 있고**, `scrollY=1826/1826`이 `docSh 2215 − innerH 389`와 **정확히 같아** iOS가 스크롤 범위를 늘린 것도 아니었다(가상영역 0 — 그 가설도 틀렸다). 즉 검은 부분은 **페이지 안이 아니다.** `vv.height`와 키보드 사이 = 브라우저 자기 표면이고, 그 명암은 루트(`<html>`)의 `color-scheme`이 정한다 — 다크 테마의 `[data-theme="dark"] { color-scheme: dark }`가 그대로 검게 칠하고 있었다. 그래서 레이아웃(포스트잇 크기·`overscroll-behavior`·`theme-color`·`100lvh`)으로는 다섯 번 다 못 잡았다. 💀 **예전 세션이 `html .memo-edit-page.big-postit { color-scheme: light }`로 하위 요소에 걸어두고 "효과 미확인"으로 두 세션을 넘겼다 — 방향은 맞았고 대상이 틀렸다.** 정본은 `globals.css`의 `html:has(.memo-edit-page) { color-scheme: light }` 한 곳이다(`:has()`가 인자 특이도를 가져 (0,1,1) > `[data-theme="dark"]`(0,1,0)라 소스 순서와 무관하게 이긴다). **dashboard.css에 다시 넣지 마라 — 두 벌이 되고 그쪽은 원래 안 먹는다.** 경위는 docs/incidents.md 11-20절. |
| **💀💀 "경계선이 보인다"에 배경/페이드로 답하지 마라 — `border`는 background **바깥**에 그려진다** | 2026-08-28. 11-22가 "대각선 gradient vs 단색 띠"라는 **기하 문제**를 진단하고 메모지 아랫변에 80px 페이드를 넣었는데, 사용자가 보던 선은 그게 아니라 **메모지 자신의 `border`**였다. 실측(다크 375×684): `--memo-canvas`와 `body`가 **이미 완전히 같은 값**(`rgb(251,233,184)`)인데도 선이 남았다 — 그게 "색 문제가 아니다"의 증거다. 범인은 `.memo-edit-page.postit.big-postit`의 `border-bottom 0.8px rgb(232,218,157)` 하나였다. **background는 padding-box까지고 border는 border-box 테두리에 자기 색으로 덧그려진다 — 값을 조정해서 이길 수 있는 종류가 아니다.** 💀 그리고 **여덟 곳의 border 색을 맞추는 쪽으로 가지 마라**: 다크 팔레트가 `[data-theme="dark"] .postit.c1~c7`로 8종이고 각자 자기 border 색을 갖는다(7072절~). 여덟 번 고치면 아홉 번째가 생긴다. **전체화면 편집 페이지는 카드가 아니다 — 테두리도 그림자도 의미가 없으니 통째로 끈다**(dashboard.css 맨 끝, 세 화면 공용). ⚠️ 특이도: 상대가 `[data-theme="dark"] .postit.c3` **(0,3,0)**이라 `html .memo-edit-page.big-postit` **(0,2,1)**로는 **진다**(파일 맨 끝이어도 진다). `html[data-theme]` + 클래스 셋 = **(0,4,1)**로 올렸다. 🔴 점검법이 이번 판정의 핵심이었다: 셀렉터를 짐작하지 말고 **아래 260px 안에서 가로선을 만들 수 있는 모든 것**(border-top/bottom · box-shadow · `::before`/`::after`)을 **전수로** 뽑아라 — 후보가 딱 하나로 나온다. 경위는 docs/incidents.md 11-23절. |
| **🔴🔴 "눌러도 반응이 없다" = 핸들러를 보기 전에 **그려지고는 있나**부터 재라** | "+ N개 더보기"를 **두 세션에 걸쳐** 못 고쳤다. 11-1이 "onClick이 없다"고 진단해 `openMemoModalAt`을 연결했지만 신고가 그대로 돌아왔고, 11-3은 *"오늘 메모가 3개 이하라 화면에 안 떠서 클릭 미검증"*이라고 적었다 — **안 떴던 건 조건 때문이 아니라 CSS 때문이었다.** 2889절 `.today-section > .hint { display:none }`(모바일)이 이 버튼까지 잡고 있었다: 의도는 *"오늘 등록된 메모가 없어요"* 같은 **안내 문구**를 감추는 것인데 버튼이 **같은 `.hint` 클래스를 쓰는 바람에** 같이 걸렸다. 실측 `display:none / rect 0×0` — onClick을 백 번 달아도 안 눌린다. 처방은 `.hint:not(.hint-action)`. **점검 1줄: `el.getBoundingClientRect()`가 `0×0`이면 핸들러 문제가 아니다.** 그리고 **의미(안내 문구)와 역할(버튼)이 다른데 클래스를 공유하면 표시 규칙이 둘을 못 가른다** — `.hint`처럼 스타일 이름으로 감추는 규칙에는 반드시 역할 클래스로 예외를 파라. ⚠️ 실측 검증은 합성 마크업 말고 **실제 `.today-section` 안에 넣어서** 해라(조상이 규칙의 일부다). 경위는 11-24절. |
| **🔴 모바일 문구는 눈으로 정하지 말고 **칸 폭을 재고** 정해라 — 잘린 자리는 "경계선"으로 신고된다** | MindSet 신고 *"입력창 칸 경계 없애줘 + 맨 뒤에 「표」자가 짤림"*은 **두 문장이 같은 하나**였다. 실측 375px: 입력칸 **163px**인데 문구는 **305px**(16px/weight500)이고 `white-space:nowrap; overflow:hidden`이라 문장 중간을 하드컷 — 그 **수직 컷 자리가 "칸 경계"로 보인다.** `border`는 실제로 `0px none`이었다: **테두리를 찾았으면 영원히 못 찾았을 것이다.** 칸이 163px뿐인 이유는 바 355px에서 라벨 64 + 하트 24 + gap 36 + padding 32 + `✓ 저장됨` 44 = 200이 먼저 나가서다. 🔴 **폭으로는 못 푼다**: `font-size`는 16px 아래로 못 내리고(위 "입력칸 font-size 16px 하한", iOS 자동확대), `✓ 저장됨`을 흐름에서 빼면 53px 벌지만 표시될 때 입력 텍스트와 겹친다. **답은 모바일 전용 문구로 분리하는 것**(데스크톱 `<input>`과 모바일 `<textarea>`가 이미 별개 엘리먼트다 — 109px로 줄여 여유 54px). 점검 1줄: `canvas.measureText(el.placeholder).width <= el.getBoundingClientRect().width`. 경위는 11-25절. |
| **🔴 CSS를 고쳤으면 `tsc`가 아니라 **브라우저**를 열어봐라 — 문법 오류를 아무것도 안 잡는다** | 2026-08-28: 규칙 하나를 지우면서 닫는 `}`를 같이 지웠는데 `tsc --noEmit`도 `npm run check`도 **전부 통과**했다. dev 서버만 500으로 죽고(`CssSyntaxError: Unclosed block`) 화면이 백지가 됐다 — 브라우저를 안 열었으면 그대로 푸시할 뻔했다. CSS 편집 뒤에는 반드시 페이지를 한 번 열거나, 최소한 주석을 걷어낸 뒤 중괄호 개수를 세라: `python`으로 `/* */`를 제거하고 `{`와 `}` 개수가 같은지 확인(실측 dashboard.css 2833/2833). |
| **스크롤러는 하나만** | 전체화면 편집창의 세로 스크롤러는 **`.textarea-row` 하나뿐**이다. 바깥(`.dialog-inner`, `.big-postit`, `.memo-form.open`)은 전부 `overflow: hidden`. 조상 체인에 굴릴 수 없는 스크롤러가 하나라도 있으면 "스크롤이 잠긴 것처럼" 느껴진다. |
| **🔴🔴 메모 편집 껍데기는 셋이다 — `--kb-inset`은 grep이 아니라 computed로 확인해라** | `.big-postit`(포스트잇 수정) / `.monthly-memo-dialog.memo-compose-open .dialog-inner`(작성) / `.proj-detail-inner.proj-detail-editing`(프로젝트) 셋이 전부 전체화면 편집창이다. **셋 중 둘이 각각 다른 세션에 같은 사고를 냈다.** ① 프로젝트는 규칙 자체가 없었다(`height:auto` + 고정 28px). ② 작성 폼은 **규칙이 있는데 특이도로 지고 있었다** — `.monthly-memo-dialog.memo-compose-open .dialog-inner`(0,3,0)이 같은 media block의 `dialog.glass-dialog.big .dialog-inner`와 `dialog.glass-dialog:has(.cal-grid) .dialog-inner`(둘 다 **(0,3,1)** `padding` shorthand)에 져서 padding-bottom이 28px로 고정이었다(실측 2026-08-26: `.textarea-row` 아랫변 **649**, 키보드 상단 358 → 291px가 키보드 뒤. 셀렉터에 `dialog.glass-dialog`를 붙여 (0,4,1)로 올린 뒤 326px / 351). **`:has(.cal-grid)`는 달력이 `display:none`이어도 매치된다 — DOM에 남아 있기 때문이다.** 그러면 키보드가 올라와도 껍데기가 안 줄어 아래쪽이 키보드 뒤에 깔리고, 스크롤러는 그 안 보이는 구간까지 높이로 계산해서 **긴 글의 끝이 영영 안 잡힌다.** 거기에 iOS가 화면을 밀면 sticky 서식툴바까지 같이 나간다. 프로젝트 쪽 실측: 수정 전 28px·스크롤러 아랫변 785(키보드 상단 486보다 **아래**) → 수정 후 354px·459. **`grep -n "kb-inset"`으로 끝내지 마라 — 그건 "규칙이 있나"만 답한다. 껍데기 셋을 전부 열어서 computed `padding-bottom`을 읽어라.** 그리고 `.dialog-inner`를 노리는 (0,3,1) 규칙들(`dialog.glass-dialog.big` / `.full` / `:has(.cal-grid)` / `:has(.editorial-head)` / `.compact`)을 이기려면 셀렉터에 `dialog.glass-dialog`를 반드시 붙여라. |
| **🔴 로컬 뷰포트를 실기기 크기로 맞춰라 — 812로 재면 안 잘린다** | 실기기는 `innerH=684`, 키보드가 올라오면 보이는 높이가 **358**이다(이 값은 이 문서 위쪽 `--kb-inset` 줄에 이미 적혀 있었다). 그런데 브라우저 기본 mobile 프리셋은 **812**라, 키보드를 시뮬레이션해도 여유가 100px 넘게 남아 **잘림이 재현되지 않는다** — 글씨 크기 드롭다운이 정확히 그랬다(812에서 여유 94px → "정상", 684에서 **34px 잘림**). 모바일 잘림·겹침을 잴 때는 `resize_window(375, 684)` 후 `--kb-inset: 326px` + `html.kb-open`을 넣고 재라. |
| **키보드 위로 띄우는 값은 `100dvh`/`vh`가 아니라 `--app-vh`로 묶어라** | iOS는 키보드가 올라와도 `100dvh`를 안 줄인다(위 "iOS 100dvh" 줄). 그래서 드롭다운·팝오버의 `max-height`를 `dvh`나 고정 px로 두면 타이핑 중에 잘린다. 실제로 보이는 높이는 `useViewportHeight`가 내려주는 `--app-vh`뿐이다 — `max-height: calc(var(--app-vh, 100dvh) * 0.42)`처럼 **비례로** 묶고, 목록 자체엔 `overflow-y: auto`를 남겨 항목이 사라지지 않게 한다(`.mobile-font-size-menu`, 2026-08-26). |
| **하단 여백을 비우는 `bottom` 값은 그 버튼 행이 실제로 보일 때만 맞다** | `.big-postit .scroll-top-btn { bottom: 90px }`는 하단 `.form-actions` 행을 피하려는 값인데, **모바일 편집 중에는 그 행이 `display:none`(실측 h=0)**이라 버튼만 62px 높이 떠 있었다(프로젝트 편집창은 기본 28px). 같은 기능 버튼이 화면마다 다른 높이에 뜨면 사용자가 바로 알아본다. 편집/보기는 `.big-postit:has(.textarea-row)`로 가른다 — 보기 모드는 `.big-body-scroll`을 쓰고 버튼 행이 실제로 있다. |
| **입력칸 font-size 16px 하한** | `input`/`select`/`textarea`/`contenteditable`의 computed font-size를 **16px 미만으로 내리지 않는다.** iOS는 그런 컨트롤에 포커스가 가면 페이지를 자동 확대하고 그 확대가 유지된다 — 그때부터 화면 전체가 패닝 대상이 되어 창이 손가락 따라 움직이고, `fixed`/`sticky`가 화면 밖으로 나가고, 스크롤이 패닝으로 먹힌다. `::placeholder`만 올려도 소용없다(컨트롤 자신의 크기를 본다). `max(16px, 1em)` 같은 일괄 규칙도 금지 — `1em`이 부모 기준이라 22px 제목이 16px로 **줄어든다**. |
| **iOS 100dvh** | iOS는 키보드가 올라와도 `100dvh`를 줄이지 않는다. 보이는 높이는 `--app-vh`, 키보드가 가린 높이는 `--kb-inset`(둘 다 `src/lib/useViewportHeight.ts`). 껍데기는 화면 전체를 덮고 키보드 몫은 **padding으로만** 비운다. |
| **💀💀💀 `vv.offsetTop`(iOS 화면 밀기)은 고칠 대상이 아니라 **증상**이다 — 원인은 "내부 스크롤러에 굴릴 것이 없음"(WebKit #191204)** | **이 표에 있던 "iOS의 화면 밀기는 되돌린다" 행이 3주간 틀린 방향을 가리켰다.** 되돌리기(`scrollTo(0,0)`)도 상쇄(`translateY(var(--vv-push))`)도 실패했는데, 둘 다 **이미 일어난 승격을 사후에** 상대하려 했기 때문이다. 진짜 기전: 키보드가 올라올 때 **내부 스크롤러가 굴릴 수 없으면**(`scrollHeight == clientHeight`) iOS는 캐럿을 보이려고 **문서 자체를 스크롤하는 쪽으로 승격**하고, 그게 `vv.offsetTop > 0`이다([WebKit #191204](https://bugs.webkit.org/show_bug.cgi?id=191204), [해설](https://dev.to/deanliu/the-ios-safari-keyboard-scroll-bug-fixed-with-one-line-of-css-1353)). 배경 스크롤 잠금(`body{position:fixed}`)이 걸려 있으면 되돌릴 문서조차 없어 **한 번 승격되면 끝이다.** 🔴 **이 프로젝트는 그 조건을 스스로 만들고 있었다** — 4430절이 본문을 `flex:1 0 auto`로 두어 "짧으면 스크롤러를 딱 채운다"로 맞췄고(= 굴릴 것 없음), 글 끝~키보드 여백을 24→4→2→**0**까지 깎았다. 신고가 **"5~9줄만" → "상단·중앙·후반 제각각"**으로 번진 것도 이것이다: 캐럿 위치에 따라 여유가 남는 경우에만 정상이었다. **처방은 여유를 남기는 것뿐이다** — `html:not(.kb-open)`일 때 스크롤러 안쪽(편집 영역 **밖**인 `.rich-editor-body-wrap`)에 `padding-bottom: 60vh`(dashboard.css 맨 끝). `kb-open` 이후엔 걷는다(그때는 `--kb-inset`이 키보드 몫을 비워 승격 이유가 없고, 남기면 4430절이 없앤 "글 끝 빈 칸"이 돌아온다). 불변식 ⑦(`키보드 전 스크롤 여유 있음`)이 이걸 지킨다. **`vv.offsetTop`이 0이 아니면 좌표를 보정할 생각을 하지 말고 "이 스크롤러가 굴러갈 수 있나"를 먼저 재라: `s.scrollHeight - s.clientHeight`.** 🔴🔴 **그리고 그 `padding-bottom: 60vh` 쿠션은 짧은 내용에서 여유를 하나도 못 만든다(2026-08-28 실측).** 쿠션은 **내용에 더하는 값**인데 `.rich-editor-body-wrap`이 `flex: 1 0 auto`라 basis가 자기 내용 높이(본문+쿠션)이고, 그게 스크롤러에 들어가면 grow로 남은 자리를 채우고 끝난다 → `scrollHeight == clientHeight`. 먼슬리 Create 실측: 스크롤러 544 = 툴바 39 + wrap 505, wrap 505 = 본문 95 + 쿠션 410 — **정확히 딱 맞아 slack 0**. 즉 쿠션이 `스크롤러 높이 − 본문`을 넘어야 하는데 스크롤러가 이미 ~80vh라 **본문이 길 때만** 넘었고, 그래서 세 화면에서 조용히 안 먹고 있었다. 필요한 건 "스크롤러 한 판 + 60vh"라 `min-height: calc(100% + 60vh)`를 padding과 **같이** 건다(실측 slack 0 → 449). ⚠️ 인계문서가 제시했던 `.textarea-row`를 `flex: 1 1 0`으로 바꾸는 안은 **효과가 없다 — 실물에 얹어 재봤고 544 그대로다**(basis가 auto든 0이든 grow 결과가 같은 자리). 다시 시도하지 마라. 💀 그리고 이 쿠션 규칙 첫 셀렉터가 `.big-postit`이라 **`.memo-edit-page`에도 매치된다** — 거기서 쿠션을 걷는 규칙에 `padding-bottom: 0`만 있고 `min-height`를 안 걷으면 "진입 직후 하단 빈 칸"이 그대로 되살아난다. **공용 규칙에 선언을 하나 더 넣으면 걷어내는 쪽도 하나 더 걷어라.** 경위는 docs/incidents.md 11-16절.🔴🔴🔴 **그리고 `vv.offsetTop`으로 위치를 보정하지 마라 — iOS에서는 그 자체가 틀린 접근이다(2026-08-27 확정).** 근거: *"On iOS WebKit **the layout viewport itself slides under the keyboard**, so that origin is **0, not offsetTop**. The correct clamp origin is offsetTop on Blink, but 0 on iOS WebKit."* 그리고 Vuetify가 머지한 [PR #22923](https://github.com/vuetifyjs/vuetify/pull/22923) "keep overlay attached with iOS keyboard open"이 정확히 그것이다 — `y: visualViewport.scale > 1 \|\| IS_WEBKIT ? 0 : visualViewport.offsetTop`. WebKit이면 **offsetTop을 0으로 무시한다.** 즉 WebKit은 `position:fixed`를 이미 보이는 자리에 붙여주고, `offsetTop`이 0이 아닌 것은 **정보일 뿐 보정 대상이 아니다.** 되돌리기(`scrollTo(0,0)`) → 상쇄(`translateY(--vv-push)`) → `!important` → 가드 제거를 3주간 차례로 시도해 전부 실패한 이유가 이것이다. 💀 **그 3주 중 하루는 내가 만든 것이다:** 이 표와 dashboard.css 3005절에 "offsetTop을 더하면 이중으로 밀려서 편집창이 화면 맨 아래로 내려가 버렸다"는 **실기기 실측 기록**이 있었는데, 2026-08-27에 내가 그것을 "오진"이라고 판단해 근거 없이 뒤집었다. **실기기 증거로 남은 기록을 검색·문헌 근거 없이 뒤집지 마라 — 그 기록이 그때 화면을 본 유일한 증인이다.** ✅ 지금 처방: 보정을 전부 버리고 **껍데기 높이를 `--app-vh`(= `vv.height`)로 잡는다.** 그러면 껍데기 아랫변 == 보이는 아랫변이라 죽은 여백도 짤림도 **구조적으로 불가능**하고, 설계가 `vv.height` **하나**에만 의존한다(baseline·`--kb-inset`·offsetTop·scale은 전부 여러 번 틀렸던 값이다). 오버레이만 `inset:0`으로 남겨 껍데기 아래 띠를 덮는다. 불변식 ⑥이 `껍데기 아랫변 == 보이는 아랫변`으로 이걸 지킨다. |
| **🔴🔴 캐럿 노출의 소유자는 정확히 하나 — 후보를 "내가 부른 API 안쪽까지" 세라** | 네 행으로 흩어져 있던 것을 합쳤다. iOS의 화면 밀기를 취소하면 캐럿 노출 주체가 사라지므로, `MemoRichEditor`가 `vv.resize`가 **멈춘 뒤 한 번** `editor.commands.scrollIntoView()`로 직접 한다. 둘이 같이 돌면 오버슈트하고(탭한 자리보다 아래가 보임), 둘 다 없으면 커서로 안 간다. **여기에 스크롤을 더 넣지 마라.** 실제로 소유자가 몰래 늘어난 경로 셋: ① **Tiptap `focus()`의 기본값이 `{ scrollIntoView: true }`다.** undo/redo에서 `focus()`를 별도 트랜잭션으로 뺐더니 소유자가 둘이 되어 전체화면 편집 스크롤 막힘이 재발했다(2026-08-25). 포커스만 되돌릴 땐 `focus(undefined, { scrollIntoView: false })`, 이미 포커스가 있으면 **호출조차 하지 마라**. ② **prosemirror의 `undo`/`redo`가 자기 트랜잭션에 `scrollIntoView()`를 붙인다** — `buildCommand(false, /* scroll */ true)`(`node_modules/prosemirror-history/dist/index.js:408,424~430`). `focus()`의 스크롤을 껐는데도 재발한 이유다. `@tiptap/pm/history`의 `undoNoScroll`/`redoNoScroll`을 직접 써라. ③ **💀💀 `scrollToTop`에서 DOM Selection을 건드리지 마라 — 심었다가 같은 날 되돌린 자리다.** `removeAllRanges()` → `addRange()` 사이 **선택 범위가 0개가 되는 순간** iOS가 캐럿이 사라진 걸로 보고 키보드를 닫는다 → 편집이 풀려 보기모드로 튕기고(`.postit-overlay` onClick이 `setPostitEditMode(null)`), `--kb-inset`이 326→0으로 떨어져 본문과 키보드 사이에 죽은 공간이 생긴다. **데스크톱 Chrome에서는 재현되지 않는다.** 지금은 `behavior: "auto"`만 남겼다(smooth는 실측상 **420ms 멈춰 있다가** 움직여서 그 창에 리플로우가 끼면 멈춘 채 남는다). ⚠️ 예전에 이 행에 **"커서가 살아 있으면 안 올라간다는 원인 미확정"**이라고 적혀 있었는데 **2026-08-26에 규명됐다 — 캐럿 소유자 문제가 아니라 위 "편집 스크롤러에 `onScroll`+`setState`" 행이다.** 캐럿이 안 보이면 `--kb-inset`부터, 스크롤이 안 먹으면 **리렌더부터** 의심해라. |
| **`getBoundingClientRect()`는 iOS에서 visual viewport 기준** | 보이는 영역과 비교할 때 `vv.offsetTop`을 **더하면 안 된다.** 밴드는 `0..vv.height`다. 이걸 더해서 "캐럿이 실제로는 보이는데 안 보인다"고 읽었고, 그 오독으로 3라운드를 페인트 문제로 헛짚었다. |
| **`showModal()` dialog는 top layer** | z-index를 아무리 올려도 일반 흐름 요소는 모달 **아래** 깔린다. 모달 위에 뭘 띄우려면 그 dialog 안으로 포털해야 한다. 진단 패널이 정작 필요한 화면에서 안 보였던 이유가 이것이다. |
| **키보드 위는 우리 영역이 아니다 — `position: fixed` 툴바 금지, `vv.height` 밖은 그릴 수 없다** | `bottom: keyboardInset` 자리는 브라우저 autofill 액세서리 바(`^ v ✓`)가 사는 자리다. 웹페이지가 없앨 수 없고 Chrome Android는 그 높이를 `vv.height`에 반영조차 않는다. **서식툴바는 본문 위 `position: sticky; top: 0`.** 그리고 액세서리 바는 `vv.height`가 **빼고** 준 영역 = 페이지 영역이 아니다 — 패딩을 줄이거나 `--kb-inset`을 작게 잡아도 **공간이 생기지 않고 글이 그 뒤로 숨는다.** (글 끝~키보드 여백은 24→4→2→**0**까지 내렸다. 0은 "키보드 경계에 딱 붙인다"는 뜻이고 그 아래로는 더 갈 곳이 없다.) 🔴🔴 **단, 그 띠의 *색*은 우리 것이다 — "못 건드린다"는 바의 *존재*에만 맞는 말이다(2026-08-28).** `theme-color`는 주소창뿐 아니라 **액세서리 바가 그려지는 띠까지** 칠한다. 다크의 `#0b0d19`가 그대로 나왔다(실측: 띠 `rgb(11,13,25)` == `#0b0d19`, **주소창도 같은 색**). 사용자가 "네이버 메모는 검은 게 안 뜬다"고 세 번 말했고 맞았다 — 네이버는 이 값이 밝거나 없다. 범위는 **모바일 메모 편집이 열려 있는 동안만** 라이트로 좁힌다(다크 전체를 밝게 하면 주소창까지 밝아지고 그건 의도가 아니다. 그 화면은 다크에서도 밝은 메모지다). ★ `theme-color` 쓰기 지점은 **Dashboard의 effect 하나뿐이다** — `toggleTheme`에도 같은 줄이 있어 두 벌이었고, 두 벌은 한쪽만 고쳐져 어긋난다. 새로 만들지 말고 그 effect를 고쳐라. |
| **sticky 부모 높이** | sticky는 자기 부모 박스 안에서만 따라다닌다. 부모를 `height: 100%`로 두면 한 화면분만 붙었다가 밀려 사라진다. 스크롤러 안쪽은 `height: auto` + `flex: 1 0 auto`. |
| **`display` 토글이 스크롤 콘텐츠를 밀어낸다** | 스크롤러 안, 스크롤 위치보다 **위**에 있는 요소를 `none↔block`으로 켜면 그 높이만큼 아래 전부가 밀린다. 포커스 시 툴바(39px)를 켜다가 "탭한 자리에서 수정이 시작 안 되는" 증상이 났다. 편집 모드에서는 툴바를 **항상** 띄운다. |
| **배경 스크롤 잠금** | 다이얼로그가 열려 있는 동안 `body { position: fixed; top: -scrollY }`. iOS는 `showModal()`로도 `overflow:hidden`으로도 배경 스크롤이 안 막힌다. (`Dashboard.tsx`의 `activeDialogKey` effect) |
| **`html.kb-open`** | CSS는 `var()` 값으로 분기할 수 없다. 키보드 상태는 `useViewportHeight`가 `html.kb-open` 클래스로도 내려준다 — 타이핑 중에만 여백을 줄이거나 요소를 접을 때 쓴다. |
| **`env(safe-area-inset-*)`는 cover가 꺼져 있으면 0** | `viewport-fit=cover`가 없으면 전부 0이다. 그 상태에서 safe-area를 더하거나 빼는 계산은 **아무 효과가 없다** — 그걸 "34px 되찾았다"고 착각한 적이 있다. 현재 cover는 꺼져 있다(`manifest.ts` 참고). |
| **🔴🔴 `!important`는 방패가 아니다 — `!important`끼리는 특이도가 정한다** | 이 파일은 `!important`가 많고, 새 규칙이 **아무 일도 안 하고 넘어간 일이 실제로 다섯 번** 있었다. `display:none !important`도 진다: 도움말에서 `.support-topic-open .support-dialog-head .close-btn { display:none !important }`(0,3,0)이 `dialog.support-dialog .support-dialog-head .close-btn { display:grid !important }`(0,3,1)에 져서 **✕와 ‹가 완전히 같은 자리에 겹쳐 떴다**(실측 375px: 둘 다 x=7, y=8, 40px). 사용자가 "뒤로가기가 2개"라고 한 게 이것이다. 나는 두 규칙을 **읽고도** 순위를 반대로 매겼다. **수정 전에 같은 셀렉터를 전부 grep해 최종 승자를 확인하고, 수정 후 computed value로 실제로 먹었는지 재라.** 그리고 검증할 때 `querySelector`(단수)로 내가 예상한 둘만 비교하지 마라 — 겹침을 보려면 `dialog[open] *` 전체에서 rect가 겹치는 것을 뽑아라. **다섯 번째(2026-08-27, 2주)**: iOS 화면 밀기 상쇄 `transform: translateY(var(--vv-push))`(`ae6d744`)에 `!important`가 없어서 **한 번도 적용되지 않았다.** 진 상대가 둘 — ① 5288절 `.postit, ..., .big-postit, ... { transform: none !important }`(포스트잇 기울임 제거용) ② `.postit.c1~c7 { transform: rotate(...) }`(0,2,0). 편집창 className이 `postit big-postit c3`(Dashboard.tsx:3571)이라 `.big-postit` 하나(0,1,0)로는 색상 클래스 조합조차 못 이긴다. 실측(iPhone Chrome): `껍데기 top -89 / vvTop 89` = 상쇄가 **정확히 0**. 그 2주 동안 나는 부호를 의심하고 값을 조정했다 — **틀린 건 값이 아니라 "이 선언이 이기고 있나"를 한 번도 안 잰 것이다.** 이 표 위쪽 "grep은 규칙이 있나만 답한다"가 정확히 이 사고를 예고하고 있었는데도 그랬다. 🔴 **새 `transform`/`display`/`padding` 규칙을 넣었으면 `getComputedStyle(el).transform`을 읽어라. `matrix(1,0,0,1,0,0)`이면 진 것이다.** 그리고 값이 CSS var면 **그 var 자체를 진단 패널에 찍어라** — `--vv-push`가 패널에 없어서 "push가 0인가 / 껍데기가 안 움직이는가"를 2주간 구분할 수 없었다(지금은 `VV-PUSH=` 행이 있다). |
| **거대 파일** | `Dashboard.tsx`(~290KB)와 `dashboard.css`(~390KB)는 grep으로 접근한다. 같은 셀렉터가 여러 media block에 흩어져 있다. |
| **목록·개수는 손으로 세지 말 것** | 주석에 적힌 목록은 오래되면 틀린다(실제로 PWA 확인목록 5개가 12개여야 했다). 세지 말고 뽑아라: `grep -o "env(safe-area-inset-[a-z]*)" src/app/dashboard.css | sort | uniq -c` |
| **하루 배치 상태는 테이블 두 개에 걸쳐 있다** | `assembleDailyJobs`는 `daily_jobs_run`(guard·selected_urls)과 `saved_job`(실제 공고 row) **둘 다** 쓴다. 한쪽만 지우는 롤백은 롤백이 아니라 **불일치 상태를 새로 만드는 것**이다. `daily_jobs_run`만 지웠더니 `saved_job`에 남은 삽입이 `loadPreviouslyRecommendedJobs`에 "이미 추천한 URL"로 읽혀 그날 신규 후보가 통째로 배제됐다 — 재수집이 STEP F(과거 재추천)로 떨어져 NEW 배지가 0개가 됐고, 배제된 공고는 고아 row로 남아 영구히 다시 추천되지 않는다(2026-08-25, `clearPreCronBatches`). 삭제 순서는 **`saved_job` 먼저**, 북마크(`is_bookmarked`)는 제외한다. |
| **🔴 이미지 뷰어는 투명을 흰색으로 보여준다 — PNG는 눈으로 보지 말고 픽셀을 재라** | 점핏 로고를 3라운드에 걸쳐 못 고친 단 하나의 이유다. PNG를 열면 "검은 카드 + **흰** 글씨"로 보이는데, 실측하면 **밝기 200 이상 픽셀이 0.0%**다. 워드마크가 카드에 뚫린 **구멍**(카드 내부 투명 픽셀 23%)이고 뷰어가 그 투명을 흰색으로 렌더한 것이다. 그래서 **글씨 색 = 박스 배경색**이고, 이걸 모른 채 박스를 `#0d0d0d`로 어둡게 하니 사용자 화면에서 "글씨가 더 까매졌다" — 내 수정이 증상을 정확히 악화시켰고 왜인지 몰랐다. **로고·아이콘 문제는 Pillow로 (a) 알파 분포 (b) 밝기 히스토그램 (c) 워드마크 bbox 비율을 먼저 재고, 알파 맵을 아스키로 찍어 글씨가 구멍인지 잉크인지 확인한다.** 그 다음에 CSS를 건드린다. |
| **투명 배경 PNG는 박스 배경이 로고의 일부다** | `public/logos` 실측 — 투명 배경: wanted 85%, jobkorea 80%, techcrunch 81%, arstechnica 83%, jumpit 29%. 불투명 자체 배경: aitimes·mit(흰), zdnet(`rgb(7,10,17)` 어두움). **투명 + 어두운 잉크** 조합은 다크 박스에서 반드시 묻힌다(techcrunch는 PNG 전체 최대 밝기가 **54**다). 그 로고들엔 `.row-logo-box.<slug>-logo`로 **불투명 흰 박스**를 준다. 자체 배경이 있는 셋은 붙이지 않는다 — zdnet은 어두운 배경이라 다크에 오히려 어울린다. |
| **로고가 작아 보이면 캔버스 여백을 재라** | 원본 PNG마다 워드마크가 캔버스에서 차지하는 비율이 다르다: wanted 5.27:1 가로형 → `scale(1.45)`, arstechnica 55.9%(여백 44%) → `scale(1.7)`, jobkorea 88.8% → `scale(1.12)`, techcrunch 89.8% → 보정 없음. `object-fit: contain`은 여백까지 포함해 맞추므로 44px 박스에서 워드마크가 24px로 쪼그라든다. **`1/bbox비율`이 딱 맞는 배수이고 `overflow:hidden`에 잘리지 않게 살짝 낮춘다.** |
| **로고 CSS가 안 먹으면 클래스가 붙는지부터 봐라** | `dashboard.css`를 grep해 `.jumpit-logo`가 없으면 "규칙이 없다"까지만 알게 된다 — 정작 문제는 `logoClass`가 JSX 삼항(`source_site === "원티드" ? "wanted-logo" : undefined`)이라 **점핏·잡코리아엔 클래스 자체가 안 붙던 것**이었다. 뉴스 쪽은 `logoClass`를 아예 안 넘기고 있었다. 이제 `JOB_SITE_LOGOS` / `NEWS_SOURCE_LOGOS`가 `{src, cls}` 맵으로 단일 source of truth다 — **로고를 추가하면 여기 cls를 넣어야 CSS가 붙는다.** |
| **chain은 한 덩어리다 — 앞이 실패하면 뒤도 죽는다** | `chain().focus().undo().run()`에서 `focus()`가 실패하면 `undo`까지 통째로 무효가 된다(모바일에서 버튼을 탭하면 에디터가 먼저 blur되고 그 상태의 프로그래매틱 포커스는 iOS에서 실패할 수 있다). 문서를 바꾸는 명령은 `editor.commands.X()`로 **먼저 확정**하고 포커스는 그 다음에 따로 시도한다. 명령은 boolean을 돌려주니 실패를 콘솔에 남겨라 — 침묵 지점을 만들지 마라. |
| **UI를 닫는 setState를 서버 왕복 뒤에 두지 마라** | "현재 커서 위치에 삽입"이 `setPendingInsert(null)`을 `await recordMemoSource(...)` 뒤에 두고 있었다. 출처 기록이 1~2초 걸리는 동안 버튼이 그대로 남아 사용자는 "안 눌렸다"고 보고 다시 눌렀고, 그만큼 **중복 삽입**됐다(실측: 클릭 1회로 이미 삽입됐는데 500ms 후에도 bar 잔존). 본작업이 끝났으면 UI를 먼저 닫고 부가 기록은 뒤에서 따로 보낸다. |
| **한국어는 `word-break: keep-all`이 없으면 단어 중간에서 끊긴다** | 기본값(`normal`)에서 "확인할 수 있습니/다", "핵심 요/약을"처럼 어절이 쪼개진다. 웹은 폭이 넓어 안 드러나고 모바일에서만 터진다 — 문구를 하나씩 손볼 문제가 아니라 컨테이너에 `word-break: keep-all` 한 줄이 답이다. 긴 URL 가로 넘침은 `overflow-wrap: break-word`가 "넘칠 때만" 끊어 막는다(1837절에 417px → 0px 실측 기록). 그리고 소스 문구에 **데스크톱 폭 기준으로 손으로 넣은 `
`**이 있으면 `white-space: pre-line`이 그걸 좁은 폭에서 엉뚱한 자리에 그린다 — 모바일에서 `pre-line`을 끄는 게 정답이다(SupportDialog.tsx 243곳을 고치는 게 아니다). |
| **🔴🔴 같은 ref를 여러 벌 마운트된 컴포넌트가 공유하면 "마지막 사본"이 이긴다** | `postitViewNode`는 Monthly MEMO·Key Notes·postitOnly 세 dialog에 **3벌** 그대로 들어 있었고(`<dialog>`는 닫혀 있어도 자식이 마운트된다), 셋이 같은 `detailEditorRef`를 공유했다. React는 마지막에 마운트된 것으로 ref를 덮으므로 **화면에 안 보이는 사본이 ref를 가져간다** — 그 에디터는 히스토리도 캐럿도 비어 있다. 실행취소/다시실행이 조용히 false로 끝나고, "현재 커서 위치에 삽입"이 보이지 않는 에디터에 들어갔다(실측 2026-08-25: `.postit-overlay.open .textarea-row` 3개의 clientHeight `[648, 0, 0]`, undo 클릭 후 본문 길이 3593 그대로). 1563절 주석이 정한 규칙(**열려 있는 다이얼로그 key 안에서만 렌더링**)이 `bigEditorNode`에만 적용돼 있었다 — 지금은 `postitHostDialogKey`로 `postitViewNode`도 하나만 마운트한다. **여러 dialog에 같은 노드를 넣을 때는 반드시 key 게이트를 붙여라. `confirmDialogNode`는 아직 3벌이다.** |
| **🔴🔴 특이도를 눈으로 세지 마라 — 타입 셀렉터와 `:not()`을 세 번 빠뜨렸다** | 이 표와 인계문서가 **같은 실수를 세 번** 했다. ① `html.kb-open .big-postit`을 (0,2,0)으로 적었는데 앞의 `html`이 **타입 셀렉터라 (0,2,1)**이다 — 그래서 파일 맨 끝에 둔 `.memo-edit-page.big-postit`(0,2,0)이 졌고, 모바일 편집 껍데기가 새 구조에서 쓰면 안 되는 `padding-bottom: var(--kb-inset)`을 먹었다(실측 `40px 16px 326px`). ② **`:not()`은 인자의 특이도를 그대로 갖는다** — `html:not(.kb-open) .big-postit .textarea-row .rich-editor-body-wrap`은 (0,3,0)이 아니라 **(0,4,1)**이라 `.memo-edit-page .rich-editor-body-wrap`(0,2,0)에 압승했고, 편집 진입 직후 본문 아래 **487px(60vh)** 빈 칸이 그대로 남았다. ③ `:has()`는 아래 줄. **세 경우 다 "파일 맨 끝에 뒀으니 이긴다"고 믿은 게 화근이다 — 소스 순서는 특이도가 같을 때만 쓴다.** 처방은 하나: 새 규칙을 넣었으면 화면을 열고 `getComputedStyle(el).<속성>`을 읽어라. 규칙이 있는지(grep)와 이기고 있는지(computed)는 다른 질문이다. |
| **🔴🔴 `:has()`의 특이도는 인자 중 가장 높은 것 하나다 — 같으면 뒤 규칙이 이긴다** | `dialog.glass-dialog:has(.big-postit) .dialog-inner { overflow: hidden }`(2987절)이 `dialog.glass-dialog:has(.editorial-head) .dialog-inner { overflow-y: auto }`(3278절)에 **파일 순서로 졌다**. 그래서 뉴스·채용·AI트렌드 위에 "메모로 복사"를 열면 기사 본문 높이를 가진 `.dialog-inner`(실측 375px: scrollHeight **3742** / clientHeight 812)가 **굴릴 수 없는 스크롤러**로 조상 체인에 남는다 — 포스트잇은 `position: fixed`라 그걸 굴려도 1px도 안 움직인다. 이게 "삽입 창에서 스크롤이 잠긴다"의 진짜 원인이고 undo/redo는 방아쇠일 뿐이었다(2026-08-25, 3라운드). **편집창을 열었으면 `.textarea-row`부터 `html`까지 조상 체인을 훑어 `scrollHeight > clientHeight && overflow-y:auto`인 요소가 몇 개인지 세라. 답은 항상 1이다.** |
| **원 안에 원을 넣을 때 flex는 `justify-content`까지 줘야 한다** | 데스크톱에서 아이콘·라벨·개수를 한 줄에 늘어놓던 flex 행(`padding: 0 14px 0 8px`)을 모바일에서 `width/height`만 주고 `padding: 0`으로 바꾸면, `justify-content`가 기본값 `flex-start`로 남아 **안쪽 원이 왼쪽에 붙는다**. `.project-status-summary` 실측: 바깥 42px / 안 30px인데 여백이 좌 1 · 우 11 · 위아래 6이었다(동심원이 아님). 라벨을 `display:none`으로 지웠으면 `justify-content: center`를 같이 넣어라. |
| **에디터 handle ref는 화면 수만큼 있다** | 메모 본문 에디터는 네 곳이다(포스트잇 상세 `detailEditorRef` / Monthly MEMO `compactEditorRef` / "메모로 복사" `bigEditorHandleRef` / 확장 `bodyEditorHandleRef`). `insertPendingAtCursor`가 앞의 둘을 후보에서 빠뜨려, 그 창이 떠 있으면 `target.current`가 null이라 `?.`에서 **조용히 아무 일도 일어나지 않았다**. 지금은 `activeMemoEditorRef()`가 위에 뜬 것부터 고르고, 하나도 못 고르면 콘솔에 상태를 남기고 사용자에게 알린다. |
| **`.postit-overlay`에 `data-memo-theme`이 없으면 다크 메모지가 통째로 죽는다** | 다크 메모지 8종 팔레트가 **전부 이 속성에 걸려 있다**(CSS 규칙 150개). 파일에 `.postit-overlay open`이 5곳인데, 실제 메모지(`.postit.big-postit`)를 그리는 둘에만 붙인다 — 나머지(프로젝트 템플릿·확인 팝업 `.copy-picker`)는 메모지가 아니라 붙이면 안 된다. `bigEditorNode`에 빠져 있어서 다크에서 "메모로 저장"이 라이트 메모지로 떴다(2026-08-25). |
| **다크 메모지의 배경은 2레이어다 — 첫 레이어만 읽으면 오독한다** | `getComputedStyle(...).backgroundImage`를 앞부분만 잘라 보면 `rgba(255,255,255,.38)` 유리 광택만 보여 "반투명 흰색"으로 읽힌다. 실제 색은 **둘째 레이어**(`rgba(227,223,175,.95)` 노란 유리)다. 즉 다크에서도 노란 유리 카드 + 어두운 글씨(`#282512`)가 정답이고, 위 "메모지는 다크에서도 밝은 유리 카드" 줄과 같은 얘기다. |
| **dev 서버가 옛 코드를 보고 있을 수 있다** | 이 환경은 HMR websocket이 자주 죽는다(콘솔에 `ws://localhost:3000/_next/hmr ... failed`). 그러면 파일을 고쳐도 화면과 에러가 갱신되지 않는다 — 실제로 이미 고친 정규식의 파싱 에러를 계속 봤다. **`npx next build`가 통과하는데 dev만 실패하면 캐시다**: 서버를 재시작하고 `.next`를 지워라. 반대로 CSS는 별도 파일이라 HMR 없이도 반영될 수 있어, JSX 수정은 안 먹고 CSS만 먹은 어긋난 상태가 나온다.🔴🔴 **그리고 dev가 떠 있는 동안 `npx next build`를 돌리면 dev가 걸린다 — 2026-08-28에 이걸로 로컬 검증 수단을 통째로 잃었다.** 둘이 **같은 `.next`를 쓴다.** build가 dev의 컴파일러 상태를 덮어쓰면 dev는 죽지 않고 **멈춘다**, 그래서 증상이 헷갈린다: `netstat`은 **LISTENING**인데 `curl --max-time 25 localhost:3000`이 **000**(타임아웃)이다. 이번 세션에 build를 6번 돌렸고 그 뒤로 localhost가 안 열렸다. 💀 **브라우저 패널이 300초 타임아웃으로 죽은 것도 같은 원인이었는데, 나는 "패널이 화면에 안 떠 있어서 프레임이 없다"고 오진하고 로컬 검증을 포기했다** — 그 오진이 그대로 보고서에 들어갔고, 8라운드 동안 추측만 한 원인의 절반이 이것이다. ✅ 규칙: 코드 검증은 `npx tsc --noEmit` + `npm run check`로 한다(`.next`를 안 건드린다). `next build`가 정말 필요하면 **dev를 먼저 내려라**(배포 전 확인은 push 후 Vercel 빌드로 대신할 수 있다). 로컬 화면 확인은 **build 전에** 해라 — 순서를 거꾸로 하면 확인 수단을 잃는다. 복구: `taskkill //PID <3000의 PID> //F` → `rm -rf .next` → `npm run dev`. **"안 열린다"를 "죽었다"로 읽지 마라 — 걸린 것이다.** |
| **🔴 화면 하나에 규칙을 걸 때 조상 셀렉터를 `dialog`까지 올리지 마라 — 그 dialog엔 다른 표면도 들어 있다** | `dialog.monthly-memo-dialog.memo-compose-open .mini-date-trigger { background: none !important }`은 "Create 입력칸을 메모지에 녹인다"는 규칙인데, 같은 dialog의 자식으로 **모바일 "메모 설정" 바텀시트**(`.mobile-memo-options-sheet`)가 같이 들어 있다. 그래서 시트 안의 시작일/종료일 칸까지 납작해져서 **같은 시트인데 포스트잇 수정에서는 칸이 보이고 Create에서만 안 보였다**(실측 2026-08-26 다크: 배경 postit `rgba(18,22,40,.75)` vs compose `rgba(0,0,0,0)`, 좌표·크기는 94×29로 완전히 동일). 포스트잇 쪽은 `.big-postit`으로 범위를 좁혀 같은 사고를 피하고 있었다. **범위는 그 화면의 실제 컨테이너(`.memo-form` / `.big-postit`)까지만 좁혀라.** |
| **🔴 메모지 색은 세 벌이다 — 하나를 칠하면 나머지 둘을 반드시 같이 세라** | 메모 8종 색이 **세 군데**에 있다: ① 포스트잇 `.postit` / `.keynote-sticky`(다크는 8-B 팔레트) ② **모바일** Create `.monthly-memo-dialog.memo-compose-color-* .dialog-inner`(≤720px) ③ **웹** Create `.monthly-memo-dialog.memo-compose-color-* .memo-form.open`(≥721px — 웹은 작성 중에도 달력·목록이 남아 있어서 `.dialog-inner`를 칠하면 달력까지 물든다). ②③ 둘 다 라이트 팔레트만 있고 다크가 0개여서 다크에서 Create가 라이트 메모지로 떴다. **2026-08-26에 ②만 고치고 보고했다가 "웹도 마찬가지"로 되돌아왔다** — 셀렉터가 달라서 grep이 안 걸렸다. 새 값을 정하지 말고 **8-B와 같은 값**을 쓴다(여기서 따로 정하면 네 벌이 된다). 🔴 **그리고 "새 메모의 기본색"은 또 다른 셋이었다**(2026-08-30): 클라이언트 `openCreateMemoForm`의 `setFormColor` / **서버** `saveBlockToMemo`의 `color:`(뉴스·채용·AI트렌드 "메모로 저장 → + 새 메모 생성"이 전부 이 한 함수를 지난다) / `useState` 초기값. 지금은 `src/lib/memo/types.ts`의 **`DEFAULT_MEMO_COLOR` 한 벌**이고, 기본색을 바꾸라는 요청이 오면 **거기만** 고쳐라. |
| **🔴🔴 속성 셀렉터가 **자손 결합자**면 그 속성은 "래퍼용"이다 — 구조를 옮겨 래퍼가 사라지면 조용히 죽는다** | 다크 메모지 8종 팔레트는 전부 `[data-theme="dark"] [data-memo-theme="dark"] .postit.cN` **자손 결합자**다. 그런데 구조 이전으로 만들어진 편집 페이지 세 노드는 `<div class="memo-edit-page postit big-postit c6" data-memo-theme="dark">`처럼 **속성과 `.postit`을 같은 요소에** 갖는다 — 조상이 없으니 영원히 매치 안 된다. 그래서 다크에서 세 편집 화면이 전부 **라이트 메모지**로 떴다(실측 2026-08-30: `matches(...)` **false**, 적용 배경 `linear-gradient(160deg, rgb(253,246,220), rgb(251,233,184))` = 라이트 값). 옛 구조(`postitViewNode`)는 `.postit-overlay` **래퍼**에 붙여서 맞았고, 래퍼를 없앨 때 "이 속성은 래퍼용"이라는 사실이 같이 빠졌다. **처방은 조상 한 곳** — `.sp-body`에 편집 중에만 붙인다(실측: 새로 매치되는 요소가 **편집 페이지 자신 1개뿐**. 나머지 postit은 이미 자기 조상에 갖고 있다). 💀 **셀렉터 175개를 "붙여 쓰기"로 복제하지 마라** — 4029절이 dialog에서 그렇게 푼 건 대상이 **하나**여서 가능했던 것이고, 여기서 따라 하면 8색 × 규칙 수만큼 벌이 늘어 팔레트가 바뀔 때마다 어긋난다. 🔴 점검 1줄: `grep`은 "속성이 붙어 있나"만 답한다 — **`el.matches('<전체 셀렉터>')`를 재라.** 그리고 **다크 팔레트를 살렸으면 "이 화면은 다크에서도 밝은 메모지다"를 전제로 라이트를 하드코딩한 보정을 전부 세라** — `globals.css`의 `html:has(.memo-edit-page){color-scheme:light}`와 theme-color `#d9cbff` 둘이 그것이었고, 블랙 메모지에서는 **밝은 브라우저 표면 = 검은칸(11-20)의 부호만 뒤집은 같은 버그**다. 색을 새로 정하지 말고 **메모지 아랫변 색 하나(`solid`)에서 파생**시켜라(배경 복사·`--memo-canvas`·theme-color·color-scheme 넷이 그 한 값을 쓴다). 경위는 docs/incidents.md 11-26절. |
| **하드코딩 `\n` + `white-space: pre-line`은 도움말에 두 군데 있다** | 문구의 손으로 넣은 개행은 데스크톱 폭 기준이라 모바일에서 엉뚱한 자리에 그려진다. 4899절이 **상세** 문구(`.help-detail .idea-section-body`, `.help-detail-list li`)에만 `white-space: normal`을 넣어놨고 **카드 설명(`.help-feature-copy span`)은 빠져 있었다** — Key Notes가 375px에서 3줄(61px)이 되며 "…Key Notes에 기록하고 / 관리하세요."로 끊겼다. `normal`로 바꾸니 카드 8개 전부 2줄(41px), Key Notes는 "…Key Notes에 / 기록하고 관리하세요."로 자연스럽게 끊긴다. **`grep -n "pre-line" src/app/dashboard.css`로 남은 곳을 세라.** |
| **`<dialog>` 안에서 화면이 바뀌면 스크롤러를 손으로 0으로 돌려라** | `<dialog>`는 닫혀도 자식이 마운트돼 있어 `scrollTop`이 저절로 안 돌아간다. 도움말은 화면이 셋(목록/상세/의견·버그 문의)인데 스크롤러는 `.support-dialog-body` 하나라, 목록을 내려서 고른 상세가 "중간부터" 열렸다. Dashboard의 `useScrollTopButton.resetScroll`과 같은 처방이다 — **다만 `openHelp()`처럼 setState가 같은 값이면 effect가 안 도는 경로는 직접 0을 넣어야 한다.** |
| **🔴🔴 `<dialog>`는 우리 `close()`를 안 거치고도 닫힌다 — 배경 스크롤 잠금이 영원히 안 풀린다** | Esc·안드로이드 하드웨어 뒤로가기·OS의 top layer 정리로 닫히면 `activeDialogKey`가 남아 잠금 effect의 cleanup이 안 돌고, `body`가 `position: fixed; top: -Ypx; overflow: hidden`인 채로 굳는다. body의 `overflow:hidden`은 **뷰포트로 전파**되므로 문서 스크롤이 통째로 죽고 본문은 `top:-Y`에서 잘린다(실측 prod 375×684, 1200px 스크롤 후 Esc: `scrollHeight` 2644→**684**, `scrollTo(0,99999)` 후에도 `scrollY` **0**). `onCancel`을 단 다이얼로그도 **조건이 안 맞으면 그대로 native close로 간다.** 다이얼로그마다 `onClose`를 다는 대신 **`close` 이벤트를 document에서 캡처 단계로** 받는다(`close`는 버블링 안 하지만 캡처는 target까지 내려온다). 반드시 `setActiveDialogKey(cur => cur === key ? null : cur)` 가드를 둘 것 — `close` 이벤트는 **비동기**라 `close()` 직후 다른 dialog를 `open()`하는 경로(`expandPostitView`/`closePostitView`)에서는 이미 새 key가 들어가 있다. |
| **🔴 "느리다/렉"이면 UI를 닫는 코드가 서버 왕복 **뒤에** 있는지부터 봐라** | 세 back 핸들러(`handlePostitBack`/`handleMemoDialogBack`/`handleProjectDetailBack`)가 전부 `await updateMemo` + `await refreshAfterMemoChange`(그 안에서 또 1~2왕복)를 기다린 **다음에야** 창을 닫았고, Monthly MEMO는 거기에 `await sleep(520)`까지 있었다. 실측(prod, localhost): 고친 뒤 클릭→닫힘 **48ms**, 저장 왕복은 그 뒤 720ms까지. 실기기 셀룰러면 체감 1~2초다. **폼 값을 스냅샷으로 뜨고 → 로컬 목록을 낙관적으로 갱신하고 → 창을 닫고 → 저장은 뒤에서** 보낸다. 이 규칙은 이미 표에 있었는데(아래 "UI를 닫는 setState…") 저장 버튼 경로에만 적용돼 있었다 — **같은 규칙을 어기는 형제 경로를 전부 세라.** |
| **🔴 팝오버 z-index는 그 화면의 sticky 툴바보다 커야 한다 — 그리고 형제를 다 세라** | `.mobile-rich-toolbar`가 `position: sticky; z-index: 240`이라, 메타 행에서 열리는 팝오버가 **툴바 뒤에 그려진다.** `.memo-type-panel`(유형: Free Note/Dev Note/Todo)이 기본값 **20**이라 정확히 그랬다(실측 375×684 포스트잇 확장 편집: 툴바 y 139..178 / 패널 y 140..273, 겹치는 y=150의 `elementsFromPoint`가 `mobile-rich-toolbar` → `memo-type-panel` 순). **이미 같은 사고가 한 번 있었고 그때 `.emoji-popup`·`.link-popover`만 260으로 올렸다** — 형제를 다 안 센 결과가 이 재신고다. 툴바 **안**에서 열리는 메뉴(`.toolbar-menu`, `.mobile-font-size-menu`)는 툴바가 만든 쌓임 맥락 안이라 괜찮고, **바깥**에서 열리는 것만 240 위로 올린다. 점검은 눈이 아니라 겹치는 좌표의 `elementsFromPoint`로. |
| **🔴 브라우저 패널이 화면에 안 떠 있으면 스크롤·애니메이션을 한 번도 못 잰다** | 패널이 숨겨져 있으면 페이지가 프레임을 안 그린다. `requestAnimationFrame`이 **한 번도 안 돌고**, `el.scrollTop`을 바꿔도 **scroll 이벤트가 안 뜬다**(실측 2026-08-26: `scrollTop 0→600`인데 리스너 호출 **0회**). 즉 `behavior:"smooth"`·`is-visible` 토글·캐럿 추적·입력 지연은 **전부 검증 불가**다. 이걸 모르고 "재현 안 됨"이라고 쓰면 거짓 음성이 그대로 보고가 된다. **스크롤/애니메이션이 걸린 신고를 받으면 먼저 `computer{action:"screenshot"}`을 찍어보고, 실패하면 사용자에게 패널을 열어달라고 요청하라.** 좌표·computed style은 프레임 없이도 정확히 재진다. |
| **내가 바꾼 것을 재는 건 검증이 아니다** | 위 건에서 실측을 다섯 번 하고 전부 통과했는데 **다섯 번 다 내가 지운 테이블 하나만** 쟀다. 화면에 뜨는 공고는 다른 테이블에서 나온다. **사용자가 보는 화면(뜬 공고 4건 + 배지)에서 시작해 거꾸로 짚어라.** 그리고 같은 세션에서 만든 관측 수단(관리자 페이지 판정 등)으로 자기 수정을 검증하지 마라 — 내가 상상한 실패 모드만 본다. |

> 이 표의 각 줄은 실기기에서 실제로 터진 것이다. 전체 경위와 왜 5라운드 동안 못 잡았는지는
> [docs/mobile-pwa-postmortem.md](docs/mobile-pwa-postmortem.md)에 있다. 비슷한 증상이면 그걸 먼저 읽어라.

## 4. 하지 말 것

- 이상한 우회 코드, 중복 상태, 중복 컴포넌트, 불필요한 파일, 임시 CSS
- 원인을 모른 채 `top`/`bottom`/`height` 숫자를 계속 바꾸는 것
- 이유 없는 `setTimeout` 추가
- 버그 하나를 고치려고 전체 레이아웃을 바꾸는 것
- 이 문서를 억지로 맞추기 위한 과도한 환경 분기

## 5. 보고 형식

긴 보고서 금지. 다음만 짧게:

1. 무엇을 바꿨는지
2. Web / Mobile / PWA에서 각각 어떻게 동작하는지
3. 새로 분기한 부분이 있다면 왜 필요했는지
4. **직접 검증하지 못한 부분** — 여기가 제일 중요하다
5. 기존 기능에 영향을 줄 가능성

### 검증은 반드시 구분해서 쓴다

실제 iPhone / Android / 설치형 PWA를 여기서 실행할 수 없다. 추측으로 "수정 완료",
"검증 완료"라고 쓰지 않는다.

```
Web:              브라우저에서 직접 확인 완료
Mobile viewport:  로컬 확인 완료
iOS 키보드:       코드 검토만 — 실기기 확인 필요
PWA standalone:   구조상 대응 — 설치 환경 확인 필요
```
## 6. 같은 버그를 2번 이상 고쳤는데 안 잡히면

증상별 패치를 더 쌓지 말고 `/debug-hard` 를 실행한다. 근본 원인 진단 절차가 들어 있다.

## 7. 🧯 "스크롤 잠김" 접수 시 — 코드 열기 전에 이 순서로 (2분)

**7라운드를 태운 뒤 만든 절차다. 전체 경위는 [docs/incidents.md](docs/incidents.md) 11-8절.**

### 0단계. 손으로 재기 전에 **불변식부터 읽어라** (2026-08-27 추가)

레이아웃에만 자동 검사가 **하나도 없어서** 사용자가 테스트 스위트 노릇을 하고 있었다 — 왕복 한 번에
몇 시간이 걸리고 그 사이 나는 추측했다. 같은 증상을 10라운드 넘게 고친 진짜 이유가 이것이다.

```bash
npm run check:layout    # 판정 로직 자체가 맞는지 (노드, 브라우저 불필요)
```

**실제 화면 판정은 `?debug=vp` 패널 맨 윗줄에 뜬다** — 깨진 게 있으면 이름과 수치가 바로 나온다:

```
❌ 불변식 1개 깨짐
   ✗ 덮는 높이 ≤ scrollMargin.top — 덮음 136 / 마진 48
```

불변식 7개(`src/lib/layout-invariants.ts`): 스크롤러 1개 · 유령 스크롤러 0개 ·
덮는 높이 ≤ `scrollMargin.top` · 껍데기가 `--kb-inset`을 먹음 · 스크롤러 아랫변 == 키보드 상단 ·
**껍데기 아랫변 == 보이는 아랫변** · **키보드 전 스크롤 여유 있음**(WebKit #191204 승격 방지). **아래 3단계 표를 손으로 재는 것보다 이게 먼저다.**
새 증상을 고쳤으면 **불변식을 하나 늘려라** — 그래야 다음에 사용자가 아니라 검사가 잡는다.

> **"스크롤 잠김"은 하나의 버그가 아니다.** 손끝에 똑같이 느껴지는 서로 다른 원인이 최소 다섯이고,
> 실제로 다섯이 **동시에** 있었다. 하나를 고치고 "원인을 찾았다"고 쓰면 사용자는 같은 증상을 다시 본다.

**0. 어디서 보는지 먼저 묻는다** — 로컬 dev / 배포 / 설치형 PWA.
   배포면 내 uncommitted 수정은 그 화면에 **존재하지 않는다.** 고치고 푸시한 뒤 커밋 해시와 함께 보고한다.

**1. 뷰포트를 실기기 크기로.** `375 x 684`. **812로 재면 잘림이 재현되지 않는다** — 여유가 100px 넘게 남는다.
   글씨 크기 드롭다운이 812에선 "정상", 684에선 34px 잘림으로 결론이 반대로 나왔다.

**2. 키보드를 주입한다.** 데스크톱엔 키보드가 없어서 이걸 안 하면 키보드 경로를 **한 번도** 못 잰다.
```javascript
const r = document.documentElement;
r.style.setProperty("--kb-inset", "326px");   // 실기기 실측
r.style.setProperty("--app-vh", "358px");     // 684 - 326
r.classList.add("kb-open");
```

**3. 다섯 경로를 전부 잰다.** 하나만 보고 끝내지 마라. 안 잰 항목은 보고에 "안 쟀음"이라고 쓴다.

| # | 경로 | 어떻게 재나 | 정상값 |
|---|---|---|---|
| a | 조상에 굴릴 수 없는 스크롤러 | `.textarea-row`(또는 `.dialog-body-scroll`)부터 `html`까지 훑어 `overflow-y:auto && scrollHeight>clientHeight`인 것을 센다 | **1개** |
| b | 유령 스크롤러 | `auto`인데 `scrollHeight-clientHeight<=2`이고 `clientHeight>0`인 것 (열린 dialog 안) | **0개** |
| c | ref가 안 보이는 사본을 가리킴 | 같은 노드가 여러 `<dialog>`에 중복 마운트되지 않았나. `<dialog>`는 닫혀도 자식이 살아 있다 | **1벌** |
| d | 껍데기가 `--kb-inset`을 안 먹음 | `grep -n "kb-inset" src/app/dashboard.css` | 편집 껍데기 **3개 전부** 나와야 한다 |
| e | 버튼이 포커스를 뺏어 리플로우를 냄 | 편집창 안 버튼 전부에 `onPointerDown preventDefault`가 있나 | **전부** |

**4. 그래도 안 잡히면 실기기.** 배포 URL 뒤에 `?debug=vp`. 사용자에게 스크린샷을 부탁하고 이 셋을 읽는다.
   `KB-INSET`(0이면 d가 죽은 것) / `vvTop`(0이 아니면 iOS가 화면을 밀고 있다) / `굴릴 수 없는 스크롤러` 목록.

### 이 절차를 만들게 한 실패들 (요약)

- **증상 하나에 원인 하나를 가정했다** — 6라운드 연속으로 진짜 버그를 하나씩 고치고도 증상이 남았다.
- **6라운드 동안 812로 쟀다** — 실기기 값 684는 이 문서와 `useViewportHeight.ts` 주석에 이미 적혀 있었다.
- **키보드 문제인데 `useViewportHeight.ts`를 5라운드까지 안 열었다** — 열자마자 결함이 나왔다.
- **"재현 안 됨"을 결론으로 썼다** — 잘 돌아가는 형제 화면과 CSS를 비교했으면 1분이었다(`grep -n "kb-inset"`).
- **사용자가 누른 것(undo/redo)과 증상을 연결했다** — 그건 방아쇠였고 잠금은 그 전부터 있었다.
- **내 수정이 사용자 화면에 없었다** — 전부 uncommitted였고 사용자는 배포본을 보고 있었다.
