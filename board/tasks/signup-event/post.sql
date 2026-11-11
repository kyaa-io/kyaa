-- DRAFT ONLY. No production data, campaigns, prizes, banners or notices inserted.
BEGIN;
CREATE TABLE public.kyaa_raffle_policies (
  campaign_id uuid PRIMARY KEY REFERENCES public.live_benefit_campaigns(id),
  closes_at timestamptz NOT NULL DEFAULT timestamptz '2026-11-30 23:59:59.999+09',
  time_zone text NOT NULL DEFAULT 'Asia/Seoul',
  comment_weight integer NOT NULL DEFAULT 1 CHECK (comment_weight >= 0),
  attendance_weight integer NOT NULL DEFAULT 1 CHECK (attendance_weight >= 0),
  comment_daily_cap integer CHECK (comment_daily_cap >= 0),
  attendance_daily_cap integer CHECK (attendance_daily_cap >= 0)
);
CREATE TABLE public.kyaa_raffle_evidence (
  campaign_id uuid NOT NULL REFERENCES public.kyaa_raffle_policies(campaign_id),
  app_user_id uuid NOT NULL REFERENCES public.app_users(id),
  kind text NOT NULL CHECK (kind IN ('entry','comment','attendance')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 250),
  occurred_at timestamptz NOT NULL,
  UNIQUE (campaign_id, app_user_id, kind, source_key)
);
CREATE UNIQUE INDEX kyaa_raffle_one_entry ON public.kyaa_raffle_evidence(campaign_id,app_user_id) WHERE kind='entry';
ALTER TABLE public.kyaa_raffle_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyaa_raffle_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kyaa_raffle_policies,public.kyaa_raffle_evidence FROM PUBLIC,anon,authenticated;
-- Trusted projection must verify fan_passports and group_memberships, original
-- comment/attendance ownership, local-day caps and the configured closing instant.
-- Signup age, sharing and authored posts do not add raffle eligibility or weight.
-- Existing persisted benefit draw remains the operational draw owner.
ROLLBACK;
