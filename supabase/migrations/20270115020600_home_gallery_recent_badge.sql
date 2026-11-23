begin;
-- Opt in on the home read. Existing clients parse the original row shape strictly.
do $upgrade$
declare
  signature constant text := 'public.read_public_gallery_post_photos(public.content_locale,boolean,integer,integer,timestamptz,text,integer)';
  definition text := pg_get_functiondef(signature::regprocedure);
  header constant text := 'public.read_public_gallery_post_photos(p_locale ';
  projection constant text := '''item'', x.item,';
begin
  if strpos(definition, header) = 0 or strpos(definition, projection) = 0 then
    raise exception 'Unexpected gallery reader definition';
  end if;
  execute replace(replace(definition, header, 'public.read_public_gallery_post_photos(p_mark_recent boolean, p_locale '),
    projection, $expr$'item', x.item || case when p_mark_recent
      and x.at <= statement_timestamp() and x.at > statement_timestamp() - interval '48 hours'
      then '{"isNew":true}'::jsonb else '{}'::jsonb end,$expr$);
end
$upgrade$;
revoke all on function public.read_public_gallery_post_photos(boolean,public.content_locale,boolean,integer,integer,timestamptz,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_public_gallery_post_photos(boolean,public.content_locale,boolean,integer,integer,timestamptz,text,integer) to service_role;

create or replace function public.read_public_gallery_post_photos(
  p_locale public.content_locale, p_include_groups boolean, p_limit integer default 12,
  p_after_rank integer default null, p_after_at timestamptz default null, p_after_id text default null, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.read_public_gallery_post_photos(false,p_locale,p_include_groups,p_limit,p_after_rank,p_after_at,p_after_id,p_offset)
$$;
notify pgrst,'reload schema';
commit;
