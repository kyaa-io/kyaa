import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function check(advisories, date = '2026-11-25T14:59:59Z', critical = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'audit-baseline-'));
  try {
    writeFileSync(join(dir, 'clock.mjs'), `Date.now = () => ${Date.parse(date)};`);
    writeFileSync(join(dir, 'report.json'), JSON.stringify({
      metadata: { vulnerabilities: { high: advisories.length, critical, moderate: 0 } },
      vulnerabilities: Object.fromEntries(advisories.map(source => [String(source), {
        severity: 'high', via: [{ source, severity: 'high' }],
      }])),
    }));
    return spawnSync(process.execPath, ['--import', join(dir, 'clock.mjs'),
      'scripts/verify-npm-audit-baseline.mjs', '--include-dev', `--report=${join(dir, 'report.json')}`], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('both approved advisories pass through the last KST day', () => {
  assert.equal(check([1119441, 1247710]).status, 0);
});
test('unapproved high alongside an exception fails', () => {
  const result = check([1247710, 999999]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /999999/);
});
test('critical is never exempted', () => {
  assert.notEqual(check([1247710], undefined, 1).status, 0);
});
test('exceptions expire at midnight KST', () => {
  assert.notEqual(check([1119441, 1247710], '2026-11-25T15:00:00Z').status, 0);
});
