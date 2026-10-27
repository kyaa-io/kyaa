insert into public.celebrities(id,slug,status,image_url,roles,primary_role)
values('88280000-0000-4000-8000-000000000027','events-policy-existing','draft','/handle-existing.webp','{artist}','idol');
create table public.events_policy_upgrade_snapshot as
select to_jsonb(c) as record from public.celebrities c where id='88280000-0000-4000-8000-000000000027';
