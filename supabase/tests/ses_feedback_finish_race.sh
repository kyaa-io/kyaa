#!/usr/bin/env bash
# 20261228110000: finish_email_notification_send and record_ses_email_event (SES acceptance evidence) on the
# same send from two connections. Each side holds its transaction open while the other calls in, in both
# orders, then pairs start together. No deadlock, and every send ends accepted / sent / sent.
# Rows are committed (two connections). The send rows are removed at the end; the fixture member and channel
# stay and are reused on a rerun (fan_product_events is append-only and keeps the member).
set -euo pipefail
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket || ! -d "$PGHOST" ]]; then
  echo "SES feedback race checks require the disposable clean-replay socket" >&2
  exit 1
fi
q() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
cleanup() {
  q <<'SQL' >/dev/null
delete from public.email_delivery_events where sns_message_id like 'sfr-%';
delete from public.email_channel_delivery_health where channel_id in (select id from public.fan_notification_channels where destination_label = 'sfr');
delete from public.email_notification_send_attempts where worker_id = 'w-sfr';
delete from public.external_notification_delivery_outbox where id in (select delivery from sfr.jobs);
delete from public.notification_delivery_plans where notification_id in (select note from sfr.jobs);
delete from public.fan_notifications where id in (select note from sfr.jobs);
drop schema sfr cascade;
SQL
}
q <<'SQL'
begin;
create schema sfr;
create table sfr.jobs(n integer primary key, delivery uuid not null, note uuid not null);
do $$
declare v_user uuid; v_channel uuid;
  v_note uuid; v_plan uuid; v_delivery uuid; v_fp text := public.email_destination_fingerprint('sfr@example.invalid'); k integer;
begin
  select id, app_user_id into v_channel, v_user from public.fan_notification_channels where destination_label = 'sfr';
  if not found then
    v_user := extensions.gen_random_uuid(); v_channel := extensions.gen_random_uuid();
    insert into public.app_users(id, privy_user_id, verified_email) values (v_user, 'did:privy:sfr-' || v_user, 'sfr@example.invalid');
    insert into public.fan_notification_channels(id, app_user_id, kind, status, consent_version, consented_at, destination_fingerprint, destination_label, verified_at)
      values (v_channel, v_user, 'email', 'eligible', 'fixture', now(), v_fp, 'sfr', now());
    insert into public.fan_notification_channel_private(channel_id, destination) values (v_channel, 'sfr@example.invalid');
  end if;
  -- 1: evidence holds its transaction, 2: finish holds its transaction, 3..32: both start together.
  for k in 1..32 loop
    insert into public.fan_notifications(app_user_id, kind, source_key, scheduled_for)
      values (v_user, 'artist_comment', 'artist_comment:sfr:' || k || ':' || v_user, now()) returning id into v_note;
    insert into public.notification_delivery_plans(notification_id, primary_channel_id, status)
      values (v_note, v_channel, 'pending')
      on conflict (notification_id) do update set primary_channel_id = excluded.primary_channel_id, status = 'pending', sent_at = null
      returning id into v_plan;
    insert into public.external_notification_delivery_outbox(plan_id, notification_id, channel_id, channel, sequence, template_key, locale,
        status, attempt_count, lease_owner, lease_expires_at)
      values (v_plan, v_note, v_channel, 'email', 1, 'artist_comment', 'ko', 'processing', 1, 'w-sfr', now() + interval '10 minutes')
      returning id into v_delivery;
    insert into public.email_notification_send_attempts(delivery_id, worker_id, attempt_count, destination_fingerprint, lease_expires_at)
      values (v_delivery, 'w-sfr', 1, v_fp, now() + interval '10 minutes');
    insert into sfr.jobs values (k, v_delivery, v_note);
  end loop;
end $$;
commit;
SQL
trap cleanup EXIT

python3 - <<'PY'
from concurrent.futures import ThreadPoolExecutor
import subprocess, time

def psql(*commands):
    args = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
    for c in commands: args += ['-c', c]
    started = time.monotonic()
    out = subprocess.run(args, text=True, capture_output=True)
    if out.returncode != 0: raise AssertionError(out.stderr.strip())
    return out.stdout.strip().splitlines(), time.monotonic() - started

delivery = lambda n: f"(select delivery from sfr.jobs where n = {n})"
# The Lambda's payload for this send's SES Send event (shape of toSesFeedbackPayload).
record = lambda n: (f"select (public.record_ses_email_event(jsonb_build_object('sns_message_id', 'sfr-{n}', 'event_type', 'send', "
    f"'ses_message_id', 'ses-sfr-{n}', 'delivery_id', {delivery(n)}::text, 'occurred_at', now()::text, "
    f"'recipients', jsonb_build_array('sfr@example.invalid'))))->>'match'")
finish = lambda n: f"select public.finish_email_notification_send({delivery(n)}, 'w-sfr', 1, 'unknown', null, 'EMAIL_SEND_OUTCOME_UNKNOWN')"
deadlocks = lambda: int(psql("select deadlocks from pg_stat_database where datname = current_database()")[0][0])
before = deadlocks()

def held(first, second):
    with ThreadPoolExecutor(max_workers=2) as pool:
        holder = pool.submit(psql, 'begin', first, 'select pg_sleep(1.5)', 'commit')
        time.sleep(0.5)
        other = pool.submit(psql, second)
        (held_out, _), (other_out, waited) = holder.result(), other.result()
    assert waited >= 0.8, f'second call did not wait for the held locks ({waited:.2f}s)'
    return held_out[0], other_out[0]

assert held(record(1), finish(1)) == ('matched', 't'), 'evidence first'
assert held(finish(2), record(2)) == ('t', 'matched'), 'finish first'
with ThreadPoolExecutor(max_workers=60) as pool:
    calls = [pool.submit(psql, f(n)) for n in range(3, 33) for f in (record, finish)]
    results = [c.result()[0][0] for c in calls]
assert sorted(set(results)) == ['matched', 't'], results

final = psql("select string_agg(a.status || '/' || o.status || '/' || p.status || '/' || (a.provider_message_id = 'ses-sfr-' || j.n), ',' order by j.n) "
    "from sfr.jobs j join public.email_notification_send_attempts a on a.delivery_id = j.delivery "
    "join public.external_notification_delivery_outbox o on o.id = j.delivery join public.notification_delivery_plans p on p.id = o.plan_id")[0][0]
assert set(final.split(',')) == {'accepted/sent/sent/true'}, final
assert psql("select count(*) from public.email_delivery_events where sns_message_id like 'sfr-%'")[0][0] == '32'
assert deadlocks() == before, 'deadlock detected'
print('SES feedback vs finish race: held both ways and 30 simultaneous pairs, no deadlock, all accepted/sent/sent PASS')
PY
