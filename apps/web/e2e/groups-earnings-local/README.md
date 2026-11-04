# Earnings UI local verification

All responses are **synthetic local fixtures**, not DEV or production data. The harness mounts the actual GroupEarningsScreen/GroupEarningResult, GroupShell, GroupActivityHeader and request/session resource helper. Auth and Next browser adapters only are local; no server, database or real authentication is connected. It does not use or modify groups-local.

Run from apps/web: `node e2e/groups-earnings-local/server.mjs` (loopback port 5191, strict port). Browser suite: `node e2e/groups-earnings-local/run.mjs`. Screenshots and checks live in `evidence/`; screenshots have only public artist artwork and synthetic values. The synthetic origin must be disclosed when images are used in release notes.

Route: `/pages/groups/10000000-0000-4000-8000-000000000001/earnings?locale=ko`. Harness-only states: ready, all, long, empty, error, loading, restoring, forbidden, missing, unauthorized, malformed, retry, delayed, page. `auth=off` shows guest, `kind=hobby|brand` checks non-fan scope. No fixture toggles appear in the product UI. `window.earningsFixture` provides test-only transitions and delayed-response release.

Installed Next16 page conventions were read before implementing the actual Next pages. The Vite harness exercises production client components, not Next server rendering. Dedicated page unit tests check feature gate, params, cursor bounds and locale. Integrated typecheck/Next runtime/DEV evidence belongs to the parent.
