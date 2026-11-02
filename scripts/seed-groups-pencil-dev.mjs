#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Database, verifyIdentity } from './aws-db-migrate.mjs';

export const TARGET = Object.freeze({ accountId: '996702758024', region: 'ap-northeast-2', rdsIdentifier: 'byus-dev-platform-database-zxcddq5gdswr', rdsResourceId: 'db-MRKWGIKJNNBDH3ZFCOSGVP2TQI' });
export const CONFIRM = 'SEED_GROUPS_PENCIL_DEV_ONLY';
export function validateSeedConfig(c, confirmation) {
  if (confirmation !== CONFIRM) throw new Error('Explicit dev fixture confirmation required');
  if (c.environment !== 'dev' || c.localRehearsal || c.accountId !== TARGET.accountId || c.region !== TARGET.region || !c.profile) throw new Error('Only the approved AWS dev account/region is allowed');
  const t = c.target;
  if (!t || t.rdsIdentifier !== TARGET.rdsIdentifier || t.rdsResourceId !== TARGET.rdsResourceId || !t.host?.endsWith('.ap-northeast-2.rds.amazonaws.com') || !t.sslRootCert || t.identity?.database !== 'byus' || t.identity?.sessionUser !== 'byus_admin' || t.migrationRole !== 'byus_admin' || t.identity?.serverPort !== 5432 || !/^10\.40\./.test(t.identity?.serverAddress ?? '') || !/^[A-Z][A-Z0-9_]*$/.test(t.connectionEnv ?? '')) throw new Error('Exact private dev RDS/database identity required');
  if (t.sqlTunnel && (c.engine !== 'dms' || t.sqlTunnel.hostaddr !== '127.0.0.1' || !Number.isInteger(t.sqlTunnel.port) || t.sqlTunnel.port < 1024 || t.sqlTunnel.port > 65535 || !t.sqlTunnel.evidenceFile || !/^[a-f0-9]{64}$/.test(t.sqlTunnel.evidenceSha256 ?? ''))) throw new Error('A loopback SSM tunnel with matching evidence is required');
  return { ...c, runId: 'groups_pencil_dev_fixture', schemas: ['public'], applicationRoles: [] };
}
export function verifySeedAws(c, aws) {
  if (aws(['sts', 'get-caller-identity']).Account !== TARGET.accountId) throw new Error('AWS account mismatch');
  const r = aws(['rds', 'describe-db-instances', '--db-instance-identifier', TARGET.rdsIdentifier]).DBInstances?.[0];
  if (!r || r.DbiResourceId !== TARGET.rdsResourceId || r.DBInstanceStatus !== 'available' || r.Endpoint?.Address !== c.target.host || r.Endpoint?.Port !== 5432 || !r.StorageEncrypted || r.PubliclyAccessible || !r.EngineVersion?.startsWith('17.') || !r.TagList?.some(t => t.Key === 'Environment' && t.Value === 'dev')) throw new Error('Dev RDS metadata mismatch');
}
export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { if (options.apply) throw new Error('Duplicate option'); options.apply = true; }
    else if (['--config', '--confirm-dev'].includes(args[i]) && args[i + 1] && !options[args[i]]) options[args[i]] = args[++i];
    else throw new Error('Usage: node scripts/seed-groups-pencil-dev.mjs --config <private-json> --confirm-dev SEED_GROUPS_PENCIL_DEV_ONLY [--apply]');
  }
  if (!options['--config']) throw new Error('Private configuration file required');
  const c = validateSeedConfig(JSON.parse(await readFile(resolve(options['--config']), 'utf8')), options['--confirm-dev']);
  const aws = (args) => {
    const r = spawnSync('aws', ['--no-cli-pager', '--profile', c.profile, '--region', c.region, ...args, '--output', 'json'], { encoding: 'utf8', timeout: 30000 });
    if (r.error || r.status !== 0) throw new Error('AWS identity/metadata validation failed');
    return JSON.parse(r.stdout);
  };
  verifySeedAws(c, aws);
  const sql = await readFile(new URL('./fixtures/groups-pencil-dev.sql', import.meta.url), 'utf8');
  const db = await Database.open(c, 'target');
  try {
    verifyIdentity(c.target.identity, db.identity());
    // The fixture transaction independently requires this marker, including during local SQL tests.
    const result = db.run(`set byus.groups_pencil_dev = '${CONFIRM}';\n${options.apply ? sql : "select jsonb_build_object('mode','checked-only','remoteWrites',false);"}`, { json: false, timeout: 60000 });
    console.log(result);
  } finally { await db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Dev groups fixture failed; no credentials or database errors are logged. Check configuration, identity, migrations and fixture ownership.'); process.exitCode = 1; });
