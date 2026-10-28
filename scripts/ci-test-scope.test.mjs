import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { databaseRequired, selectDatabase } from './ci-test-scope.mjs';

test('only known web source and documentation inputs skip SQL suites', () => {
  assert.equal(databaseRequired(['apps/web/server/auth/session.ts', 'apps/web/features/test.tsx', 'docs/guide.md', 'release-notes/change.json']), false);
  for (const path of ['supabase/migrations/new.sql', 'supabase/tests/check.sql', 'scripts/check.sh',
    'apps/worker/src/action-domain.ts', 'contracts/src/Action.sol', 'package-lock.json',
    'apps/web/package.json', 'apps/web/next.config.ts', 'apps/web/tsconfig.json',
    'apps/web/server/unknown.sql', '.github/workflows/backend-security.yml', 'tools/new.js', '.npmrc']) {
    assert.equal(databaseRequired(['apps/web/server/auth/session.ts', path]), true, path);
  }
  assert.equal(databaseRequired([]), true);
});

test('git event selection includes all push commits, PR history and both sides of renames', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'byus-ci-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, content) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), content); };
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  git('init', '-q'); git('config', 'user.email', 'ci@example.test'); git('config', 'user.name', 'CI test');
  write('docs/guide.md', 'base'); const base = commit();
  write('apps/web/server/example.ts', 'export {};'); const web = commit();
  const push = (before, after) => selectDatabase('push', { before, after }, cwd);
  assert.equal(push(base, web), false);
  write('supabase/migrations/new.sql', 'select 1;'); const sql = commit();
  write('apps/web/server/example.ts', 'export const a = 1;'); const last = commit();
  assert.equal(push(base, last), true, 'earlier SQL commit in a multi-commit push');
  assert.equal(push(sql, last), false);
  git('checkout', '-qb', 'pr', web);
  write('apps/web/server/example.ts', 'export const b = 2;'); const pr = commit();
  assert.equal(selectDatabase('pull_request', { pull_request: { base: { sha: last }, head: { sha: pr } } }, cwd), false, 'base-only SQL is excluded with merge-base');
  assert.equal(push(last, pr), true, 'non-ancestor push must run all');
  mkdirSync(join(cwd, 'scripts'), { recursive: true });
  renameSync(join(cwd, 'apps/web/server/example.ts'), join(cwd, 'scripts/example.ts')); const movedOut = commit();
  assert.equal(push(pr, movedOut), true);
  renameSync(join(cwd, 'scripts/example.ts'), join(cwd, 'apps/web/server/example.ts')); const movedIn = commit();
  assert.equal(push(movedOut, movedIn), true, 'removed unsafe path still counts');
  git('checkout', '-q', last); rmSync(join(cwd, 'supabase/migrations/new.sql')); const deleted = commit();
  assert.equal(push(last, deleted), true);
  for (const [before, after] of [[base, base], ['', last], ['0'.repeat(40), last], ['f'.repeat(40), last], [base, 'invalid']]) assert.equal(push(before, after), true);
  assert.equal(selectDatabase('workflow_dispatch', {}, cwd), true);
  assert.equal(selectDatabase('pull_request', {}, cwd), true);
  assert.equal(selectDatabase('push', { before: base, after: web }, tmpdir()), true);
  const shallow = join(cwd, 'shallow');
  git('clone', '--quiet', '--depth=1', `file://${cwd}`, shallow);
  assert.equal(selectDatabase('push', { before: base, after: deleted }, shallow), true);

  const output = join(cwd, 'output');
  const result = spawnSync(process.execPath, [resolve('scripts/ci-test-scope.mjs')], {
    cwd, env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: join(cwd, 'missing'), GITHUB_OUTPUT: output }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), 'database=true\n');
});

test('database conditions preserve later Postgres and chain checks and manual execution', () => {
  const workflow = readFileSync('.github/workflows/backend-security.yml', 'utf8');
  const sql = workflow.split('      - name: Verify automatic registration permissions')[1].split('      - uses: foundry-rs/')[0];
  assert.equal((sql.match(/if: steps.scope.outputs.database != 'false'/g) || []).length, 15);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /run: node --test scripts\/ci-test-scope.test.mjs/);
  assert.match(workflow, /- run: sudo apt-get update && sudo apt-get install -y postgresql ripgrep\n      - name:/);
  assert.match(workflow, /RUN_DIRECT_LEGACY_DB_TEST=1/);
  const tail = workflow.split('      - uses: foundry-rs/')[1];
  assert.equal(tail.includes('steps.scope.outputs.database'), false);
});
