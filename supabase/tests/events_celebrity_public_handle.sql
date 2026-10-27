begin;
do $$
begin
  begin
    insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
    values(gen_random_uuid(),'events','draft','/handle-policy.webp','{artist}','idol');
    raise exception 'events route accepted as a creator handle';
  exception when check_violation then null;
  end;
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
  values(gen_random_uuid(),'events-valid-creator-check','draft','/handle-policy.webp','{artist}','idol');
  if not exists(select 1 from public.celebrities where slug='events-valid-creator-check') then
    raise exception 'valid creator handle was not preserved';
  end if;
end $$;
rollback;
