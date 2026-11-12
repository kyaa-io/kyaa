-- DRAFT ONLY. Do not execute without supervisor review and snapshot.
-- psql variables required: expected_updated_at, asset_ids (PostgreSQL uuid[] literal).
-- Confirm destination wena identity/localized name and attached asset ownership first.
-- asset_ids must be the exact content_assets IDs for this post, including deleted rows.
-- Expected impact: 1 post + cardinality(asset_ids) assets. Current asset count UNKNOWN.
-- The reported 26 is the creator-wide count, NOT the affected asset count.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE report1112_input ON COMMIT DROP AS SELECT
 'e5bdbbfb-660f-4123-9467-55536612c4b5'::uuid post_id,
 :'expected_updated_at'::timestamptz expected_updated_at, :'asset_ids'::uuid[] asset_ids;
DO $$
DECLARE p public.fan_posts; old_creator uuid; new_creator uuid; expected record; actual uuid[];
BEGIN
 SELECT * INTO STRICT expected FROM report1112_input;
 SELECT id INTO STRICT old_creator FROM public.celebrities WHERE slug='wena';
 SELECT id INTO STRICT new_creator FROM public.celebrities WHERE slug='elina' AND status='published' AND archived_at IS NULL;
 SELECT * INTO STRICT p FROM public.fan_posts WHERE id=expected.post_id FOR UPDATE;
 IF p.celebrity_id<>old_creator OR p.revision<>2 OR p.updated_at<>expected.expected_updated_at OR p.deleted_at IS NOT NULL OR p.hidden_at IS NOT NULL THEN
 RAISE EXCEPTION 'B5 changed since snapshot'; END IF;
 PERFORM 1 FROM public.content_assets WHERE post_id=p.id ORDER BY id FOR UPDATE;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO actual FROM public.content_assets WHERE post_id=p.id;
 IF actual IS DISTINCT FROM ARRAY(SELECT unnest(expected.asset_ids) ORDER BY 1) THEN RAISE EXCEPTION 'B5 attachment set changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.content_assets WHERE post_id=p.id AND (celebrity_id<>old_creator OR app_user_id<>p.app_user_id)) THEN RAISE EXCEPTION 'B5 mixed asset ownership'; END IF;
 IF EXISTS(SELECT 1 FROM public.mobile_media_assets WHERE attached_type='fan_post' AND attached_id=p.id) THEN RAISE EXCEPTION 'B5 mobile media needs separate review'; END IF;
 UPDATE public.content_assets SET celebrity_id=new_creator WHERE post_id=p.id;
 UPDATE public.fan_posts SET celebrity_id=new_creator,revision=3,updated_at=clock_timestamp() WHERE id=p.id;
 RAISE NOTICE 'B5 changed posts=1 assets=%', cardinality(actual);
END $$;
SELECT p.id,c.slug,p.revision,p.updated_at FROM public.fan_posts p JOIN public.celebrities c ON c.id=p.celebrity_id JOIN report1112_input i ON i.post_id=p.id;
-- Default dry run. Supervisor replaces only after reviewing triggers, ledger links and snapshot.
ROLLBACK;
