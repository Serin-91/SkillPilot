# 규칙 — 레이아웃 / 뷰포트 / 키보드 / 스크롤

`src/app/*.css` · `src/lib/useViewportHeight.ts` · `src/lib/layout-invariants.ts` 를 만질 때 읽는다.
각 줄은 실기기에서 실제로 터진 것에서 나온 규칙이다. 경위·실측은 `docs/incidents.md`.

## 편집 껍데기

- **키보드 몫을 비워야 하는 편집 껍데기는 4개다** — `.big-postit` · `.memo-form` ·
  `.dialog-inner` · `.proj-detail-inner`. 정본은 `src/lib/layout-invariants.ts`의 `shell` 셀렉터다.
  **개수를 문서에서 읽지 말고 그 파일에서 읽어라.**
- `.body-editor`에 `--kb-inset` 규칙을 실기기 확인 없이 넣지 마라 — 다섯 번째 껍데기를 만드는 일이다.
- `.proj-edit-page` / `.memo-edit-page`에 `position: fixed` · `height: var(--app-vh)` ·
  `overflow` · `var(--kb-inset)` padding을 걸지 마라. 옛 구조 4조건이 되살아난다.
- `.proj-edit-page .mobile-rich-toolbar`의 `top`을 덮어쓰지 마라 — 메모 규칙에 지고,
  이기려고 `html`을 붙이면 그 순간 프로젝트만 메모와 달라진다.
- 편집 화면을 "일반 페이지"로 옮길 때 `<div>`로 바꾸지 마라 — 셀렉터가 `dialog`에 묶여 있다.

## 뷰포트 단위

- **뷰포트 단위(`vh`/`svh`/`lvh`/`dvh`)를 바닥(`min-height`)으로 쓰지 마라** — 키보드 분기도 예외가 아니다.
- iOS에서 `svh`/`lvh`/`dvh`는 `window.innerHeight`와 **같지 않다.** 보이는 높이가 필요하면 `--app-vh`.
- iOS는 키보드가 올라와도 `100dvh`를 줄이지 않는다. 가린 높이는 `--kb-inset`.
- `--app-vh`를 `min(vv.height, innerHeight)` 같은 식으로 바꾸지 마라 — 여러 화면이 공유하는 값이다.
  튐은 값을 보정하지 말고 **이벤트를 버려서** 막는다(`isSpikedViewportHeight`).
- 튄 값 방어를 넣었으면 그 값에서 **파생되는 형제 전부**에 걸어라. 하나만 막으면 나머지로 샌다.
- `calc(100dvh - 126px)` 같은 매직넘버 금지. flex/grid · `min-height: 0` · `overflow` ·
  `min/max-width` · `env(safe-area-inset-*)` · breakpoint를 먼저 쓰고 남은 공간은 브라우저가 계산하게 둔다.
- `env(safe-area-inset-*)`는 `viewport-fit=cover`가 꺼져 있으면 0이다.

## 스크롤

- **스크롤러는 하나만.** 조상에 굴릴 수 없는 스크롤러가 둘이면 손끝에서 "잠김"으로 느껴진다.
- 편집 스크롤러에 `onScroll` + `setState`를 달지 마라 — 그게 캐럿을 죽인다.
- `vv.offsetTop`(iOS 화면 밀기)은 고칠 대상이 아니라 **증상**이다. 원인은 "내부 스크롤러에
  굴릴 것이 없음"(WebKit #191204). 키보드 전에 스크롤 여유를 남겨라.
- `overflow`를 한 축만 적으면 반대 축이 `auto`로 승격된다. 두 축을 같이 적어라.
- `overflow: hidden`은 iOS에서 문서 스크롤을 막지 못한다. 잠금을 믿지 말고 되잡아라.
- `<dialog>`는 우리 `close()`를 안 거치고도 닫힌다(ESC·backdrop) — 배경 스크롤 잠금이
  영원히 안 풀릴 수 있다. cleanup을 `close` 이벤트에 걸어라.
- `<dialog>` 안에서 화면이 바뀌면 스크롤러를 손으로 0으로 돌려라.
- `display` 토글은 스크롤 콘텐츠를 밀어낸다.
- 문서가 스크롤러인 페이지에서는 `useScrollTopButton`이 영원히 안 뜬다.
- 화면 순서를 들고 있는 로컬 스냅샷은 **그 스냅샷을 찍은 집합이 바뀌면 버려라** —
  안 버리면 서버가 바꾼 순서를 화면이 옛 index로 덮는다.

## 위치 / 겹침

- `scrollMargin.top`은 고정값이면 안 된다 — 덮는 것이 `absolute`면 높이에 안 잡힌다.
- `backdrop-filter`는 computed `transform: none`이어도 fixed 자손의 컨테이닝 블록을 만든다.
  `transform`을 대상으로 하는 `animation`/`transition`도 마찬가지다.
  그리고 미니파이어가 `-webkit-` 접두만 남기는 경우가 있다.
- 키보드 위는 우리 영역이 아니다 — `position: fixed` 툴바 금지, `vv.height` 밖은 그릴 수 없다.
- `showModal()` dialog는 top layer다. `getBoundingClientRect()`는 iOS에서 visual viewport 기준이다.
- 팝오버 `z-index`는 그 화면의 sticky 툴바보다 커야 한다 — 그리고 형제를 다 세라.
- 하단 여백을 비우는 `bottom` 값은 그 버튼 행이 실제로 보일 때만 맞다.
- sticky 부모의 높이를 확인해라.
- 같은 화면의 형제 요소에 보정이 붙어 있으면 나머지 요소도 **하나씩** 세라.
- 구조를 바꿨으면 옛 구조를 전제로 한 보정을 **전부** 세라.

## 특이도 / 색 / 경계

- **특이도를 눈으로 세지 마라** — 타입 셀렉터와 `:not()`을 빠뜨린다.
  `!important`는 방패가 아니다. `!important`끼리는 특이도가 정한다.
  `:has()`의 특이도는 인자 중 가장 높은 것 하나이고, 같으면 뒤 규칙이 이긴다.
- 속성 셀렉터가 **자손 결합자**면 그 속성은 "래퍼용"이다 — 구조를 옮겨 래퍼가 사라지면 조용히 죽는다.
- 한 화면에 규칙을 걸 때 조상 셀렉터를 `dialog`까지 올리지 마라 — 그 dialog엔 다른 표면도 들어 있다.
- 노드를 `<dialog>` 밖으로 옮길 때는 그것이 상속받던 공용 규칙까지 세라.
- **`body` 배경을 인라인으로 칠하지 마라** — 다이얼로그 잠금 cleanup이 되돌린다.
  "하단에 검은칸" = `body` 배경색이다. theme-color도 액세서리 바도 아니다.
- 브라우저 자기 표면(키보드 위 영역 등)의 명암은 **루트의 `color-scheme`**이 정한다.
  하위 요소에 걸면 안 먹는다.
- "경계선이 보인다"에 배경/페이드로 답하지 마라 — `border`는 background **바깥**에 그려진다.
  그리고 `box-shadow`가 테두리처럼 보인다.
- 다크에서 "작아 보인다"는 대개 크기가 아니라 경계 문제다.
- 한국어는 `word-break: keep-all`이 없으면 단어 중간에서 끊긴다.
- 모바일 문구는 눈으로 정하지 말고 **칸 폭을 재고** 정해라 — 잘린 자리는 "경계선"으로 신고된다.
- 같은 기능 버튼이 화면마다 크기가 다르면 사용자가 바로 알아본다.

## 측정

- `npm run check:layout`으로 판정 로직을 검사한다. 브라우저에서 실제 화면을 재려면
  `src/lib/layout-invariants.ts`의 `measureEditor()`/`judge()`를 콘솔에서 직접 부른다
  (상시 진단 패널은 없다 — 2026-09-14에 제거했다).
  새 증상을 고쳤으면 **불변식을 하나 늘려라**.
- 불변식이 **옛 구조 전제** 위에 있으면 고쳐진 상태를 "깨짐"으로 찍는다. 거짓 실패는 검사가 없는 것보다 나쁘다.
- 로컬 뷰포트는 **375 x 684**로 맞춰라. 812로 재면 잘림이 재현되지 않는다.
- 로컬 computed로 못 가리는 값이 있다 — 배포본 CSS를 `curl`로 받아 소스 순서로 훑어라.
- CSS를 고쳤으면 `tsc`가 아니라 **브라우저**를 열어봐라 — 문법 오류를 아무것도 안 잡는다.
- 브라우저 패널이 화면에 안 떠 있으면 스크롤·애니메이션을 한 번도 못 잰다.
