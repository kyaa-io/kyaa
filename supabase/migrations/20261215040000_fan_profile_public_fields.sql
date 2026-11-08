begin;
-- Fan profile public fields (feedback C2). A fan may name one favorite creator, add one SNS link and a one-line intro.
-- All three start empty and appear to other fans only after the fan writes them. Amounts paid, payments and e-mail stay out.
-- Other fans read them only through read_social_profile_card and read_group_people, which skip blocked, sanctioned and inactive accounts.
-- Order: this migration first, then the web. The deployed web calls none of the new functions, and read_group_people only gains keys its schema drops.
create or replace function public.fan_profile_links_valid(p_links text[])
returns boolean language sql immutable set search_path='' as $$
 select coalesce(bool_and(char_length(x)<=300 and x ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(/[^[:space:]]*)?$'),true) from unnest(p_links)x
$$;
create table if not exists public.fan_profile_public_fields(
 app_user_id uuid primary key references public.app_users(id) on delete cascade,
 favorite_celebrity_id uuid references public.celebrities(id) on delete set null,
 sns_links text[] not null default '{}' check(cardinality(sns_links)<=3 and public.fan_profile_links_valid(sns_links)),
 bio text check(bio is null or(char_length(bio) between 1 and 40 and bio=btrim(bio) and bio !~ '[[:cntrl:]]')),
 updated_at timestamptz not null default now()
);
alter table public.fan_profile_public_fields enable row level security;
revoke all on table public.fan_profile_public_fields from public,anon,authenticated;
grant all on table public.fan_profile_public_fields to service_role;

-- Creators a fan can pick: the ones whose fan page they joined or whose passport they hold. Published and not archived only.
create or replace function public.fan_profile_favorite_options(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'name',coalesce(l.name,c.slug))order by coalesce(l.name,c.slug),c.slug),'[]'::jsonb)
 from public.celebrities c left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
 where c.status='published' and c.archived_at is null and(
  exists(select 1 from public.group_memberships m join public.group_pages g on g.id=m.page_id and g.status='published' and g.kind='fan' where m.app_user_id=p_app_user_id and g.celebrity_id=c.id)
  or exists(select 1 from public.fan_passports p where p.app_user_id=p_app_user_id and p.celebrity_id=c.id and p.business_status='issued'))
$$;

create or replace function public.fan_profile_favorite_json(p_celebrity_id uuid,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('slug',c.slug,'name',coalesce(l.name,c.slug))
 from public.celebrities c left join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
 where c.id=p_celebrity_id and c.status='published' and c.archived_at is null
$$;

create or replace function public.read_owned_fan_profile_public(p_app_user_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.fan_profile_public_fields;
begin
 if p_app_user_id is null or not exists(select 1 from public.app_users where id=p_app_user_id and status='active')then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501';end if;
 select * into f from public.fan_profile_public_fields where app_user_id=p_app_user_id;
 return jsonb_build_object('favorite',public.fan_profile_favorite_json(f.favorite_celebrity_id,p_locale),'links',to_jsonb(coalesce(f.sns_links,'{}')),'bio',f.bio,
  'favoriteOptions',public.fan_profile_favorite_options(p_app_user_id,p_locale));
end $$;

create or replace function public.set_owned_fan_profile_public(p_app_user_id uuid,p_favorite_slug text,p_links text[],p_bio text,p_locale public.content_locale)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_favorite uuid;v_links text[]:=coalesce((select array_agg(btrim(x) order by o) from unnest(coalesce(p_links,'{}'))with ordinality t(x,o) where btrim(x)<>''),'{}');v_bio text:=nullif(btrim(coalesce(p_bio,'')),'');
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_favorite_slug is not null then
  select c.id into v_favorite from public.celebrities c where c.slug=p_favorite_slug;
  if v_favorite is null or not exists(select 1 from jsonb_array_elements(public.fan_profile_favorite_options(p_app_user_id,'ko'))o where o->>'slug'=p_favorite_slug)then raise exception 'PROFILE_INVALID_REQUEST' using errcode='22023';end if;
 end if;
 if cardinality(v_links)>3 or not public.fan_profile_links_valid(v_links) or(select count(distinct lower(x))from unnest(v_links)x)<>cardinality(v_links)then raise exception 'PROFILE_INVALID_REQUEST' using errcode='22023';end if;
 if v_bio is not null and(char_length(v_bio)>40 or v_bio ~ '[[:cntrl:]]')then raise exception 'PROFILE_INVALID_REQUEST' using errcode='22023';end if;
 if public.ugc_body_rejected(v_bio) or public.ugc_body_rejected(array_to_string(v_links,' ')) then raise exception 'CONTENT_REJECTED' using errcode='22023';end if;
 insert into public.fan_profile_public_fields(app_user_id,favorite_celebrity_id,sns_links,bio,updated_at)values(p_app_user_id,v_favorite,v_links,v_bio,now())
 on conflict(app_user_id)do update set favorite_celebrity_id=excluded.favorite_celebrity_id,sns_links=excluded.sns_links,bio=excluded.bio,updated_at=excluded.updated_at;
 return public.read_owned_fan_profile_public(p_app_user_id,p_locale);
end $$;

-- What another signed-in fan sees in the profile card. Null when the profile is closed: blocked either way, sanctioned or inactive look the same.
-- Numbers belong to one creator: the page the card was opened from when both are its members, else the fan's chosen favorite.
-- Anonymous pages show no numbers. Points are the fan score the page ranking uses, not wallet balances or amounts paid.
create or replace function public.read_social_profile_card(p_actor uuid,p_profile_id uuid,p_page_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.fan_profile_public_fields;g public.group_pages;v_scope uuid;v_hidden boolean:=false;
begin
 if p_actor is null or p_profile_id is null or p_locale is null then raise exception 'SOCIAL_FORBIDDEN';end if;
 if not exists(select 1 from public.app_users where id=p_actor and status='active')or not public.social_profile_is_public(p_actor)then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.app_users where id=p_profile_id and status='active')then return null;end if;
 if p_actor<>p_profile_id and(public.fan_web_blocked(p_actor,p_profile_id)or not public.social_profile_is_public(p_profile_id))then return null;end if;
 select * into f from public.fan_profile_public_fields where app_user_id=p_profile_id;
 if p_page_id is not null then
  select * into g from public.group_pages where id=p_page_id and status='published';
  if found and public.group_scope_visible(p_actor,g.id)
   and exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=p_actor)
   and exists(select 1 from public.group_memberships where page_id=g.id and app_user_id=p_profile_id)then
   v_hidden:=g.anonymous;
   if g.kind='fan' then v_scope:=g.celebrity_id;end if;
  end if;
 end if;
 if v_scope is null and not v_hidden then v_scope:=(select c.id from public.celebrities c where c.id=f.favorite_celebrity_id and c.status='published' and c.archived_at is null);end if;
 return jsonb_build_object(
  'favorite',case when v_hidden then null else public.fan_profile_favorite_json(f.favorite_celebrity_id,p_locale)end,
  'links',case when v_hidden then '[]'::jsonb else to_jsonb(coalesce(f.sns_links,'{}'))end,
  'bio',case when v_hidden then null else f.bio end,
  'stats',case when v_hidden or v_scope is null then null else jsonb_build_object(
   'creator',public.fan_profile_favorite_json(v_scope,p_locale),
   'tier',public.get_fan_effective_tier(p_profile_id,v_scope),
   'points',coalesce((select sum(s.points)from public.fan_score_ledger s where s.app_user_id=p_profile_id and s.celebrity_id=v_scope),0)::integer,
   'stamps',(select count(*)from public.community_stamps s where s.app_user_id=p_profile_id and s.celebrity_id=v_scope and s.revoked_at is null)::integer,
   'hearts',public.passport_hearts(p_profile_id,v_scope))end);
end $$;

-- Fan list rows gain the same public numbers for the page's creator and the fan's chosen favorite name. Anonymous pages stay without them.
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure);
 if position('''stamps''' in def)>0 then return;end if;
 anchor:=$a$'hearts',case when g.kind='fan' and not g.anonymous then public.passport_hearts(app_user_id,g.celebrity_id) end$a$;
 if position(anchor in def)=0 then raise exception 'FAN_PROFILE_PUBLIC_UNPATCHED: member row';end if;
 execute replace(def,anchor,anchor||$a$,'stamps',case when g.kind='fan' and not g.anonymous then(select count(*)from public.community_stamps s where s.app_user_id=shown.app_user_id and s.celebrity_id=g.celebrity_id and s.revoked_at is null)::integer end,'fanPoints',case when g.kind='fan' and not g.anonymous then coalesce((select sum(s.points)from public.fan_score_ledger s where s.app_user_id=shown.app_user_id and s.celebrity_id=g.celebrity_id),0)::integer end,'favorite',case when not g.anonymous then(select public.fan_profile_favorite_json(x.favorite_celebrity_id,p_locale)from public.fan_profile_public_fields x where x.app_user_id=shown.app_user_id)end$a$);
end $patch$;

revoke all on function public.fan_profile_links_valid(text[]) from public,anon,authenticated;
revoke all on function public.fan_profile_favorite_options(uuid,public.content_locale),public.fan_profile_favorite_json(uuid,public.content_locale),
 public.read_owned_fan_profile_public(uuid,public.content_locale),public.set_owned_fan_profile_public(uuid,text,text[],text,public.content_locale),
 public.read_social_profile_card(uuid,uuid,uuid,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_owned_fan_profile_public(uuid,public.content_locale),public.set_owned_fan_profile_public(uuid,text,text[],text,public.content_locale),
 public.read_social_profile_card(uuid,uuid,uuid,public.content_locale) to service_role;

-- Definers on AWS can have different owners (see 20261209150000). Give each caller's owner execute on the helpers it calls, and table access to the new table.
do $$declare target regprocedure;owner_name name;target_owner name;begin
 foreach target in array array[
  'public.fan_profile_favorite_options(uuid,public.content_locale)'::regprocedure,
  'public.fan_profile_favorite_json(uuid,public.content_locale)'::regprocedure,
  'public.read_owned_fan_profile_public(uuid,public.content_locale)'::regprocedure,
  'public.passport_hearts(uuid,uuid)'::regprocedure,
  'public.get_fan_effective_tier(uuid,uuid)'::regprocedure,
  'public.social_profile_is_public(uuid)'::regprocedure,
  'public.fan_web_blocked(uuid,uuid)'::regprocedure,
  'public.group_scope_visible(uuid,uuid)'::regprocedure,
  'public.ugc_body_rejected(text)'::regprocedure,
  'public.fan_web_lock_active_user(uuid)'::regprocedure
 ] loop
  select pg_get_userbyid(proowner) into target_owner from pg_proc where oid=target;
  for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p
   where p.pronamespace='public'::regnamespace and p.oid<>target and p.proname in('read_group_people','read_social_profile_card','read_owned_fan_profile_public','set_owned_fan_profile_public','fan_profile_favorite_options')
    and p.prosrc ~* ('\m'||(select proname from pg_proc where oid=target)||'\s*\(') loop
   if owner_name in('anon','authenticated','service_role')then raise exception 'Unexpected definer owner % for %',owner_name,target;end if;
   if owner_name<>target_owner then execute format('grant execute on function %s to %I',target,owner_name);end if;
  end loop;
 end loop;
 for owner_name in select distinct pg_get_userbyid(p.proowner) from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in('read_group_people','read_social_profile_card','read_owned_fan_profile_public','set_owned_fan_profile_public')
  and pg_get_userbyid(p.proowner)<>(select pg_get_userbyid(relowner) from pg_class where oid='public.fan_profile_public_fields'::regclass) loop
  execute format('grant select,insert,update on table public.fan_profile_public_fields to %I',owner_name);
 end loop;
end$$;
notify pgrst, 'reload schema';
commit;
