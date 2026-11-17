-- Rollback for 20261230030000_proof_resubmit_request_key.sql. Roll the web back first (it calls resubmit_certification_proof_keyed).
-- Dropping the table forgets which resubmits were already answered; a lost-response retry after this point is a plain resubmit again.
begin;
set local lock_timeout = '5s';
drop function if exists public.resubmit_certification_proof_keyed(uuid, uuid, uuid, bigint, uuid[], text[], text, boolean, text);
drop table if exists public.certification_proof_resubmit_requests;
notify pgrst, 'reload schema';
commit;
