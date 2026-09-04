import { fetchDevEcosystem } from "@/lib/news/dev-ecosystem";
import { fetchRssItems } from "@/lib/news/rss";
import { GITHUB_CHANGELOG_FEED, HF_BLOG_FEED, DEV_LOOKBACK_DAYS, MAX_DEV_ITEMS_PER_SOURCE } from "@/lib/news/sources";
const d = (s: string) => s.slice(0, 10);
async function main(){
  const dev = await fetchDevEcosystem();
  console.log(`상수: DEV_LOOKBACK_DAYS=${DEV_LOOKBACK_DAYS} · MAX_DEV_ITEMS_PER_SOURCE=${MAX_DEV_ITEMS_PER_SOURCE}`);
  console.log(`오늘(KST 기준 로컬): ${new Date().toISOString().slice(0,10)}\n`);
  for (const [name, arr] of [["GitHub", dev.github], ["Hugging Face", dev.huggingface]] as const) {
    const days = [...new Set(arr.map(x => d(x.published_at)))].sort();
    console.log(`[${name}] ${arr.length}건 · 날짜 ${days.length}종: ${days.join(", ")}`);
    arr.forEach(x => console.log(`   ${d(x.published_at)} | ${x.title.slice(0, 68)}`));
    console.log("");
  }
  // 필터 전 원본이 며칠치를 갖고 있나 — 상한 6이 날짜 폭을 자르고 있는지 본다
  for (const [name, feed] of [["GitHub", GITHUB_CHANGELOG_FEED], ["HF Blog", HF_BLOG_FEED]] as const) {
    const items = await fetchRssItems(name, feed);
    const within = items.filter(c => { const x=(Date.now()-c.publishedAt.getTime())/864e5; return x>=0 && x<=DEV_LOOKBACK_DAYS; });
    const days = [...new Set(within.map(c => c.publishedAt.toISOString().slice(0,10)))].sort();
    console.log(`[원본 ${name}] 피드 ${items.length}건 → 7일 창 ${within.length}건 · 날짜 ${days.length}종: ${days.join(", ")}`);
  }
}
main();
