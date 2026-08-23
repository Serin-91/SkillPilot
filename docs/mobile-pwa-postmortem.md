# 모바일/PWA 메모 편집 — 포스트모템 (2026-08-22 ~ 08-24)

한 증상을 11라운드에 걸쳐 고쳤다. 원인이 **5개 겹쳐 있었고**, 상위 원인이 하위 원인을
가리고 있어서 하나를 고쳐도 증상이 그대로였다. 이 문서는 그 경위와, 다음에 같은 함정을
피하기 위한 판단 규칙을 남긴다.

규칙 요약은 [CLAUDE.md](../CLAUDE.md) 3절 지뢰 표에 있다. 이 문서는 **왜 그렇게 오래
걸렸는지**를 다룬다.

---

## 1. 증상 (사용자가 본 것)

- 메모 본문 **상단**을 탭하면 정상. **중간·하단**을 탭하면 위로 스크롤이 안 되고 막힌다
- 그때 고정 서식툴바가 보이지 않는다
- 먼슬리 메모 상세를 드래그하면 창이 이리저리 끌려다닌다
- 옆으로 끌면 다른 달 달력이 나온다
- 편집 중에 갑자기 뒤로가기가 된다
- 탭하면 아래 내용이 다 잘렸다가 스크롤하면 다시 나온다
- 탭한 자리에서 수정이 시작되지 않는다

**하나의 버그처럼 보였지만 서로 다른 원인 5개였다.**

---

## 2. 실제 원인 5개 (발견 순서)

| # | 원인 | 커밋 | 이게 만든 증상 |
|---|---|---|---|
| 1 | `.rich-editor-content`의 `overflow-x: auto` → 세로축 승격 → 굴릴 수 없는 스크롤러 | `06691db` | 터치가 죽은 스크롤러에 먹힘 |
| 2 | `.big-body`에 같은 버그 | (동일 커밋) | 읽기 뷰 스크롤 끊김 |
| 3 | 입력칸 14/15px → iOS 자동 확대 → 화면 패닝 | `e0e73d7` | 창이 끌려다님, 툴바 사라짐 |
| 4 | **`--kb-inset`이 항상 0** (`innerHeight - vv.height`가 이 iOS에서 항상 0) | `cd44a24` | **최상위 원인.** 편집창이 키보드 뒤까지 늘어남 → iOS가 화면을 밀어버림 |
| 5 | `.dialog-inner`의 `overflow-y: auto` → 가로축 승격 → 3px 넘침 | `2a910b1` | 옆으로 끌림, 옆 달 달력, 뒤로가기 충돌 |

그리고 4번을 고치자 그 아래 깔려 있던 문제들이 **새로** 드러났다:

| # | 후속 원인 | 커밋 |
|---|---|---|
| 6 | iOS의 화면 밀기와 우리 패딩이 **이중 보정** | `2a910b1` |
| 7 | 캐럿 노출 주체가 0개가 됨(중복 제거 + 밀기 취소를 연달아 함) | `a5022d4` |
| 8 | 포커스 시 툴바 `display` 토글이 스크롤 콘텐츠를 39px 밀어냄 | `25ceca1` |

---

## 3. 왜 5라운드 동안 못 잡았나

### (1) 검증 안 된 주석을 믿었다 — 최대 원인

`useViewportHeight.ts`에 이렇게 적혀 있었다:

> innerHeight가 곧 레이아웃 뷰포트 높이라 이 뺄셈이 정확하다

**이 문장이 거짓이었다.** 이 iOS는 키보드가 열릴 때 `innerHeight`도 `vv.height`와 똑같이
줄인다(684→358 / 684→358). 뺄셈은 영원히 0이고, `--kb-inset`은 **한 번도 0이 아닌 값을
가진 적이 없었다.** 그런데 CSS 43곳이 그 값을 믿고 padding·height·스크롤 범위를 잡고 있었다.

> **교훈: 가정에서 유도한 값이 레이아웃의 기준이 되면, 그 값 자체를 화면에 띄워라.**
> 그 아래로 내려가서 padding을 만지는 건 전부 추측이다.

같은 함정을 이 세션에서 두 번 더 밟았다 — PWA 확인목록이 5개라고 적혀 있었지만 실제로는
12개였고(`e1d8d23`), safe-area 34px을 되찾았다고 썼지만 cover가 꺼져 있어 `env()`가 0이라
아무 효과가 없었다.

### (2) 로컬에서 재현할 수 없는데 코드만 보고 5번 고쳤다

Chrome 데스크톱은 iOS 키보드·visual viewport 동작을 재현하지 못한다. 그런데 진단 패널을
**5라운드가 지나서야** 만들었다. 그 전 수정들은 전부 실제 버그였지만 — 셋 다 실측으로
확인된 진짜 결함이었다 — **어느 것도 그날의 증상을 설명하지 못했다.**

### (3) 계기(진단 패널)가 틀려서 오진했다

두 가지 결함이 있었다:

- **패널이 정작 필요한 화면에서 안 보였다.** `showModal()` dialog는 top layer라 z-index와
  무관하게 모든 일반 요소 위에 그려진다. 패널은 그 아래 깔려 있었다. 이 실수로 3라운드를
  또 코드 추측으로 보냈다 (`084196c`에서 포털로 고침)
- **`inView` 계산이 틀렸다.** iOS의 `getBoundingClientRect()`는 이미 visual viewport 기준인데
  거기에 `offsetTop`을 또 더했다. 캐럿이 실제로는 보이는데 `inView=NO`로 찍혔고, 그걸 보고
  "숫자는 맞는데 화면이 이상하다 → 페인트 문제"로 갔다. 완전한 헛다리였다 (`2a910b1`에서 고침)

> **교훈: 계기를 만들었으면 계기부터 검증하라.** 틀린 계기는 없는 계기보다 나쁘다.

### (4) 오진 기반의 우회 코드를 넣었다

"페인트 문제"라고 판단하고 `transform`을 한 프레임 넣고 빼는 hack을 넣었다(`25ceca1`).
다음 라운드에 숫자로 이중 보정임이 드러나서 되돌렸다(`2a910b1`). 원인이 확정되기 전의
우회는 다음 라운드의 부채가 된다.

### (5) 보정 패치를 걷어내는 순서를 놓쳤다

`--kb-inset`을 고친 뒤, 그게 고장났을 때 대신 넣어둔 `scrollIntoView` 보정이 **남아 있었다.**
그래서 iOS와 우리가 같이 스크롤해 오버슈트했다(`57c2182`에서 제거). 그런데 그 다음 라운드에
iOS의 밀기까지 취소하면서(`2a910b1`) **캐럿 노출 주체가 0개**가 됐다(`a5022d4`에서 복구).

> **교훈: 원인을 확정하면 그때 넣었던 실패 보정도 같이 걷어낸다.**
> 단, 걷어낼 때 그게 유일한 주체인지 확인한다. 두 라운드에 걸쳐 두 개를 하나씩 없애면
> 남는 게 0개가 된다.

---

## 4. 다음에 같은 증상이면 — 판단 순서

로컬에서 iOS를 재현할 수 없다는 전제에서, 이 순서로 간다.

1. **`?debug=vp` 진단 패널을 먼저 켠다.** (지웠으면 git에서 되살린다 —
   `src/components/ViewportDebug.tsx`, `Dashboard.tsx` 호출부)
2. **`KB-INSET`을 본다.** 키보드가 올라온 상태에서 0이면 그 아래 모든 증상은 이것의 하위
   증상이다. 다른 데 손대지 않는다.
3. **`vvTop`을 본다.** 0이 아니면 iOS가 화면을 밀고 있다 = 이중 보정이거나 확대(`SCALE`)다.
4. **`SCALE`을 본다.** 1.00이 아니면 16px 미만 입력칸을 찾는다.
5. **스크롤 체인의 `DEAD`를 본다.** 굴릴 수 없는 스크롤러가 조상에 있으면 그것부터.
6. **`H scrollers`와 `오른쪽 밖 요소`를 본다.** 옆으로 끌리는 증상이면 여기에 이름이 뜬다.
7. **`caret inView` / `toolbar inView`** — 밴드는 `0..vv.height`다. 계산에 `offsetTop`을
   더하지 않았는지 확인.
8. 그래도 안 잡히면 `/debug-hard` 스킬을 실행한다.

**CSS를 수정했으면 반드시 computed value를 측정한다.** `!important`로 조용히 무력화되는
일이 이 파일에서 세 번 있었다.

---

## 5. 현재 구조 (건드리기 전에 읽을 것)

### 키보드 대응의 흐름

```
useViewportHeight.ts
  ├─ --app-vh    = vv.height                     (보이는 높이)
  ├─ --kb-inset  = baseline - vv.height          (키보드가 가린 높이)
  │                 baseline = 편집 중이 아닐 때의 vv.height
  ├─ --safe-bottom = 0px (키보드 열림 동안만)     ※ cover 꺼져 있으면 무의미
  ├─ html.kb-open 클래스                          (CSS 분기용)
  └─ vv.offsetTop > 0 이면 scrollTo(0,0)          (iOS 밀기 취소)

dashboard.css
  └─ .big-postit  padding-bottom: calc(4px + --safe-bottom + --kb-inset)
                  html.kb-open이면 padding-top 58→40, bottom 24→4
                  html.kb-open이면 .big-meta-row 접기
                  html.kb-open이면 .scroll-top-btn margin-bottom: --kb-inset

MemoRichEditor.tsx
  ├─ scrollMargin/scrollThreshold { top: 48, bottom: 24 }   (sticky 툴바 39px 회피)
  └─ vv.resize 멈춘 뒤 1회 scrollIntoView                    (캐럿 노출 유일 주체)
```

### 스크롤러 지도 (전체화면 편집)

```
dialog[open]                overflow: hidden
 └ .dialog-inner            overflow-y: auto / overflow-x: hidden   ← 둘 다 명시
   └ .postit-overlay        fixed, inset: 0
     └ .big-postit          height: 100dvh, overflow: hidden
       ├ .big-title-row
       ├ .big-meta-row      (kb-open이면 접힘)
       ├ .textarea-row      ★ 유일한 세로 스크롤러 ★
       │  └ .rich-editor    height: auto, flex: 1 0 auto
       │     ├ .mobile-rich-toolbar   sticky top:0, 항상 표시
       │     └ .rich-editor-body-wrap
       │        └ .rich-editor-content   overflow 선언 없음(승격 방지)
       └ .form-actions
```

### 키보드 열림 시 화면 배분 (실측: vvH 358)

```
40px   위 여백 (닫기 버튼)
48px   제목행
39px   서식툴바 (스크롤러 안, sticky)
223px  글 보이는 영역
 4px   아래 여백  ← 바닥. 그 아래는 사파리 액세서리 바(페이지 영역 아님)
```

**더 줄일 수 있는 곳은 글 위쪽뿐이고 총 ~41px이다**(툴바 9 / 위 여백 20 / 제목행 12).
아래쪽은 4px이 물리적 하한이다.

---

## 6. 아직 안 한 것

### PWA — `viewport-fit=cover` (선택 사항)

`manifest.ts` 주석에 전부 있다. 한 줄 켜고 12개 영역 실기기 확인. 기능 변화는 없고
설치형 PWA에서 화면 끝까지 차는 모양새만 얻는다. **안 해도 되는 선택지**이고,
되돌리기는 그 한 줄을 지우면 끝이다.

서비스워커·푸시는 **안 만들기로 확정**됐다(인증 뒤 동적 SSR이라 캐시할 화면이 없음).

### 진단 패널 제거

`src/components/ViewportDebug.tsx` + `Dashboard.tsx`의 `<ViewportDebug />` 호출부.
`?debug=vp` 없이는 렌더되지 않으므로 사용자에게는 안 보인다. cover 작업까지 끝나면 지운다.
지우기 전에 이 문서 4절의 판단 순서를 다시 읽을 것 — 패널이 그 순서의 전제다.

### 글 위쪽 41px 회수 (선택 사항)

위 5절의 배분표 참고. 각각 대가가 있어 보류했다.
