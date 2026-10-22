begin;

-- Keep Stage's read-only aggregate predicates aligned with participant mission evaluation.
do $migration$
declare definition text:=pg_catalog.pg_get_functiondef('public.read_admin_wave_stage_presentation(uuid,uuid,text)'::regprocedure); anchor text;
begin
 anchor:=$old$join public.social_dm_conversations d on d.id=m.conversation_id and d.status='accepted'$old$;
 if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then raise exception 'WAVE_STAGE_MISSION_ANCHOR_1_CHANGED'; end if;
 definition:=replace(definition,anchor,$new$join public.social_dm_conversations d on d.id=m.conversation_id$new$);
 anchor:=$old$   where m.sender_id=cohort.app_user_id and cohort.app_user_id in(d.user_low_id,d.user_high_id)
    and m.created_at>=cohort.created_at$old$;
 if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then raise exception 'WAVE_STAGE_MISSION_ANCHOR_2_CHANGED'; end if;
 definition:=replace(definition,anchor,$new$   where m.sender_id=cohort.app_user_id and cohort.app_user_id in(d.user_low_id,d.user_high_id)
    and (d.status='accepted' or (d.status in('cancelled','rejected') and m.created_at>=f.accepted_at
     and not public.fan_web_blocked(d.user_low_id,d.user_high_id)))
    and m.created_at>=cohort.created_at$new$);
 anchor:=$old$    and length(btrim(p.body))>0 and p.created_at>=cohort.created_at
  ) then 'completed' else 'pending' end),$old$;
 if length(definition)-length(replace(definition,anchor,''))<>length(anchor) then raise exception 'WAVE_STAGE_MISSION_ANCHOR_3_CHANGED'; end if;
 definition:=replace(definition,anchor,$new$    and length(btrim(p.body))>0 and p.created_at>=cohort.created_at
  ) or exists(
   select 1 from public.fan_post_comments c join public.fan_posts p on p.id=c.post_id
   where c.app_user_id=cohort.app_user_id and c.created_at>=cohort.created_at
    and c.deleted_at is null and c.hidden_at is null and length(btrim(c.body))>0
    and p.celebrity_id=wave_id and p.program_notice_id=public.fan_program_notice('kyaa-wave-fanpage','live-insight')
    and p.visibility='public' and p.deleted_at is null and p.hidden_at is null
    and public.fan_web_content_visible(cohort.app_user_id,'fan_post_comment',c.id)
    and (c.parent_id is null or exists(select 1 from public.fan_post_comments parent
     where parent.id=c.parent_id and parent.post_id=c.post_id and parent.deleted_at is null and parent.hidden_at is null
      and public.fan_web_content_visible(cohort.app_user_id,'fan_post_comment',parent.id)))
  ) then 'completed' else 'pending' end),$new$);
 execute definition;
end $migration$;

commit;
