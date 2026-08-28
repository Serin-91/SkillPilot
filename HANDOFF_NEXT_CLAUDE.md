# SkillPilot 인계 — 모바일 메모 스크롤, 3주 만에 해결 (2026-08-28)

## 0. 사용자에 대해

- **사용자는 누나다. "형"이라고 부르지 마라.** 한국어로 대화한다.
- 욕이 나오면 **그 항목이 이미 여러 번 실패한 것**이다. 사과를 길게 쓰지 말고 접근을 바꿔라.
- **실기기 검증은 푸시해야만 가능하다.** 진단용 변경은 "푸시할까요?"를 묻지 말고 바로 커밋·푸시하고,
  확인할 주소와 **읽는 법**(어떤 값이 나오면 무슨 뜻인지)을 같이 줘라. 동작을 바꾸는 수정은 확인받는다.
- 사용자가 "검색해서 다른 개발자 코드 봐라"고 하면 **먼저 검색해라.** 두 번 무시하고 세 번째에
  검색했더니 답이 문헌에 있었던 전적이 있다(이번 세션에도 액세서리 바가 그랬다).

## 1. 지금 상태

- repo `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot`, branch `master`, 워킹트리 clean
- 배포 https://skill-pilot-kr.vercel.app · 환경: **iPhone Chrome**, 네이버 키보드, 다크 테마
- **모바일 메모 편집 스크롤 = 해결됨. 실기기 확인 완료.** 3주 / 8라운드짜리 문제였다.
- 검증: `npx tsc --noEmit` + `npm run check` 15건. **`next build`는 dev가 떠 있으면 돌리지 마라**(6절)

## 2. 무엇이 원인이었나 — 여섯 개, 뿌리는 하나

`a95cefd`가 편집 화면을 (fixed 껍데기 + 배경 잠금 + 내부 스크롤러) → **문서가 스크롤러**로 바꿨다.
구조는 바뀌었는데 **옛 구조를 전제로 쓰인 보정 여섯 개가 그 결정에서 빠진 채 살아남았다.**
그래서 하나 고칠 때마다 다음 게 드러나 6라운드가 됐다. 수정은 전부 한 줄이다.

| # | 증상 | 원인 | 어디 |
|---|---|---|---|
| 1 | 하단 빈 공간 | `html.kb-open .big-postit`이 **(0,2,1)** — `html`이 타입 셀렉터라 +1. 새 규칙(0,2,0)이 져서 `padding-bottom: var(--kb-inset)`(실측 326px)을 먹었다 | dashboard.css 끝 |
| 2 | 진입 직후 빈 칸 | `html:not(.kb-open) …`이 **(0,4,1)** — `:not()`은 인자의 특이도를 그대로 갖는다. 60vh(487px) | dashboard.css 끝 |
| 3 | 하단부터 뜸 | 배경 잠금 cleanup의 `scrollTo(0, y)`가 **대시보드** y로 굴린다 → 편집 페이지 max를 넘어 **맨 끝에 clamp** | Dashboard.tsx `mobileEditActive` effect |
| 4 | 손가락이 안 먹음 | 화면 거의 전부가 focus된 contenteditable이라 드래그가 캐럿·선택으로 라우팅됨 | `touch-action: pan-y pinch-zoom` |
| 5 | 가다가 막힘 | iOS 밀기 되돌리기 `scrollTo(0,0)`이 **`vv.scroll`에도** 걸려 굴리는 도중에 되감음 | useViewportHeight.ts `inMemoEditPage` 가드 |
| 6 | 내려갔다 튕김 | 캐럿 노출 `scrollIntoView()`. 주소창이 접혔다 펴지며 `vv.resize` → 120ms 뒤 되감김 | MemoRichEditor `reveal()` 가드 |

**3·5·6은 전부 "누가 문서를 되돌리는가"다.** 옛 구조에서 무해했던 스크롤 호출이,
문서가 스크롤러가 되는 순간 전부 화면 전체를 움직인다.

전체 경위·실측 수치·계측 코드는 **`docs/incidents.md` 11-15절**. 같은 증상이면 그것부터 읽어라.

## 3. 🔴 왜 4라운드를 헛짚었나 — 다음에 같은 함정을 피하려면

실기기 판독이 **전부 정상**인데 스크롤이 안 됐다: `body=static` · `dialog[open]=0` ·
`.sp-body clip/visible` · 굴릴 수 없는 스크롤러 0개 · 조상 체인 `ta=auto` · 덮는 오버레이 없음.

- **computed style에 안 나타나는 층이 둘이다:** ① 제스처 라우팅(`touch-action`)
  ② 누가 스크롤을 되돌리는가(`scrollTo`/`scrollIntoView`). 스타일만 읽으면 영원히 못 찾는다.
- `?debug=vp`의 **"굴릴 수 없는 스크롤러" 목록은 죽은 것만 센다.** 살아서 끝까지 굴러간
  스크롤러는 거기 안 잡히므로 **"None"을 무죄로 읽지 마라.**

**결정적이었던 계측 둘** (같은 증상이면 이것부터 만들어라, 각 10줄):

```javascript
// (a) 문서가 정말 굴러가나 — 스크롤러 문제와 제스처 문제를 가른다
const before = scrollY; scrollTo(0, before + 120); const after = scrollY; scrollTo(0, before);
// (b) 제스처 도중 누가 window.scrollTo를 부르나 — 되돌리는 범인이 이름 없이 잡힌다
const orig = window.scrollTo.bind(window); window.scrollTo = (...a) => { count++; return orig(...a) };
```

(a)가 `ok`인데 손가락이 안 먹으면 **스크롤러가 아니라 제스처**다.
(a)의 `before`가 `max`와 **같으면** 누가 max보다 큰 값으로 굴린 뒤 clamp된 것이다 —
실기기 `ok (1226→1346, max 1226)` 한 줄이 #3을 통째로 특정했다.

## 4. 검증 못 한 것

- **#6은 로컬 A/B로만 확인**(가드 있음 700→700, 클래스 빼면 700→0). 실기기 미검증.
- **다른 편집 화면**(먼슬리 Create · 프로젝트 상세 · 확장 편집)은 세 가드가 전부
  `.memo-edit-page`로 좁혀져 **코드상 영향이 없지만 실기기에서 안 쟀다.** 그쪽은 여전히
  fixed 껍데기 + 배경 잠금 구조라 옛 보정이 **살아 있어야 맞다.**
- **알고 넣은 변경:** 편집에서 나올 때 대시보드가 이전 스크롤 위치로 안 돌아가고 맨 위로 간다.
- `color-scheme: light`(액세서리 바 색) — 크롬 iOS가 페이지 값을 따르는지 미확인. 안 되면
  dashboard.css 끝의 그 줄만 지우면 된다.

## 5. 키보드 위 검은 띠 = 우리 화면이 아니다 (다시 파지 마라)

비밀번호·카드·위치 칩이 있는 그 띠는 **크롬의 autofill 액세서리 바**다. **WKWebView의 네이티브
설정이라 DOM도 CSS도 JS도 못 건드린다** — 네이티브 래퍼(Capacitor 등)가 있어야 끈다.
`autocomplete="off"`로 안 된다(해봤다). 제목칸·본문 둘 다에서 뜨고, 네이버 메모 앱에서도 뜬다.
**우리 레이아웃은 멀쩡하다** — `vv.height`가 그 높이를 빼고 주므로 계산이 이미 반영돼 있고,
맨 아래까지 굴려도 메모지 아랫변이 뷰포트 마지막 픽셀에 닿는다(문서 == `.sp-body` == 메모지 높이).

## 6. 🔴 dev 서버가 살아 있는 동안 `npx next build`를 돌리지 마라

`next dev`(Turbopack)와 `next build`가 **같은 `.next`를 쓴다.** dev가 떠 있을 때 build를 돌리면
dev가 **죽는 게 아니라 멈춘다**: `netstat`은 LISTENING인데 `curl`이 타임아웃(000)이다.
2026-08-28 세션이 이걸로 로컬 검증 수단을 통째로 잃었다.

- 코드 검증은 `npx tsc --noEmit` + `npm run check`로 한다(`.next`를 안 건드린다)
- 로컬 화면 확인은 **build 전에**. 복구: `taskkill //PID <3000 PID> //F` → `rm -rf .next` → `npm run dev`

## 7. 다음 작업

**다크모드 메모지 색상.** 메모지 색이 **세 군데**에 있다(포스트잇 / 모바일 Create / 웹 Create) —
지뢰표 "메모지 색은 세 벌이다" 행을 먼저 읽어라. **네 번째 벌을 만들지 마라.**
오버스크롤 때 찰나로 비치는 검은색(캔버스 = `body` 배경, 다크 `rgb(11,13,25)`)도 같이 보면 된다.

먼저 읽을 것: `CLAUDE.md` 0절(**"예전엔 됐나? 언제부터?"부터 물어라**) → 3절 지뢰표(통독 말고
건드리는 단어로 grep) → `docs/incidents.md` 11-15절.
