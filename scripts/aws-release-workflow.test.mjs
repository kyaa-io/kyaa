import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import ts from 'typescript';

const workflow = load(readFileSync('.github/workflows/aws-platform.yml', 'utf8'));
test('both environments verify exact release CI before changing CloudFormation', () => {
  const steps = workflow.jobs.release.steps;
  const gate = steps.findIndex(step => step.run?.includes('scripts/aws-release-ci.mjs'));
  const deploy = steps.findIndex(step => step.run?.includes('scripts/aws-platform-deploy.mjs'));
  assert.ok(gate >= 0 && gate < deploy);
  assert.equal(steps[gate].if, undefined);
  assert.match(steps[gate].run, /jq -r .sourceSha work\/aws-release\/aws-release.json/);
  assert.equal(steps[gate]['continue-on-error'], undefined);
  assert.equal(workflow.jobs.release['continue-on-error'], undefined);
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

test('release artifacts can be replaced during a rerun of the same workflow', () => {
  const uploads = workflow.jobs.release.steps.filter(step => step.uses === 'actions/upload-artifact@v4');
  assert.ok(uploads.length >= 4);
  for (const step of uploads) assert.equal(step.with.overwrite, true, step.with.name);
});
