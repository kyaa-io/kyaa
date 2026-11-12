import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import ts from 'typescript';

const workflow = load(readFileSync('.github/workflows/aws-platform.yml', 'utf8'));
test('both environments verify exact release CI before changing CloudFormation', () => {
  const steps = workflow.jobs.release.steps;
  const gate = steps.findIndex(step => step.run?.includes('scripts/aws-release-ci.mjs') && !step.run.includes('--fail-fast-only'));
  const deploy = steps.findIndex(step => step.run?.includes('scripts/aws-platform-deploy.mjs'));
  assert.ok(gate >= 0 && gate < deploy);
  assert.equal(steps[gate].if, undefined);
  assert.match(steps[gate].run, /jq -r .sourceSha work\/aws-release\/aws-release.json/);
  assert.equal(steps[gate]['continue-on-error'], undefined);
  assert.equal(workflow.jobs.release['continue-on-error'], undefined);
});
test('DEV runs cheap ancestry and failed-check gates before the image build, and the full gates stay after it', () => {
  const steps = workflow.jobs.release.steps;
  const at = text => steps.findIndex(step => step.run?.includes(text));
  const build = steps.findIndex(step => step.id === 'build');
  const ancestry = at('scripts/aws-release.mjs ancestry');
  const early = at('--fail-fast-only');
  const prepare = at('scripts/aws-release.mjs prepare');
  assert.ok(ancestry >= 0 && early >= 0 && build >= 0);
  assert.ok(ancestry < build && early < build && build < prepare);
  for (const index of [ancestry, early]) {
    assert.equal(steps[index].if, "env.RELEASE_ENV == 'dev'");
    assert.equal(steps[index]['continue-on-error'], undefined);
  }
  assert.match(steps[early].run, /"\$GITHUB_SHA" "\$GITHUB_RUN_ID" --fail-fast-only/);
});
test('prod promotion prints the Buildx version without letting that block it and adds no setup-buildx', () => {
  const steps = workflow.jobs.release.steps;
  const promote = steps.findIndex(step => step.run === 'node scripts/aws-release-images.mjs');
  const version = steps.findIndex(step => step.run?.includes('docker buildx version'));
  assert.ok(version >= 0 && version < promote);
  assert.equal(steps[version].if, "env.RELEASE_ENV != 'dev'");
  assert.match(steps[version].run, /\|\| echo/);
  assert.ok(steps.filter(step => /setup-buildx-action/.test(step.uses ?? '')).every(step => step.if === "env.RELEASE_ENV == 'dev'"));
});
test('promotion-path jobs run on the pinned ubuntu-24.04 runner', () => {
  for (const name of ['release', 'notice']) assert.equal(workflow.jobs[name]['runs-on'], 'ubuntu-24.04');
  assert.equal(load(readFileSync('.github/workflows/aws-approved-promotion.yml', 'utf8')).jobs['wait-and-promote']['runs-on'], 'ubuntu-24.04');
  assert.equal(load(readFileSync('.github/workflows/deployment-notices.yml', 'utf8')).jobs['validate-notice']['runs-on'], 'ubuntu-24.04');
});
test('notice failure is isolated, serialized through completion, and never changes release success', () => {
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.match(workflow.concurrency.group, /telegram-production-notices/);
  for (const job of Object.values(workflow.jobs)) assert.equal(job.concurrency, undefined, 'nested shared lock can deadlock');
  const notice = workflow.jobs.notice;
  assert.equal(notice.needs, 'release');
  assert.equal(notice['continue-on-error'], true);
  assert.match(notice.if, /needs.release.result == 'success'/);
  assert.match(notice.if, /public_live == 'true'/);
  assert.ok(notice.steps.some(step => step.if === 'failure()' && step.run.includes('GITHUB_STEP_SUMMARY')));
  const send = notice.steps.find(step => step.run === 'node scripts/deployment-notices.mjs send');
  assert.ok(send);
  assert.equal(send['continue-on-error'], undefined);
  assert.ok(workflow.jobs.release.steps.some(step => step.run === 'node scripts/aws-release.mjs record "$RELEASE_ENV"'));
});
test('pinned bases, reuse proof and exact digest promotion remain on the release path', () => {
  const steps = workflow.jobs.release.steps;
  const prepare = steps.find(step => step.id === 'media');
  const build = steps.find(step => step.name === 'Build one secretless dev image');
  assert.equal(prepare.if, "env.RELEASE_ENV == 'dev'");
  assert.match(build.run, /--build-arg NODE_BUILD_BASE="\$NODE_BUILD_BASE"/);
  assert.match(build.run, /--build-arg MEDIA_LAMBDA_BASE="\$MEDIA_LAMBDA_BASE"/);
  assert.match(build.run, /aws-release-media-reuse.mjs finish/);
  assert.match(build.run, /require\('sharp'\)/);
  assert.ok(steps.some(step => step.with?.name === 'aws-media-proof' && step.with['if-no-files-found'] === 'error'));
  assert.ok(steps.some(step => step.run === 'node scripts/aws-release-images.mjs'));
});
test('AWS compiler keeps every runtime root while full CI retains fixtures and tests', () => {
  const root = path.resolve('apps/web');
  const parse = name => {
    const file = path.join(root, name);
    const config = ts.readConfigFile(file, ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    assert.deepEqual(parsed.errors, []);
    return parsed;
  };
  const full = parse('tsconfig.json'), runtime = parse('tsconfig.aws.json');
  const excluded = name => /\/e2e\/|\.(test|spec)\.tsx?$|\/vitest\.(config|setup)\.ts$/.test(name);
  const runtimeFiles = new Set(runtime.fileNames);
  assert.ok(full.fileNames.some(name => name.endsWith('/e2e/translation-local/main.tsx')));
  assert.ok(full.fileNames.some(name => /\.(test|spec)\.tsx?$/.test(name)));
  assert.ok(runtime.fileNames.every(name => !excluded(name)));
  for (const name of full.fileNames.filter(name => !excluded(name))) assert.ok(runtimeFiles.has(name), name);
  assert.ok(runtime.fileNames.length < full.fileNames.length);
  const base = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  assert.ok(base.include.includes('.next/types/**/*.ts'));
  const config = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /typescript: \{ tsconfigPath: "tsconfig.aws.json",/);
  assert.doesNotMatch(config, /ignoreBuildErrors\s*:\s*true/);
  const backend = load(readFileSync('.github/workflows/backend-security.yml', 'utf8'));
  assert.equal(backend.on.push.paths, undefined);
  assert.ok(backend.jobs['api-runtime'].steps.some(step => step.run === 'npm run typecheck'));
});

test('DEV runner cleanup and builder teardown stay off the critical path without dropping the disk evidence', () => {
  const steps = workflow.jobs.release.steps;
  const free = steps.findIndex(step => step.name === 'Free unused runner toolchains and record disk space');
  const build = steps.findIndex(step => step.id === 'build');
  const after = steps.find(step => step.name === 'Record disk space after the dev build');
  assert.ok(free >= 0 && free < build);
  assert.equal(steps[free].if, "env.RELEASE_ENV == 'dev'");
  assert.match(steps[free].run, /sudo -b sh -c 'rm -rf \/usr\/share\/dotnet \/usr\/local\/lib\/android \/opt\/ghc \/opt\/hostedtoolcache\/CodeQL; touch \/tmp\/runner-cleanup-done'/);
  assert.match(steps[free].run, /df -h/);
  assert.equal(after.if, "always() && env.RELEASE_ENV == 'dev'");
  assert.match(after.run, /df -h/);
  assert.match(after.run, /runner-cleanup-done/);
  const buildx = steps.find(step => /setup-buildx-action/.test(step.uses ?? ''));
  assert.equal(buildx.with.cleanup, false);
});

test('the ordinary build reuses typecheck build info while the full typecheck stays a required check', () => {
  const cs = load(readFileSync('.github/workflows/cs-inquiries.yml', 'utf8')).jobs['cs-inquiries'].steps;
  const restore = cs.findIndex(step => /actions\/cache\/restore@[a-f0-9]{40}$/.test(step.uses ?? '') && step.with?.path === 'apps/web/.next/cache/.tsbuildinfo');
  const build = cs.findIndex(step => step.name === 'Build ordinary application');
  const save = cs.findIndex(step => /actions\/cache\/save@[a-f0-9]{40}$/.test(step.uses ?? '') && step.with?.path === 'apps/web/.next/cache/.tsbuildinfo');
  assert.ok(restore >= 0 && restore < build && build < save);
  for (const index of [restore, save]) {
    assert.equal(cs[index]['continue-on-error'], true);
    assert.equal(cs[index].with.path, 'apps/web/.next/cache/.tsbuildinfo');
    assert.match(cs[index].with.key, /^cs-typecheck-v1-.*hashFiles\('package-lock\.json', 'apps\/web\/tsconfig\.json'\).*github\.run_id/);
  }
  assert.equal(cs[save].if, cs[build].if);
  assert.match(cs[build].if, /github.event_name == 'push'.*refs\/heads\/main.*kyaa-io\/kyaa/);
  assert.equal(cs[build].run, 'npm run build');
  assert.equal(cs[build]['continue-on-error'], undefined);
  const backend = load(readFileSync('.github/workflows/backend-security.yml', 'utf8'));
  assert.ok(backend.jobs['api-runtime'].steps.some(step => step.run === 'npm run typecheck'));
});

test('release artifacts can be replaced during a rerun of the same workflow', () => {
  const uploads = workflow.jobs.release.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(uploads.length >= 4);
  for (const step of uploads) assert.equal(step.with.overwrite, true, step.with.name);
});

test('DEV caches are isolated, restored and exported without changing release image verification', () => {
  const steps=workflow.jobs.release.steps;
  const restore=steps.findIndex(s=>s.name==='Restore trusted DEV Next build cache');
  const build=steps.findIndex(s=>s.name==='Build one secretless dev image');
  const save=steps.findIndex(s=>s.name==='Save trusted DEV Next build cache');
  assert.ok(restore>=0&&restore<build&&build<save);
  for(const i of [restore,build])assert.equal(steps[i].if,"env.RELEASE_ENV == 'dev'");
  assert.equal(steps[save]['timeout-minutes'], 2);
  assert.ok(save > steps.findIndex(s => s.id === 'verify'));
  assert.ok(save > steps.findLastIndex(s => s.uses?.startsWith('actions/upload-artifact@')));
  assert.match(steps[save].if,/next_cache_ready/);assert.equal(steps[save]['continue-on-error'],true);
  assert.match(steps[restore].with.key,/next_cache_key\.outputs\.base/);
  assert.match(steps[save].with.key,/next_cache_key\.outputs\.base/);
  const script=steps[build].run;
  assert.match(script,/docker buildx build --load --platform linux\/amd64/);
  assert.doesNotMatch(script,/--cache-(from|to)/);
  assert.ok(!steps.some(s=>/ghaction-github-runtime/.test(s.uses??'')));
  assert.match(script,/docker run --rm --entrypoint node "\$image_id"/);
  assert.match(script,/docker push "\$tag"/);
  assert.match(script,/aws ecr describe-images/);
  assert.match(script,/--target next-cache-export/);
  assert.match(script,/aws-release\.mjs build-record dev "\$digest"/);
  const dockerfile=readFileSync('Dockerfile.aws','utf8');
  const stages=new Map([...dockerfile.matchAll(/^FROM .+ AS (\S+)\n([\s\S]*?)(?=^FROM |$(?![\s\S]))/gm)].map(m=>[m[1],m[0]]));
  assert.match(stages.get('build'),/COPY --from=nextcache \/ apps\/web\/\.next\/cache\/\nRUN if \[ -f apps\/web\/\.next\/cache\/typecheck\/buildinfo \]; then mv apps\/web\/\.next\/cache\/typecheck\/buildinfo apps\/web\/\.next\/cache\/\.tsbuildinfo; fi\n/);
  assert.match(stages.get('bundle'),/^FROM build AS bundle\nRUN KYAA_AWS_BUILD_PHASE=bundle NODE_OPTIONS=--max-old-space-size=6144 npm run build --workspace @byus\/web\n/m);
  assert.doesNotMatch(dockerfile,/COPY \.ci\/next-build-cache/);
  assert.match(dockerfile,/FROM scratch AS nextcache\n\nFROM --platform=linux\/amd64 \$\{NODE_BUILD_BASE\} AS build/);
  const buildspec=readFileSync('infrastructure/aws/platform/buildspec.yml','utf8');
  assert.match(buildspec,/docker build --platform linux\/amd64 -f Dockerfile\.aws -t /);
  assert.doesNotMatch(buildspec,/--build-context/);
  assert.match(script,/--build-context nextcache=\.ci\/next-build-cache -f Dockerfile\.aws -t "\$tag"/);
  assert.match(script,/--build-context nextcache=\.ci\/next-build-cache --output type=local/);
  assert.match(readFileSync('.dockerignore','utf8'),/^\.ci\/next-build-cache$/m);
  // Both branches must succeed before exporting compiler cache and typecheck build info.
  assert.match(stages.get('verified'),/^FROM bundle AS verified\nCOPY --from=typecheck \/tmp\/kyaa-web-typecheck-passed \/tmp\/kyaa-web-typecheck-passed\nCOPY --from=typecheck \/app\/apps\/web\/\.next\/cache\/\.tsbuildinfo \/app\/apps\/web\/\.next\/cache\/\.tsbuildinfo\n/m);
  assert.match(stages.get('next-cache-export'),/^FROM scratch AS next-cache-export\nCOPY --from=verified \/app\/apps\/web\/\.next\/cache\/turbopack\/ \/turbopack\/\nCOPY --from=verified \/app\/apps\/web\/\.next\/cache\/\.tsbuildinfo \/typecheck\/buildinfo\n/);
  assert.match(script,/rm -rf \.ci\/next-build-cache && mv \.ci\/next-build-cache-export \.ci\/next-build-cache; then/);
  assert.doesNotMatch(script,/cp -a \.ci\/next-build-cache-export/);
  assert.match(steps[restore].with.key,/^dev-next-v2-/);
  assert.equal(steps[save].with.key,steps[restore].with.key);
  // Only the isolated AWS bundle skips its inline check; the other branch must produce build info.
  assert.equal(JSON.parse(readFileSync('apps/web/tsconfig.json','utf8')).compilerOptions.incremental,true);
  assert.match(readFileSync('apps/web/next.config.ts','utf8'),/process\.env\.HOSTING_PROVIDER === "aws" \? \{[^\n]*typescript: \{ tsconfigPath: "tsconfig.aws.json", ignoreBuildErrors: process\.env\.KYAA_AWS_BUILD_PHASE === "bundle" \}/);
  assert.match(dockerfile,/FROM --platform=linux\/amd64 \$\{NODE_BUILD_BASE\} AS runtime/);
  assert.match(readFileSync('apps/web/next.config.ts','utf8'),/NEXT_BUILD_CACHE === "1"[\s\S]*turbopackFileSystemCacheForBuild: true/);
  // dev 영구 캐시는 NEXT_DEV_FS_CACHE=0일 때만 끄고, 빌드 캐시 분기와 같은 experimental 객체에 합친다.
  assert.match(readFileSync('apps/web/next.config.ts','utf8'),/NEXT_DEV_FS_CACHE === "0"[\s\S]*turbopackFileSystemCacheForDev: false/);
  assert.equal(workflow.concurrency['cancel-in-progress'],false);
});


test('only the exact repository main push delegates the ordinary build and its exclusive prerequisites', () => {
 const cs = load(readFileSync('.github/workflows/cs-inquiries.yml','utf8'));
 const steps = cs.jobs['cs-inquiries'].steps;
 const names = ['Restore the ffmpeg-static binary','Restore the typecheck build info of an earlier ordinary build','Build ordinary application','Save the typecheck build info of this ordinary build','Ordinary build rejects local test identities'];
 const enabled = (expression, github, hit='false') => Function('github','steps',`return (${expression.replace(/^\$\{\{\s*|\s*\}\}$/g,'').replaceAll('steps.ffmpeg-cache.outputs.cache-hit',"steps['ffmpeg-cache'].outputs['cache-hit']")})`)(github,{'ffmpeg-cache':{outputs:{'cache-hit':hit}}});
 for (const [event_name,ref,repository,delegated] of [
  ['push','refs/heads/main','kyaa-io/kyaa',true], ['pull_request','refs/pull/1/merge','kyaa-io/kyaa',false],
  ['push','refs/heads/release/production','kyaa-io/kyaa',false], ['workflow_dispatch','refs/heads/main','kyaa-io/kyaa',false],
  ['schedule','refs/heads/main','kyaa-io/kyaa',false], ['workflow_call','refs/heads/main','kyaa-io/kyaa',false],
  ['push','refs/heads/main','fork/kyaa',false], ['push','refs/heads/feature','kyaa-io/kyaa',false],
 ]) {
  const context={event_name,ref,repository};
  for(const name of names) assert.equal(enabled(steps.find(s=>s.name===name).if,context),!delegated,`${event_name} ${ref} ${name}`);
  const install=steps.find(s=>s.name==='Install the approved media runtime for the ordinary build');
  assert.equal(enabled(install.if,context),!delegated);assert.equal(enabled(install.if,context,'true'),false);
 }
 for(const step of steps.filter(s=>s.run?.includes('features/support server/support')||s.run==='bash scripts/verify-cs-local.sh')) {assert.equal(step.if,undefined);assert.equal(step['continue-on-error'],undefined);}
 assert.deepEqual(cs.on.push,{branches:['main','release/production']});
 assert.ok(!JSON.stringify(steps).includes('waitForRequiredCi'));
});

test('dev delegates shared script tests to required notices and retains its AWS-specific protection', () => {
 const steps=workflow.jobs.release.steps;
 const shared=steps.find(s=>s.name==='Test release and notice safeguards');
 assert.equal(shared.if,"env.RELEASE_ENV != 'dev'");
 assert.equal(shared.run,'node --test scripts/aws-release*.test.mjs scripts/deployment-notices.test.mjs scripts/dev-deployment-notices.test.mjs scripts/aws-wave-release.test.mjs');
 const dev=steps.find(s=>s.name==='Test dev deployment safeguards');
 assert.equal(dev.if,"env.RELEASE_ENV == 'dev'");assert.equal(dev.run,'node --test scripts/dev-deployment-notices.test.mjs');
 const notices=load(readFileSync('.github/workflows/deployment-notices.yml','utf8')).jobs['validate-notice'];
 assert.match(notices.if,/github.event_name == 'push'/);assert.equal(notices['runs-on'],'ubuntu-24.04');
 assert.ok(notices.steps.some(s=>s.run?.includes('scripts/aws-release*.test.mjs')&&s.run.includes('scripts/deployment-notices.test.mjs')&&s.run.includes('scripts/aws-wave-release.test.mjs')));
 assert.ok(notices.steps.some(s=>s.run==='node scripts/deployment-notices.mjs check "$BASE_SHA" "$HEAD_SHA"'));
});

test('the same loaded image is smoked, authenticated and checked immediately before the first push', () => {
 const build=workflow.jobs.release.steps.find(s=>s.id==='build');const script=build.run;
 const markers=['docker buildx build --load','image_id=$(docker image inspect','docker run --rm --entrypoint node "$image_id"','node apps/web/e2e/cs-local/production-auth.mjs image "$image_id"','node scripts/aws-release-runtime-auth.mjs before-push "$tag"','docker push "$tag"','aws ecr describe-images','aws-release.mjs build-record'];
 let previous=-1;for(const marker of markers){const i=script.indexOf(marker);assert.ok(i>previous,marker);previous=i;}
 assert.match(script,/set -euo pipefail/);assert.equal(build['continue-on-error'],undefined);
 assert.equal((script.match(/docker buildx build --load/g)||[]).length,1);
 assert.ok(script.indexOf('aws-release.mjs build-record')<script.indexOf('--target next-cache-export'));
});

 test('DEV notices run off the release path with trusted source artifacts', () => {
 const notices=load(readFileSync('.github/workflows/deployment-notices.yml','utf8'));
 assert.equal(workflow.jobs['dev-notice'],undefined);
 assert.deepEqual(notices.on.workflow_run,{workflows:['AWS platform release'],types:['completed']});
 const job=notices.jobs['dev-notice'];
 assert.match(job.if,/workflow_run.conclusion == 'success'/);
 assert.match(job.if,/head_repository.id == 1307387500/);
 assert.equal(job.concurrency.group,'aws-release-dev');
 assert.equal(job.steps[0].with.ref,'main');
 const artifact=job.steps.find(s=>s.uses?.startsWith('actions/download-artifact@'));
 assert.equal(artifact.with['run-id'],'${{ github.event.workflow_run.id }}');
 assert.ok(job.steps.some(s=>s.run?.includes('assert.equal(e.deployment.payload.workflowRunId')));
 assert.ok(job.steps.some(s=>s.run==='node scripts/dev-deployment-notices.mjs'));
 });

test('superseded main runs do not download or send a nonexistent dev receipt', () => {
  const job = load(readFileSync('.github/workflows/deployment-notices.yml', 'utf8')).jobs['dev-notice'];
  const guard = job.steps.find(step => step.id === 'deployed');
  assert.match(guard.run, /j.name === "release" && j.conclusion === "success"/);
  for (const step of job.steps.filter(step => step.uses?.startsWith('actions/download-artifact@') || step.name === 'Bind deployment artifact to the completed source run' || step.name === 'Notify the exact successful DEV release')) {
    assert.equal(step.if, "steps.deployed.outputs.deployed == 'true'");
  }
});

test('main restoration follows web deployment even when later release steps fail', () => {
  const release = workflow.jobs.release;
  const deploy = release.steps.find(step => step.id === 'deploy_web');
  assert.equal(release.outputs.dev_web_deployed, '${{ steps.deploy_web.outputs.dev_web_deployed }}');
  assert.equal(deploy.run, `node scripts/aws-platform-deploy.mjs deploy --config work/aws-release/aws-release-config.json --execute
if [ "$RELEASE_ENV" = dev ]; then echo 'dev_web_deployed=true' >> "$GITHUB_OUTPUT"; fi
`);
  const condition = workflow.jobs['restore-main'].if;
  assert.equal(condition, "always() && needs.release.outputs.dev_web_deployed == 'true' && github.event_name == 'push' && github.ref == 'refs/heads/release/production'");
  const evaluate = Function('always', 'needs', 'github', `return ${condition}`);
  const hotfix = { event_name: 'push', ref: 'refs/heads/release/production' };
  for (const [result, deployed, expected] of [
    ['failure', 'true', true], // Web deployed, verify/schedules/receipt upload failed.
    ['failure', '', false], // Failed before web deployment completed.
    ['success', 'true', true],
    ['skipped', '', false],
  ]) {
    const needs = { release: { result, outputs: { dev_web_deployed: deployed } } };
    assert.equal(evaluate(() => true, needs, hotfix), expected);
    assert.equal(evaluate(() => true, needs, { ...hotfix, ref: 'refs/heads/main' }), false);
    assert.equal(evaluate(() => true, needs, { ...hotfix, event_name: 'workflow_dispatch' }), false);
  }
});
