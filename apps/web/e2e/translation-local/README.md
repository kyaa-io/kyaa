# Translation UI fixture

Run `node apps/web/e2e/translation-local/run.mjs` from the repository root with Node 24. The existing product components use synthetic auth and local API responses; the fixture never calls Google or reads production content.

The test covers every registered fixture locale (including Russian) at 390px and 1440px, visible-only automatic translation, successful request reuse, original viewing, retry after failure, public guest translation, actual language selection, rich-notice media/link/format retention, keyboard focus, minimum touch target size, overflow and Axe. An initial preview smoke test runs without browser request interception so the standalone API middleware is also exercised.

For manual browser review, run `node apps/web/e2e/translation-local/preview.mjs` and open `http://127.0.0.1:4217/?locale=ru`. Stop the preview with Ctrl-C when finished. Screenshots and `evidence.json` are written to `work/translation-ui/`; the production rollout must be checked separately.
