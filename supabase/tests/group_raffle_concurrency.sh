#!/usr/bin/env bash
set -euo pipefail
# Concurrent group_raffle_dispatch('enter'): no double debit, per-user limit and wallet balance hold under races.
# The clean-migration runner supplies a disposable Unix-socket database.
if [[ "${PGDATABASE:-}" != "byus_clean" || "${PGHOST:-}" != /*/byus-clean-db.*/socket ]]; then
  echo 'Disposable local database required' >&2; exit 1
fi
python3 - <<'PY'
import subprocess, uuid, json, concurrent.futures
base = ['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1']
def run(statement):
    return subprocess.run(base + ['-c', statement], text=True, capture_output=True)
def sql(statement):
    result = run(statement)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def uid(): return str(uuid.uuid4())
def u(n): return f'e9500000-0000-4000-8000-{n:012d}'
owner, page = u(1), u(100)
users = [u(n) for n in range(1, 40)]
values = ','.join(f"('{x}','did:privy:raffle-race-{i}','raffle-race-{i}@example.test')" for i, x in enumerate(users))
sql(f"""
begin;
insert into public.app_users(id,privy_user_id,verified_email) values {values};
insert into public.group_pages(id,kind,name) values ('{page}','hobby','Raffle race fixture');
insert into public.group_memberships(page_id,app_user_id,role) values ('{page}','{owner}','owner');
insert into public.group_memberships(page_id,app_user_id,role) select '{page}',id,'member' from public.app_users where id in ({','.join("'"+x+"'" for x in users[1:])});
update public.group_wallet_release set enabled=true,write_fenced=false,legacy_writers_verified=true,migration_evidence_sha256=repeat('c',64),rewards_start_on=current_date;
commit;""")
def grant(user, amount):
    sql(f"select public.group_wallet_post('{user}','ticket',{amount},'group_exchange','{uid()}')")
def new_raffle(limit):
    payload = json.dumps({'requestId': uid(), 'title': 'Race prize', 'summary': '', 'winnerQuantity': 1, 'perUserLimit': limit,
                          'closesAt': '2099-01-01T00:00:00Z', 'submissionDays': 7, 'fulfillmentMethod': 'physical_shipping'})
    return json.loads(sql(f"select public.group_raffle_dispatch('create','{owner}','{page}',null,'{payload}'::jsonb)"))['id']
def enter(raffle, user, amount, key=None):
    payload = json.dumps({'requestId': key or uid(), 'amount': amount})
    return run(f"select public.group_raffle_dispatch('enter','{user}','{page}','{raffle}','{payload}'::jsonb)")
def parallel(calls):
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:
        return list(pool.map(lambda c: c(), calls))
def balance(user): return int(sql(f"select public.group_wallet_balance('{user}','ticket')"))
def entered(raffle, user=None):
    where = f" and app_user_id='{user}'" if user else ''
    return int(sql(f"select coalesce(sum(amount),0) from public.group_raffle_entries where raffle_id='{raffle}'{where}"))
def raffle_debits(user):
    return int(sql(f"select count(*) from public.fan_ticket_ledger where app_user_id='{user}' and amount<0"))
def codes(results):
    return [('ok' if r.returncode == 0 else r.stderr.strip().split('\n')[0]) for r in results]

# 1. One user, enough tickets, per-user limit 3: eight single-ticket entries -> exactly 3 succeed.
fan = users[1]; grant(fan, 10); raffle = new_raffle(3)
out = codes(parallel([lambda: enter(raffle, fan, 1) for _ in range(8)]))
assert out.count('ok') == 3, out
assert all('GROUP_RAFFLE_LIMIT' in o for o in out if o != 'ok'), out
assert entered(raffle, fan) == 3 and balance(fan) == 7 and raffle_debits(fan) == 3, (entered(raffle, fan), balance(fan))
print('PASS per-user limit holds under concurrent entries: 3 of 8 succeed, 3 debited')

# 2. One user, limit above balance: balance 2, five entries -> exactly 2 succeed, balance never negative.
poor = users[2]; grant(poor, 2); raffle2 = new_raffle(10)
out = codes(parallel([lambda: enter(raffle2, poor, 1) for _ in range(5)]))
assert out.count('ok') == 2, out
assert entered(raffle2, poor) == 2 and balance(poor) == 0 and raffle_debits(poor) == 2, (entered(raffle2, poor), balance(poor))
assert all('INSUFFICIENT' in o for o in out if o != 'ok'), out
print('PASS balance cannot be overspent by concurrent entries: 2 of 5 succeed, zero overdraft')

# 3. Same requestId racing: never more than one debit and one entry; other outcome is a replay or a request conflict.
same = users[3]; grant(same, 5); raffle3 = new_raffle(5); key = uid()
results = parallel([lambda: enter(raffle3, same, 2, key) for _ in range(6)])
ok = [r for r in results if r.returncode == 0]
assert len(ok) >= 1 and len({r.stdout.strip() for r in ok}) == 1, codes(results)
assert entered(raffle3, same) == 2 and balance(same) == 3 and raffle_debits(same) == 1, (entered(raffle3, same), balance(same))
print('PASS same requestId debits once; outcomes:', sorted(set(codes(results))))
replay = enter(raffle3, same, 2, key)
assert replay.returncode == 0 and replay.stdout.strip() == ok[0].stdout.strip() and balance(same) == 3
print('PASS retry after the race returns the stored result without a second debit')

# 4. Many different users on one raffle: all succeed, sum of entries equals tickets debited, no one exceeds a limit.
crowd = users[4:36]; raffle4 = new_raffle(2)
for x in crowd: grant(x, 2)
out = codes(parallel([lambda x=x: enter(raffle4, x, 2) for x in crowd]))
assert out.count('ok') == len(crowd), out
assert entered(raffle4) == 2 * len(crowd) and all(balance(x) == 0 for x in crowd)
assert int(sql(f"select count(distinct app_user_id) from public.group_raffle_entries where raffle_id='{raffle4}'")) == len(crowd)
print('PASS', len(crowd), 'users entering one raffle at once: every ticket debited exactly once')

# 5. Two raffles, one user, one wallet: the shared balance serializes across raffles.
shared = users[36]; grant(shared, 3); r_a, r_b = new_raffle(5), new_raffle(5)
out = codes(parallel([lambda: enter(r_a, shared, 1) for _ in range(3)] + [lambda: enter(r_b, shared, 1) for _ in range(3)]))
assert out.count('ok') == 3, out
assert entered(r_a, shared) + entered(r_b, shared) == 3 and balance(shared) == 0 and raffle_debits(shared) == 3
print('PASS one wallet across two raffles: 3 of 6 succeed, zero overdraft')

# 6. Global invariant: ledger debits for raffle entries equal entries, and no wallet is negative.
assert sql("select count(*) from public.group_raffle_entries e left join public.fan_ticket_ledger l on l.id=e.ledger_id where l.id is null or l.amount<>-e.amount")== '0'
assert sql("select count(*) from (select app_user_id, sum(amount) s from public.fan_ticket_ledger group by 1) t where s<0") == '0'
print('PASS every raffle entry has exactly one matching debit; no negative wallet')
PY
