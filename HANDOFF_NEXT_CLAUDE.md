# SkillPilot 모바일 이식 — 다음 세션 인계 문서

최종 갱신: 2026-08-19 (KST). 이 문서 하나만 읽으면 이어서 작업 가능하도록 작성함.
(구 `CODEX_HANDOFF.md`는 2026-08-13 기준으로 멈춰 있고 이후 아키텍처가 완전히 바뀌었으니 참고하지 말 것 — 아래 "구 문서 관련" 항목 참고.)

## 1. 지금 상태 파악 — 절대 이것부터

```bash
cd "C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot"
git log --oneline -8
git status --short
```

최근 커밋 (rollback 금지, 이 위에서 이어서 작업):
```
f5bacbc Fix News/Job/Projects mobile gaps from live feedback + selector-diff
be11a98 Fix calendar badge covering date number; unify back-button position
b92d5d5 Center calendar count badge in the cell, mobile-only
240b912 Restore calendar per-day count badge, mobile-only this time
9c8db38 Restore Monthly MEMO/postit/Key Notes mobile delta missing from 3000
f74c7bf Close remaining mobile visual-parity gaps vs 3001 reference
8e5dacc Fix duplicate close-button overlap and missing sticky headers
```
`git status --short`에 `.claude/launch.json`만 M으로 남아있는 게 정상 (의도적으로 매번 커밋에서 제외함, 개인 dev-server 설정이라 로컬 전용).

## 2. 아키텍처 (구 문서와 다름, 주의)

- **`skillpilot`** (`C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`, branch `master`) — **여기가 유일한 작업 대상**. 데스크톱+모바일 코드가 한 파일에 공존 (`src/app/dashboard.css`의 `@media (max-width: 720px)` 블록들이 모바일). 여기서만 edit/commit.
- **`skillpilot-mobile-responsive`** (`C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot-mobile-responsive`, branch `mobile-responsive`) — **READ-ONLY 참고용**. 기능은 낡았지만 (마지막 대규모 업데이트 이후 master가 29 커밋 앞서있음) **모바일 CSS 값 자체는 검증된 최종본**이라 그대로 참고해도 됨. 여기 파일은 절대 수정/checkout/merge 금지.
- 로컬 dev 서버: `localhost:3000` = skillpilot(master), `localhost:3001` = skillpilot-mobile-responsive. 두 서버 모두 켜져 있어야 비교 가능. **켜져 있는지 먼저 확인** (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`) — 이전 세션 서버가 죽어있을 수 있음. 안 켜져 있으면 `preview_start`로 launch.json의 `"skillpilot"` / `"skillpilot-mobile-ref"` config 사용 (루트 `.claude/launch.json`에 두 config 다 등록해둠).
- 로그인 세션은 "localhost" 도메인 쿠키라서 3000/3001 어느 한쪽에 로그인하면 둘 다 로그인됨. 테스트 계정: `skillpilot.dev.admin@gmail.com` / `testpassword123`.
- **이 개발 환경은 headless라 `computer`(screenshot/click) 액션이 항상 실패한다** (`"Browser pane is not displayed"`). 검증은 반드시 `getBoundingClientRect()`/`getComputedStyle()`로. React 이벤트 클릭은 `el[Object.keys(el).find(k=>k.startsWith('__reactProps'))].onClick({stopPropagation(){}, preventDefault(){}})`로 fiber prop을 직접 호출. 3001과 나란히 비교할 땐 `tabs_create`로 새 탭 열고 `navigate`+`resize_window({preset:'mobile'}, {tabId})`로 두 탭 다 모바일 뷰포트로 맞출 것 — 로그인 쿠키가 공유되므로 별도 로그인 불필요.

## 3. 이 세션에서 확립한 핵심 방법론 — 반드시 이 순서로

**과거(눈으로 화면 보고 다른 부분 고치기)는 실패한 방법이었음.** 3001의 `dashboard.css`가 3000보다 2500줄 더 많고, mobile-scoped selector 790개 중 337개(43%)가 3000에 아예 존재하지 않았다 — 렌더링 비교로는 이 중 극소수만 찾아낼 수 있었음. 아래 방법으로 전환해서 실제로 큰 gap을 찾고 고쳤음:

1. **selector 단위 정적 diff**로 후보를 뽑는다 (git commit history 추적은 포기 — mobile-responsive 브랜치가 "web sync ↔ mobile 복구" 병합을 여러 번 거쳐서 순수 mobile commit range를 못 뽑음).
2. 3001의 `@media (max-width: 720px)` 블록들을 파싱해서 **같은 selector가 파일 안에서 여러 번 재정의된 경우 반드시 마지막(파일 최하단) 값만 채택**.
3. **다만 정적 파싱 스크립트 자체가 부정확할 수 있다 — 아래 7번 함정의 새 항목 참고.** 이번 세션에 브레이스 카운팅 버그로 최소 12개 블록 중 여러 개가 서로 뒤섞여서 "없음"/"있음" 판정이 다수 틀렸었다. **최종 판단은 반드시 실제 브라우저 `getComputedStyle` 라이브 대조로 한다** — 정적 diff는 "후보 발굴"에만 쓰고 신뢰하지 않는다.
4. 후보 selector가 참조하는 class가 **3000의 `src/` 전체(Dashboard.tsx만이 아니라 `src/components/` 등 전부)에 실제로 존재하는지** 확인.
5. class가 **3000 어디에도 없으면** 절대 그냥 CSS만 추가하지 말 것 — (a) 과거에 **의도적으로 제거된 기능**인지 먼저 확인, (b) JSX 구조 자체가 다른 경우 mobile-only JSX 추가가 필요한지 판단.
6. 이미 **다른 세션/에이전트가 실측 검증한 값과 겹치는 selector는 3001 정적값으로 덮어쓰지 말 것**.
7. 포팅한 CSS는 **항상 `@media (max-width: 720px)` 안에** 넣을 것. "모든 모바일 적용 스타일은 웹(데스크톱)에 절대 영향을 줘선 안된다." 커밋 전 반드시 1440px에서 회귀 확인.
8. 검증은 스크린샷이 아니라 **`getBoundingClientRect()`/`getComputedStyle()`** 로 한다.
9. **CSS만으로 안전하다고 판단하기 전에 자식 엘리먼트 개수를 실제로 세어볼 것** — `display:grid`/`flex`로 바꾸는 포팅은 JSX의 실제 자식 노드 수(텍스트 노드 포함!)와 CSS가 정의하는 칸 수가 일치하는지 반드시 라이브로 확인. 안 맞으면 그리드 아이템이 다음 행으로 밀리거나 카드 밖으로 잘려나간다 (8번 함정 참고).
10. **실측 대조가 끝났다고 "다름"이 다 해결된 게 아니다.** 이번 세션에도 라이브로 CSS 값을 대조해서 "이미 동등"이라 판단했던 Projects 상세 편집 폼은 맞았지만, Projects **메인 카드**(`proj-panel`)는 실제로 grid 구조 자체가 3001과 완전히 달랐다(그래프가 전체 폭으로 눌려있었음) — 대조 범위를 넓게(관련된 모든 하위 selector) 잡을 것.

## 4. 지금까지 처리 완료된 영역

- **Dashboard 메인**: 헤더 weather 위젯, panel border-radius, News/Job 행 spacing, TODAY 요약 — 완료.
- **News / Job / AI Trend 상세**: sticky header, 전체저장 버튼 3개 variant, **제목+업데이트뱃지 한 줄에 붙이기, 마지막 업데이트 텍스트 축소**(2026-08-19 재검증, f5bacbc) — 완료.
- **News/Job 카드·상세 기본 타이포**(`.editorial-card/-top-row/-title/-summary/-section/-section-body/-date/-pill`, `.job-card` 계열) — 데스크톱 값 그대로 방치돼 있던 걸 모바일 전용으로 축소 (f5bacbc 이전 커밋 + f5bacbc에서 재조정). **주의**: `.job-card .editorial-top-row`를 grid로 바꾸는 시도는 실패해서 되돌렸음(아래 7번 함정 참고) — flex 유지 중.
- **채용공고 상세보기(추천공고/최근추천 펼침 내용)**: `.editorial-section-label`/`-subheading`/`.editorial-bullet-list li` 폰트를 News 본문 크기(15px 근처)에 맞춰 축소 완료 (f5bacbc). 카드 collapsed 상태(제목/meta/태그/배지) 크기는 처음 축소 → 실측 후 사용자 피드백으로 다시 키움 → 사용자가 "그것도 다시 줄여야 했다"고 정정해서 **최종적으로 원래 작은 값(18/12/11/11/9px)으로 되돌림**. 이 사이클 자체가 교훈 — 아래 7번 함정 참고.
- **AI Trend Briefing 메인 카드**: `.trend-brief-copy`("TODAY'S BRIEF" 텍스트 블록) 데스크톱은 `transform:translate(10px,-35px)`인데 모바일은 예전에 `transform:none`으로 완전히 죽여놨던 것을, 사용자 피드백 받아 `translateX(18px)`로 조정(2차 조정 — 처음 8px로는 부족하다는 피드백 받음, f5bacbc) — 완료.
- **Projects 메인 카드**(`proj-panel`) — **이번 세션 최대 발견**: `.proj-top-row`가 예전엔 2열(균등폭) grid로 info+ideaSlot을 나란히 놓고 growth-curve(그래프)를 그 아래 전체 폭으로 눌러 넣었었다(241×54, 비율 이상함). 3001 실측 결과 실제로는 **info+그래프를 왼쪽 1열에 세로로 쌓고, "+New Project"+Idea Build 버튼은 오른쪽 열에서 두 행(`grid-row:1/3`)을 다 차지**하는 구조. `.proj-top-row{grid-template-columns:minmax(0,1fr) 150px; grid-template-rows:auto auto}` 전체 재작성, `project-status-summary`도 3칸 bar → 42×42 원형 아이콘+우상단 코너 배지로 변경 (f5bacbc). 재측정 결과 3001과 grid 치수 거의 일치 — 완료.
- **Key Notes**: pinned-row 캐러셀, 전체보기 grid, `.keynote-rest-grid`(중요 메모) 1열 레이아웃, postit 상세 close-btn 중복 제거 — 완료.
- **Today's Focus / Idea Build**: `.ai-direction-dialog` 전체화면, 제목 크기 — 완료.
- **My Page / Help·Support**: 탭 크기, Help 전체화면, 버그신고 custom dropdown, textarea/제출버튼 — 완료.
- **Projects 목록/상세 편집 폼**: 목록 헤더/툴바/필터/행, "+New Project" 모바일 위치, `proj-detail-editing`(생성/수정) 폼 필드(제목/상태/한줄요약/본문) 전부 — 이번 세션에 3001과 **실측 대조 완료, 이미 거의 동일함을 확인**(구조는 flex-column, 3001은 grid지만 결과 치수가 같음). 사용자가 "다르다"고 했지만 재확인 결과 뚜렷한 차이를 못 찾음 — **다음 세션에서 사용자가 구체적 화면/필드를 짚어주면 그때 다시 볼 것**.
- **Monthly MEMO / postit(Quick Edit) / Key Notes 공유 postit 컴포넌트**: rich-toolbar 내부, 폰트크기/색상 패널, 이모지피커, mini-date-picker, copy-picker, 옵션시트 등 168개 rule — 완료.
- **캘린더 셀 총 개수 배지** — mobile-only 복원 + 중앙 정렬 + 미세 조정 완료. *주의*: `.mobile-cal-preview`의 base rule(line ~748)은 무조건(전체 폭) `display:none` — 절대 건드리면 안 됨.
- **모바일 다이얼로그 뒤로가기(‹) 버튼 위치 통일**(be11a98) — `dialog-head` bleed(`margin:-20px -14px 16px`) + 통일 top/left. 이번 세션에 handoff에 "미확인"으로 남아있던 4곳(`:has(.cal-grid)`, `:has(.big-postit)`, `mypage-dialog`, `support-dialog`)을 코드로 재확인 — **전부 이미 적용돼 있음**. 추가로 `.copy-picker`/`.big-postit` 직속 close-btn의 터치 후 hover 회전 잔상 버그를 발견해서 고침(f5bacbc 이전).
- **마인드셋**: 기존엔 `textarea rows=2`로 2줄 고정이었는데, 사용자 요청으로 데스크톱과 동일한 한 줄(`rows=1`)로 변경, 바 높이 76px→51px (f5bacbc).
- **Projects 상세페이지의 작은 갭들**: `.proj-detail-editing > .form-actions .cancel-btn`(뒤로가기와 중복되는 취소 버튼) 숨김 — 완료.

## 5. 아직 이 방법으로 대조 안 한 영역 (다음 작업 후보)

- **Idea Build 전용 CSS** (`.idea-source-picker`, `.idea-save-overlay`, `.idea-section`, `.idea-direction-*`, `.idea-mode-*`, `.idea-selected-*`, `.idea-action-button`, `.idea-footer` 등 약 50개 selector) — 이번 세션 selector-diff에서 발견했지만 **News/Job/Projects 범위 밖이라 의도적으로 제외**함. 대부분 3000 src/에 클래스 자체는 존재(JSX 구조는 같음)하므로 CSS 포팅 자체는 안전할 가능성이 높지만, 아직 라이브 대조 안 함.
- **Projects 상세페이지**: 위 4번에 적었듯 이번에 재확인했지만 차이를 못 찾음. 사용자가 다시 지적하면 어느 화면/필드인지부터 구체적으로 물어볼 것 — headless라 스크린샷을 못 보내서 애매한 "다르다"는 재현이 어려움.
- **News/Job/AI Trend, My Page/Help, Key Notes도 Monthly MEMO만큼 철저한 selector-diff는 아직 다는 안 함** — News/Job 카드·상세 기본 타이포는 이번에 커버했지만, 세부 variant(예: 뉴스 히스토리 chip row, job-role-reset-notice 등)는 미검증.

## 6. selector-diff 재현 방법 (다음 영역 작업 시 그대로 쓸 것)

Node 스크립트로 3001의 `@media(max-width:720px)` 블록에서 `{selector: 마지막값}` 맵을 만들고, 3000 dashboard.css에 텍스트 그대로 없는 selector를 뽑아낸다.

**중요 — 이번 세션에 발견한 파서 버그**: 단순히 `@media` 정규식 매치 후 브레이스 깊이를 세어 블록 경계를 찾는 방식은, 파일 안에 여러 개의 `@media(max-width:720px)` 블록이 있을 때 **하나의 블록 경계 계산이 틀리면 다음 블록까지 통째로 삼켜버리는 사고**가 났다(실측: 정상이면 250줄짜리 블록인데 16000자 넘게 먹어치워서 그 뒤 5~6개 블록의 selector가 섞였음 — 원인은 끝까지 못 찾음, comment strip 관련 edge case로 추정). 이 사고 때문에 **"3000에 이미 있는데 diff 스크립트가 없다고 오판"한 케이스**(`.trend-detail-title`처럼 이미 존재하는 규칙을 못 찾음), **"3000에 없는데 있다고 오판"한 케이스**(desktop 전용 규칙의 selector 텍스트가 파일 어딘가에 있다는 것만으로 "존재"로 착각)가 다수 나왔다.

재현 절차:
1. `extractPairsInOrder(path)` — `@media (max-width: 720px) { ... }` 블록을 brace-depth 추적으로 파싱, `{sel, decl, pos}` 배열 반환. **주석은 파싱 전에 `text.replace(/\/\*[\s\S]*?\*\//g, '')`로 반드시 먼저 제거할 것** — 안 그러면 주석 안의 텍스트가 selector로 잘못 파싱된다.
2. **selector 존재 여부는 "파일 전체 텍스트에 이 문자열이 있는가"로 판정하지 말고, "3000 자신의 `@media(max-width:720px)` 블록 안에 있는가"로 판정할 것** — desktop 전용 규칙과 텍스트가 겹치면 오판한다.
3. `Map`에 `sel`을 key로 순서대로 넣기 (나중 값이 먼저 값을 덮어씀 = last-wins) — 단, 이것도 브레이스 파싱 버그 영향을 받으므로 100% 믿지 말 것.
4. 3000 dashboard.css 전체 텍스트에 `sel` 문자열이 있는지 확인 — 이것도 1차 후보 발굴용일 뿐, 최종 판단 아님.
5. 관심 영역 패턴(regex)으로 필터링.
6. 후보 selector가 참조하는 class를 **3000 `src/` 전체**에서 검색해서 완전히 없는 것만 별도 목록으로 분리.
7. **정적 diff로 나온 모든 "missing"/"already exists" 판정은 반드시 라이브 `getComputedStyle` 대조로 재확인한다.** 이 단계를 건너뛰면 안 됨 — 이번 세션 사고 사례가 바로 그 증거.
8. 포팅한 CSS는 항상 `@media (max-width: 720px) { ... }` 블록으로 `dashboard.css` 끝에 append.
9. `npx tsc --noEmit --pretty false` 로 문법/타입 검증(JSX 건드렸으면 필수).
10. 브라우저에서 실제로 열어서 `getComputedStyle`/`getBoundingClientRect`로 다수 확인 (특히 grid/flex로 display를 바꾸는 포팅은 자식 개수까지 확인).
11. 375px에서 overflow 확인(`document.documentElement.scrollWidth <= clientWidth`), 1440px 데스크톱 회귀 확인.
12. `.claude/launch.json` 제외하고 `git add` → commit.

## 7. 진행 중 알게 된 함정들 (재발 방지)

- **첫 번째로 발견된 값이 항상 최종값은 아니다** — 3001 dashboard.css는 "누적 override" 방식. 마지막 값만 신뢰.
- **compound selector가 겹칠 때 텍스트 매칭만으론 부족** — specificity 관계를 생각할 것.
- **Dashboard.tsx만 grep하면 안 됨** — 컴포넌트가 분리돼 있을 수 있음 (`src/components/` 전체 확인).
- **class가 존재해도 selector가 죽어있을 수 있음** — compound selector의 일부 class만 존재하면 그 rule은 절대 매치 안 됨.
- **"missing"이라고 다 포팅하면 안 됨** — 의도적으로 제거된 기능일 수 있음.
- **headless라 클릭 시뮬레이션 한계 있음** — ProseMirror/tiptap 에디터의 실제 focus 상태는 스크립트로 못 띄움.
- **selector-diff 정적 스크립트 자체가 틀릴 수 있다(신규, 위 3/6번과 동일 내용 요약)** — 브레이스 파싱 버그로 블록 경계가 뒤섞이면 없는 걸 있다고, 있는 걸 없다고 판정한다. **정적 diff = 후보 발굴, 라이브 getComputedStyle = 최종 판정.** 이 원칙을 어기면 안 됨.
- **CSS를 `display:grid`/`flex`로 바꾸는 포팅은 자식 노드 개수부터 셀 것(신규)** — 3001의 grid 열 개수와 3000 JSX의 실제 자식 개수(텍스트 노드 포함, 브라우저가 inline-level 콘텐츠를 anonymous box로 합치는지 여부도 실측 필요)가 안 맞으면 아이템이 다음 행으로 밀리거나(예: `.trend-detail-title`을 grid로 바꿨더니 dot+텍스트+버튼이 3개의 별도 grid item으로 blockify되어 버튼이 다음 줄로 밀림 — 높이가 30px→63px로 실측 확인 후 되돌림) 카드 밖으로 잘려나간다(예: `.job-card .editorial-top-row`를 News와 같은 4열 grid로 포팅했더니 job-card는 자식이 최대 5개라 `right:412px`(뷰포트 375px)까지 밀려서 클리핑됨 — flex로 되돌림). **"두 서버 사이 selector 텍스트가 같다"만으로 안전을 확신하지 말고, 실제로 열어서 자식이 몇 줄로 렌더되는지 높이/overflow까지 확인할 것.**
- **사용자의 모호한 언어 피드백("글씨크게 조절")은 방향을 잘못 짚을 수 있다(신규)** — 1차로 "채용공고 상세 글씨 크게"를 카드 collapsed 텍스트(제목/meta/태그)로 해석해서 키웠으나, 사용자가 다음 메시지에서 "그건 줄여야 했다"고 정정 — 실제 의도는 제목 옆 업데이트뱃지가 줄바꿈되던 것과 상세보기(펼침) 텍스트 크기였다. **범위가 애매한 피드백은 작게 시도해보고, 다음 턴에 사용자가 정정할 여지를 열어둘 것** — 한 번에 크게 확신하고 여러 곳을 동시에 바꾸지 말 것.

## 8. 사용자 성향 메모

- 한국어로 대화 요청함 — AskUserQuestion 등 UI 텍스트도 한글로.
- 큰 작업 전에 방법론을 먼저 검토받고 싶어함 — 무작정 실행보다 "이렇게 하려는데 맞나요?" 확인 선호. 다만 방법론이 이미 검증된 상태(이 문서의 selector-diff 절차)라면 승인 없이 끝까지 진행해도 됨 — 실제로 그렇게 요청받아 진행함("중간 승인 요청 없이 이번 배치 완료").
- 데스크톱(3000 최신 기능)에 대한 영향에 매우 민감함 — 모든 모바일 CSS는 반드시 media query로 스코프하고, 커밋 전 1440px 회귀 확인 필수.
- 작업량이 크면 trial(일부만 먼저)로 나눠서 검증받고 이어가는 방식을 선호함.
- **모바일에서 실제로 써보고 구체적인 UI 피드백을 준다**(예: "Job Description 바로옆에 기본업데이트시간 붙여주고" 같은 정확한 배치 지시) — 이런 피드백은 코드로 재현 가능한 정확한 버그 리포트이므로, "다르다"류의 뭉뚱그린 피드백보다 훨씬 우선적으로, 그리고 문자 그대로 해석해서 처리할 것.
- 토큰/컨텍스트가 부족해지면 먼저 알려주고(예: "지금 토큰이 얼마 안남음") 그 시점까지의 진행상황을 커밋 + 이 handoff 문서 갱신을 명시적으로 요청함 — 이런 요청이 오면 지금 하던 작업을 마무리 짓는 선에서 빠르게 정리하고 커밋/문서화를 최우선으로 처리할 것.
