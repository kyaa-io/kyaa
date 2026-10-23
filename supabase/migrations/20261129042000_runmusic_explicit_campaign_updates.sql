-- Production PostgREST enables safeupdate; target the locked campaign explicitly.
create or replace function public.runmusic_publish_locked() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;rid uuid;owner_id uuid;notifications integer:=0;purged integer;
begin
 select * into c from public.runmusic_campaign for update;
 if clock_timestamp()<c.results_at then raise exception 'RUNMUSIC_CLOSED';end if;
 if c.draw_id is null then
  -- The same advisory lock used by deletion protects the active-account snapshot.
  for owner_id in select app_user_id from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) s order by app_user_id loop
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||owner_id::text,0));
  end loop;
  rid:=extensions.gen_random_uuid();
  update public.runmusic_campaign set draw_id=rid,draw_request_key=extensions.gen_random_uuid(),
    draw_seed=encode(extensions.gen_random_bytes(32),'hex'),drawn_at=clock_timestamp() where slug=c.slug returning * into c;
  with candidates as(
   select s.app_user_id from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) s
   join public.app_users u on u.id=s.app_user_id and u.status='active'
   where not exists(select 1 from public.app_user_moderation_restrictions r where r.app_user_id=u.id and r.revoked_at is null)
  ),ranked as(
   select app_user_id,row_number()over(order by extensions.digest(c.draw_seed||app_user_id::text,'sha256'),app_user_id)::integer ranking from candidates
  ) insert into public.runmusic_draw_entries(draw_id,app_user_id,weight,mission_snapshot,rank,winner,receipt_id,prize_code)
   select rid,app_user_id,1,'[]'::jsonb,ranking,ranking<=165,
    case when ranking<=165 then extensions.gen_random_uuid() end,
    case when ranking<=15 then 'andong_yogurt_1l' when ranking<=165 then 'starbucks_10000' end from ranked;
 end if;
 if not c.results_published then
  update public.runmusic_campaign set results_published=true where slug=c.slug;
  notifications:=public.enqueue_runmusic_results(c.draw_id);
 end if;
 purged:=public.purge_due_runmusic_contacts();
 return jsonb_build_object('published',true,'drawId',c.draw_id,'notificationCount',notifications,'purgedCount',purged);
end $$;
create or replace function public.admin_runmusic_v2(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,
 p_correlation_id uuid,p_action text default 'read',p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.runmusic_campaign%rowtype;target_id uuid;received timestamptz;replayed boolean;secret text;result jsonb;
begin
 select * into c from public.runmusic_campaign for update;
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,p_action<>'read');
 if p_action='settings' then
  if (p_input-'expectedRevision'-'published'-'autoPublishEnabled')<>'{}'::jsonb then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
  if (p_input->>'expectedRevision')::integer is distinct from c.revision then raise exception 'RUNMUSIC_CONFLICT';end if;
  update public.runmusic_campaign set revision=revision+1,published=coalesce((p_input->>'published')::boolean,published),
    auto_publish_enabled=coalesce((p_input->>'autoPublishEnabled')::boolean,auto_publish_enabled) where slug=c.slug;
 elsif p_action='draw' then
  if not c.published then raise exception 'RUNMUSIC_CLOSED';end if;
  perform public.runmusic_publish_locked();
 elsif p_action in('receive','contact') then
  if p_action='receive' then
   if not c.results_published then raise exception 'RUNMUSIC_CLOSED';end if;
   select app_user_id into target_id from public.runmusic_draw_entries where draw_id=c.draw_id and winner and receipt_id=(p_input->>'receiptId')::uuid;
  else target_id:=(p_input->>'appUserId')::uuid;end if;
  if target_id is null then raise exception 'RUNMUSIC_NOT_FOUND';end if;
  perform public.fan_web_lock_active_user(target_id);
  if p_action='receive' then
   select received_at into received from public.runmusic_draw_entries where draw_id=c.draw_id and app_user_id=target_id and winner for update;
   replayed:=received is not null;
   if not replayed then
    received:=clock_timestamp();
    update public.runmusic_draw_entries set received_at=received,received_by=p_actor_admin_allowlist_id where draw_id=c.draw_id and app_user_id=target_id;
   end if;
   result:=jsonb_build_object('receivedAt',received,'replayed',replayed);
  else
   perform public.purge_due_runmusic_contacts();
   select ciphertext into secret from public.runmusic_contacts where app_user_id=target_id;
   if secret is null then raise exception 'RUNMUSIC_NOT_FOUND';end if;
   result:=jsonb_build_object('appUserId',target_id,'ciphertext',secret);
  end if;
 elsif p_action<>'read' or p_action is null then raise exception 'RUNMUSIC_INVALID_REQUEST';end if;
 if p_action<>'read' then
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)
   values(p_actor_app_user_id,p_actor_admin_allowlist_id,'runmusic.'||p_action,'runmusic_campaign','runmusic-2026',p_correlation_id,
    jsonb_build_object('operation',p_action,'appUserId',target_id,'drawId',(select draw_id from public.runmusic_campaign)));
 end if;
 if result is not null then return result;end if;
 select * into c from public.runmusic_campaign;
 return jsonb_build_object('campaign',public.runmusic_campaign_json_v2(),'revision',c.revision,
  'participantCount',(select count(*) from (select app_user_id from public.runmusic_registrations union select app_user_id from public.runmusic_missions) p),
  'drawId',c.draw_id,'winnerCount',(select count(*) from public.runmusic_draw_entries where draw_id=c.draw_id and winner),
  'receivedCount',(select count(*) from public.runmusic_draw_entries where draw_id=c.draw_id and received_at is not null),
  'autoPublishEnabled',c.auto_publish_enabled,'winners',coalesce((select jsonb_agg(jsonb_build_object(
   'appUserId',e.app_user_id,'prizeCode',e.prize_code,'receiptId',e.receipt_id,'receivedAt',e.received_at,
   'contactSaved',x.app_user_id is not null,'contactMasked',x.masked)order by e.rank)
   from public.runmusic_draw_entries e left join public.runmusic_contacts x using(app_user_id)
   where e.draw_id=c.draw_id and e.winner),'[]'::jsonb),
  'delivery',public.runmusic_delivery_stats(c.draw_id));
end $$;
