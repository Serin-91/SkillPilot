export type TavilySearchResult = { url: string; title: string; content: string };

async function tavilyPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`https://api.tavily.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Tavily ${path} ${res.status}`);
  return res.json();
}

export async function tavilySearch(query: string, domain: string, maxResults: number): Promise<TavilySearchResult[]> {
  const data = await tavilyPost<{ results: { url: string; title: string; content: string }[] }>("/search", {
    query,
    include_domains: [domain],
    max_results: maxResults,
  });
  return data.results.map((r) => ({ url: r.url, title: r.title, content: r.content }));
}
