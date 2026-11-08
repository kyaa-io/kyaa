#!/usr/bin/env bash
# Merge checklist 9 (20261215090000): tier history written on the old, point-based source is corrected without a rise or a dialog,
# and afterwards the MY summary and the fan list agree; a heart that lifts the tier unlocks a policy-3 benefit once (review r4c M3);
# the file stops when policy-3 level events exist (M1). One transaction, rolled back. Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
for f in rollback/20261215090000_tier_source_hearts.sql migrations/20261215090000_tier_source_hearts.sql; do
  mkdir -p "$TMP/$(dirname "$f")"; grep -v -x -e 'begin;' -e 'commit;' -e "notify pgrst, 'reload schema';" "$ROOT/supabase/$f" > "$TMP/$f"
done
psql -X -q -v ON_ERROR_STOP=1 -d byus <<SQL
begin;
\i $TMP/rollback/20261215090000_tier_source_hearts.sql
-- History as the old source wrote it: MY's point-based tier.
delete from public.fan_tier_history;
insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, occurred_at, seen_at)
  select fp.app_user_id, fp.celebrity_id, fp.id, 'start', null, 'Bronze', fp.issued_at, now() from public.fan_passports fp join public.app_users a on a.id = fp.app_user_id and a.status = 'active';
insert into public.fan_tier_history (app_user_id, celebrity_id, passport_id, kind, previous_tier, tier, seen_at)
  select fp.app_user_id, fp.celebrity_id, fp.id, 'baseline', 'Bronze', t.tier, now()
  from public.fan_passports fp join public.app_users a on a.id = fp.app_user_id and a.status = 'active'
  cross join lateral (select public.get_fan_effective_tier_for_score(fp.app_user_id, fp.celebrity_id,
    coalesce((select sum(points)::integer from public.fan_score_ledger x where x.app_user_id = fp.app_user_id and x.celebrity_id = fp.celebrity_id), 0), 3) tier) t
  where t.tier <> 'Bronze';
\i $TMP/migrations/20261215090000_tier_source_hearts.sql
do \$\$
declare ups integer; corrections integer; dialogs integer := 0; u uuid; bad integer;
begin
  for u in select distinct app_user_id from public.fan_tier_history loop
    if jsonb_array_length(public.observe_fan_tiers(u, 'ko') -> 'changes') > 0 then dialogs := dialogs + 1; end if;
  end loop;
  select count(*) filter (where kind = 'up'), count(*) filter (where kind = 'correction') into ups, corrections from public.fan_tier_history;
  select count(*) into bad from (select distinct on (h.passport_id) h.passport_id, h.tier, h.app_user_id, h.celebrity_id from public.fan_tier_history h order by h.passport_id, h.occurred_at desc, h.id desc) l
    where l.tier is distinct from public.get_fan_effective_tier(l.app_user_id, l.celebrity_id);
  raise notice 'correction rows %, up rows %, members shown a dialog %, history tier differing from the fan list %', corrections, ups, dialogs, bad;
  if ups <> 0 or dialogs <> 0 or bad <> 0 or corrections = 0 then raise exception 'tier source correction failed'; end if;
end \$\$;
-- Review r4c M3: a heart that lifts the tier from Silver/Bronze to Gold unlocks a policy-3 Gold benefit, once.
do \$\$
declare tmpl jsonb; b uuid := extensions.gen_random_uuid(); fp record; n integer;
begin
  select to_jsonb(x) into tmpl from public.benefits x limit 1;
  select p.app_user_id, p.celebrity_id into fp from public.fan_passports p join public.app_users a on a.id = p.app_user_id and a.status = 'active'
    where public.passport_hearts(p.app_user_id, p.celebrity_id) = 0 and public.get_fan_effective_tier(p.app_user_id, p.celebrity_id) in ('Bronze', 'Silver')
      and not exists (select 1 from public.fan_level_events e where e.app_user_id = p.app_user_id and e.celebrity_id = p.celebrity_id) limit 1;
  if tmpl is null or fp.app_user_id is null then raise exception 'fixture: a benefit row and a 0-heart passport'; end if;
  insert into public.benefits select * from jsonb_populate_record(null::public.benefits, tmpl || jsonb_build_object('id', b, 'slug', 'tier-source-probe-' || left(b::text, 8),
    'celebrity_id', fp.celebrity_id, 'reward_policy_version', 3, 'minimum_level', 'Gold', 'minimum_score', 0, 'publication_status', 'published', 'archived_at', null,
    'claim_opens_at', now() - interval '1 hour', 'claim_closes_at', now() + interval '1 day', 'stock_limit', null, 'required_stamp_type', null, 'required_activity_type', null));
  insert into public.creator_heart_ledger (celebrity_id, app_user_id, amount, source_type, source_id) values (fp.celebrity_id, fp.app_user_id, 1, 'passport_page_claim', extensions.gen_random_uuid());
  if public.get_fan_effective_tier(fp.app_user_id, fp.celebrity_id) <> 'Gold' then raise exception 'fixture: one heart did not make Gold'; end if;
  insert into public.creator_heart_ledger (celebrity_id, app_user_id, amount, source_type, source_id) values (fp.celebrity_id, fp.app_user_id, 1, 'passport_page_claim', extensions.gen_random_uuid());
  select count(*) into n from public.fan_notifications where app_user_id = fp.app_user_id and kind = 'benefit_unlocked' and benefit_id = b;
  raise notice 'heart unlock notices for the Gold benefit: % (want 1)', n;
  if n <> 1 then raise exception 'heart unlock failed'; end if;
end \$\$;
rollback;
SQL
out="$(psql -X -q -d byus 2>&1 <<SQL
-- Review r4c M1: a policy-3 level event stops the file.
begin;
\i $TMP/rollback/20261215090000_tier_source_hearts.sql
do \$\$
declare l record; begin
  select x.id, x.app_user_id, x.celebrity_id into l from public.fan_score_ledger x
    where not exists (select 1 from public.fan_level_events e where e.app_user_id = x.app_user_id and e.celebrity_id = x.celebrity_id) limit 1;
  insert into public.fan_level_events (source_ledger_id, app_user_id, celebrity_id, previous_score, current_score, previous_level, current_level, policy_version)
    values (l.id, l.app_user_id, l.celebrity_id, 0, 30, 'Bronze', 'Diamond', 3);
end \$\$;
\i $TMP/migrations/20261215090000_tier_source_hearts.sql
rollback;
SQL
)" || true
if grep -q "TIER_SOURCE_V3_EVENTS_PRESENT" <<<"$out"; then echo "M1 guard: stopped with TIER_SOURCE_V3_EVENTS_PRESENT"; else echo "M1 guard did not stop"; echo "$out" | head -5; exit 1; fi
