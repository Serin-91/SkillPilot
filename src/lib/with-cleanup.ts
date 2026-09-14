// `try { ... } finally { 정리 }` 한 벌을 **훅 밖으로** 빼두는 자리다.
//
// 왜 있나 — React Compiler는 `TryStatement`에 `finally`가 붙으면 그 **함수 하나를 통째로**
// 분석 포기한다(`react-hooks/todo`: "Handle TryStatement with a finalizer / without a catch clause").
// 로딩 플래그를 푸는 `finally`는 우리 훅 아홉 군데에 같은 모양으로 있었고, 그 아홉 개 훅이
// 전부 최적화에서 빠지고 있었다. 여기는 컴포넌트도 훅도 아니라 컴파일 대상이 아니므로,
// `finally` 한 벌을 이 파일에 모아두면 호출부 훅들은 정상적으로 컴파일된다.
//
// 🔴 동작은 `try/finally`와 **완전히 같다**:
//   · `body`가 정상 종료하든 `return`으로 빠져나가든 throw하든 `cleanup`은 반드시 실행된다.
//   · 에러를 삼키지 않는다 — `cleanup` 뒤에 그대로 다시 던진다.
//   · `cleanup`은 `body`의 결과를 보지 않는다(성공/실패 분기는 호출부가 가진다).
//
// ⚠️ 호출부 주의 — 원래 코드에서 `try` 블록 안의 `return`은 **함수 전체**를 끝냈다.
//    이 helper로 옮기면 그 `return`은 **콜백만** 끝낸다. 그래서 옮길 때
//    `try/finally`가 그 함수의 **마지막 문장**인지 반드시 확인해라(아홉 군데 전부 그랬다).
//    뒤에 문장이 더 있는 함수에 그대로 옮기면 원래는 건너뛰던 코드가 실행된다.
export async function withCleanup<T>(body: () => Promise<T>, cleanup: () => void): Promise<T> {
  try {
    return await body();
  } finally {
    cleanup();
  }
}
