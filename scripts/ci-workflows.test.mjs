import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { load } from 'js-yaml';
import { verifyInstalledModules } from './verify-installed-node-modules.mjs';

const backend = load(readFileSync('.github/workflows/backend-security.yml', 'utf8'));
const fan = load(readFileSync('.github/workflows/fan-design-system.yml', 'utf8'));
const succeeds = (script, env) => spawnSync('bash', ['-e', '-c', script], { env: { ...process.env, ...env } }).status === 0;

function* workflowRunSteps() {
  for (const file of readdirSync('.github/workflows').filter(name => name.endsWith('.yml'))) {
    const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      for (const [index, step] of (job.steps ?? []).entries()) {
        if (typeof step.run === 'string') yield { file, jobName, index, run: step.run };
      }
    }
  }
}

test('workflow run steps never install apt packages directly', () => {
  for (const { file, jobName, index, run } of workflowRunSteps()) {
    assert.doesNotMatch(run, /\bapt-get(?:\s+--?[\w-]+)*\s+install\b/, `${file}/${jobName}/step ${index + 1}`);
  }
});

test('workflow run steps never use playwright install --with-deps', () => {
  for (const { file, jobName, index, run } of workflowRunSteps()) {
    assert.doesNotMatch(run, /\bplaywright\s+install\b[^;&|\n]*--with-deps\b/, `${file}/${jobName}/step ${index + 1}`);
  }
});

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
  assert.deepEqual(jobs.database.strategy.matrix.suite, ['core', 'live', 'events', 'economy-1', 'economy-2']);
  const dependencySetup = jobs.database.steps.filter(step => step.uses?.startsWith('actions/setup-node@') || step.uses?.startsWith('actions/cache/') ||
    ['node_modules_key', 'node_modules'].includes(step.id) || /node_modules/.test(step.name ?? '') ||
    ['npm ci --ignore-scripts', 'npm run security:patch', 'npm run build --workspace @byus/worker'].includes(step.run));
  // The live suite installs no dependencies: every Node setup, cache, install and patch step skips it; only core builds the worker.
  for (const step of dependencySetup) {
    if (step.run === 'npm run build --workspace @byus/worker') assert.equal(step.if, "matrix.suite == 'core'");
    else assert.match(step.if ?? '', /^matrix\.suite != 'live'/, step.name ?? step.run ?? step.uses);
  }
  const grouped = jobs.database.steps.filter(step => step.if && !dependencySetup.includes(step));
  assert.equal(grouped.length, 37);
  const counts = { core: 0, live: 0, events: 0, 'economy-1': 0, 'economy-2': 0 };
  for (const step of grouped) {
    const group = /^matrix\.suite == '(core|live|events|economy-1|economy-2)'$/.exec(step.if)?.[1];
    assert.ok(group, step.name);
    counts[group]++;
  }
  // core gained the steady check-in and the share-tag review replays (DUKJIL-POLICY, 2026-11-11); events gained the content translation cache replay (TRANSLATE-RECONCILE).
  assert.deepEqual(counts, { core: 15, live: 1, events: 11, 'economy-1': 2, 'economy-2': 8 });
  const translation = grouped.filter(step => /content_translation_cache\.sh/.test(step.run ?? ''));
  assert.equal(translation.length, 1); assert.equal(translation[0].if, "matrix.suite == 'events'");
  assert.match(translation[0].run, /BYUS_CLEAN_DB_PORT=55681 \\\n\s*BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=supabase\/tests\/content_translation_cache\.sh/);
  const translationScript = readFileSync('supabase/tests/content_translation_cache.sh', 'utf8');
  for (const part of ['content_translation_slots', 'content_translation_leases', 'TR_TITLE_DB=1 TR_LEASE_DB=1', 'content-translation-slots.db.test.ts', 'content-translation-lease.db.test.ts']) assert.ok(translationScript.includes(part), part);
  // The former single economy suite is split in two runners; each of its nine steps appears once, and each listed SQL file is named by exactly one step. Replays that already repeated an SQL file inside a step are unchanged.
  const economySteps = grouped.filter(step => /^matrix\.suite == 'economy-[12]'$/.test(step.if));
  assert.deepEqual(economySteps.map(step => step.name).sort(), [
    'Verify SNS ingest review preservation and storage boundaries',
    'Verify fan economy, reward sources and concurrent earning',
    'Verify group application duplicate and review reason rules',
    'Verify group event approval rules with the real rule on',
    'Verify group wallet cross-feature races on the disabled release baseline',
    'Verify group wallet cutover on the disabled release baseline',
    'Verify group wallet, raffle and gift rules with concurrent entries',
    'Verify post and comment point result read',
    'Verify public popular board read rules',
    'Verify wallet, reward, benefit and owner-grant SQL tests (one clean replay each)',
  ].sort());
  const sns = economySteps.find(step => step.name === 'Verify SNS ingest review preservation and storage boundaries');
  assert.match(sns.run, /sns_ingest_ci\.sh/);
  assert.match(readFileSync('supabase/tests/sns_ingest_ci.sh', 'utf8'), /supabase\/tests\/sns_ingest\.sql/);
  const economyRuns = economySteps.map(step => step.run).join('\n');
  for (const file of ['group_economy_ci.sql', 'group_economy_ci_concurrency.sh', 'group_event_approval_upgrade_before.sql', 'group_event_approval_upgrade_after.sql',
    'group_event_approval.sql', 'group_event_approval_concurrency.sh', 'group_event_approval_owner.sql', 'group_application_integrity.sql', 'post_reward_result.sql',
    'public_popular_posts.sql', 'group_wallet_cross_feature_concurrency.sh', 'group_wallet_cutover_verify.sh', 'mobile_fan_economy_ci.sql', 'mobile_fan_economy_ci_concurrency.sh']) {
    assert.equal(economyRuns.split(`supabase/tests/${file}`).length - 1, 1, file);
  }
  for (const name of ['definer_owner_grants', 'groups_celebrity_directory', 'group_people_hearts', 'passport_issuance_joins_fan_page', 'r6_server_facts']) assert.match(economyRuns, new RegExp(`[ \\n]${name}[ \\n]`), name);
  for (const shard of ['economy-1', 'economy-2']) assert.ok(economySteps.some(step => step.if === `matrix.suite == '${shard}'`), shard);
  assert.match(grouped.find(step => step.if === "matrix.suite == 'live'").run, /bash scripts\/verify-live-participation.sh/);
  // The economy replays run four at a time; all twelve stay listed, each on its own port, and a failing one fails the step.
  const replays = grouped.find(step => /one clean replay each/.test(step.name)).run;
  for (const name of ['definer_owner_grants', 'fan_board_media_owner_grant', 'group_earnings', 'group_wallet', 'groups_core',
    'mobile_fan_native_producers_cutover', 'mobile_fan_daily_checkin_policy', 'mobile_fan_activation_correction',
    'unified_feed_first_post_rewards', 'mission_reward_score_suite', 'mobile_benefits', 'cognito_identity_bridge']) {
    assert.match(replays, new RegExp(`[ \\n]${name}[ \\n]`), name);
  }
  assert.match(replays, /awk '\{ print \$1, 55600 \+ NR \}' \|\n\s*xargs -P 4 -L 1 bash -c '/);
  assert.match(replays, /BYUS_CLEAN_DB_PORT=\$1 BYUS_CLEAN_DB_ASSERTION_FILE=supabase\/tests\/\$0\.sql/);
  assert.match(replays, /bash scripts\/verify-clean-migration-chain\.sh >"\$log" 2>&1 \|\| status=\$\?/);
  assert.match(replays, /exit "\$status"'\n?$/);
  assert.doesNotMatch(replays, /\|\| true|set \+e/);
  for (const job of [jobs.database, jobs.blockchain]) {
    const run = job.steps.map(step => step.run).filter(Boolean);
    for (const command of ['npm ci --ignore-scripts', 'npm run security:patch', 'npm run build --workspace @byus/worker', 'bash scripts/ci/setup-postgres-ripgrep.sh']) assert.ok(run.includes(command), command);
    // The cache steps lengthen the shared setup, so the worker build must still precede every suite-specific step.
    const setup = job.steps.findIndex(step => step.run === 'npm run build --workspace @byus/worker');
    assert.ok(setup >= 0 && setup < job.steps.findIndex((step, index) => index !== setup && (/^matrix\.suite == /.test(step.if ?? '') || step.uses?.startsWith('foundry-rs/'))));
    assert.ok(job.steps.findIndex(step => step.run === 'npm run security:patch') < setup);
  }
  const chain = jobs.blockchain.steps.map(step => step.run || '').join('\n');
  assert.match(chain, /RUN_DIRECT_LEGACY_DB_TEST=1/);
  assert.match(chain, /RUN_ACTION_ANVIL_INTEGRATION=1/);
  assert.ok(chain.indexOf('forge test') < chain.indexOf('RUN_ACTION_ANVIL_INTEGRATION'));
  assert.ok(chain.indexOf('RUN_ACTION_ANVIL_INTEGRATION') < chain.indexOf('bash scripts/verify-storage.sh'));
});

test('DB matrix builds the worker only for the core snapshot consumer', () => {
  const command = 'npm run build --workspace @byus/worker';
  const builds = backend.jobs.database.steps.filter(step => step.run === command);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].if, "matrix.suite == 'core'");
  for (const suite of backend.jobs.database.strategy.matrix.suite) {
    const active = builds.filter(step => !step.if || step.if === `matrix.suite == '${suite}'`);
    assert.equal(active.length, suite === 'core' ? 1 : 0, suite);
  }
  assert.match(JSON.parse(readFileSync('package.json', 'utf8')).scripts['security:backend-db'], /verify-backend-security\.sh/);
  assert.match(readFileSync('scripts/verify-backend-security.sh', 'utf8'), /BYUS_CLEAN_DB_SHELL_ASSERTION_FILE=.*verify-backend-security-behavior\.sh/);
  assert.match(readFileSync('scripts/verify-backend-security-behavior.sh', 'utf8'), /bash .*verify-fan-action-snapshots\.sh/);
  assert.match(readFileSync('scripts/verify-fan-action-snapshots.sh', 'utf8'), /from '\.\/apps\/worker\/dist\/action-domain\.js'/);
});

test('live DB suite skips Node and package setup while other suites retain it', () => {
  const setup = backend.jobs.database.steps.filter(step => step.uses?.startsWith('actions/setup-node@') ||
    ['npm ci --ignore-scripts', 'npm run security:patch'].includes(step.run));
  assert.equal(setup.length, 3);
  for (const step of setup) assert.match(step.if, /^matrix\.suite != 'live'/);
  assert.equal(setup[0].with['node-version'], 24);
  assert.equal(setup[0].with.cache, 'npm');
  for (const suite of backend.jobs.database.strategy.matrix.suite) {
    const active = setup.filter(step => !step.if || (/^matrix\.suite != 'live'/.test(step.if) && suite !== 'live'));
    assert.equal(active.length, suite === 'live' ? 0 : 3, suite);
  }
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
  assert.equal(browser.length, 8);
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


test('required main and production-hotfix push workflows always run while PR path filters remain', () => {
  const cs = load(readFileSync('.github/workflows/cs-inquiries.yml', 'utf8'));
  for (const workflow of [backend, fan, cs]) {
    assert.deepEqual(workflow.on.push, { branches: ['main', 'release/production'] });
    assert.ok(workflow.on.pull_request.paths.length > 0);
  }
});

test('daily critical checks reuse all suites and fail on any missing result', () => {
  const daily = load(readFileSync('.github/workflows/daily-critical-functions.yml', 'utf8'));
  assert.deepEqual(daily.on.schedule, [{ cron: '0 0 * * *' }]);
  assert.ok(Object.hasOwn(daily.on, 'workflow_dispatch'));
  assert.deepEqual(daily.permissions, { contents: 'read' });
  for (const [job, name] of [['backend', 'backend-security'], ['fan', 'fan-design-system'], ['support', 'cs-inquiries']]) {
    assert.equal(daily.jobs[job].uses, `./.github/workflows/${name}.yml`);
    assert.equal(daily.jobs[job].secrets, undefined);
    const workflow = load(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
    assert.ok(Object.hasOwn(workflow.on, 'workflow_call'));
  }
  assert.notEqual(backend.concurrency.group, fan.concurrency.group);
  for (const workflow of [backend, fan]) assert.ok(!workflow.concurrency.group.includes('github.workflow'));
  const gate = daily.jobs.result;
  assert.equal(gate.if, 'always()');
  assert.deepEqual(gate.needs, ['backend', 'fan', 'support', 'production']);
  const required = { BACKEND_RESULT: 'success', FAN_RESULT: 'success', SUPPORT_RESULT: 'success', PRODUCTION_RESULT: 'success', GITHUB_STEP_SUMMARY: '/dev/null' };
  assert.equal(succeeds(gate.steps[0].run, required), true);
  for (const key of ['BACKEND_RESULT', 'FAN_RESULT', 'SUPPORT_RESULT', 'PRODUCTION_RESULT']) {
    for (const value of ['failure', 'cancelled', 'skipped', '']) assert.equal(succeeds(gate.steps[0].run, { ...required, [key]: value }), false);
  }
  assert.match(backend.jobs['api-runtime'].steps.map(step => step.run || '').join('\n'), /server\/fanpage\/routes.test.ts/);
  assert.match(readFileSync('scripts/verify-backend-security-behavior.sh', 'utf8'), /groups_content_release.sql/);
});

test('Foundry install is pinned, cached by version and retried with 10, 20 and 40 second waits', () => {
  const steps = backend.jobs.blockchain.steps;
  const installs = steps.filter(step => /^foundry-rs\/foundry-toolchain@[a-f0-9]{40}$/.test(step.uses ?? ''));
  assert.equal(installs.length, 4);
  for (const step of installs) assert.equal(step.with.version, 'v1.9.0');
  assert.deepEqual(installs.map(step => step['continue-on-error']), [true, true, true, false]);
  const cache = steps.find(step => step.id === 'foundry-cache');
  assert.match(cache.with.key, /v1\.9\.0/);
  assert.deepEqual(steps.filter(step => /^sleep \d+$/.test(step.run ?? '')).map(step => step.run), ['sleep 10', 'sleep 20', 'sleep 40']);
  assert.ok(steps.findIndex(step => step.run === 'forge test --root contracts') > steps.findIndex(step => step.name === 'Require the pinned Foundry'));
});

const cached = [
  ['aws-platform', 'release'], ['backend-security', 'api-runtime'], ['backend-security', 'database'], ['backend-security', 'blockchain'],
  ['admin-ui', 'admin-contracts'], ['fan-design-system', 'ui-contracts'], ['cs-inquiries', 'cs-inquiries'], ['deployment-notices', 'validate-notice'],
];
const lockInputs = "hashFiles('package-lock.json', 'package.json', 'apps/*/package.json', 'scripts/apply-security-patches.mjs')";

test('every root npm ci restores an exact, environment-bound node_modules cache before the security patch', () => {
  for (const [file, name] of cached) {
    const workflow = file === 'backend-security' ? backend : file === 'fan-design-system' ? fan : load(readFileSync(`.github/workflows/${file}.yml`, 'utf8'));
    const steps = workflow.jobs[name].steps;
    const at = predicate => { const index = steps.findIndex(predicate); assert.ok(index >= 0, `${file}/${name}`); return index; };
    const node = at(step => step.uses?.startsWith('actions/setup-node@'));
    const keyStep = at(step => step.id === 'node_modules_key');
    const restore = at(step => step.id === 'node_modules');
    const check = at(step => step.name === 'Reinstall when restored node_modules is unusable');
    const install = at(step => step.run === 'npm ci --ignore-scripts');
    const save = at(step => step.name === 'Save locked node_modules');
    const patch = at(step => step.run === 'npm run security:patch');
    assert.ok(node < keyStep && keyStep < restore && restore < check && check < install && install < save && save < patch, `${file}/${name} order`);
    const prefix = steps[keyStep].run;
    for (const part of ['$RUNNER_OS', '$RUNNER_ARCH', '/etc/os-release', 'process.versions.node', 'npm -v']) assert.ok(prefix.includes(part), `${file}/${name} ${part}`);
    const key = '${{ steps.node_modules_key.outputs.prefix }}-${{ ' + lockInputs + ' }}';
    assert.match(steps[restore].uses, /^actions\/cache\/restore@[a-f0-9]{40}$/);
    assert.match(steps[save].uses, /^actions\/cache\/save@[a-f0-9]{40}$/);
    for (const step of [steps[restore], steps[save]]) {
      assert.equal(step.with.key, key);
      assert.equal(step.with['restore-keys'], undefined);
      assert.equal(step.with.path, 'node_modules\napps/*/node_modules\n');
    }
    assert.equal(steps[restore]['continue-on-error'], true);
    // The database job's live suite installs no dependencies, so every cache step also skips it.
    const live = file === 'backend-security' && name === 'database' ? "matrix.suite != 'live' && " : '';
    assert.equal(steps[keyStep].if, live ? "matrix.suite != 'live'" : undefined);
    assert.equal(steps[restore].if, live ? "matrix.suite != 'live'" : undefined);
    assert.equal(steps[check].if, live + "steps.node_modules.outputs.cache-hit == 'true'");
    assert.match(steps[check].run, /if ! node scripts\/verify-installed-node-modules\.mjs; then[\s\S]*rm -rf node_modules apps\/\*\/node_modules\n\s+npm ci --ignore-scripts\n\s*fi/);
    assert.equal(steps[install].if, live + "steps.node_modules.outputs.cache-hit != 'true'");
    assert.equal(steps[save].if, live + "steps.node_modules.outputs.cache-hit != 'true'");
  }
});

test('the dependency audit and stage host installs stay uncached', () => {
  const audit = readFileSync('.github/workflows/dependency-audit.yml', 'utf8');
  assert.doesNotMatch(audit, /actions\/cache|node_modules/);
  assert.match(audit, /run: npm ci --ignore-scripts/);
  const stage = backend.jobs['api-runtime'].steps.find(step => step.run?.includes('--prefix apps/stage-console'));
  assert.equal(stage.run, 'npm ci --prefix apps/stage-console --omit=dev --ignore-scripts');
  assert.equal(stage.if, undefined);
});

test('a restored node_modules is accepted only when it matches the lockfile install record and files', () => {
  const root = mkdtempSync(join(tmpdir(), 'node-modules-check-'));
  try {
    const entry = (version, extra = {}) => ({ version, ...extra });
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ packages: {
      '': { name: 'root' },
      'apps/web': { name: 'web' },
      'node_modules/@byus/web': { resolved: 'apps/web', link: true },
      'node_modules/a': entry('1.0.0'),
      'node_modules/a/node_modules/b': entry('2.0.0'),
      'node_modules/skipped': entry('3.0.0', { optional: true }),
    } }));
    const place = (key, version) => { mkdirSync(join(root, key), { recursive: true }); writeFileSync(join(root, key, 'package.json'), JSON.stringify({ version })); };
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'node_modules', '.package-lock.json'), JSON.stringify({ packages: { 'node_modules/a': entry('1.0.0'), 'node_modules/a/node_modules/b': entry('2.0.0') } }));
    place('node_modules/a', '1.0.0');
    place('node_modules/a/node_modules/b', '2.0.0');
    assert.deepEqual(verifyInstalledModules(root), []);
    place('node_modules/a/node_modules/b', '2.0.1');
    assert.equal(verifyInstalledModules(root).length, 1);
    rmSync(join(root, 'node_modules/a/node_modules'), { recursive: true });
    assert.match(verifyInstalledModules(root)[0], /node_modules\/a\/node_modules\/b: lock 2\.0\.0, on disk missing/);
    place('node_modules/a/node_modules/b', '2.0.0');
    writeFileSync(join(root, 'node_modules', '.package-lock.json'), JSON.stringify({ packages: { 'node_modules/a': entry('0.9.0'), 'node_modules/a/node_modules/b': entry('2.0.0') } }));
    assert.match(verifyInstalledModules(root)[0], /node_modules\/a: lock 1\.0\.0, install record 0\.9\.0/);
    rmSync(join(root, 'node_modules', '.package-lock.json'));
    assert.throws(() => verifyInstalledModules(root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
