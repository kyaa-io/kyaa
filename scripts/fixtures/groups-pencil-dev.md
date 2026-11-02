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
