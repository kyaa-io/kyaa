-- Rollback of 20261223100000_passport_claim_ad_gate.sql: the ad-less claim is callable again and the heart ad sessions go away.
-- Hearts already paid stay (creator_heart_ledger, passport_page_claims). Deploy the web build that sends no session right after.
begin;
set local lock_timeout = '5s';
drop function public.claim_passport_page_with_ad(uuid, uuid, integer, text, uuid);
drop function public.report_owned_passport_claim_ad_session(uuid, uuid, text, integer);
drop function public.issue_owned_passport_claim_ad_session(uuid, uuid, integer, integer, integer, integer);
-- the table refuses delete/truncate row by row, but drop table is allowed
drop table public.passport_claim_ad_sessions;
grant execute on function public.claim_passport_page(uuid, uuid, integer, text) to service_role;
notify pgrst, 'reload schema';
commit;
