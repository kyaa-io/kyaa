import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { load } from 'js-yaml';

const backend = load(readFileSync('.github/workflows/backend-security.yml', 'utf8'));
const fan = load(readFileSync('.github/workflows/fan-design-system.yml', 'utf8'));
const succeeds = (script, env) => spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, ...env } }).status === 0;

test('security check rejects failed, cancelled, missing and unexpectedly skipped jobs', () => {
  const gate = backend.jobs['security-boundaries'];
  assert.equal(gate.if, 'always()');
  assert.deepEqual(gate.needs, ['scope', 'api-runtime', 'database', 'blockchain']);
  const step = gate.steps[0];
  const required = { SCOPE_RESULT: 'success', API_RESULT: 'success', CHAIN_RESULT: 'success', DATABASE_REQUIRED: 'true', DATABASE_RESULT: 'success' };
  assert.equal(succeeds(step.run, required), true);
  for (const key of ['SCOPE_RESULT', 'API_RESULT', 'CHAIN_RESULT', 'DATABASE_RESULT']) {
    for (const value of ['failure', 'cancelled', 'skipped', '']) {
      assert.equal(succeeds(step.run, { ...required, [key]: value }), false, `${key}=${value}`);
    }
  }
  const skipped = { ...required, DATABASE_REQUIRED: 'false', DATABASE_RESULT: 'skipped' };
  assert.equal(succeeds(step.run, skipped), true);
  for (const key of ['SCOPE_RESULT', 'API_RESULT', 'CHAIN_RESULT']) {
    for (const value of ['failure', 'cancelled', 'skipped', '']) assert.equal(succeeds(step.run, { ...skipped, [key]: value }), false);
  }
  for (const value of ['success', 'failure', 'cancelled', '']) assert.equal(succeeds(step.run, { ...skipped, DATABASE_RESULT: value }), false);
  assert.equal(succeeds(step.run, { ...skipped, DATABASE_REQUIRED: '' }), false);
  assert.equal(step.env.DATABASE_RESULT, '${{ needs.database.result }}');
  assert.equal(step.env.DATABASE_REQUIRED, '${{ needs.scope.outputs.database }}');
});

test('SQL groups are disjoint, retain setup, and do not wait for unrelated API or chain jobs', () => {
  const jobs = backend.jobs;
  assert.equal(jobs['api-runtime'].needs, undefined);
  assert.equal(jobs.blockchain.needs, undefined);
  assert.equal(jobs.database.needs, 'scope');
  assert.equal(jobs.database.if, "needs.scope.outputs.database != 'false'");
  assert.equal(jobs.database.strategy['fail-fast'], false);
  assert.deepEqual(jobs.database.strategy.matrix.suite, ['core', 'live', 'events']);
  const grouped = jobs.database.steps.filter(step => step.if);
  assert.equal(grouped.length, 15);
  const counts = { core: 0, live: 0, events: 0 };
  for (const step of grouped) {
    const group = /^matrix\.suite == '(core|live|events)'$/.exec(step.if)?.[1];
    assert.ok(group, step.name);
    counts[group]++;
  }
  assert.deepEqual(counts, { core: 4, live: 1, events: 10 });
  assert.match(grouped.find(step => step.if === "matrix.suite == 'live'").run, /bash scripts\/verify-live-participation.sh/);
  for (const job of [jobs.database, jobs.blockchain]) {
    const run = job.steps.map(step => step.run).filter(Boolean);
    for (const command of ['npm ci --ignore-scripts', 'npm run security:patch', 'npm run build --workspace @byus/worker', 'sudo apt-get update && sudo apt-get install -y postgresql ripgrep']) assert.ok(run.includes(command), command);
    assert.ok(job.steps.slice(0, 6).some(step => step.run === 'npm run build --workspace @byus/worker'));
  }
  const chain = jobs.blockchain.steps.map(step => step.run || '').join('\n');
  assert.match(chain, /RUN_DIRECT_LEGACY_DB_TEST=1/);
  assert.match(chain, /RUN_ACTION_ANVIL_INTEGRATION=1/);
  assert.ok(chain.indexOf('forge test') < chain.indexOf('RUN_ACTION_ANVIL_INTEGRATION'));
  assert.ok(chain.indexOf('RUN_ACTION_ANVIL_INTEGRATION') < chain.indexOf('bash scripts/verify-storage.sh'));
});

test('UI check requires every group and preserves evidence on producing runners', () => {
  const job = fan.jobs['ui-contracts'];
  assert.equal(job.strategy['fail-fast'], false);
  assert.deepEqual(job.strategy.matrix.group, ['unit', 'wave-programs', 'runmusic', 'layout-and-recovery']);
  const gate = fan.jobs['shared-ui-contracts'];
  assert.equal(gate.if, 'always()');
  assert.deepEqual(gate.needs, ['ui-contracts']);
  assert.equal(gate.steps[0].env.CONTRACTS_RESULT, '${{ needs.ui-contracts.result }}');
  for (const result of ['success', 'failure', 'cancelled', 'skipped', '']) assert.equal(succeeds(gate.steps[0].run, { CONTRACTS_RESULT: result }), result === 'success');
  const browser = job.steps.filter(step => step.run?.includes('node apps/web/e2e/'));
  assert.equal(browser.length, 7);
  for (const step of browser) assert.match(step.if, /^matrix.group == '(wave-programs|runmusic|layout-and-recovery)'$/);
  const artifacts = job.steps.filter(step => step.uses === 'actions/upload-artifact@v4');
  assert.equal(artifacts.length, 3);
  for (const step of artifacts) {
    const group = step.with.name === 'runmusic-browser-evidence' ? 'runmusic' : 'layout-and-recovery';
    assert.equal(step.if, `always() && matrix.group == '${group}'`);
    assert.ok(browser.some(candidate => candidate.if === `matrix.group == '${group}'`));
  }
});

test('only obsolete PR validation workflows cancel; manual full checks remain available', () => {
  for (const workflow of [backend, fan]) {
    assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}");
    assert.match(workflow.concurrency.group, /github.event.pull_request.number \|\| github.run_id/);
    assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  }
});
