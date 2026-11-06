-- Rollback for 20261212080000_jjinfan_challenge_campaigns.sql.
-- Roll the web back first if it still needs an administrator to edit; a new web on the old database simply shows no gauge and its admin page answers 503.
-- Campaign rows are dropped. Their last wording stays readable in audit_logs (action jjinfan_campaign.updated).
begin;

create or replace function public.read_jjinfan_challenge(p_celebrity uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n bigint;
begin
  if not exists (select 1 from public.celebrities c where c.id = p_celebrity and c.status = 'published' and c.archived_at is null) then
    raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  select count(*) into n from public.jjinfan_titles t join public.app_users tu on tu.id = t.app_user_id and tu.status = 'active' where t.celebrity_id = p_celebrity and t.revoked_at is null;
  return pg_catalog.jsonb_build_object('count', n, 'target', 100);
end $$;
revoke all on function public.read_jjinfan_challenge(uuid) from public, anon, authenticated;
grant execute on function public.read_jjinfan_challenge(uuid) to service_role;

drop function public.set_jjinfan_challenge_campaign(uuid, uuid, uuid, uuid, boolean, text, text);
drop function public.list_jjinfan_challenge_campaigns(uuid, uuid);
drop table public.jjinfan_challenge_campaigns;

commit;
