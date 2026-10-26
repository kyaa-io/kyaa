-- Display translations never replace source content. Request identities and caches are service-only.
create table public.display_translations (
  requester_hash text not null check(requester_hash ~ '^[a-f0-9]{64}$'),
  app_user_id uuid references public.app_users(id) on delete cascade,
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  target_locale text not null check(target_locale in ('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr','ru')),
  translated_text text not null check(length(btrim(translated_text)) between 1 and 100000),
  expires_at timestamptz not null,
  primary key(requester_hash,source_hash,target_locale)
);
create index display_translations_expiry on public.display_translations(expires_at);
create table public.display_translation_requests (
  id bigint generated always as identity primary key,
  app_user_id uuid references public.app_users(id) on delete cascade,
  requester_hash text not null check(requester_hash ~ '^[a-f0-9]{64}$'),
  character_count integer not null check(character_count between 1 and 20000),
  created_at timestamptz not null default clock_timestamp()
);
create index display_translation_requests_requester on public.display_translation_requests(requester_hash,created_at);
create index display_translation_requests_owner on public.display_translation_requests(app_user_id,created_at);
alter table public.display_translations enable row level security;
alter table public.display_translation_requests enable row level security;
revoke all on public.display_translations,public.display_translation_requests from public,anon,authenticated;
grant all on public.display_translations,public.display_translation_requests to service_role;
grant usage,select on sequence public.display_translation_requests_id_seq to service_role;

create function public.read_display_translation(p_app_user_id uuid,p_requester_hash text,p_source_hash text,p_target_locale text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  if p_app_user_id is not null and not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'; end if;
  delete from public.display_translations where expires_at <= clock_timestamp();
  select jsonb_build_object('translatedText',translated_text,'cached',true) into result
  from public.display_translations where requester_hash=p_requester_hash and source_hash=p_source_hash and target_locale=p_target_locale
    and app_user_id is not distinct from p_app_user_id;
  return result;
end $$;

create function public.save_display_translation(p_app_user_id uuid,p_requester_hash text,p_source_hash text,p_target_locale text,p_translated_text text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  insert into public.display_translations(requester_hash,app_user_id,source_hash,target_locale,translated_text,expires_at)
  values(p_requester_hash,p_app_user_id,p_source_hash,p_target_locale,p_translated_text,clock_timestamp()+case when p_app_user_id is null then interval '24 hours' else interval '30 days' end)
  on conflict(requester_hash,source_hash,target_locale) do update set translated_text=excluded.translated_text,expires_at=excluded.expires_at
    where display_translations.app_user_id is not distinct from excluded.app_user_id;
end $$;

-- Both entrypoints share one lock and the original daily/monthly character budget.
create function public.check_display_translation_budget(p_app_user_id uuid,p_requester_hash text,p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_day timestamptz;v_month timestamptz;v_min_count bigint;v_user_chars bigint;v_day_chars bigint;v_month_chars bigint;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  if p_requester_hash is null or p_requester_hash !~ '^[a-f0-9]{64}$' or p_character_count is null or p_character_count not between 1 and 20000 then raise exception 'TRANSLATION_INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web:translation-budget',0));
  v_now:=clock_timestamp();
  v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  v_month:=date_trunc('month',v_now at time zone 'UTC') at time zone 'UTC';
  select count(*) filter(where created_at>v_now-interval '1 minute'),coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.display_translation_requests
    where case when p_app_user_id is null then app_user_id is null and requester_hash=p_requester_hash else app_user_id=p_app_user_id end;
  if p_app_user_id is not null then
    select v_min_count+count(*) filter(where created_at>v_now-interval '1 minute'),v_user_chars+coalesce(sum(character_count) filter(where created_at>=v_day),0)
    into v_min_count,v_user_chars from public.content_translation_requests where app_user_id=p_app_user_id;
  end if;
  select coalesce(sum(character_count) filter(where created_at>=v_day),0),coalesce(sum(character_count),0)
    into v_day_chars,v_month_chars from (
      select character_count,created_at from public.content_translation_requests where created_at>=v_month
      union all select character_count,created_at from public.display_translation_requests where created_at>=v_month
    ) requests;
  if v_min_count>=10 or v_user_chars+p_character_count>10000 or v_day_chars+p_character_count>20000 or v_month_chars+p_character_count>200000 then raise exception 'TRANSLATION_RATE_LIMITED'; end if;

end $$;

create function public.reserve_display_translation_request(p_app_user_id uuid,p_requester_hash text,p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.check_display_translation_budget(p_app_user_id,p_requester_hash,p_character_count);
  delete from public.display_translation_requests where created_at < date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  insert into public.display_translation_requests(app_user_id,requester_hash,character_count) values(p_app_user_id,p_requester_hash,p_character_count);
end $$;

create or replace function public.reserve_content_translation_request(p_app_user_id uuid,p_character_count integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  -- A separate domain from HTTP HMAC identities; authenticated quota is counted by app_user_id.
  perform public.check_display_translation_budget(p_app_user_id,encode(extensions.digest('content-target:'||p_app_user_id::text,'sha256'),'hex'),p_character_count);
  insert into public.content_translation_requests(app_user_id,character_count) values(p_app_user_id,p_character_count);
end $$;

create function public.clear_display_translations_for_inactive_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'active' then delete from public.display_translations where app_user_id=new.id; end if;
  return new;
end $$;
create trigger clear_display_translations_on_account_disable after update of status on public.app_users
for each row when(old.status is distinct from new.status) execute function public.clear_display_translations_for_inactive_user();

revoke all on function public.read_display_translation(uuid,text,text,text),public.save_display_translation(uuid,text,text,text,text),public.reserve_display_translation_request(uuid,text,integer),public.check_display_translation_budget(uuid,text,integer),public.clear_display_translations_for_inactive_user() from public,anon,authenticated;
grant execute on function public.read_display_translation(uuid,text,text,text),public.save_display_translation(uuid,text,text,text,text),public.reserve_display_translation_request(uuid,text,integer) to service_role;
