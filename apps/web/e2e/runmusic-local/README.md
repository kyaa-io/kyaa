# RUNMUSIC local browser fixture

This disposable Vite harness renders the production `RunmusicScreen`, its results mode and `RunmusicManager` with real shared styles and components. Auth/session and every API response are local example data; no real member, contact, draw, delivery or production API is used. API requests that bypass the fixture fail closed. The Playwright runner also blocks external origins.

Run from the repository root with Node 24:

```sh
PATH=/Users/jewel/.nvm/versions/node/v24.13.1/bin:$PATH node apps/web/e2e/runmusic-local/run.mjs
```

The runner owns port 4211 and closes both Chromium and Vite in `finally`. Evidence defaults to portable `test-results/runmusic-local`; set `RUNMUSIC_QA_OUTPUT` to override it. The current task used `/Users/jewel/Desktop/Developement/byus/work/runmusic-simple-entry-20261023/browser`. `results.json` records successful checks and any console/page errors, blocked external requests or assertion failure. A failed run is never reported as passing.

For direct visual review:

```sh
PATH=/Users/jewel/.nvm/versions/node/v24.13.1/bin:$PATH node apps/web/e2e/runmusic-local/server.mjs
```

This standalone server uses port 4212. The caller owns its process and must stop it after review. Example: `http://127.0.0.1:4212/connect/runmusic?scenario=missing-contact&locale=ko`. Results use `/connect/runmusic/results?scenario=winner`; admin uses `?scenario=admin&view=admin`. Available states: `new`, `existing`, `missing-contact`, `winner`, `loser`, `pending`, `processing`, `not-entered`, `closed`, `restoring`, `paste-denied`, `contact-save-error`; append `auth=off` for guests. `role=viewer` supplies a read-only admin session.

The fixture preserves the approved October 24, 2026 23:59 KST deadline and fixes `Date.now()` before or after it according to scenario. Screenshot files show local synthetic data. Browser checks cover 11 production locales at 390/1440px, keyboard focus/close/return, KakaoTalk ID input/paste → like → confirm entry (one contact-bearing entry request), plus existing-participant contact editing, clipboard denial, save retry, guest return links, result states, admin reveal/hide/collection, overflow and KO/EN accessibility. The actual ManagedHomeBanner uses production home carousel frame classes and the final 1774×887 desktop / 1122×1402 mobile assets. Banner checks include 390/768/1440px and local event link navigation. Actual visual judgment remains a separate review of the screenshots/live page.
