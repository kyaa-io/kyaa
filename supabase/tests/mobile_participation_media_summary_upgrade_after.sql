do $$
declare old public.mobile_space_media_upgrade_proof%rowtype;result jsonb;
begin
  if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local byus_clean required';end if;
  select*into strict old from public.mobile_space_media_upgrade_proof;
  if old.row_value is distinct from(select to_jsonb(s)-'interior_image_url'from public.mobile_participation_spaces s where id='7c200000-0000-4000-8000-000000000004')
    then raise exception 'Legacy venue changed';end if;
  result:=public.read_owned_mobile_participation_space('7c200000-0000-4000-8000-000000000001','7c200000-0000-4000-8000-000000000004','ko')-'serverNow';
  if result#>'{space,interiorImageUrl}'<>'null'::jsonb or result#-'{space,interiorImageUrl}'is distinct from old.projection
    then raise exception 'Legacy venue projection changed';end if;
end$$;
drop table public.mobile_space_media_upgrade_proof;
