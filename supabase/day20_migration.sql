-- Day20 추가 — schema.sql, day3~day19_migration.sql 실행 후 Supabase SQL Editor에서 그대로 실행한다.
-- Key Notes에서 일부 메모(주로 초반에 만든 메모)가 삭제되지 않는 버그 수정.
--
-- 원인: ai_result.saved_memo_id가 memo(id)를 참조하면서 ON DELETE 절이 없어 기본값인
-- NO ACTION으로 걸려 있었다. AI Focus/Idea 결과가 그 메모를 가리키고 있으면
-- deleteMemo()의 DELETE가 FK violation으로 에러를 던지고(그런데 호출부 askConfirm의
-- onConfirm이 await 없이 fire-and-forget이라 화면에는 에러가 보이지 않는다), 메모는
-- DB에 그대로 남는다. ai_result 쪽 row는 참고용 기록일 뿐 메모가 사라져도 무효화될
-- 이유가 없으므로 ON DELETE SET NULL로 바꿔 참조만 끊고 삭제를 허용한다.

alter table ai_result drop constraint ai_result_saved_memo_id_fkey;
alter table ai_result add constraint ai_result_saved_memo_id_fkey
  foreign key (saved_memo_id) references memo(id) on delete set null;
