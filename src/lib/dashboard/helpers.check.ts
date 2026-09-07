// 자체 점검: `npx tsx src/lib/dashboard/helpers.check.ts`
// (node type stripping이 아니라 tsx다 — helpers.ts가 `@/` alias와 lucide-react를 import한다.)
//
// 지키는 것: parseJobTextSections의 **선행 불릿 정규화**.
// 이 자리는 표기 변이 누락으로 두 번 신고가 왔다 — 2026-09-01 `·`(잡코리아),
// 2026-09-04 `．`U+FF0E(점핏). 세 번째가 오지 않게 실측 근거를 테스트로 굳힌다.
import assert from "node:assert/strict";
import { parseJobTextSections } from "@/lib/dashboard/helpers";

// 🔴 케이스 수는 세지 말고 세어지게 한다(지뢰표 "목록·개수는 손으로 세지 말 것") —
//    예전엔 마지막 줄이 숫자를 하드코딩해서 케이스를 추가해도 옛 숫자를 계속 출력했다.
let cases = 0;
const one = (line: string) => { cases++; return parseJobTextSections(line)[0]?.bullets[0] ?? ""; };

// ① 2026-09-04 신고 원문 그대로 — 점핏 (주)연호엔지니어링 공고의 실제 저장값
assert.equal(one("．AI 투자운영 플랫폼 아키텍처 설계"), "AI 투자운영 플랫폼 아키텍처 설계",
  "U+FF0E(．) 선행 불릿이 벗겨져야 한다 — 안 벗기면 CSS의 •와 겹쳐 화면에 두 개로 보인다");
assert.equal(one("．OpenAI / Claude 등 LLM API 연동"), "OpenAI / Claude 등 LLM API 연동",
  "． 뒤에 영문·슬래시가 와도 마찬가지다");
assert.equal(one("。전각 마침표 변형"), "전각 마침표 변형", "U+3002(。)도 같은 부류다");
assert.equal(one("｡반각 마침표 변형"), "반각 마침표 변형", "U+FF61(｡)도 같은 부류다");
assert.equal(one("．． 중복 불릿"), "중복 불릿", "같은 문자가 반복돼도 전부 벗긴다");

// ② 💀 ASCII `.` — 공백이 뒤따르는 `. ` 형태만 벗긴다.
//    실측(전체 241공고 5,466줄): 선행 ASCII `.` 18건 전부 `. Python`류 불릿이었다.
assert.equal(one(". Python"), "Python", "`. `(마침표+공백) 형태는 실제로 불릿이다");
assert.equal(one(". Hugging Face"), "Hugging Face", "공백 여러 개여도 같다");

// ③ 🔴 여기가 이 테스트의 핵심 — `.NET`류를 깨뜨리면 안 된다.
//    ASCII `.`을 문자 클래스에 넣는 순간 아래가 전부 깨진다. 넣지 마라.
assert.equal(one(".NET 개발 경험"), ".NET 개발 경험", "💀 .NET의 선행 마침표는 내용이다 — 벗기면 NET이 된다");
assert.equal(one(".NET Core / C# 경험자"), ".NET Core / C# 경험자", "💀 같은 이유");
assert.equal(one(".env 파일 관리 경험"), ".env 파일 관리 경험", "💀 .env도 마찬가지다");
assert.equal(one(".gitignore 작성 경험"), ".gitignore 작성 경험", "💀 dotfile 이름 전반");

// ②-2 💀 ASCII `?` — 2026-09-07 신고("잡코리아 공고 앞에 ?가 보인다").
//     원문 근거: 잡코리아 Gno 49888581(㈜시옷) 응답이 `charset=utf-8`이고 주변 한글은 정상인데
//     불릿 자리 바이트가 `3f 20`이다. 우리 파싱이 만든 게 아니라 잡코리아가 그렇게 준다.
//     아래 세 줄은 그 공고의 **실제 저장값 그대로**다(responsibilities / required_text / preferred_text).
assert.equal(one("? AI/ML 모델 연구 및 개발"), "AI/ML 모델 연구 및 개발",
  "`? `(물음표+공백) 선행 불릿이 벗겨져야 한다 — 안 벗기면 CSS의 •와 겹쳐 `• ? 항목`으로 보인다");
assert.equal(one("? 신입/경력 무관"), "신입/경력 무관", "자격요건 쪽 같은 형태");
assert.equal(one("? 데이터사이언스, 수학, 통계학, 물리학 등 관련 전공자"),
  "데이터사이언스, 수학, 통계학, 물리학 등 관련 전공자", "우대사항 쪽 같은 형태");
assert.equal(one("? LLM / AI Agent 기술 개발"), "LLM / AI Agent 기술 개발", "뒤에 영문·슬래시가 와도 마찬가지다");

// ②-3 🔴 여기가 이 분기의 핵심 — 문장 안/끝의 물음표는 **내용이다.**
//     ASCII `?`를 문자 클래스에 넣는 순간 아래가 깨진다. 넣지 마라.
assert.equal(one("\"이렇게 하면 어떨까요?\"로 대화하는 분"), "\"이렇게 하면 어떨까요?\"로 대화하는 분",
  "💀 문장 안 물음표는 내용이다 (실제 저장값 — 원티드 랩씨드 공고)");
assert.equal(one("왜 이 기술을 쓰는지 설명할 수 있나요?"), "왜 이 기술을 쓰는지 설명할 수 있나요?",
  "💀 문장 끝 물음표도 그대로 둔다");
assert.equal(one("?? 물음표 두 개"), "?? 물음표 두 개", "💀 `? `(하나+공백) 형태가 아니면 손대지 않는다");

// ④ 기존 동작 회귀 — 2026-09-01에 넓힌 것들이 그대로 살아 있어야 한다
for (const [line, want] of [
  ["•주요업무 항목", "주요업무 항목"],
  ["·중점 항목", "중점 항목"],
  ["ㆍ자격요건 항목", "자격요건 항목"],
  ["∙우대사항", "우대사항"],
  ["▶장식 불릿", "장식 불릿"],
  ["※참고 항목", "참고 항목"],
  ["- 하이픈 불릿", "하이픈 불릿"],
  ["* 별표 불릿", "별표 불릿"],
  ["1. 번호 항목", "번호 항목"],
  ["2) 괄호 번호", "괄호 번호"],
] as const) {
  assert.equal(one(line), want, `기존 불릿 처리 회귀: ${JSON.stringify(line)}`);
}

// ⑤ ⚠️ 앞쪽(^)만 벗긴다 — 본문 중간의 마침표·가운뎃점은 내용이다
assert.equal(one("Python 3.12 기반 개발"), "Python 3.12 기반 개발", "문장 중간의 마침표는 건드리지 않는다");
assert.equal(one("설계·개발·운영 경험"), "설계·개발·운영 경험", "중간의 · 는 내용이다");
assert.equal(one("담당 업무. 상세 내용"), "담당 업무. 상세 내용", "중간의 `. `도 건드리지 않는다");
assert.equal(one("버전 1.0 출시 경험"), "버전 1.0 출시 경험", "숫자 사이 마침표 보존");

// ⑥ 구획([소제목]) 파싱과 다중 라인이 그대로 동작해야 한다
const groups = parseJobTextSections("[LLM 애플리케이션 구축]\n．설계\n．구현\n[운영]\n. 모니터링");
assert.equal(groups.length, 2, "대괄호 소제목으로 두 구획이어야 한다");
assert.deepEqual(groups[0], { heading: "LLM 애플리케이션 구축", bullets: ["설계", "구현"] });
assert.deepEqual(groups[1], { heading: "운영", bullets: ["모니터링"] });

// ⑦ 빈 줄/공백만 있는 줄은 버려진다(기존 동작)
assert.deepEqual(parseJobTextSections("\n  \n．항목\n\n"), [{ heading: null, bullets: ["항목"] }]);

console.log(`helpers.check.ts OK — 선행 불릿 정규화 ${cases}케이스 (．。｡ ? 제거 / .NET류·물음표 보존)`);
