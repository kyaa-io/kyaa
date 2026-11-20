begin;
alter table public.telegram_cs_alert_outbox drop constraint telegram_cs_alert_outbox_kind_check;
alter table public.telegram_cs_alert_outbox add constraint telegram_cs_alert_outbox_kind_check
  check (kind in ('cs_inquiry_created','cs_user_replied','page_application'));

create function public.capture_telegram_page_application() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.telegram_cs_alert_outbox(kind,source_id,activation_id,chat_id,occurred_at)
    select 'page_application',new.id,activation_id,chat_id,new.created_at
    from public.telegram_cs_alert_settings where singleton and enabled and new.created_at >= activated_at
    on conflict(kind,source_id) do nothing;
  return new;
end $$;
revoke all on function public.capture_telegram_page_application() from public,anon,authenticated,service_role;
create trigger page_application_cs_alert after insert on public.group_applications
  for each row execute function public.capture_telegram_page_application();

create or replace function public.claim_telegram_cs_alert_batch(p_chat_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.telegram_cs_alert_settings; token uuid:=gen_random_uuid(); result jsonb; t timestamptz:=clock_timestamp();
begin
  perform public.maintain_telegram_cs_alerts();
  select * into cfg from public.telegram_cs_alert_settings where singleton for update;
  if not cfg.enabled or cfg.chat_id is distinct from p_chat_id or cfg.next_send_at>t
    or (cfg.lease_expires_at is not null and cfg.lease_expires_at>t) then return null; end if;
  with candidates as (
    select id from public.telegram_cs_alert_outbox where status='pending' and available_at<=t
      and activation_id=cfg.activation_id and chat_id=cfg.chat_id and attempt_count<3
      order by created_at,id for update skip locked limit 5
  ), claimed as (
    update public.telegram_cs_alert_outbox o set status='claimed',batch_id=token,lease_expires_at=t+interval '60 seconds'
      from candidates c where o.id=c.id returning o.*
  ) select jsonb_build_object('batch_id',token,'alerts',jsonb_agg(jsonb_build_object(
      'kind',c.kind,'creator_name',c.creator_name,'live_title',c.live_title,
      'winner_count',c.winner_count,'occurred_at',c.occurred_at,
      'actor_name',p.nickname,'actor_email',null,'inquiry_id',m.inquiry_id,'message_body',m.body,'application',case when a.id is not null then jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind) end
    ) order by c.created_at,c.id)) into result
    from claimed c
    left join public.cs_messages m on c.kind <> 'page_application' and m.id=c.source_id
    left join public.group_applications a on c.kind='page_application' and a.id=c.source_id
    left join public.user_profiles p on p.app_user_id=a.applicant_id
    having count(*)>0;
  if result is null then return null; end if;
  update public.telegram_cs_alert_settings set batch_id=token,lease_expires_at=t+interval '60 seconds' where singleton;
  return result;
end $$;

-- Enrich only the existing administrator branch after its permission check.
do $$
declare
  definition text := pg_get_functiondef('public.groups_content_dispatch_before_group_categories(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
  original text := 'when p_operation=''admin-applications'' then to_jsonb(x)';
begin
  if strpos(definition,original)=0 then raise exception 'Missing admin applications query'; end if;
  execute replace(definition,original,original || $query$ || jsonb_build_object('applicant',(
    select jsonb_build_object('id',u.id,'nickname',nullif(trim(p.nickname),''),'joinedAt',u.created_at)
    from public.app_users u left join public.user_profiles p on p.app_user_id=u.id where u.id=x.applicant_id
  ))$query$);
end $$;
commit;
