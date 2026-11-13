# Reward journeys (FUNC-E2E)

Real app → real routes → the local database copy. The pay and spend routes are never mocked; the database is only seeded, reset or read around them.

## Run

```
kyaa-t3 localdev-prod <worktree> 3002          # production build on a Privy-allowed port (3000–3003)
kyaa-t3 local-login dev-fan-5 --port 3002      # storage state with a Privy Development token (about 43 minutes)
npm run test:e2e:rewards --workspace @byus/web
```

For the email browser login replay case, set `REWARD_E2E_EMAIL_STORAGE_STATE` to a Playwright storage state containing the local `__Host-kyaa-email` cookie and `REWARD_E2E_EMAIL_ACCOUNT` to the matching local fixture account. The login response only confirms cookie issuance; the helpers verify the authenticated `/api/auth/cognito/session` response and use its in-memory `kyaa-email:` access token. The new case sends attendance from a cookie-only browser, drops the first response after the local server processes it, and retries with the same request key. It requires the disposable loopback app and database; it is skipped when no email state is supplied. No Dev or production connection is needed. The read-only member smoke accepts the same cookie-only storage state and resolves its API token through that session endpoint.

`REWARD_E2E_BASE_URL` (default `http://localhost:3002`), `REWARD_E2E_ACCOUNT_PRIMARY` (default `dev-fan-5`). The suite refuses any non-loopback app or database (`assertLocalOnly`). A missing or expiring login stops it with the command to run.

## What each journey proves

"UI click start" = the test begins by clicking a real button on the signed-in screen. Everything else starts from the real route with the member's token (the same request the button sends).

| File | Journey | UI click start | Numbers checked |
| --- | --- | --- | --- |
| `e-ui-clicks.spec.ts` | 출석 row → sheet → "오늘 출석하고 …" | **yes** | the screen's own request returns 200 with the catalog points; ledger −/+ and 1 `daily_checkin` stamp read from the database; after `page.reload()` the same 포인트 and 스탬프 1/9 |
| `e-ui-clicks.spec.ts` | 교환 tile → sheet → exchange button | **yes** (ad step isolated, below) | request 200, 100 spent for 1 ticket; one −100 ledger row and one ticket row; after reload 포인트 50 / 응모권 1 |
| `a-dukjil-reward.spec.ts` | attendance + cheer | no (route) | points = catalog rule, 1 stamp per action, wallet and today API agree after a fresh read |
| `b-idempotency.spec.ts` | same key again; 5 same-key + 5 new-key concurrent; response lost in the browser then retried | no (route; the lost-response case runs in a browser page) | 1 point-ledger row, 1 stamp, balance = one payout |
| `c-exchange.spec.ts` | 100P → ticket through the real ad-session routes | no (route) | −100 / +1 share one request key; replay and 8-way concurrency spend once; not enough points refuses whole and leaves the ad session unused; a used session cannot pay twice; balance never below 0; wallet screen shows 150 |
| `d-stamp-heart.spec.ts` | 9 stamps → rewarded ad → heart (20261223100000) | no (route) | 8 stamps: no ad session (409, 0 hearts); 9 stamps: claim without a session 400 `GROUP_WALLET_AD_SESSION_REQUIRED`, a shown-but-not-granted session or a ticket session 409, 0 hearts; a granted page session pays 1 heart + jjinfan title and is consumed; replay and burst with that session keep 1 heart; no new session for a claimed page; page 2 refuses; no favorite → `favorite_required`, wallet and stamps unchanged |

Ad isolation in the exchange click journey: the screen first calls `POST /api/me/wallet/ad-session`; the server hands back a session that was watched and not yet spent, and the screen then sends the exchange. The test prepares that session through the real session routes (shown → granted, with the session time moved back one hour instead of waiting out the minimum viewing time). The Google rewarded ad itself is not run. The exchange route and the ledgers are real.

## What "N pass" proves

- Proves: with the local database copy and the app built from this tree, the listed requests give the listed numbers, the ledger rows match, and a reload shows them. A mutation check backs this up (below).
- Does not prove: anything on Dev or production (different data, policy, ad config, Privy app); the Google ad; real devices; the B3 once-per-day cheer (skipped under policy v1); layout; the closed lucky draw state; users other than the one reset test member.
- Mutation check (done once, by hand, not committed): `attend_creator` paid +1 and `exchange_owned_group_wallet` spent 90 instead of 100 in the local database for about a minute, then the original definitions were restored and compared byte for byte. 6 of 11 failed on the number (`a`, `c` replay, `c` concurrent, `c` used-session, both `e` clicks). Still green, as expected because they do not read the amount: `b` idempotency (relative numbers), `d` hearts. Not caught: `c` "not enough points" (150 points vs 2 units is refused at 90 as well), so it is blind to a small change in the price.

Seeding: `Member.reset()` removes the member's reward rows (ledgers are append-only for the app, so the reset runs in one transaction with `session_replication_role = replica`, only for the test member), then sets the favorite creator. `seedPoints` posts through `group_wallet_post`; stamps 1, 3–9 of page 1 go through `dukjil_issue_stamp`; the rewarded-ad minimum viewing time is covered by moving the session time back one hour.

## Release gate tag

Every journey above carries `@release-gate`: `npm run test:e2e:release-gate --workspace @byus/web`. Measured on this Mac against a local production build: the route journeys take 17–23 s and the two click journeys about 45 s each (the first member request leaves about 15 s after the page opens on this machine), about 2 minutes in all against the 5 minute budget, so no journey had to be dropped. It needs the local app + database + a Privy test login, so it runs on the Mac before the push or the release gate, not in the temporary-Postgres push-gate.

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
