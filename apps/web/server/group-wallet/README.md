# Common web wallet

This is the web-only common account over the existing `fan_ticket_ledger` and
`mobile_fan_economy_ledger`; it does not create a second spendable balance or
migrate paid vote/store rights. Historical rows/receipts remain immutable.

`20261201020000_group_wallet.sql` defaults to disabled and write-fenced. It does
not activate production. The release owner must reconcile source balances and
unfinished rights, verify all writers, and bind that evidence hash before enabling.
New policy starts on the configured KST date; old Creator check-in point producers
cannot also award on or after that date. Existing stamps/XP are not reissued.

## HTTP

All methods authenticate from the bearer token, return private/no-store, and reject
client owner/date/price fields. Amounts must fit safe integers; a missing or invalid
balance is an error rather than zero.

- GET `/api/me/wallet`: points/hearts/tickets/global sequence, policy, attendance.
- POST `/api/me/wallet/exchange`: requestKey, policyVersion, target heart/ticket, units.
- POST `/api/me/wallet/support`: requestKey, policyVersion, celebritySlug, units.
- POST `/api/me/wallet/check-in`: requestKey only.
- GET `/api/me/wallet/requests/:requestKey`: committed/unknown/legacy.
- GET `/api/me/wallet/history?limit=30`: common free-asset ledger history.

Policy version is `group-wallet-v1`: 100P per heart or ticket, no ad gate; daily10P
plus20P every seventh consecutive KST date. Missing a date resets the streak;
month boundaries do not reset it. Old keys/tombstones conflict with a new operation;
legacy status must recover through the original API/input, not issue a new key.
Sending uses the original Creator-linked contribution table and FK. Its zero-length
retired audit policy never replaces the Creator's active exchange policy.

`group_wallet_lock(owner)` takes a shared campaign barrier before its account lock.
Campaign cancellation and the three invitation qualification entry points use the
exclusive barrier before acquiring accounts in sorted order. The insert guards
assign one cross-ledger sequence and enforce the same common balance for legacy
refund/credit writers too. The capsule uses `group_wallet_post(owner,'ticket',-n,
'group_capsule',requestKey)` in the same transaction as its inventory/results.

## Verified locally

- 9 new HTTP/domain tests and14 unchanged legacy route tests:23 passed.
- Whole clean migration chain,410 migrations, plus `group_wallet.sql`: passed.
- Two-session debit race: one debit commits, the other fails with no overdraft or
  sequence increment. Reciprocal invitation lock order: both sessions complete.
- Actual SQL fixtures cover old balances/replay, paid/vote isolation, new exchange,
  support FK/replay, seventh/fourteenth-day bonus, daily duplicate suppression,
  legacy check-in producer suppression, old cancellation keys and write fences.

Evidence is under the original checkout's
`work/kyaa-groups-production-20261101/wallet-sql-tests.log`.
Production data reconciliation and activation are not established by these fixtures.
