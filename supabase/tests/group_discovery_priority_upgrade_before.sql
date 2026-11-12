insert into public.celebrities(slug,status,image_url,roles,primary_role) values
('elina','draft','/elina.webp','{creator}','creator'),('yuna','draft','/yuna.webp','{creator}','creator'),('changha','draft','/changha.webp','{creator}','creator') on conflict(slug) do nothing;
