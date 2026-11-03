# Pencil dev fixtures

These operator scripts target only the pinned AWS dev account and private RDS instance. They are never migration files and must not run against production. The base seed keeps stable synthetic IDs and preserves existing review/participation states.

1. Run `scripts/seed-groups-pencil-dev.mjs --config <private-config> --confirm-dev SEED_GROUPS_PENCIL_DEV_ONLY` to verify the AWS/database identity. Add `--apply` to seed the synthetic pages.
2. For web login, prepare a private regular `0600` identity-map JSON with `appId` and three ordered `actors`. Each actor has `n` (1 owner, 2 member, 3 manager), `privyUserId`, `email`, and lowercase `walletAddress`. These must be real **official test accounts in the pinned dev Privy app**, not invented subjects. Select the first embedded Ethereum Privy wallet, exactly as web authentication does. Never put OTPs, access tokens or app secrets in the map or Git. Verify the exact private path with `git check-ignore`.
3. Provide the dev `PRIVY_APP_ID` and `PRIVY_APP_SECRET` through the private operator process environment. Add `--identity-map <private-map> --bind-identities` to verify the map against the provider. Add `--apply` only after the disposable DB tests pass.
4. The binding transaction preserves the synthetic app user IDs and their fixture references. It rejects existing identity/wallet ownership and historical reward activity. Wallet creation produces the real welcome record; only that transaction's new welcome job is stopped with `DEV_FIXTURE_NO_BROADCAST` before commit. No worker can see an executable job. These deliberately failed dev fixture jobs **must not be manually retried**: administrator retry can reactivate them.
5. Future base-seed reruns must include the same `--identity-map`, without `--bind-identities`. A missing/wrong map fails closed; an identity map cannot replace the initial binding step. Rebinding with the same map is idempotent except normal authentication timestamps.

No auth runtime code, provider account, global worker flag or production record is changed. The fixture welcome stamp represents an intentionally stopped dev operation, not a successful onchain mint. Wallet points/hearts/tickets and raffle fixtures are separate work.

Checks:

```sh
node --test scripts/groups-pencil-dev-identities.test.mjs scripts/seed-groups-pencil-dev.test.mjs
BYUS_CLEAN_DB_PORT=55439 BYUS_CLEAN_DB_ASSERTION_FILE="$PWD/scripts/groups-pencil-dev-bind-identities.test.sql" bash scripts/verify-clean-migration-chain.sh
```

Repeat the clean replay with `scripts/groups-pencil-dev-bind-native.test.sql` to cover the native outbox route.

The SQL test seeds twice, binds twice, replays the base seed, checks stopped jobs and rejects a conflicting map before account writes. The binding itself calls normal login synchronization twice and rejects new actor-scoped jobs. Actual provider login, web UI and role verification remain distinct acceptance checks.

## Economy fixtures

Use the same verified map with `--seed-economy --apply` after binding. This seeds 240P, 2 hearts and 12 available tickets for each signed-in test role, plus the approved first raffle with 300 entries and 30 entries by actor 2. All credits are explicitly marked `groups_pencil_dev_fixture`; they are not earned attendance rewards. The existing dev wallet release must already be enabled and unfenced; the script does not change its release or attendance start date.

Fixed source IDs and exact ownership/configuration checks prevent duplicate credits. Replays preserve spending, cancellation, draw and fulfillment progress. The seed emits no chain jobs or notification intents while executing. Once the raffle deadline passes, the normal dev worker may draw it and create in-app winner notifications. No real contact details are seeded.

Verify with `BYUS_CLEAN_DB_PORT=55439 BYUS_CLEAN_DB_ASSERTION_FILE="$PWD/scripts/groups-pencil-dev-economy.test.sql" bash scripts/verify-clean-migration-chain.sh`. The test checks source/configuration collisions, replay after spending, rollback after a credit, and seed-time external-effect tables.

## Missing dev reward-policy bootstrap

If all policy version, tier and activation rows are absent, `--restore-policy --apply` restores the exact policy data from the original migrations and rechecks the v2 integrity gates in one locked transaction. The actual AWS caller, source paths/hashes and current recovery time are recorded in `audit_logs`. It does not fabricate an original migration audit or attribute the operator action to a test member. A healthy matching v2 bootstrap is unchanged; partial/conflicting data fails closed. This operation is restricted by the same exact dev AWS/RDS identity checks and never changes the group-wallet attendance start date.

Run `scripts/groups-pencil-dev-policy.test.sql` through the disposable clean migration harness before recovery. The test deliberately removes bootstrap data only after asserting a local Unix-socket `byus_clean` database; this test preparation must never be run against dev or production.
