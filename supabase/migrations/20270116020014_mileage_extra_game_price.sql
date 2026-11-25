create or replace function public.chemi_game_price(used integer)
returns integer
language sql immutable strict set search_path = '' as $$
  select case used
    when 0 then 10
    when 1 then 30
    when 2 then 50
    else 100
  end
$$;
