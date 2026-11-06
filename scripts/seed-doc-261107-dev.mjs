#!/usr/bin/env node
// Operator script for the 2026-11-07 feedback fixtures. Pinned to the dev account and dev database through the pencil seed guards.
// Runs nothing without --apply. See scripts/fixtures/doc-261107-dev.md.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Database, verifyIdentity } from './aws-db-migrate.mjs';
import { CONFIRM as PENCIL_CONFIRM, validateSeedConfig, verifySeedAws } from './seed-groups-pencil-dev.mjs';

export const CONFIRM = 'SEED_DOC_261107_DEV_ONLY';
const PUBLIC = '../apps/web/public/';
const PHOTO_A = { file: `${PUBLIC}images/groups/my-passport-spread.webp`, contentType: 'image/webp', size: 96230, sha256: 'c6620f735b195e07f60956997a82061b521b37dda823f010b86eef75eac463a2' };
const PHOTO_B = { file: `${PUBLIC}images/groups/capsule-machine-reveal-poster.webp`, contentType: 'image/webp', size: 82422, sha256: '0e396ef1e2d2a88ac9479455ff18d4580367792e212c99a78b518e7eb3f75c6b' };
const VIDEO = { file: `${PUBLIC}videos/capsule-machine-reveal.mp4`, contentType: 'video/mp4', size: 571109, sha256: '835f35ba9bf875d04100d70b0628bd07bfaad83a4628e89204b2548ea2485e21' };
/** Repository public files only. Object key = bucket/path, as apps/web/server/storage/config.ts objectKey builds it. Keep in step with the seed SQL. */
export const MEDIA = Object.freeze([
  ...[[1, PHOTO_A], [2, PHOTO_B], [3, PHOTO_A], [4, PHOTO_A], [5, PHOTO_B]].map(([n, f]) => ({ bucket: 'fan-content-assets', path: `doc-261107/photo-${n}.webp`, ...f })),
  ...[1, 2, 3].flatMap(n => [{ bucket: 'mobile-media', path: `doc-261107/video-${n}/original.mp4`, ...VIDEO }, { bucket: 'mobile-media', path: `doc-261107/video-${n}/thumbnail.webp`, ...PHOTO_B }]),
  { bucket: 'mobile-media', path: 'doc-261107/photo-6/original.webp', ...PHOTO_A },
  { bucket: 'mobile-media', path: 'doc-261107/photo-6/thumbnail.webp', ...PHOTO_A },
]);
const USAGE = 'Usage: node scripts/seed-doc-261107-dev.mjs --config <private-json> --confirm-dev SEED_DOC_261107_DEV_ONLY --op seed|cleanup|list|presence=online|today|off|gauge=<0-100> [--viewer-email <test account email>]... [--apply]';

export function parseArgs(args) {
  const o = { viewers: [], apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--viewer-email' && args[i + 1]) o.viewers.push(args[++i]);
    else if (['--config', '--confirm-dev', '--op'].includes(a) && args[i + 1] && o[a.slice(2)] === undefined) o[a.slice(2)] = args[++i];
    else throw new Error(USAGE);
  }
  if (!o.config || !o.op) throw new Error(USAGE);
  return o;
}
/** Turns the operation into its SQL file and session settings. Everything here reaches SQL as text, so it is validated first. */
export function planOperation({ op, viewers }) {
  for (const email of viewers) if (!/^[a-z0-9._+-]+@[a-z0-9.-]+$/i.test(email)) throw new Error('Invalid viewer email');
  if (viewers.length && op !== 'seed') throw new Error('Viewers apply only to seed');
  const settings = { 'byus.doc261107_dev': CONFIRM };
  if (op === 'seed') { settings['byus.doc261107_viewer_emails'] = viewers.join(','); return { file: 'doc-261107-dev.sql', settings, uploads: true }; }
  if (op === 'cleanup') return { file: 'doc-261107-dev-cleanup.sql', settings, removes: true };
  if (op === 'list') return { file: 'doc-261107-dev-list.sql', settings };
  const presence = /^presence=(online|today|off)$/.exec(op);
  if (presence) { settings['byus.doc261107_presence'] = presence[1]; return { file: 'doc-261107-dev-presence.sql', settings }; }
  const gauge = /^gauge=(\d{1,3})$/.exec(op);
  if (gauge && Number(gauge[1]) <= 100) { settings['byus.doc261107_gauge'] = gauge[1]; return { file: 'doc-261107-dev-gauge.sql', settings }; }
  throw new Error(USAGE);
}
export function validateConfig(c, confirmation) {
  if (confirmation !== CONFIRM) throw new Error('Explicit dev fixture confirmation required');
  const valid = validateSeedConfig(c, PENCIL_CONFIRM);
  if (!/^[a-z0-9.-]*(^|[-.])dev([-.]|$)[a-z0-9.-]*$/.test(c.privateBucket ?? '') || /(^|[-.])prod/.test(c.privateBucket)) throw new Error('Exact private dev bucket required');
  return { ...valid, privateBucket: c.privateBucket, runId: 'doc_261107_dev_fixture' };
}
export const settingsSql = settings => Object.entries(settings).map(([k, v]) => `set ${k} = '${v}';`).join('\n');
export function storageCommands(plan, bucket) {
  const root = fileURLToPath(new URL('.', import.meta.url));
  if (plan.uploads) return MEDIA.map(m => ['s3', 'cp', resolve(root, m.file), `s3://${bucket}/${m.bucket}/${m.path}`, '--content-type', m.contentType, '--no-progress']);
  if (plan.removes) return MEDIA.map(m => ['s3', 'rm', `s3://${bucket}/${m.bucket}/${m.path}`]);
  return [];
}
export async function main(args = process.argv.slice(2)) {
  const o = parseArgs(args), plan = planOperation(o);
  const c = validateConfig(JSON.parse(await readFile(resolve(o.config), 'utf8')), o['confirm-dev']);
  const awsRaw = a => spawnSync('aws', ['--no-cli-pager', '--profile', c.profile, '--region', c.region, ...a], { encoding: 'utf8', timeout: 60000 });
  const aws = a => { const r = awsRaw([...a, '--output', 'json']); if (r.error || r.status !== 0) throw new Error('AWS identity/metadata validation failed'); return JSON.parse(r.stdout); };
  verifySeedAws(c, aws);
  const commands = storageCommands(plan, c.privateBucket);
  const db = await Database.open(c, 'target');
  try {
    verifyIdentity(c.target.identity, db.identity());
    if (!o.apply) {
      // Proves the role may switch triggers off, and writes nothing. The list is read-only.
      console.log(db.run(`begin;set local session_replication_role=replica;rollback;\n${await readFile(new URL('./fixtures/doc-261107-dev-list.sql', import.meta.url), 'utf8')}`, { json: false, timeout: 60000 }));
      console.log(JSON.stringify({ mode: 'checked-only', remoteWrites: false, sql: plan.file, storageCommands: commands.length }));
      return;
    }
    const storage = () => { for (const a of commands) { const r = awsRaw(a); if (r.error || r.status !== 0) throw new Error('Dev storage step failed'); } };
    if (plan.uploads) storage();
    const sql = await readFile(new URL(`./fixtures/${plan.file}`, import.meta.url), 'utf8');
    console.log(db.run(`${settingsSql(plan.settings)}\n${sql}`, { json: false, timeout: 60000 }));
    if (plan.removes) storage();
  } finally { await db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`doc-261107 dev fixture failed: ${error.message.startsWith('Usage') ? error.message : 'check configuration, identity, migrations and the doc-14 data. No credentials or database errors are logged.'}`); process.exitCode = 1; });
