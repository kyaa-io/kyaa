# Native support contract

`X-Kyaa-Asset-Contract: support-v1` opts wallet/history into the additional heart asset. Legacy wallet RPC/strict fields and legacy history's three-asset enum remain unchanged. The six-field `fanReward` remains unchanged.

All endpoints below are under `/api/me/mobile-fan-economy`, authenticate the owner from the bearer session, and return private no-store responses.

- `GET wallet?celebritySlug=...`: adds `supportVouchers` and `fanPointLedgerSequence`. Configured `policy` adds nullable `supportVoucherPointCost` and `supportVoucherAmountKrw` (both100 when enabled). Unconfigured policy remains `{status:"unconfigured"}`.
- `POST exchange`: existing request fields, with `target:"support_voucher"`. The active exchange policy must explicitly configure100 points per voucher. Existing free draw/vote operations and original request recovery remain intact.
- `POST support`: `{requestKey,celebritySlug,policyVersion,units}`. The active exchange policy and its maxUnits apply; exchange dailyRemaining is an issuance limit and is not consumed again by sending.
- `GET support/{requestKey}`: committed support receipt, `{status:"unknown"}`, or cancelled status. Original input recovery is independent of the current favorite/policy.
- Existing `POST requests/{requestKey}/cancel` accepts `operation:"support"` and `input:{celebritySlug,policyVersion,units}`. A committed operation is returned instead of cancelled.

A support receipt is `{requestKey,celebrityId,units,supportKrw,voucherLedgerId,policyVersion,createdAt,replayed}`. Internal `supportKrw` is exactly units×100. This records internal support; it is not a bank transfer or settlement receipt. Heart issuance does not affect rankings; sending debits the voucher ledger and creates an immutable contribution atomically.

Rankings accept the supported app locales (content names use the existing ko/en fallback), including `locale=ko|en`, `limit=1..100` (default20), and `offset=0..10000` (default0). Stable order is total units descending, first send time ascending, then ID. Photo/avatar URLs are normalized to configured public HTTPS URLs or null.

- `GET support/rankings`: `{items:[{rank,celebrityId,celebritySlug,name,imageUrl,supportUnits,supportKrw}],nextOffset}`.
- `GET support/rankings/{celebritySlug}`: `{celebrityId,items:[{rank,profileId,nickname,avatarUrl,supportUnits,supportKrw}],me:{rank,supportUnits,supportKrw},nextOffset}`.

Only active fans with explicitly public profile/favorite and no block in either direction contribute to public ranking rows/totals. Published, unarchived creators only. A private owner's own totals remain in `me`, with null rank. No examples are seeded into production.

For newly earned point presentation, capture `fanPointLedgerSequence` immediately before an actual mutation. Require its canonical source ID and non-replayed completion. `GET rewards/{sourceId}?afterSequence=...&celebritySlug=<original-activity-creator>` with support-v1 returns `{reward:<six-field fanReward>,ledgerSequence,newlyAwarded}`; the owned fan-point ledger sequence must be newer than the supplied cursor and belong to the supplied original creator. Without the new contract/query, the endpoint returns the original six fields. History/reload/read results alone must never trigger a new reward animation.

`POST activities/check-in {celebritySlug}` invokes the existing canonical check-in producer and returns `{awarded,sourceId,replayed}`; new stamps are true/false, repeated same-KST-day calls false/true. Query the reward envelope with that canonical source ID. This does not introduce or activate earning policies.
