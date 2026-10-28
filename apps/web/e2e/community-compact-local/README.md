# Community compact local verification

Run `node apps/web/e2e/community-compact-local/run.mjs` from the repository root. Use `--existing` to test an already running server. Add `--serve` for the persistent loopback server at port 4228. This uses the real CommunityScreen, FanAppFrame, FanPostFeed and PostCard with synthetic creator/fan/feed JSON and local photos; mutation endpoints reject writes. No production API is used.

Queries: `creator=elina|kara|yuna|music|wave|new`, `locale=<APP_LOCALES>`, `media=1`, `state=empty|error`, `counts=zero` (hides the hot list), `names=short` (normal-length creator names for captures), and normal community `tab` values. Fan counts and all displayed users/posts are synthetic. Feed page two is a synthetic cursor. Empty/error queries are fixture controls.

The automated matrix covers every APP_LOCALES language at 390/1440 and KO/JA/VI/TH at 360/768, overflow, heading/feed alignment, stable top-five ranks, image ratios, primary control sizes, selector keyboard/escape, creator navigation, media/reset/pagination and Axe KO/EN. Screenshots and evidence go to the checkout's `work/community-compact-20261028` (override with COMMUNITY_COMPACT_OUTPUT). Actual browser visual review remains separate.
