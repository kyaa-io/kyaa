-- Rollback of 20261215070000_share_proofs. Roll the web back first. Submitted proofs are deleted; points already paid stay.
begin;
set local lock_timeout = '5s';
drop trigger if exists app_users_scrub_fan_share_proofs on public.app_users;
drop function if exists public.scrub_fan_share_proofs_on_deletion();
drop function if exists public.list_fan_share_proofs(uuid, uuid);
drop function if exists public.set_fan_share_proof_points(uuid, uuid, integer);
drop function if exists public.submit_fan_share_proof(uuid, uuid, text, text, text);
drop table if exists public.fan_share_proofs;
commit;
