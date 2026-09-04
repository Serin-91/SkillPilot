// 운영 검증 — 그날 실제 batch를 DB에서 읽어 STEP I(신입·주니어 1칸 Soft Reserve)를 판정한다.
//
//   npx tsx --env-file=.env.local src/lib/jobs/verify-batch.ts            # 오늘(KST)
//   npx tsx --env-file=.env.local src/lib/jobs/verify-batch.ts 2026-09-05 # 날짜 지정
//   npx tsx --env-file=.env.local src/lib/jobs/verify-batch.ts 2026-09-05 --probe
//
// 🔴 **1차 기준은 DB다.** `daily_jobs_run.selected_urls` + `saved_job`이 사용자에게 실제로
//    저장된 최종 결과이기 때문이다. `[jobs] soft-reserve` 콘솔 로그는 **선택적 보조 증거**이고,
//    Vercel 무료 플랜은 로그 보존이 짧고 이 저장소는 로그 조회 권한이 없다(별건 — 32-8).
//    **로그를 못 읽는다는 이유로 운영 검증을 미완료로 남기지 마라.**
//
// ⚠️ 읽기 전용이다. DB에 쓰지 않는다. `--probe`를 줄 때만 채용 사이트에 GET을 보낸다
//    (판정 ⑦ — entry/junior가 0건일 때 "그날 재추천 후보가 실제로 살아 있었나"를 확인).
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviousJobRow } from "./generate.ts";
import { getDailyRoleQuota, reconcilePriority, validateInterestedJobRoles, isJobRole, DAILY_JOB_LIMIT } from "./roles.ts";
import type { JobRole } from "./roles.ts";
import { classifyCareerTier, isEntryFriendly } from "./career.ts";
import type { CareerTier } from "./career.ts";
import { identityKey, isNewBadge } from "./new-badge.ts";
import { todayKSTDateString } from "@/lib/news/kst";
import { fetchWantedJobDetail } from "./wanted.ts";
import { fetchJumpitJobDetail } from "./jumpit.ts";
import { fetchJobKoreaJobDetail } from "./jobkorea.ts";

// 계정 목록은 인계 32-5에 있다. 기본은 사용자 본인(세린).
const USER_ID = process.env.VERIFY_USER_ID ?? "4eaf9cd5-a732-4aa8-b516-6a178d9e7025";

// STEP I(`0608b25`)를 푸시한 날. 그날 크론(10:20 KST)은 **이미 돈 뒤**에 푸시했으므로
// STEP I가 적용되는 첫 batch는 2026-09-05다. 이보다 이른 날짜에 ⑦이 "결함"이라고 말하면
// 거짓 경보다 — 그때는 STEP I가 배포돼 있지 않았다.
const STEP_I_FIRST_DATE = "2026-09-05";

main().catch((e) => { console.error(e); process.exit(1); });

async function main() {
const args = process.argv.slice(2);
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? todayKSTDateString();
const probe = args.includes("--probe");
const supabase = createAdminClient();

const nowKST = new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
console.log(`대상 ${date} / user ${USER_ID.slice(0, 8)} / 지금 ${nowKST} KST`);

const { data: prof } = await supabase
  .from("profiles").select("interested_job_roles, job_role_priority").eq("user_id", USER_ID).maybeSingle();
const roles = reconcilePriority(validateInterestedJobRoles(prof!.interested_job_roles)!, prof!.job_role_priority);
const quota = getDailyRoleQuota(roles, date);

// ── 판정 ① batch가 정상 생성됐나 ──────────────────────────────────────────────
const { data: run } = await supabase
  .from("daily_jobs_run").select("job_date, status, job_count, generated_at, selected_urls, role_snapshot")
  .eq("user_id", USER_ID).eq("job_date", date).maybeSingle();

console.log(`\n════ ① batch 생성 ════`);
if (!run) {
  console.log(`❌ ${date} 행이 없다. 크론이 아직 안 돌았거나 실패했다.`);
  console.log(`   (크론 예정 KST 10:10. 지금이 그 전이면 정상 — 크론이 돈 뒤에 다시 돌려라.)`);
  process.exit(2);
}
const urls: string[] = run.selected_urls ?? [];
console.log(`상태 ${run.status} / job_count ${run.job_count} / selected_urls ${urls.length}건`);
console.log(`generated_at ${run.generated_at ?? "null"}`);
console.log(run.status === "success" && urls.length === DAILY_JOB_LIMIT
  ? `✅ 정상 생성 (${DAILY_JOB_LIMIT}건)`
  : `⚠️ 목표 미달 또는 비정상 — status=${run.status}, ${urls.length}/${DAILY_JOB_LIMIT}건`);

// ── 판정 ②③④ 최종 4건 / tier / NEW·재추천 ────────────────────────────────────
const { data: savedRaw } = await supabase
  .from("saved_job")
  .select("url, job_date, first_recommended_date, deadline, matched_role, company, title, role, source_site, responsibilities, required_text, preferred_text, career_requirement, posted_at, date_confidence")
  .eq("user_id", USER_ID);
const saved = new Map<string, PreviousJobRow>(((savedRaw ?? []) as PreviousJobRow[]).map((r) => [r.url, r]));

// classifyCareerTier는 4필드만 본다 — preferred_text/responsibilities는 **의도적으로** 안 본다
// ("3년 우대" 한 줄로 경력직 단정 금지, career.ts 주석). 여기서 더 넘기지 마라.
const tierOf = (r: PreviousJobRow): CareerTier => classifyCareerTier({
  career_requirement: r.career_requirement, required_text: r.required_text ?? "",
  title: r.title, role: r.role ?? "",
});

type Item = { url: string; row: PreviousJobRow | null; tier: CareerTier | null; isNew: boolean | null };
const items: Item[] = urls.map((url) => {
  const row = saved.get(url) ?? null;
  if (!row) return { url, row: null, tier: null, isNew: null };
  // 사용자 지정 기준: first_recommended_date == job_date 면 NEW, 아니면 재추천.
  return { url, row, tier: tierOf(row), isNew: row.first_recommended_date === row.job_date };
});

console.log(`\n════ ②③④ 최종 ${items.length}건 ════`);
for (const it of items) {
  if (!it.row) { console.log(`  ⚠️ saved_job에 row 없음 — ${it.url}`); continue; }
  const badge = it.isNew ? "NEW" : "재추천";
  const uiBadge = isNewBadge(it.row.first_recommended_date, date); // 화면 배지가 쓰는 판정
  const agree = uiBadge === it.isNew ? "" : ` ⚠️ isNewBadge와 불일치(${uiBadge})`;
  console.log(`  [${(it.tier ?? "?").padEnd(11)}] ${badge.padEnd(3)}${agree}  ${it.row.matched_role}`);
  console.log(`      first_recommended ${it.row.first_recommended_date ?? "null"} / job_date ${it.row.job_date} / 마감 ${it.row.deadline ?? "없음"}`);
  console.log(`      ${it.row.company} — ${it.row.title.slice(0, 46)}`);
}

const ej = items.filter((i) => i.tier && isEntryFriendly(i.tier));
const ejNew = ej.filter((i) => i.isNew);
const ejReco = ej.filter((i) => i.isNew === false);
const tally = items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.tier ?? "행없음"]: (a[i.tier ?? "행없음"] ?? 0) + 1 }), {});
console.log(`\ntier 분포: ${JSON.stringify(tally)}`);
console.log(`신입·주니어 ${ej.length}건 (NEW ${ejNew.length} / 재추천 ${ejReco.length})`);

// role quota 확인 — STEP I는 같은 role 안에서만 교체하므로 분포가 quota와 어긋나면 안 된다.
const actualRoles = items.reduce<Record<string, number>>((a, i) => {
  const r = i.row?.matched_role;
  return r && isJobRole(r) ? { ...a, [r]: (a[r] ?? 0) + 1 } : a;
}, {});
const quotaMatch = roles.every((r) => (actualRoles[r] ?? 0) === (quota[r] ?? 0));
console.log(`\nrole 분포: 실제 ${JSON.stringify(actualRoles)} / quota ${JSON.stringify(quota)} → ${quotaMatch ? "✅ 일치" : "⚠️ 불일치(backfill로 정당할 수 있다 — 아래 참고)"}`);
// 동일 identity 중복
const idKeys = items.filter((i) => i.row).map((i) => identityKey(i.row!));
console.log(`같은 batch 내 회사+공고명 중복: ${idKeys.length - new Set(idKeys).size}건 ${idKeys.length === new Set(idKeys).size ? "✅" : "❌"}`);

// ── 판정 ⑤⑥⑦ ────────────────────────────────────────────────────────────────
console.log(`\n════ ⑤⑥⑦ STEP I 판정 ════`);
if (ejNew.length >= 1) {
  console.log(`✅ ⑤ STEP I 미발동이 정상 — 신입·주니어가 이미 NEW로 ${ejNew.length}건 있다.`);
  console.log(`   (Soft Reserve는 entry+junior == 0일 때만 돈다. 여기서 발동했다면 그게 버그다.)`);
  if (ejReco.length > 0) console.log(`   참고: 재추천 신입·주니어도 ${ejReco.length}건 섞여 있다(STEP F 경로일 수 있다).`);
  process.exit(0);
}
if (ejNew.length === 0 && ejReco.length >= 1) {
  const newCount = items.filter((i) => i.isNew).length;
  const totalReco = items.filter((i) => i.isNew === false).length;
  const shapeOk = ejReco.length === 1 && newCount === DAILY_JOB_LIMIT - 1 && quotaMatch && ejReco.every((i) => !i.isNew);
  console.log(`✅ ⑥ 목표 달성 — NEW 신입·주니어 0건인데 과거 신입·주니어가 재추천으로 ${ejReco.length}건 들어왔다.`);
  for (const i of ejReco) console.log(`   IN [${i.tier}] ${i.row!.company} — ${i.row!.title.slice(0, 40)} (처음 추천 ${i.row!.first_recommended_date})`);
  console.log(`\n   기대 형태 대조:`);
  console.log(`     과거 first_recommended_date를 가진 entry/junior 1건 : ${ejReco.length === 1 ? "✅" : `⚠️ ${ejReco.length}건`}`);
  console.log(`     나머지 신규 공고 3건                              : ${newCount === DAILY_JOB_LIMIT - 1 ? "✅" : `⚠️ ${newCount}건`}`);
  console.log(`     role quota 이동 0                                : ${quotaMatch ? "✅" : "⚠️ 불일치"}`);
  console.log(`     재추천 공고 NEW=false                            : ${ejReco.every((i) => !i.isNew) ? "✅" : "❌"}`);
  console.log(`\n   ${shapeOk ? "🎯 기대 형태와 완전히 일치한다." : "⚠️ 형태가 조금 다르다. 위 항목을 보고 원인을 가려라."}`);

  // 🔴 정직하게 남길 것 — 이 형태는 **STEP I와 STEP F가 구분되지 않는다.**
  if (date < STEP_I_FIRST_DATE) {
    console.log(`\n   ⚠️⚠️ ${date}는 STEP I 배포(${STEP_I_FIRST_DATE} 첫 적용) **이전**이다.`);
    console.log(`        따라서 이 재추천은 **STEP F가 넣은 것**이고 STEP I의 증거가 아니다.`);
  } else if (totalReco >= 2) {
    console.log(`\n   ⚠️ 재추천이 총 ${totalReco}건이다. STEP I는 **정확히 1건만** 교체하므로,`);
    console.log(`      2건 이상이면 신규가 4칸을 못 채워 **STEP F가 돈 날**이다(STEP I는 그때 조기 반환한다).`);
    console.log(`      즉 목표는 달성됐지만 STEP I 자체의 증거는 아니다.`);
  } else {
    console.log(`\n   ℹ️ 경로 구분에 관한 한계: 재추천 1건 + 신규 3건은 **STEP I와 STEP F가 같은 모양**이다`);
    console.log(`      (STEP F도 D/E가 3건만 채운 날 4번째 칸을 과거 공고로 메운다). DB만으로는 못 가른다.`);
    console.log(`      가르고 싶으면 보조 증거를 봐라 — 배포 로그의 \`[jobs] soft-reserve\` 줄이 있으면 STEP I다.`);
    console.log(`      🔴 다만 **사용자 목표(4건에 신입·주니어가 섞여 나오는가)는 어느 경로든 달성**이다.`);
    console.log(`      로그를 못 읽는다는 이유로 이 판정을 미완료로 남기지 마라.`);
  }
  process.exit(0);
}

// entry/junior 0건 — 왜 발동 안 했나
const preStepI = date < STEP_I_FIRST_DATE;
console.log(`❌ ⑦ 최종 ${items.length}건에 신입·주니어가 0건이다. STEP I 미발동 원인을 조사한다.`);
if (preStepI) {
  console.log(`\n   ⚠️⚠️ ${date}는 STEP I 배포(${STEP_I_FIRST_DATE} 첫 적용) **이전**이다.`);
  console.log(`        이 날의 미발동은 정상이고, 아래 조사 결과를 "결함"으로 읽으면 거짓 경보다.`);
  console.log(`        여기서는 "STEP I가 있었다면 무엇이 들어왔을까"의 참고 자료로만 봐라.`);
}
const batchUrls = new Set(urls);
const batchIdentities = new Set(idKeys);
const expRolesInBatch = new Set(items.filter((i) => i.tier === "experienced" && i.row && isJobRole(i.row.matched_role)).map((i) => i.row!.matched_role as JobRole));
console.log(`\n   교체 가능한 role(batch에 experienced가 있는 role): ${[...expRolesInBatch].join(", ") || "없음 ← 이것만으로도 미발동이 정상이다"}`);

// applyEntrySoftReserve와 같은 필터를 그대로 재현한다.
const pool = ((savedRaw ?? []) as PreviousJobRow[])
  .filter((r) => isJobRole(r.matched_role) && expRolesInBatch.has(r.matched_role as JobRole))
  .filter((r) => !batchUrls.has(r.url))
  .filter((r) => !(r.deadline && r.deadline < date))
  .filter((r) => isEntryFriendly(tierOf(r)))
  .filter((r) => !batchIdentities.has(identityKey(r)))
  .filter((r) => (r.first_recommended_date ?? r.job_date) < date); // 그날 이전에 추천된 것만
console.log(`   같은 role의 과거 신입·주니어 후보(마감·identity·URL 필터 후): ${pool.length}건`);
if (pool.length === 0) {
  console.log(`   👉 후보가 0건이므로 **미발동이 정상**이다(규칙 5: 후보 없으면 기존 신규 4건 유지).`);
  process.exit(0);
}
for (const r of pool.slice(0, 10)) console.log(`     [${tierOf(r)}] ${r.matched_role} / 마지막노출 ${r.job_date} · ${r.company} — ${r.title.slice(0, 34)}`);

if (!probe) {
  console.log(`\n   ⚠️ 후보가 ${pool.length}건 있는데 안 들어왔다. active 여부를 확인해야 원인이 갈린다.`);
  console.log(`   👉 --probe 를 붙여 다시 돌려라(채용 사이트에 GET을 보낸다. 읽기 전용).`);
  process.exit(1);
}

console.log(`\n   active 재검증 중... (${pool.length}건)`);
let active = 0, closed = 0, unknown = 0;
for (let i = 0; i < pool.length; i += 3) {
  const batch = pool.slice(i, i + 3);
  const res = await Promise.allSettled(batch.map(async (r) => {
    const f = r.url.includes("wanted.co.kr") ? fetchWantedJobDetail
      : r.url.includes("jumpit.saramin.co.kr") ? fetchJumpitJobDetail
      : r.url.includes("jobkorea.co.kr") ? fetchJobKoreaJobDetail : null;
    if (!f) return "unknown" as const;
    const fields = await f(r.url);
    if (!fields || !fields.is_job_posting) return "closed" as const;
    if (fields.deadline && fields.deadline < date) return "closed" as const;
    return "active" as const;
  }));
  batch.forEach((r, k) => {
    const s = res[k].status === "fulfilled" ? (res[k] as PromiseFulfilledResult<string>).value : "unknown";
    if (s === "active") active++; else if (s === "closed") closed++; else unknown++;
    console.log(`     ${s === "active" ? "✅" : s === "closed" ? "❌" : "⚠️"} ${s.padEnd(7)} ${r.company} — ${r.title.slice(0, 34)}`);
  });
}
console.log(`\n   active ${active} / closed ${closed} / unknown ${unknown}`);
console.log(active === 0
  ? `   👉 active가 0건이므로 **미발동이 정상**이다(후보는 있었지만 전부 마감·확인불가).`
  : preStepI
  ? `   ℹ️ active가 ${active}건 있다. 하지만 ${date}는 STEP I 배포 이전이라 **결함이 아니다** —\n` +
    `      STEP I가 돌았다면 이 중 1건이 들어왔을 것이라는 참고치다.`
  : `   🔴 active가 ${active}건 있는데도 안 들어왔다 = **STEP I 결함이다.** 조사 순서:\n` +
    `      (a) 배포된 커밋에 0608b25가 들어갔나 (Vercel 빌드 실패면 옛 코드가 돈다)\n` +
    `      (b) applyEntrySoftReserve 호출이 STEP F 뒤에 있나 (generate.ts assembleDailyJobs)\n` +
    `      (c) 그날 batch의 careerTier가 experienced가 아니라 unknown이었나 (unknown은 교체 대상이 아니다)\n` +
    `      (d) collectVerifiedFallback의 FALLBACK_VERIFY_MAX(24) 안에 이 후보가 들었나`);
process.exit(active === 0 ? 0 : 1);
}
