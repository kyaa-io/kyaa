-- Runs alone: the approval migration that follows uses this value.
alter type public.notification_kind add value if not exists 'group_event_reviewed';
