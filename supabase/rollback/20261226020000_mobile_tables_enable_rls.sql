-- Keep owner bypass for existing SECURITY DEFINER workers; no FORCE or policies.
begin;
alter table public.mobile_app_settings disable row level security;
alter table public.mobile_installations disable row level security;
alter table public.mobile_installation_requests disable row level security;
alter table public.mobile_push_delivery_outbox disable row level security;
commit;
