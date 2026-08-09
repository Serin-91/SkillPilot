// ponytail: 프로세스 메모리 락이라 서버리스 인스턴스가 여러 개로 뜨면 완전히 막지 못한다 — 클라이언트의
// 즉시 disabled 처리가 1차 방어선이고, 이건 같은 인스턴스로 들어온 중복 요청만 추가로 막는 보조 장치다.
// 여러 인스턴스까지 확실히 막아야 하면 ai_result처럼 DB 유니크 인덱스 기반 락으로 옮긴다.
const inFlight = new Set<string>();

export async function withRetryGuard<T>(key: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  if (inFlight.has(key)) return { error: "이미 처리 중입니다." };
  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
}
