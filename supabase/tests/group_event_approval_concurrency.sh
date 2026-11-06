#!/usr/bin/env bash
# Run through verify-clean-migration-chain.sh (BYUS_CLEAN_DB_SHELL_ASSERTION_FILE), disposable DB only.
# Approve and reject race on the same revision: exactly one decision lands, once.
set -euo pipefail
psql_args=(-X -v ON_ERROR_STOP=1 -q -t -A)
psql "${psql_args[@]}" <<'SQL'
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unix socket byus_clean required';end if;end $$;
insert into public.app_users(id,privy_user_id,verified_email)values('ea100000-0000-4000-8000-000000000001','did:privy:approval-race-owner','approval-race-owner@example.test'),('ea100000-0000-4000-8000-000000000002','did:privy:approval-race-admin','approval-race-admin@example.test'),('ea100000-0000-4000-8000-000000000003','did:privy:approval-race-admin-2','approval-race-admin-2@example.test');
insert into public.admin_allowlist(id,email,role,active)values('ea100000-0000-4000-8000-000000000004','approval-race-admin@example.test','admin',true),('ea100000-0000-4000-8000-000000000005','approval-race-admin-2@example.test','admin',true);
insert into public.group_pages(id,kind,name)values('ea100000-0000-4000-8000-000000000006','hobby','Approval race');
insert into public.group_memberships(page_id,app_user_id,role)values('ea100000-0000-4000-8000-000000000006','ea100000-0000-4000-8000-000000000001','owner');
insert into public.group_events(id,page_id,title,starts_at,ends_at,opens_at,closes_at,location,state,created_by,approval_status)select('ea100000-0000-4000-8000-1'||lpad(n::text,11,'0'))::uuid,'ea100000-0000-4000-8000-000000000006','Race '||n,now()+interval'1 day',now()+interval'2 days',now(),now()+interval'1 day','Hall','published','ea100000-0000-4000-8000-000000000001','pending' from generate_series(1,8)n;
SQL
page=ea100000-0000-4000-8000-000000000006
decide() { # event admin-user allowlist action
  local input
  if [[ "$4" == approve ]]; then input="{\"requestId\":\"$(uuidgen | tr 'A-Z' 'a-z')\",\"action\":\"approve\",\"expectedRevision\":1}"
  else input="{\"requestId\":\"$(uuidgen | tr 'A-Z' 'a-z')\",\"action\":\"reject\",\"reason\":\"race\",\"expectedRevision\":1}"; fi
  psql "${psql_args[@]}" -c "select public.group_activities_dispatch('event-approval-review','$2','$page','$1',null,'$input'::jsonb,'$3');" >/dev/null 2>&1 && echo ok || echo refused
}
pids=()
out="$(mktemp -d)"
for n in 1 2 3 4 5 6 7 8; do
  event="ea100000-0000-4000-8000-1$(printf '%011d' "$n")"
  decide "$event" ea100000-0000-4000-8000-000000000002 ea100000-0000-4000-8000-000000000004 approve >"$out/$n.a" & pids+=($!)
  decide "$event" ea100000-0000-4000-8000-000000000003 ea100000-0000-4000-8000-000000000005 reject >"$out/$n.r" & pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done
for n in 1 2 3 4 5 6 7 8; do
  winners=$(cat "$out/$n.a" "$out/$n.r" | grep -c ok || true)
  if [[ "$winners" != 1 ]]; then echo "event $n winners=$winners" >&2; exit 1; fi
done
find "$out" -depth -delete
psql "${psql_args[@]}" <<'SQL'
do $$declare bad int;begin
 select count(*) into bad from public.group_events e where e.page_id='ea100000-0000-4000-8000-000000000006' and(e.approval_status not in('approved','rejected')or(select count(*)from public.group_event_approval_audit a where a.event_id=e.id and a.action in('approve','reject'))<>1 or(select a.action from public.group_event_approval_audit a where a.event_id=e.id)<>case e.approval_status when'approved'then'approve'else'reject'end);
 if bad<>0 then raise exception 'race left % inconsistent events',bad;end if;
end $$;
SQL
echo 'group_event_approval_concurrency: exactly one decision per event'
