import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CONFIRM, MEDIA, parseArgs, planOperation, settingsSql, storageCommands, validateConfig } from './seed-doc-261107-dev.mjs';
import { TARGET } from './seed-groups-pencil-dev.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const sql = readFileSync(resolve(here, 'fixtures/doc-261107-dev.sql'), 'utf8');
const config = () => ({ ...TARGET, environment: 'dev', profile: 'fixture', privateBucket: 'byus-dev-private-assets', target: { ...TARGET, host: 'fixture.ap-northeast-2.rds.amazonaws.com', sslRootCert: '/private/ca.pem', connectionEnv: 'GROUPS_DEV_DATABASE_URL', migrationRole: 'byus_admin', identity: { database: 'byus', sessionUser: 'byus_admin', serverAddress: '10.40.5.209', serverPort: 5432 } } });

test('only the approved dev identity and a dev bucket are accepted', () => {
  assert.equal(validateConfig(config(), CONFIRM).runId, 'doc_261107_dev_fixture');
  assert.throws(() => validateConfig(config(), ''));
  assert.throws(() => validateConfig(config(), 'SEED_GROUPS_PENCIL_DEV_ONLY'));
  for (const [k, v] of [['environment', 'prod'], ['accountId', '000000000000'], ['region', 'us-east-1'], ['localRehearsal', true]]) assert.throws(() => validateConfig({ ...config(), [k]: v }, CONFIRM));
  for (const bucket of ['', undefined, 'byus-prod-private-assets', 'byus-private-assets', 'prod-dev-assets', 'devious-assets']) assert.throws(() => validateConfig({ ...config(), privateBucket: bucket }, CONFIRM), String(bucket));
  assert.throws(() => validateConfig({ ...config(), target: { ...config().target, host: 'localhost' } }, CONFIRM));
});
test('operations map to their file and settings, and bad input stops before SQL', () => {
  assert.equal(planOperation({ op: 'seed', viewers: ['a@example.test'] }).settings['byus.doc261107_viewer_emails'], 'a@example.test');
  assert.equal(planOperation({ op: 'cleanup', viewers: [] }).file, 'doc-261107-dev-cleanup.sql');
  assert.equal(planOperation({ op: 'presence=today', viewers: [] }).settings['byus.doc261107_presence'], 'today');
  assert.equal(planOperation({ op: 'gauge=37', viewers: [] }).settings['byus.doc261107_gauge'], '37');
  for (const op of ['gauge=101', 'gauge=x', 'presence=always', 'drop', 'seed;']) assert.throws(() => planOperation({ op, viewers: [] }), op);
  assert.throws(() => planOperation({ op: 'seed', viewers: ["a'@example.test"] }));
  assert.throws(() => planOperation({ op: 'cleanup', viewers: ['a@example.test'] }));
  assert.equal(settingsSql({ 'byus.x': 'y' }), "set byus.x = 'y';");
  assert.equal(parseArgs(['--config', 'c', '--op', 'list']).apply, false);
  assert.throws(() => parseArgs(['--op', 'list']));
  assert.throws(() => parseArgs(['--config', 'c', '--op', 'list', '--op', 'seed']));
});
test('every media file exists in the repository public folder and matches its recorded size and hash', () => {
  for (const m of MEDIA) {
    const file = resolve(here, m.file), bytes = readFileSync(file);
    assert.match(file, /apps\/web\/public\//);
    assert.equal(bytes.length, m.size, m.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), m.sha256, m.path);
  }
});
test('the seed SQL and the upload list name the same objects', () => {
  const photos = [...sql.matchAll(/'(doc-261107\/photo-\d+\.webp)',(\d+),\d+,\d+,'([a-f0-9]{64})'/g)];
  assert.equal(photos.length, 5);
  for (const [, path, size, sha] of photos) {
    const m = MEDIA.find(x => x.path === path);
    assert.equal(m?.bucket, 'fan-content-assets', path);
    assert.equal(m.size, Number(size));
    assert.equal(m.sha256, sha);
  }
  for (const n of [1, 2, 3]) for (const name of ['original.mp4', 'thumbnail.webp']) assert.ok(MEDIA.some(m => m.bucket === 'mobile-media' && m.path === `doc-261107/video-${n}/${name}`));
  assert.match(sql, /'doc-261107\/video-'\|\|v\.n\|\|'\/original\.mp4'/);
  assert.match(sql, /'doc-261107\/photo-6\/original\.webp','doc-261107\/photo-6\/thumbnail\.webp'/);
  assert.equal(new Set(MEDIA.map(m => `${m.bucket}/${m.path}`)).size, MEDIA.length);
});
test('storage commands touch only fixture keys in the given bucket', () => {
  for (const [plan, verb] of [[planOperation({ op: 'seed', viewers: [] }), 'cp'], [planOperation({ op: 'cleanup', viewers: [] }), 'rm']]) {
    const commands = storageCommands(plan, 'byus-dev-private-assets');
    assert.equal(commands.length, MEDIA.length);
    for (const c of commands) {
      assert.equal(c[1], verb);
      assert.ok(c.some(a => /^s3:\/\/byus-dev-private-assets\/(fan-content-assets|mobile-media)\/doc-261107\//.test(a)));
    }
  }
  assert.deepEqual(storageCommands(planOperation({ op: 'list', viewers: [] }), 'b'), []);
});
test('fixture files carry no secret and no real person', () => {
  for (const name of ['doc-261107-dev.sql', 'doc-261107-dev-cleanup.sql', 'doc-261107-dev-presence.sql', 'doc-261107-dev-gauge.sql', 'doc-261107-dev-list.sql', 'doc-261107-dev.md']) {
    const text = readFileSync(resolve(here, 'fixtures', name), 'utf8');
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}|BEGIN (RSA )?PRIVATE|eyJ[A-Za-z0-9_-]{10,}|did:privy:[a-z0-9]{10,}/, name);
    for (const email of text.match(/[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]+/gi) ?? []) assert.match(email, /@example\.test$/, name);
  }
});
