// 자체 점검: `node src/lib/jobs/jobkorea.check.ts`로 돌린다(Node 24 type stripping).
// 🔴 기본은 **네트워크 없이 전부 돈다.** 예전엔 파일 맨 위에서 top-level `await searchJobKorea(...)`를
//    호출하고 결과 0건이면 assert로 죽었다 — 잡코리아가 403을 주거나 오프라인이면 그 자리에서
//    프로세스가 끝나 **아래 오프라인 회귀가 단 한 건도 실행되지 않았다.** 파서 회귀 테스트가
//    외부 사이트 상태에 인질로 잡혀 있으면 회귀 테스트가 아니다.
//    라이브 왕복이 필요하면 `JOBKOREA_LIVE=1`을 주고 돌려라(맨 아래).
import assert from "node:assert/strict";
import { searchJobKorea, fetchJobKoreaJobDetail, extractDescriptionSections, parseJobPostingLd, ldDateOnly, ldEmploymentType } from "./jobkorea.ts";

// ────────────────────────────────────────────────────────────────────────────
// 오프라인 파싱 회귀 — 2026-08-30 ㈜나인이즈 공고("주요업무만 들어온다" 신고)
//
// 예전 구현은 <b>/</b>를 같은 마커로 바꿔 split한 뒤 "홀수=라벨, 짝수=본문" 위치 가정으로 읽었다.
// 그런데 여는 정규식이 `/<b>/g`라 **속성이 붙은 <b style="...">를 못 잡아** 마커 개수가 홀수가 되고,
// 짝이 밀려 `자격요건`이 짝수 자리로 떨어져 alias 검사조차 못 받았다.
// 아래 HTML은 그 공고의 태그 시퀀스를 그대로 옮긴 것이다(속성 있는 <b> 3개 + 없는 것 2개).
// 라이브 API가 아니라 문자열이므로 네트워크 없이 항상 돈다.
{
  const html = [
    "<p><b>㈜나인이즈</b></p>",
    "<p><b>AI 연구개발 팀원</b>",
    "회사 소개문입니다. 포지션 및 자격요건 안내를 포함한 긴 문단이라 라벨로 오인되기 쉽다.</p>",
    "<p><b style=\"letter-spacing: 0px;\">담당업무</b><br>",
    "ㆍAI 서비스 및 Agent 개발<br>- LLM 기반 AI Agent 설계 및 개발</p>",
    "<p><b style=\"letter-spacing: 0px;\"><br></b></p>",
    "<p><b style=\"letter-spacing: 0px;\">자격요건</b><br>",
    "ㆍ학력 : 학사이상<br>ㆍ경력 : 3년이상</p>",
    "<p><b>우대사항</b><br>ㆍPython, LangChain 경험자</p>",
  ].join("");

  const got = extractDescriptionSections(html);
  assert.ok(got.responsibilities.includes("AI 서비스 및 Agent 개발"), `주요업무 파싱 실패 — "${got.responsibilities}"`);
  // 🔴 이 두 줄이 이번 버그의 회귀 방지다. 예전 구현에서는 둘 다 빈 문자열이었다.
  assert.ok(got.required_text.includes("학사이상"), `자격요건이 비었다(parity 회귀) — "${got.required_text}"`);
  assert.ok(got.preferred_text.includes("LangChain"), `우대사항이 비었다 — "${got.preferred_text}"`);
  // 회사 소개문(긴 문단)이 라벨로 오인돼 자격요건을 덮으면 안 된다.
  assert.ok(!got.required_text.includes("회사 소개문"), `긴 문단이 라벨로 오인됐다 — "${got.required_text}"`);
  // 빈 라벨 <b><br></b>이 alias에 붙으면 안 된다(a.includes("")가 항상 true인 함정).
  assert.ok(got.preferred_text.length > 0 && !got.preferred_text.startsWith("자격요건"), "빈 라벨이 섹션을 가로챘다");
  console.log("jobkorea 오프라인 파싱 회귀 OK");
}

// ────────────────────────────────────────────────────────────────────────────
// 오프라인 파싱 회귀 — 2026-08-31 라이브 전수조사(잡코리아 상세 40건)
// 실측: 본문 추출 성공 18/40 → 30/40. 남은 10건은 전부 **이미지 공고**(텍스트 0~32자)로 추출 대상이 아니다.
{
  // ① <strong> 라벨 + 라벨 안의 공백("주요 업무"). 넥슨 메이플스토리 AI 엔지니어(Gno 49727184)
  //    실물 구조다 — 고치기 전엔 세 필드가 전부 빈 문자열이었다.
  const strongHtml = [
    "<p><strong>조직 소개</strong></p><p>메이플 R&D실은 …</p>",
    "<p><strong>주요 업무</strong></p><p>AI 모델 서빙 파이프라인 구축</p>",
    "<p><strong>지원 자격</strong></p><p>Python 3년 이상</p>",
    "<p><strong>우대 사항</strong></p><p>LLM 서비스 운영 경험</p>",
    "<p><strong>전형 절차</strong></p><p>서류 - 면접</p>",
  ].join("");
  const got = extractDescriptionSections(strongHtml);
  assert.ok(got.responsibilities.includes("모델 서빙"), `<strong> 주요업무 실패 — "${got.responsibilities}"`);
  assert.ok(got.required_text.includes("Python"), `<strong> 자격요건 실패 — "${got.required_text}"`);
  assert.ok(got.preferred_text.includes("LLM"), `<strong> 우대사항 실패 — "${got.preferred_text}"`);
  assert.ok(!got.preferred_text.includes("서류"), "다음 라벨(전형 절차)에서 끊겨야 한다");

  // ② 본문 중간의 강조 <strong>이 섹션을 끊으면 안 된다 — 라벨 후보를 경계로 쓰기 전에 걸러내는 이유.
  const emphasized = "<p><b>주요업무</b></p><p>모델 배포와 <strong>실시간</strong> 추론 최적화를 담당합니다</p>";
  assert.ok(extractDescriptionSections(emphasized).responsibilities.includes("추론 최적화"),
    "본문 한가운데 강조가 섹션을 안 끊는다");

  // ③ 라벨이 하나도 없어도 본문이 길면 통째로 넣는다(위로보틱스·플라잎 실측 2,000~4,400자).
  //    반대로 셸 페이지(실측 32자)는 넣지 않는다 — 가르는 기준은 라벨 유무가 아니라 길이다.
  assert.ok(extractDescriptionSections(`<p>${"공고 본문 ".repeat(60)}</p>`).responsibilities.length > 0,
    "라벨 없는 긴 본문이 버려졌다");
  assert.equal(extractDescriptionSections('<p>/ 이메일 class="devChargeEmail" --></p>').responsibilities, "",
    "셸 페이지 boilerplate가 본문으로 들어갔다");

  // ④ 라벨은 있는데 업무 alias만 못 맞춘 자연어 공고(카카오 계열, Gno 49755508) —
  //    우대사항만 잡히고 2,770자 본문이 195자로 줄던 회귀.
  const kakao = `<p><strong>합류하면 함께하게 될 업무예요</strong></p><p>${"백엔드 개발 ".repeat(40)}</p>`
    + "<p><strong>이런 분이면 더 좋습니다(우대사항)</strong></p><p>Kubernetes 경험</p>";
  const k = extractDescriptionSections(kakao);
  assert.ok(k.preferred_text.includes("Kubernetes"), "우대사항 실패");
  assert.ok(k.responsibilities.length > 200, `업무 alias를 못 맞춘 공고에서 본문이 유실됐다 — ${k.responsibilities.length}자`);
  console.log("jobkorea <strong>/공백라벨/폴백 회귀 OK");
}

// ────────────────────────────────────────────────────────────────────────────
// 오프라인 파싱 회귀 — 2026-09-01 alias 매칭 / 장식 라벨 / 표기 변이 (14개 실패모드 중 5개)
{
  // ⑤ 역방향 부분일치가 진짜 라벨을 가로채면 안 된다.
  //    예전: `a.includes(flat)`이라 라벨 "업무"가 alias "주요업무"에 붙어 responsibilities에
  //    "시간: 09-18시"가 들어갔고, `if (result[field]) continue`로 **진짜 주요업무가 막혔다.**
  const shortBold = [
    "<p><b>업무</b>시간: 09-18시</p>",
    "<p><b>요건</b>은 아래와 같습니다</p>",
    "<p><b>사항</b>이 있으면 문의</p>",
    "<p><b>주요업무</b></p><p>추천 모델 학습 파이프라인 운영</p>",
    "<p><b>자격요건</b></p><p>Python 5년 이상</p>",
    "<p><b>우대사항</b></p><p>Kubeflow 경험</p>",
  ].join("");
  const s = extractDescriptionSections(shortBold);
  assert.ok(s.responsibilities.includes("모델 학습 파이프라인"), `짧은 라벨 "업무"가 주요업무를 가로챘다 — "${s.responsibilities}"`);
  assert.ok(!s.responsibilities.includes("09-18시"), `근무시간이 주요업무로 들어갔다 — "${s.responsibilities}"`);
  assert.ok(s.required_text.includes("Python 5년"), `짧은 라벨 "요건"이 자격요건을 가로챘다 — "${s.required_text}"`);
  assert.ok(s.preferred_text.includes("Kubeflow"), `짧은 라벨 "사항"이 우대사항을 가로챘다 — "${s.preferred_text}"`);

  // ⑥ alias 계열을 둘 이상 품은 짧은 문장은 라벨이 아니다(23자라 30자 상한으로는 못 거른다).
  const prose = [
    "<p><b>아래 주요업무와 자격요건을 확인하세요</b></p><p>안내 문구입니다</p>",
    "<p><b>주요업무</b></p><p>LLM 서비스 백엔드 개발</p>",
    "<p><b>자격요건</b></p><p>Go 3년 이상</p>",
  ].join("");
  const p = extractDescriptionSections(prose);
  assert.ok(p.responsibilities.includes("LLM 서비스 백엔드"), `문장이 주요업무를 가로챘다 — "${p.responsibilities}"`);
  assert.ok(p.required_text.includes("Go 3년"), `문장이 자격요건을 가로챘다 — "${p.required_text}"`);
  assert.ok(!p.responsibilities.includes("안내 문구"), "문장이 라벨로 인정됐다");

  // ⑦ 라벨 **바깥**의 장식(▶ ■ 번호 · HTML 엔티티)이 라벨을 죽이면 안 된다.
  //    예전엔 startsBlock이 공백/&nbsp;만 걷어서 앞이 "▶"·"■"·"1."로 끝나면 라벨이 통째로 버려졌고,
  //    앞 섹션이 그 내용을 삼켰다.
  const decorated = [
    "<p>▶ <b>주요업무</b></p><p>데이터 파이프라인 구축</p>",
    "<p>■<b>자격요건</b></p><p>SQL 능숙</p>",
    "<table><tr><td>1. <b>우대사항</b></td></tr></table><p>Airflow 경험</p>",
  ].join("");
  const d = extractDescriptionSections(decorated);
  assert.ok(d.responsibilities.includes("데이터 파이프라인"), `▶ 장식 라벨 실패 — "${d.responsibilities}"`);
  assert.ok(!d.responsibilities.includes("SQL"), `자격요건이 주요업무에 삼켜졌다 — "${d.responsibilities}"`);
  assert.ok(d.required_text.includes("SQL"), `■ 장식 라벨 실패 — "${d.required_text}"`);
  assert.ok(d.preferred_text.includes("Airflow"), `번호 매김(1.) 라벨 실패 — "${d.preferred_text}"`);
  const entity = "<p>&#160;&emsp;<b>주요업무</b></p><p>모델 서빙 운영</p>";
  assert.ok(extractDescriptionSections(entity).responsibilities.includes("모델 서빙"), "HTML 엔티티 장식 라벨 실패");

  // ⑧ 표기 변이 alias(자격조건/필요역량/지원조건/우대조건/하는 일/업무 소개/주요 역할 …).
  //    공백은 양쪽 다 지우고 비교하므로 "하는 일"/"하는일" 둘 다 잡힌다.
  const variants = [
    "<p><b>하는 일</b></p><p>사내 LLM 플랫폼 운영</p>",
    "<p><b>자격조건</b></p><p>TypeScript 경험</p>",
    "<p><b>우대조건</b></p><p>AWS 자격증</p>",
  ].join("");
  const v = extractDescriptionSections(variants);
  assert.ok(v.responsibilities.includes("LLM 플랫폼"), `"하는 일" alias 실패 — "${v.responsibilities}"`);
  assert.ok(v.required_text.includes("TypeScript"), `"자격조건" alias 실패 — "${v.required_text}"`);
  assert.ok(v.preferred_text.includes("AWS"), `"우대조건" alias 실패 — "${v.preferred_text}"`);
  const variants2 = [
    "<p><b>업무 소개</b></p><p>추천 시스템 고도화</p>",
    "<p><b>필요역량</b></p><p>Spark 경험</p>",
    "<p><b>이런 경험이 있으면 좋아요</b></p><p>MLOps 구축 경험</p>",
  ].join("");
  const v2 = extractDescriptionSections(variants2);
  assert.ok(v2.responsibilities.includes("추천 시스템"), `"업무 소개" alias 실패 — "${v2.responsibilities}"`);
  assert.ok(v2.required_text.includes("Spark"), `"필요역량" alias 실패 — "${v2.required_text}"`);
  assert.ok(v2.preferred_text.includes("MLOps"), `"이런 경험이 있으면 좋아요" alias 실패 — "${v2.preferred_text}"`);
  console.log("jobkorea alias/장식라벨/표기변이 회귀 OK");
}

// ────────────────────────────────────────────────────────────────────────────
// 오프라인 파싱 회귀 — 2026-09-01 "다음 공고도 들어오나" 3종(비-b/strong 라벨 · 평문 라벨 · 종결 라벨)
{
  // ⑨ 라벨이 <b>/<strong>이 아닌 공고. 고치기 전엔 라벨 0개 → 통짜 폴백이라
  //    자격요건·우대사항이 빈 채로 저장되고 **전부 responsibilities 한 칸**에 들어갔다.
  const otherTags = [
    '<h3>주요업무</h3><p>추천 시스템 서빙 API 개발</p>',
    '<p class="tit">자격요건</p><p>Python 3년 이상</p>',
    '<p><span style="font-weight:700;color:#333">우대사항</span></p><p>Kafka 운영 경험</p>',
  ].join("");
  const o = extractDescriptionSections(otherTags);
  assert.ok(o.responsibilities.includes("서빙 API"), `<h3> 라벨 실패 — "${o.responsibilities}"`);
  assert.ok(!o.responsibilities.includes("Python"), `자격요건이 주요업무에 삼켜졌다 — "${o.responsibilities}"`);
  assert.ok(o.required_text.includes("Python 3년"), `<p class="tit"> 라벨 실패 — "${o.required_text}"`);
  assert.ok(o.preferred_text.includes("Kafka"), `<span style="font-weight:700"> 라벨 실패 — "${o.preferred_text}"`);

  // <font> + 굵지 않은 span은 라벨이 아니다(색만 준 강조가 섹션을 끊으면 안 된다).
  const fontHtml = '<p><font size="4">담당업무</font></p><p>LLM 파인튜닝과 <span style="color:#f00">평가</span> 자동화</p>';
  const f = extractDescriptionSections(fontHtml);
  assert.ok(f.responsibilities.includes("파인튜닝"), `<font> 라벨 실패 — "${f.responsibilities}"`);
  assert.ok(f.responsibilities.includes("자동화"), `굵지 않은 span이 섹션을 끊었다 — "${f.responsibilities}"`);

  // ⑩ 태그가 아예 없는 평문 라벨(잡코리아 에디터에서 그냥 줄바꿈으로 적은 공고).
  const plain = [
    "<p>백엔드 엔지니어를 모십니다.<br><br>",
    "주요업무<br>- 결제 서비스 API 개발<br>- 트래픽 대응<br><br>",
    "자격요건<br>- Java/Kotlin 3년 이상<br><br>",
    "우대사항<br>- MSA 전환 경험<br><br>",
    "전형절차<br>서류 - 1차 면접 - 2차 면접<br>",
    "복리후생<br>중식 제공, 자기계발비</p>",
  ].join("");
  const pl = extractDescriptionSections(plain);
  assert.ok(pl.responsibilities.includes("결제 서비스 API"), `평문 라벨 주요업무 실패 — "${pl.responsibilities}"`);
  assert.ok(!pl.responsibilities.includes("Kotlin"), `평문 자격요건이 주요업무에 삼켜졌다 — "${pl.responsibilities}"`);
  assert.ok(pl.required_text.includes("Kotlin"), `평문 라벨 자격요건 실패 — "${pl.required_text}"`);
  assert.ok(pl.preferred_text.includes("MSA"), `평문 라벨 우대사항 실패 — "${pl.preferred_text}"`);
  // ⑪ 종결 라벨(전형절차/복리후생)은 경계로만 쓰이고 필드를 채우지도, 필드에 섞이지도 않는다.
  assert.ok(!pl.preferred_text.includes("서류"), `전형절차가 우대사항에 섞였다 — "${pl.preferred_text}"`);
  assert.ok(!pl.preferred_text.includes("중식"), `복리후생이 우대사항에 섞였다 — "${pl.preferred_text}"`);

  // 태그 기반이 통한 공고에서는 평문 패스가 돌지 않는다(태그 경계를 평문 추측이 덮으면 안 된다).
  const tagged = "<p><b>주요업무</b></p><p>모델 서빙</p><p><b>자격요건</b></p><p>주요업무 경험 3년</p>";
  const tg = extractDescriptionSections(tagged);
  assert.equal(tg.responsibilities, "모델 서빙", `평문 패스가 태그 결과를 덮었다 — "${tg.responsibilities}"`);
  assert.ok(tg.required_text.includes("경험 3년"), `자격요건 실패 — "${tg.required_text}"`);

  // ⑫ 태그 라벨 공고에서도 **평문**으로 적힌 꼬리는 마지막 섹션이 삼키면 안 된다.
  const tail = [
    "<p><b>주요업무</b></p><p>서비스 백엔드 개발</p>",
    "<p><b>우대사항</b></p><p>Docker 경험<br><br>접수방법<br>홈페이지 지원<br><br>유의사항<br>허위사실 기재 시 취소</p>",
  ].join("");
  const t = extractDescriptionSections(tail);
  assert.ok(t.preferred_text.includes("Docker"), `우대사항 실패 — "${t.preferred_text}"`);
  assert.ok(!t.preferred_text.includes("홈페이지 지원"), `접수방법이 우대사항에 섞였다 — "${t.preferred_text}"`);
  assert.ok(!t.preferred_text.includes("허위사실"), `유의사항이 우대사항에 섞였다 — "${t.preferred_text}"`);
  // 본문 한 줄에 들어간 "복리후생: …"은 라벨이 아니라 내용이다 — 여기서 자르면 안 된다.
  const inline = "<p><b>우대사항</b></p><p>원격근무 가능<br>복리후생: 4대보험, 중식제공<br>영어 커뮤니케이션</p>";
  assert.ok(extractDescriptionSections(inline).preferred_text.includes("영어 커뮤니케이션"),
    "본문 중 '복리후생: …' 한 줄에서 섹션이 잘렸다");
  // ⑬ 🔴 2026-09-02 — **소스 개행은 줄바꿈이 아니다.** 워드에서 붙여넣은 공고(현대에이치티
  //    Gno 49883950 실측)는 한 문장 안에 소스 줄바꿈이 있고, 항목 경계는 `</div><div>`라 개행이 없다.
  //    옛 stripTags는 정확히 반대로 읽어 "홈"이 자기 혼자 불릿이 되고 두 항목이 한 줄로 붙었다.
  const wordWrap =
    "<p><b>우대사항</b></p>" +
    '<div><span>*</span><span>홈\r\n네트워크에 대한 이해 또는 개발 경험</span></div>' +
    '<div><span>*</span><span>Multi-Agent\r\n아키텍쳐 설계 경험</span></div>';
  const ww = extractDescriptionSections(wordWrap).preferred_text.split("\n").filter(Boolean);
  assert.equal(ww.length, 2, `항목 경계(</div><div>)를 못 살렸다 — ${JSON.stringify(ww)}`);
  assert.ok(ww[0].includes("홈 네트워크에 대한 이해"), `문장 중간 소스 개행에서 잘렸다 — ${JSON.stringify(ww)}`);
  assert.ok(ww[1].includes("Multi-Agent 아키텍쳐 설계"), `두 번째 항목이 깨졌다 — ${JSON.stringify(ww)}`);

  console.log("jobkorea 비-b라벨/평문라벨/종결라벨 회귀 OK");
}

// ────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
// ld+json JobPosting — 메타데이터 정본(2026-09-01 라이브 81건 전수조사에서 81/81 존재)
// posted_at은 이게 생기기 전까지 **항상 null**이었다. 회귀가 나면 그 상태로 조용히 돌아간다.
{
  const ld = (body: string) => `<html><head>` +
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>` +
    `<script type="application/ld+json">${body}</script></head><body></body></html>`;

  // ① 정상 — 여러 ld+json 블록 중 JobPosting만 고른다.
  const ok = parseJobPostingLd(ld(JSON.stringify({
    "@context": "https://schema.org", "@type": "JobPosting",
    title: "AI 엔지니어", datePosted: "2026-08-28", validThrough: "2026-09-30T23:59:59+09:00",
    employmentType: "정규직", hiringOrganization: { "@type": "Organization", name: "㈜테스트" },
    description: "㈜테스트에서 정규직 경력 채용을 진행합니다. 근무지는 서울입니다.",
  })));
  assert.ok(ok, "JobPosting 블록을 못 찾았다");
  assert.equal(ldDateOnly(ok?.datePosted), "2026-08-28");
  assert.equal(ldDateOnly(ok?.validThrough), "2026-09-30", "타임존 붙은 validThrough를 날짜로 못 줄였다");
  assert.equal(ldEmploymentType(ok?.employmentType), "정규직");
  assert.equal(typeof ok?.hiringOrganization === "object" ? ok?.hiringOrganization?.name : null, "㈜테스트");

  // @graph 안에 들어 있는 형태도 같이 본다.
  const graph = parseJobPostingLd(ld(JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "WebSite" }, { "@type": "JobPosting", datePosted: "2026-08-01" }],
  })));
  assert.equal(ldDateOnly(graph?.datePosted), "2026-08-01", "@graph 안 JobPosting을 못 찾았다");

  // ② 부재 — ld+json이 아예 없으면 null(호출부가 기존 meta 파싱으로 폴백한다).
  assert.equal(parseJobPostingLd("<html><head><title>x</title></head></html>"), null);

  // ③ 깨진 JSON — 던지지 않고 null. 그리고 **깨진 블록 하나가 뒤 블록을 막지 않아야** 한다.
  assert.equal(parseJobPostingLd(ld("{ this is not json ")), null, "깨진 JSON에서 null이 아니다");
  const html2 = `<script type="application/ld+json">{ broken </script>` +
    `<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-07-07"}</script>`;
  assert.equal(ldDateOnly(parseJobPostingLd(html2)?.datePosted), "2026-07-07", "깨진 블록이 뒤 블록을 막았다");

  // ④ 날짜가 아닌 값은 폴백에 넘긴다(빈 문자열/상시채용 표기).
  assert.equal(ldDateOnly(undefined), null);
  assert.equal(ldDateOnly("상시채용"), null);

  // ⑤ 🔴 schema.org enum은 채택하지 않는다 — training hard filter가 한글만 본다
  //    (filter.ts TRAINING_EMPLOYMENT_TERMS: 연수생/교육생/훈련생/수강생). enum으로 덮으면 무력해진다.
  assert.equal(ldEmploymentType("FULL_TIME"), null, "enum을 고용형태로 채택했다");
  assert.equal(ldEmploymentType(["FULL_TIME", "INTERN"]), null);
  assert.equal(ldEmploymentType("인턴"), "인턴");
  assert.equal(ldEmploymentType(undefined), null);
  console.log("jobkorea ld+json 파싱 OK");
}

// 라이브 왕복 — 기본은 **건너뛴다**. `JOBKOREA_LIVE=1 node src/lib/jobs/jobkorea.check.ts`로만 돈다.
// 검색이 실제 GI_Read URL을 반환하는지, 상세 파싱이 최소 필드를 채우는지, 마감 판정이 "마감"
// substring이 아니라 실제 메타 마감일 값으로 되는지 확인한다(6-3절 P0).
if (process.env.JOBKOREA_LIVE === "1") {
  const results = await searchJobKorea("AI Agent Engineer LLM RAG", 5);
  assert.ok(results.length > 0, "검색 결과가 0건이면 stext 검색 구조가 깨진 것");
  for (const r of results) {
    assert.match(r.url, /^https:\/\/www\.jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+$/, `URL 형식 이상 - ${r.url}`);
  }

  const detail = await fetchJobKoreaJobDetail(results[0].url);
  assert.ok(detail, `상세 파싱 실패 - ${results[0].url}`);
  if (detail) {
    assert.ok(detail.company.length > 0, "company 비어있음");
    assert.ok(detail.title.length > 0, "title 비어있음");
    // "마감일은 기업의 사정으로..." 같은 안내문 때문에 정상 공고가 마감으로 오판되지 않아야 한다.
    assert.notEqual(detail.is_job_posting, false);

    // 고용형태에 HTML 태그 조각이 leak되면 안 된다(2026-08-13 domTextAfterLabel 버그 회귀 방지 — 실제
    // "/span>" 같은 조각이 값에 섞였던 적이 있다).
    if (detail.employment_type) assert.doesNotMatch(detail.employment_type, /[<>]/, `employment_type에 태그 조각 leak - "${detail.employment_type}"`);

    // 본문 필드에 메인 페이지의 "AI추천공고" 사이드바/추천목록 텍스트가 섞이면 안 된다(TASK6 P0) —
    // 본문은 GI_Read_Comt_Ifrm iframe 응답에서만 오고, 그 iframe에는 이 마커들이 아예 없다(실제 조회로 확인).
    const bodyText = `${detail.responsibilities} ${detail.required_text} ${detail.preferred_text}`;
    for (const leakMarker of ["AI추천공고", "이상 찜한 기업", "기업정보 더보기"]) {
      assert.ok(!bodyText.includes(leakMarker), `본문에 parent page 텍스트 leak 의심 - "${leakMarker}"`);
    }
  }
  console.log("jobkorea 라이브 왕복 OK");
} else {
  void searchJobKorea; void fetchJobKoreaJobDetail; // 라이브 블록에서만 쓴다(JOBKOREA_LIVE=1)
  console.log("jobkorea 라이브 왕복 skip (JOBKOREA_LIVE=1로 켠다)");
}

console.log("jobkorea.check.ts OK");
