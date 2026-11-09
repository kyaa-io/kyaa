-- Rollback of 20261220033000_b3_insta_repost.sql (web first). Refuses while any repost row or share_proof upload exists: their
-- payouts and captures would lose their only reader. Reverts the share function pairs (md5 checked) and drops the repost objects.
begin;
set local lock_timeout = '5s';

do $$ begin
  if exists (select 1 from public.fan_share_proofs where kind <> 'share') then raise exception 'B3_ROLLBACK_BLOCKED: insta_repost rows exist'; end if;
  if exists (select 1 from public.mobile_media_assets where purpose = 'share_proof' or access_scope = 'share_proof' or attached_type = 'share_proof') then
    raise exception 'B3_ROLLBACK_BLOCKED: share_proof uploads exist'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.pay_fan_share_proof(uuid,uuid,uuid,jsonb)',
    'public.list_fan_share_proofs(uuid,uuid)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)',
    'public.revoke_fan_share_proof(uuid,uuid,uuid,text)', 'public.scrub_fan_share_proofs_on_deletion()',
    'public.reserve_owned_mobile_media(uuid,text,text,text,integer,uuid)'] loop
    perform public.b3_patch_function(f, true);
    delete from public.b3_function_patches where fn = f;
    delete from public.b3_function_patch_bases where fn = f;
  end loop;
end $$;

-- dukjil_correct_share_grant back to its own body (20261215070000)
create or replace function public.dukjil_correct_share_grant(p_actor uuid, p_owner uuid, p_source_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.dukjil_action_log; st public.community_stamps; cid uuid; entry uuid; gseq bigint; spent boolean; correction text; review text;
begin
  select * into l from public.dukjil_action_log
   where app_user_id = p_owner and action_key = 'share' and source_key = p_source_key
     and ((points > 0 and ledger_id is not null) or (points = 0 and ledger_id is null and stamp_id is not null))
   order by created_at limit 1;
  if l.id is null then return 'none'; end if;
  if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then return 'replayed'; end if;
  if l.stamp_id is not null then
    select * into st from public.community_stamps where id = l.stamp_id;
    if st.id is null then raise exception 'SHARE_GRANT_UNREADABLE: stamp %', l.stamp_id using errcode = 'P0001'; end if;
    if st.revoked_at is null then
      perform public.void_passport_stamp(p_actor, st.id, 'share_proof_revoked', false, 'share-proof:' || l.id::text);
      if not exists (select 1 from public.community_stamps s where s.id = st.id and s.revoked_at is not null) then
        raise exception 'SHARE_GRANT_NOT_REVERTED: stamp %', st.id using errcode = 'P0001';
      end if;
    end if;
    if l.points = 0 then return 'stamp_voided'; end if;
    if exists (select 1 from public.dukjil_point_corrections c where c.action_log_id = l.id) then
      return (select status from public.dukjil_point_corrections c where c.action_log_id = l.id limit 1);
    end if;
  end if;
  cid := extensions.gen_random_uuid();
  select e.owner_sequence into gseq from public.mobile_fan_economy_ledger e where e.id = l.ledger_id;
  if gseq is null then raise exception 'SHARE_GRANT_UNREADABLE: ledger %', l.ledger_id using errcode = 'P0001'; end if;
  select exists (select 1 from public.mobile_fan_economy_ledger e
                 where e.app_user_id = p_owner and e.celebrity_id is null and e.asset = 'fan_point' and e.amount < 0
                   and e.source_type <> 'dukjil_correction' and e.owner_sequence > gseq) into spent;
  if not spent and public.group_wallet_balance(p_owner, 'fan_point') >= l.points then
    entry := public.group_wallet_post_correction(p_owner, 'fan_point', -l.points::bigint, 'dukjil_correction', cid);
    if entry is null then raise exception 'SHARE_GRANT_NOT_REVERTED: points' using errcode = 'P0001'; end if;
    correction := 'corrected';
  else
    correction := 'review'; review := 'rights_spent';
  end if;
  insert into public.dukjil_point_corrections (id, action_log_id, stamp_id, app_user_id, amount, reason, ledger_id, status, void_reason)
    values (cid, l.id, null, p_owner, l.points, coalesce(review, 'share_proof_revoked'), entry, correction, 'share_proof_revoked');
  return correction;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'share-proof-capture-cleanup';
drop function public.dukjil_correct_proof_grant(uuid, uuid, text, text);
drop function public.request_share_proof_capture_cleanup();
drop function public.authorize_share_proof_image_read(uuid, uuid, uuid, text);
drop function public.read_page_insta_repost_queue(uuid, uuid, text, timestamptz, integer);
drop function public.list_fan_insta_reposts(uuid, uuid);
drop function public.read_insta_repost_review_queue(uuid, uuid, uuid, text, timestamptz, integer);
drop function public.review_fan_insta_repost(uuid, uuid, uuid, integer, text, text);
drop function public.submit_fan_insta_repost(uuid, uuid, text, text, text, uuid, boolean);
drop function public.can_review_insta_repost(uuid, uuid, uuid);

drop index public.fan_share_proofs_repost_queue;
alter table public.fan_share_proofs drop constraint fan_share_proofs_rejected_code, drop constraint fan_share_proofs_story_capture,
  drop constraint fan_share_proofs_kind_shape, drop constraint fan_share_proofs_url_key_check, drop constraint fan_share_proofs_status_check;
alter table public.fan_share_proofs add constraint fan_share_proofs_url_key_check check (url_key ~ '^(instagram|tiktok|x|threads|youtube):[A-Za-z0-9_-]{6,40}$');
alter table public.fan_share_proofs add constraint fan_share_proofs_status_check check (status in ('accepted', 'revoked'));
alter table public.fan_share_proofs drop column action_log_id, drop column pay_result, drop column approved_at, drop column reject_code,
  drop column reviewer_role, drop column reviewed_by, drop column reviewed_at, drop column review_revision, drop column submitted_at,
  drop column asset_id, drop column post_kind, drop column kind;

do $$
declare c record; def text;
begin
  for c in select * from (values ('mobile_media_assets_purpose_check', 'purpose'), ('mobile_media_assets_access_scope_check', 'access_scope'),
      ('mobile_media_assets_attached_type_check', 'attached_type')) v(conname, col) loop
    select pg_get_constraintdef(oid) into def from pg_constraint where conrelid = 'public.mobile_media_assets'::regclass and conname = c.conname;
    if position(format(' OR (%s = ''share_proof''::text))', c.col) in def) = 0 then raise exception 'B3_ROLLBACK_BLOCKED: % no longer ends with share_proof', c.conname; end if;
    def := replace(def, format(' OR (%s = ''share_proof''::text)', c.col), '');
    execute format('alter table public.mobile_media_assets drop constraint %I', c.conname);
    execute format('alter table public.mobile_media_assets add constraint %I %s', c.conname, def);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
