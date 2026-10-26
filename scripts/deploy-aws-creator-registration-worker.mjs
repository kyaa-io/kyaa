#!/usr/bin/env node
// Deployment never activates this signer. Authority handoff/activation is a separate operation.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, copyFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { prepare } from './aws-worker-vpc.mjs';

const ACCOUNT = '996702758024';
const REGION = 'ap-northeast-2';
const BASIC_LOGS = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
const missing = (error, code) => String(error.stderr ?? error.message).includes(`(${code})`);
export function deploymentOptions(argv, env = process.env) {
  requireValue(argv.length === 2 && ['dev', 'staging', 'prod'].includes(argv[0]) && ['--dry-run', '--deploy'].includes(argv[1]), 'usage: node scripts/deploy-aws-creator-registration-worker.mjs <dev|staging|prod> <--dry-run|--deploy>');
  requireValue(/^[A-Za-z0-9_.@-]+$/.test(env.AWS_PROFILE ?? ''), 'Explicit AWS_PROFILE required');
  requireValue(env.EXPECTED_AWS_ACCOUNT_ID === ACCOUNT, `Explicit EXPECTED_AWS_ACCOUNT_ID=${ACCOUNT} required`);
  requireValue((env.AWS_REGION ?? REGION) === REGION && (env.AWS_DEFAULT_REGION ?? REGION) === REGION, `AWS region must be ${REGION}`);
  const deploy = argv[1] === '--deploy';
  if (deploy) requireValue(env.BYUS_CREATOR_REGISTRATION_DEPLOY_CONFIRM === 'I_UNDERSTAND_BYUS_CREATOR_REGISTRATION_MUTATION', 'Exact BYUS_CREATOR_REGISTRATION_DEPLOY_CONFIRM acknowledgement required for --deploy');
  return { environment: argv[0], profile: env.AWS_PROFILE, deploy };
}
export function targets(environment) {
  requireValue(['dev', 'staging', 'prod'].includes(environment), 'Invalid registrar environment');
  const name = `byus-creator-registration-worker-${environment}`;
  return { name, roleName: `${name}-lambda`, roleArn: `arn:aws:iam::${ACCOUNT}:role/${name}-lambda`, functionArn: `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`, secretName: `byus/creator-registration/${environment}`, ruleName: `${name}-every-minute`, ruleArn: `arn:aws:events:${REGION}:${ACCOUNT}:rule/${name}-every-minute` };
}
export function validateSecret(secret, target) {
  requireValue(secret.Name === target.secretName && new RegExp(`^arn:aws:secretsmanager:${REGION}:${ACCOUNT}:secret:${target.secretName}-[A-Za-z0-9]{6}$`).test(secret.ARN ?? '') && !secret.DeletedDate, 'Dedicated registrar secret account/environment/name mismatch');
  return { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'secretsmanager:GetSecretValue', Resource: secret.ARN }] };
}
export function validateRole(role, attached, inline, target) {
  requireValue(role.Arn === target.roleArn && role.RoleName === target.roleName && !role.PermissionsBoundary, 'Registrar role identity/boundary mismatch');
  const trust = role.AssumeRolePolicyDocument;
  requireValue(trust?.Statement?.length === 1 && trust.Statement[0].Effect === 'Allow' && trust.Statement[0].Action === 'sts:AssumeRole' && JSON.stringify(trust.Statement[0].Principal) === JSON.stringify({ Service: 'lambda.amazonaws.com' }) && !trust.Statement[0].Condition, 'Registrar role must trust only Lambda');
  requireValue(attached.every(p => p.PolicyArn === BASIC_LOGS), 'Registrar role has unexpected attached permissions; review separately');
  requireValue(inline.every(name => [`${target.name}-secret-read`, `${target.name}-vpc-eni`].includes(name)), 'Registrar role has unexpected inline permissions; review separately');
}
export async function deployWorker(options, dependencies = {}) {
  const { environment, profile, deploy } = options;
  const target = targets(environment);
  const root = dependencies.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const run = dependencies.run ?? ((command, args, settings = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...settings }));
  const aws = dependencies.aws ?? ((args) => {
    const output = run('aws', ['--profile', profile, '--region', REGION, '--no-cli-pager', ...args, '--output', 'json']);
    return output.trim() ? JSON.parse(output) : {};
  });
  const optional = (args, code) => { try { return aws(args); } catch (error) { if (!missing(error, code)) throw error; return null; } };
  const folder = await mkdtemp(join(tmpdir(), 'byus-creator-registration-'));
  try {
    const identity = aws(['sts', 'get-caller-identity']);
    requireValue(identity.Account === ACCOUNT, 'AWS account mismatch');
    const vpc = await (dependencies.prepare ?? prepare)({ environment, component: 'creator-registration', profile, out: folder }, aws);
    const secret = optional(['secretsmanager', 'describe-secret', '--secret-id', target.secretName], 'ResourceNotFoundException');
    requireValue(secret || !deploy, 'Provision the dedicated registrar secret before deployment');
    const secretPolicy = secret ? validateSecret(secret, target) : null;
    const role = optional(['iam', 'get-role', '--role-name', target.roleName], 'NoSuchEntity')?.Role;
    if (role) validateRole(role, aws(['iam', 'list-attached-role-policies', '--role-name', target.roleName]).AttachedPolicies ?? [], aws(['iam', 'list-role-policies', '--role-name', target.roleName]).PolicyNames ?? [], target);
    const current = optional(['lambda', 'get-function', '--function-name', target.name], 'ResourceNotFoundException')?.Configuration;
    if (current) requireValue(current.FunctionArn === target.functionArn && current.Role === target.roleArn && current.PackageType === 'Zip' && Number.isInteger(current.Timeout) && current.Timeout > 0 && current.Timeout <= 900, 'Existing registrar Lambda identity/role/package mismatch');
    const rule = optional(['events', 'describe-rule', '--name', target.ruleName], 'ResourceNotFoundException');
    if (rule) {
      requireValue(rule.Arn === target.ruleArn && rule.ScheduleExpression === 'rate(1 minute)' && !rule.EventPattern && !rule.RoleArn, 'Existing registrar schedule mismatch');
      const existingTargets = aws(['events', 'list-targets-by-rule', '--rule', target.ruleName]);
      requireValue(!existingTargets.NextToken && (existingTargets.Targets ?? []).every(t => t.Id === target.name && t.Arn === target.functionArn && !t.RoleArn), 'Registrar schedule has unrelated targets');
    }
    const statementId = `AllowEventBridgeCreatorRegistration${environment}`;
    const policy = optional(['lambda', 'get-policy', '--function-name', target.name], 'ResourceNotFoundException');
    const statements = policy ? JSON.parse(policy.Policy).Statement ?? [] : [];
    requireValue(statements.every(s => s.Sid === statementId && s.Effect === 'Allow' && s.Principal?.Service === 'events.amazonaws.com' && s.Action === 'lambda:InvokeFunction' && s.Resource === target.functionArn && s.Condition?.ArnLike?.['AWS:SourceArn'] === target.ruleArn && s.Condition?.StringEquals?.['AWS:SourceAccount'] === ACCOUNT), 'Unexpected registrar resource permissions; schedule remains disabled');
    // Rebuild in both modes: stale local artifacts are never accepted as deployment evidence.
    await (dependencies.build ?? (() => run('npm', ['run', 'build:lambda', '--workspace', '@byus/worker'], { cwd: root })))();
    const bundle = join(root, 'apps/worker/dist-lambda/creator-registration-index.cjs');
    run(process.execPath, ['--check', bundle]);
    await copyFile(bundle, join(folder, 'index.cjs'));
    run('zip', ['-X', '-q', 'lambda-package.zip', 'index.cjs'], { cwd: folder });
    requireValue(run('zipinfo', ['-1', join(folder, 'lambda-package.zip')]).trim() === 'index.cjs', 'Unexpected Lambda ZIP entries');
    const archive = await readFile(join(folder, 'lambda-package.zip'));
    const codeSha256 = createHash('sha256').update(archive).digest('base64');
    const evidence = { environment, profile, identity: { account: identity.Account, callerArn: identity.Arn }, region: REGION, ...target, handler: 'index.handler', runtime: 'nodejs24.x', architecture: 'arm64', concurrency: 1, enabled: false, schedule: 'rate(1 minute)', scheduleState: 'DISABLED', secretProvisioned: Boolean(secret), codeSha256, bundleSha256: createHash('sha256').update(await readFile(bundle)).digest('hex'), vpc, mutation: deploy ? 'deployed-disabled' : 'none' };
    if (!deploy) return evidence;
    const file = async (name, value) => { const path = join(folder, name); await writeFile(path, JSON.stringify(value), { mode: 0o600 }); return `file://${path}`; };
    const disabledEnvironment = { Variables: { CREATOR_REGISTRATION_WORKER_ENABLED: 'false', CREATOR_REGISTRATION_WORKER_ENVIRONMENT: environment, CREATOR_REGISTRATION_WORKER_SECRET_ID: target.secretName } };
    const environmentFile = await file('environment.json', disabledEnvironment);
    // Fail closed before touching signer permissions or code; drain existing invocations first.
    const createdRule = aws(['events', 'put-rule', '--name', target.ruleName, '--schedule-expression', 'rate(1 minute)', '--state', 'DISABLED']);
    requireValue(createdRule.RuleArn === target.ruleArn, 'Registrar schedule ARN mismatch');
    if (current) {
      aws(['lambda', 'put-function-concurrency', '--function-name', target.name, '--reserved-concurrent-executions', '0']);
      await (dependencies.drain ?? delay)((current.Timeout + 5) * 1000);
      aws(['lambda', 'update-function-configuration', '--function-name', target.name, '--environment', environmentFile]);
      aws(['lambda', 'wait', 'function-updated-v2', '--function-name', target.name]);
    }
    if (!role) {
      const trust = `file://${join(root, 'infrastructure/aws/worker/lambda-trust-policy.json')}`;
      aws(['iam', 'create-role', '--role-name', target.roleName, '--assume-role-policy-document', trust]);
    }
    aws(['iam', 'attach-role-policy', '--role-name', target.roleName, '--policy-arn', BASIC_LOGS]);
    aws(['iam', 'put-role-policy', '--role-name', target.roleName, '--policy-name', `${target.name}-secret-read`, '--policy-document', await file('secret-policy.json', secretPolicy)]);
    aws(['iam', 'put-role-policy', '--role-name', target.roleName, '--policy-name', `${target.name}-vpc-eni`, '--policy-document', `file://${join(folder, 'vpc-eni-policy.json')}`]);
    const config = ['--function-name', target.name, '--runtime', 'nodejs24.x', '--role', target.roleArn, '--handler', 'index.handler', '--timeout', '240', '--memory-size', '512', '--vpc-config', `file://${join(folder, 'vpc-config.json')}`, '--environment', environmentFile];
    if (current) {
      aws(['lambda', 'update-function-code', '--function-name', target.name, '--architectures', 'arm64', '--zip-file', `fileb://${join(folder, 'lambda-package.zip')}`]);
      aws(['lambda', 'wait', 'function-updated-v2', '--function-name', target.name]);
      aws(['lambda', 'update-function-configuration', ...config]);
      aws(['lambda', 'wait', 'function-updated-v2', '--function-name', target.name]);
    } else {
      for (let attempt = 0; ; attempt++) {
        try { aws(['lambda', 'create-function', ...config, '--architectures', 'arm64', '--zip-file', `fileb://${join(folder, 'lambda-package.zip')}`]); break; }
        catch (error) { if (attempt >= 11 || !String(error.stderr ?? error.message).includes('role defined for the function cannot be assumed by Lambda')) throw error; await (dependencies.drain ?? delay)(5000); }
      }
    }
    aws(['lambda', 'wait', 'function-active-v2', '--function-name', target.name]);
    const remote = aws(['lambda', 'get-function', '--function-name', target.name]).Configuration;
    requireValue(remote.CodeSha256 === codeSha256 && remote.Role === target.roleArn && remote.Runtime === 'nodejs24.x' && remote.Handler === 'index.handler' && remote.Architectures?.[0] === 'arm64' && Object.entries(disabledEnvironment.Variables).every(([key, value]) => remote.Environment?.Variables?.[key] === value) && ['SubnetIds', 'SecurityGroupIds'].every(key => JSON.stringify([...(remote.VpcConfig?.[key] ?? [])].sort()) === JSON.stringify([...vpc[key]].sort())), 'Remote registrar hash/role/disabled state mismatch; schedule remains disabled');
    aws(['lambda', 'put-function-concurrency', '--function-name', target.name, '--reserved-concurrent-executions', '1']);
    if (!statements.length) aws(['lambda', 'add-permission', '--function-name', target.name, '--statement-id', statementId, '--action', 'lambda:InvokeFunction', '--principal', 'events.amazonaws.com', '--source-arn', target.ruleArn, '--source-account', ACCOUNT]);
    const result = aws(['events', 'put-targets', '--rule', target.ruleName, '--targets', await file('target.json', [{ Id: target.name, Arn: target.functionArn, Input: JSON.stringify({ source: 'byus.creator-registration-cron', environment }), RetryPolicy: { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 0 } }])]);
    requireValue(result.FailedEntryCount === 0, 'Registrar schedule target update failed; schedule remains disabled');
    requireValue(aws(['events', 'describe-rule', '--name', target.ruleName]).State === 'DISABLED', 'Registrar schedule is unexpectedly enabled');
    return { ...evidence, remoteCodeSha256: remote.CodeSha256 };
  } finally { await rm(folder, { recursive: true, force: true }); }
}
export async function main(argv = process.argv.slice(2)) { console.log(JSON.stringify(await deployWorker(deploymentOptions(argv)), null, 2)); }
if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 78; });
