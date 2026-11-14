-- read_admin_platform_followers calls require_content_editor, which locks the actor row (SELECT ... FOR UPDATE).
-- PostgREST runs STABLE functions in a READ ONLY transaction, so the admin creator list failed with
-- "cannot execute SELECT FOR UPDATE in a read-only transaction". Same fix as 20260903014500.
alter function public.read_admin_platform_followers(uuid, uuid) volatile;
