import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { load } from 'js-yaml';

const { steps } = load(readFileSync('.github/workflows/aws-platform.yml', 'utf8')).jobs.release;
const recovery = steps.find(step => step.name === 'Recover original worker preparation on retry');
const artifact = 'worker-rollback-42-2';
for (const [scenario, downloads, success] of [
  ['absent', 0, true], ['present', 1, true], ['transient', 3, true],
  ['unavailable', 3, false], ['list-error', 0, false],
]) {
  test(`worker recovery: ${scenario}`, t => {
    const cwd = mkdtempSync(join(tmpdir(), 'worker-recovery-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    mkdirSync(join(cwd, 'work/aws-release'), { recursive: true });
    writeFileSync(join(cwd, 'env'), '');
    writeFileSync(join(cwd, 'calls'), '');
    writeFileSync(join(cwd, 'gh'), `#!/bin/bash
set -eu
if [[ "$1" == api ]]; then
  [[ "$2" == 'repos/test/repo/actions/runs/42/artifacts?name=${artifact}' ]]
  if [[ "$SCENARIO" == absent || "$SCENARIO" == list-error ]]; then
    echo '{"artifacts":[],"total_count":0}'
    [[ "$SCENARIO" == absent ]]
  else
    echo '{"artifacts":[{"name":"${artifact}"}],"total_count":1}'
  fi
else
  [[ "$1 $2 $3 $4 $5 $6" == 'run download 42 --name ${artifact} --dir' ]]
  echo download >> calls
  [[ "$SCENARIO" != unavailable ]] || exit 1
  [[ "$SCENARIO" != transient || $(wc -l < calls) -eq 3 ]] || exit 1
  echo '{}' | tee "$7/prepared.json" > "$7/applied.json"
fi
`, { mode: 0o700 });
    const result = spawnSync('bash', ['-e', '-c', recovery.run], { cwd, encoding: 'utf8',
      env: { ...process.env, PATH: cwd + ':' + process.env.PATH, SCENARIO: scenario,
        GITHUB_RUN_ATTEMPT: '3', GITHUB_RUN_ID: '42', GITHUB_REPOSITORY: 'test/repo', GITHUB_ENV: 'env' } });
    assert.equal(result.status, success ? 0 : 1, result.stderr);
    if (!success) assert.match(result.stdout, /수동 확인 필요/);
    assert.equal(readFileSync(join(cwd, 'calls'), 'utf8'), 'download\n'.repeat(downloads));
    assert.equal(readFileSync(join(cwd, 'env'), 'utf8'), scenario === 'absent' ? 'WORKER_FRESH_PREPARE=1\n' : '');
    assert.equal(existsSync(join(cwd, 'work/aws-release/worker-backups/prepared.json')), success && downloads > 0);
    for (const mode of ['prepare', 'apply']) {
      const worker = steps.find(step => step.run === 'node scripts/aws-release-workers.mjs ' + mode);
      assert.ok(steps.indexOf(worker) > steps.indexOf(recovery));
      assert.equal(worker.if, "env.PROMOTE_WORKERS == 'true'");
    }
    assert.equal(recovery['continue-on-error'], undefined);
  });
}
