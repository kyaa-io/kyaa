# Reward journeys (FUNC-E2E)

Real app → real routes → the local database copy. The pay and spend routes are never mocked; the database is only seeded, reset or read around them.

## Run

```
kyaa-t3 localdev-prod <worktree> 3002          # production build on a Privy-allowed port (3000–3003)
kyaa-t3 local-login dev-fan-5 --port 3002      # storage state with a Privy Development token (about 43 minutes)
npm run test:e2e:rewards --workspace @byus/web
```

`REWARD_E2E_BASE_URL` (default `http://localhost:3002`), `REWARD_E2E_ACCOUNT_PRIMARY` (default `dev-fan-5`). The suite refuses any non-loopback app or database (`assertLocalOnly`). A missing or expiring login stops it with the command to run.

## What each journey proves

| File | Journey | Numbers checked |
| --- | --- | --- |
| `a-dukjil-reward.spec.ts` | attendance + cheer | points = catalog rule, 1 stamp per action, wallet and today API agree after a fresh read |
| `b-idempotency.spec.ts` | same key again; 5 same-key + 5 new-key concurrent; response lost in the browser then retried | 1 point-ledger row, 1 stamp, balance = one payout |
| `c-exchange.spec.ts` | 100P → ticket through the real ad-session routes | −100 / +1 share one request key; replay and 8-way concurrency spend once; not enough points refuses whole and leaves the ad session unused; a used session cannot pay twice; balance never below 0; wallet screen shows 150 |
| `d-stamp-heart.spec.ts` | 9 stamps → heart | 8 stamps refuse (409, 0 hearts); the 9th pays 1 heart + jjinfan title; replay and burst keep 1 heart; page 2 refuses; no favorite → `favorite_required`, wallet and stamps unchanged |

Seeding: `Member.reset()` removes the member's reward rows (ledgers are append-only for the app, so the reset runs in one transaction with `session_replication_role = replica`, only for the test member), then sets the favorite creator. `seedPoints` posts through `group_wallet_post`; stamps 1, 3–9 of page 1 go through `dukjil_issue_stamp`; the rewarded-ad minimum viewing time is covered by moving the session time back one hour.

## Release gate tag

Every journey above carries `@release-gate`: `npm run test:e2e:release-gate --workspace @byus/web`. Measured on this Mac against a local production build: 10 passed, 1 skipped, 17–23 s (budget 5 min), so no journey had to be dropped. It needs the local app + database + a Privy test login, so it runs on the Mac before the push or the release gate, not in the temporary-Postgres push-gate.

## Read-only smoke for a deployed site

`smoke/readonly-smoke.spec.ts`, config `playwright.smoke.config.ts`:

```
SMOKE_BASE_URL=https://kyaa.io [SMOKE_STORAGE_STATE=<test account storage state>] npm run test:e2e:smoke:readonly --workspace @byus/web
```

- Guest: `/api/health/live`, home, notices (list has links), 덕질하는 법 guide, 덕질 screen with the lucky draw area ("지난 럭키드로우"), each under a 30 s load budget (`SMOKE_NAVIGATION_BUDGET_MS`).
- Member (only with a storage state): `/api/me/wallet` numbers are integers ≥ 0, cost 100, policy `group-wallet-v1`; `/api/me/dukjil/today` has today's KST date and an active policy; `/my/wallet` and `/benefits` show those exact points and tickets; `/passports` lists the passport with its x/9 stamps.
- No business write (not "zero writes"): every same-origin request other than GET/HEAD/OPTIONS is aborted in the browser by route interception (`smoke/guard.ts`), before any network I/O, and an aborted attempt fails the test. Allowed writes are exact: same-origin `POST /api/events` (analytics beacon, an analytics write) and `auth.privy.io` at `/api/v1/sessions` and `/api/v1/analytics_events` only. Any other third-party write is aborted and listed in the test annotations. Signing in also lets the server refresh the member's last-sign-in time, which is not a reward write.
- The guard is proven by `smoke/guard.spec.ts`, which never contacts a real site: it uses the unresolvable origin `smoke-guard.invalid`, fires business POSTs, a lookalike Privy host and a non-listed Privy path, and shows they fail with `ERR_BLOCKED_BY_CLIENT` (route abort) while only the allowed beacon reaches name resolution (`ERR_NAME_NOT_RESOLVED`). That is a separate fact from the ledger check: locally the member's ledger, ticket, stamp and action-log counts were identical before and after a smoke run (all 0 at the start, so that comparison alone is weak).
- Not run against `https://kyaa.io` or Dev. Guest checks need no login. The member checks stay unverified for deployed sites until a storage state for a test member of that site exists; this suite does not ask for one.

## Not covered here (and why)

- Public lucky draw "closed" state and the unchanged wallet: the local app runs with `BYUS_DATA_ENVIRONMENT=development`, where entries are open. The closed path needs a production-data-environment server; only the route unit contract covers it today.
- The 3-day steady check-in boundary, lucky draw → result → MY, gift tab, ranking pills, fan board uploads: next journeys.
- One cheer per KST day (`concurrent cheers on one day stamp once`) is skipped while the database's active dukjil policy has no `cheer.sourceMode = user_day` (B3 policy). Under policy v1 a second cheer returns 409 `SOURCE_REUSED` instead of a replay.
