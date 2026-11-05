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
- POST `/api/me/wallet/exchange`: requestKey, policyVersion, target heart/ticket, units, adSessionId (required for both; each exchange is fixed at 1 unit per rewarded-ad session).
- POST `/api/me/wallet/ad-session`: issues one server-side rewarded-ad session (refused before the ad when gate/config closed, daily cap reached, balance < 100P, rate limited, or write-fenced).
- POST `/api/me/wallet/ad-session/report`: sessionId, event `shown`|`granted`; server-clock compare, a `granted` sooner than the minimum viewing seconds voids the session.
- POST `/api/me/wallet/support`: requestKey, policyVersion, celebritySlug, units.
- POST `/api/me/wallet/check-in`: requestKey only.
- GET `/api/me/wallet/requests/:requestKey`: committed/unknown/legacy.
- GET `/api/me/wallet/history?limit=30`: common free-asset ledger history.

Policy version is `group-wallet-v1`: 100P per heart or ticket; hearts and tickets both need a granted ad session (below); daily10P
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

## Rewarded-ad exchange for hearts and tickets (web)

Web rewarded ads (GPT) have no server-side verification. The session design raises forgery cost, caps daily damage and leaves records to reconcile; it cannot prove an ad was watched. One server decision (`rewardedExchangeDecision`, `features/group-wallet/rewarded-config.ts`) feeds the unit meta, CSP and routes: flag `KYAA_REWARDED_TICKET_EXCHANGE_ENABLED=true`, a valid `KYAA_REWARDED_AD_UNIT` and all five positive-integer values below. There are no defaults; any missing value closes heart and ticket exchange (`AD_GATE_CLOSED` 403 / `AD_CONFIG_MISSING` 503) and no ad is requested.

`KYAA_REWARDED_AD_SESSION_TTL_SECONDS`, `KYAA_REWARDED_AD_MIN_WATCH_SECONDS`, `KYAA_REWARDED_AD_ISSUE_LIMIT`, `KYAA_REWARDED_AD_ISSUE_WINDOW_SECONDS`, `KYAA_REWARDED_AD_DAILY_CAP` (per-account exchanges per KST day, hearts and tickets together). The deploy script validates them. Order: issue session, then ad, report shown, report granted, exchange (consumes the session in the same transaction). Errors: `AD_SESSION_REQUIRED` 400, `AD_SESSION_INVALID` 409, `AD_DAILY_LIMIT` 429, `AD_RATE_LIMITED` 429.

Daily reconciliation queries (read-only, run by an operator; no automated job):

```sql
-- per KST day: issued / shown / granted / consumed / voided by reason
select (issued_at at time zone 'Asia/Seoul')::date d, count(*) issued, count(shown_at) shown, count(granted_at) granted, count(consumed_at) consumed,
 count(*) filter (where void_reason='too_fast') too_fast, count(*) filter (where void_reason='expired') expired, count(*) filter (where void_reason='replaced') replaced
from public.group_wallet_ad_sessions group by 1 order by 1 desc;
-- tickets exchanged per account per day (compare with the daily cap and the ad network report)
select app_user_id, (consumed_at at time zone 'Asia/Seoul')::date d, count(*) from public.group_wallet_ad_sessions where consumed_at is not null group by 1,2 order by 3 desc;
-- every consumed session must match one heart or ticket exchange receipt
select s.id from public.group_wallet_ad_sessions s left join public.group_wallet_receipts r on r.app_user_id=s.app_user_id and r.request_key=s.consumed_request_key and r.operation='exchange' where s.consumed_at is not null and r.request_key is null;
```

> 적용 상태: 마이그레이션 `20261209010000`(광고 세션)은 dev DB에 적용되었고 운영 DB에는 적용되지 않았다. 하트·응모권 교환은 `20261209010000`과 `20261209160000`(하트도 광고 필수)이 적용되고 서버 게이트가 켜져야만 열린다.
