# Mobile media operations

`POST /api/me/media/uploads/:id/complete` claims at most one validation job for that upload, validates the stored bytes, creates one WebP thumbnail, and commits with `(assetId, assetVersion, jobId)` CAS. A timed-out lease is retryable with the same endpoint and upload ID. Four failed infrastructure attempts reject the upload; format, size, MIME, or duration failures reject immediately.

Image processing uses the installed `sharp`. Video processing uses the pinned `ffprobe-static` and `ffmpeg-static` binaries; absolute `MEDIA_FFPROBE_PATH` and `MEDIA_FFMPEG_PATH` values can override them. The request route is bounded to one job and declares a 60-second maximum execution time.

Cleanup is durable in Postgres and runs in bounded batches after validation and cancellation. Deletion waits until the signed storage upload token has expired, so a late direct upload cannot recreate an already-cleaned object. `GET /api/internal/media/process`, authenticated with `CRON_SECRET`, drains one validation job within a 115-second worker budget so retries do not depend on another app request. The existing account-deletion maintenance route drains expired-upload and deletion cleanup items.
