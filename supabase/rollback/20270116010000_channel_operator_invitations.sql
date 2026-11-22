-- Rollback for 20270116010000_channel_operator_invitations.sql.
-- Grants already created by accepted invitations stay in channel_operators
-- (revoke them from /admin/operators if needed); invitation history stays in
-- audit_logs as channel_operator_invitation.created/cancelled/accepted.
begin;
drop trigger if exists app_users_accept_channel_operator_invitations on public.app_users;
drop function if exists public.app_users_accept_channel_operator_invitations();
drop function if exists public.accept_channel_operator_invitations(uuid);
drop function if exists public.invite_channel_operator(uuid, uuid, uuid, uuid, text, text, text);
drop function if exists public.cancel_channel_operator_invitation(uuid, uuid, uuid, uuid, uuid);
drop function if exists public.list_channel_operator_invitations(uuid, uuid, uuid);
drop function if exists public.claim_channel_operator_invitation_email(text);
drop function if exists public.finish_channel_operator_invitation_email(uuid, text, text);
drop table if exists public.channel_operator_invitations;
commit;
