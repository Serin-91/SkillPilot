@AGENTS.md

# SkillPilot — 작업 규칙

## 0. 이 프로젝트의 전제

**Web / Mobile browser / PWA는 하나의 기능 범위다.** 세 환경 중 하나만 보고 고치면
나머지 둘이 깨진다. 기능 추가·버그 수정 모두 세 환경을 함께 설계한다.

단, 환경별 코드를 따로 만드는 게 목적이 아니다. 공통 로직·공통 컴포넌트·반응형 CSS를
먼저 쓰고, **실제 동작이나 플랫폼 제약이 다른 경우에만** 분기한다.
같은 기능을 Web용·Mobile용·PWA용으로 세 번 만들지 않는다.

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
| **입력칸 font-size 16px 하한** | `input` / `select` / `textarea` / `contenteditable`의 computed font-size를 **16px 미만으로 내리지 않는다.** iOS 사파리는 그런 컨트롤에 포커스가 가면 페이지를 자동 확대하고 그 확대가 유지된다 — 그 순간부터 화면 전체가 패닝 대상이 되어 다이얼로그가 손가락 따라 움직이고, `position: fixed`/`sticky` 요소가 보이는 영역 밖으로 밀려나고, 스크롤 제스처가 패닝으로 먹힌다. "스크롤이 막힌다"의 진짜 원인이 이것이었다. `::placeholder`만 16px로 올려도 소용없다 — 컨트롤 자신의 font-size를 본다. `max(16px, 1em)` 같은 일괄 규칙도 쓰지 말 것: `1em`이 부모 기준이라 22px 제목이 16px로 **줄어든다**. |
| **스크롤러 중복** | 전체화면 편집창의 세로 스크롤러는 **`.textarea-row` 하나뿐**이다. 바깥(`.dialog-inner`, `.big-postit`, `.memo-form.open`)은 전부 `overflow: hidden`. 굴릴 수 없는 스크롤러가 조상에 하나라도 있으면 iOS가 터치 제스처를 먼저 먹어 "스크롤이 잠긴 것처럼" 느껴진다. |
| **iOS 100dvh** | iOS는 키보드가 올라와도 `100dvh`를 줄이지 않는다. 실제 보이는 높이는 `--app-vh`, 키보드가 먹은 높이는 `--kb-inset` (둘 다 `src/lib/useViewportHeight.ts`가 내려준다). 껍데기는 화면 전체를 덮고, 키보드 몫은 **padding으로만** 비운다. |
| **`visualViewport.offsetTop`** | `position: fixed` 요소의 `top`에 더하지 않는다. iOS에서 fixed는 이미 레이아웃 뷰포트 기준이라 이중으로 밀려 편집창이 화면 밖으로 사라졌다. 높이만 쓰고 위치는 건드리지 않는다. |
| **키보드 위 `position: fixed` 툴바** | 금지. `bottom: keyboardInset` 자리는 브라우저 autofill 액세서리 바(Chrome 비밀번호/결제 줄, Safari 자동완성)가 사는 자리다. 웹페이지가 없앨 수 없고 Chrome Android는 그 높이를 `visualViewport.height`에 반영조차 안 한다. **서식툴바는 본문 위 `position: sticky; top: 0`.** |
| **sticky 부모 높이** | sticky는 자기 부모 박스 안에서만 따라다닌다. 부모를 `height: 100%`로 두면 한 화면분만 붙었다가 밀려 사라진다. 스크롤러 안쪽은 `height: auto` + `flex: 1 0 auto`. |
| **배경 스크롤 잠금** | 다이얼로그가 열려 있는 동안 `body { position: fixed; top: -scrollY }`. iOS는 `showModal()`로 배경 스크롤이 안 막히고, `overflow: hidden`만으로도 안 막힌다. (`Dashboard.tsx`의 `activeDialogKey` effect) |
| **Tiptap Mark 복원** | `parseHTML`에서 `style` 기반 rule을 쓸 때는 `getAttrs`를 **직접** 줘야 값이 복원된다. Tiptap이 attribute별 `parseHTML`을 자동 연결해주지 않아서, 안 주면 리마운트마다 서식이 사라진다. (`MemoRichEditor.tsx`의 `FontSize` / `TextColor`) |
| **거대 파일** | `Dashboard.tsx`(~290KB)와 `dashboard.css`(~390KB)는 grep으로 접근한다. CSS는 같은 셀렉터가 여러 media block에 흩어져 있으니 **수정 전에 그 셀렉터 전체를 grep해서 어디서 덮이는지 확인**한다. |

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
