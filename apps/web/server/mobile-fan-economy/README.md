# Native support contract

`X-Kyaa-Asset-Contract: support-v1` opts wallet/history into the additional heart asset. Legacy wallet RPC/strict fields and legacy history's three-asset enum remain unchanged. The six-field `fanReward` remains unchanged.

All endpoints below are under `/api/me/mobile-fan-economy`, authenticate the owner from the bearer session, and return private no-store responses.

- `GET wallet?celebritySlug=...`: adds `supportVouchers` and `fanPointLedgerSequence`. Configured `policy` adds nullable `supportVoucherPointCost` and `supportVoucherAmountKrw` (both100 when enabled). Unconfigured policy remains `{status:"unconfigured"}`.
- `POST exchange`: existing request fields. Target is `free_draw` or `free_vote`; `support_voucher` (heart) is refused with 400 before the database is called. Hearts come only from passport page Claim.
- Existing `POST requests/{requestKey}/cancel` accepts `operation` exchange|vote|vote_intent (`support` was removed with the point-to-heart paths).


Rankings accept the supported app locales (content names use the existing ko/en fallback), including `locale=ko|en`, `limit=1..100` (default20), and `offset=0..10000` (default0). Stable order is total units descending, first send time ascending, then ID. Photo/avatar URLs are normalized to configured public HTTPS URLs or null.

- `GET support/rankings`: `{items:[{rank,celebrityId,celebritySlug,name,imageUrl}],nextOffset}`.
- `GET support/rankings/{celebritySlug}`: `{celebrityId,items:[{rank,profileId,nickname,avatarUrl,supportUnits,supportKrw}],me:{rank,supportUnits,supportKrw},nextOffset}`.

Only active, unrestricted fans with an explicitly public favorite and no block in either direction contribute to public ranking rows/totals. Published, unarchived creators only. A private owner's own totals remain in `me`, with null rank. No examples are seeded into production.

For newly earned point presentation, capture `fanPointLedgerSequence` immediately before an actual mutation. Require its canonical source ID and non-replayed completion. `GET rewards/{sourceId}?afterSequence=...&celebritySlug=<original-activity-creator>` with support-v1 returns `{reward:<six-field fanReward>,ledgerSequence,newlyAwarded}`; the owned fan-point ledger sequence must be newer than the supplied cursor and belong to the supplied original creator. Without the new contract/query, the endpoint returns the original six fields. History/reload/read results alone must never trigger a new reward animation.

`POST activities/check-in {celebritySlug}` invokes the existing canonical check-in producer and returns `{awarded,sourceId,replayed}`; new stamps are true/false, repeated same-KST-day calls false/true. Query the reward envelope with that canonical source ID. This does not introduce or activate earning policies.

Fan support rows give other members `rank`, `nickname`, `avatarUrl` and `isMe` only. Units are amounts (one unit is 100 won), so a member's totals appear only in their own `me`. Creator rows have no amounts and their order ignores the viewer's blocks, because a total compared before and after a block gives one member's exact amount.
