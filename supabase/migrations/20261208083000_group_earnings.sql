begin;
-- New read model only. Existing accounting functions, OIDs, ACLs and RLS stay intact.
create function public.group_earning_rows(p_actor uuid,p_page_id uuid)
returns table(entry_key text,occurred_at timestamptz,data jsonb)
language plpgsql stable security definer set search_path='' as $$
declare row record;creator uuid;begin
 if not exists(select 1 from public.app_users where id=p_actor and status='active')or not coalesce(public.group_scope_visible(p_actor,p_page_id),false)then raise exception 'GROUP_EARNINGS_NOT_FOUND';end if;
 select case when g.kind='fan'then g.celebrity_id end into creator from public.group_pages g where g.id=p_page_id;
 for row in
 with mission as (
  select 'mission'::text kind,s.id,'mission'::text activity_key,case when m.state='published'then m.title end title,
   case when s.status='pending'then 'pending'when s.status='rejected'then 'rejected'when m.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null then 'no_reward'else 'credited'end status,
   'fan_point'::text asset,case when s.status='completed'then s.reward_points::bigint end original_amount,null::bigint correction_amount,
   case when s.status='completed'then s.reward_points::bigint end net_amount,s.reason,s.created_at occurred_at,s.reviewed_at processed_at,
   case when m.state='published'then '/pages/groups/'||p_page_id||'/missions/'||m.id end href,
   case when s.status='completed'then (m.reward_points=0 and s.reward_points=0 and s.reward_ledger_id is null)or(s.reward_points>0 and l.id is not null and l.app_user_id=p_actor and l.celebrity_id is null and l.asset='fan_point'and l.amount=s.reward_points and l.source_type='group_mission'and l.source_id=s.id)
    else s.reward_points=0 and s.reward_ledger_id is null end valid
  from public.group_mission_submissions s join public.group_missions m on m.id=s.mission_id
  left join public.mobile_fan_economy_ledger l on l.id=s.reward_ledger_id where s.app_user_id=p_actor and m.page_id=p_page_id
 ),activity as (
  select 'activity'::text kind,r.id,r.action_key activity_key,null::text title,
   case when c.status='corrected'then 'corrected'when c.status='review'then 'correction_review'else 'credited'end status,
   'fan_point'::text asset,l.amount original_amount,cl.amount correction_amount,
   l.amount+coalesce(cl.amount,0) net_amount,c.reason,r.occurred_at,coalesce(c.created_at,l.created_at)processed_at,null::text href,
   coalesce(l.app_user_id=p_actor and l.celebrity_id=creator and l.asset='fan_point'and l.amount>0 and l.source_type='activity'and l.source_id=r.source_id and l.policy_id=r.policy_id
    and ep.id is not null and ep.celebrity_id=creator and ep.kind='earning'
    and(c.event_id is null or(c.app_user_id=p_actor and c.source_id=r.source_id and c.receipt_id=r.id and c.original_ledger_id=l.id and
      (c.policy_id is null or(cp.id is not null and cp.celebrity_id=creator and cp.kind='correction'and cp.version=c.policy_version))and
      case when c.status='corrected'then cl.id is not null and cl.app_user_id=p_actor and cl.celebrity_id=creator and cl.asset='fan_point'and cl.amount=-l.amount and cl.source_type='correction'and cl.source_id=c.event_id and cl.policy_id=c.policy_id and cp.id is not null and cp.celebrity_id=creator and cp.kind='correction'and cp.version=c.policy_version
      else c.correction_ledger_id is null end)),false) valid
  from public.mobile_fan_economy_activity_receipts r
  left join public.mobile_fan_economy_ledger l on l.id=r.point_ledger_id
  left join public.mobile_fan_economy_policies ep on ep.id=r.policy_id
  left join lateral(select x.* from public.mobile_fan_reward_corrections x where x.receipt_id=r.id order by(x.status='corrected')desc,x.created_at desc,x.event_id desc limit 1)c on true
  left join public.mobile_fan_economy_ledger cl on cl.id=c.correction_ledger_id
  left join public.mobile_fan_economy_policies cp on cp.id=c.policy_id
  where r.app_user_id=p_actor and r.celebrity_id=creator
 ),legacy as (
  select 'legacy_activity'::text kind,a.id,a.action_key activity_key,null::text title,'credited'::text status,
   case when a.ledger_id is not null then 'legacy_free_draw'else 'fan_point'end asset,
   coalesce(t.amount,l.amount) original_amount,null::bigint correction_amount,coalesce(t.amount,l.amount)net_amount,null::text reason,a.occurred_at,coalesce(t.created_at,l.created_at)processed_at,null::text href,
   case when a.ledger_id is not null then coalesce(t.app_user_id=p_actor and t.celebrity_id=creator and t.entry_kind='credit'and t.amount>0 and
      ((t.source_type='fan_activity_reward'and t.source_id=a.id)or(t.source_id=a.source_id and((a.action_key='verification'and t.source_type='passport_verification')or(a.action_key like 'membership_%'and t.source_type='manual_certification')))),false)
    else coalesce(l.app_user_id=p_actor and l.celebrity_id=creator and l.asset='fan_point'and l.amount>0 and l.source_type='activity'and l.source_id=a.source_id and ep.id is not null and ep.celebrity_id=creator and ep.kind='earning',false)end valid
  from public.fan_ticket_activity_awards a left join public.fan_ticket_ledger t on t.id=a.ledger_id
  left join public.mobile_fan_economy_ledger l on l.id=a.point_ledger_id left join public.mobile_fan_economy_policies ep on ep.id=l.policy_id
  where a.app_user_id=p_actor and a.celebrity_id=creator
   and not exists(select 1 from public.mobile_fan_economy_activity_receipts r where r.app_user_id=p_actor and r.celebrity_id=creator and r.action_key=a.action_key and r.scope_key=a.scope_key and r.source_id=a.source_id and r.point_ledger_id=a.point_ledger_id)
 ),raffle as (
  select 'raffle'::text kind,e.id,'raffle'::text activity_key,r.title,
   case when r.cancelled_at is not null then 'refunded'else 'entered'end status,'ticket'::text asset,
   -e.amount::bigint original_amount,f.amount correction_amount,-e.amount::bigint+coalesce(f.amount,0)net_amount,null::text reason,e.created_at occurred_at,coalesce(f.created_at,l.created_at)processed_at,
   '/pages/groups/'||p_page_id||'/raffles/'||r.id href,
   coalesce(l.app_user_id=p_actor and l.celebrity_id is null and l.entry_kind='debit'and l.amount=-e.amount and l.source_type='group_raffle_entry'and l.source_id=e.request_key
    and case when r.cancelled_at is not null then f.id is not null and f.entry_kind='credit'and f.amount=e.amount else f.id is null end,false)valid
  from public.group_raffle_entries e join public.group_raffles r on r.id=e.raffle_id
  left join public.fan_ticket_ledger l on l.id=e.ledger_id
  left join public.fan_ticket_ledger f on f.app_user_id=p_actor and f.celebrity_id is null and f.source_type='group_raffle_refund'and f.source_id=e.id
  where e.app_user_id=p_actor and r.page_id=p_page_id
 ) select * from mission union all select * from activity union all select * from legacy union all select * from raffle
 loop
  if row.valid is distinct from true or abs(row.original_amount::numeric)>9007199254740991 or abs(row.correction_amount::numeric)>9007199254740991 or abs(row.net_amount::numeric)>9007199254740991 then raise exception 'GROUP_EARNINGS_INCONSISTENT';end if;
  entry_key:=row.kind||':'||row.id;occurred_at:=row.occurred_at;
  data:=jsonb_build_object('entryKey',entry_key,'kind',row.kind,'activityKey',row.activity_key,'title',row.title,'status',row.status,'asset',row.asset,'originalAmount',row.original_amount,'correctionAmount',row.correction_amount,'netAmount',row.net_amount,'reason',row.reason,'occurredAt',row.occurred_at,'processedAt',row.processed_at,'activityHref',row.href);
  return next;
 end loop;
end $$;
create function public.read_owned_group_earnings(p_actor uuid,p_page_id uuid,p_limit integer default 30,p_cursor text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cursor_data jsonb;anchor_key text;anchor_time timestamptz;result jsonb;cursor_invalid boolean;begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'GROUP_EARNINGS_INVALID';end if;
 if p_cursor is not null then
  begin
   if length(p_cursor)>2048 then raise exception 'invalid';end if;
   cursor_data:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
   if jsonb_typeof(cursor_data)<>'object'or (select count(*)from jsonb_object_keys(cursor_data))<>4 or cursor_data->>'owner' is distinct from p_actor::text or cursor_data->>'page' is distinct from p_page_id::text then raise exception 'invalid';end if;
   anchor_key:=cursor_data->>'key';anchor_time:=(cursor_data->>'at')::timestamptz;
   if anchor_key is null or anchor_time is null then raise exception 'invalid';end if;
  exception when others then raise exception 'GROUP_EARNINGS_INVALID';end;
 end if;
 with all_rows as materialized(select *from public.group_earning_rows(p_actor,p_page_id)),
 selected as(select *from all_rows where anchor_key is null or(occurred_at,entry_key)<(anchor_time,anchor_key)order by occurred_at desc,entry_key desc limit p_limit+1),
 shown as(select *from selected order by occurred_at desc,entry_key desc limit p_limit)
 select jsonb_build_object('entries',coalesce((select jsonb_agg(data order by occurred_at desc,entry_key desc)from shown),'[]'::jsonb),'nextCursor',case when(select count(*)from selected)>p_limit then(select replace(encode(convert_to(jsonb_build_object('owner',p_actor,'page',p_page_id,'key',entry_key,'at',occurred_at)::text,'UTF8'),'base64'),E'\n','')from shown order by occurred_at,entry_key limit 1)end),
  case when anchor_key is not null and not exists(select 1 from all_rows where entry_key=anchor_key and occurred_at=anchor_time)then true else false end
 into result,cursor_invalid;
 if cursor_invalid then raise exception 'GROUP_EARNINGS_INVALID';end if;
 return result;
end $$;
create function public.read_owned_group_earning(p_actor uuid,p_page_id uuid,p_entry_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_entry_key is null or p_entry_key!~'^(mission|activity|legacy_activity|raffle):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then raise exception 'GROUP_EARNINGS_INVALID';end if;
 select jsonb_build_object('entry',data)into result from public.group_earning_rows(p_actor,p_page_id)where entry_key=p_entry_key;
 if result is null then raise exception 'GROUP_EARNINGS_NOT_FOUND';end if;return result;
end $$;
revoke all on function public.group_earning_rows(uuid,uuid),public.read_owned_group_earnings(uuid,uuid,integer,text),public.read_owned_group_earning(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_group_earnings(uuid,uuid,integer,text),public.read_owned_group_earning(uuid,uuid,text)to service_role;
commit;
