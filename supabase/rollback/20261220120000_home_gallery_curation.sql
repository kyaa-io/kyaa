-- Rollback of 20261220120000_home_gallery_curation.sql. Run after the web rollback. Restores the two original clauses of the read and
-- drops the curation table: the curation rows are lost, the gallery goes back to newest first with every photo visible.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  target regprocedure := 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(target);
  old_agg text := $old$order by x.at desc, x.id), '[]'::jsonb) into v_rows$old$;
  new_agg text := $new$order by public.home_gallery_curation_rank(x.id), x.at desc, x.id), '[]'::jsonb) into v_rows$new$;
  old_page text := $old$) u order by u.at desc, u.id offset p_offset limit p_limit + 1) x;$old$;
  new_page text := $new$) u where not public.home_gallery_curation_hidden(u.id)
      order by public.home_gallery_curation_rank(u.id), u.at desc, u.id offset p_offset limit p_limit + 1) x;$new$;
begin
  if (length(definition) - length(replace(definition, new_agg, ''))) / length(new_agg) <> 1
     or (length(definition) - length(replace(definition, new_page, ''))) / length(new_page) <> 1 then
    raise exception 'HOME_GALLERY_CURATION_ROLLBACK_SHAPE: expected exactly one curated ordering and one curated page clause';
  end if;
  execute replace(replace(definition, new_agg, old_agg), new_page, old_page);
end
$patch$;
drop function public.home_gallery_curation_rank(text);
drop function public.home_gallery_curation_hidden(text);
-- Dropping the migration-owned table removes FORCE RLS, its owner SELECT policies
-- and all table grants together; dropping helpers removes their EXECUTE grants.
-- Reapplying the forward migration rediscovers owners and restores all three.
drop table public.home_gallery_curation;
notify pgrst, 'reload schema';
commit;
