\set ON_ERROR_STOP on
do $$ begin
  if (select primary_role::text || '/' || status from public.celebrities where id = 'fa300000-0000-4000-8000-000000000001') <> 'creator/published' then
    raise exception 'published singer did not become a published creator';
  end if;
  if (select primary_role::text || '/' || status from public.celebrities where id = 'fa300000-0000-4000-8000-000000000002') <> 'creator/draft' then
    raise exception 'draft actor did not become a draft creator';
  end if;
  if not exists(select 1 from pg_constraint where conname = 'celebrities_current_category' and convalidated) then
    raise exception 'category constraint missing';
  end if;
end $$;
