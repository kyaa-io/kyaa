begin;
-- Reuse the public opaque avatar projection while preserving function identities and grants.
do $patch$
declare target record; source text;
begin
 for target in select * from (values
 ('public.group_post_json(uuid)', $old$'/images/avatars/'||coalesce(a.selected_character_id,'star-pink')||'.webp'$old$, 'public.public_fan_avatar_url(p.author_id)'),
 ('public.groups_dispatch_before_content(text,uuid,uuid,uuid,jsonb,uuid)', $old$'/images/avatars/'||coalesce(av.selected_character_id,'star-pink')||'.webp'$old$, 'public.public_fan_avatar_url(m.app_user_id)'),
 ('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', $old$'/images/avatars/'||coalesce(av.selected_character_id,'star-pink')||'.webp'$old$, 'public.public_fan_avatar_url(b.app_user_id)')
 ) patches(signature,needle,replacement) loop
  source:=pg_get_functiondef(target.signature::regprocedure);
  if (length(source)-length(replace(source,target.needle,'')))/length(target.needle)<>1 then
   raise exception 'Expected one avatar projection in %',target.signature;
  end if;
  execute replace(source,target.needle,target.replacement);
 end loop;
end $patch$;
commit;
