-- DRAFT ONLY. Not a migration; no campaign, prize, banner or notice data inserted.
-- Reviewed activation and weight policy are required before any later execution.
BEGIN;
CREATE TABLE public.signup_event_evidence (
  campaign_id uuid NOT NULL REFERENCES public.live_benefit_campaigns(id),
  app_user_id uuid NOT NULL REFERENCES public.app_users(id),
  kind text NOT NULL CHECK (kind IN ('signup','share-click','referral-signup','attendance','post')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 250),
  occurred_at timestamptz NOT NULL,
  -- Base signup is 1. Additional weights have no default until policy is approved.
  ticket_amount integer NOT NULL CHECK (ticket_amount > 0),
  UNIQUE (campaign_id, app_user_id, kind, source_key),
  CHECK (occurred_at >= timestamptz '2026-11-11 00:00:00+09'
     AND occurred_at < timestamptz '2026-11-25 00:00:00+09')
);
CREATE UNIQUE INDEX signup_event_one_base_entry ON public.signup_event_evidence(campaign_id,app_user_id) WHERE kind='signup';
ALTER TABLE public.signup_event_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_event_evidence FROM PUBLIC, anon, authenticated;
-- No grant or activation yet. The eventual trusted producer must verify original
-- app_users.created_at, fan_action_occurrences and server attribution, never client claims.
-- Existing one-time weighted benefit draw remains the production draw owner.
ROLLBACK;
