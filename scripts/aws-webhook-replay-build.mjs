#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, builtinModules } from 'node:module';
import { execFileSync } from 'node:child_process';
import { buildPgLambda } from './aws-auth-migration-build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'apps/web/server/webhook-intake/consumer.ts');
const ACCOUNT = '996702758024';
const REGION = 'ap-northeast-2';
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
export function validateTarget({ accountId, region, environment }) {
  if (accountId !== ACCOUNT || region !== REGION || !ENVIRONMENTS.includes(environment)) throw Error('Only approved Sallylab account, Seoul region and dev/staging/prod are allowed');
  return { accountId, region, environment };
}

// Runs from an extracted ZIP with no repository dependencies, credentials or network requests.
const VERIFY = `
const assert=require('node:assert/strict');
const {Client}=require('pg');const m=require('./index.js');
assert.equal(typeof Client,'function');assert.equal(typeof m.handler,'function');assert.equal(typeof m.processPointer,'function');
(async()=>{
 for(const environment of ['dev','staging','prod']){
  const source={APP_ENV:environment,WEBHOOK_REPLAY_ENABLED:'true',WEBHOOK_BUFFER_QUEUE_URL:'https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-'+environment+'.fifo',WEBHOOK_BUFFER_BUCKET:'byus-fixture-'+environment+'-996702758024',WEBHOOK_BUFFER_KMS_KEY_ID:'arn:aws:kms:ap-northeast-2:996702758024:key/00000000-0000-0000-0000-000000000001'};
  const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const raw=JSON.stringify({version:1,environment,provider:'telegram',receivedAt:new Date().toISOString(),body:Buffer.from('{}').toString('base64'),bodyHash:hash('{}'),headers:{},commands:[{name:'ingest_telegram_bug_report',args:{p_telegram_update_id:'123'}}]});
  const pointer=JSON.stringify({version:1,environment,key:'webhook-intake/'+environment+'/00000000-0000-0000-0000-000000000001.json',hash:hash(raw)});
  let applied=0;const deps={source,read:async()=>raw,apply:async(e,key)=>{assert.equal(e.environment,environment);assert.equal(key,'123');applied++;}};
  await m.processPointer(pointer,deps);assert.equal(applied,1);
  await assert.rejects(m.processPointer(pointer,{...deps,source:{...source,WEBHOOK_REPLAY_ENABLED:'false'}}),/replay paused/i);
  await assert.rejects(m.processPointer(pointer,{...deps,source:{...source,WEBHOOK_BUFFER_QUEUE_URL:source.WEBHOOK_BUFFER_QUEUE_URL.replace('996702758024','200151116034')}}));
  process.env.APP_ENV=environment;process.env.WEBHOOK_BUFFER_QUEUE_URL=source.WEBHOOK_BUFFER_QUEUE_URL;process.env.WEBHOOK_BUFFER_BUCKET=source.WEBHOOK_BUFFER_BUCKET;process.env.WEBHOOK_BUFFER_KMS_KEY_ID=source.WEBHOOK_BUFFER_KMS_KEY_ID;
  assert.deepEqual(await m.handler({Records:[{messageId:'paused',eventSourceARN:'arn:aws:sqs:ap-northeast-2:996702758024:byus-webhook-buffer-'+environment+'.fifo',body:pointer}]}),{batchItemFailures:[{itemIdentifier:'paused'}]});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
`;

export async function build({ out = join(ROOT, 'work/aws-webhook-replay'), caPath, caSha256, accountId = ACCOUNT, region = REGION } = {}) {
  const targets = ENVIRONMENTS.map(environment => validateTarget({ accountId, region, environment }));
  const { build: bundle } = createRequire(join(ROOT, 'apps/worker/package.json'))('esbuild');
  const artifact = await buildPgLambda({ out, caPath, caSha256, prefix: 'webhook-replay', handler: 'index.handler',
    prepare: async stage => {
      const source = await readFile(ENTRY, 'utf8');
      if (!/rejectUnauthorized\s*:\s*true/.test(source) || !source.includes('RDS_CA_BUNDLE_PATH')) throw Error('Replay consumer must preserve verified RDS TLS');
      const bundled = await bundle({ metafile: true, entryPoints: [ENTRY], outfile: join(stage, 'index.js'), bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['pg', 'pg-native'], tsconfig: join(ROOT, 'apps/web/tsconfig.json'), logLevel: 'silent',
        plugins: [{ name: 'server-only-marker', setup(plugin) {
          plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'marker' }));
          plugin.onLoad({ filter: /.*/, namespace: 'marker' }, () => ({ contents: '' }));
        } }],
      });
      const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
      for (const output of Object.values(bundled.metafile.outputs)) for (const dependency of output.imports) {
        if (dependency.external && !builtins.has(dependency.path) && !['pg', 'pg-native'].includes(dependency.path)) throw Error(`Unexpected external dependency: ${dependency.path}`);
      }
      await writeFile(join(stage, 'package.json'), '{"private":true,"type":"commonjs"}\n');
      return source;
    },
    verify: directory => execFileSync(process.execPath, ['-e', VERIFY], { cwd: directory, env: { PATH: process.env.PATH, HOME: process.env.HOME }, timeout: 10000 }),
  });
  const environments = [];
  for (const target of targets) {
    const manifestPath = join(resolve(out), `webhook-replay-${target.environment}-${artifact.sha256}.json`);
    const manifest = { ...artifact, ...target, manifestPath, executed: false, uploaded: false, replayEnabled: false, eventSourceMappingEnabled: false, queueArn: `arn:aws:sqs:${REGION}:${ACCOUNT}:byus-webhook-buffer-${target.environment}.fifo`, databaseSecretArnPrefix: `arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:byus/${target.environment}/webhook-replay-`, rdsCaBundlePath: '/var/task/global-bundle.pem' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    environments.push(manifest);
  }
  return { ...artifact, executed: false, uploaded: false, environments };
}

export async function main(argv = process.argv.slice(2)) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--out', '--ca-bundle', '--ca-sha256', '--account-id', '--region'].includes(key) || Object.hasOwn(flags, key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Unknown/duplicate option or missing value');
    flags[key] = argv[++i];
  }
  console.log(JSON.stringify(await build({ out: flags['--out'], caPath: flags['--ca-bundle'], caSha256: flags['--ca-sha256'], accountId: flags['--account-id'], region: flags['--region'] }), null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
