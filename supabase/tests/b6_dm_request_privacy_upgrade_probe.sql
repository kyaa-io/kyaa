-- Shared by the B6 upgrade before/after files: answers that 20261220040000 must not change. :phase is before or after.
-- Fixtures come from b6_dm_request_privacy_upgrade_before.sql.
do $probe$
declare phase text:=current_setting('b6.phase');
 a uuid:='b6c00000-0000-4000-8000-000000000001';s uuid:='b6c00000-0000-4000-8000-000000000002';gone uuid:='b6c00000-0000-4000-8000-000000000003';
 w uuid:='b6c00000-0000-4000-8000-000000000004';ws uuid:='b6c00000-0000-4000-8000-000000000005';friendship uuid;
 calls text[];c text;v text;
begin
 select id into friendship from public.social_friendships where requester_id=ws and addressee_id=a;
 calls:=array[
  -- S9c: friend features keep their answers (G7 stays as it is).
  format('select public.request_social_friend(%L,%L,null,%L)',a,s,'b6c00000-0000-4000-8000-0000000000f1'),
  format('select public.request_social_friend(%L,%L,null,%L)',a,gone,'b6c00000-0000-4000-8000-0000000000f2'),
  format('select public.resolve_social_friend(%L,%L,''accept'',%L)',a,friendship,'b6c00000-0000-4000-8000-0000000000f3'),
  format('select public.request_kyaa_wave_friend(%L,%L,%L)',a,ws,'b6c00000-0000-4000-8000-0000000000f4'),
  format('select public.resolve_kyaa_wave_friend(%L,%L,''accept'',%L)',a,friendship,'b6c00000-0000-4000-8000-0000000000f5'),
  format('select public.read_owned_kyaa_wave_friends(%L,''ko'')::text',a),
  format('select public.read_owned_kyaa_wave_members(%L,''ko'',null)::text',w),
  format('select (public.read_owned_kyaa_wave_profile_link(%L)->>''expiresAt'') is not null',a),
  -- S6f: wave greeting missions for the people who already have rows.
  format('select public.evaluate_owned_kyaa_wave_missions(%L)->''progress''',a),
  format('select public.evaluate_owned_kyaa_wave_missions(%L)->''progress''',w)];
 foreach c in array calls loop
  begin execute c into v; exception when others then v:='ERROR '||sqlerrm; end;
  insert into public.b6_upgrade_probe(phase,call,answer) values(phase,c,v);
 end loop;
 -- S6d, S15: rows already there.
 insert into public.b6_upgrade_probe(phase,call,answer)
  select phase,'conversation '||id,status||':'||coalesce(retry_at::text,'')||':'||updated_at::text||':'||requester_id from public.social_dm_conversations where id::text like 'b6c%'
  union all select phase,'dm_policy',(select string_agg(dm_policy||'='||count,',' order by dm_policy) from (select dm_policy,count(*) from public.social_profile_settings group by 1) x);
end $probe$;
