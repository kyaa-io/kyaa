begin;
do $$
declare reserved text;
begin
  foreach reserved in array array['credits','fans','instagram-link-preview','open-app','admin'] loop
    begin
      insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
      values(gen_random_uuid(),reserved,'draft','/handle-policy.webp','{artist}','idol');
      raise exception 'reserved handle accepted: %',reserved;
    exception when check_violation then null;
    end;
  end loop;
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
  values(gen_random_uuid(),'mobile-valid-handle-check','draft','/handle-policy.webp','{artist}','idol');
  if not exists(select 1 from public.celebrities where slug='mobile-valid-handle-check') then
    raise exception 'valid creator handle was not preserved';
  end if;
end $$;
rollback;
