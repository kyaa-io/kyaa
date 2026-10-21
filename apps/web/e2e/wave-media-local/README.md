# WAVE media browser fixture

Run `node apps/web/e2e/wave-media-local/server.mjs` from the repository root. Uses the real WaveMediaFeed, composer, private upload hook, upload transport, polling and mutation code, with synthetic auth and a local HTTP media API. No production storage or member account is used. Vite cache is isolated in the OS temporary directory.

Open `http://127.0.0.1:4204/?locale=ko&scenario=lost-complete&run=unique-run&viewport=390`. `viewport=390` or `1440` wraps the actual component in an iframe of that CSS width; this is not mobile device emulation. A fresh `run` isolates API counters. Supported scenarios: `success`, `lost-complete` (first completion returns503), `poll-failure` (first processing GET returns503). A successful completion first returns `processing`, then polling returns `ready`.

Open the real upload dialog, select a synthetic JPEG through its real file input, observe loading/failure, use its per-file Retry and Publish. For Aside, use `locator(...).setInputFiles('artifacts/file.jpg')`; copy the file into the printed REPL session directory first. Paths outside that session are rejected. Primary Publish must remain disabled until every file is ready. The fixture's receipt output increments only for the app's activity-update event; the separate mission subscription count also increments on browser focus/visibility and is not a receipt count.

`GET /api/fixture/evidence` returns transport counts and request IDs. Pass a Referer containing the matching `run` when reading it outside the browser. After retry, verify reserve=1, PUT=1, bytes=file size, one asset ID/request ID, successful album POST=1. Composer unmount sends the existing DELETE cleanup request; the real server's adopted-asset behavior is outside this local API fixture.

Actual 2026-10-22 evidence is preserved in the original checkout at `work/kyaa-wave-ready-20261022/media-evidence/README.md`.
