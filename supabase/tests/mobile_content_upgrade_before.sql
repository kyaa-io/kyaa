do $$ begin
  if to_regclass('public.fan_clips') is not null then raise exception 'fan clips unexpectedly exist before upgrade'; end if;
  if to_regprocedure('public.submit_owned_certification(uuid,uuid,uuid,jsonb,text,uuid)') is null then raise exception 'certification baseline missing'; end if;
  if to_regprocedure('public.read_fan_post_comments(uuid,uuid,timestamp with time zone,uuid,integer,public.content_locale)') is null then raise exception 'fan comment baseline missing'; end if;
end $$;
