\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
-- Production definer callers (list, feed, ranking) are owned by a role other than the migration runner. Mimic it with a
-- separate non-superuser owner for a definer caller of fan_web_post_json that no other grant covers.
create role fan_post_views_legacy_owner nologin;
grant usage on schema public to fan_post_views_legacy_owner;
-- A real owner can read the tables its definer bodies use; only function execute rights are under test.
grant select on all tables in schema public to fan_post_views_legacy_owner;
create function public._fan_post_views_probe(p_post uuid)returns jsonb language plpgsql security definer set search_path=''as $$
begin return public.fan_web_post_json(null,p_post,'ko');end $$;
alter function public._fan_post_views_probe(uuid) owner to fan_post_views_legacy_owner;
