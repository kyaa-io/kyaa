-- Only new, valid publications can earn this stamp; existing ticket awards remain intact.
alter table public.fan_clips add column first_stamp_eligible boolean not null default false;
alter table public.fan_clips alter column first_stamp_eligible set default true;
alter table public.fan_clips add column write_reward jsonb;
create unique index community_stamps_first_clip_once
  on public.community_stamps(app_user_id,celebrity_id) where kind='first_clip';

do $$
declare
  v_signature regprocedure:='public.assert_community_stamp_source(uuid,uuid,public.community_stamp_kind,text)'::regprocedure;
  v_definition text;
  v_anchor text:=$patch$elsif p_kind='first_comment' then$patch$;
  v_replacement text:=$patch$elsif p_kind='first_clip' then
    select 'first-clip:'||clip.id::text into v_expected from public.fan_clips clip
      where clip.app_user_id=p_app_user_id and clip.celebrity_id=p_celebrity_id
        and clip.first_stamp_eligible and clip.deleted_at is null and clip.hidden_at is null
      order by clip.created_at,clip.id limit 1;
    if p_celebrity_id is null or v_expected is null or v_expected is distinct from p_source_key then
      raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
    end if;
  elsif p_kind='first_comment' then$patch$;
begin
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  if position(v_anchor in v_definition)=0 then raise exception 'CLIP_STAMP_SOURCE_PATCH_MISSING'; end if;
  execute replace(v_definition,v_anchor,v_replacement);
end $$;

create function public.mobile_content_first_clip_stamp_result(p_app_user_id uuid,p_clip_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_clip public.fan_clips%rowtype;v_stamp public.community_stamps%rowtype;
begin
  select * into v_clip from public.fan_clips where id=p_clip_id and app_user_id=p_app_user_id;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  select * into v_stamp from public.community_stamps
    where app_user_id=p_app_user_id and celebrity_id=v_clip.celebrity_id and kind='first_clip';
  if found then
    return jsonb_build_object('status',case when v_stamp.source_key='first-clip:'||p_clip_id::text then 'awarded' else 'already_awarded' end,
      'stampId',v_stamp.id,'issuedAt',v_stamp.issued_at);
  end if;
  return jsonb_build_object('status',case when v_clip.first_stamp_eligible and v_clip.deleted_at is null and v_clip.hidden_at is null
    and public.fan_web_is_member(p_app_user_id,v_clip.celebrity_id)
    then 'preparing' else 'needs_review' end);
end $$;

alter function public.create_mobile_content_fan_clip(uuid,text,text,text,uuid[],uuid)
  rename to create_mobile_content_fan_clip_before_stamp;
create function public.create_mobile_content_fan_clip(
  p_app_user_id uuid,p_slug text,p_body text,p_visibility text,p_asset_ids uuid[],p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_clip public.fan_clips%rowtype;
begin
  v_result:=public.create_mobile_content_fan_clip_before_stamp(p_app_user_id,p_slug,p_body,p_visibility,p_asset_ids,p_idempotency_key);
  select * into strict v_clip from public.fan_clips where id=(v_result->>'id')::uuid and app_user_id=p_app_user_id;
  update public.fan_clips set write_reward=coalesce(write_reward,v_result->'reward') where id=v_clip.id;
  return public.recover_owned_mobile_clip_stamp(p_app_user_id,p_slug,p_idempotency_key)||jsonb_build_object('replayed',v_result->'replayed');
end $$;

create function public.read_owned_mobile_clip_result(p_app_user_id uuid,p_slug text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_clip public.fan_clips%rowtype;v_reward jsonb;
begin
  -- Serializes with publication: a timeout cannot turn an in-flight write into an absent receipt.
  perform public.fan_web_lock_active_user(p_app_user_id);
  select clip.* into v_clip from public.fan_clips clip join public.celebrities creator on creator.id=clip.celebrity_id
    where clip.app_user_id=p_app_user_id and clip.idempotency_key=p_idempotency_key and creator.slug=p_slug;
  if not found then return null; end if;
  v_reward:=v_clip.write_reward;
  if v_reward is null then
    select jsonb_build_object('status','awarded','ticketAmount',award.ticket_amount,'policyVersion',policy.policy_version,'ledgerId',award.ledger_id)
      into v_reward from public.mobile_content_clip_reward_awards award join public.mobile_content_clip_reward_policies policy on policy.id=award.policy_id
      where award.app_user_id=p_app_user_id and award.celebrity_id=v_clip.celebrity_id;
  end if;
  return jsonb_build_object('id',v_clip.id,'revision',v_clip.revision,'replayed',true,
    'reward',coalesce(v_reward,jsonb_build_object('status','unconfigured')),
    'stamp',public.mobile_content_first_clip_stamp_result(p_app_user_id,v_clip.id));
end $$;

create function public.recover_owned_mobile_clip_stamp(p_app_user_id uuid,p_slug text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_clip public.fan_clips%rowtype;v_first_id uuid;v_error text;
begin
  v_result:=public.read_owned_mobile_clip_result(p_app_user_id,p_slug,p_idempotency_key);
  if v_result is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  select * into strict v_clip from public.fan_clips where id=(v_result->>'id')::uuid;
  if v_result#>>'{stamp,status}'='preparing' then
    select id into v_first_id from public.fan_clips
      where app_user_id=p_app_user_id and celebrity_id=v_clip.celebrity_id and first_stamp_eligible and deleted_at is null and hidden_at is null
      order by created_at,id limit 1;
    if v_first_id is not null then
      begin
        perform public.issue_community_stamp(p_app_user_id,v_clip.celebrity_id,'first_clip','first-clip:'||v_first_id::text);
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_error=message_text;
        if v_error<>'COMMUNITY_STAMP_WALLET_NOT_READY' then raise; end if;
      end;
    end if;
  end if;
  return public.read_owned_mobile_clip_result(p_app_user_id,p_slug,p_idempotency_key);
end $$;

revoke all on function public.create_mobile_content_fan_clip_before_stamp(uuid,text,text,text,uuid[],uuid),
  public.mobile_content_first_clip_stamp_result(uuid,uuid),public.create_mobile_content_fan_clip(uuid,text,text,text,uuid[],uuid),
  public.read_owned_mobile_clip_result(uuid,text,uuid),public.recover_owned_mobile_clip_stamp(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_mobile_content_fan_clip(uuid,text,text,text,uuid[],uuid),
  public.read_owned_mobile_clip_result(uuid,text,uuid),public.recover_owned_mobile_clip_stamp(uuid,text,uuid) to service_role;
