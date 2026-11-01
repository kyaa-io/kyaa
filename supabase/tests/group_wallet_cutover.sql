\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
begin;
do $$declare owner uuid:='e9500000-0000-4000-8000-000000000001';other uuid:='e9500000-0000-4000-8000-000000000002';today date:=(clock_timestamp()at time zone'Asia/Seoul')::date;result jsonb;entry jsonb;begin
 update public.group_wallet_release set write_fenced=false,rewards_start_on=today+1 where singleton;
 result:=public.read_owned_group_wallet(owner);
 if result->>'rewardsStartOn'is distinct from(today+1)::text then raise exception 'Future reward start not exposed';end if;
 begin perform public.check_in_owned_group_wallet(owner,extensions.gen_random_uuid());raise exception 'Future daily reward allowed';exception when others then if sqlerrm<>'GROUP_WALLET_REWARDS_NOT_STARTED'then raise;end if;end;
 update public.group_wallet_release set rewards_start_on=today where singleton;
 entry:=public.check_in_owned_group_wallet(owner,extensions.gen_random_uuid());result:=public.read_owned_group_wallet(owner);
 if jsonb_array_length(result#>'{attendance,days}')<>1 or result#>>'{attendance,days,0,date}'is distinct from today::text or result#>>'{attendance,days,0,points}'is distinct from(entry->>'pointsAwarded')then raise exception 'Monthly own actual attendance rows not exposed';end if;
 if public.read_owned_group_wallet(other)#>'{attendance,days}'is distinct from'[]'::jsonb then raise exception 'Monthly attendance leaked another owner';end if;
 if exists(select 1 from jsonb_array_elements(result#>'{attendance,days}')day where left(day->>'date',7)<>to_char(today,'YYYY-MM'))then raise exception 'Monthly attendance escaped current KST month';end if;
 raise notice 'PASS future rewardsStartOn/server block and own current KST month attendance.days from actual check-in';
end $$;
rollback;
