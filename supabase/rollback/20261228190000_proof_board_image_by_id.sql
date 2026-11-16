-- Rollback for 20261228190000_proof_board_image_by_id.sql. Roll the web back first: the proof image route calls this function.
begin;
set local lock_timeout = '5s';
drop function if exists public.read_proof_board_image(uuid,uuid);
commit;
