begin;

-- Keep code/name validation and idempotency in the existing registration function.
alter function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text)
 rename to submit_kyaa_wave_participation_before_auto_stamp;
revoke all on function public.submit_kyaa_wave_participation_before_auto_stamp(uuid,uuid,text,text,text,text)
 from public,anon,authenticated,service_role;

create function public.submit_kyaa_wave_participation(
 p_app_user_id uuid,p_request_id uuid,p_code_hash text,p_payload_hmac text,p_name_encrypted text,p_name_fingerprint text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.submit_kyaa_wave_participation_before_auto_stamp(p_app_user_id,p_request_id,p_code_hash,p_payload_hmac,p_name_encrypted,p_name_fingerprint);
 if result->'participation'->>'id' is not null then
  -- Match wallet reconciliation: a closed fanpage must not block registration.
  perform 1 from public.celebrities where slug='kyaa-wave-fanpage'
   and status='published' and archived_at is null for share;
  if found then perform public.read_owned_kyaa_wave_missions(p_app_user_id); end if;
 end if;
 return result;
end $$;
revoke all on function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_kyaa_wave_participation(uuid,uuid,text,text,text,text) to service_role;

commit;
