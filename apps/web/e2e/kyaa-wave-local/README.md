# KYAA WAVE local verification

Uses the production fanpage, event UI, shared overlays and CSS with synthetic Privy identities and loopback API fixtures. Fixture dates and participation are not production data; database logic is checked by the Supabase SQL and concurrency tests.

```sh
node apps/web/e2e/kyaa-wave-local/server.mjs --serve
KYAA_WAVE_LOCAL_URL=http://127.0.0.1:4198 node apps/web/e2e/kyaa-wave-local/run.mjs
node apps/web/e2e/kyaa-wave-local/locales.mjs
```

`run.mjs` checks both creators at 390/1440, checked dismissal/reload, remaining banners, posting, closed state and French copy. `locales.mjs` checks all 11 languages at 390/1440 plus KO/JA/VI/TH at 360/768. This harness never calls a production API or executes a draw.
