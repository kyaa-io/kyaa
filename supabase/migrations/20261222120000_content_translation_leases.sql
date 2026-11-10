-- Content translation leases: while one server is calling the translation provider for a cache key, other servers asking for the same key wait for
-- the stored row instead of calling the provider again. The key is the cache key itself (target, revision, source hash, source locale, target
-- locale) plus the scope ('whole' for the whole-text row, 'slots' for the title/article rows). The lease is a short-lived row that expires by itself;
-- no database lock is held while the provider runs. The save functions below accept a write only from the current lease holder, after the same
-- source access, revision and hash checks the existing save functions make. The existing cache tables and save/read functions are not changed.
begin;

create table public.content_translation_leases (
  target_type text not null, target_id uuid not null, source_revision integer not null, source_hash text not null,
  source_locale text not null, target_locale text not null check(length(target_locale) between 2 and 8),
  scope text not null check(scope in ('whole','slots')),
  lease_token uuid not null, expires_at timestamptz not null,
  primary key(target_type,target_id,source_revision,source_hash,source_locale,target_locale,scope)
);
create index content_translation_leases_expiry on public.content_translation_leases(expires_at);
alter table public.content_translation_leases enable row level security;
revoke all on public.content_translation_leases from public,anon,authenticated,service_role;

-- Access check first (same source function the cache read uses), then the revision/hash the caller saw, then the lease. A live lease held by
-- another token answers 'busy'; an expired lease is taken over with a new token, so the previous holder can no longer save.
create function public.claim_content_translation_lease(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale,p_scope text,p_source_revision integer,p_source_hash text,p_lease_seconds integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target jsonb; v_token uuid:=extensions.gen_random_uuid(); v_claimed uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_scope is null or p_scope not in ('whole','slots') or (p_scope='slots' and p_target_type is distinct from 'fan_post')
    or p_lease_seconds is null or p_lease_seconds not between 1 and 60 then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (v_target->>'revision')::integer<>p_source_revision or v_target->>'sourceHash'<>p_source_hash then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  delete from public.content_translation_leases where expires_at<=clock_timestamp();
  insert into public.content_translation_leases(target_type,target_id,source_revision,source_hash,source_locale,target_locale,scope,lease_token,expires_at)
    values(p_target_type,p_target_id,p_source_revision,p_source_hash,v_target->>'sourceLocale',p_target_locale,p_scope,v_token,clock_timestamp()+make_interval(secs=>p_lease_seconds))
    on conflict(target_type,target_id,source_revision,source_hash,source_locale,target_locale,scope) do update
      set lease_token=excluded.lease_token,expires_at=excluded.expires_at where public.content_translation_leases.expires_at<=clock_timestamp()
    returning lease_token into v_claimed;
  if v_claimed is null then return jsonb_build_object('status','busy'); end if;
  return jsonb_build_object('status','claimed','token',v_claimed);
end $$;

create function public.release_content_translation_lease(p_lease_token uuid)
returns void language sql security definer set search_path='' as $$
  delete from public.content_translation_leases where lease_token=p_lease_token;
$$;

-- Whole-text save by the lease holder. Source access, revision and hash are checked before the lease; the existing save then repeats them and
-- writes. A missing, expired or taken-over lease raises FAN_WEB_CONFLICT and writes nothing. The lease is released in the same transaction.
create function public.save_content_translation_leased(p_lease_token uuid,p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale,p_source_revision integer,p_source_hash text,p_translated_text text,p_detected_source_locale text)
returns void language plpgsql security definer set search_path='' as $$
declare v_target jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (v_target->>'revision')::integer<>p_source_revision or v_target->>'sourceHash'<>p_source_hash then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  perform 1 from public.content_translation_leases l where l.lease_token=p_lease_token and l.scope='whole' and l.target_type=p_target_type and l.target_id=p_target_id
    and l.source_revision=p_source_revision and l.source_hash=p_source_hash and l.source_locale=v_target->>'sourceLocale' and l.target_locale=p_target_locale
    and l.expires_at>clock_timestamp() for update;
  if not found then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  perform public.save_content_translation(p_app_user_id,p_target_type,p_target_id,p_target_locale,p_locale,p_source_revision,p_source_hash,p_translated_text,p_detected_source_locale);
  delete from public.content_translation_leases where lease_token=p_lease_token;
end $$;

create function public.save_content_translation_slots_leased(p_lease_token uuid,p_app_user_id uuid,p_target_type text,p_target_id uuid,p_target_locale text,p_locale public.content_locale,p_source_revision integer,p_source_hash text,p_slots jsonb,p_detected_source_locale text)
returns void language plpgsql security definer set search_path='' as $$
declare v_target jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_target_type is distinct from 'fan_post' then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
  v_target:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id,p_locale);
  if v_target is null then raise exception 'FAN_WEB_NOT_FOUND' using errcode='P0002'; end if;
  if (v_target->>'revision')::integer<>p_source_revision or v_target->>'sourceHash'<>p_source_hash then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  perform 1 from public.content_translation_leases l where l.lease_token=p_lease_token and l.scope='slots' and l.target_type=p_target_type and l.target_id=p_target_id
    and l.source_revision=p_source_revision and l.source_hash=p_source_hash and l.source_locale=v_target->>'sourceLocale' and l.target_locale=p_target_locale
    and l.expires_at>clock_timestamp() for update;
  if not found then raise exception 'FAN_WEB_CONFLICT' using errcode='23514'; end if;
  perform public.save_content_translation_slots(p_app_user_id,p_target_type,p_target_id,p_target_locale,p_locale,p_source_revision,p_source_hash,p_slots,p_detected_source_locale);
  delete from public.content_translation_leases where lease_token=p_lease_token;
end $$;

revoke all on function public.claim_content_translation_lease(uuid,text,uuid,text,public.content_locale,text,integer,text,integer),
  public.release_content_translation_lease(uuid),
  public.save_content_translation_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,text,text),
  public.save_content_translation_slots_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_content_translation_lease(uuid,text,uuid,text,public.content_locale,text,integer,text,integer),
  public.release_content_translation_lease(uuid),
  public.save_content_translation_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,text,text),
  public.save_content_translation_slots_leased(uuid,uuid,text,uuid,text,public.content_locale,integer,text,jsonb,text) to service_role;

notify pgrst, 'reload schema';
commit;
