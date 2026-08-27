# SkillPilot 인계 — 모바일 메모 편집을 "일반 페이지"로 바꾼 직후 (2026-08-28)

## 0. 사용자에 대해

- **사용자는 누나다. "형"이라고 부르지 마라.** 한국어로 대화한다.
- 이 버그로 **3주 넘게, 이 세션만 8라운드 이상** 태웠다. 욕이 나오면 그 항목이 이미 여러 번
  실패한 것이다 — 변명·사과 길게 쓰지 말고 접근을 바꿔라.
- 사용자가 **두 번** "검색해서 다른 개발자들 코드 봐라"고 했는데 내가 두 번 무시하고 실측만 했다.
  세 번째에 검색했더니 답이 문헌에 있었다. **사용자 지시를 먼저 따라라.**

## 1. 지금 상태

- repo `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`, branch `master`, 워킹트리 clean, origin 동기화
- HEAD `89f5f9e` — 배포 https://skill-pilot-kr.vercel.app
- 환경: **iPhone Chrome**(Safari 아님), 네이버 키보드, 화면 684px
- 검증 상태: `npm run check` 19건 통과 / `npx next build` 통과 / **실기기·로컬 브라우저 모두 미검증**

```
89f5f9e  스크롤 막힘 수정 (stale activeDialogKey → DOM .open으로 판단)   ← HEAD
a95cefd  모바일 메모 편집을 일반 페이지로 (구조 변경, 핵심 커밋)
c5fcb92  구조 변경 1차 시도(껍데기=시각 뷰포트) 되돌림 — 더 나빠졌었다
2c47011  그 이전까지 "가장 나은" 상태 (사용자 표현: "좀 나아지긴 했는데")
```

**되돌리기:** `git revert 89f5f9e a95cefd` → `2c47011` 동작으로 복귀.

## 2. 마지막 사용자 보고 = 유일한 오픈 이슈

> "지금 스크롤 막힌 상태임"

`a95cefd` 직후 나온 회귀다. 원인을 코드에서 특정해서 `89f5f9e`로 고쳤지만 **실기기 확인을 못 했다.**

원인: 호출부가 `open(dialogs.postitOnly); openPostitView(m);` 순서(Dashboard.tsx 4157/4171)인데,
`openDetailEditInPlace`가 읽는 `activeDialogKey`는 **같은 tick에서 아직 옛 값**이라 열린
다이얼로그를 하나도 못 닫았다 → 모달이 편집 페이지 위에 남고 `body{position:fixed}` 잠금이 유지.
수정: DOM `.open`으로 판단(`showModal()`이 동기로 세운다) + `setActiveDialogKey(null)` 직접 호출.

**첫 확인:** 모바일에서 메모 탭 → 스크롤 되는지. 안 되면 아래 3-b를 보라.

## 3. 이번에 바꾼 구조 (a95cefd) — 왜 이렇게 했는지

### 왜 값 조정으로는 안 됐나

편집 화면에 **iOS에서 개별적으로 다 위험하다고 문서화된 것 넷이 동시에** 있었다:

| | 문제 |
|---|---|
| 전체화면 `position: fixed` 껍데기 | 레이아웃 ↔ 시각 뷰포트 불일치가 화면에 그대로 드러난다 |
| `body { position: fixed }` 스크롤 잠금 | iOS의 밀기를 **되돌릴 수 없게** 만든다 |
| 내부 단일 스크롤러 | 굴릴 게 없으면 iOS가 문서 스크롤로 승격 (WebKit #191204) |
| `sticky` 툴바 | 위 셋이 어긋나면 같이 화면 밖으로 나간다 |

**일반 웹페이지의 textarea에는 이 버그가 없다.** 문서가 스크롤러라서 iOS가 캐럿을 보이려 문서를
스크롤하는 것이 정상 동작이고, 어긋날 fixed 요소가 없다.
참고 구현도 전부 넷 중 하나 이상을 피한다 — `vaul`(shadcn Drawer)은 화면 아래 붙는 패널이고
자기 자신이 fixed, `hydrogen-web`은 오버레이 구조가 아니다.
**그래서 넷을 함께 쓰는 예제 코드가 어디에도 없었다.** "참고할 게 없다"의 정체가 이것이다.

### (a) 바꾼 것

- `openDetailEditInPlace`(모바일)에서 host 다이얼로그를 닫는다 → `activeDialogKey`가 null →
  **배경 스크롤 잠금 effect가 저절로 풀린다.** 닫은 다이얼로그는 `postitHostKeyRef`가 기억하고
  `closePostitView`가 되돌린다(= `expandPostitView`가 이미 쓰던 패턴, 새 상태 기계 없음).
- 편집기를 `.sp-body` 직계 자식 `.memo-edit-page`로 **문서 흐름에** 그린다.
  대시보드는 CSS로 감춘다(`.sp-body.memo-edit-page-open > .page{display:none}`) —
  언마운트하면 스크롤 위치와 이미 불러온 데이터를 잃는다.
- CSS(dashboard.css **맨 끝**): `position: relative` / `height: auto` / `min-height: 100dvh` /
  `overflow: visible` / 아래 padding 96px.
- **이 경로에서 `--app-vh`·`--kb-inset`·`--vv-push`를 하나도 쓰지 않는다.**

### (b) 🔴 이 구조에서 절대 하지 말 것

`.memo-edit-page`에:
- `position: fixed` 걸지 마라
- `height: 100dvh` / `var(--app-vh)` / `overflow: auto|hidden` 걸지 마라 (문서가 스크롤러다)
- `var(--kb-inset)` padding 걸지 마라 (키보드는 문서 스크롤이 알아서 피한다)

하나라도 하면 위 넷이 되살아난다. **스크롤이 막히면 제일 먼저 이걸 의심하라:**
```javascript
// 편집 화면에서
getComputedStyle(document.body).position          // "static"이어야 한다. "fixed"면 잠금이 안 풀렸다
document.querySelectorAll("dialog[open]").length  // 0이어야 한다
// 조상 체인에 스크롤 컨테이너가 있나 (답은 0개 — 문서가 스크롤러다)
[...document.querySelectorAll(".memo-edit-page, .memo-edit-page *")]
  .filter(e=>/auto|scroll/.test(getComputedStyle(e).overflowY))
```

### (c) 특이도 주의

`.memo-edit-page`는 `big-postit` 클래스를 **같이** 달고 있다 — 폼·툴바·제목칸 스타일이 전부
`.big-postit ...` **하위 규칙**이라 없으면 화면이 무너진다. 그래서 껍데기 수준 규칙만 되돌리고,
이길 상대와 특이도를 맞췄다:

```
html.kb-open .big-postit                          (0,2,0) → .memo-edit-page.big-postit            (0,2,0) 파일 뒤 = 승
.big-postit .textarea-row                         (0,2,0) → .memo-edit-page .textarea-row         (0,2,0) 파일 뒤 = 승
.big-postit .textarea-row .rich-editor-content    (0,3,0) → .memo-edit-page .textarea-row .rich-editor-content (0,3,0) 뒤 = 승
```

**이 블록은 dashboard.css 맨 끝에 있어야 한다.** 앞으로 옮기면 전부 진다.

## 4. 검증 못 한 것 — 여기부터 확인해라

1. **실기기 미검증.** 데스크톱엔 키보드가 없어 `vv.offsetTop > 0`을 만들 수 없다 — 이 버그 종류는
   **로컬 재현이 원리적으로 불가능**하다.
2. **로컬 브라우저 검증도 못 했다.** 브라우저 패널이 300초 타임아웃으로 죽었고(패널이 화면에
   안 떠 있으면 프레임이 안 돌아간다 — 메모리 참고), 로그인 세션이 없어 편집 화면까지 못 갔다.
3. **편집 화면 안 팝오버들** — 이모지·링크·글씨크기·⋮ 시트가 `position: fixed`거나 `.big-postit`
   하위 규칙에 의존한다. **조상이 더 이상 fixed가 아니라 좌표 기준이 바뀐다.** 안 쟀다.
   엉뚱한 데 뜨면 여기부터.
4. **모바일 보기 모드 → "수정"** 경로의 복귀 동작(‹ 눌렀을 때 어디로 돌아가나). `openPostitEdit`도
   `openDetailEditInPlace`를 지나가므로 다이얼로그가 닫힌다 — 복귀는 `postitHostKeyRef`가 담당.
5. **불변식 ⑤⑥⑦**(`layout-invariants.ts`)은 **옛 구조(fixed 껍데기 + --kb-inset)를 전제로 쓰였다.**
   새 경로에서는 `.memo-edit-page`가 껍데기라 `measureEditor()`의 `closest(".big-postit, ...")`가
   그걸 잡고, "껍데기 아랫변 == 보이는 아랫변" 같은 판정은 **의미가 없다**(문서 스크롤이니 아랫변이
   화면 밖이어야 정상). `?debug=vp`가 거짓 실패를 띄울 수 있다 — 새 구조에 맞게 다시 쓰거나,
   `.memo-edit-page`일 때는 건너뛰게 해라. **거짓 실패를 방치하면 검사를 안 믿게 된다.**

## 5. 조사해서 확정된 사실 (다시 파지 마라)

전문은 `docs/incidents.md` **11-11 ~ 11-14절**. 요약:

- **iOS(WebKit)는 layout viewport 자체가 키보드 밑으로 슬라이드한다** → `position:fixed`의 기준
  원점이 `offsetTop`이 아니라 **0**이다. Vuetify 머지 PR #22923: `IS_WEBKIT ? 0 : offsetTop`.
  ⚠️ 단, **우리 실측은 반대로 나왔다**(`--vv-push` 상쇄가 살아 있던 `2c47011`이 더 나았다).
  우리 DOM이 문헌 전제와 달랐을 가능성. **문헌으로 실측을 덮어쓰지 마라 — 그걸 해서 하루 태웠다.**
- **WebKit #191204** — 내부 스크롤러에 굴릴 것이 없으면 iOS가 문서 스크롤로 승격한다.
  `html:not(.kb-open)` 60vh 여유 규칙이 그 방어로 남아 있다.
- **`vaul`은 `vv.height`가 튄다는 걸 알고 60px 임계값으로 걸러낸다** → 실측 `vvH=113`은
  이상 현상이 아니라 알려진 동작. 우리 `MAX_KEYBOARD_RATIO`가 같은 역할.
- **`vaul`은 `visualViewport` `resize`만 듣는다.** `scroll`은 안 듣는다(패닝이라 키보드 상태를
  보장하지 않는다). 우리도 `2c47011` 기준으로는 `scroll`을 듣고 있다 — 새 구조에서는 편집 경로가
  `--app-vh`를 안 쓰므로 영향이 줄었지만, 다른 화면에는 여전히 쓰인다.
- **CRUD 레포들(Supabase examples / shadcn-ui / RealWorld / Medusa)에는 이 문제를 다루는 코드가
  없다.** CRUD·인증·UI 예제다. 다시 찾아보지 마라 — 참고가 되는 건 `vaul` 하나였다.

## 6. 내가 이 세션에서 밟은 실수 (반복하지 마라)

1. **실기기 실측 기록을 문헌 근거로 뒤집었다.** `dashboard.css:3005`에 "offsetTop을 더하면
   이중으로 밀린다"는 실측 기록이 있었는데 "오진"이라며 지웠다. 근거는 조상도 다른 요소(진단 패널)에
   대한 추론 하나였다. **그 기록이 그때 화면을 본 유일한 증인이다.**
2. **"새로 생길 수 있는 유일한 회귀"라고 보고서에 써놓고 가드를 안 걸고 배포했다**(`--app-vh` 클램프).
   위험을 알면 같은 커밋에서 막아라.
3. **형제 호출자를 안 셌다.** 진입 처리를 `openPostitView`에만 넣었는데 호출자가 둘이었다.
   CLAUDE.md가 반복해서 경고하는 항목이다.
4. **원인을 두 번 연속 틀리게 짚고도 "찾았다"고 단정했다.** 확신 표현을 아껴라 —
   실측으로 확인한 것과 코드에서 추론한 것을 문장에서 구분해라.
5. **사용자 지시(검색/레퍼런스 확인)를 두 번 무시했다.**

## 7. 다음에 또 막히면 — 값 조정 대신 이걸 해라

8라운드 패턴이 동일했다: 내가 가설 세워 배포 → 사용자가 실기기 테스트 → 한 라운드 늦게 결과.
**그 왕복 안에서는 어떤 가설도 검증되지 않는다.** 사용자에게 제안했다가 구조 변경을 먼저 선택해서
아직 안 만든 것:

> `?debug=vp&log=1`이 프레임별 측정값(`vv.height`/`offsetTop`/껍데기 rect/조상 체인/`body.position`)을
> API 라우트에 POST하고, 다음 클로드가 `curl`로 읽는다. 사용자는 메모 열고 본문 한 번 탭만 하면 되고,
> 숫자를 옮겨적을 필요가 없다. **추측 대신 실측으로 넘어가는 유일한 통로다.**

먼저 읽을 것: `CLAUDE.md` 0절(**"예전엔 됐나? 언제부터?"부터 물어라**) → 3절 지뢰표(통독 말고
건드리는 단어로 grep) → `docs/incidents.md` 11-11~11-14절.

## 8. 🔴🔴 dev 서버가 살아 있는 동안 `npx next build`를 돌리지 마라

**이 세션에서 로컬 검증을 한 번도 못 한 이유가 이것이다.** 8라운드 동안 추측만 하게 된 원인의 절반이다.

`next dev`(Turbopack)와 `next build`가 **같은 `.next`를 쓴다.** dev가 떠 있는 상태에서 build를
돌리면 build가 dev의 컴파일러 상태를 덮어쓰고 **dev가 걸린다.** 죽는 게 아니라 **멈춘다** —
그래서 증상이 헷갈린다:

```
netstat -ano | findstr ":3000"     → LISTENING (살아 있어 보인다)
curl --max-time 25 localhost:3000  → 000 / 25초 타임아웃 (응답이 없다)
```

이번엔 build를 **6번** 돌렸고, 그 뒤로 localhost가 안 열렸다. 그리고 **브라우저 패널이 300초
타임아웃으로 죽은 것도 같은 원인**이었는데, 나는 "패널이 화면에 안 떠 있어서 프레임이 없다"고
잘못 결론 내리고 로컬 검증을 포기했다. 그 오진이 보고서에도 그대로 들어갔다.

**복구 (CLAUDE.md 지뢰표 "dev 서버가 옛 코드를 보고 있을 수 있다"와 같은 처방):**
```bash
netstat -ano | findstr ":3000"      # PID 확인
taskkill //PID <PID> //F
rm -rf .next
npm run dev
```

**규칙:**
- 코드 검증은 `npx tsc --noEmit` + `npm run check`로 한다. 이 둘은 `.next`를 건드리지 않는다.
- **정말 `next build`가 필요하면 dev를 먼저 내려라.** 배포 전 확인은 push 후 Vercel 빌드로 대신할 수 있다.
- 로컬 화면 확인이 필요하면 **build를 돌리기 전에** 먼저 해라. 순서를 거꾸로 하면 확인 수단을 잃는다.
- `curl --max-time 25 localhost:3000`이 `000`을 주면 **걸린 것이다.** "안 열린다"를 "서버가 죽었다"로
  읽지 말고 위 복구 절차를 돌려라.
