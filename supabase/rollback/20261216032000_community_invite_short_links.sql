-- Rollback of 20261216032000_community_invite_short_links. Roll the web back first: kyaa.io/i/<slug> addresses already
-- shared stop working (the page answers not found); the long invite addresses keep working.
begin;
drop function if exists public.resolve_community_invite_short_link(text);
drop function if exists public.create_community_invite_short_link(uuid, text);
drop table if exists public.community_invite_short_links;
commit;
notify pgrst, 'reload schema';
