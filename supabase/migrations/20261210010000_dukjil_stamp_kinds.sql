-- PASSPORT-RENEWAL P1-1: dukjil stamp kinds (13 new + 2 already present, idempotent).
alter type public.community_stamp_kind add value if not exists 'post';
alter type public.community_stamp_kind add value if not exists 'comment';
alter type public.community_stamp_kind add value if not exists 'reaction';
alter type public.community_stamp_kind add value if not exists 'live_reserve';
alter type public.community_stamp_kind add value if not exists 'live_attend';
alter type public.community_stamp_kind add value if not exists 'survey';
alter type public.community_stamp_kind add value if not exists 'mission';
alter type public.community_stamp_kind add value if not exists 'event_checkin';
alter type public.community_stamp_kind add value if not exists 'event_review';
alter type public.community_stamp_kind add value if not exists 'cheer';
alter type public.community_stamp_kind add value if not exists 'proof';
alter type public.community_stamp_kind add value if not exists 'quiz';
alter type public.community_stamp_kind add value if not exists 'steady_checkin';
alter type public.community_stamp_kind add value if not exists 'wave_mission';
alter type public.community_stamp_kind add value if not exists 'first_clip';
