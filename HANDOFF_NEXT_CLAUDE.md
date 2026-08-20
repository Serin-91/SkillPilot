# SkillPilot 모바일 이식 — 다음 세션 인계 문서

최종 갱신: 2026-08-21 (KST), **Opus 5 세션(2차 피드백까지 반영)**. 이 문서 하나만 읽으면 이어서 작업 가능하도록 작성함.
(이전 버전들은 이 문서로 완전히 대체됨. git log는 `6afe382 Update HANDOFF...`까지가 마지막 커밋 —
그 이후 두 세션분(Sonnet 5 → Opus 5) 작업이 전부 미커밋 상태로 working tree에 있다.)

## 1. 지금 상태 파악 — 절대 이것부터

```bash
cd "C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot"
git log --oneline -10
git status --short
npx tsc --noEmit
npx next build
```

**중요: 미커밋 작업분이 5개 파일(HANDOFF, Dashboard.tsx, dashboard.css, MemoRichEditor.tsx,
LinkPopover.tsx)에 누적돼 있다 — git diff 기준 대략 +1600/-190(정확한 값은 git diff --stat으로 확인).** rollback 금지, 커밋 여부는 사용자에게
먼저 확인할 것(두 세션 모두 "커밋해달라" 요청 없었음). typecheck·프로덕션 빌드는 이번 세션
마지막에 통과 확인함.

### 1-1. " (1)" 접미사 미추적 파일 43개 — **이번 세션에 사용자 승인 받고 삭제 완료 (해결됨)**

`package (1).json`, `Dashboard (1).tsx` 등 43개가 소스 전반에 원본과 나란히 있었다. 정체는
**오래된 중복 스냅샷**이었고, 단순 지저분함 문제가 아니라 **실제로 프로덕션 빌드를 깨고 있었다** —
`next build`의 타입체크가 tsconfig의 `**/*.tsx` 전체를 스캔해서 이 낡은 파일들의 타입 에러
(`JobsHistoryDay` 미존재 등) 때문에 `Failed to type check`로 빌드가 실패했다. 사용자가
"지장 없는 거면 다 지우라"고 승인 → 전부 삭제, 현재 typecheck·build 모두 통과. **다시 나타나면
어떤 동기화/다운로드 도구가 만드는지 사용자에게 확인할 것.**

### 1-2. `.next` 캐시가 손상되면 빌드가 엉뚱한 에러로 죽는다

`Failed to open database / Loading persistence directory failed / invalid digit found in string` —
코드 문제가 아니라 Turbopack 캐시 손상이다. `rm -rf .next` 후 재빌드하면 해결된다. 이번 세션에
한 번 겪었으니 같은 메시지가 나오면 바로 캐시부터 지울 것.

## 2. 아키텍처 (변경 없음)

- **`skillpilot`** (`C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`, branch `master`) — **유일한 작업 대상**.
- **`skillpilot-mobile-responsive`** (branch `mobile-responsive`) — **READ-ONLY 참고용**. 기능은 낡았지만
  모바일 CSS 값 자체는 검증된 최종본("3001"). 절대 수정/checkout/merge 금지. 이번 세션에 이 값을 근거로
  여러 버그의 진짜 원인을 찾았다(5절 참고) — 앞으로도 "3001엔 있는데 3000엔 없다"/"3001엔 없는데 3000엔만
  있다" 대조가 가장 신뢰도 높은 디버깅 방법이다.
- 로컬 dev 서버: `localhost:3000` = skillpilot(master), `localhost:3001` = skillpilot-mobile-responsive.
- **launch.json은 프로젝트 루트(`C:\Users\ipre_\Desktop\미니프로젝트3\.claude\launch.json`)에 있다** —
  `skillpilot/.claude/launch.json`이 아니다(그건 tiptap 미리보기용 개인 파일, 무시). preview_start 도구는
  cwd 기준으로 launch.json을 찾으므로, skillpilot 디렉터리에서 실행해도 실제로 참조하는 건 상위
  루트의 파일이다. 이번 세션에 이걸 착각해서 skillpilot 하위 파일을 잘못 고쳤다가 되돌린 적 있음 —
  **launch.json 관련 이상 동작이 있으면 먼저 어느 launch.json이 실제로 쓰이는지 preview_start 에러
  메시지의 "Available servers" 목록으로 확인할 것.** 루트 launch.json의 서버 이름: `"skillpilot"`(3000),
  `"skillpilot-mobile-ref"`(3001, 이미 떠 있는 프로세스에 attach만 함, autoPort:false로 3000 고정).
- 로그인 세션은 "localhost" 도메인 쿠키(httpOnly)라서 3000/3001 어느 한쪽에 로그인하면 둘 다 로그인된다 —
  단, 브라우저 프로필이 다르면 공유 안 됨. 테스트 계정: `skillpilot.dev.admin@gmail.com` /
  `testpassword123` — **이 비밀번호를 Claude가 직접 입력하는 것은 금지 규칙이라 절대 하지 말 것.**
- headless 환경 주의사항 (이번 세션에 크게 갱신됨, 아래 3절 참고).

## 3. 헤드리스 환경 검증 방법 — 이번 세션에 크게 바뀐 부분

- **screenshot은 세션마다 되는지가 다르다. 이번(Opus 5) 세션엔 전혀 안 됐다** —
  `Screenshot timed out after 5s: the Browser pane is not displayed, so the page is not compositing
  frames`가 계속 떴고 `tabs_select`로 앞에 띄워도 안 됐다. 이전 세션엔 됐다고 기록돼 있으니
  **세션 시작 때 한 번 찍어보고 되는지 확인한 뒤 검증 전략을 정할 것.** 안 되면 아래 측정 기반으로
  전부 처리 가능하다(이번 세션은 스크린샷 0장으로 전 항목 실측 검증했다).
- ⚠️ **`.big-postit`은 `postitPop` 애니메이션(`from{transform:scale(.86)}`)이 헤드리스에서 중간에
  멈춰 있어서, `getBoundingClientRect()`가 실제보다 14% 작게 나온다.** 이번 세션에 웹 메모 수정
  화면을 재려다 rect 547px / computed 636px로 어긋나서 발견했다. **판별법: rect 높이와
  `getComputedStyle(el).height`가 다르면 스케일 아티팩트다.** 반드시
  `*{animation:none!important;transition:none!important}`를 주입한 뒤 다시 재라 —
  안 그러면 잘못된 수치로 CSS를 짜게 된다. (모바일에선 애니메이션이 끝나 있어서 안 겹쳤다.)
- **여러 다이얼로그가 같은 클래스를 공유하니 쿼리를 `dialog[open]`으로 스코프할 것.**
  Today's Focus와 Idea Build는 **둘 다 `.ai-direction-dialog`**다. `document.querySelector('.ai-modal-header')`는
  닫혀 있는 쪽(rect 전부 0)을 잡아버린다 — 이번 세션에 이걸로 한 번 헛짚었다.
  `document.querySelector('dialog[open]').querySelector(...)` 형태로 쓸 것.
- **React 상태 변경 + 서버 액션이 끼면 1.6초로는 부족하다.** AI Trend 수정 검증에서 1600ms 후엔
  "editorOpened: false"로 나왔는데 실제로는 조금 뒤에 정상 렌더됐다 — **"안 열렸다"고 결론내기 전에
  더 기다리거나 폴링 루프로 확인할 것.** (Idea Build 생성은 최소 5초 강제 대기 + 실제 생성으로 ~9초.)
- **좌표/크기 검증은 여전히 `getBoundingClientRect()`/`getComputedStyle()`이 1차 수단.** 회전/기울기
  버그는 `getComputedStyle(el).transform`의 matrix에서 b,c 성분을 읽어야 하고, **`::before`/`::after`
  가상요소까지 포함해서 스캔해야 한다** — 이번 세션에 "사선으로 저장됨" 버그를 찾을 때 실제 요소만
  스캔해서 0건이 나왔었는데, 나중에 스크린샷으로 확인해보니 원인은 회전이 아니라 **폰트 자체가
  이탤릭으로 보이는 것**이었다(아래 5절 참고) — **"내가 찾는 CSS 속성이 없다"고 결론 내리기 전에
  반드시 스크린샷으로 실물을 봐야 한다. 코드에 원인이 없다는 것과 버그가 없다는 것은 다르다.**
- **모바일 액션(버튼 클릭, 날짜 선택 등)은 절대 `.click()` 합성 클릭만으로 테스트하지 말 것.**
  실제 브라우저는 pointerdown → mousedown → pointerup → mouseup → click 순서로 이벤트가 발사되고,
  document 레벨의 mousedown outside-press 리스너들이 그 사이에 끼어든다. 합성 `.click()`은 mousedown이
  없어서 이런 리스너를 건드리지 않고 통과해버려 "정상"이라는 거짓 결론을 내리게 한다(5절의 치명적
  버그 두 개가 전부 이 방식으로 숨어 있었다). 검증용 헬퍼 패턴:

  ```js
  function tap(el){
    var r=el.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    var po={bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y};
    var mo={bubbles:true,cancelable:true,clientX:x,clientY:y};
    el.dispatchEvent(new PointerEvent('pointerdown',po));
    el.dispatchEvent(new MouseEvent('mousedown',mo));   // 이게 document 리스너를 실제로 태운다
    el.dispatchEvent(new PointerEvent('pointerup',po));
    el.dispatchEvent(new MouseEvent('mouseup',mo));
    el.dispatchEvent(new MouseEvent('click',mo));
  }
  ```

  텍스트 선택(뉴스/채용공고 문장 드래그)을 흉내낼 때도 pointerdown → Range 조작 → pointerup 순으로
  실제 이벤트를 끼워야 React의 selectableHandlers가 정확히 반응한다.
- React 클릭은 `element.click()`을 먼저 시도하고 안 먹으면
  `el[Object.keys(el).find(k=>k.startsWith('__reactProps'))].onClick({stopPropagation(){},preventDefault(){}})`로
  fiber prop을 직접 호출 — 이건 여전히 유효하지만, **위 tap() 패턴이 필요한 경우(outside-press 로직이
  관여하는 모든 곳)엔 fiber onClick 우회로는 버그가 재현되지 않으니 주의.**
- production build(`npx next build`)까지 통과시키는 걸 최종 검증 단계로 추가했다 — typecheck만으로는
  못 잡는 문제(빌드 타임 정적 분석 등)가 있을 수 있어서, 세션 마무리 전엔 build까지 돌릴 것.

## 3-A. 이번 세션(Opus 5, 2차)에 처리한 것 — 전 항목 실측 검증 완료

사용자가 준 웹+모바일 버그/개선 리스트를 전부 처리하고, **스크린샷 없이 rect/computed-style 실측으로
before→after를 확인**했다. 아래 수치는 실제 측정값이다.

### 3-A-1. 치명적 버그 — AI Trend "전체 저장 → 기존 메모"가 아무 반응 없던 것 (근본 원인 해결)

**원인: `Dashboard.tsx`의 AI Trend 다이얼로그 안에 `bigEditorNode`를 렌더링하는 줄이 아예 없었다.**
News는 `{activeDialogKey === "news" && bigEditorNode}`, Jobs는 `"jobs"`, memo/keynotes/postitOnly도
각각 있는데 **`trendBrief`만 빠져 있었다.** 그래서 `confirmPendingSave()`가 `openBigEditor()`로
state는 정상적으로 세팅해도 편집창 JSX 자체가 그 다이얼로그에 없어 화면에 아무것도 안 떴다.
"새 메모 생성"은 서버 액션만 타므로 정상 작동해서, 증상이 정확히 "기존 메모만 안 됨"으로 보였다.
→ `{activeDialogKey === "trendBrief" && bigEditorNode}` 추가. 실제 흐름(전체저장 → 기존 메모 선택 →
확인 → 편집창 열림 → 삽입)까지 라이브로 통과 확인.

### 3-A-2. 전체저장을 기존 메모에 넣을 때 헤더가 본문 크기로 죽던 것

기존엔 `htmlToPlainText(html)`로 **태그를 걷어낸 평문만** 삽입해서 `<h3>` 제목이 그냥 본문이 됐다
(사용자 지적 "헤더 글씨크기 작게 들어감"). `pendingInsert`에 `html?` 필드를 추가하고 리치 에디터
경로에서만 `insertContent(html)`로 넣게 했다(Tiptap이 HTML을 파싱해 노드로 만든다).
`text`는 미리보기 배너·`memo_source` 기록·plain textarea 경로용으로 그대로 남겼다.
**실측: 삽입 결과에 `<h3>` 2개가 17.92px로 살아있고 본문 `<p>`는 16px — 크기 위계 복원됨.**
(참고: 사용자 메모에 남아 있던 *예전* 채용공고 저장분은 여전히 `<p>` 한 덩어리 평문이다 —
그게 바로 이 버그의 흔적이고, 새로 저장하는 것부터 정상이다.)

### 3-A-3. Idea Build "재생성"이 바로 생성돼버리던 것 → 알림 팝업

`runIdea()`에 이미 `if (!ideaGenMode)` 가드가 있었는데, 1회 생성 후에도 이전 선택이 그대로 남아
재생성이 조용히 또 생성했다. **생성 성공 시 `setIdeaGenMode(null)`** 을 넣어 다시 고르게 만들고,
메시지를 요청 문구로 교체. **실측 검증: 재생성 클릭 → 알림 표시, `isGenerating: false`,
사용 횟수 1/2에서 변동 없음(생성 안 됨), 결과 화면 유지.** 알림은 기존 `.confirm-panel` 디자인 재사용.

### 3-A-4. "6번째 말하는 중" 두 건의 진짜 원인 — CSS는 있는데 **클래스가 마크업에 안 붙어 있었다**

3001에서 포팅한 모바일 규칙이 `.idea-save-overlay` / `.idea-source-picker-anchor` /
`.idea-picker-back`를 기준으로 쓰여 있는데, **3000 마크업엔 이 클래스가 0개였다**(3001엔 각각
3개/1개/2개). 그래서 (19)절에서 값을 아무리 손봐도 "프로젝트에 저장" 팝업엔 단 한 줄도 적용되지
않았고 → 글씨가 세로로 쏟아지고 배치가 엉망이었다. `Dashboard.tsx`에 클래스를 붙여서 해결.
**교훈(6절에 추가): "규칙이 없다" / "다른 규칙이 덮어쓴다" 외에 세 번째 경우가 있다 —
"규칙은 맞는데 걸릴 고리(클래스)가 마크업에 없다". grep은 CSS·JSX 양쪽에서 개수를 세야 한다.**

### 3-A-5. 나머지 (실측 before → after)

| 항목 | 결과 |
|---|---|
| Today's Focus 보조문구 뿌옇게 | 원인은 `.focus-btn` 외곽 글로우(0 0 30px)가 버튼 왼쪽 35px까지 번져 부제를 27px 덮고, 버튼이 `position:relative`라 static인 부제 **위에** 그려진 것. 글로우는 유지하고 `.ai-modal-title-wrap`만 `position:relative;z-index:1`로 올림 → **제목 폭 147px(3001 검증값) 그대로, 레이아웃 무변경** |
| "분석할 프로젝트" 라벨 | 12px → **15px**, 앞에 lucide `ScanSearch` 아이콘(이모지 아님). `currentColor`라 **아이콘 색 = 라벨 색 rgb(106,88,222) 실측 일치** |
| Idea ON 배지 우측 끝 | `transform: translateX(-13px)`로만 이동(margin/padding은 헤더 폭을 먹어 제목 잘림이 재발한다). r=360 → **347** |
| 프로젝트 선택/저장 팝업 확대 | 패널 330 → **344px**, 제목 15 → 16.5px, 목록 13.5/11/11 → **15/12.5/12px** |
| 상태 뱃지 "동그라미 칸 어색" | 10px 글씨에 min-height 25px·gap 8px이라 칸만 컸다 → **12.5px / 24px / gap 5px / dot 8→6px** |
| 뒤로가기·닫기 겹침 | 추가한 ‹와 기존 ✕가 (l=32~60)/(l=33~73)로 겹쳐 있었음 → 모바일은 ‹만, 웹은 ✕만 |
| 프로젝트 목록 헤더 | 뒤로가기 아래(t=47)에 있던 제목을 **News 기준(t=8/l=52)에 맞춤 → t=9/l=53(1px 이내)**, 헤더 77→49px, 아래 내용 t=94 → **66px로 함께 올라옴** |
| 프로젝트 목록 글씨 | 15.5/13.5/12 → **17/14.5/13px**, 뱃지 11.5 → 13px |
| 기본 템플릿 버튼 | l=19 → **l=15 (제목·본문 좌측선과 정확히 일치)** |
| 모바일 메모 전체창 위아래 잘림 | **특이도 역전이 원인** — 전체화면 규칙은 `.big-postit`(1클래스)인데 이 흐름에만 붙는 `.big-postit.has-insert-banner`(2클래스)가 `max-height:92%`로 되돌려 위아래 32px씩 남았다 → 이 변형만 100dvh로 → **top/bottom gap 0** |
| [웹] 메모 기본 수정 | 입력칸 332 → **421px(+89)**, 버튼 아래 죽은 여백 46 → 16px, 스크롤 시작점→첫 줄 40 → 16px |
| [웹] 메모 전체 수정 | 입력칸 621 → **679px(+58)**, 헤더 68 → 52px, 죽은 여백 26 → 14px, **본문 첫 줄 = 스크롤 top 정확히 일치** |
| 프로젝트 Coming Soon | 인용문 스타일로 재작업(세로선 2.4px + 이탤릭 + 큰따옴표 `""` ::before/::after), 13/17 → **15/21px**, `quoteClipped:false`·grid 2트랙 유지 확인. **모바일은 요청대로 완전히 숨김** |
| 알림/확인 팝업 모바일 규격 | 3000엔 모바일 `.confirm-panel .copy-picker-title` 규칙이 없어 데스크톱 17px이 250px 패널에 그대로 들어갔다(3001엔 12.5px). 3001값은 "글씨 키워달라" 방향과 반대라 중간값 → 패널 250 → **292px**, 제목 **15px 2줄 잘림 없음**, 버튼 38px |
| "~에 붙여 넣으시겠습니까?" | 요청대로 줄바꿈 포함 문구로 교체(실측 innerHTML `"…"에<br>붙여 넣으시겠습니까?`) |

## 3-B. 같은 세션 2차 피드백(2026-08-21)에 처리한 것

### 3-B-1. 프로젝트 "Coming Soon" — 3번 지적받고 **접근 자체를 바꿨다**

세 번 다 같은 지적("좆만하고 글씨 짤림")이 나온 이유는 값이 작아서가 아니라 **방향이 틀렸기
때문**이었다. 목적은 "오른쪽 트랙을 채우는 것"인데 컨테이너를 `justify-content:flex-end`로 두고
안에 작은 텍스트만 넣어서, 554px 트랙에 174px짜리가 구석에 붙어 있었다.
→ **도움말(`.feedback-helper-panel` / `.help-feature-icon` / `.support-feature-dot`)과 같은 토큰**으로
트랙을 꽉 채우는 카드로 재작성: 그라데이션 글래스 배경 + 라운드 아이콘 박스(lucide `Sparkles`,
`#6d58ed`) + 그라데이션 텍스트 + 장식 점 3개.
**실측: 패널 폭 174 → 554px(트랙 전체와 정확히 일치), `mainClipped:false`, grid 2트랙 유지.**
**교훈: 같은 지적이 3번 반복되면 값을 또 조정하지 말고 "내가 목적을 잘못 구현하고 있는가"를 볼 것.**
사용자가 "도움말쪽에 이쁜 거 많으니 참고해라"라고 직접 알려줬다 — **이 프로젝트의 예쁜 UI 레퍼런스는
`.help-hero` / `.feedback-helper-panel` / `.help-feature-card`다. 새 장식 UI는 여기서 토큰을 가져올 것.**

### 3-B-2. 웹 메모 편집 스크롤바 (신규)

`.rich-editor-body-wrap` 등 편집 스크롤 영역에 **커스텀 스크롤바 규칙이 아예 없어서 OS 기본
스크롤바(두꺼운 회색 + 화살표 버튼)가 그대로 보였다.** dashboard.css (22)절에 추가:
`scrollbar-width:thin` + `::-webkit-scrollbar{width:10px}` + `border:3px solid transparent` &
`background-clip:padding-box`로 떠 있는 알약처럼, `::-webkit-scrollbar-button{display:none}`으로
화살표 제거. **실측: gutter 10px(윈도우 기본은 15~17px), `scrollbar-color` 적용 확인.** 웹 전용.

### 3-B-3. 나머지 (실측)

| 항목 | 결과 |
|---|---|
| 메모 전체 수정 입력칸 위치 | (21-j)에서 40px 올렸더니 너무 붙었다는 피드백 → `.dialog-body-scroll { padding-top:12px }`로 한 칸 내림. **헤더→입력칸 39 → 51px** |
| [모바일] Idea Build 두 픽커 | 앵커의 `place-items:center`+padding이 전체폭을 막고 있었다 → 하단 시트로: **폭 344 → 375px(뷰포트와 동일), 높이 585 → 731px, radius 18px 0 0(시트)** |
| ↳ 제목을 ‹ 옆으로 | back을 absolute로 빼고 제목에 `padding-left:40px` (뉴스/채용공고와 같은 방식). **실측 back·제목 중심 Y 둘 다 105 = 같은 줄** |
| ↳ 상태 뱃지 좌측 정렬 | **프로젝트명 l=26, 뱃지 l=26 — 일치** |
| ↳ 확인 알림은 시트 제외 | `.idea-save-overlay:has(> .confirm-panel)`로 되돌려 **292px 가운데 팝업 유지**(시트로 변하면 안 된다) |
| [모바일] 프로젝트 아이디어 헤더 | 24px는 너무 크다는 피드백 → **20px**, 그리고 `align-items:center` + `padding-top:6px`로 **뒤로가기와 수직 중심 완전 일치(delta 0px)** |

**주의: 프로젝트에 저장 팝업은 날짜가 2026-08-21로 넘어가 Idea 결과가 초기화돼(하루 단위) 실물로
열 수 없었다.** 그래서 **같은 클래스 체인의 DOM을 실제로 만들어 붙여 CSS 캐스케이드를 측정**했다
(전체폭·시트·제목 정렬·뱃지 정렬·confirm 예외 전부 확인). 다음 세션에 결과가 있으면 눈으로 한 번 볼 것.

## 3-C. 같은 세션 3차 (2026-08-21) — Coming Soon 4번째 재작업, /design으로 방향 확정

4번째 지적("상단에 쳐놓으면 뭐함, 좆만하고 짤림")까지 받고서야 진짜 원인을 봤다: 빈 영역을
실측하니 **제목 줄(78px) + 한줄요약·상태 줄(84px), 두 줄 합쳐 644x175px**인데, 3번째 시안까지
전부 위 75px짜리 한 줄만 채우고 있었다. 값을 조정해온 게 아니라 애초에 영역을 잘못 잡고 있었다.

이번엔 값으로 밀어붙이지 않고 `/design`으로 네 방향(로드맵 엿보기 / 리퀴드 글래스 오브 / 별자리
다크 / 얼리액세스 티켓)을 실제 SkillPilot 토큰으로 만들어 캔버스로 보여주고 사용자가 골랐다 —
**"리퀴드 글래스 오브"**(Idea Build 결과 화면의 `.idea-direction-orb` + 배경 `.blob`을 그대로
가져온 디자인, 카피는 "곧, 새로운 기능").

**구조 자체를 바꿔야 했다**(값 문제가 아니라 레이아웃 문제였으므로):
- 기존: `.proj-form-grid--compact`(제목|채움칸 2열 그리드) 아래에 `.proj-summary-row`(한줄요약|상태)가
  별도 행으로 있었다 — 채움칸은 첫 번째 행 안에만 있어서 구조적으로 절대 두 번째 행을 덮을 수 없었다.
- 변경: 제목 행 + 한줄요약/상태 행을 `.proj-top-cluster-left`(flex column)로 묶어 왼쪽 스택으로 만들고,
  그 오른쪽에 `.proj-coming-soon`을 `align-items:stretch`로 세워 **두 행 높이를 전부 커버**하게 했다.
- **모바일 order 트릭 보존이 이 리팩터의 핵심 위험이었다.** 기존에 `.proj-detail-editing
  .dialog-body-scroll { display:flex; flex-direction:column }` + `.proj-form-grid{order:-1}` /
  `.proj-summary-row{order:-2}`로 모바일에서 상태·요약을 제목 위로 재배치하는 트릭이 있었는데,
  이건 두 요소가 `.dialog-body-scroll`의 **직계 자식**이어야만 작동한다. 새 wrapper(`.proj-top-cluster`,
  `.proj-top-cluster-left`)에 넣으면 이 트릭이 깨진다 — 그래서 두 wrapper에
  `@media(max-width:720px){ display:contents }`를 걸어 모바일에서는 wrapper가 박스를 만들지 않고
  자식들이 그대로 `.dialog-body-scroll`의 flex item처럼 동작하게 했다(display:contents는 DOM은
  유지하되 박스만 지워서, flex `order`가 조부모 flex 컨테이너 기준으로 여전히 적용된다).
  **실측 검증: 모바일에서 `comingSoonDisplay:'none'`, `clusterDisplay/leftDisplay:'contents'`,
  summary-row(t=55)가 title(t=90)보다 위 — 기존 순서 그대로 유지.**
- `.proj-form-grid--compact`(2열 그리드)는 이제 필요 없어져 삭제, `.proj-form-grid`는 제목 한 칸만
  담는 단순 `display:block`으로 정리(이 클래스의 유일한 사용처였다).
- 데스크톱 실측(1440px): 패널 172→**657x175px**(빈 영역 전체와 정확히 일치), `mainClipped:false`.
- 팝오버(`.mobile-project-summary-popover`)가 `t=55`로 summary-row와 같은 자리에 뜨는 게 처음엔
  버그처럼 보였는데, 확인해보니 **기존에 이미 `position:absolute`로 "겹쳐 뜨게" 의도된 오버레이**였다
  (`dashboard.css` 주석: "한 줄 요약 팝오버가 흐름에 끼어들어 아래 프로젝트명을 밀어냈다 — 겹쳐 뜨게
  한다") — 내 변경과 무관한 기존 동작, 회귀 아님.

**다음 세션이 확인할 것**: 이 리팩터는 스크린샷 없이 실측만으로 검증했다. 데스크톱에서 실제로 열어
오브가 잘 보이는지, 모바일에서 폼이 이전과 똑같이 동작하는지(특히 요약 토글 팝오버) 한 번 눈으로
볼 것.

## 4. 이전 세션(2026-08-20, Sonnet 5)에 처리한 것

사용자가 두 차례에 걸쳐 매우 긴 모바일+웹 버그 리스트를 줬고, 라이브 검증(실제 이벤트 시퀀스 +
스크린샷)으로 원인을 찾아 고쳤다. git diff 기준 4개 파일, +902/-68줄.

### 4-1. 치명적 버그(반복 실패했던 것들, 반드시 읽을 것)

- **"메모로 저장" 눌러도 아무것도 안 뜸(모바일, 뉴스/채용공고/AI Trend 공통)** — Dashboard.tsx:528 부근
  `RadialSelectionMenu`(데스크톱 원형 메뉴)는 모바일에서 CSS(`.selection-action-desktop{display:none}`)로만
  숨겨져 있고 실제로는 계속 마운트돼 있었다. 이 컴포넌트의 `document.addEventListener("mousedown", onDocClick)`가
  살아 있는 채로, 모바일 하단 액션바(`.mobile-selection-layer`)를 실제로 터치하면 이 리스너가
  "바깥 클릭"으로 오판해 `onClose()`(=`setSelectionMenu(null)`)를 먼저 실행 → 레이어 전체가 사라졌다.
  **합성 클릭으로는 mousedown이 없어서 재현이 안 됐다** — 이게 지난 세션들에 "고쳤다"고 보고했는데
  실제로는 안 고쳐진 이유. 수정: `onDocClick`에서 `target.closest(".mobile-selection-layer")`면 무시하도록
  가드 추가. 실제 이벤트 시퀀스로 재현→수정→재검증 완료(저장 버튼 → 달력 → 날짜 탭 → 메모 선택창까지
  전체 흐름 확인됨).
- **링크 팝오버(🔗)가 안 닫힘** — LinkPopover.tsx:24 부근
  완전히 같은 종류의 race condition. `LinkPopover`의 outside-mousedown 핸들러가 토글 버튼의 mousedown에서
  먼저 팝오버를 닫아버리고, 바로 이어지는 버튼의 click이 "닫혀 있으니 열자"고 다시 열어서 무한 토글이
  안 됐다. 수정: 토글 버튼에 `data-link-toggle` 마킹, outside-press 핸들러가 그 안쪽 클릭은 무시.
  추가로 **"커서 위치에 나타나야 한다"** 요청도 처리 — `editor.view.coordsAtPos()`로 caret 좌표를 구해
  `linkPopover` state에 `{top, left}`로 저장하고 인라인 스타일로 그 자리에 띄운다. 모바일 CSS가
  `position:fixed !important` + `left:50%` + `bottom: 고정값`으로 화면 중앙에 못박아 인라인 좌표를
  덮어쓰고 있던 규칙도 제거(`dashboard.css`에서 `.mobile-rich-toolbar .link-popover, .big-postit .link-popover`
  검색). 두 번째 누름에 정상적으로 닫히는 것까지 실제 이벤트로 검증함.
- **Today's Focus / Idea Build 헤더가 계속 잘림(5번 이상 지적)** — 원인이 두 겹이었다:
  1) 3001(검증된 참고본)에는 있고 3000엔 아예 없던 `.idea-source-picker`/`.idea-save-overlay`/
     `.focus-card` 등 모바일 규칙 39개가 통째로 빠져 있었음(diff 스크립트로 3001 CSS의
     `@media(max-width:720px)` 블록을 selector 단위로 추출해 3000과 비교, 없는 것만 그대로 포팅 —
     `dashboard.css` "(8) Today's Focus / Idea Build 모바일 규칙 포팅" 섹션).
  2) 그런데 포팅 후에도 여전히 잘렸다 — 이번엔 **3000에만 나중에 덧붙은 override가 3001의 정답 값을
     되돌리고 있었다.** 정확한 원인: `.ai-modal-header-actions`에 `padding-right: 42px`가 붙어서
     (3001엔 없음) 제목(`.ai-modal-title`)이 들어갈 폭을 빼앗았다 — 제목 147px 필요한데 111px밖에
     못 받아서 잘렸고, 그 옆의 "Update Focus" 버튼도 동시에 잘렸다. `padding-right: 0 !important`로
     제거하고 제목의 `white-space: nowrap; text-overflow: ellipsis`(제가 지난번에 잘못 추가한 것)도
     `normal/visible`로 되돌려서 3001과 픽셀 단위로 일치시켰다(실측: title width 147px, cta width
     110px, 둘 다 clipped:false). **교훈: "규칙이 없다"와 "규칙이 있는데 다른 규칙이 덮어쓴다"는 서로
     다른 진단이다 — 둘 다 확인해야 한다.**
- **입력 버퍼링(타이핑 렉)** — 두 겹의 원인이 있었다.
  1) `setFormBody` 등이 키 입력마다 Dashboard(271KB 컴포넌트 하나가 화면 전체를 그림) 전체를
     리렌더시켰다. 해결: `formBodyRef`/`projContentRef`/`bodyEditorDraftRef` 세 개의 ref를 두고,
     타이핑 중엔 ref만 갱신(`setFormBodyWhileTyping` 등, 300ms 디바운스로 state를 따라가게 함),
     저장·자동저장·나가기·삽입·확장전환 등 **모든 읽기 경로**(`readFormBody()`, `readProjContent()`,
     `readBodyEditorDraft()`)는 항상 ref의 최신값을 읽는다. 이 구조 덕분에 state가 늦게 갱신돼도
     데이터 유실이 구조적으로 불가능하다 — Dashboard.tsx:1311 부근 주석 참고.
  2) 그래도 "빨리 치면 미세한 렉" 지적이 남아서 추가로 팠다 — `MemoRichEditor`의
     `onSelectionUpdate`가 캐럿이 움직일 때마다(키 입력 = 캐럿 이동) `setSelectionTick`을 즉시 발사해서
     툴바가 매 타자마다 리렌더됐고, 그 렌더 안의 `readCurrentFontSize()`가 `getComputedStyle()`을
     불러 **매 타자마다 강제 스타일 재계산(layout thrashing)** 이 일어났다. 120ms 디바운스
     (`scheduleSelectionSync`, MemoRichEditor.tsx:200 부근)로 바꿔서 해결. 최종 측정: 300자 연타 시
     **2.69ms/키** (프레임 예산 16ms의 1/6 수준). 더 줄이려면 Tiptap/ProseMirror 자체 렌더 비용
     영역이라 에디터 교체급 작업이 된다 — 사용자에게 이미 이 한계를 설명함.
- **+Create(새 메모 작성) 중 바깥 터치/Esc 시 내용이 통째로 사라짐** — `onDialogBackdropClick`과
  `<dialog onCancel>`이 저장 로직 없이 `e.currentTarget.close()`만 호출하고 있었다. `memoFormOpen`일
  때는 날짜 검증 + draft 저장을 갖춘 `handleMemoDialogBack()`을 타도록 고침. 검증: 텍스트 입력 후
  바깥 터치 → 메모 개수 8→9로 증가, 텍스트 보존 확인.

### 4-2. 폰트 크기 체계 — 웹/모바일 2px 차이를 의도적으로 유지

`--memo-base-font` CSS 변수 하나로 통일(dashboard.css:23 웹 18px, dashboard.css:4984 부근 모바일
16px 재정의). `.rich-editor-content`, `.rich-content-view`, `.proj-body-input`, quick editor,
프로젝트 본문까지 전부 이 변수를 참조하도록 정리했다. **사용자가 "웹/모바일 각각 다른 곳에서
수정해도 2px 차이 나게 보여야 한다"고 명시적으로 요청했으므로, 앞으로 폰트 크기를 만질 때 이
변수 하나만 고치고 웹=모바일+2px 관계를 유지할 것 — 절대 두 값을 같게 만들지 말 것 (실수하기
쉬운 부분이니 각별히 주의).**

툴바 표시값도 하드코딩 상수가 아니라 `readCurrentFontSize()`(MemoRichEditor.tsx:39 부근)가
실제 DOM의 computed style을 읽어서 보여준다 — 마크가 없으면(=기본 크기) `--memo-base-font`가 정한
값 그대로 보여지므로 "본문을 누르면 표시가 16으로 바뀌는" 불일치가 구조적으로 재발할 수 없다.

### 4-3. 나머지 처리 목록 (전부 실측 검증 완료)

- "본문" 툴바 버튼 삭제, H1부터 시작(모든 메모+프로젝트) — MemoRichEditor.tsx:22 부근
- 먼슬리메모 하단 목록 기본 필터: "이번 달" → "선택일" — Dashboard.tsx:1366 부근 `dateRangeMode`
- 웹 메모 작성(+Create)/수정(.big-postit) 둘 다: 입력창 경계(테두리·그림자·라운드) 제거해 메모지
  색과 동일하게, 위 여백 축소, 입력칸 확대, 취소/저장 버튼 카드 아래로. **주의: 작성과 수정은
  서로 다른 DOM(`.memo-form.open` vs `.big-postit`)이라 CSS 규칙도 따로 필요하다** — 이번에 5번
  반복된 이유가 "작성만 고치고 수정을 안 고쳤던 것"이었다.
- 웹 +Create 제목 글씨 30px(메모보기 헤더와 동일), placeholder도 26px로 동반 확대
- 웹 전체 수정(dialog.body-editor) 헤더/툴바 sticky 겹침 없이 여백 축소, 입력칸 확대
- 모바일 상세 헤더(News/Job/AI Trend/Key Notes/My Page) 전부 뒤로가기(t=2,l=6 표준)와 정렬,
  실측 중심 오차 1px 이내
- 고정메모 전체보기: 그룹 제목 padding-left 37px로 뉴스 기준(l=52)에 맞춤, 카드 압정이 제목을
  12.4px 침범하던 것 해소(압정 top:-10px + grid padding-top:12px)
- Key Notes 헤더 30→24px
- 모바일 메모 "수정"에 메모유형이 없던 문제 — `.big-postit > .big-meta-row` 전체가
  `display:none`이었음(작성 쪽은 자식만 골라 숨겨서 괜찮았는데 수정 쪽만 행 전체가 사라짐).
  행은 복구하고 날짜/상태/색상만 숨김
- 뉴스/채용공고/AI Trend 전체저장 본문의 이탤릭(사선) 렌더 — CSS엔 원인 없음(개발 환경에서는
  똑바로 렌더됨), 사용자 환경의 폰트 합성 문제로 추정 — `font-style: normal`을 본문 요소에 명시해
  환경 무관하게 고정(이모지 버튼의 `<em>/<i>` 이탤릭은 그대로 유지)
- 모바일 "메모로 저장" 시 뜨는 미니달력 크기 330→226px(⋮ 더보기 시트와 동일 규격), 하단 중앙 정렬
- 삽입("현재 커서 위치에 삽입") 완료 후 남아있던 저장/삭제 버튼 모바일에서 숨김
- Idea Build "프로젝트 선택"/"프로젝트에 저장" 팝업 — 뒤에 오는 공유 CSS 규칙이 `!important`로
  두 팝업을 서로 다른 크기(12px/6px vs 15px/9px)로 만들고 있었음. 통일 후 한 단계 확대
- 프로젝트 입력/수정 화면 전반을 포스트잇 메모 규칙과 통일(경계 제거, 타이포, 본문 폰트 변수 공유).
  프로젝트명 우측 빈 공간에 "기능 추가 예정 / Coming Soon !" 연보라 안내 추가
- **신규 기능**: 뉴스/채용공고/AI Trend "전체 저장"에도 날짜 선택 UI 추가(웹+모바일 공통) —
  기존엔 오늘 날짜로 고정이었는데, `copy-picker-date-row`에 `MiniDatePicker`를 얹어 날짜를 바꾸면
  `changeMemoPickerDate()`가 그 날짜의 메모 목록을 다시 불러온다 — Dashboard.tsx `openFullSavePicker` 부근.

## 5. 아직 안 됐거나 다음 세션이 확인해야 할 것

- **Idea Build 하루 횟수: 오늘분은 사용자가 Supabase에서 초기화해줬고, 이번 세션에 검증용으로
  1회 썼다 → 현재 1/2.** 남은 1회는 사용자 몫으로 남겼다. 또 초기화가 필요하면 사용자가
  `/mcp` 인증 또는 Supabase에서 오늘자 `ai_results`(`type='idea'`) 행 삭제. **비대화형 세션에서
  Claude가 OAuth를 띄우는 건 구조적으로 불가능하다는 점은 그대로 유효.**
- **하루 횟수를 다 쓴 화면(2/2, 재생성 버튼 disabled 상태)은 아직 실물로 못 봤다.**
  이번 세션엔 1/2에서 멈췄다. `disabled` 시 문구("오늘의 생성 횟수를 모두 사용했습니다")와
  레이아웃만 다음에 한 번 확인하면 된다.
- **`.idea-selected-card`(프로젝트 선택 후 생성 전 화면에 뜨는 카드) 확대는 CSS만 넣고
  실물 확인을 못 했다** — 결과 화면에서는 `ideaPickerBlock`이 렌더되지 않아 카드가 없다.
  같은 규칙 블록의 팝업 목록 쪽은 실측 확인했으니 값은 신뢰할 만하지만, 생성 전 화면을 한 번
  열어서(횟수 남아있을 때) 눈으로 볼 것.
- **뉴스/채용공고/AI Trend 전체저장의 날짜 선택 기능 — 웹 실측 여전히 안 함(모바일만).**
  날짜를 바꾼 뒤 "새 메모 생성"이 그 날짜로 정확히 들어가는지 풀 플로우도 미확인.
- **AI Trend 외 News/Job의 "기존 메모 → 헤더 크기 유지"는 AI Trend와 같은 코드 경로라
  같이 고쳐졌지만, 실측은 AI Trend로만 했다.** News/Job도 한 번 눌러보면 확실하다.
- **타이핑 렉** — 아래 이전 세션 항목 그대로 유효(실제 IME 입력은 사용자 피드백으로만 확인 가능).
- **[2차 피드백분] "프로젝트에 저장" 팝업의 새 시트 스타일은 DOM 합성으로만 검증했다.**
  2026-08-21로 날짜가 넘어가 Idea 결과가 비어서 실물로 못 열었다. 결과가 있을 때 한 번 눈으로 볼 것.
- **[2차 피드백분] 웹 스크롤바는 Chromium 기준으로만 확인했다.** `::-webkit-scrollbar`는
  Firefox에 없고 거기서는 `scrollbar-width:thin` + `scrollbar-color`만 먹는다(둘 다 넣어뒀으니
  Firefox에서도 얇은 보라 스크롤바로 보이긴 한다). 사용자가 어떤 브라우저를 쓰는지 확인되면
  거기서 한 번 볼 것.
- **타이핑 렉이 완전히 사라졌는지는 이 세션 환경(헤드리스, execCommand로 흉내낸 입력) 기준의
  결론이다.** 사용자의 실제 키보드 입력(IME 한글 조합 포함)에서 어떻게 느껴지는지는 실제 사용자
  피드백으로만 확인 가능 — 다음 세션에 사용자가 "그래도 렉있다"고 하면, 다음으로 의심할 곳은
  Tiptap의 ProseMirror transaction 처리 자체(에디터 라이브러리 레벨)다.
- 이전 세션에서 넘어온 것 중 미확인 상태로 남은 것: Idea Build 결과 본문/부제목 폰트가 최종
  확정인지("부제목만 조금 키우고 나머진 잘 맞춰야 함" 피드백이 있었음, 현재 값 본문14.5px/부제
  16.5px가 최종은 아닐 수 있음).

## 6. 재발 방지 — 이번 세션에서 배운 것 (이전 문서 5절에 추가)

- **"규칙이 적용 안 되는" 경우는 세 가지다 — 세 번째를 이번 세션에 새로 발견했다.**
  (a) 규칙이 없다, (b) 규칙이 있는데 뒤의 규칙이 덮어쓴다, (c) **규칙은 정확한데 그 규칙이 기대하는
  클래스가 마크업에 아예 안 붙어 있다.** (c)가 "프로젝트에 저장 팝업"이 6번이나 안 고쳐진 진짜
  이유였다(`.idea-save-overlay`가 CSS엔 있고 JSX엔 0개). **CSS에서 selector를 찾았으면
  반드시 JSX에서도 그 클래스가 실제로 붙어 있는지 개수를 세라** — 3001과 3000 양쪽에서 세면 즉시 보인다.
- **특이도(specificity) 역전도 "덮어쓰기"의 한 형태다.** 파일 뒤쪽에 있어도 클래스 1개 규칙은
  앞쪽의 클래스 2개 규칙을 못 이긴다. 모바일 전체화면(`.big-postit`)이 `.big-postit.has-insert-banner`
  에게 밀려 위아래 32px이 남은 게 이번 사례다. **"뒤에 있으니 이길 것"이라고 가정하지 말고
  `getComputedStyle`로 실제 적용값을 확인할 것.**
- **레이아웃을 건드리면 안 되는 곳(3001 검증값이 걸려 있는 헤더 등)에서 위치만 옮길 때는
  `transform: translateX()`를 쓸 것.** margin/padding은 flex 형제의 폭 예산을 바꿔서 제목 잘림 같은
  과거 버그를 되살린다(Idea ON 배지 이동에 실제로 적용).
- **글로우/그림자가 옆 텍스트를 뿌옇게 만드는 건 blur 속성 문제가 아니라 페인트 순서 문제일 수 있다.**
  `position:relative` 요소의 box-shadow는 static 형제 **위에** 그려진다. 겹침 여부를 rect로만 보면
  "안 겹친다"고 오판하니 **shadow의 blur 반경까지 더해서** 판단하고, 해결은 텍스트 쪽에
  `position:relative;z-index:1`(레이아웃 무변경)로 하는 게 안전하다.
- **"작성"과 "수정"은 대부분 다른 DOM/다른 CSS 클래스다.** `.memo-form.open`(작성)과
  `.big-postit`(수정)처럼 겉보기엔 같은 기능인데 실제 마크업이 완전히 분리된 화면이 여러 곳에
  있다. 사용자가 "메모 수정할 때"라고 명시하면 작성 쪽 클래스를 고치고 있는 게 아닌지 반드시 재확인.
- **"규칙이 없어서"와 "규칙이 있는데 나중 규칙이 덮어써서"는 완전히 다른 진단이다.** grep으로
  selector가 하나도 안 나오면 전자를 의심하기 쉬운데, 실제로는 같은 selector가 파일 뒤쪽에
  `!important`로 다시 정의돼 있는 경우가 많다(특히 "(N) 무슨무슨 수정" 식으로 날짜별 섹션이
  파일 끝에 계속 쌓이는 이 코드베이스 특성상). **grep한 뒤 반드시 같은 selector가 파일 안에
  몇 번 나오는지 개수를 세고, 있다면 순서대로 다 읽을 것.**
- **outside-press(document mousedown/pointerdown) 패턴이 있는 컴포넌트는 "CSS로 숨겨진 형제
  컴포넌트"까지 의심해야 한다.** 모바일에서 보이는 UI는 하나뿐이지만, 데스크톱용 대응 컴포넌트가
  `display:none`으로 숨겨진 채 같은 트리에 마운트돼 이벤트 리스너를 계속 갖고 있는 경우가 이
  코드베이스에 최소 2건(RadialSelectionMenu, LinkPopover) 있었다 — 비슷한 이중 렌더 패턴이 더 있을
  수 있으니 "모바일에서만 이상하다"는 버그는 이 각도로 먼저 의심할 것.
- **합성 클릭(`.click()`)으로 "정상 동작 확인"이라고 결론 내리지 말 것.** mousedown이 빠진 테스트는
  outside-press race condition을 절대 재현하지 못한다. 이 세션의 실수 두 건(RadialSelectionMenu,
  LinkPopover) 모두 이전 세션이 합성 클릭으로 "확인됨"이라 보고했던 것들이다.
- **CSS로 "안 보인다"는 걸 "버그가 없다"로 착각하지 말 것.** 사선/이탤릭 버그는 코드 스캔(회전
  transform 검색)으로는 0건이었지만 실제로는 폰트 렌더링 문제였다 — 스크린샷으로 실물을 보기 전엔
  "코드에 없으니 버그 아니다"라고 성급히 결론내지 말 것.
- **3001(mobile-responsive 참고본)과의 selector diff는 두 방향 모두 봐야 한다**: (a) 3001엔 있는데
  3000엔 없는 것(누락 포팅), (b) 3000에만 나중에 추가된 override가 3001 값을 덮어쓰는 것(회귀).
  이번 세션 Focus/Idea 헤더 버그는 (a)를 고친 뒤에도 (b) 때문에 안 고쳐졌었다 — 한쪽만 보고
  끝내지 말 것.
- **폰트 크기는 이제 무조건 `--memo-base-font` 변수를 거쳐야 한다.** 새로운 화면에 본문 텍스트를
  추가할 때 숫자를 직접 박지 말고 `font-size: var(--memo-base-font)`를 쓸 것 — 안 그러면 웹/모바일
  2px 차이 규칙이 조용히 깨진다.
- 헤드리스 환경에서 CSS keyframe 애니메이션(`postitPop` 등)은 `getAnimations()`가 `startTime: null`을
  반환하며 컴포지터 프레임이 안 돌아 opacity:0에 멈춰 있는 경우가 있다 — 실제 버그가 아니라 환경
  아티팩트이니 `*{animation:none!important;opacity:1!important}` 주입 후 재측정할 것.
  **그리고 이건 opacity만의 문제가 아니다 — `postitPop`은 `scale(.86)`에서 멈춰서 rect를 14% 작게
  만든다(3절 경고 참고). 측정 전에 무조건 애니메이션을 죽이고 시작하는 걸 기본 절차로 삼을 것.**
- **테스트로 사용자의 실제 데이터를 건드렸으면 반드시 되돌릴 것.** 이번 세션에 검증용으로 사용자
  메모에 전체저장 블록을 삽입했고, 확인 후 undo로 되돌려 원본만 남긴 것을 innerHTML로 재확인했다.
  자동저장이 걸린 화면이 많으니 "확인만 하고 닫으면 되겠지"라고 넘기지 말 것.

## 7. 사용자 성향 메모 (누적, 이번 세션 갱신)

- 한국어로 대화 요청함. 피드백은 번호를 매겨 몰아서 주고, "치명적 버그"로 명시한 항목은 최우선 처리.
- **같은 문제를 여러 세션에 걸쳐 반복 지적하면 실제로 원인이 안 잡힌 것이다 — "이번엔 진짜 고쳤다"는
  자기 확신보다 실측(스크린샷/좌표/실제 이벤트 시퀀스)이 항상 먼저다.** 이번 세션에 5번 이상
  반복된 두 항목(웹 메모 수정 경계, 투데이포커스 헤더)이 실제로는 "이전에 엉뚱한 곳을 고치고 있었다"는
  게 밝혀졌다 — 사용자가 화를 낼 정도로 반복됐을 때는 변명하지 말고 처음부터 다시 스캔.
- 스크린샷/이미지를 첨부하면 그게 가장 정확한 증거다 — 텍스트 설명만으로 판단하지 말고 이미지를
  최우선으로 재현·대조할 것.
- 토큰/속도에 예민함 — 확신 있는 수정 위주로 빠르게, 라이브 검증 횟수를 아껴 쓸 것.
- 비밀번호/로그인, OAuth 인증처럼 Claude가 대신 할 수 없는 요청이 오면 "예전엔 됐다"는 말을
  하더라도, 이 환경(non-interactive)의 구조적 제약을 담백하게 설명하고 대안(사용자가 직접
  `/mcp` 인증, 또는 DB에서 직접 데이터 삭제)을 제시할 것 — 거절이 맞는 판단이다.
- 세션 끝나기 전 handoff 갱신을 항상 기대함 — 매 세션 종료 시 이 문서를 갱신하는 걸 기본값으로 여길 것.
- 커밋은 사용자가 명시적으로 요청하기 전엔 하지 않음(두 세션 모두 요청 없었음, working tree에
  변경사항 그대로 누적돼 있음 — 다음 세션 시작 시 git status로 다시 확인).
- **강한 표현(욕설 포함)으로 불만을 표시할 때는 그 항목이 여러 번 반복 실패한 것이다.** 이번
  세션의 "프로젝트에 저장 팝업"이 그랬고, 실제로 원인은 CSS 값이 아니라 **클래스가 안 붙어 있던
  것**이었다. 이럴 때 값을 또 조정하는 건 7번째 실패로 가는 길이다 — **"이 규칙이 정말 이 요소에
  적용되고 있는가"를 `getComputedStyle`로 먼저 확인**하고 나서 값을 손댈 것.
- 요청 목록에 "뉴스/채용공고 등"이라고 쓰면 **AI Trend Briefing도 포함**이다(이번 세션에 사용자가
  명시). 세 화면은 거의 항상 같은 코드 경로를 공유하니 하나 고칠 때 셋 다 확인할 것.
