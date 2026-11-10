\set ON_ERROR_STOP on
-- Real SQL answers of the share-tag functions (submit, review, list, admin list), for apps/web/server/share-proof/share-tag-sql-responses.test.ts.
-- Needs the same fixture as share_tag_review.sql on a local disposable database with 20261221140000 applied; everything rolls back. Regenerate:
--   psql -X -q -At -f supabase/tests/share_tag_sql_responses.sql > apps/web/server/share-proof/share-tag-sql-responses.json
begin;
create temp table share_answers(name text primary key, value jsonb) on commit drop;
do $$
declare fp record; adm record; r jsonb; v_id uuid;
begin
  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users u on u.id = p.app_user_id and u.status = 'active'
    where exists (select 1 from public.user_wallets w where w.app_user_id = p.app_user_id) order by p.issued_at desc limit 1;
  select a.id allowlist, u.id actor into adm from public.admin_allowlist a join public.app_users u on u.verified_email = a.email and u.status = 'active' where a.active and a.role <> 'viewer' limit 1;
  if fp.app_user_id is null or adm.actor is null then raise exception 'Fixture: a passport holder and an admin'; end if;
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'instagram', 'https://www.instagram.com/p/ShareTag01/', 'instagram:ShareTag01', true);
  v_id := (r->>'id')::uuid;
  insert into share_answers values ('submit_pending', r);
  insert into share_answers values ('submit_replay', public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'instagram', 'https://www.instagram.com/p/ShareTag01/', 'instagram:ShareTag01', true));
  insert into share_answers values ('list_pending', public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id));
  insert into share_answers values ('admin_list_pending', public.read_admin_share_proofs(adm.actor, adm.allowlist, 'pending', null, 100));
  insert into share_answers values ('review_accept', public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 0, 'accept', null, array['instagram']));
  insert into share_answers values ('review_accept_replay', public.review_fan_share_proof(adm.actor, adm.allowlist, v_id, 0, 'accept', null, array['instagram']));
  r := public.submit_fan_share_proof(fp.app_user_id, fp.celebrity_id, 'x', 'https://x.com/fan/status/1850000000000000888', 'x:1850000000000000888', true);
  insert into share_answers values ('review_reject', public.review_fan_share_proof(adm.actor, adm.allowlist, (r->>'id')::uuid, 0, 'reject', 'no_hashtag', array['instagram']));
  insert into share_answers values ('list_after', public.list_fan_share_proofs(fp.app_user_id, fp.celebrity_id));
  insert into share_answers values ('admin_list_rejected', public.read_admin_share_proofs(adm.actor, adm.allowlist, 'rejected', null, 100));
end $$;
select jsonb_pretty(jsonb_object_agg(name, value)) from share_answers;
rollback;
