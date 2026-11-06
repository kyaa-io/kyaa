-- Passport pages from page 2 are a stacking book (user decision 2026-11-06, plan 5.2 and 6.4): any issued dukjil stamp takes the next free slot.
-- Before this, a kind with capPer 'none' (second proof, second subscription, LIVE, survey, mission, event) had no daily limit to read and so got no slot.
-- capPer 'none' means no stamp limit, so such a stamp now stacks. How many stamps are issued stays with record_dukjil_action and its source keys.
-- A kind with a real stamp limit keeps its rule. Page 1 keeps its conditions. No policy row, point amount or limit changes, so no new policy version.
-- Not retroactive: only stamps issued after this migration are placed. Cheer stamps stay out of the pages (issued through the base issuer by the claim itself).
--
-- Voided community stamps leave the owner's collection and the two counts built on it.
-- The caps in record_dukjil_action and the dukjil read model keep counting voided stamps on purpose: a void must not hand a stamp back for the same day.
--
-- Reverse: remove the added conditions with the same replacements in the other direction. Slots already placed stay placed.

create function pg_temp.stacking_patch(p_sig regprocedure, p_from text, p_to text) returns void language plpgsql as $$
declare d text;
begin
  d := pg_catalog.pg_get_functiondef(p_sig);
  if (length(d) - length(replace(d, p_from, ''))) / length(p_from) <> 1 then raise exception 'STACKING_PATCH_ANCHOR_CHANGED %: %', p_sig::text, p_from; end if;
  execute replace(d, p_from, p_to);
end $$;

select pg_temp.stacking_patch('public.passport_place_stamp(uuid,uuid,uuid,public.community_stamp_kind)'::regprocedure,
  $a$if cap_per is not null and cap_per <> 'none' and cap_max is not null then$a$,
  $b$if cap_per = 'none' or (cap_per is not null and cap_max is not null) then$b$);
select pg_temp.stacking_patch('public.passport_place_stamp(uuid,uuid,uuid,public.community_stamp_kind)'::regprocedure,
  $a$if today_count < cap_max then$a$,
  $b$if cap_per = 'none' or today_count < cap_max then$b$);

select pg_temp.stacking_patch('public.get_owned_community_stamps_legacy_projection(uuid,text)'::regprocedure,
  $a$where stamp.app_user_id=p_app_user_id$a$,
  $b$where stamp.app_user_id=p_app_user_id and stamp.revoked_at is null$b$);
select pg_temp.stacking_patch('public.read_owned_mobile_profile(uuid,public.content_locale)'::regprocedure,
  $a$(select count(*) from public.community_stamps where app_user_id=p_app_user_id) stamps$a$,
  $b$(select count(*) from public.community_stamps where app_user_id=p_app_user_id and revoked_at is null) stamps$b$);
select pg_temp.stacking_patch('public.read_owned_mobile_passport_public_stamp_count(uuid,uuid)'::regprocedure,
  $a$public_stamp.stamp_source='community' and exists(
        select 1 from public.community_stamps stamp where stamp.id=public_stamp.stamp_id$a$,
  $b$public_stamp.stamp_source='community' and exists(
        select 1 from public.community_stamps stamp where stamp.id=public_stamp.stamp_id and stamp.revoked_at is null$b$);

notify pgrst, 'reload schema';
