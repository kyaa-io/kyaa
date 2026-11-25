-- EARN-SOCIAL-ONCHAIN-1126: two stamp kinds for the social earn actions that have no creator page of their own (friend added, chat).
-- Own file: a new enum value cannot be used in the transaction that adds it. Used by 20270116040005_social_earn_onchain.sql.
alter type public.community_stamp_kind add value if not exists 'social_friend';
alter type public.community_stamp_kind add value if not exists 'social_chat';
