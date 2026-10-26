# GGGI fan page draft

`celebrity.json` is a validated `save` payload for the existing celebrity CMS.
It has not been submitted or published. The production page will use the existing
`/[slug]` route after an operator saves and publishes this record. The fan page itself uses the existing route; event entry adds the
API and migration described below.

The support action is the existing GGGI like. The optional message
opens the existing public fan board. GGGI alone shows the simple participation
entry instead of the home quiz prompt and completes likes inline without opening
the Passport follow-up dialog. Other creators keep their existing flow.

Official institution copy stays in its original English in both CMS locales.
`sources.json` records the original logo download and reused Changha portrait.
The earlier three-video/three-quiz proposal remains outside this first version;
no prize quantity, selection method, event schedule, or attendance is invented.

Preview: `node apps/web/e2e/gggi-local/server.mjs`, then
<http://127.0.0.1:4198/gggi>. The preview uses actual UI components with isolated
browser fixtures; see the harness README for unsupported account/media actions.
Production authentication, persistence, analytics delivery and publication still
need verification when the user approves an operational rollout.

## Review baseline correction (2026-10-26)

This branch starts at successful AWS production deployment 7323742082, commit
`1a256618489339811e6017f615eaefe8d1a1c1ac`. The original checkout was still
at the October 11 commit `28182c95d`; it is preserved with its other work.
The GGGI hero now follows the desktop identity split from 1024px, while
other brands keep their existing layout. All kyaa shell and Cognito client
changes come from the production baseline, not copied branding replacements.

## Goods event entry (2026-10-26)

The user confirmed: like GGGI, then explicitly enter once per account. The home
and Events tab show GGGI goods and Changha-related goods with details coming soon.
No contact information, quiz, Passport, ticket debit, or automatic entry is added.

`20261130003000_gggi_event_entry.sql` creates a draft event and an immutable
per-account entry record. It reuses the existing active-user and completed-like
checks. `/api/celebrities/gggi/event-entry` reads the event and accepts a bodyless
POST using the authenticated owner. Repeated submissions return the original
entry time, including after closing. `/api/admin/gggi-event` provides an authorized,
paginated read of entries. Prize selection and fulfillment are not implemented.

Only the local fixture is open. The migration seeds `gggi-goods-2026` as `draft`;
it does not publish the celebrity or start production entry. Opening/closing the
event is a separate operational configuration step after user review. No end date
is fabricated. Verification uses actual disposable PostgreSQL plus the existing
API handlers and Next request adapter; browser preview uses local fixtures.

Run `node scripts/verify-gggi-event-local-db.mjs` for database checks and
`node apps/web/e2e/gggi-local/run-event.mjs` for browser entry checks.
