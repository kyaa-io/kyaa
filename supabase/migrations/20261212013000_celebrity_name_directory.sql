-- [11] Name dictionary behind the fan page application's autocomplete.
-- Every row is CC0: Wikidata structured data, and MusicBrainz core artist data (names and aliases). The check below refuses
-- anything else, including MusicBrainz supplementary data (tags, ratings, annotations), which is CC BY-NC-SA.
-- Rows arrive through scripts/celebrity-names/, not through this file. An empty dictionary still suggests published fan pages,
-- and typing a name that is not listed stays allowed. A pick stores only the typed name, so nothing depends on these rows.
-- RLS is enabled without FORCE so the owner role reads through the definer function whatever its bypass setting is;
-- all client roles and service_role are revoked.
begin;
set local lock_timeout='5s';
create function public.celebrity_name_key(p_name text)returns text language sql immutable strict parallel safe set search_path=''as $$
 select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.normalize(p_name,'NFKC')),'[[:space:][:punct:]·・]+','','g')
$$;
create table public.celebrity_name_entries(
 id uuid primary key default extensions.gen_random_uuid(),
 source text not null check(source in('wikidata','musicbrainz')),
 source_id text not null check(length(source_id) between 1 and 64),
 name_ko text check(length(btrim(name_ko)) between 1 and 120),
 name_en text check(length(btrim(name_en)) between 1 and 120),
 name_other text check(length(btrim(name_other)) between 1 and 120),
 category text check(category in('idol','singer','actor','creator')),
 popularity integer not null default 0 check(popularity>=0),
 license text not null default 'CC0-1.0' check(license='CC0-1.0'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(source,source_id),
 check(coalesce(name_ko,name_en,name_other) is not null)
);
create table public.celebrity_name_terms(
 entry_id uuid not null references public.celebrity_name_entries(id) on delete cascade,
 term_key text not null check(length(term_key) between 1 and 120),
 primary key(entry_id,term_key)
);
create index celebrity_name_terms_prefix on public.celebrity_name_terms((term_key collate "C"),entry_id);
alter table public.celebrity_name_entries enable row level security;
alter table public.celebrity_name_terms enable row level security;
revoke all on public.celebrity_name_entries,public.celebrity_name_terms from public,anon,authenticated,service_role;
create function public.celebrity_name_suggest(p_query text,p_limit integer default 8,p_locale text default 'ko')returns jsonb language plpgsql stable security definer set search_path=''as $$
declare k text:=public.celebrity_name_key(p_query);lim integer:=least(greatest(coalesce(p_limit,8),1),20);
begin
 if k is null or k=''then return jsonb_build_object('items','[]'::jsonb);end if;
 return jsonb_build_object('items',coalesce((
  with fan_pages as(
   select c.slug,
    (select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by(l.locale::text=p_locale)desc,(l.locale::text='ko')desc,l.locale::text limit 1)shown,
    (select l.name from public.celebrity_localizations l where l.celebrity_id=c.id order by(l.locale::text=case when p_locale='ko'then'en'else'ko'end)desc,l.locale::text limit 1)other,
    (select coalesce(array_agg(public.celebrity_name_key(l.name)),'{}') from public.celebrity_localizations l where l.celebrity_id=c.id)name_keys
   from public.celebrities c join public.group_pages g on g.celebrity_id=c.id and g.kind='fan'
   where c.status='published' and c.archived_at is null and public.group_scope_visible(null,g.id)
  ),matched_pages as(
   select p.* from fan_pages p where exists(select 1 from unnest(p.name_keys)n where starts_with(n,k))
  ),candidates as(
   select e.*,
    case when p_locale='ko'then coalesce(e.name_ko,e.name_en,e.name_other)else coalesce(e.name_en,e.name_ko,e.name_other)end shown,
    case when p_locale='ko'then case when e.name_ko is not null then e.name_en end else case when e.name_en is not null then e.name_ko end end other,
    exists(select 1 from public.celebrity_name_terms x where x.entry_id=e.id and x.term_key=k)exact
   from public.celebrity_name_entries e
   where e.id in(select t.entry_id from public.celebrity_name_terms t where(t.term_key collate "C")>=(k collate "C") and(t.term_key collate "C")<((k||chr(1114111))collate "C"))
  ),listed as(
   select distinct on(public.celebrity_name_key(c.shown),c.category)c.shown,c.other,c.category,c.exact,c.popularity
   from candidates c
   where not exists(select 1 from fan_pages p where public.celebrity_name_key(c.shown)=any(p.name_keys))
   order by public.celebrity_name_key(c.shown),c.category,c.exact desc,c.popularity desc
  ),merged as(
   select m.shown name,nullif(m.other,m.shown)secondary,null::text category,m.slug,0 tier,true exact,0 popularity from matched_pages m where m.shown is not null
   union all
   select l.shown,nullif(l.other,l.shown),l.category,null,1,l.exact,l.popularity from listed l
  )
  select jsonb_agg(jsonb_build_object('name',x.name,'secondaryName',x.secondary,'category',x.category,'page',case when x.slug is not null then jsonb_build_object('slug',x.slug)end)order by x.tier,x.exact desc,x.popularity desc,x.name)
  from(select * from merged order by tier,exact desc,popularity desc,name limit lim)x
 ),'[]'::jsonb));
end $$;
revoke all on function public.celebrity_name_key(text)from public,anon,authenticated,service_role;
revoke all on function public.celebrity_name_suggest(text,integer,text)from public,anon,authenticated;
grant execute on function public.celebrity_name_suggest(text,integer,text)to service_role;
commit;
