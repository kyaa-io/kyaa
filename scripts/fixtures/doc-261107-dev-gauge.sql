-- DEV ONLY. Values for the jjinfan gauge on the test page. The seed leaves this at zero; only this file adds titles.
-- byus.doc261107_gauge: 0 to 100 titles. It does not turn the gauge on: that stays the admin setting from the F2 work.
begin;
set local lock_timeout = '5s';
set local session_replication_role = replica;
do $$declare wanted integer:=coalesce(nullif(current_setting('byus.doc261107_gauge',true),''),'-1')::integer;celebrity uuid:='d2611002-0000-4000-8000-000000000001';begin
 if current_setting('byus.doc261107_dev',true) is distinct from 'SEED_DOC_261107_DEV_ONLY' then raise exception 'DOC261107_CONFIRMATION_REQUIRED';end if;
 if inet_server_addr() is not null and host(inet_server_addr()) !~ '^(10\.40\.|127\.)' then raise exception 'DOC261107_NOT_DEV_SERVER';end if;
 if wanted not between 0 and 100 then raise exception 'DOC261107_GAUGE_VALUE';end if;
 if not exists(select 1 from public.celebrities where id=celebrity) then raise exception 'DOC261107_SEED_FIRST';end if;
 delete from public.jjinfan_titles where celebrity_id=celebrity;
 insert into public.jjinfan_titles(app_user_id,celebrity_id,achieved_at)
  select ('d2611001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,celebrity,'2026-11-01' from generate_series(1,wanted) n;
end $$;
commit;
