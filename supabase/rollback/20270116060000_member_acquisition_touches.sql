-- Rollback of 20270116060000_member_acquisition_touches.sql (web first: /api/auth/session and /api/admin/analytics/signup-touches call these functions). Recorded touches are dropped with the table.
begin;
drop function public.read_admin_signup_touches(uuid, uuid, integer);
drop function public.acquisition_touch_path(jsonb);
drop function public.record_app_user_acquisition_touch(uuid, jsonb, jsonb);
drop table public.app_user_acquisition_touches;
notify pgrst, 'reload schema';
commit;
