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
  for (const name of ['release', 'notice', 'dev-notice']) assert.equal(workflow.jobs[name]['runs-on'], 'ubuntu-24.04');
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
  assert.ok(full.fileNames.some(name => name.endsWith('/e2e/community-compact-local/main.tsx')));
  for (const name of full.fileNames.filter(name => !excluded(name))) assert.ok(runtimeFiles.has(name), name);
  assert.ok(runtime.fileNames.length < full.fileNames.length);
  const base = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  assert.ok(base.include.includes('.next/types/**/*.ts'));
  const config = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /typescript: \{ tsconfigPath: "tsconfig.aws.json" \}/);
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
  const restore = cs.findIndex(step => /actions\/cache\/restore@[a-f0-9]{40}$/.test(step.uses ?? ''));
  const build = cs.findIndex(step => step.name === 'Build ordinary application');
  const save = cs.findIndex(step => /actions\/cache\/save@[a-f0-9]{40}$/.test(step.uses ?? ''));
  assert.ok(restore >= 0 && restore < build && build < save);
  for (const index of [restore, save]) {
    assert.equal(cs[index]['continue-on-error'], true);
    assert.equal(cs[index].with.path, 'apps/web/.next/cache/.tsbuildinfo');
    assert.match(cs[index].with.key, /^cs-typecheck-v1-.*hashFiles\('package-lock\.json', 'apps\/web\/tsconfig\.json'\).*github\.run_id/);
  }
  assert.equal(cs[save].if, undefined);
  assert.equal(cs[build].run, 'npm run build');
  assert.equal(cs[build]['continue-on-error'], undefined);
  const backend = load(readFileSync('.github/workflows/backend-security.yml', 'utf8'));
  assert.ok(backend.jobs['api-runtime'].steps.some(step => step.run === 'npm run typecheck'));
});

test('release artifacts can be replaced during a rerun of the same workflow', () => {
  const uploads = workflow.jobs.release.steps.filter(step => step.uses === 'actions/upload-artifact@v4');
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
  assert.match(steps[save].if,/next_cache_ready/);assert.equal(steps[save]['continue-on-error'],true);
  assert.match(steps[restore].with.key,/next_cache_key\.outputs\.base/);
  assert.match(steps[save].with.key,/next_cache_key\.outputs\.base/);
  const script=steps[build].run;
  assert.match(script,/docker buildx build --load --platform linux\/amd64/);
  assert.doesNotMatch(script,/--cache-(from|to)/);
  assert.ok(!steps.some(s=>/ghaction-github-runtime/.test(s.uses??'')));
  assert.match(script,/docker run --rm --entrypoint node "\$tag"/);
  assert.match(script,/docker push "\$tag"/);
  assert.match(script,/aws ecr describe-images/);
  assert.match(script,/--target next-cache-export/);
  assert.match(script,/aws-release\.mjs build-record dev "\$digest"/);
  const dockerfile=readFileSync('Dockerfile.aws','utf8');
  assert.match(dockerfile,/COPY --from=nextcache \/ apps\/web\/\.next\/cache\/\nRUN if \[ -f apps\/web\/\.next\/cache\/typecheck\/buildinfo \]; then mv apps\/web\/\.next\/cache\/typecheck\/buildinfo apps\/web\/\.next\/cache\/\.tsbuildinfo; fi\nRUN NODE_OPTIONS=--max-old-space-size=6144 npm run build --workspace @byus\/web\n/);
  assert.doesNotMatch(dockerfile,/COPY \.ci\/next-build-cache/);
  assert.match(dockerfile,/FROM scratch AS nextcache\n\nFROM --platform=linux\/amd64 \$\{NODE_BUILD_BASE\} AS build/);
  const buildspec=readFileSync('infrastructure/aws/platform/buildspec.yml','utf8');
  assert.match(buildspec,/docker build --platform linux\/amd64 -f Dockerfile\.aws -t /);
  assert.doesNotMatch(buildspec,/--build-context/);
  assert.match(script,/--build-context nextcache=\.ci\/next-build-cache -f Dockerfile\.aws -t "\$tag"/);
  assert.match(script,/--build-context nextcache=\.ci\/next-build-cache --output type=local/);
  assert.match(readFileSync('.dockerignore','utf8'),/^\.ci\/next-build-cache$/m);
  // Only the compiler cache and the typecheck build info leave the build stage, and the export replaces the restored directory.
  assert.match(dockerfile,/FROM scratch AS next-cache-export\nCOPY --from=build \/app\/apps\/web\/\.next\/cache\/turbopack\/ \/turbopack\/\nCOPY --from=build \/app\/apps\/web\/\.next\/cache\/\.tsbuildinfo \/typecheck\/buildinfo\n\nFROM /);
  assert.match(script,/rm -rf \.ci\/next-build-cache && mv \.ci\/next-build-cache-export \.ci\/next-build-cache; then/);
  assert.doesNotMatch(script,/cp -a \.ci\/next-build-cache-export/);
  assert.match(steps[restore].with.key,/^dev-next-v2-/);
  assert.equal(steps[save].with.key,steps[restore].with.key);
  // The incremental check is still Next's own typecheck: it must stay on and the config must keep producing build info.
  assert.equal(JSON.parse(readFileSync('apps/web/tsconfig.json','utf8')).compilerOptions.incremental,true);
  assert.doesNotMatch(readFileSync('apps/web/next.config.ts','utf8'),/ignoreBuildErrors/);
  assert.match(dockerfile,/FROM --platform=linux\/amd64 \$\{NODE_BUILD_BASE\} AS runtime/);
  assert.match(readFileSync('apps/web/next.config.ts','utf8'),/NEXT_BUILD_CACHE === "1"[\s\S]*turbopackFileSystemCacheForBuild: true/);
  // dev 영구 캐시는 NEXT_DEV_FS_CACHE=0일 때만 끄고, 빌드 캐시 분기와 같은 experimental 객체에 합친다.
  assert.match(readFileSync('apps/web/next.config.ts','utf8'),/NEXT_DEV_FS_CACHE === "0"[\s\S]*turbopackFileSystemCacheForDev: false/);
  assert.equal(workflow.concurrency['cancel-in-progress'],false);
});
