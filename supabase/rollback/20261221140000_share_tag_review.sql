-- Rollback for 20261221140000_share_tag_review.sql. Roll the web back with it. Run it BEFORE the B3 rollback (20261220033000), newest first.
-- Stops while a pending or rejected share proof exists: the old shape and the old submit (which paid at once) cannot hold them.
-- Accepted and revoked proofs are untouched. The review function goes; the submit and admin list functions return to the B3 patched
-- text (pair 1 only) through the same md5-checked mechanism, so owner and ACL are unchanged and B3's own rollback still finds its pairs.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.fan_share_proofs where kind = 'share' and status in ('pending', 'rejected')) then raise exception 'SHARE_PENDING_ROWS_EXIST'; end if;
end $$;

drop function public.review_fan_share_proof(uuid, uuid, uuid, integer, text, text, text[]);
alter table public.fan_share_proofs drop constraint fan_share_proofs_kind_shape;
alter table public.fan_share_proofs add constraint fan_share_proofs_kind_shape check (
  (kind = 'share' and post_kind is null and asset_id is null and status in ('accepted', 'revoked') and url_key !~ '^(instagram-story|image):')
  or (kind = 'insta_repost' and platform = 'instagram' and post_kind is not null and submitted_at is not null
      and (post_kind = 'story' or asset_id is null) and (url_key !~ '^image:' or post_kind = 'story')));

do $$ declare f text; begin
  foreach f in array array['public.submit_fan_share_proof(uuid,uuid,text,text,text,boolean)', 'public.read_admin_share_proofs(uuid,uuid,text,timestamp with time zone,integer)'] loop
    perform public.b3_patch_function(f, true);
    delete from public.b3_function_patches where fn = f and pair_no >= 2;
    perform public.b3_patch_function(f, false);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
