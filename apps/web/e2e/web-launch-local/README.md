# Kyaa local product verification

Run Node 24 from the repository root:

```sh
node apps/web/e2e/web-launch-local/server.mjs
node apps/web/e2e/web-launch-local/run.mjs
```

The server uses strict port 4269 and actual product components. Only auth, Next navigation/image adapters and API responses are isolated. Photos are existing public assets; creator names, balances, members, transactions and results are intentionally synthetic. Nothing is posted to production. Every `/api/` request is intercepted in the browser; unhandled paths return a visible 404 error rather than calling production.

Views: `/?view=home|fandom|support|my|result|dashboard&locale=ko`. States: `state=empty|error|long|unconfigured`, `auth=off`, `owner=a|b`, `outcome=unknown`. `viewport-review.html` places actual product screens inside 390px and 1440px same-origin iframes for native browser inspection.

The runner records all 11 languages at 390px/1440px and KO/JA/VI/TH at 360px/768px, plus empty/error/long/guest states. It measures page overflow, loaded images, 44px interactive targets, axe findings and keyboard language-menu focus. Missing actual components are failures, never substitutes. `QA_VIEWS`, `QA_BASE_URL`, and `QA_OUTPUT` allow focused reruns of changed views.

The fixture is browser-only and does not verify server SQL, authorization or settlement. Unit/integration/database tests remain separate. The parent agent performs Aside visual review and the existing passport-run checks.

Additional browser checks:

```sh
node apps/web/e2e/web-launch-local/flows.mjs
node apps/web/e2e/web-launch-local/participation-flows.mjs
node apps/web/e2e/web-launch-local/dialog-run.mjs
```

`run.mjs` also accepts `QA_LOCALES`, `QA_WIDTHS`, `QA_SKIP_STATES=1`, `QA_SUPPORT_TAB=lucky|history`, `QA_METRICS_ONLY=1` and `QA_REPORT`. `dialog-run.mjs` accepts `QA_DIALOGS`, `QA_LOCALES`, `QA_WIDTHS`, `QA_REPORT`. These permit rerunning only the changed evidence. Reports preserve source/fixture hashes; previous failure reports are kept. Radio/checkbox target measurements use the associated clickable label.

Use `viewport-review.html?view=fandom&width=390` or `width=1440` for one exact-width iframe. Without `width`, both previews remain visible. Review-state changes in the synthetic API are observed with an actual browser reload; automatic review polling is not claimed.

`proof-focus.mjs` separately checks focus restoration after a file-upload response at 390px and 1440px, including visible focus and Escape return to the mission trigger. Native system-file-chooser inspection remains the parent agent's Aside task.

`dashboard-flows.mjs` checks pending, DB-only failure, GIWA-only failure and confirmed zero counts at both widths. Its response overrides stay in that disposable browser context and never alter the shared preview. Set `QA_NO_SCREENSHOTS=1` on flow scripts to preserve existing PNGs.
