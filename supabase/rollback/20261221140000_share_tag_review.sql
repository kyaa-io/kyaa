-- Rollback for 20261221140000_share_tag_review.sql. Roll the web back with it.
-- Stops while a pending or rejected share proof exists: the old shape and the old submit (which paid at once) cannot hold them.
-- Accepted and revoked proofs are untouched. The review function goes; the submit and list functions return to the 20261220033000 bodies.
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

create or replace function public.submit_fan_share_proof(p_app_user_id uuid, p_celebrity_id uuid, p_platform text, p_url text, p_url_key text, p_own_post boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fan_share_proofs%rowtype;
begin
  if not exists (select 1 from public.app_users u where u.id = p_app_user_id and u.status = 'active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  if p_own_post is not true then raise exception 'SHARE_PROOF_OWN_POST_REQUIRED'; end if;
  if not exists (select 1 from public.fan_passports p where p.app_user_id = p_app_user_id and p.celebrity_id = p_celebrity_id) then raise exception 'PASSPORT_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-share-proof:' || p_app_user_id::text || ':' || p_url_key, 0));
  select * into v_row from public.fan_share_proofs where app_user_id = p_app_user_id and url_key = p_url_key;
  if found and v_row.kind <> 'share' then /* b3-share-cross */
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', 0, 'status', 'accepted', 'duplicate', true);
  elsif found then
    return jsonb_build_object('id', v_row.id, 'replayed', true, 'points', v_row.points, 'status', v_row.status);
  end if;
  insert into public.fan_share_proofs (app_user_id, celebrity_id, platform, url, url_key, own_post_confirmed)
  values (p_app_user_id, p_celebrity_id, p_platform, p_url, p_url_key, true) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'replayed', false, 'points', null, 'status', v_row.status);
end $$;

create or replace function public.read_admin_share_proofs(p_actor uuid, p_allowlist uuid, p_status text, p_before timestamptz, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  begin perform public.assert_active_admin(p_actor, p_allowlist, false);
  exception when others then raise exception 'ADMIN_REQUIRED' using errcode = 'P0001'; end;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'createdAt', s.created_at, 'status', s.status, 'platform', s.platform, 'url', s.url,
      'postId', split_part(s.url_key, ':', 2), 'points', s.points,
      'creator', jsonb_build_object('slug', c.slug, 'name', coalesce(l.name, c.slug)),
      'member', jsonb_build_object('id', s.app_user_id, 'nickname', p.nickname),
      'duplicateCount', (select count(*) from public.fan_share_proofs o where o.url_key = s.url_key and o.app_user_id <> s.app_user_id),
      'revokedAt', s.revoked_at, 'revokeResult', s.revoke_result) order by s.created_at desc, s.id desc)
    from (select * from public.fan_share_proofs f
          where f.kind = 'share' /* b3-share-cross */ and (p_status is null or p_status = 'all' or f.status = p_status) and (p_before is null or f.created_at < p_before)
          order by f.created_at desc, f.id desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) s
    join public.celebrities c on c.id = s.celebrity_id
    left join public.celebrity_localizations l on l.celebrity_id = c.id and l.locale = 'ko'
    left join public.user_profiles p on p.app_user_id = s.app_user_id), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';
commit;
