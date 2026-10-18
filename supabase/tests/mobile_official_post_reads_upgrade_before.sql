create table public.official_read_upgrade_snapshot as
  select count(*) notice_count,md5(coalesce(string_agg(to_jsonb(n)::text,'' order by n.id),'')) digest from public.celebrity_notices n;
