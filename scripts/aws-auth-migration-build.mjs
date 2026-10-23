#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, readdir, cp, stat, utimes, rm, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'apps/web/server/auth/cognito/migration-lambda.mjs');
const TEMPLATE = join(ROOT, 'infrastructure/aws/platform/cognito-migration.json');
export const CA_URL = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem';
const PG_VERSION = '8.23.1';
const sha256 = (body) => createHash('sha256').update(body).digest('hex');
const fail = (message) => { throw new Error(message); };

export function validateCaBundle(body, expectedHash) {
  if (Buffer.byteLength(body) > 1024 * 1024) fail('RDS CA bundle is too large');
  if (expectedHash && sha256(body) !== expectedHash) fail('RDS CA bundle checksum differs');
  const blocks = String(body).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  if (!blocks.length || String(body).replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) fail('Expected a PEM certificate-only RDS bundle');
  let liveSeoulRoots = 0;
  for (const block of blocks) {
    const cert = new X509Certificate(block);
    if (!cert.ca || !/Amazon RDS/.test(cert.subject) || !cert.verify(cert.publicKey)) fail('Unexpected non-root/non-RDS CA certificate');
    if (/ap-northeast-2/.test(cert.subject) && Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now()) liveSeoulRoots++;
  }
  if (!liveSeoulRoots) fail('Bundle has no current Seoul RDS root');
  return { sha256: sha256(body), certificateCount: blocks.length, liveSeoulRoots };
}

async function caBundle(path, expectedHash) {
  if (path) {
    if (!/^[a-f0-9]{64}$/.test(expectedHash ?? '')) fail('Offline CA input requires its previously recorded official SHA256');
    const body = await readFile(resolve(path));
    return { body, ...validateCaBundle(body, expectedHash), source: CA_URL, transport: 'caller-pinned offline copy' };
  }
  if (expectedHash) fail('--ca-sha256 requires --ca-bundle');
  const response = await fetch(CA_URL, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) fail('Official RDS CA download failed');
  const body = Buffer.from(await response.arrayBuffer());
  return { body, ...validateCaBundle(body), source: CA_URL, transport: 'HTTPS official truststore' };
}

async function packageRoot(name, from) {
  let directory = dirname(createRequire(join(from, 'package.json')).resolve(name));
  while (dirname(directory) !== directory) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (metadata.name === name) return { directory, metadata };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    directory = dirname(directory);
  }
  fail(`Cannot resolve production dependency ${name}`);
}

async function copyDependencies(stage, lock) {
  const copied = new Map();
  async function copy(name, from) {
    const { directory, metadata } = await packageRoot(name, from);
    if (copied.has(name)) {
      if (copied.get(name) !== metadata.version) fail(`Conflicting installed versions for ${name}; build a clean locked dependency tree`);
      return;
    }
    if (name === 'pg' && metadata.version !== PG_VERSION) fail(`pg must be exactly ${PG_VERSION}`);
    if (!Object.entries(lock.packages).some(([path, p]) => path.endsWith(`node_modules/${name}`) && p.version === metadata.version && p.integrity)) fail(`Installed ${name} is not pinned by the repository lockfile`);
    copied.set(name, metadata.version);
    const destination = join(stage, 'node_modules', name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(directory, destination, { recursive: true, filter: (path) => path === directory || !path.slice(directory.length + 1).split('/').includes('node_modules') });
    for (const dep of Object.keys(metadata.dependencies ?? {}).sort()) await copy(dep, directory);
    for (const dep of Object.keys(metadata.optionalDependencies ?? {}).sort()) {
      try { await packageRoot(dep, directory); } catch (error) { if (error.code === 'MODULE_NOT_FOUND') continue; throw error; }
      await copy(dep, directory);
    }
  }
  await copy('pg', ROOT);
  return Object.fromEntries([...copied].sort(([a], [b]) => a.localeCompare(b)));
}

async function fileList(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || /[\r\n]/.test(path)) fail('Symlink or unsafe path in migration package');
    if (entry.isDirectory()) files.push(...await fileList(directory, path));
    else if (entry.isFile()) files.push(path);
    else fail('Unexpected filesystem entry in migration package');
  }
  return files.sort();
}

export async function build({ out = join(ROOT, 'work/aws-auth-migration'), caPath, caSha256 } = {}) {
  return buildPgLambda({ out, caPath, caSha256, prefix: 'cognito-migration', handler: 'migration-lambda.handler',
    prepare: async (stage) => {
      const source = await readFile(ENTRY, 'utf8');
      if (!source.includes('rejectUnauthorized:true') && !/rejectUnauthorized\s*:\s*true/.test(source)) fail('Migration handler must verify the RDS TLS certificate');
      if (!source.includes('COGNITO_EMAIL_USER_POOL_ID') || !source.includes('RDS_CA_BUNDLE_PATH')) fail('Migration handler does not match the isolated email-pool/CA contract');
      await writeFile(join(stage, 'migration-lambda.mjs'), source);
      return source;
    },
    verify: (directory) => {
      execFileSync(process.execPath, ['--input-type=module', '-e', "const pg=await import('pg');const m=await import('./migration-lambda.mjs');if(typeof pg.Pool!=='function'||typeof m.handler!=='function'||typeof m.createMigrationHandler!=='function')throw Error('Invalid migration ZIP');const h=m.createMigrationHandler({userPoolId:'test-pool',clientId:'test-client',verifyPassword:async()=>({email:'test@example.invalid',legacyUserId:'00000000-0000-0000-0000-000000000001',appUserId:'00000000-0000-0000-0000-000000000002'})});const e=await h({userPoolId:'test-pool',callerContext:{clientId:'test-client'},triggerSource:'UserMigration_Authentication',userName:'test@example.invalid',request:{password:'local-build-check'}});if(e.response.finalUserStatus!=='CONFIRMED')throw Error('Migration contract differs');"], { cwd: directory, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeout: 10000 });
    },
  });
}

// Shared locked-pg/official-CA packager. Each entry supplies its own source and isolated contract check.
export async function buildPgLambda({ out, caPath, caSha256, prefix, handler, prepare, verify }) {
  const directory = resolve(out); await mkdir(directory, { recursive: true });
  const temporary = await mkdtemp(join(directory, '.lambda-build-'));
  let extracted;
  try {
    const stage = join(temporary, 'payload'); await mkdir(stage);
    const source = await prepare(stage);
    const lockBytes = await readFile(join(ROOT, 'package-lock.json'));
    const dependencies = await copyDependencies(stage, JSON.parse(lockBytes));
    const ca = await caBundle(caPath, caSha256);
    await writeFile(join(stage, 'global-bundle.pem'), ca.body);
    const files = await fileList(stage);
    const fixedTime = new Date('1980-01-01T00:00:00Z');
    let uncompressedBytes = 0;
    for (const file of files) { uncompressedBytes += (await stat(join(stage, file))).size; await utimes(join(stage, file), fixedTime, fixedTime); }
    if (uncompressedBytes > 250 * 1024 * 1024) fail('Uncompressed migration ZIP exceeds the Lambda limit');
    const archive = join(temporary, 'migration.zip');
    execFileSync('zip', ['-q', '-X', archive, '-@'], { cwd: stage, input: `${files.join('\n')}\n`, env: { ...process.env, TZ: 'UTC' } });
    extracted = await mkdtemp(join(tmpdir(), 'byus-auth-zip-verify-'));
    execFileSync('unzip', ['-q', archive, '-d', extracted]);
    // Verify the extracted ZIP without repository node_modules or environment credentials.
    await verify(extracted);
    const bytes = await readFile(archive), digest = sha256(bytes), zipPath = join(directory, `${prefix}-${digest}.zip`);
    try { await copyFile(archive, zipPath, (await import('node:fs')).constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST' || sha256(await readFile(zipPath)) !== digest) throw error; }
    const manifest = { format: 1, runtime: 'nodejs24.x', handler, architecture: 'x86_64', zipPath, sha256: digest, codeSha256Base64: createHash('sha256').update(bytes).digest('base64'), sourceSha256: sha256(source), lockfileSha256: sha256(lockBytes), dependencies, ca: { source: ca.source, transport: ca.transport, sha256: ca.sha256, certificateCount: ca.certificateCount, liveSeoulRoots: ca.liveSeoulRoots }, zipBytes: bytes.length, uncompressedBytes, entryCount: files.length, localImportCheckedWith: process.version };
    const manifestPath = join(directory, `${prefix}-${digest}.json`);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    return { ...manifest, manifestPath };
  } finally { if (extracted) await rm(extracted, { recursive: true, force: true }); await rm(temporary, { recursive: true, force: true }); }
}

export function validateParameters(c, template) {
  if (!c || !['dev', 'staging', 'prod'].includes(c.environment) || c.region !== 'ap-northeast-2' || !/^\d{12}$/.test(c.accountId ?? '') || !c.parameters || typeof c.parameters !== 'object' || Array.isArray(c.parameters)) fail('Explicit account/environment/Seoul region and parameter object required');
  const values = {};
  for (const key of Object.keys(c.parameters)) if (!Object.hasOwn(template.Parameters, key)) fail(`Unknown migration parameter ${key}`);
  for (const [name, spec] of Object.entries(template.Parameters)) {
    const value = c.parameters[name] ?? spec.Default;
    if (typeof value !== 'string' || !value.trim() || (spec.AllowedPattern && !new RegExp(`^(?:${spec.AllowedPattern})$`).test(value)) || (spec.AllowedValues && !spec.AllowedValues.includes(value))) fail(`Missing/invalid migration parameter ${name}`);
    values[name] = value;
  }
  if (values.ExpectedAccountId !== c.accountId || values.Environment !== c.environment) fail('Migration parameter account/environment differs from approved configuration');
  if (!values.DatabaseSecretArn.startsWith(`arn:aws:secretsmanager:${c.region}:${c.accountId}:secret:`)) fail('Database migration secret must belong to the approved account/region');
  const subnets = values.PrivateSubnetIds.split(',').map((value) => value.trim());
  if (subnets.length !== 2 || new Set(subnets).size !== 2 || !subnets.every((s) => /^subnet-[a-f0-9]+$/.test(s))) fail('Exactly two distinct private subnets are required');
  if (values.CodeObjectVersion === 'null' || values.CodeObjectVersion === '$LATEST') fail('An immutable versioned S3 code object is required');
  return values;
}

export async function main(argv = process.argv.slice(2)) {
  const action = argv[0]?.startsWith('--') || !argv[0] ? 'build' : argv.shift();
  if (['help', '--help'].includes(action) || argv.includes('--help')) {
    console.log('build [--out DIRECTORY] [--ca-bundle OFFICIAL_PEM --ca-sha256 SHA256]\nrender --config CONFIG_JSON [--out DIRECTORY]\nNo AWS resources are changed. Deploy: (1) environment with blank UserMigrationArn, (2) versioned ZIP + cognito-migration stack, (3) environment with returned UserMigrationArn. Email pool and social pool must stay separate.'); return;
  }
  if (!['build', 'render'].includes(action)) fail('Use build, render or help');
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--out', '--ca-bundle', '--ca-sha256', '--config'].includes(key) || Object.hasOwn(flags, key) || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('Unknown/duplicate option or missing value');
    flags[key] = argv[++i];
  }
  if (action === 'build') {
    if (flags['--config']) fail('--config belongs to render');
    console.log(JSON.stringify(await build({ out: flags['--out'], caPath: flags['--ca-bundle'], caSha256: flags['--ca-sha256'] }), null, 2)); return;
  }
  if (!flags['--config'] || flags['--ca-bundle'] || flags['--ca-sha256']) fail('render requires only --config and optional --out');
  const template = JSON.parse(await readFile(TEMPLATE, 'utf8'));
  const config = JSON.parse(await readFile(resolve(flags['--config']), 'utf8'));
  const values = validateParameters(config, template);
  const out = resolve(flags['--out'] ?? join(ROOT, 'work/aws-auth-migration', config.environment)); await mkdir(out, { recursive: true });
  const parametersPath = join(out, 'parameters.json');
  await writeFile(parametersPath, `${JSON.stringify(Object.entries(values).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })), null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ executed: false, accountId: config.accountId, region: config.region, environment: config.environment, templatePath: TEMPLATE, parametersPath }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof SyntaxError ? 'Invalid JSON input' : error.message); process.exitCode = 1; });
