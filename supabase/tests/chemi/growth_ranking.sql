begin;
do $$
declare
  first_fan uuid := gen_random_uuid();
  next_fan uuid := gen_random_uuid();
  hidden_fan uuid := gen_random_uuid();
  monday date := date_trunc('week',now() at time zone 'Asia/Seoul')::date;
  result jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email)
    select id,id::text,id::text||'@example.invalid' from unnest(array[first_fan,next_fan,hidden_fan]) id;
  insert into public.chemi_minis(user_id,character,exp_total) values
    (first_fan,'yuna',100),(next_fan,'yuna',300),(hidden_fan,'yuna',900);
  insert into public.social_profile_settings(app_user_id,profile_visible) values(hidden_fan,false);
  insert into public.chemi_exp_log(user_id,character,source,kst_date,exp,created_at) values
    (first_fan,'yuna','feed',monday,100,monday::timestamp at time zone 'Asia/Seoul'),
    (next_fan,'yuna','feed',monday,100,(monday::timestamp at time zone 'Asia/Seoul')+interval '1 second'),
    (next_fan,'yuna','feed',monday-1,200,(monday::timestamp at time zone 'Asia/Seoul')-interval '1 second'),
    (hidden_fan,'yuna','feed',monday,900,now());
  result := public.chemi_growth_ranking(next_fan,'yuna','week');
  if not result @> '[{"place":2,"score":100,"mine":true,"gap":1}]' or result @> '[{"score":900}]' then
    raise exception 'weekly boundary, tie or visibility failed: %',result;
  end if;
  result := public.chemi_growth_ranking(next_fan,'yuna','all');
  if not result @> '[{"place":1,"score":300,"mine":true}]' then raise exception 'all-time: %',result; end if;
end $$;
rollback;
