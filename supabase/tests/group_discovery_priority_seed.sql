do $$ begin
 if (select array_agg(celebrity_slug order by position) from public.group_discovery_priority)<>array['elina','yuna','changha'] then raise exception 'initial pin order missing'; end if;
end $$;
