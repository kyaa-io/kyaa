do $$ declare current_count bigint; current_digest text; before_row record;
begin
  select * into before_row from public.official_read_upgrade_snapshot;
  select count(*),md5(coalesce(string_agg(to_jsonb(n)::text,'' order by n.id),'')) into current_count,current_digest from public.celebrity_notices n;
  if current_count is distinct from before_row.notice_count or current_digest is distinct from before_row.digest
    or exists(select 1 from public.mobile_official_post_reads) then raise exception 'official read migration changed existing content'; end if;
end $$;
drop table public.official_read_upgrade_snapshot;
