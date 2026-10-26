#!/usr/bin/env node
// After registrar handoff, use --aws-profile with the existing CLI to enqueue LIVE/WAVE;
// the dedicated worker alone signs and verifies finality. Start the SSM tunnel separately.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { keccak256, stringToHex } from 'viem';
import { CAMPAIGN_DEPLOYMENT, KYAA_BINDING_ID, prepareCampaignRegistration, prepareWaveCampaignRegistration, validateCampaignRegistration } from './register-giwa-campaign.mjs';

export const DATABASE = Object.freeze({ account: '996702758024', region: 'ap-northeast-2', instance: 'byus-prod-platform-database-40n9gar79vuq', host: 'byus-prod-platform-database-40n9gar79vuq.chaamoiiyd3w.ap-northeast-2.rds.amazonaws.com', database: 'byus', user: 'byus_admin' });
const assert = (ok, reason) => { if (!ok) throw Error(reason); };
const uuid = value => { assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'INVALID_UUID'); return value; };
const encode = value => JSON.stringify(value, null, 2);
const digest = value => keccak256(stringToHex(encode(value)));
const awsJson = args => JSON.parse(execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }));

export async function connectRegistrationDatabase(options, { aws = awsJson, readFile = file => fs.readFileSync(file, 'utf8'), Client = pg.Client } = {}) {
  assert(typeof options.profile === 'string' && /^[a-zA-Z0-9_.@-]{1,100}$/.test(options.profile), 'EXPLICIT_AWS_PROFILE_REQUIRED');
  assert(Number.isInteger(options.port) && options.port >= 1024 && options.port <= 65535 && options.caPath, 'LOCAL_TUNNEL_PORT_AND_CA_REQUIRED');
  const invoke = args => aws(['--profile', options.profile, '--region', DATABASE.region, '--output', 'json', ...args]);
  assert((await invoke(['sts', 'get-caller-identity'])).Account === DATABASE.account, 'AWS_ACCOUNT_CHANGED');
  const response = await invoke(['rds', 'describe-db-instances', '--db-instance-identifier', DATABASE.instance]);
  const db = response.DBInstances?.[0];
  assert(response.DBInstances?.length === 1 && db.DBInstanceIdentifier === DATABASE.instance && db.Endpoint?.Address === DATABASE.host && db.Endpoint.Port === 5432 && db.MasterUsername === DATABASE.user, 'RDS_IDENTITY_CHANGED');
  const arn = db.MasterUserSecret?.SecretArn;
  assert(typeof arn === 'string' && arn.startsWith(`arn:aws:secretsmanager:${DATABASE.region}:${DATABASE.account}:secret:`), 'RDS_MASTER_SECRET_REQUIRED');
  const secret = JSON.parse((await invoke(['secretsmanager', 'get-secret-value', '--secret-id', arn])).SecretString);
  assert(secret.username === DATABASE.user && typeof secret.password === 'string' && secret.password.length > 0, 'RDS_CREDENTIAL_IDENTITY_CHANGED');
  const client = new Client({ host: '127.0.0.1', port: options.port, database: DATABASE.database, user: DATABASE.user, password: secret.password,
    ssl: { rejectUnauthorized: true, servername: DATABASE.host, ca: await readFile(options.caPath) }, connectionTimeoutMillis: 10000, statement_timeout: 30000, query_timeout: 35000, application_name: 'byus-registration-queue-cli' });
  try {
    await client.connect();
    const identity = (await client.query('select current_database() as database, current_user as username')).rows[0];
    assert(identity?.database === DATABASE.database && identity.username === DATABASE.user, 'CONNECTED_DATABASE_IDENTITY_CHANGED');
    return client;
  } catch (error) { await client.end().catch(() => {}); throw error; }
}

export function queuedManifest(registration) {
  const body = { format: 'byus-queued-campaign-registration-v1', database: DATABASE, execution: 'dedicated-worker-queue', registration };
  return { ...body, hash: digest(body) };
}
function validateManifestHash(manifest, approvedHash) {
  assert(manifest?.format === 'byus-queued-campaign-registration-v1' && manifest.execution === 'dedicated-worker-queue' && encode(manifest.database) === encode(DATABASE), 'QUEUE_MANIFEST_IDENTITY_CHANGED');
  const { hash, ...body } = manifest;
  assert(hash === approvedHash && hash === digest(body), 'APPROVED_QUEUE_HASH_REQUIRED');
  assert(manifest.registration?.format === 'byus-campaign-registration-v1', 'CAMPAIGN_ONLY_QUEUE');
}
export function validateQueuedManifest(manifest, source, approvedHash) {
  validateManifestHash(manifest, approvedHash);
  validateCampaignRegistration(manifest.registration, source, manifest.registration.hash);
  return manifest;
}

async function sourceAndBinding(client, { campaign, waveEvent }, expectedBinding) {
  assert(Boolean(campaign) !== Boolean(waveEvent), 'ONE_CAMPAIGN_SOURCE_REQUIRED');
  let source;
  if (waveEvent) {
    assert(waveEvent === 'kyaa-wave-2026', 'UNSUPPORTED_WAVE_EVENT');
    source = (await client.query(`select w.event_key,w.campaign_id,w.creator_id,w.campaign_slug,x.id as context_id,x.creator_id as context_creator_id,x.live_event_id,x.wave_event_key,c.slug as creator_slug,c.status as creator_status,c.archived_at as creator_archived_at
      from public.kyaa_wave_participation_config w join public.fan_action_campaign_contexts x on x.id=w.campaign_id join public.celebrities c on c.id=w.creator_id where w.event_key=$1 for share of w,x,c`, [waveEvent])).rows[0];
  } else {
    source = (await client.query(`select l.id,l.celebrity_id,l.slug,l.publication_status,l.archived_at,c.status as creator_status,c.archived_at as creator_archived_at from public.live_events l join public.celebrities c on c.id=l.celebrity_id where l.id=$1 for share of l,c`, [uuid(campaign)])).rows[0];
    assert(source?.creator_status === 'published' && source.creator_archived_at === null, 'PUBLISHED_CREATOR_REQUIRED');
  }
  const actions = waveEvent ? [4] : [2, 3, 4, 5];
  const routes = (await client.query('select action_code,binding_id from public.fan_action_producer_routes where action_code=any($1::integer[]) and enabled order by action_code for share', [actions])).rows;
  const bindingId = routes[0]?.binding_id;
  assert(routes.length === actions.length && routes.every(route => route.binding_id === bindingId) && (!expectedBinding || bindingId === expectedBinding) && (!waveEvent || bindingId === KYAA_BINDING_ID), 'PRODUCER_ROUTES_CHANGED');
  const registration = waveEvent ? prepareWaveCampaignRegistration(source) : prepareCampaignRegistration(source, bindingId);
  const creatorId = waveEvent ? source.creator_id : source.celebrity_id;
  const binding = (await client.query(`select b.id,b.chain_id,b.hub_proxy from public.fan_action_bindings b join public.fan_action_verified_creators v on v.binding_id=b.id and v.creator_id=$2 where b.id=$1 for share of b,v`, [bindingId, creatorId])).rows[0];
  assert(binding?.chain_id === CAMPAIGN_DEPLOYMENT.chainId || binding?.chain_id === String(CAMPAIGN_DEPLOYMENT.chainId), 'BINDING_CHAIN_CHANGED');
  assert(binding.hub_proxy === CAMPAIGN_DEPLOYMENT.hub && binding.id === registration.binding, 'VERIFIED_CREATOR_BINDING_REQUIRED');
  return { source, registration };
}

export async function runQueueRegistration(client, { mode, manifest, approvedHash, campaign, waveEvent, jobId }) {
  assert(['prepare', 'execute', 'finalize'].includes(mode), 'USAGE_PREPARE_EXECUTE_FINALIZE');
  if (jobId) {
    assert(mode === 'finalize', 'JOB_STATUS_ONLY');
    const status = (await client.query('select public.registration_job_status($1::uuid) as result', [uuid(jobId)])).rows[0]?.result;
    assert(status?.job?.kind === 'campaign', 'CAMPAIGN_JOB_NOT_FOUND');
    return safeStatus(status);
  }
  assert(mode === 'prepare' || manifest?.registration?.format === 'byus-campaign-registration-v1', 'CAMPAIGN_ONLY_QUEUE');
  if (mode === 'finalize') {
    validateManifestHash(manifest, approvedHash);
    const job = (await client.query("select id from public.creator_registration_jobs where kind='campaign' and binding_id=$1 and campaign_id=$2", [uuid(manifest.registration.binding), uuid(manifest.registration.source.id)])).rows[0];
    assert(job, 'QUEUED_CAMPAIGN_REQUIRED');
    return safeStatus((await client.query('select public.registration_job_status($1::uuid) as result', [job.id])).rows[0].result);
  }
  const selected = mode === 'prepare' ? { campaign, waveEvent } : manifest.registration.source.kind === 'wave-event'
    ? { waveEvent: manifest.registration.source.event_key } : { campaign: manifest.registration.source.id };
  if (mode !== 'prepare') {
    assert(!campaign || campaign === selected.campaign, 'MANIFEST_SOURCE_ARGUMENT_CHANGED');
    assert(!waveEvent || waveEvent === selected.waveEvent, 'MANIFEST_SOURCE_ARGUMENT_CHANGED');
  }
  await client.query('begin isolation level repeatable read');
  try {
    const { source, registration } = await sourceAndBinding(client, selected, mode === 'prepare' ? undefined : manifest.registration.binding);
    if (mode === 'prepare') {
      const result = queuedManifest(registration);
      await client.query('commit');
      return result;
    }
    validateQueuedManifest(manifest, source, approvedHash);
    const status = (await client.query('select public.enqueue_campaign_registration($1::uuid,$2::uuid) as result', [registration.binding, registration.source.id])).rows[0].result;
    await client.query('commit');
    return safeStatus(status);
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
}
function safeStatus(snapshot) {
  const { job, attempt } = snapshot;
  return { jobId: job.id, campaignId: job.campaign_id, status: job.status, finalized: job.status === 'finalized', waiting: !['finalized', 'failed'].includes(job.status), transactionHash: attempt?.transaction_hash ?? null, errorCode: job.last_error_code ?? null };
}

export async function queueMain(args = process.argv.slice(2), dependencies = {}) {
  const allowed = new Set(['--aws-profile', '--local-port', '--ssl-root-cert', '--manifest', '--campaign', '--wave-event', '--approved-hash', '--job']);
  assert(args.length % 2 === 1 && args.slice(1).every((value, index) => index % 2 ? !value.startsWith('--') : allowed.has(value)), 'EXPLICIT_QUEUE_ARGUMENTS_REQUIRED');
  const options = new Map();
  for (let index = 1; index < args.length; index += 2) { assert(!options.has(args[index]), 'DUPLICATE_ARGUMENT'); options.set(args[index], args[index + 1]); }
  const mode = args[0], manifestPath = options.get('--manifest');
  assert(['prepare', 'execute', 'finalize'].includes(mode) && (manifestPath || (mode === 'finalize' && options.has('--job'))), 'MANIFEST_REQUIRED');
  const manifest = mode === 'prepare' || !manifestPath ? undefined : JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const client = await connectRegistrationDatabase({ profile: options.get('--aws-profile'), port: Number(options.get('--local-port')), caPath: options.get('--ssl-root-cert') }, dependencies);
  try {
    const result = await runQueueRegistration(client, { mode, manifest, approvedHash: options.get('--approved-hash'), campaign: options.get('--campaign'), waveEvent: options.get('--wave-event'), jobId: options.get('--job') });
    if (mode === 'prepare') fs.writeFileSync(manifestPath, encode(result) + '\n', { flag: 'wx', mode: 0o600 });
    (dependencies.output ?? console.log)(encode(mode === 'prepare' ? { prepared: true, hash: result.hash, manifest: manifestPath, execution: result.execution } : result));
    return result;
  } finally { await client.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) queueMain().catch(error => { console.error(encode({ stopped: true, reason: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'QUEUE_OPERATION_FAILED' })); process.exitCode = 1; });
