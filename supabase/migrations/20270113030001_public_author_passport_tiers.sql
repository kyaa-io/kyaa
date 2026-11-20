begin;

-- Service-only projection for references from an already authorized read.
create function public.read_public_author_passport_tiers(
  p_post_ids uuid[], p_comment_ids uuid[], p_profile_ids uuid[], p_slug text
) returns table(kind text, id uuid, tier text)
language sql stable security definer set search_path = '' as $$
  with targets as materialized (
    select 'post' kind, p.id, p.app_user_id, p.celebrity_id
    from public.fan_posts p where p.id = any(p_post_ids)
    union all
    select 'comment', c.id, c.app_user_id, p.celebrity_id
    from public.fan_post_comments c join public.fan_posts p on p.id = c.post_id
    where c.id = any(p_comment_ids)
    union all
    select 'profile', ids.id, ids.id, c.id
    from unnest(p_profile_ids) ids(id)
    join public.celebrities c on c.slug = p_slug
  ), authors as (
    select distinct app_user_id, celebrity_id from targets
  ), tiers as materialized (
    select a.app_user_id, a.celebrity_id,
      public.get_fan_effective_tier(a.app_user_id, a.celebrity_id) tier
    from authors a
    join public.fan_passports p using (app_user_id, celebrity_id)
    where p.business_status = 'issued'
  )
  select t.kind, t.id, r.tier
  from targets t join tiers r using (app_user_id, celebrity_id)
  where r.tier is not null;
$$;

revoke all on function public.read_public_author_passport_tiers(uuid[], uuid[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.read_public_author_passport_tiers(uuid[], uuid[], uuid[], text)
  to service_role;

-- The current fan-page ranking and true-fan list already read tiers in their
-- SQL projections. Apply the same issued-passport requirement to those reads.
create function public.issued_fan_passport_tier(p_user uuid, p_creator uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.get_fan_effective_tier(p_user, p_creator)
  from public.fan_passports p
  where p.app_user_id = p_user and p.celebrity_id = p_creator
    and p.business_status = 'issued';
$$;

revoke all on function public.issued_fan_passport_tier(uuid, uuid)
  from public, anon, authenticated, service_role;

do $patch$
declare
  reader regprocedure;
  definition text;
  source_table regclass;
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'Untrusted author tier owner: %', current_user;
  end if;

  -- Managed PostgreSQL can apply migrations as an ordinary table owner.
  -- Forced RLS still needs a SELECT policy for that trusted definer.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    foreach source_table in array array[
      'public.fan_posts'::regclass, 'public.fan_post_comments'::regclass,
      'public.fan_passports'::regclass, 'public.celebrities'::regclass
    ] loop
      if exists (select 1 from pg_class where oid = source_table and relrowsecurity
        and (relforcerowsecurity or pg_get_userbyid(relowner) <> current_user)) then
        execute format('create policy public_author_tier_reader on %s for select to %I using (true)', source_table, current_user);
      end if;
    end loop;
  end if;

  foreach reader in array array[
    'public.read_group_fans(uuid,uuid,text,text,jsonb,integer,public.content_locale)'::regprocedure,
    'public.read_group_people(uuid,uuid,text,text,uuid,integer,public.content_locale)'::regprocedure,
    'public.read_group_public_people_hearts(uuid,uuid,integer,integer,public.content_locale)'::regprocedure
  ] loop
    definition := pg_get_functiondef(reader);
    if position('public.get_fan_effective_tier(' in definition) = 0 then
      raise exception 'Missing tier projection in %', reader;
    end if;
    execute replace(definition, 'public.get_fan_effective_tier(', 'public.issued_fan_passport_tier(');
  end loop;

  definition := pg_get_functiondef('public.group_public_directory_owner_functions()'::regprocedure);
  if position('public.get_fan_effective_tier(uuid,uuid)' in definition) = 0 then
    raise exception 'Missing group directory tier grant';
  end if;
  execute replace(definition, '''public.get_fan_effective_tier(uuid,uuid)''',
    '''public.get_fan_effective_tier(uuid,uuid)'',''public.issued_fan_passport_tier(uuid,uuid)''');
end $patch$;

select public.group_public_directory_owner_access();
select public.group_public_directory_owner_check();

notify pgrst, 'reload schema';
commit;
