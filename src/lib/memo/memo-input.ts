import type { CreateMemoInput } from "@/lib/actions/memo";
import type { ContentMode, MemoColor, MemoType, TodoStatus } from "./types";
import { hasRichFormatting } from "./rich-text";

// 메모 저장 payload를 만드는 **유일한 자리**.
//
// 🔴 왜 있나: 이 11필드가 `handlePostitBack`(Dashboard) · `handleMemoDialogBack`(Dashboard) ·
//   `handleSaveMemo`(useMemoEditSession) **세 곳에 글자 그대로 복제**돼 있었다(2026-09-12 실측:
//   정규화 비교 11/11 필드 3벌 동일). `useMemoEditSession` 헤더가 *"공용 buildMemoInput() 추출은
//   별건"*이라고 미결로 적어둔 그 항목이다. 이 저장소가 반복해 밟은 지뢰가 "두 벌이 되면 한쪽만
//   고쳐진다"이고(메모지 색 세 벌 · 기본색 셋 · theme-color 두 벌), 저장 payload는 그중에서도
//   **되돌릴 수 없는 쓰기**다. 필드를 추가하거나 규칙을 바꿀 때 여기 한 곳만 고쳐라.
//
// 🔴 이 파일이 별도인 이유(옮기지 마라):
//   · `types.ts` — 의존 0인 leaf다. 여기서 `rich-text`를 import하면 types → rich-text → types **순환**.
//   · `rich-text.ts` — 본문 HTML/텍스트 **변환** 모듈이다. 레코드 모양 만들기는 다른 관심사다.
//   · `actions/memo.ts` — `"use server"`라 **async 아닌 export가 빌드를 깨뜨린다**(CLAUDE.md 지뢰표).
//     `CreateMemoInput`은 타입이라 `import type`으로만 가져온다(런타임 import 0).
//   · `useMemoEditSession.ts` — 순수 함수를 훅 모듈이 소유하면 Dashboard가 훅 모듈을 그것 때문에 읽는다.
//
// 🔴 순수 함수다. server action 호출 / state 변경 / ref / dialog / autosave / 저장 순서를 **모른다**.
//   호출부의 snapshot·낙관적 patch·"창 먼저 닫고 저장" 순서는 전부 호출부 계약 그대로다.
export function buildMemoInput(form: {
  title: string;
  /** 이미 읽어 둔 본문. 🔴 호출부가 `readFormBody()`를 **한 번만** 읽어 넘긴다(ref 소유는 호출부). */
  body: string;
  contentMode: ContentMode;
  emoji: string | null;
  memoType: MemoType;
  status: TodoStatus;
  startDate: string;
  endDate: string;
  color: MemoColor;
  isImportant: boolean;
}): CreateMemoInput {
  return {
    title: form.title,
    content: form.body,
    // 훅의 `contentFormatFor`와 **같은 식**이다(그쪽은 autosave 경로에서도 쓰여 그대로 남아 있다).
    content_format: form.contentMode === "document" || hasRichFormatting(form.body) ? "rich_html" : "plain",
    content_mode: form.contentMode,
    emoji: form.emoji,
    memo_type: form.memoType,
    // 🔴 todo가 아니면 status를 null로 내린다 — 세 호출부에 똑같이 있던 규칙이다. 빼지 마라.
    status: form.memoType === "todo" ? form.status : null,
    start_date: form.startDate,
    end_date: form.endDate,
    color: form.color,
    is_important: form.isImportant,
  };
}
