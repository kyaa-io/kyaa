import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { allowedImageUrl, parsePostUrl } from '../apps/web/server/sns-ingest/source-url.ts';

// Dry-run only: no network, credentials, storage writes or database client.
export function planBackfill(rows) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Expected at most 1000 manifest rows');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const seen = new Set();
  return rows.map(row => {
    if (!row || !uuid.test(row.noticeId) || !['instagram', 'tiktok'].includes(row.platform) || !parsePostUrl(row.platform, row.sourceUrl)) throw new Error('Invalid source manifest');
    if (seen.has(row.sourceUrl)) throw new Error('Duplicate source');
    seen.add(row.sourceUrl);
    const cover = row.thumbnailUrl && allowedImageUrl(row.thumbnailUrl);
    if (row.thumbnailUrl && !cover) throw new Error('IMAGE_HOST_NOT_ALLOWED');
    return {
      noticeId: row.noticeId, sourceUrl: row.sourceUrl,
      status: cover ? 'ready-for-supervised-copy' : 'needs-source-cover',
      sourceHost: cover?.hostname ?? null,
      storagePathTemplate: `sns-ingest/${row.noticeId}/<media-uuid>.webp`,
      thumbnailPathTemplate: `sns-ingest/${row.noticeId}/<media-uuid>-thumbnail.webp`,
      steps: ['Verify notice/source association', 'Use allowedImageUrl + existing fetchImage + normalizePublicImage/createContentThumbnail', 'Reserve metadata before existing mobile-media S3 upload', 'Confirm both S3 objects ready', 'Apply reviewed post SQL'],
    };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2].startsWith('--')) throw new Error('Usage: node scripts/plan-video-thumbnail-backfill.mjs manifest.json (dry-run only)');
  console.log(JSON.stringify({ dryRun: true, items: planBackfill(JSON.parse(readFileSync(process.argv[2], 'utf8'))) }, null, 2));
}
