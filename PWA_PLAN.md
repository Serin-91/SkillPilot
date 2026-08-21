# SkillPilot PWA 도입 계획

작성 2026-08-22 · 상태: **1단계 완료(로컬 검증까지). 남은 것은 실기기 확인과 2단계**

목표: 홈 화면에 추가하면 주소창 없는 전체화면 앱으로 뜨게 한다.
**절대 조건: 지금 이식해 둔 모바일 디자인이 그대로 나와야 한다.**

> 이 문서 하나만 읽고 바로 이어서 작업할 수 있게 썼다. 채팅 기록을 참조하지 않는다.
>
> **지금 바로 할 일은 6절 "실기기 검증"이다.** 1단계 코드는 이미 들어가 있고 로컬 검증까지
> 끝났다. 아이폰으로 확인해서 통과하면 2단계(7절)로 넘어가고, 문제가 있으면 6절의
> "실패 시 첫 번째 용의자"부터 본다.

---

## 0. 시작하기 전에 — 프로젝트 컨텍스트

| | |
|---|---|
| 리포 | `C:\Users\ipre_\Desktop\미니프로젝트3\skillpilot` (부모 폴더가 아니라 이 하위 폴더가 git 루트) |
| 브랜치 | `master` (이 프로젝트는 master 직접 커밋 방식) |
| 원격 | `https://github.com/Serin-91/SkillPilot.git` |
| 프레임워크 | Next.js 16.3.0 (App Router, Turbopack) |
| 배포 | Vercel |

**작업 전 반드시 읽을 것: `skillpilot/AGENTS.md`.**
"이건 네가 아는 Next.js가 아니다"라는 경고가 있다. Next 16은 API·규약이 학습 데이터와
다를 수 있으니 `node_modules/next/dist/docs/` 의 해당 문서를 먼저 확인하라는 지시다.
이 계획서의 manifest 규약도 그 문서로 확인한 것이다(8절 경로 참고).

**검증 명령 (변경 후 매번 전부 통과해야 한다)**

```bash
npx tsc --noEmit          # 타입
npm run build             # 프로덕션 빌드
npm run lint              # 기준선 28건(23 errors, 5 warnings) — 이 숫자가 늘면 내가 늘린 것
```

자체 점검 6종 — 뉴스·채용 로직 회귀 방지용. PWA 작업이 건드릴 일은 없지만 커밋 전 한 번 돌린다.

```bash
node --experimental-strip-types src/lib/news/filter.check.ts
node --experimental-strip-types src/lib/news/select.check.ts
node --experimental-strip-types src/lib/news/sources.check.ts
node --experimental-strip-types src/lib/jobs/roles.check.ts
node --experimental-strip-types src/lib/jobs/new-badge.check.ts
npx tsx src/lib/jobs/generate.check.ts     # 이 파일만 @/ 별칭 때문에 tsx 필요
```

**현재 커밋 상태** — 아래는 이미 master에 머지·푸시 완료. PWA 작업은 이 위에서 시작한다.

```
0d45302  Drop duplicates carried over from the news top-up call
b26be29  Fix memo editor bugs, move the mobile toolbar, and lift admin limits
5242e70  Keep the email field filled when sign-in fails
c4fe5ed  Keep partial job batches and fix the NEW badge
e9077f9  Fix news selection surfacing irrelevant articles
f1cfe20  Self-host fonts and stop auth middleware intercepting static assets
```

`f1cfe20`이 특히 중요하다 — 4절에서 같은 종류의 사고를 또 막아야 한다.

---

## 1. 결론 요약

| | |
|---|---|
| 작업 규모 | 신규 파일 1개 + 수정 2개 + 아이콘 4장. 반나절 안 됨 |
| 진짜 리스크 | 딱 하나 — `viewport-fit=cover` (3절) |
| 앱스토어 심사·비용 | 없음 |
| 서비스워커 | **안 만든다** (5절 근거) |
| 로고 | 받은 파일 쓸 수 있음. 단 크롭 필요 (2절) |

**현재 상태 조사 결과**

```
public/manifest.*            없음
layout.tsx의 PWA 메타 태그    없음
export const viewport        없음  → Next 기본값이 나감
                                    (width=device-width, initial-scale=1)
서비스워커                    없음
```

`dashboard.css`에 이미 들어있는 것:

```
env(safe-area-inset-top)      30곳
env(safe-area-inset-bottom)   13곳     ← 합계 43곳. 3절이 이 얘기다
100dvh                        35곳
100vh                          6곳   (dashboard.css)
                               1곳   (auth.css)
```

---

## 2. 아이콘

### 원본

`C:\Users\ipre_\Desktop\미니프로젝트3\참고_구조&스타일\PWA 로고 정사각형.png`
(리포 바깥, 부모 폴더에 있다) · `2048x2048` PNG RGBA · 2.15MB

픽셀 분석으로 확인한 구성 — 세 덩어리다:

| 세로 구간 | 내용 | 처리 |
|---|---|---|
| `y 67~120` | **"Ai" 워터마크** (생성 툴 표시, 좌상단) | 반드시 잘라낸다 |
| `y 524~1233` | 행성 마크 (`x 686~1364`) | **이것만 아이콘으로 쓴다** |
| `y 1247~1521` | "SkillPilot" 워드마크 | 아이콘에서 제외 |

### 마크만 쓰는 이유

- 마크가 캔버스 세로의 35%밖에 안 차서, 원본 그대로 192px로 줄이면 마크가 실질 40px이 된다
- 워드마크는 192px에서 이미 읽기 어렵고, 앱 전환기·알림(≈40px)에서는 완전히 뭉갠다
- 안드로이드 maskable은 안쪽 80%만 안전 영역이라 아래쪽 워드마크가 잘린다
- 좌상단 "Ai" 워터마크가 그대로 딸려 들어간다

### 생성할 파일과 용도

`public/icons/` 에 넣는다.

| 파일 | 크기 | **정확히 어디에 뜨나** | 여백 |
|---|---|---|---|
| `apple-touch-icon.png` | 180 | **아이폰 홈 화면.** iOS는 manifest icons를 안 보고 이것만 본다 | 9% |
| `icon-192.png` | 192 | 안드로이드 홈 화면, 크롬 앱 목록, 앱 전환기 | 9% |
| `icon-512.png` | 512 | 안드로이드 **스플래시**(앱 켤 때 로딩 화면), 설치 프롬프트 | 9% |
| `icon-maskable-512.png` | 512 | 안드로이드가 원형·스퀘어클 등 기기 모양으로 **잘라 쓰는** 버전 | **25% 고정** |

- 전부 투명 없이 흰 배경으로 flatten한다 (iOS는 투명을 검게 칠한다)
- 브라우저 탭 파비콘은 기존 `src/app/favicon.ico`가 담당. 건드리지 않는다
- **maskable의 25%는 협상 대상이 아니다.** 안드로이드가 잘라내는 용도라 안쪽 80%만
  안전하다. 여기서 꽉 채우면 마크가 잘린다

### 여백 9%인 이유

마크가 타일의 몇 %를 차지하는지로 환산하면:

```
여백  4%  → 마크가 타일의 93%      너무 꽉 참
여백  6%  → 89%
여백  9%  → 84%                   ← 채택. 사파리·크롬 아이콘이 이 정도다
여백 13%  → 79%                   여백이 많아 보임
```

바꾸려면 아래 스크립트의 `PAD` 상수 하나만 고치면 된다.

### 생성 스크립트 (그대로 실행하면 된다)

`skillpilot/` 에서 실행. `sharp`는 next가 이미 끌고 와서 설치돼 있다.

```js
// scripts/make-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "C:/Users/ipre_/Desktop/미니프로젝트3/참고_구조&스타일/PWA 로고 정사각형.png";
const OUT = "public/icons";
// 마크에 딱 맞는 정사각 — 워터마크(y67~120)와 워드마크(y1247~)를 둘 다 피한 좌표
const LEFT = 670, TOP = 523, SIDE = 710;
const PAD = 0.09;            // 일반 아이콘 여백 (마크가 타일의 84%)
const PAD_MASKABLE = 0.25;   // 안드로이드 안전영역용. 건드리지 말 것

await mkdir(OUT, { recursive: true });
const mark = await sharp(SRC)
  .extract({ left: LEFT, top: TOP, width: SIDE, height: SIDE })
  .png().toBuffer();

async function build(padPct, size, file) {
  const pad = Math.round(SIDE * padPct);
  // extend와 resize를 반드시 분리한다 — 함정 2 참고
  const padded = await sharp(mark)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" })
    .png().toBuffer();
  await sharp(padded).resize(size, size).flatten({ background: "#ffffff" })
    .png().toFile(`${OUT}/${file}`);
  const m = await sharp(`${OUT}/${file}`).metadata();   // 실측 확인 필수
  console.log(`${file.padEnd(24)} ${m.width}x${m.height} ${m.width === size ? "OK" : "크기 불일치!"}`);
}

await build(PAD, 180, "apple-touch-icon.png");
await build(PAD, 192, "icon-192.png");
await build(PAD, 512, "icon-512.png");
await build(PAD_MASKABLE, 512, "icon-maskable-512.png");
```

### 함정 두 개 — 실제로 둘 다 밟았다

**함정 1 — 여백을 "크롭 박스 확대"로 주면 안 된다.**
`extract` 범위를 넓혀서 여백을 만들면 아래 워드마크(`y1247~`)가 딸려 들어온다.
여백은 반드시 `extend`로 준다.

**함정 2 — sharp에서 `extend`와 `resize`를 한 체인에 쓰면 안 된다.**
sharp는 호출 순서와 무관하게 `resize`를 **먼저** 적용한다. 그래서
`sharp(mark).extend({...}).resize(192,192)`는 192px이 아니라 `192 + 여백*2`px을 만든다.
실제로 이 실수로 192/512/180을 요청했는데 **376/696/364가 나왔다.**
반드시 `extend` → `toBuffer()` → 새 `sharp()` → `resize`로 분리하고,
만든 뒤 `metadata()`로 실제 크기를 확인할 것. 위 스크립트는 그렇게 돼 있다.

### 화질 — 전부 축소라 안 깨진다

마크 원본 710px + 여백 → 838~1066px. 가장 큰 512px 아이콘도 확대가 아니라 축소다.
확대가 한 번도 없으므로 계단현상이 생기지 않는다.
(반대로 원본 2048px 캔버스를 그대로 쓰면 마크가 실질 40px로 줄어든다.)

---

## 3. 유일한 진짜 리스크 — safe-area 43곳

### "무효"가 무슨 뜻인가

`dashboard.css` 2674번째 줄 같은 코드가 43군데 있다:

```css
.page { padding: 14px 10px calc(34px + env(safe-area-inset-bottom)); }
```

`env(safe-area-inset-bottom)`은 **"아래쪽에 침범당하면 안 되는 영역의 높이"**를
브라우저가 알려주는 값이다. 아이폰 홈 인디케이터라면 보통 34px, 노치가 있는 위쪽은 47px.

**그런데 이 값은 조건부다.** `<meta name="viewport">`에 `viewport-fit=cover`가 있을 때만
실제 숫자를 주고, 없으면 **무조건 `0`**이다.

지금 `export const viewport`가 아예 없어서 Next 기본 메타 태그가 나가고 거기엔
`viewport-fit`이 없다. 그래서 위 코드는 실제로 이렇게 동작한다:

```css
.page { padding: 14px 10px calc(34px + 0px); }   /* = 그냥 34px */
```

즉 **노치 대응 코드를 43군데 써 뒀는데 단 한 줄도 효과가 없다.**
지금 화면이 멀쩡한 건 브라우저 주소창·하단바가 노치 영역을 알아서 가려주고 있어서다.

### 반응형과는 별개다

- **반응형** = 화면 폭에 따른 레이아웃 변화(`@media (max-width: 720px)`, 그리드, 폰트).
  PWA로 바꿔도 **아무 영향 없다**
- **safe-area** = 노치·홈인디케이터가 먹는 **가장자리 띠**를 피하는 것. 폭이 아니라
  "화면 끝 몇 px을 비울 것인가"의 문제

### 왜 PWA에서 위험해지나

세 가지 상태를 구분해야 한다.

```
① 지금 (브라우저)
   Safari 주소창/하단바가 노치 영역을 차지 → 페이지는 그 안쪽에만 그려짐
   env() = 0, 43곳 무효, 그래도 화면 멀쩡

② 1단계 PWA (viewport-fit 없음)   ← 이번에 할 것
   주소창은 사라지지만 iOS가 노치 영역을 알아서 비워둠
   env() = 0, 43곳 여전히 무효 → 레이아웃이 ①과 완전히 동일

③ 2단계 (viewport-fit=cover)
   페이지가 화면 맨 끝까지 확장 = "전체창 꽉 참"
   env()가 실제값(34px/47px) 반환 → 43곳이 한꺼번에 살아남
```

③으로 넘어가는 순간 43군데의 `calc(... + env(...))`가 **동시에** 0px에서 실제값으로
바뀐다. 지금까지 한 번도 실행된 적 없는 코드 43줄이 한꺼번에 켜지는 셈이다.
의도대로 짜여 있었다면 딱 맞고, 아니라면 43곳이 동시에 틀어진다.
**어느 쪽인지는 실기기로 보기 전엔 알 수 없다.**

### 그래서 이렇게 피한다

1단계에서는 **`viewport-fit=cover`를 일부러 넣지 않는다.** 위 ②상태를 유지한다.
레이아웃이 지금과 픽셀 단위로 같고, 바뀌는 건 주소창이 사라지는 것 하나뿐이다.

2단계는 별도 커밋으로 분리해서, 아이폰 실기기로 43곳을 확인한 뒤에만 머지한다.

### `100vh`는 걱정 안 해도 된다

standalone에는 스크롤에 따라 접혔다 펴지는 브라우저 UI가 없으므로 `100vh`와 `100dvh`가
같은 값이 된다. 지금 Safari에서 생기던 미세한 어긋남이 오히려 사라진다.

---

## 4. 1단계 작업 — **완료됨**

아래 4개는 이미 적용·커밋됐다. 원문을 남겨두는 이유는 왜 그렇게 했는지가 중요해서다.

| 파일 | 상태 |
|---|---|
| `scripts/make-icons.mjs` | 신규. 실행 완료 |
| `public/icons/*` 4장 | 생성 완료 (실측 180/192/512/512 확인) |
| `src/app/manifest.ts` | 신규 |
| `src/app/layout.tsx` | `appleWebApp` + `icons.apple` 추가 |
| `src/proxy.ts` | matcher에 `webmanifest` 추가 |

**로컬 검증 결과**

```
curl /manifest.webmanifest   → 200 application/manifest+json   (307 아님. 4-3 함정 통과)
curl /icons/*.png            → 4장 전부 200
빌드 라우트 목록             → ○ /manifest.webmanifest (정적 프리렌더)
npx tsc --noEmit             → 통과
npm run build                → 통과
npm run lint                 → 28건 (기준선 유지)
자체 점검 6종                → 전부 통과
```

**실제로 나가는 head 태그** (`curl http://localhost:3000/` 로 확인함)

```html
<meta name="viewport" content="width=device-width, initial-scale=1"/>   ← viewport-fit 없음(의도)
<link rel="manifest" href="/manifest.webmanifest"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="SkillPilot"/>
<meta name="apple-mobile-web-app-status-bar-style" content="default"/>
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>
```

### 적용한 코드

> **아래 4-1 / 4-2 / 7절 코드는 실제로 타입 검증을 마쳤다.**
> 임시 파일에 그대로 붙여 `npx tsc --noEmit`을 돌려 통과하는 것을 확인했다
> (`MetadataRoute.Manifest`, `Metadata.appleWebApp`, `Viewport.viewportFit` 전부
> Next 16.3.0의 타입 정의에 존재한다). 그대로 복사해 쓰면 된다.

#### `src/app/manifest.ts` (신규)

```ts
import type { MetadataRoute } from "next";

// Next 16 파일 규약 — app/manifest.ts 를 두면 /manifest.webmanifest 로 서빙된다.
// 규약 문서: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md
//
// viewport-fit=cover는 여기가 아니라 layout.tsx의 viewport export에서 정한다.
// 1단계에서는 일부러 켜지 않는다 — dashboard.css의 safe-area 규칙 43곳이 한꺼번에
// 활성화되면서 모바일 레이아웃이 통째로 바뀔 수 있기 때문이다(PWA_PLAN.md 3절).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkillPilot",
    short_name: "SkillPilot",
    description: "AI·개발 동향과 채용공고를 정리하는 개인 맞춤형 학습·기록 시스템",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    // .sp-body 배경 그라디언트의 시작색
    // (linear-gradient(135deg, #d9cbff 0%, #cfe9ff 45%, #f6d2f1 100%))
    theme_color: "#d9cbff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

#### `src/app/layout.tsx` (수정)

iOS는 manifest의 icons를 무시하고 `apple-touch-icon`만 본다. metadata에 추가한다.

```ts
export const metadata: Metadata = {
  title: "SkillPilot",
  description: "AI·개발 동향과 채용공고를 정리하는 개인 맞춤형 학습·기록 시스템",
  // iOS 홈 화면 아이콘 — manifest의 icons를 iOS는 읽지 않는다
  appleWebApp: {
    capable: true,
    title: "SkillPilot",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};
```

> `statusBarStyle`은 `"default"`로 둔다. `"black-translucent"`로 하면 상태바 아래로
> 콘텐츠가 파고들어 `viewport-fit=cover`와 같은 문제가 생긴다 — 2단계에서 같이 검토한다.

`<head>` 안의 기존 SUIT 폰트 preload는 그대로 둔다. 추가로 손댈 것 없다.

#### `src/proxy.ts` (수정) — **빠뜨리면 설치 자체가 안 된다**

현재 matcher:

```ts
matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)"],
```

`webmanifest`를 확장자 목록에 추가한다:

```ts
matcher: ["/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|webmanifest)$).*)"],
```

**왜 필수인가.** 지금 matcher는 `/manifest.webmanifest`를 인증 미들웨어로 흘려보낸다.
`proxy.ts`는 로그인 안 된 요청을 `/login`으로 리다이렉트하므로, 비로그인 방문자에게
manifest가 **307**로 응답되고 브라우저가 파싱에 실패해 설치 프롬프트가 아예 안 뜬다.
**폰트에서 똑같이 겪은 사고다** — 커밋 `f1cfe20` 참고(그때는 woff2가 `/login`으로 307됐다).

작업 후 반드시 확인:

```bash
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/manifest.webmanifest
# 기대: 200 application/manifest+json   (307이면 matcher 수정이 안 먹은 것)
```

#### 아이콘 생성

2절 스크립트를 실행하고, 출력된 실측 크기가 180/192/512/512와 일치하는지 확인한다.

#### 커밋

1단계 전체를 커밋 하나로 묶었다. 2단계는 반드시 별도 커밋으로 한다.

---

## 5. 안 하는 것과 그 이유

**서비스워커 / 오프라인 캐싱 — 안 만든다**

`npm run build` 출력에서 `/`가 `ƒ (Dynamic)`이다. 대시보드 전체가 인증 뒤 동적 SSR이라
오프라인에 캐시해 둘 화면이 없다. 서비스워커를 붙여도 얻는 건 "오프라인입니다" 안내
페이지 하나뿐이고, 대신 캐시 무효화라는 새 버그 표면이 생긴다.
나중에 정적으로 뽑을 화면이 생기면 그때 다시 판단한다.

> 참고: 크롬의 설치 조건에서 서비스워커 요구는 완화됐다. manifest + 아이콘 + HTTPS면
> 설치 프롬프트가 뜬다. 없어서 설치가 막히지는 않는다.

**푸시 알림 — 안 만든다**

지금 없는 기능이다. iOS는 홈 화면에 추가한 PWA에서만 되고 제약도 많다.
필요해지면 VAPID 키 + 구독 저장 + 발송 경로가 별도로 필요하다
(Next 공식 가이드에 절차가 있다 — 8절 경로).

---

## 6. 어떻게 확인하나 — DevTools로는 절반만 된다

| 확인 수단 | 확인되는 것 | 확인 **안 되는** 것 |
|---|---|---|
| **Chrome DevTools → Application → Manifest** | manifest 파싱 결과, 아이콘 미리보기, Installability 진단(왜 설치 안 되는지 이유까지) | 실제 화면 |
| **DevTools 디바이스 툴바** (모바일 에뮬레이션) | 화면 폭, 터치 이벤트 | **standalone 재현 안 됨.** 주소창 유무, safe-area, 키보드 액세서리 바 전부 실제와 다름 |
| **Chrome 데스크톱에서 실제 설치** | manifest·아이콘·start_url이 맞게 동작하는지 | 데스크톱 창이라 모바일 레이아웃과 무관 |
| **iOS Safari** | — | **DevTools 불가.** Mac + 케이블 원격 디버깅이 유일한데 Windows에서는 그것도 안 됨 |

→ **결론: 아이폰 실기기로 직접 열어보는 것 외에 방법이 없다.**

**함정.** `next dev`가 LAN 주소를 띄워준다(`Network: http://192.168.x.x:3000`).
폰을 같은 와이파이에 두면 화면은 볼 수 있다. **그런데 PWA 설치는 HTTPS가 필수다.**
`localhost`만 예외인데 폰 입장에서는 `192.168.x.x`이지 `localhost`가 아니다.
즉 **이 주소로는 "홈 화면에 추가"를 해도 standalone이 아니라 그냥 북마크가 된다.**

### 지금 할 일 — 아이폰 실기기 검증

로컬 검증(4절)은 끝났다. 남은 건 이것뿐이다.

1. master에 이미 푸시돼 있으니 **Vercel 프로덕션 배포가 끝났는지 확인**한다(HTTPS 자동)
2. 아이폰 Safari로 배포 URL 접속 → 공유 → **"홈 화면에 추가"**
3. 홈 화면 아이콘을 눌러 실행하고 아래를 확인한다:

   - [ ] 아이콘이 **행성 마크만** 나온다 (워드마크·"Ai" 워터마크가 안 보인다)
   - [ ] 아이콘이 타일에 적당히 찬다 (여백 9% = 마크가 84%)
   - [ ] 아이콘 밑 이름이 **"SkillPilot"** 로 안 잘리고 나온다
   - [ ] **주소창이 사라졌다** (안 사라지면 아래 "실패 시" 참고)
   - [ ] **대시보드 레이아웃이 브라우저에서 보던 것과 같다** ← 1단계 합격 기준
   - [ ] 메모를 열었을 때 서식툴바가 상단에 제대로 붙는다
   - [ ] 로그인 세션이 유지된다 (쿠키는 그대로 동작해야 정상)

4. 전부 통과하면 2단계(7절)로. 하나라도 어긋나면 아래를 본다.

### 실패 시 — 첫 번째 용의자

**주소창이 안 사라지고 그냥 Safari로 열린다면**, `apple-mobile-web-app-capable` 문제일
가능성이 높다. Next 16은 `appleWebApp.capable: true`를 **표준명인
`<meta name="mobile-web-app-capable">`로 내보낸다.** 레거시 `apple-...` 접두어 버전은
안 나간다(실제 출력으로 확인함, 4절 참고).

iOS 15.4부터는 표준명을 인식하므로 최신 iOS면 문제없어야 하지만, 안 되면
`src/app/layout.tsx`의 `<head>`에 한 줄 직접 넣으면 된다:

```tsx
<meta name="apple-mobile-web-app-capable" content="yes" />
```

**레이아웃이 브라우저와 다르게 보인다면**, 3절을 다시 읽는다. 1단계는 `viewport-fit`을
넣지 않았으므로 원칙적으로 달라질 수 없다 — 달라졌다면 예상 못 한 원인이 있는 것이니
`viewport` 메타 태그가 정말 `width=device-width, initial-scale=1`인지부터 확인한다.

---

## 7. 2단계 (보류 중)

`src/app/layout.tsx`에 viewport export 추가:

```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  viewportFit: "cover",   // ← 이것 하나가 safe-area 43곳을 동시에 활성화한다
};
```

노치·홈인디케이터 영역까지 배경이 차서 확실히 앱처럼 보인다.
**아이폰 실기기로 43곳을 확인하기 전에는 머지하지 않는다.**
1단계와 분리해 뒀으니 문제가 나면 이 커밋만 되돌리면 된다.

확인할 곳(43곳 중 눈에 띄는 것들):

줄번호는 CSS를 수정하면 밀린다. 아래 명령으로 현재 위치를 직접 뽑는 게 확실하다.

```bash
grep -n "safe-area-inset" src/app/dashboard.css
```

2026-08-22 기준 눈에 띄는 곳:

- `.page` 하단 패딩 — `dashboard.css:2674`
- 모바일 헤더 상단 — `dashboard.css:2862~2863` (`inset-top` 2회)
- `.ai-direction-modal` 하단 패딩 — `dashboard.css:2357`
- 모바일 하단 바 — `dashboard.css:3377`

---

## 8. 참고 문서 (로컬 경로)

- manifest 파일 규약:
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`
- PWA 가이드(푸시·서비스워커 포함):
  `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`
- 프로젝트 규칙: `skillpilot/AGENTS.md`

---

## 9. 결정된 사항 (기록)

1. **아이콘 A안(마크만)** — 확정. B안(원본 전체)은 작은 크기에서 뭉갠다
2. **여백 9%** — 확정. maskable만 25%. 사파리·크롬 아이콘 비율(마크가 타일의 84%)
3. **`short_name` "SkillPilot"** — 확정. 10자라 iOS 홈 화면에서 안 잘린다
4. **1단계 먼저, 2단계는 실기기 확인 후** — 1단계 완료, 2단계 대기 중
5. **서비스워커·푸시 안 함** — 5절 근거
