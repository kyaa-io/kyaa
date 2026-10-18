do $$ begin
  if to_regclass('public.fan_clips') is null or to_regclass('public.fan_clip_comments') is null or to_regclass('public.mobile_content_comment_reactions') is null then raise exception 'mobile content tables missing'; end if;
  if to_regclass('public.mobile_content_clip_reward_policies')is null or to_regclass('public.mobile_content_clip_reward_awards')is null or to_regprocedure('public.create_admin_mobile_content_clip_reward_policy(uuid,uuid,uuid,text,integer,text,uuid)')is null then raise exception'mobile clip reward policy missing';end if;
  if to_regprocedure('public.submit_owned_certification_with_media(uuid,uuid,uuid,jsonb,text,uuid)') is null then raise exception 'mobile certification bridge missing'; end if;
  if to_regprocedure('public.read_mobile_content_fan_clips(uuid,text,timestamp with time zone,uuid,integer,public.content_locale)') is null then raise exception 'clip feed RPC missing'; end if;
  if not exists(select 1 from pg_constraint where conname='content_reports_target_type_check'and pg_get_constraintdef(oid)like'%fan_clip_comment%')then raise exception'content report targets not upgraded';end if;
end $$;
