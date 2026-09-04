# AI Trend / News 재료 설계안 (2026-09-04)

> 🔴 **이 문서는 설계안이다. 구현하지 않았다.** 사용자 승인 후 별건으로 진행한다.
> 같은 세션의 저위험 수정 3건(`e533e2b` `591660d` `82e27f9`)은 이미 반영됐고, 여기 있는 A·B·C는
> 전부 **입력 재료·소스 구조 변경**이라 별도 설계 작업으로 분리했다.
>
> 모든 수치는 2026-09-04 실측이다. 추정값은 "추정"이라고 적었다.

---

## 0. 조사로 확정된 사실 (A·B·C 공통 전제)

### 0-1. 저장소의 피드는 7개가 전부다

| 용도 | 소스 |
|---|---|
| News (5) | AI타임스 · ZDNet Korea · TechCrunch · MIT News AI · Ars Technica AI |
| AI Trend (2) | `github.blog/changelog/feed/` · `huggingface.co/blog/feed.xml` (+ HF Trending Models API) |

🔴 **"Official Updates"라는 별도 기능은 존재하지 않는다.** OpenAI·Anthropic·Google·Microsoft·
Meta·Cursor 공식 소스는 저장소에 **0건**이다. AI Trend 프롬프트의 `"GitHub 공식 업데이트"` 라벨이
그렇게 보였을 뿐이고, 실체는 같은 GitHub Changelog 하나다.
🔴 **`daily papers` / `ai_summary`도 저장소에 없다**(grep 0건). 재사용할 기존 데이터가 아니다.

### 0-2. robots.txt — 8개 provider 전수 조사

`anthropic-ai` · `ClaudeBot` · `Claude-Web` · `GPTBot` · `CCBot` 전용 차단 블록은
**어디에도 없었다.** 전부 `User-agent: *` 하나에 경로 몇 개만 금지한다.

| provider | robots | `*` Disallow 경로 수 |
|---|---|---|
| OpenAI | 200 | 1 |
| Anthropic | 200 | 0 |
| blog.google | 200 | 4 |
| developers.googleblog.com | 200 | 0 |
| azure.microsoft.com | 200 | 25 |
| ai.meta.com | 200 | 9 (UA 10종: facebookexternalhit·PetalBot·Scrapy·Yandex 등 — AI 크롤러 지정 없음) |
| cursor.com | 200 | 36 |
| github.blog | 200 | 1 |
| huggingface.co | 200 | 0 |

⚠️ **TechCrunch만 다르다** — `anthropic-ai`·`ClaudeBot`·`GPTBot` 등 13종에 `Disallow: /`가
명시돼 있다. 그래서 `BODY_FETCH_SOURCES`에 넣지 않았고 **이 문서도 그 판단을 뒤집지 않는다.**

### 0-3. 공식 feed 실존 여부 및 재료 크기 (실측)

`최선 필드` = `description` / `content:encoded` / `content` / `summary` 중 가장 긴 것.

| provider | feed URL | 상태 | items | 최선 필드 중앙 | 필드 구성 |
|---|---|---|---:|---:|---|
| OpenAI | `openai.com/news/rss.xml` | ✅ | 1,169 | **153자** | description만 |
| **Anthropic** | 4경로 전부 404 | ❌ | — | — | **공식 RSS 없음** |
| Google AI | `blog.google/technology/ai/rss/` | ✅ | 20 | 117자 | description·media |
| Google Dev | `developers.googleblog.com/feeds/posts/default` | ✅ | 20 | **617자** | Atom |
| Microsoft | `azure.microsoft.com/en-us/blog/feed/` | ✅ | 10 | **10,659자** | `content:encoded` |
| **Meta AI** | `ai.meta.com/blog/rss|feed` 404 | ❌ | — | — | AI 전용 feed 없음 |
| Meta Eng | `engineering.fb.com/feed/` | ✅ | 9 | **16,796자** | AI 전용 아님 |
| Cursor | `cursor.com/changelog/rss.xml` | ✅ | 50 | **1,545자** | `content:encoded` |
| GitHub *(현재)* | `github.blog/changelog/feed/` | ✅ | 10 | **1,738자** | `content:encoded` |
| HF Blog *(현재)* | `huggingface.co/blog/feed.xml` | ✅ | 859 | **0자** | 🔴 `title·pubDate·link·guid`뿐 |

🔴 **HF Blog 피드에는 본문 필드가 아예 없다.** dev_input의 HF Blog 3건이 `description: ""`인
것은 파싱 버그가 아니라 **피드가 제목만 주기 때문**이다. 이것이 B의 출발점이다.

---

## A. TechCrunch material-quality 처리

### 현재 문제

TechCrunch RSS item 필드는 `title|link|dc:creator|pubDate|category|guid|description`이 **전부**다.
`content:encoded`가 없어 재료는 description 한 줄이 천장이다.

| | 실측 |
|---|---|
| 후보 풀 재료 중앙값 | **147자** (과거 기록 147과 정확히 일치 — 지금도 유효) |
| 최종 선정 건 재료 중앙값 | 191자 · 재료<300 **100%** |
| 문제 기사(Meta Muse Spark) | **249자 — 이게 모델 입력 전문** |
| 14일 최종 선정 | 2건 |

사용자가 지적한 누락 8항목(가격 6개 수치·학습데이터 배경·Claude Code/RL·enterprise governance·
frontier labs 경쟁) 중 **입력에 있던 것은 0개**다. 입력에 있던 4개 사실(모델명·용도·95% 할인·
공유 조건)은 **4개 모두 출력에 반영**됐다. → **프롬프트 결함이 아니다. 재료 천장이다.**

### 선택지

| | A-1 선정 단계 material-quality 가중치 | A-2 부족 표시(UI) | A-3 재료 빈약 소스 후순위/대체 |
|---|---|---|---|
| **무엇을** | 점수 동점권에서 재료가 긴 후보 우선 | TechCrunch 건에 "원문 요약 기반" 배지 | 재료 <300자면 다른 후보로 교체 |
| **정확도** | 환각 위험 **증가 0** (분량 강제 없음) | 변화 없음(정직성↑) | 위험 0이나 **소스 다양성 손실** |
| **비용** | 0 (네트워크·LLM 호출 무증가) | 0 | 0 |
| **latency** | 0 | 0 | 0 |
| **유지보수** | 낮음 — 기존 점수식에 가중치 1개 | 낮음 — 표시만 | **중** — 교체 규칙이 선정 로직과 얽힌다 |
| **robots/정책 위험** | 없음 | 없음 | 없음 |

🔴 **채택하지 않는 안**: 재료 150자에 summary 500자를 강제하는 것. 지어내라는 뜻이고 사용자가 금지했다.
🔴 **채택하지 않는 안**: TechCrunch article body fetch. robots.txt가 우리 UA 부류를 명시 차단한다.

### 추천안 — **A-1 + A-2 병행**

A-1이 근본이고 비용이 0이다. 다만 TechCrunch는 14일간 선정 2건뿐이라 A-1만으로는 체감이 작으므로,
그날 실제로 재료가 빈약한 건에는 A-2로 **정직하게 표시**한다. A-3는 보류 — 소스 다양성은
`MAX_SELECTED_PER_SOURCE`가 이미 지키는 값이라 여기서 흔들면 다른 병목이 되살아난다.

⚠️ 선행 확인: `select.ts`의 점수식에 가중치를 넣기 전에 **현재 점수 분포를 먼저 재라.**
가중치가 기존 주제 적합도를 이기면 "재료 긴 기사만 뽑히는" 새 편향이 생긴다.

---

## B. HF developer_trend 재료 보강

### 현재 문제

오늘 `dev_input.huggingface` 6건 전수 — **서술 문장이 있는 항목 0건**:

| # | source type | desc 길이 | 서술 문장 | 판정 |
|---|---|---:|---:|---|
| 1~3 | HF Blog | **0** | 0 | 피드에 본문 필드 없음 |
| 4~6 | Trending Models API | 135~196 | **0** | `태스크: … · 태그: … · 다운로드: 433 · 좋아요: 109` |

결과: 최근 8일 developer_trend가 **양자화 6/8일 · 경량화 6/8일 · 임베딩 5/8일**로 어휘를 재순환하고,
제목이 3일 연속 거의 동일했다(09-02·03·04 전부 "로컬/웹 + WebGPU 커널 + 경량화"). 태그 문자열에
`gguf`·`moe`·`quantized`가 들어 있어 모델이 그걸 다시 쓰는 구조다.

🔴 **프롬프트를 늘려도 해결되지 않는다** — 입력에 문장이 0개다.

### 선택지

| | B-1 HF Blog 본문 fetch | B-2 Trending Model card README | B-3 HF 다른 공식 feed 탐색 |
|---|---|---|---|
| **무엇을** | 이미 수집한 blog URL 3건의 본문을 받아 재료로 (AI타임스 `article-body.ts` 선례 그대로) | 모델 6건의 README 앞부분을 받아 재료로 | papers/posts 등 다른 공식 엔드포인트 |
| **정확도** | **높음** — 저자 본문. 지금 제목만 있는 3건이 실제 문장을 얻는다 | 중 — 작성자 품질 편차 큼, 광고성 README 존재 | 미확인 |
| **비용** | 낮음 — 3건 fetch | 낮음~중 — 6건 fetch | 미확인 |
| **latency** | **추정 150~250ms** (AI타임스 실측 24~75ms/건 기준) | 추정 300~500ms | 미확인 |
| **유지보수** | 낮음 — `BODY_FETCH_SOURCES`에 항목 추가 + 셀렉터 1개 | 중 — README 포맷이 제각각(코드블록·표·배지 제거 필요) | 미확인 |
| **robots/정책** | **huggingface.co robots `*` Disallow 0개** — 차단 없음 | 같음 | 같음 |

### 추천안 — **B-1**

- 기존 인프라(`article-body.ts`)를 그대로 재사용한다. **새 기전을 만들지 않는다.**
- `pickRicherText`가 이미 "긴 쪽을 고른다"라 본문이 빈약하면 자동으로 지금 값으로 되돌아간다
  (AI타임스에서 실제로 본문 57자 < RSS 56자 사례가 있었다).
- 실측 근거: AI타임스에 같은 처방을 넣었을 때 RSS 300자 → 재료 1,537~2,000자, 요약 평균 +26%.
- ⚠️ **Trending Models(4~6번)는 손대지 않는다.** 그건 태그 나열이 정상인 데이터이고,
  developer_trend의 재료는 Blog 쪽이 담당해야 한다. B-2는 B-1이 부족할 때만.
- ⚠️ 선행 확인: `huggingface.co/blog/<slug>`의 실제 HTML 구조와 본문 셀렉터를 먼저 재라.
  그리고 **robots.txt를 구현 시점에 다시 확인**해라(오늘 값은 오늘 값이다).

---

## C. tool_updates 공식 source 확장

### 목표 재정의 (사용자 지시)

> ❌ "GitHub 업데이트"
> ✅ **"그날 AI 개발자에게 중요한 공식 모델/API/개발도구 업데이트 1~3건"**

provider 다양성을 강제로 채우지 않는다. 그날 중요한 것이 GitHub뿐이면 GitHub만 나와도 된다.
문제는 **입력 풀 자체가 GitHub 하나**인 구조다.

### 현재 문제

1. `dev_input`은 `github` / `huggingface` 2배열뿐이고, 프롬프트가 `tool_updates`에 **github만** 지목한다.
2. 🔴 **그런데 GitHub 재료조차 다 쓰지 않고 있다.** `rss.ts`가 `content:encoded`(중앙 **1,738자**)를
   골라주는데 `dev-ecosystem.ts:79`가 `c.summary.slice(0, 400)`으로 **400자에서 자른다.**
   오늘 dev_input의 GitHub 6건이 정확히 400자에서 단어 중간에 끊겨 있다
   (`"A package can now have more than one t"`).
3. 제목 영어 문제: 코드는 title을 덮지 않고 프롬프트는 한국어를 요구한다.
   **영어 title은 `06bc18df`(Test 계정) 행에만** 있고 세린 등 4계정은 09-03·09-04 **8/8 한국어**다.
   `generate.ts`가 "여러 명이면 Gemini 호출 1회, 결과를 각자 행으로 저장"하므로
   한국어 4행 = 크론 1회, Test 1행 = 별도 호출(로컬 "지금 업데이트")이다. → **호출 단위 편차.**

### 선택지

| | C-1 400자 컷 완화 (소스 무증가) | C-2 공식 provider 2~3곳 추가 | C-3 전면 확장(8곳) |
|---|---|---|---|
| **무엇을** | `slice(0,400)` → 1,200~2,000자 | Cursor·Google Dev·Azure 추가 | 위 표의 실존 feed 전부 |
| **정확도** | **높음** — 같은 공식 소스의 잘린 뒷부분을 되찾는 것 | 높음(전부 공식 1차 소스) | 높음 |
| **비용** | **0** — 네트워크·호출 무증가. 프롬프트 토큰만 증가 | fetch +2~3건 | fetch +6건 |
| **latency** | 0 | **추정 +200~400ms** | 추정 +0.5~1s |
| **유지보수** | **가장 낮음** — 상수 1개 | 중 — 소스별 키워드 필터·중복판정 필요 | **높음** — feed 8개 수명 관리 |
| **robots/정책** | 없음 | 없음(0-2 확인) | 없음이지만 표면이 넓다 |
| **위험** | ~~dev_input 스냅샷 상한 초과 중(223,629자)~~ → **💀 이 수치는 틀렸다. 아래 "C-1 구현 완료" 참조** | 그날 중요도 판정이 어려워진다 | 같음 + GitHub 편중이 다른 편중으로 바뀔 수 있다 |

Anthropic·Meta AI는 **공식 AI feed가 없어 후보에서 제외된다**(0-3). 즉 C-2/C-3로 가도
"8곳 균등"은 애초에 불가능하다. 실현 가능한 조합은 OpenAI(153자) · Google Dev(617자) ·
Azure(10,659자) · Cursor(1,545자) · GitHub(1,738자) 5곳이다.

### 추천안 — **C-1 먼저, 효과 측정 후 C-2**

1. **1단계 = C-1.** 비용 0·latency 0·유지보수 최소이고, "입력 풀이 GitHub 하나"보다 먼저
   **"있는 재료를 400자에서 버리고 있다"**를 고치는 것이 순서다. 이것만으로 tool_updates의
   `summary` 품질(①무엇이 바뀜 ②개발자 의미)이 올라갈 가능성이 크다 — 오늘 6건이 전부
   중간에 끊겨 있었으므로.
   ~~⚠️ 같이 볼 것: dev_input 스냅샷 상한(64,000자)을 이미 넘고 있다. 컷을 올리기 전에
   스냅샷 정책을 먼저 정해라.~~ → **철회. 아래 "C-1 구현 완료"를 읽어라.**
2. **2단계 = C-2**, 그리고 provider는 **Cursor + Google Dev**부터. 둘 다 AI 개발도구/모델 발표를
   직접 내고 재료가 충분하다(1,545 / 617자). Azure는 재료가 10,659자로 과하고 AI 비중이 낮아
   키워드 필터를 먼저 설계해야 한다.
3. **제목 한국어**: `display_title` 필드를 새로 만들기 **전에** 위 "호출 단위 편차"를 먼저 가려라.
   세린 계정이 이미 한국어라면 필드 추가는 불필요한 스키마 변경이다. 원인이 편차로 확정되면
   프롬프트에 "title에 영문 원문을 그대로 넣지 말라"를 한 줄 더 못박는 것으로 충분할 수 있다.
   🔴 원본 `title`·`url`·`source`는 어떤 안에서도 **보존**한다(추적 근거).

---

### ✅ C-1 구현 완료 (2026-09-05) — 그리고 **전제 하나가 틀렸다**

**💀 "dev_input 스냅샷이 223,629자로 상한을 초과해 저장되지 않고 있다"는 틀렸다.**
그 숫자는 운영 실측이 아니라 **`generate.check.ts` ③번 테스트의 합성 픽스처**
(400건 × 400자)가 뱉는 `console.warn` 한 줄이었다. 테스트 로그를 운영 수치로 옮겨 적은 것이다.

DB 실측(`briefing` 25행):

| | 실측 |
|---|---|
| 09-04 5행의 `dev_input` | **5,666 ~ 5,770자** — 전부 정상 저장 (상한 64,000의 **8.8%**) |
| 09-03 이전 행에 없는 이유 | 상한 초과가 아니라 **이 기능이 09-03에 들어갔기** 때문 |
| 400자 컷 실재 여부 | ✅ **실재** — dev_input이 있는 모든 날 GitHub **6/6건이 정확히 400자** |

👉 **"스냅샷 정책을 먼저 정해라"는 선행조건은 성립하지 않는다.** 정책은 그대로 두고 컷만 올렸다.

**변경**: `DEV_DESCRIPTION_MAX_CHARS = 2000` 신설(`sources.ts`) → `dev-ecosystem.ts`가 그것을 쓴다.
`DEV_SNAPSHOT_MAX_CHARS`를 export하고 `generate.check.ts` ⑤(최악 크기 < 상한)를 추가했다.

**효과 실측**(GitHub Changelog, 필터 후 6건):

| | 컷 400 (전) | 컷 2000 (후) |
|---|---|---|
| description 길이 | `[400×6]` | `[2000, 1837, 1738, 1426, 1421, 1040]` |
| 버려진 글자 | **7,062자** | 0자 (상위 상한 몫 제외) |
| `dev_input` 크기 | 5,576자 (8.7%) | **12,728자 (19.9%)** |
| 최악 스냅샷(상수 계산) | — | 26,962자 = 상한의 **42.1%** |

🔴 **남은 천장은 여기가 아니다 — `rss.ts:79`의 `MAX_SUMMARY_LENGTH = 2000`이다.**
`summary`가 상위에서 이미 2000자로 잘려 오므로 이 컷을 2000으로 두면 **더 버리는 것이 없다**
(컷 4000으로 재도 크기가 동일한 것이 증거다). 6건 중 1건은 그 2000에서 단어 중간에 끊긴다
(`"…The post Multiple trusted publis"`). 그 상수는 **뉴스 후보 30건 기준**으로 계산된 값이라
(2000 → 입력 60,000자 / 2500 → 75,000자) dev만 올릴 수 없다 — **별건이고, 올리려면 뉴스 입력량을
같이 재야 한다.** C-1에서는 손대지 않았다.

⚠️ 그래서 상수를 2000에 두고 **지우지 않았다**: 지우면 dev 입력량이 뉴스용 상수에 조용히 딸려간다.

**미검증**: 크론이 이 컷으로 실제 돈 결과(다음 회차 10:10). `tool_updates` 문장 품질이 실제로
올라가는지는 **다음 회차 `dev_input`과 출력을 대조해야** 안다 — 재료가 늘어난 것만 확인했다.

---

## D. 후속 후보 (이번 세션에서 고치지 않았다 — 사용자 지시)

### D-1. Ars 문단 품질 — LLM 지시 vs 결정적 병합

> **문단 품질을 LLM 지시만으로 유지할지, 생성 후 연속된 짧은 1문장 문단을
> deterministic하게 병합할지 비교 필요.**

근거(2026-09-04 실측):

| | 평균 문단 | 1문장 문단 | 총량 |
|---|---:|---:|---:|
| `9a242aa` 수정 전 | 79자 | 100% | 326 |
| `9a242aa` 수정 후 | 121자 | 46% | 498 |
| **오늘 Ars 2건 평균** | **75자** | **100% (4연속)** | **299** |

- `9a242aa`는 HEAD ancestor이고 `WRITER_SUFFIX`·모델·`RICH_MATERIAL` 전부 무변경이다
  (이후 `rewrite.ts` 변경은 `1a59b20` 순차→동시 호출 리팩토링 하나뿐).
- 🔴 **같은 날 AI타임스 건은 문단 4개 전부 2문장·평균 181자·총량 723자**로 목표를 넘었다.
  그리고 **재료 2,000자인 두 건이 181자/0% vs 96자/100%로 갈렸다** → 재료·프롬프트가 아니라
  **생성 편차**다. 그래서 프롬프트를 또 덧대지 않았다(같은 자리 6번째 시도가 된다).
- 결정적 병합을 검토할 때의 위험: `rewrite.ts` 주석이 이미 기록한 **교환 관계**
  (문단 밀도 +8~12% ↔ 총량 −8~24%)를 병합도 그대로 겪을 수 있다. 병합은 총량을 안 줄이지만
  `summary_paras` 개수가 `usable()`의 `summaryRange` 하한을 깨면 그 건이 통째로 fail-open된다.
  → **병합은 `usable()` 통과 후, 개수 하한을 지키는 범위에서만** 가능하다.
- 판정 기준을 미리 정해둘 것: "1문장 문단이 연속 3개 이상"을 병합 대상으로 본다
  (1문장 문단 하나는 정상이다 — 사용자 지시).

### D-2. 계측 함정 (다음 세션이 다시 밟지 않게)

1. 💀 **`briefing`은 사용자별로 행이 다르다.** 같은 날 5행이고 `selected_news`·`trend_brief`가
   서로 다르다. 첫 행을 잡으면 사용자가 보는 화면과 다른 것을 잰다 — **실제로 두 번 틀렸다.**
   로컬 브라우저는 `Test 06bc18df`다(인계 33-6).
2. 💀 **한국어 문장 수를 정규식 `split`으로 세지 마라.** zero-width 매칭 때문에 2문장 문단이
   1로 세어져 "전부 100% 1문장"이라는 거짓 양성이 났다. `'다.'` 개수로 세고 **문단 원문을
   덤프해서 눈으로 대조**해라.
3. 💀 **`groundTakeaways`는 `action + why_today + "(근거: …)"`로 이어붙인다.** 그래서 문자열의
   마지막 문장은 항상 why_today("…때문입니다")다. action의 종결(⑤)을 판정하려면 why 문장을
   먼저 떼야 한다 — 안 떼면 5/5인 결과가 ⑤=X로 나온다.
4. 💀 **`source_article`의 옛 행과 새 행을 섞어 중앙값을 내지 마라.** Ars 재료가 "1,264 → 81로
   붕괴"한 것처럼 보였는데, 수집일자별로 보면 `12e6f8d`(09-03) 배포 시점부터 79 → 1,040으로
   **올랐다.** `content:encoded` 경로는 정상 작동 중이다.
5. **재료 통계는 `source_article.summary`만으로 완결되지 않는다** — AI타임스의 본문 보강은
   rewrite 시점에 일어나고 **저장되지 않는다.** 그래서 sum/mat이 111%처럼 나온다.
