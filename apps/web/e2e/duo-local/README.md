# DUO local verification

Run `node apps/web/e2e/duo-local/server.mjs` from the repository root. This mounts the actual page and shared shell at `http://127.0.0.1:5198/benefits?locale=ko` with synthetic data. API writes return 405. It never connects to production.

Use the Aside browser skill and attach a temporary tab as `duoTab`. Copy `verify.js` into the Aside session directory and evaluate its contents in that REPL. It verifies 12 locales at 390 and 1440, numeric typography, overflow, image decoding, and exchange-sheet focus restoration. Raw snapshots and `duo-audit.json` stay in the session directory.

Additional cases: `auth=off`, `state=empty`, `state=zero`, `state=loading`, `state=error`, `state=no-favorite`, `long=1`. The fixture blocks all mutations, including exchange and attendance. Business transaction coverage remains in the existing Vitest suites.
