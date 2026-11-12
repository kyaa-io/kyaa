-- Keep owner bypass for existing SECURITY DEFINER workers; no FORCE or policies.
begin;
alter table public.mobile_app_settings enable row level security;
alter table public.mobile_installations enable row level security;
alter table public.mobile_installation_requests enable row level security;
alter table public.mobile_push_delivery_outbox enable row level security;
commit;
