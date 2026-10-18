do $$ declare s jsonb; old jsonb; begin
 s:=public.mobile_get_owned_settings('92200000-0000-4000-8000-000000000901');
 select settings into old from public.notification_topics_upgrade_snapshot;
 if jsonb_set(s-'previews','{topics}',(s->'topics')-array['favoriteNews','social','activity','friendActivity']) is distinct from old then raise exception 'legacy settings changed during topic upgrade'; end if;
 if s#>>'{topics,social}' is distinct from 'true' or s#>>'{topics,friendActivity}' is distinct from 'true' or s#>>'{topics,favoriteNews}' is distinct from 'false' or s#>>'{topics,activity}' is distinct from 'false' then raise exception 'new topic projection invalid'; end if;
end $$;
drop table public.notification_topics_upgrade_snapshot;
