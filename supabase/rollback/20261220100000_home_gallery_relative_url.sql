-- Restore only the changed predicate; retain all other function details, owner and ACL.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  target regprocedure := 'public.read_public_home_gallery_photos(public.content_locale,integer,integer)'::regprocedure;
  definition text := pg_catalog.pg_get_functiondef(target);
  old_predicate text := $old$i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'$old$;
  new_predicate text := $new$(i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'
            or public.home_gallery_public_content_asset(i.value->'attrs'->>'src'))$new$;
begin
  if (length(definition) - length(replace(definition, new_predicate, ''))) / length(new_predicate) <> 1 then
    raise exception 'HOME_GALLERY_RELATIVE_URL_ROLLBACK_SHAPE: expected exactly one public asset predicate';
  end if;
  execute replace(definition, new_predicate, old_predicate);
end
$patch$;
drop function public.home_gallery_public_content_asset(text);
notify pgrst, 'reload schema';
commit;
