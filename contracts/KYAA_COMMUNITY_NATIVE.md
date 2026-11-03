# Community Stamp native cutover

Action 12 is `COMMUNITY_STAMP_ISSUED`: exactly one Stamp and a creator. SQL and worker boundaries restrict it to `share` and `first_clip`. Actions 1–11, schema 1, existing issuance keys, EAS records, ownership and the immutable 15-image bundle retain their existing meaning. First Clip reuses the existing image, separately pinned in `apps/worker/assets/first-clip.manifest.json`.

## T0: deploy and schedule

`migrate-community-native-giwa.mjs` is an exact GIWA Sepolia operator for one Codec deployment, one V4 implementation deployment, and a 172800-second-or-longer timelock schedule. V4 changes only the existing codec storage slot; binding 2 and governance remain unchanged. It grants no new minter role. Review the exact manifest hash before `deploy-and-schedule`; never run the old three-contract migration CLI for this transition.

The operator persists each original signature before broadcast and recovers only that original hash. Uncertain transactions stop execution. Each receipt is canonical before progressing; completion rechecks every original receipt against canonical finalized blocks and verifies both deployed runtimes. Preserve the reviewed artifacts: Foundry output-selection changes can alter JSON SHA and immutable AST labels even when deployment bytes are identical. Rebuilds require artifact comparison and a newly reviewed manifest if pins differ.

## T2: enable the new producer

1. Integrate this change with the current release source before deploying the worker/web; preserve unrelated production changes. Confirm the scheduled operation is ready, both contracts are finalized, worker release supports action 12, and the reviewed implementation/Codec/runtime/roles/bindings still match. Execute the exact atomic `upgradeToAndCall(...initializeCommunityCodec())`; require finalized proof. Only then update the public implementation/Codec references to the activated addresses before the web release.
2. Apply `20261130000000_community_native.sql` through the owner migration workflow. It prepares a disabled route 12; it leaves existing share issuance untouched.
3. Verify binding 2, GIWA chain/Hub/new Stamp addresses, policy 1, creator verification and routes 7–10; pin the exact `supabase/community_native_cutover.sql` bytes. Its issuer SHA guard preserves the observed production lounge/notice/post and invite rules. The owner-only transaction activates route 12 and makes the six supported community kinds native-only. Do not replace the source verifier.
4. After commit, drain every pre-cutover transaction, including idle transactions, all legacy pending/claimed/retryable/failed jobs, binding-1 MINT outboxes, persisted signed submissions, leases and in-flight writers. Reconcile durable signatures only by their original hash. Require every remaining count to be zero before pausing old Stamp and revoking its legacy relayer MINTER role. Keep native writers running.

## T4: close the remaining migration

After old Stamp issuance is closed and finalized, capture the exact final old-source cutoff. Verify and schedule a separate immutable tail batch with the real timelock delay, then migrate it. Do not edit any of the original four manifests or hide extra sources to pass their 2303-source gate. Audit the exact union of the four manifests and the tail, public coverage, owner/key/URI/receipt correspondence, and business invariants before the already scheduled D72 migrator MINTER revocation. The original revocation helper remains blocked until a separately reviewed gate covers this final scope and the V4 authority fingerprint.

Use the current release checkout for inventory capture, source verification and replacement metadata so `first_clip` uses its reviewed standalone image. Use the original pinned execution checkout for D72 followup preparation and execution: its migrator compiler artifact is part of the existing deployment fingerprint. Do not rebuild or substitute that artifact. The old migration CLI inspector pins V3 and must not be used after V4 activation; verify V4 against the approved community plan instead. Legacy sources without an action retain zero source Hub/action identifiers; do not synthesize action 12 history. The tail is final old sources minus the four approved manifests, not minus a later inventory that already contains unmigrated sources.

## Verification evidence

The transition tests deploy pinned original V3 bytecode, compare action 1–11 hashes, preserve EAS/roles/bindings/pending retries and registered Merkle batches, and reject invalid init4 callers and action-12 credentials. Runtime size is 24531 bytes, below the 24576-byte limit by 45 bytes. The storage validator compares V4 with V3 and rejects an incompatible namespace fixture. SQL replay includes actual post and invite regressions, source tampering, idempotency, concurrent share/first-clip issuance and unchanged points/tickets. Public records include the new action with all supported locales; Collectible remains unavailable.

Operational receipts and private inventories belong in the original checkout's `work/` evidence directories. The transition is not complete while T2/T4, closure audits or role revocation remain pending.
