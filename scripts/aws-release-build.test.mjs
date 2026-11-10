import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
const dockerfile = readFileSync('Dockerfile.aws', 'utf8');
const stages = new Map([...dockerfile.matchAll(/^FROM .+ AS (\S+)\n([\s\S]*?)(?=^FROM |$(?![\s\S]))/gm)].map(m => [m[1], m[0]]));
const typeCommand = /^RUN (cd apps\/web && .+)$/m.exec(stages.get('typecheck'))?.[1];
const fixture = () => { mkdirSync('work', { recursive: true }); return mkdtempSync(resolve('work/aws-build-test-')); };

test('only the isolated AWS bundle stage skips the default build typecheck', () => {
  const script = `const ts=require('typescript'),fs=require('fs');require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,p);console.log(JSON.stringify(require('./apps/web/next.config.ts').default.typescript||{}));`;
  const config = (hosting, phase) => {
    const result = spawnSync(process.execPath, ['-e', script], { encoding:'utf8', env:{...process.env,HOSTING_PROVIDER:hosting,KYAA_AWS_BUILD_PHASE:phase} });
    assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout);
  };
  assert.equal(config('', '').ignoreBuildErrors, undefined);
  assert.equal(config('', 'bundle').ignoreBuildErrors, undefined);
  assert.equal(config('aws', '').ignoreBuildErrors, false);
  assert.equal(config('aws', 'typecheck').ignoreBuildErrors, false);
  assert.deepEqual(config('aws', 'bundle'), {tsconfigPath:'tsconfig.aws.json',ignoreBuildErrors:true});
});

test('typecheck and bundle use isolated snapshots, and all exported artifacts require both', () => {
  assert.match(stages.get('typecheck'), /^FROM build AS typecheck\nENV NODE_ENV=production/m);
  assert.match(stages.get('build'), /ENV HOSTING_PROVIDER=aws NEXT_BUILD_CACHE=1/);
  assert.match(typeCommand, /next typegen && .*tsc --noEmit -p tsconfig.aws.json --tsBuildInfoFile .next\/cache\/\.tsbuildinfo/);
  assert.match(stages.get('bundle'), /^FROM build AS bundle\nRUN KYAA_AWS_BUILD_PHASE=bundle/m);
  assert.match(stages.get('verified'), /^FROM bundle AS verified/m);
  assert.match(stages.get('verified'), /COPY --from=typecheck \/tmp\/kyaa-web-typecheck-passed/);
  assert.match(stages.get('verified'), /COPY --from=typecheck .*\.tsbuildinfo/);
  for (const name of ['runtime','next-cache-export']) {
    assert.match(stages.get(name), /COPY --from=verified /);
    assert.doesNotMatch(stages.get(name), /COPY --from=(build|bundle) /);
  }
});

test('the actual production typecheck command rejects invalid generated route types', () => {
  const dir=fixture(), app=join(dir,'apps/web'); mkdirSync(join(app,'app'),{recursive:true});
  try {
    symlinkSync(resolve('node_modules'),join(dir,'node_modules'),'dir');
    for (const file of ['tsconfig.json','tsconfig.aws.json']) writeFileSync(join(app,file),readFileSync('apps/web/'+file));
    writeFileSync(join(app,'next.config.mjs'),'export default {typedRoutes:true,typescript:{tsconfigPath:"tsconfig.aws.json"}};');
    writeFileSync(join(app,'app/page.tsx'),'export default function Page(){return null;}');
    const run=()=>spawnSync('bash',['-c',typeCommand],{cwd:dir,encoding:'utf8',timeout:60000,env:{...process.env,NODE_ENV:'production',HOSTING_PROVIDER:'aws',NEXT_TELEMETRY_DISABLED:'1',KYAA_AWS_BUILD_PHASE:''}});
    const good=run(); assert.equal(good.status,0,good.stdout+good.stderr);
    assert.match(readFileSync(join(app,'.next/types/validator.ts'),'utf8'),/Page/);
    writeFileSync(join(app,'app/page.tsx'),'export default 1;');
    const bad=run(); assert.notEqual(bad.status,0); assert.match(bad.stdout+bad.stderr,/TS\d+/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

// Execute the production stage dependency graph with tiny commands; no app build or secrets are needed.
test('BuildKit refuses the final image when either branch fails', t => {
  const available=spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8',timeout:10000});
  if(available.status!==0){if(process.env.GITHUB_ACTIONS==='true')assert.fail('GitHub Actions requires Docker for the split-build failure gate');t.skip('local Docker daemon unavailable');return;}
  const dir=fixture();
  try {
    const graph=`FROM node:24-bookworm-slim AS build\nWORKDIR /app\nRUN mkdir -p apps/web/.next/cache apps/web/.next/standalone apps/web/.next/static apps/web/public && touch apps/web/.next/cache/.tsbuildinfo apps/web/.next/cache/turbopack-placeholder && mkdir apps/web/.next/cache/turbopack && echo app > apps/web/.next/standalone/server.js\n`+
      `FROM build AS typecheck\nARG TYPECHECK_EXIT=0\nRUN node -e "process.exit(Number(process.env.TYPECHECK_EXIT))" && touch /tmp/kyaa-web-typecheck-passed\n`+
      `FROM build AS bundle\nARG BUNDLE_EXIT=0\nRUN node -e "process.exit(Number(process.env.BUNDLE_EXIT))"\n`+
      stages.get('verified')+'\nFROM scratch AS runtime\n'+stages.get('runtime').split('\n').filter(l=>l.startsWith('COPY --from=')).map(l=>l.replace('--chown=app:app ','')).join('\n');
    writeFileSync(join(dir,'Dockerfile'),graph);
    const build=(a,b)=>spawnSync('docker',['build','--target','runtime','--build-arg',`TYPECHECK_EXIT=${a}`,'--build-arg',`BUNDLE_EXIT=${b}`,dir],{encoding:'utf8',timeout:120000,env:{...process.env,DOCKER_BUILDKIT:'1'}});
    const good=build(0,0);assert.equal(good.status,0,good.stdout+good.stderr);
    assert.notEqual(build(1,0).status,0,'failed typecheck must block final runtime');
    assert.notEqual(build(0,1).status,0,'failed bundle must block final runtime');
  } finally {rmSync(dir,{recursive:true,force:true});}
});
