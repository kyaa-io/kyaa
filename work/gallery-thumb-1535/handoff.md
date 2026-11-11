# GALLERY-THUMB-1535 — code handoff

ROOT: public /api/celebrities/elina/media?locale=ko returned 200 with eight TikTok videos, each image:null. Exact links preserved in root-public-api.json. The official-notice link parser feeds these videos; MediaThumbnail renders Image, not a video first frame. The request-time oEmbed cover is not persisted and compact fallback hid text. No operational DB access.

Overlap: fast-forwarded f77579fa4 (SNS-INGEST-INT-1520) into this isolated branch. Its dependencies.ts fetchImage implements bounded download/no redirects, source-url.ts implements CDN URL allowlisting. Both reused without a new public downloader or fetch endpoint. The other worktree's uncommitted result.md was not copied or altered.

MIGRATION: 20261222000000_sns_ingest.sql prerequisite, then BOTH 20261222001000_video_thumbnails.sql and 20261222002000_sns_thumbnail_storage_reservation.sql. New table is private/RLS; register/read RPCs service-role only. Public image delivery rechecks notice visibility and both S3 objects ready. SQL pair tested in a new disposable local PostgreSQL cluster with no env files/credentials, stopped after tests. No operating/dev/shared database writes.

New IG video/TikTok covers are a separate collector field, copied via existing CDN downloader and image normalization into mobile-media sns-ingest paths before publishing. Original notice text/body remain unmodified. Image metadata must be registered before S3 upload; this fixes the inherited registration-after-upload reservation conflict for collected images as well. Existing uploaded video processing already stores a frame with ffmpeg (worker.ts); it is retained.

Public list requests read stored covers only; they never fetch an external URL. Gallery and home shortform prefer the stored thumbnail variant. Missing/failed images show the provider logo and original title, not an empty tile. Existing YouTube and curated static image candidates remain as fallbacks; this patch does not add a new YouTube collection/import system.

Backfill: scripts/plan-video-thumbnail-backfill.mjs accepts a supervisor-reviewed JSON manifest and produces a dry-run plan only (no network, credentials, DB or storage writes). Manifest fields: noticeId, platform, sourceUrl, optional fresh thumbnailUrl. It validates source post shape, UUID, duplicate sources and the SAME CDN allowlist. Missing covers remain needs-source-cover, never invented. The eight public links do not supply notice UUIDs or fresh source covers; supervisor must resolve those from approved sources. backfill-post.sql is a parameterized registration/post-check draft, not executed. Supervisor verifies the original source link in the notice and actual normalized image metadata, registers then uses existing downloader/normalizer/uploader; public display waits for both S3 objects ready. No publication status changes or source text rewrites.

Preview: user requires code commit first, then captures on shared preview; user prohibits starting localdev or changing shared preview. No server was started and shared preview is untouched. Capture 390/1440 after supervisor integrates this commit; until then the shared page is not evidence for this branch. Release note deliberately has no invented capture path; append actual reviewed screenshots to this new note before deployment. Visual completion remains pending.

Verification (fresh, isolated checkout):
- typecheck: npm run typecheck --workspace apps/web passed, exit 0.
- gallery-tests.log: CreatorMediaPanel 33 passed after updating missing-cover expectations.
- final-tests.log: home shorts, shortform repository and official-media route passed; its former gallery empty-text expectation was corrected and separately rerun in gallery-tests.log. Do not sum overlapping runs.
- retest.log: SNS ingest service + thumbnail + official route + shortform repository 32 passed. New video persistence, rejected host, failed upload and register-before-upload covered.
- source-link-tests.log: official-media and existing live-watch-link 20 passed, including collector's account-qualified IG URL.
- collector-backfill-tests.log: collector + dry-run backfill 11 passed, including video/photo separation and CDN trust boundary.
- dependencies.test.ts earlier passed real redirect, streamed size, image decoding and pixel limit tests; downloader code was reused unchanged.
- sql-tests.log: actual migration pair applied in a fresh disposable PostgreSQL with fixture prerequisites. Verified object reservation, bad hash/path, public visibility, both-file readiness, deleted object and RPC role boundaries. This is not an application of migrations to dev/production.
- design-lint: no new violations. Pre-commit result recorded at commit.
