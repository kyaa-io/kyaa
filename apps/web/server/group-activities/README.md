# Group activities (web)

Uses the existing bearer/admin authorization, RDS/PostgREST RPC, immutable request
receipt and global-wallet patterns. It does not repurpose mobile event rows that
require a Creator, create fictitious LIVE records, or seed example operation data.

All routes stay behind `KYAA_GROUPS_ENABLED`. Published event/mission/collection
reads allow guests; supplied credentials are verified. Writes use the server's
actor. Page owners/managers operate their page. Official approval and mission
reward budget need writable platform-admin authority.

The response schemas/types live in `domain.ts` and are safe to import in clients.
All standalone lists return `nextCursor` from a real extra row, including the two
admin lists. Activities combines its actual event/mission sources with the root's
`group_raffle_list` RPC. It never fabricates empty raffle data on a failed RPC.

## Public/member routes

- `/api/groups/:id/activities`, `/events`, `/events/:eventId`.
- Event POST creation and PATCH edit require the complete `eventInput` in routes.ts;
  edits carry expectedRevision. Membership and event application are independent.
- POST/DELETE `/events/:eventId/applications` with requestId applies/cancels.
- GET `/events/:eventId/ticket` returns an opaque owner-only QR; participant lists
  do not return ticket tokens. Check-in requires a confirmed member and page staff.
- GET `/events/:eventId/participants`, PATCH `/:registrationId` confirm/reject.
- POST `/events/:eventId/check-in` requestId+qrPayload is replay-safe.
- POST `/events/:eventId/review` requestId+body needs actual check-in and event end.
- POST `/events/:eventId/official-application` preserves separate submissions and
  platform review states; approval is tied to the event revision.
- GET/POST `/collections`, PATCH `/collections/:itemId`; external checkout only.
  Hidden items are manager-only. Original external query/hash is retained.
- GET/POST `/missions`, GET/PATCH `/missions/:missionId`.
- GET/POST `/missions/:missionId/submissions`; PATCH `/:submissionId` approves or
  rejects. Participant/submission DTOs include nickname and avatarUrl, never require
  displaying an internal account ID.

## Platform routes

- GET `/api/groups/admin/official-events`: items include application snake_case
  source fields plus page_id,event_title,page_name; writable review is PATCH
  `/admin/pages/:pageId/events/:eventId/applications/:applicationId`.
- GET `/api/groups/admin/missions`: mission DTO plus pageId,pageName,budgetPoints,
  submissionCount. PATCH `/admin/pages/:pageId/missions/:missionId/reward-policy`
  requires requestId,rewardPoints,budgetPoints. A submitted mission's policy cannot
  be replaced. A point reward cannot exceed its explicit admin-approved budget.
- POST `/admin/pages/:pageId/events/:eventId/check-in` supports platform staff.

## Refund/locking extension

The migration adds private `group_wallet_refund_lock(owner)` and
`group_wallet_refund(owner,positiveAmount,entryId)`. These return existing rights
to a suspended user without permitting a debit/exchange or exposing a service RPC
mint. The root raffle cancellation must verify original entry ownership and amount
before calling this helper. Global sequence, original ledger and write fence remain
in force. Legacy benefit refund and campaign cancellation use the same protected
path; disabled release retains legacy behavior.

Mission approval acquires the multi-user barrier before actor/recipient account
locks; positive configured rewards are posted once to the original common ledger.
A zero reward does not invent a point or onchain stamp.

## Local checks

New activity routes have9 tests. Together with9 wallet and14 legacy economy route
cases,32 tests pass; owned server directories pass ESLint. Actual SQL fixtures cover
pending/confirmed/ticket/check-in/review flow, forbidden/cross-page/capacity cases,
platform-only official/budget actions, original supplementation, hidden collections,
configured mission credit once, old rights returned to a suspended owner, and real
admin pagination. Full migration replay is recorded in the original checkout's
work/kyaa-groups-production-20261101/activities-sql-tests.log.

No production RDS, migration activation or deployment was run by this worker.

## Event operations follow-up (090)

- QR check-in reports `alreadyCheckedIn` for a different scan request and `replayed` for recovery of the same request. Active confirmed members only; QR and manual check-in both preserve the original timestamp.
- Participants accept a literal nickname `search` before n+1 pagination. Manual check-in is `POST .../participants/:registrationId/check-in` with `requestId`, the selected participant's exact `confirmedName`, and a nonempty fallback `reason`. It never approves a pending application. Every distinct scan/manual action has an immutable audit row.
- Official applications have owner GET history, `start_review`/`reviewing`, and supplementation through `previousApplicationId`. New submissions append and retain the original description and source URL.
- Event supporting evidence is independent of official registration: `GET/POST .../events/:eventId/support`. Reads aggregate actual check-ins and linked reviews; descriptions/URLs form immutable source revisions using `previousSubmissionId`. Platform admins list `/admin/event-support` and review through `/admin/pages/:pageId/events/:eventId/support/:submissionId`. Supporting evidence approval issues no currency and changes no official badge.
- The wrapper enforces `group_scope_visible` before page-scoped reads or mutations, including WAVE's existing check-in gate. Original 400 RPC is private behind this adapter. Regression: `supabase/tests/group_event_operations.sql`; explicit WAVE fixture: `group_scope_fixture.sql`.
