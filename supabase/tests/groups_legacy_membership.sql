\set ON_ERROR_STOP on
begin;
do $$
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();creator uuid:=gen_random_uuid();page uuid:=gen_random_uuid();post uuid;r jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email)values(actor,'did:privy:group-legacy-'||actor,actor||'@example.test'),(other,'did:privy:group-legacy-'||other,other||'@example.test');
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(creator,'group-legacy-fixture','published','/fixture.webp',now(),'{creator}','creator');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(creator,'ko','Legacy fixture','소개','사진');
 -- A creator not yet represented by a group keeps the original content policy.
 perform public.save_fan_post(actor,'group-legacy-fixture',null,'Legacy public post','public','{}',null,gen_random_uuid());
 begin perform public.save_fan_post(actor,'group-legacy-fixture',null,'Legacy private post','members','{}',null,gen_random_uuid());raise exception 'unverified private write';exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN'then raise;end if;end;
 begin perform public.save_fan_post(null,'group-legacy-fixture',null,'Guest public post','public','{}',null,gen_random_uuid());raise exception 'guest posted';exception when others then if sqlerrm<>'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED'then raise;end if;end;
 insert into public.group_pages(id,kind,celebrity_id,name)values(page,'fan',creator,'Legacy fan');
 perform public.groups_dispatch('join',actor,page,null,jsonb_build_object('requestId',gen_random_uuid()));
 if public.fan_web_is_member(actor,creator)or not public.fan_web_is_page_member(actor,creator)then raise exception 'joining changed certification eligibility';end if;
 r:=public.save_fan_post(actor,'group-legacy-fixture',null,'Members-only existing board','members','{}',null,gen_random_uuid());post:=(r->>'id')::uuid;
 if public.read_fan_post(actor,post,'ko')is null then raise exception 'joined unverified member cannot read existing board';end if;
 begin perform public.save_fan_post(other,'group-legacy-fixture',null,'Unjoined public write','public','{}',null,gen_random_uuid());raise exception 'unjoined posted';exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN'then raise;end if;end;
 perform public.post_fan_post_comment(actor,post,null,'Member comment',gen_random_uuid());
 perform public.groups_dispatch('join',other,page,null,jsonb_build_object('requestId',gen_random_uuid()));
 perform public.groups_content_dispatch('set-notifications',actor,page,null,jsonb_build_object('enabled',false));
 r:=public.post_fan_post_comment(other,post,null,'Muted legacy comment',gen_random_uuid());
 if exists(select 1 from public.fan_web_notification_intents where recipient_app_user_id=actor and target_type='fan_post_comment')then raise exception 'legacy board ignored page mute';end if;
 perform public.groups_dispatch('leave',actor,page);
 if public.read_fan_post(actor,post,'ko')is not null then raise exception 'former member read existing private post';end if;
 begin perform public.post_fan_post_comment(actor,post,null,'Former member comment',gen_random_uuid());raise exception 'former member commented';exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN'then raise;end if;end;
end $$;
rollback;
