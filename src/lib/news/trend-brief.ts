import { Type } from "@google/genai";
import type { SelectedNewsItem } from "./select";
import type { DevEcosystem, DevUpdate } from "./dev-ecosystem";
import { getGenAIClient } from "../ai/client";

// 요청서 16절 JSON Schema. 근거가 부족한 섹션은 null을 그대로 받는다 (17절)
export type TrendToolUpdate = {
  title: string;
  summary: string;
  source: string;
  published_at: string | null;
  url: string | null;
};

export type TrendDeveloperTrend = {
  title: string;
  summary: string;
  source: string;
  url: string | null;
};

// 🔴 2026-09-05 — `도구·서비스`(tool_updates)를 대체하는 새 섹션이다(제품 결정, Notion Decision).
// 공식 제품/API/도구 업데이트는 **News > Official이 전담**하므로 Trend는 같은 목록을 다시 만들지 않고,
// 그날 재료에서 관찰된 흐름을 보고 **중요성이 커지는 개발 역량**을 해석한다.
//
// 왜 필드를 넷으로 나누나: 화면이 `역량명 → 왜 지금 → 준비 포인트`로 읽히게 하려면 문자열 하나로
// 받으면 안 된다(업계 영향이 `content` 하나여서 한 덩어리로 보였던 것과 같은 사고 — 29절).
// `evidence_title`은 **코드가 대조**하는 필드다(groundSkillSignals). 지시만으로는 안 걸린다.
export type TrendSkillSignal = {
  skill: string;
  why_now: string;
  prepare_focus: string;
  // 🔴🔴 v2(2026-09-05) — **근거가 하나면 안 된다.** v1은 `evidence_title` 하나만 대조해서,
  //   그날 기사 한 건의 세부 기술이 그대로 역량명으로 승격됐다(실제 출력: "웹 GPU 커널 활용 최적화").
  //   근거 하나로는 "이 기사에 이런 게 나왔다"와 "여러 흐름이 이 능력을 가리킨다"를 구분할 수 없다.
  //   → **서로 다른 입력 항목 2개 이상**이 같은 방향을 가리킬 때만 통과시킨다.
  evidence_titles: string[];
  evidence_sources: string[];
  /** @deprecated v1(`222f327`) 행 호환용. 새로 채우지 않는다 — 읽을 때만 쓴다. */
  evidence_title?: string;
  /** @deprecated v1 행 호환용. */
  evidence_source?: string;
};

// v1 행(`222f327`로 생성된 것)은 근거가 단건이다. 화면·메모가 **한 경로로** 읽도록 배열로 맞춘다
// (`tool_updates ?? [tool_update]`와 같은 방식 — 평행 분기를 만들지 않는다).
export function evidenceTitlesOf(s: TrendSkillSignal): string[] {
  return s.evidence_titles?.length ? s.evidence_titles : s.evidence_title ? [s.evidence_title] : [];
}
export function evidenceSourcesOf(s: TrendSkillSignal): string[] {
  const list = s.evidence_sources?.length ? s.evidence_sources : s.evidence_source ? [s.evidence_source] : [];
  return [...new Set(list)];
}

export type TrendBriefResult = {
  // 🔴 2026-09-03 — `content`(문자열 하나)만 있던 것에 `points`를 더했다.
  // 업계 영향이 화면에서 한 덩어리로 보인 원인이 **두 겹**이었다:
  //   ① 데이터가 문자열 하나 ② `.trend-detail-body`에 `white-space: pre-line`이 없어서
  //      모델이 `\n`을 넣어도 브라우저가 접는다.
  // → 프롬프트에 "\n을 넣어라"로 고치면 UI가 LLM 문자열에 의존한다(사용자 금지). 항목으로 받는다.
  // `content`는 계속 채운다(points를 join) — 메모 전체저장·과거 데이터가 그 필드를 읽는다.
  industry_impact: { content: string; points?: string[] } | null;
  // 🔴🔴 2026-09-05 — `tool_update`/`tool_updates`는 **과거 데이터 읽기 전용**이 됐다.
  //   신규 생성은 둘 다 채우지 않는다(`tool_update: null` · `tool_updates: undefined`).
  //   **타입에서 지우지 마라** — `briefing.trend_brief`는 JSONB라 마이그레이션이 없고, 09-04까지의
  //   행에는 이 필드가 그대로 들어 있다. 지우면 과거 날짜 조회가 타입에서부터 깨진다.
  //   화면은 `tool_updates ?? [tool_update]`로 읽어 과거 행만 그 블록을 그린다.
  tool_update: TrendToolUpdate | null;
  tool_updates?: TrendToolUpdate[];
  developer_trend: TrendDeveloperTrend | null;
  // 🔴 신규 섹션. optional인 이유는 **과거 행에 이 키가 없어서**다 — 필수로 만들면 옛 데이터가 깨진다.
  skill_signals?: TrendSkillSignal[];
  // 🔴 2026-09-03 — **저장·UI 타입은 `string[]` 그대로다.** 모델에게는 아래 스키마로 객체
  // (action / why_today / evidence_title)를 받지만, `groundTakeaways`가 근거를 대조한 뒤
  // 문자열로 합쳐서 이 필드에 넣는다. 화면(`<li>{t}</li>`)·메모 저장(`bullets`)·과거 데이터가
  // 전부 `string[]`을 읽으므로 **UI를 한 줄도 안 바꾸려고** 이 경계를 유지한다.
  practical_takeaways: string[];
};

// 실무 적용의 근거로 인정되는 입력 항목 — 프롬프트에 실제로 들어간 제목만 모은다.
export type EvidenceSource = { title: string; source: string };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 개수는 프롬프트가 아니라 스키마가 센다(select.ts가 세운 원칙 — 프롬프트만으로는 실패했다).
    industry_impact: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        points: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "2", maxItems: "3" },
      },
      required: ["points"],
    },
    // 🔴 2026-09-05 — `tool_updates`를 스키마에서 **제거했다.** Official이 전담하는 영역이라
    //    Trend가 같은 목록을 다시 만들면 두 기능이 같은 정보를 중복 노출한다(제품 결정).
    //    그 자리를 아래 `skill_signals`가 대신한다.
    // ⚠️ minItems를 걸지 않는다 — 근거가 약한 날 1~2건을 강제하면 모델이 없는 것을 만든다
    //    (사용자 금지). 상한만 스키마로 걸고 개수는 코드가 센다.
    skill_signals: {
      type: Type.ARRAY,
      maxItems: "2",
      items: {
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          why_now: { type: Type.STRING },
          prepare_focus: { type: Type.STRING },
          // 🔴 v2 — 여기만 `minItems`를 건다. **signal 개수에는 안 건다**(0개가 정상 출력이다).
          //    항목 하나가 서 있으려면 근거가 둘 이상이어야 한다는 뜻이고, 근거를 못 대면
          //    그 항목이 사라질 뿐 다른 항목을 억지로 만들게 하지 않는다.
          evidence_titles: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "2", maxItems: "3" },
        },
        required: ["skill", "why_now", "prepare_focus", "evidence_titles"],
      },
    },
    developer_trend: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        source: { type: Type.STRING },
        url: { type: Type.STRING, nullable: true },
      },
      required: ["title", "summary", "source"],
    },
    // 🔴 문자열 → 객체. 근거(evidence_title)를 **필수 필드로** 받아야 코드가 대조할 수 있다.
    //    minItems는 걸지 않는다 — 빈 배열이 정상 출력이다(근거가 없는 날).
    practical_takeaways: {
      type: Type.ARRAY,
      maxItems: "3",
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING },
          why_today: { type: Type.STRING },
          evidence_title: { type: Type.STRING },
        },
        required: ["action", "why_today", "evidence_title"],
      },
    },
  },
  required: ["industry_impact", "developer_trend", "skill_signals", "practical_takeaways"],
};

const SYSTEM_PROMPT = `당신은 AI 개발자를 위한 기술 동향 분석기입니다.
아래 제공된 데이터만 사용해 "AI Trend Briefing"을 한국어로 생성하세요.

[industry_impact — 업계 영향]
"주요 AI 뉴스" 전체를 종합해 AI 산업·기업·개발 환경에서 나타나는 **핵심 흐름 2~3개**를
points 배열에 담으세요. **배열 항목 하나가 곧 하나의 흐름이고 화면의 한 문단입니다.**
각 항목은 2~3문장으로 아래 **네 가지가 모두** 드러나게 씁니다.
  ① **오늘 자료에서 확인된 변화** — 어떤 흐름이 관찰됐는지(추측이 아니라 위 입력에 있는 것)
  ② **영향을 받는 구체적 주체** — 누구인지 지목합니다. "업계"·"시장"·"생태계"는 주체가 아닙니다.
     (예: 에이전트를 운영하는 기업 · 상용 API를 제공하는 팀 · 온디바이스 앱 개발자 · 후발 모델 개발사)
  ③ **기존 상황과 무엇이 달라지는지** — 전에는 어땠고 이제는 어떻게 되는지의 차이
  ④ **그 주체에게 생기는 실제 선택·부담·기회** — 그래서 **누가 무엇을 다시 결정해야 하는가.**
     이것이 항목의 마지막 문장입니다. 🔴 ④가 없으면 그 항목은 쓰지 않은 것으로 봅니다.
개별 뉴스를 다시 요약하지 마세요. 여러 뉴스에서 공통으로 확인되는 흐름을 우선하세요.
서로 관련 없는 뉴스를 억지로 하나의 흐름으로 연결하지 마세요.
🔴 흐름이 2개밖에 안 보이면 2개만 쓰세요. 칸을 채우려고 억지 흐름을 만들지 마세요.

🔴🔴 **아래처럼 끝나는 문장은 이 섹션의 실패입니다 — 전망만 하고 멈춘 것입니다.**
   "중요성이 커질 수 있습니다" / "영향력이 확대될 수 있습니다" / "생태계가 활성화될 수 있습니다"
   "가능성이 있습니다" / "가속화될 전망입니다" / "확장될 수 있습니다" / "빨라질 수 있습니다"
   이런 문장은 어느 날 갖다 놔도 말이 되고, 읽는 개발자가 할 일이 하나도 안 생깁니다.
⚠️ 그래도 **확정 사실처럼 단정하지는 마세요** — 다만 그 조심스러운 표현은 **문장 끝이 아니라
   중간**에 둡니다. 끝은 언제나 ④(누가 무엇을 다시 결정해야 하는가)로 맺습니다.
   ❌ "가격 인하가 이어지며 도입 비용 부담이 낮아질 가능성이 있습니다."
   ✅ "가격 인하가 이어지며 도입 비용 부담이 낮아지는 흐름으로 보입니다. 자체 모델을 운영하던
      팀은 직접 서빙 비용과 API 단가를 다시 비교해 어느 쪽을 유지할지 결정해야 합니다."
🔴 입력에 없는 수치·기업 계획·시장 규모를 만들지 마세요. 지어낸 근거로 ④를 채우면 안 됩니다.
🔴 항목 안에는 줄바꿈을 넣지 마세요. 문단 분리는 배열이 합니다.
뉴스가 없으면 null.

[skill_signals — 역량 시그널]
🔴 이 섹션은 **제품·API·도구 업데이트를 나열하는 칸이 아닙니다.** 그 일은 다른 기능(News > Official)이
   전담합니다. 여기서 OpenAI·Claude·Gemini·Cursor·GitHub 등의 릴리스 목록을 **다시 만들지 마세요.**

🔴🔴 **여기서 뽑는 것은 "오늘 기사에 나온 기술 키워드"가 아닙니다.**
   여러 기술·개발 흐름에서 읽히는, **AI 개발자가 앞으로 다른 프로젝트에서도 계속 쓸 수 있는
   전이 가능한 개발 역량**입니다. 오늘 언급된 특정 기사·제품·라이브러리가 내일 사라져도
   **여전히 가치가 있는 능력**이어야 합니다.

[좋은 방향 — 이 추상화 수준을 맞추세요]
  에이전트 상태·메모리 관리 · 에이전트 실행 추적·디버깅 · LLM 평가·관찰 가능성 ·
  RAG 검색 품질 설계 · 구조화 출력·데이터 계약 설계 · Tool/API 연동과 실패 처리 ·
  멀티에이전트 오케스트레이션 · 멀티모달 AI 파이프라인 설계 ·
  모델 선택과 추론 성능·비용 최적화 · AI 서비스 보안·권한 설계

[나쁜 방향 — 전부 실패입니다]
  ❌ 웹 GPU 커널 활용 최적화        (기사 하나의 세부 구현 기술)
  ❌ 특정 모델의 특정 기능 제어      (그 모델이 사라지면 남는 게 없음)
  ❌ 특정 SDK 사용법 / 라이브러리 옵션 조정
  ❌ 기사 제목을 명사형으로 바꾼 것

[쓰는 절차 — 이 순서로 하세요. 역량명부터 떠올리지 마세요]
  1단계. 위 세 블록의 **모든 항목을 훑어 반복되는 주제를 찾습니다.** 서로 다른 항목 2개 이상이
         같은 방향을 가리키면 그것이 후보입니다. (같은 블록 안이어도 되고, 블록을 걸쳐도 됩니다.)
         🔴 훑을 때 **아래 축을 하나씩 대보세요.** 이 중 2개 이상 항목이 걸리는 축이 있으면
            그것이 곧 후보입니다. 축이 하나도 안 걸릴 때만 빈 배열입니다.
            에이전트 구조·자율 실행 / 상태·메모리·컨텍스트 / 평가·관찰·디버깅 /
            검색·RAG·데이터 품질 / 구조화 출력·스키마 / 도구·API 연동과 실패 처리 /
            멀티모달 처리 / 모델 교체·지원 종료·비용 / 실행 환경(로컬·온디바이스·서빙) /
            보안·권한·오남용 방지
  2단계. 그 주제를 **한 단계 위의 개발 능력으로 일반화**합니다. 제품·모델 이름을 지우고,
         "이 흐름을 다루려면 개발자에게 어떤 능력이 필요한가"로 바꿔 쓰세요.
  3단계. 아래 통과 조건 다섯을 확인하고, 걸리는 것이 있으면 그 후보를 버립니다.

[2단계 예시 — 주제에서 역량으로 올리는 법]
  · 주제: 코딩 에이전트가 세션을 넘어 기억을 유지하는 이야기가 여러 자료에 나옴
    → 역량: "에이전트 상태·메모리 관리"   (❌ "특정 도구의 메모리 기능 활용")
  · 주제: 같은 계열 모델이 자주 교체되고 구형이 지원 종료됨
    → 역량: "모델 선택과 전환 비용 관리"   (❌ "특정 모델 버전 전환")
  · 주제: 이미지·텍스트를 함께 다루는 모델이 여러 건 등장
    → 역량: "멀티모달 AI 파이프라인 설계"  (❌ "특정 비전 모델 로컬 실행")

[통과 조건 — 다섯 개를 **전부** 만족해야 합니다. 하나라도 아니면 그 항목을 버리세요]
  ① **전이 가능성** — 다른 프로젝트·모델·도구에서도 쓸 수 있는 능력인가?
  ② **AI 개발 직무 관련성** — 일반 소프트웨어 개발자가 아니라 **AI 애플리케이션 / AI Agent
     Engineer**가 설계·구현·디버깅할 때 실제로 쓰는 능력인가?
  ③ **반복 근거** — 오늘 **서로 다른 입력 자료 2개 이상**이 같거나 가까운 방향을 가리키는가?
  ④ **적절한 추상화 수준** — 기사의 세부 구현 기술보다 **한 단계 위의 개발 능력**으로 일반화됐는가?
  ⑤ **준비 가능성** — 읽는 사람이 "그래서 내가 무엇을 이해·설계·구현·설명할 수 있어야 하나"를 아는가?

항목마다 네 필드를 채웁니다.
· skill           — 넓지만 구체적인 역량명(공백 포함 24자 이내 권장).
                    🔴 **회사명·제품명·모델명·라이브러리명·API 이름을 넣지 마세요.**
                       ❌ "WebGPU 커널 최적화"      → ✅ 근거가 충분하면 "모델 추론 성능·자원 최적화"
                       ❌ "Claude 메모리 기능 활용" → ✅ "에이전트 상태·메모리 관리"
                       ❌ "특정 멀티모달 모델 로컬 제어" → ✅ 반복 근거가 충분하면 "멀티모달 AI 파이프라인 설계"
                    🔴 반대로 **지나치게 일반적인 것도 금지**입니다:
                       ❌ "AI 활용 역량" · "생성형 AI 이해" · "개발 능력" · "최신 기술 학습"
                    **넓지만 구체적이어야 합니다.**
· why_now         — 🔴 **근거 기사 하나를 요약하지 마세요.** 반드시 **2개 이상의 근거에서 공통으로**
                    무엇이 나타났는지 설명해야 합니다.
                    ❌ 나쁜 예: "WebGPU에서 새로운 커널 기능이 등장해 이 역량이 중요합니다."
                    ✅ 좋은 형태: "오늘 여러 개발 생태계 자료에서 모델을 더 작은 환경에서 실행하고
                       추론 비용·지연을 줄이려는 흐름이 함께 확인됐습니다. 모델을 단순 호출하는 것을
                       넘어 실행 조건에 맞게 성능과 자원 사용을 조정하는 역량의 중요성이 커지고 있습니다."
                    🔴 입력에 없는 사실·수치를 더하지 마세요.
· prepare_focus   — **실험 지시가 아니라 학습·역량 도달 기준**을 씁니다.
                    형태: **무엇을 이해하고 → 무엇을 설계/구현하고 → 무엇을 설명할 수 있어야 하는가**
                    ✅ 예: "세션 상태와 장기 메모리의 차이를 이해하고, 저장·조회·갱신 흐름을 직접
                       설계하며, 어떤 정보를 언제 유지하거나 버릴지 설명할 수 있는 수준을 준비한다."
                    🔴 "~공부해보세요" · "~살펴보세요" 같은 추상 조언은 금지입니다.
                    🔴 "무엇을 시험하고 무엇을 결정하라"도 쓰지 마세요 — 그것은 실무 적용의 일입니다.
· evidence_titles — 근거로 삼은 항목의 **제목을 위 입력에서 그대로 복사**한 배열입니다. **2~3개.**
                    🔴 **서로 다른 입력 항목**이어야 합니다. 같은 항목을 두 번 쓰지 마세요.
                    🔴 입력에 없는 제목을 쓰면 **그 항목 전체가 버려집니다.** 두 번째 근거를 지어내지 마세요.
                    🔴 근거를 2개 못 대겠으면 **그 역량은 쓰지 마세요.** 그것이 정상입니다.

🔴🔴 **채용시장을 추정하지 마세요 — 이 입력에는 채용공고 데이터가 한 건도 없습니다.**
   아래 표현은 근거가 존재할 수 없으므로 그 항목을 버립니다:
   "채용 수요가 증가" / "기업들이 요구한다" / "취업 필수" / "채용공고에 많이 등장" /
   "몸값이 오른다" / "구인이 늘고 있다"
   역량 시그널은 **기술 흐름 → 중요해지는 개발 능력**까지만 말합니다. 시장·연봉·구인은 말하지 않습니다.

🔴 **개수는 0~2개입니다.** "2개를 반드시 만든다"가 목표가 아닙니다 — 근거가 약한 2개보다 0개가 낫습니다.
   다만 **1단계에서 반복 주제를 실제로 찾았다면 그것은 쓰세요.** 조건을 지나치게 엄격하게 적용해
   있는 흐름까지 버리는 것도 실패입니다. 판단 기준은 하나입니다:
   **"서로 다른 입력 항목 2개 이상이 같은 방향을 가리키는가."** 그렇다면 쓰고, 아니면 빈 배열입니다.
🔴 개발자 동향과 **같은 내용을 표현만 바꿔 반복하지 마세요.** 개발자 동향은 "개발자들이 무엇을 어떻게
   바꾸고 있는가"이고, 역량 시그널은 "그래서 어떤 능력을 갖추는 것이 중요해지는가"입니다.
🔴 실무 적용과도 겹치면 안 됩니다. 실무 적용은 "무엇을 시험·비교하고 무엇을 결정하는가"입니다.
skill·why_now·prepare_focus는 전부 자연스러운 한국어로 씁니다.

[developer_trend — 개발자 동향]
"Hugging Face 생태계 데이터"에서 단순 모델 출시 소식이 아니라
AI 개발 방식 또는 생태계가 어디로 움직이는지를 분석하세요.
"신모델이 나왔다" 수준에서 끝내지 말고, 그 항목이 보여주는 개발 방식의 변화를 쓰세요.
여러 항목에서 공통되는 흐름이 있으면 우선하세요.
입력에 근거가 없는 성능 평가나 모델 우열 판단은 하지 마세요.
title은 흐름을 요약한 짧은 제목, summary는 2~4문장.
title과 summary는 반드시 자연스러운 한국어로 쓰세요. 근거로 삼은 입력(Hugging Face 블로그 등)이 영어
원문이어도 그대로 옮기지 말고 한국어로 번역·설명하세요. 모델명·라이브러리명 등 고유명사는 번역하지 않습니다.
url은 근거로 삼은 항목의 입력값을 그대로 복사하고, 없으면 null.
의미 있는 흐름을 찾을 수 없으면 null.
🔴 여기에 **역량명이나 준비 목표를 쓰지 마세요** — 그것은 역량 시그널의 일입니다.
   이 섹션은 "개발자들이 무엇을 어떻게 바꾸고 있는가"까지만 씁니다.

[practical_takeaways — 실무 적용]
🔴 이 섹션은 **일반적인 AI 개발 팁을 쓰는 칸이 아닙니다.**
   **오늘 위에 제공된 자료에서 실제로 확인된 변화** 때문에 지금 개발자가 검토하거나 시험해볼
   가치가 생긴 행동만 씁니다.

항목마다 세 필드를 채웁니다.
· action        — 개발자가 실제로 해볼 수 있는 행동. 아래 다섯이 **모두** 드러나게 씁니다.
                  ① **누구에게 해당되는가** — 조건이 필요하면 "~를 쓰고 있다면"처럼 **조건으로** 씁니다.
                     🔴 읽는 사람의 환경을 **단정하지 마세요.** "기존에 사용하던 ~", "지금 쓰고 있는 ~"은
                        확인된 적이 없는 가정입니다. 조건문으로 바꿔 쓰세요.
                  ② **무엇을 바꿀 것인가** — 무엇을 무엇으로 바꾸는지(A -> B)가 드러나야 합니다.
                  ③ **어떤 동일 작업·조건에서 시험할 것인가** — **같은 작업을 같은 조건으로** 돌려야
                     비교 결과가 의미를 갖습니다. 어떤 작업에 적용해 보는지를 적으세요.
                     🔴 "~ 환경에서"처럼 **장소만** 적은 것은 ③이 아닙니다.
                  ④ **무엇을 비교할 것인가 — 지표·관찰값을 이름으로 적습니다.**
                     예: 응답 시간 · 실패율 · 재시도 횟수 · 비용 · 출력 차이 · 통과한 테스트 수.
                     🔴 "성능을 비교한다"는 지표가 아닙니다. **무엇을 재는지**를 적으세요.
                     🔴 입력에 수치가 없으면 수치를 만들지 말고 **지표 이름만** 적으세요.
                  ⑤ **그 결과를 보고 무엇을 결정할 것인가 — 이것이 action의 마지막 문장입니다.**
                     🔴🔴 **⑤는 선택사항이 아닙니다. ⑤가 없으면 그 항목은 쓰지 않은 것으로 봅니다.**
                     action은 반드시 "~를 결정한다 / ~를 판단한다 / ~인지 확인해 정한다"처럼
                     **판단·결정 문장으로 끝나야** 합니다. 비교까지 쓰고 멈추지 마세요.
                     결정에 조건이 필요하면 "결과가 동등 이상이면 ~한다"처럼 조건부 결정으로 씁니다.
                     🔴 결정의 대상은 **개발자가 실제로 고를 수 있는 것**이어야 합니다
                        (도입 여부 · 전환 시점 · 기본값 변경 · 유지 vs 교체 · 추가 검증 필요 여부 등).
                  🔴 **근거 문장을 명령형으로 바꾼 것은 실무 적용이 아닙니다.**
                     "X가 바뀐다" → "X를 바꿔 써본다"는 정보를 하나도 더하지 않습니다.
                     "써본다 / 확인해본다 / 적용해본다"로 끝났다면 ③④⑤가 빠진 것입니다.
                  🔴 근거 자료에 없는 도구·설정·수치·환경을 지어내지 마세요.

[action 문장 구조 — 이 순서로 씁니다]
  (①조건) + (②무엇을 무엇으로) + (③같은 작업·조건에서) + (④어떤 지표를 비교) + **(⑤그래서 무엇을 결정)**

❌ 나쁜 예 — ③④⑤가 빠져 있습니다:
   "모델을 바꾸고 성능을 비교해 본다."
✅ 좋은 형태 — 다섯이 다 있고 **결정 문장으로 끝납니다**:
   "Gemini 3.5/3.6 Flash를 쓰고 있다면 3.8 Flash로 전환해 동일한 코딩 작업을 수행하고,
    응답 시간·오류 복구 성공률·비용을 비교한다. 결과가 기존 모델과 동등 이상이면 지원 종료
    전에 기본 모델 전환 여부를 결정한다."
🔴 위 예시의 **모델명·수치를 그대로 베끼지 마세요.** 문장 구조만 참고하고, 내용은 반드시
   오늘 입력에서 확인된 것으로 채웁니다. 오늘 입력에 없는 지표는 적지 않습니다.
· why_today     — **왜 하필 오늘 해볼 가치가 있는가.** 근거 자료에서 확인된 변화를 짚어 씁니다.
                  "일반적으로 유용하다"는 이유가 되지 않습니다.
· evidence_title — 근거로 삼은 항목의 **제목을 위 입력에서 그대로 복사**합니다
                  (주요 AI 뉴스 / GitHub 공식 업데이트 / Hugging Face 생태계 데이터 중 하나의 제목).
                  🔴 입력에 없는 제목을 쓰면 **그 항목은 버려집니다.** 지어내지 마세요.
                  🔴 여러 자료를 묶었으면 그중 **가장 직접적인 근거 하나**의 제목을 씁니다.

🔴 **근거는 세 블록 어디서든 고릅니다 — 블록 사이에 우선순위가 없습니다.**
   "GitHub 공식 업데이트"가 행동으로 옮기기 쉬워 보여도 그것을 기본값으로 삼지 마세요.
   "주요 AI 뉴스"와 "Hugging Face 생태계 데이터"도 **동등한 근거 후보**입니다.
   입력 **전체**에서 가장 구체적이고 지금 시험해볼 가치가 큰 근거를 고르세요.

[근거를 행동으로 바꾸는 규칙 — 자료 종류를 가리지 않습니다]
입력에 새로운 모델·기법·아키텍처·API·성능/비용 수치·연구 결과가 있으면, 개발자가 그것을
**직접 재현·비교·측정·검증**하거나 **자기 환경에 적용 가능한지 확인**하는 행동으로 바꿀 수 있습니다.
"무엇이 발표됐다"에서 멈추지 말고 "그래서 무엇을 해보면 확인되는가"까지 가세요.
발표·연구 결과라서 행동으로 못 바꾼다고 미리 판단하지 마세요 — 바꿀 수 있는지 먼저 따져보세요.

🔴 개수는 **근거가 확실한 것만 1~3개**입니다. "2개는 채워야 한다"는 규칙은 없습니다.
   확실한 것이 1개면 1개만 쓰고, **하나도 없으면 빈 배열**을 반환하세요.
⚠️ 출처를 골고루 섞으려고 뉴스나 Hugging Face 항목을 **억지로 넣지 마세요.**
   근거가 약한 항목을 다양성 때문에 포함하는 것은 이 섹션의 실패입니다.
🔴 특정 자료에 붙지 않는 범용 조언을 쓰지 마세요. "PoC를 만들어본다", "프로젝트에 적용해본다",
   "성능과 비용을 비교한다", "최신 동향을 검토한다"처럼 **어느 날 갖다 놔도 말이 되는 문장**은
   전부 이 섹션의 실패입니다.
🔴 입력 자료에 없는 사실·사용법·수치를 외부 지식으로 만들어내지 마세요.

[반드시 지킬 것]
1. 입력 데이터에 있는 정보만 사실로 사용한다.
2. 입력에 없는 모델명·기능명·기업명·날짜를 만들지 않는다.
3. 입력에 없는 성능 수치나 벤치마크를 만들지 않는다.
4. 사실과 분석을 구분한다.
5. 충분한 근거가 없는 섹션은 null을 반환한다. 섹션을 채우려고 내용을 발명하지 않는다.
6. url·source·published_at은 입력값을 그대로 유지하고 임의로 바꾸지 않는다.
7. title·summary·industry_impact.content·practical_takeaways는 전부 자연스러운 한국어 문장으로 쓴다.
   입력 자료(GitHub Changelog, Hugging Face 블로그 등)가 영어 원문이어도 절대 그대로 옮기지 말고
   한국어로 번역·설명한다. 단 제품·서비스·모델 등 고유명사는 번역하지 않고 원문 그대로 둔다.
`;

// 🔴🔴 2026-09-03 — **근거 대조는 코드가 한다.** 이 저장소가 이미 세운 원칙("카운팅 제약은
// 프롬프트가 아니라 코드가 센다", select.ts·rewrite.ts)을 grounding에도 그대로 적용한 것이다.
//
// 왜 프롬프트만으로는 안 되나 (실측 2026-09-03, DB 27일):
//   "근거가 없으면 빈 배열을 반환하세요"가 이미 프롬프트에 있었는데 **0개인 날 0일 / 1개인 날 0일**,
//   최소가 항상 2였다. 대조군인 다른 세 섹션도 null·빈값이 27일 중 **0일**이다.
//   즉 "부족하면 비워라"는 지시는 27일 동안 한 번도 발동하지 않았다 — 지시로는 안 걸린다.
// 그래서 모델에게 **근거 제목을 대게 하고, 그 제목이 오늘 입력에 실제로 있는지 코드가 대조한다.**
// 범용 조언은 댈 자료가 없어서 통과 자체를 못 한다.
const TAKEAWAY_MIN = 12;   // rewrite.ts의 PARA_MIN과 같은 값 — "그렇다." 같은 빈 칸 채우기를 거른다
const MIN_KEY_LEN = 8;     // 대조 키 최소 길이. 짧은 키로 포함 판정을 하면 아무 데나 걸린다

// 대소문자·공백·구두점을 없애고 비교한다 — 모델이 제목을 옮기며 따옴표나 공백을 바꾸는 것까지
// 실패로 처리하면 정상 항목이 버려진다. 반대로 너무 느슨하면 근거 검증이 무의미해진다.
function normKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/["'`‘’“”·,.\-_/()[\]:]/g, "");
}

function matchEvidence(
  title: string,
  keyed: { title: string; source: string; key: string }[]
): { title: string; source: string } | null {
  const k = normKey(title);
  if (k.length < MIN_KEY_LEN) return null;
  const exact = keyed.find((p) => p.key === k);
  if (exact) return exact;
  // 부분 일치는 **양쪽 다 충분히 길 때만** 인정한다(HF 모델 id에서 조직명을 빼고 쓰는 경우 등).
  return keyed.find((p) => p.key.length >= MIN_KEY_LEN && (p.key.includes(k) || k.includes(p.key))) ?? null;
}

function shortTitle(t: string): string {
  return t.length <= 52 ? t : `${t.slice(0, 51)}…`;
}

// 근거가 대조되는 항목만 `string[]`으로 만들어 돌려준다. 하나도 없으면 빈 배열이 정상이다.
// export는 자체 점검(trend-brief.check.ts)이 이 판정을 직접 돌려보기 위한 것이다.
export function groundTakeaways(
  raw: unknown,
  pool: EvidenceSource[]
): { takeaways: string[]; dropped: { reason: string; text: string }[] } {
  const dropped: { reason: string; text: string }[] = [];
  if (!Array.isArray(raw)) return { takeaways: [], dropped };

  const keyed = pool
    .map((p) => ({ title: p.title, source: p.source, key: normKey(p.title) }))
    .filter((p) => p.key.length > 0);

  const takeaways: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    // 모델이 스키마를 무시하고 문자열을 돌려주면 근거가 없다는 뜻이다 — 버린다.
    if (!item || typeof item !== "object") {
      dropped.push({ reason: "객체가 아님(근거 필드 없음)", text: String(item).slice(0, 60) });
      continue;
    }
    const o = item as Record<string, unknown>;
    const action = typeof o.action === "string" ? o.action.replace(/\s+/g, " ").trim() : "";
    const why = typeof o.why_today === "string" ? o.why_today.replace(/\s+/g, " ").trim() : "";
    const ev = typeof o.evidence_title === "string" ? o.evidence_title : "";
    if (action.length < TAKEAWAY_MIN || why.length < TAKEAWAY_MIN) {
      dropped.push({ reason: "action/why_today가 비었거나 너무 짧음", text: action.slice(0, 60) });
      continue;
    }
    const hit = matchEvidence(ev, keyed);
    if (!hit) {
      dropped.push({ reason: `근거 제목이 오늘 입력에 없음: "${ev.slice(0, 50)}"`, text: action.slice(0, 60) });
      continue;
    }
    // 한 브리핑 안에서 같은 행동을 두 번 쓰지 않는다.
    const dk = normKey(action);
    if (seen.has(dk)) {
      dropped.push({ reason: "같은 브리핑 안 중복", text: action.slice(0, 60) });
      continue;
    }
    seen.add(dk);
    takeaways.push(`${action} ${why} (근거: ${hit.source} · ${shortTitle(hit.title)})`);
    if (takeaways.length >= 3) break;
  }
  return { takeaways, dropped };
}

// 🔴🔴 2026-09-05 — 역량 시그널의 근거 대조. `groundTakeaways`와 **같은 기전**이다
// (프롬프트로는 안 걸린다는 27일치 실측이 그 근거다 — 위 주석).
//
// 여기서 추가로 막는 것이 하나 더 있다: **채용시장 주장.** Trend 입력에는 채용공고가 한 건도 없어서
// "채용 수요가 늘었다"류는 근거가 **존재할 수 없다.** 그런데 evidence_title은 통과할 수 있다
// (뉴스 제목을 대고 문장에서만 채용을 말하면 된다) — 그래서 대조와 **별개로** 문구를 센다.
// 사용자가 명시적으로 금지한 항목이고, 지시만 두면 반드시 새는 자리다.
const SIGNAL_MIN = 8;          // skill은 짧다 — TAKEAWAY_MIN(12)을 그대로 쓰면 정상 역량명이 버려진다
const SIGNAL_TEXT_MIN = 12;    // why_now / prepare_focus는 문장이므로 같은 하한을 쓴다
const SKILL_MAX_LEN = 40;      // 역량명 자리에 문장을 쓴 것을 거른다(화면이 한 줄 제목으로 그린다)
const MAX_SIGNALS = 2;
const MIN_EVIDENCE = 2;        // 🔴 v2 — 서로 다른 입력 항목 2개가 같은 역량을 가리켜야 통과한다

// 채용·구인·연봉 추정 — 입력에 그 데이터가 없으므로 어떤 항목이든 이 표현이 있으면 버린다.
const JOB_MARKET_BANNED = [
  "채용", "구인", "취업", "몸값", "연봉", "이직", "커리어 시장", "인재 수요", "구직",
];

function hasJobMarketClaim(text: string): string | null {
  return JOB_MARKET_BANNED.find((w) => text.includes(w)) ?? null;
}

// 🔴🔴 v2 — **역량명에서 고유명사를 막는다.** v1이 "웹 GPU 커널 활용 최적화"를 내놓은 자리다.
//
// 왜 denylist(회사·제품명 목록)가 아니라 allowlist인가: 모델·라이브러리 이름은 매일 새로 생긴다.
// 목록을 유지하는 순간 다음 주에 나온 이름은 그대로 통과한다(이 저장소가 "표기 변이는 양쪽 다
// 넣어라"에서 이미 겪은 종류의 실패다). 그래서 반대로 **역량명에 들어와도 되는 라틴 토큰을
// 열거하고 나머지를 전부 막는다** — 새 제품명이 무엇이든 목록에 없으므로 자동으로 걸린다.
// 사용자가 제시한 좋은 예 10개에 등장하는 라틴 토큰이 정확히 이 집합이다(LLM·RAG·Tool·API·AI).
const SKILL_LATIN_ALLOW = new Set([
  "AI", "LLM", "RAG", "API", "TOOL", "MCP", "SLM", "UI", "UX", "ML", "MLOPS", "LLMOPS", "SLO", "QA",
]);
// 반대쪽 실패 — 너무 넓어서 어느 날 갖다 놔도 맞는 말. 사용자가 명시적으로 금지한 표현들이다.
const SKILL_TOO_GENERIC = [
  "AI 활용", "생성형 AI 이해", "개발 능력", "최신 기술 학습", "기술 트렌드 파악",
  "AI 이해", "프로그래밍 능력", "문제 해결 능력", "AI 역량",
];

/** 역량명이 규칙을 어기면 이유를, 통과하면 null을 돌려준다. */
export function checkSkillName(skill: string): string | null {
  const tooGeneric = SKILL_TOO_GENERIC.find((g) => skill.includes(g));
  if (tooGeneric) return `너무 일반적인 역량명("${tooGeneric}")`;
  // 라틴 문자·숫자로 이루어진 토큰을 전부 뽑아 allowlist와 대조한다.
  // (한글은 검사 대상이 아니다 — 고유명사는 대부분 라틴이고, 한글 음차는 아래 길이·일반성 규칙이 받는다)
  const latin = skill.match(/[A-Za-z][A-Za-z0-9.+#-]*/g) ?? [];
  const bad = latin.find((t) => !SKILL_LATIN_ALLOW.has(t.toUpperCase()));
  if (bad) return `역량명에 고유명사·제품명으로 보이는 토큰 "${bad}" 포함(허용: ${[...SKILL_LATIN_ALLOW].slice(0, 5).join("/")} 등)`;
  return null;
}

// 근거가 대조되고 금지 문구가 없는 항목만 돌려준다. 하나도 없으면 빈 배열이 정상이다.
// export는 자체 점검(trend-brief.check.ts)이 이 판정을 직접 돌려보기 위한 것이다.
export function groundSkillSignals(
  raw: unknown,
  pool: EvidenceSource[]
): { signals: TrendSkillSignal[]; dropped: { reason: string; text: string }[] } {
  const dropped: { reason: string; text: string }[] = [];
  if (!Array.isArray(raw)) return { signals: [], dropped };

  const keyed = pool
    .map((p) => ({ title: p.title, source: p.source, key: normKey(p.title) }))
    .filter((p) => p.key.length > 0);

  const signals: TrendSkillSignal[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      dropped.push({ reason: "객체가 아님(근거 필드 없음)", text: String(item).slice(0, 60) });
      continue;
    }
    const o = item as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
    const skill = str(o.skill);
    const why = str(o.why_now);
    const prepare = str(o.prepare_focus);
    // v2 — 배열이 정본이다. v1 행(단일 문자열)도 읽어준다(호환).
    const evRaw: unknown = Array.isArray(o.evidence_titles)
      ? o.evidence_titles
      : typeof o.evidence_title === "string"
        ? [o.evidence_title]
        : [];
    const evList = (evRaw as unknown[]).filter((x): x is string => typeof x === "string");

    if (skill.length < SIGNAL_MIN || skill.length > SKILL_MAX_LEN) {
      dropped.push({ reason: `skill 길이(${skill.length})가 ${SIGNAL_MIN}~${SKILL_MAX_LEN} 밖`, text: skill.slice(0, 60) });
      continue;
    }
    if (why.length < SIGNAL_TEXT_MIN || prepare.length < SIGNAL_TEXT_MIN) {
      dropped.push({ reason: "why_now/prepare_focus가 비었거나 너무 짧음", text: skill.slice(0, 60) });
      continue;
    }
    // 🔴 세 문장을 합쳐서 본다 — 어느 필드에 숨어도 같은 주장이다.
    const banned = hasJobMarketClaim(`${skill} ${why} ${prepare}`);
    if (banned) {
      dropped.push({ reason: `채용시장 주장 금지어 "${banned}" 포함(입력에 채용 데이터 없음)`, text: skill.slice(0, 60) });
      continue;
    }
    // 🔴 v2 — **역량명 규칙**(고유명사 금지 / 너무 일반적인 것 금지)을 코드가 센다.
    const nameProblem = checkSkillName(skill);
    if (nameProblem) {
      dropped.push({ reason: nameProblem, text: skill.slice(0, 60) });
      continue;
    }
    // 🔴🔴 v2 핵심 — **서로 다른 입력 항목 2개 이상**이 이 역량을 가리켜야 한다.
    //   근거 하나로는 "기사 하나의 세부 주제"와 "여러 흐름이 가리키는 능력"을 구분할 수 없다.
    //   모델이 없는 두 번째 근거를 지어내면 대조에서 떨어지고, 그러면 **signal 전체를 버린다.**
    const hits: { title: string; source: string }[] = [];
    const missed: string[] = [];
    for (const t of evList) {
      const h = matchEvidence(t, keyed);
      if (!h) { missed.push(t); continue; }
      if (!hits.some((x) => x.title === h.title)) hits.push(h);   // 같은 항목을 두 번 대면 1개로 센다
    }
    if (missed.length > 0) {
      dropped.push({ reason: `근거 제목이 오늘 입력에 없음: "${missed[0].slice(0, 50)}"`, text: skill.slice(0, 60) });
      continue;
    }
    if (hits.length < MIN_EVIDENCE) {
      dropped.push({
        reason: `근거가 서로 다른 입력 ${MIN_EVIDENCE}개 미만(${hits.length}개) — 기사 하나의 세부 주제로 본다`,
        text: skill.slice(0, 60),
      });
      continue;
    }
    const dk = normKey(skill);
    if (seen.has(dk)) {
      dropped.push({ reason: "같은 브리핑 안 중복", text: skill.slice(0, 60) });
      continue;
    }
    seen.add(dk);
    // evidence_title은 **모델이 쓴 문자열이 아니라 대조에 성공한 입력 제목**을 저장한다 —
    // 화면이 근거를 그릴 때 실제 입력과 어긋나지 않게 한다.
    signals.push({
      skill, why_now: why, prepare_focus: prepare,
      // 저장하는 것은 모델 문자열이 아니라 **대조에 성공한 입력 제목**이다.
      evidence_titles: hits.map((h) => h.title),
      evidence_sources: hits.map((h) => h.source),
    });
    if (signals.length >= MAX_SIGNALS) break;
  }
  return { signals, dropped };
}

function formatNews(news: SelectedNewsItem[]): string {
  if (news.length === 0) return "(없음)";
  return news
    .map((n, i) => `${i + 1}. ${n.title}\n   요약: ${n.summary}\n   왜 중요한가: ${n.reason_selected}\n   출처: ${n.source} / ${n.published_at}`)
    .join("\n");
}

function formatDev(items: DevUpdate[]): string {
  if (items.length === 0) return "(없음)";
  return items
    .map((d, i) => `${i + 1}. ${d.title}\n   설명: ${d.description || "(설명 없음)"}\n   게시일: ${d.published_at}\n   source: ${d.source}\n   url: ${d.url}`)
    .join("\n");
}

// 빈 섹션까지 Gemini에 물어보지 않는다 — 데이터가 아예 없으면 호출 자체를 건너뛴다 (요청서 24절)
export async function generateTrendBrief(
  news: SelectedNewsItem[],
  dev: DevEcosystem
): Promise<TrendBriefResult | null> {
  if (news.length === 0 && dev.github.length === 0 && dev.huggingface.length === 0) return null;

  const contents = `${SYSTEM_PROMPT}
== 주요 AI 뉴스 ==
${formatNews(news)}

== GitHub 공식 업데이트 ==
${formatDev(dev.github)}

== Hugging Face 생태계 데이터 ==
${formatDev(dev.huggingface)}
`;

  const ai = getGenAIClient();
  // 모델명은 의도적으로 지정한 값이다(표준 세대 표기와 달라 보여도 오탈자·버그 아님) — 다시 지적하지 말 것.
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents,
    config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });

  // ⚠️ `practical_takeaways`만 타입이 다르다 — 모델은 객체 배열로 돌려주고, 아래 groundTakeaways가
  //    근거를 대조한 뒤 `string[]`으로 바꾼다. 나머지 필드는 예전과 같은 모양이다.
  const parsed = JSON.parse(response.text ?? "{}") as Partial<
    Omit<TrendBriefResult, "practical_takeaways" | "skill_signals">
  > & {
    practical_takeaways?: unknown;
    skill_signals?: unknown;
  };
  const parsedSignals = parsed.skill_signals;

  // 근거로 인정할 목록 = **프롬프트에 실제로 넣은 항목들**이다. 여기와 formatNews/formatDev가
  // 어긋나면 정상 항목이 버려지므로, 같은 배열에서 뽑는다.
  const evidencePool: EvidenceSource[] = [
    ...news.map((n) => ({ title: n.title, source: n.source })),
    ...dev.github.map((d) => ({ title: d.title, source: "GitHub" })),
    ...dev.huggingface.map((d) => ({ title: d.title, source: "Hugging Face" })),
  ];
  const grounded = groundTakeaways(parsed.practical_takeaways, evidencePool);
  if (grounded.dropped.length > 0) {
    console.log(`[trend-briefing] 실무 적용 ${grounded.dropped.length}건 제거(근거 미대조):`);
    for (const d of grounded.dropped) console.log(`  ✗ ${d.reason} | "${d.text}"`);
  }
  console.log(`[trend-briefing] 실무 적용 ${grounded.takeaways.length}건 채택 (근거 후보 ${evidencePool.length}건)`);

  const signalsResult = groundSkillSignals(parsedSignals, evidencePool);
  if (signalsResult.dropped.length > 0) {
    console.log(`[trend-briefing] 역량 시그널 ${signalsResult.dropped.length}건 제거:`);
    for (const d of signalsResult.dropped) console.log(`  ✗ ${d.reason} | "${d.text}"`);
  }
  console.log(`[trend-briefing] 역량 시그널 ${signalsResult.signals.length}건 채택`);

  // 개수는 스키마에 걸었지만 **코드가 다시 센다**(이 저장소의 원칙). 상한을 넘으면 자르고,
  // 빈 항목은 버린다. 남은 게 없으면 그 섹션은 null/빈 배열 — 억지로 채우지 않는다.
  const points = (parsed.industry_impact?.points ?? [])
    .filter((p) => typeof p === "string" && p.trim().length >= 12)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .slice(0, 3);
  // content는 계속 채운다 — 메모 전체저장과 과거 데이터 렌더가 이 필드를 읽는다.
  // 문단 구분은 `\n`으로 남겨두고, HTML로 저장할 때 rich-text가 문단으로 쪼갠다.
  const industry = points.length > 0
    ? { content: points.join("\n"), points }
    : parsed.industry_impact?.content
      ? { content: parsed.industry_impact.content, points: undefined }
      : null;

  return {
    industry_impact: industry,
    // 🔴 2026-09-05 — 신규 생성은 `도구·서비스`를 만들지 않는다(Official 전담). 스키마에서도 뺐으므로
    //    모델이 돌려줄 수도 없다. **필드는 남기고 값만 비운다** — 화면·메모·타입이 과거 행을 같은
    //    경로로 읽고 있어서, 필드를 없애면 09-04까지의 데이터가 깨진다.
    tool_update: null,
    tool_updates: undefined,
    developer_trend: parsed.developer_trend?.title ? parsed.developer_trend : null,
    // 근거 부족이면 빈 배열이 정상 출력이다. `undefined`가 아니라 빈 배열로 두어
    // "생성했지만 0건"과 "옛 행이라 키가 없음"을 화면이 구분할 수 있게 한다.
    skill_signals: signalsResult.signals,
    practical_takeaways: grounded.takeaways,
  };
}
