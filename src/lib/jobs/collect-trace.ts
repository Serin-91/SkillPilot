// 수집이 왜 0건으로 끝났는지를 한 요청 안에서 모아 "지금 업데이트" 팝업까지 전달한다.
//
// 왜 별도 모듈인가: 이 기록은 generate.ts뿐 아니라 wanted/jumpit/jobkorea fetcher에서도 남겨야
// 하는데, generate.ts가 그 fetcher들을 import하고 있어 거꾸로 import하면 순환이 된다.
//
// 이 진단이 필요한 이유는 fetcher들이 실패를 throw하지 않기 때문이다 — 전부 `if (!res.ok) return
// null/[]` 형태라, 사이트가 403이나 429로 막아도 호출부에는 "그냥 결과가 없음"으로만 보인다.
// 그래서 소스 catch도 안 걸리고 실패 메일도 안 가고 사용자에겐 "조건에 맞는 공고를 못 찾았습니다"만
// 떴다. 상태 코드를 여기 남겨야 차단인지 진짜 0건인지 구분된다.
//
// ponytail: 모듈 스코프 배열. 동시 요청이 섞일 수 있지만 진단용이고 stale일 때만 읽는다.
let lines: string[] = [];

export function resetCollectErrors(): void { lines = []; }
export function takeCollectErrors(): string[] { const e = lines; lines = []; return e; }

export function recordCollectError(source: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const line = `${source} — ${msg.slice(0, 200)}`;
  // 같은 사이트가 role×variant 조합마다 불려서 같은 줄이 여러 번 쌓인다. 팝업에 도배되지 않게
  // 중복은 버리고 10줄까지만 남긴다.
  if (lines.length < 10 && !lines.includes(line)) lines.push(line);
}
