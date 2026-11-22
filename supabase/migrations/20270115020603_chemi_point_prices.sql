create or replace function public.chemi_extra_play_cost() returns integer
language sql immutable set search_path = '' as $$ select 20 $$;

create or replace function public.chemi_date_reading_price() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
