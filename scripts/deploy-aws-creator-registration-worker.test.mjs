import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deploymentOptions, deployWorker, targets, validateSecret, validateRole } from './deploy-aws-creator-registration-worker.mjs';
import { eniPolicy, prepare } from './aws-worker-vpc.mjs';

const account = '996702758024';
const env = { AWS_PROFILE: 'explicit', EXPECTED_AWS_ACCOUNT_ID: account };
const target = targets('dev');
const secret = { Name: target.secretName, ARN: `arn:aws:secretsmanager:ap-northeast-2:${account}:secret:${target.secretName}-aBc123` };
const role = { RoleName: target.roleName, Arn: target.roleArn, AssumeRolePolicyDocument: { Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { Service: 'lambda.amazonaws.com' } }] } };
const notFound = code => Object.assign(new Error('absent'), { stderr: `(${code})` });

test('explicit identity and mutation acknowledgement are mandatory; activation unsupported', () => {
  assert.equal(deploymentOptions(['dev', '--dry-run'], env).deploy, false);
  for (const input of [{}, { ...env, EXPECTED_AWS_ACCOUNT_ID: '000000000000' }, { ...env, AWS_REGION: 'us-east-1' }]) assert.throws(() => deploymentOptions(['dev', '--dry-run'], input));
  assert.throws(() => deploymentOptions(['prod', '--deploy'], env));
  assert.throws(() => deploymentOptions(['dev', '--enable'], env));
  assert.equal(deploymentOptions(['prod', '--deploy'], { ...env, BYUS_CREATOR_REGISTRATION_DEPLOY_CONFIRM: 'I_UNDERSTAND_BYUS_CREATOR_REGISTRATION_MUTATION' }).deploy, true);
});

test('secret and role isolation fail closed', () => {
  assert.equal(validateSecret(secret, target).Statement[0].Resource, secret.ARN);
  for (const invalid of [{ ...secret, Name: 'byus/worker/dev' }, { ...secret, ARN: secret.ARN.replace('/dev-', '/prod-') }, { ...secret, DeletedDate: 'today' }]) assert.throws(() => validateSecret(invalid, target));
  validateRole(role, [], [`${target.name}-secret-read`], target);
  assert.throws(() => validateRole({ ...role, Arn: target.roleArn.replace('-dev-', '-prod-') }, [], [], target));
  assert.throws(() => validateRole(role, [{ PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }], [], target));
  assert.throws(() => validateRole(role, [], ['normal-worker-secret'], target));
  assert.throws(() => validateRole({ ...role, AssumeRolePolicyDocument: { Statement: [{ ...role.AssumeRolePolicyDocument.Statement[0], Principal: { AWS: '*' } }] } }, [], [], target));
});

async function fixture(existing = false, failHash = false, unknownPolicy = false) {
  const root = await mkdtemp(join(tmpdir(), 'registrar-deploy-test-'));
  await mkdir(join(root, 'apps/worker/dist-lambda'), { recursive: true });
  const calls = [];
  let codeSha256;
  let updatedEnvironment;
  const aws = args => {
    calls.push(args);
    const operation = args.slice(0, 2).join(' ');
    if (operation === 'sts get-caller-identity') return { Account: account, Arn: 'arn:aws:iam::996702758024:user/test' };
    if (operation === 'secretsmanager describe-secret') return secret;
    if (operation === 'iam get-role') { if (existing) return { Role: role }; throw notFound('NoSuchEntity'); }
    if (operation === 'iam list-attached-role-policies') return { AttachedPolicies: [] };
    if (operation === 'iam list-role-policies') return { PolicyNames: unknownPolicy ? ['unrelated'] : [] };
    if (operation === 'lambda get-function') {
      if (!existing && !codeSha256) throw notFound('ResourceNotFoundException');
      return { Configuration: { FunctionArn: target.functionArn, Role: target.roleArn, PackageType: 'Zip', Timeout: 240, Runtime: 'nodejs24.x', Handler: 'index.handler', Architectures: ['arm64'], CodeSha256: failHash ? 'wrong' : codeSha256, Environment: updatedEnvironment, VpcConfig: { SubnetIds: ['subnet-a', 'subnet-b'], SecurityGroupIds: ['sg-a'] } } };
    }
    if (operation === 'events describe-rule') return { Arn: target.ruleArn, State: 'DISABLED', ScheduleExpression: 'rate(1 minute)' };
    if (operation === 'events list-targets-by-rule') return { Targets: [] };
    if (operation === 'lambda get-policy') throw notFound('ResourceNotFoundException');
    if (operation === 'events put-rule') return { RuleArn: target.ruleArn };
    if (operation === 'events put-targets') {
      const targets = JSON.parse(execFileSync('cat', [args[args.indexOf('--targets') + 1].replace('file://', '')], { encoding: 'utf8' }));
      assert.equal(targets.length, 1);
      assert.deepEqual(JSON.parse(targets[0].Input), { source: 'byus.creator-registration-cron', environment: 'dev' });
      assert.equal(targets[0].Arn, target.functionArn);
      return { FailedEntryCount: 0 };
    }
    if (operation === 'lambda update-function-configuration' || operation === 'lambda create-function') {
      // AWS update-function-configuration does not accept --architectures.
      if (operation.includes('update')) assert.ok(!args.includes('--architectures'));
      updatedEnvironment = JSON.parse(execFileSync('cat', [args[args.indexOf('--environment') + 1].replace('file://', '')], { encoding: 'utf8' }));
    }
    if (operation === 'lambda update-function-code' || operation === 'lambda create-function') {
      codeSha256 = createHash('sha256').update(execFileSync('cat', [args[args.indexOf('--zip-file') + 1].replace('fileb://', '')])).digest('base64');
    }
    return {};
  };
  const dependencies = { root, aws, build: async () => writeFile(join(root, 'apps/worker/dist-lambda/creator-registration-index.cjs'), 'exports.handler = async () => {};\n'), drain: async ms => calls.push(['drain', ms]), prepare: async ({ component, out }) => {
    assert.equal(component, 'creator-registration');
    await writeFile(join(out, 'vpc-config.json'), JSON.stringify({ SubnetIds: ['subnet-a', 'subnet-b'], SecurityGroupIds: ['sg-a'] }));
    await writeFile(join(out, 'vpc-eni-policy.json'), JSON.stringify(eniPolicy('dev', component, { VpcId: 'vpc-a', SubnetIds: ['subnet-a', 'subnet-b'], SecurityGroupIds: ['sg-a'] })));
    return { VpcId: 'vpc-a', SubnetIds: ['subnet-a', 'subnet-b'], SecurityGroupIds: ['sg-a'] };
  } };
  return { root, calls, dependencies, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('dry run rebuilds/hashes package and makes zero AWS writes', async () => {
  const f = await fixture();
  try {
    const evidence = await deployWorker({ environment: 'dev', profile: 'explicit', deploy: false }, f.dependencies);
    assert.equal(evidence.mutation, 'none');
    assert.equal(evidence.scheduleState, 'DISABLED');
    assert.match(evidence.codeSha256, /^[A-Za-z0-9+/]{43}=$/);
    assert.ok(f.calls.every(a => /^(get-|describe-|list-)/.test(a[1])));
    assert.equal(evidence.secretName, 'byus/creator-registration/dev');
  } finally { await f.cleanup(); }
});

test('missing secret is reported in dry run and blocks deployment before writes', async () => {
  const f = await fixture();
  const originalAws = f.dependencies.aws;
  f.dependencies.aws = args => {
    if (args[0] === 'secretsmanager') throw notFound('ResourceNotFoundException');
    return originalAws(args);
  };
  try {
    const evidence = await deployWorker({ environment: 'dev', profile: 'explicit', deploy: false }, f.dependencies);
    assert.equal(evidence.secretProvisioned, false);
    await assert.rejects(deployWorker({ environment: 'dev', profile: 'explicit', deploy: true }, f.dependencies), /Provision the dedicated/);
    assert.ok(f.calls.every(a => /^(get-|describe-|list-)/.test(a[1])));
  } finally { await f.cleanup(); }
});

test('existing signer is disabled, throttled and drained before code/IAM; deployment remains disabled', async () => {
  const f = await fixture(true);
  try {
    const evidence = await deployWorker({ environment: 'dev', profile: 'explicit', deploy: true }, f.dependencies);
    const writes = f.calls.filter(a => !/^(get-|describe-|list-)/.test(a[1]));
    assert.deepEqual(writes.slice(0, 3).map(a => a.slice(0, 2)), [['events', 'put-rule'], ['lambda', 'put-function-concurrency'], ['drain', 245000]]);
    assert.equal(writes[0].at(-1), 'DISABLED');
    assert.equal(writes[1].at(-1), '0');
    assert.equal(evidence.remoteCodeSha256, evidence.codeSha256);
    assert.ok(!f.calls.some(a => a.includes('ENABLED') || a.includes('enable-rule')));
  } finally { await f.cleanup(); }
});

test('new signer is created disabled and remote package hash is verified', async () => {
  const f = await fixture();
  try {
    await deployWorker({ environment: 'dev', profile: 'explicit', deploy: true }, f.dependencies);
    assert.ok(f.calls.some(a => a[1] === 'create-role'));
    assert.ok(f.calls.some(a => a[1] === 'create-function'));
    assert.ok(!f.calls.some(a => a[0] === 'drain'));
  } finally { await f.cleanup(); }
});

test('wrong remote hash never restores concurrency or adds target', async () => {
  const f = await fixture(true, true);
  try {
    await assert.rejects(deployWorker({ environment: 'dev', profile: 'explicit', deploy: true }, f.dependencies), /hash\/role\/disabled/);
    assert.ok(!f.calls.some(a => a[1] === 'put-function-concurrency' && a.at(-1) === '1'));
    assert.ok(!f.calls.some(a => a[1] === 'put-targets'));
  } finally { await f.cleanup(); }
});

test('unrelated role policy aborts before any AWS write', async () => {
  const f = await fixture(true, false, true);
  try {
    await assert.rejects(deployWorker({ environment: 'dev', profile: 'explicit', deploy: true }, f.dependencies), /unexpected inline/);
    assert.ok(f.calls.every(a => /^(get-|describe-|list-)/.test(a[1])));
  } finally { await f.cleanup(); }
});

test('shared VPC helper resolves dedicated registrar role and scopes ENI deny to its Lambda', async () => {
  const out = await mkdtemp(join(tmpdir(), 'registrar-vpc-test-'));
  const calls = [];
  try {
    const result = await prepare({ environment: 'dev', component: 'creator-registration', profile: 'explicit', out }, args => {
      calls.push(args);
      switch (args.slice(0, 2).join(' ')) {
        case 'sts get-caller-identity': return { Account: account };
        case 'cloudformation describe-stacks': return { StackId: `arn:aws:cloudformation:ap-northeast-2:${account}:stack/byus-dev-platform/12345678-1234-1234-1234-123456789abc`, StackStatus: 'UPDATE_COMPLETE', Parameters: [{ ParameterKey: 'Environment', ParameterValue: 'dev' }], Outputs: Object.entries({ VpcId: 'vpc-a', AppSubnet1: 'subnet-a', AppSubnet2: 'subnet-b', TaskSecurityGroupId: 'sg-a' }).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })) };
        case 'ec2 describe-subnets': return { Subnets: ['subnet-a', 'subnet-b'].map(SubnetId => ({ SubnetId, VpcId: 'vpc-a', OwnerId: account, State: 'available', MapPublicIpOnLaunch: false })) };
        case 'ec2 describe-security-groups': return { SecurityGroups: [{ GroupId: 'sg-a', VpcId: 'vpc-a', OwnerId: account }] };
        case 'iam get-role': return { Role: role };
        case 'iam list-attached-role-policies': return { AttachedPolicies: [] };
        default: throw Error('Unexpected AWS operation');
      }
    });
    assert.equal(result.VpcId, 'vpc-a');
    assert.ok(calls.some(a => a[1] === 'get-role' && a.at(-1) === target.roleName));
    const policy = JSON.parse(await readFile(join(out, 'vpc-eni-policy.json'), 'utf8'));
    assert.deepEqual(policy.Statement.at(-1).Condition.ArnEquals['lambda:SourceFunctionArn'], [target.functionArn]);
    const notification = eniPolicy('dev', 'notification', { VpcId: 'vpc-a', SubnetIds: ['subnet-a'], SecurityGroupIds: ['sg-a'] });
    assert.equal(notification.Statement.at(-1).Condition.ArnEquals['lambda:SourceFunctionArn'].length, 2);
    assert.throws(() => eniPolicy('dev', 'unowned', {}));
  } finally { await rm(out, { recursive: true, force: true }); }
});
