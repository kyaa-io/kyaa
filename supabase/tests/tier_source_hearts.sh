#!/usr/bin/env bash
# Merge checklist 9 (20261215090000): tier history written on the old, point-based source is corrected without a rise or a dialog,
# and afterwards the MY summary and the fan list agree. One transaction, rolled back. Local: PGHOST=127.0.0.1 PGPORT=55433 PGUSER=localsuper.
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
rollback;
SQL
