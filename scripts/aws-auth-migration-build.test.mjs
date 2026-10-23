import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { build, validateParameters, validateCaBundle, CA_URL } from './aws-auth-migration-build.mjs';

const load = async (file) => JSON.parse(await readFile(resolve(`infrastructure/aws/platform/${file}.json`), 'utf8'));
function config() {
  return { environment: 'dev', region: 'ap-northeast-2', accountId: '111111111111', parameters: {
    Environment: 'dev', ExpectedAccountId: '111111111111', EmailUserPoolId: 'ap-northeast-2_testpool', EmailClientId: 'testclient',
    CodeBucket: 'test-migration-bucket', CodeKey: 'releases/test/migration.zip', CodeObjectVersion: 'immutable-object-version', VpcId: 'vpc-1234', PrivateSubnetIds: 'subnet-1111,subnet-2222',
    DatabaseSecurityGroupId: 'sg-1234', DatabaseEndpoint: 'test.abc.ap-northeast-2.rds.amazonaws.com', DatabaseName: 'byus', DatabaseSecretArn: 'arn:aws:secretsmanager:ap-northeast-2:111111111111:secret:dev/migration-abc123',
  } };
}

test('email pool has an independent namespace, immutable IDs and a password-only public migration client', async () => {
  const t = await load('environment'), r = t.Resources;
  assert.deepEqual(r.EmailClient.Properties.UserPoolId, { Ref: 'EmailUserPool' });
  assert.deepEqual(r.WebClient.Properties.UserPoolId, { Ref: 'UserPool' });
  assert.deepEqual(r.MobileClient.Properties.UserPoolId, { Ref: 'UserPool' });
  assert.equal(t.Parameters.UserMigrationArn.Default, '');
  assert.deepEqual(r.EmailUserPool.Properties.LambdaConfig['Fn::If'], ['HasUserMigration', { UserMigration: { Ref: 'UserMigrationArn' } }, { Ref: 'AWS::NoValue' }]);
  for (const name of ['legacy_user_id', 'app_user_id']) {
    const schema = r.EmailUserPool.Properties.Schema.find((s) => s.Name === name);
    assert.equal(schema.AttributeDataType, 'String'); assert.equal(schema.Mutable, false);
    assert(r.EmailClient.Properties.ReadAttributes.includes(`custom:${name}`));
  }
  assert.deepEqual(r.EmailClient.Properties.ExplicitAuthFlows, ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']);
  for (const resource of Object.values(r).filter((r) => r.Type === 'AWS::Cognito::UserPoolClient')) {
    assert.equal(resource.Properties.GenerateSecret, false);
    assert(resource.Properties.WriteAttributes.every((a) => !a.startsWith('custom:')));
  }
  assert.equal(r.EmailClient.Properties.SupportedIdentityProviders, undefined);
  assert.equal(r.EmailUserPool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
});

test('social providers default off and use only existing secret references in the social pool', async () => {
  const t = await load('environment');
  for (const [name, parameter] of [['Google', 'GoogleProviderSecretArn'], ['Apple', 'AppleProviderSecretArn']]) {
    assert.equal(t.Parameters[parameter].Default, '');
    const provider = t.Resources[`${name}Provider`];
    assert.equal(provider.Condition, `Has${name}Provider`);
    assert.deepEqual(provider.Properties.UserPoolId, { Ref: 'UserPool' });
    assert.deepEqual(provider.Properties.AttributeMapping, { email: 'email', email_verified: 'email_verified' });
    for (const [key, value] of Object.entries(provider.Properties.ProviderDetails)) {
      if (key !== 'authorize_scopes') assert.equal(value['Fn::Sub'], `{{resolve:secretsmanager:\${${parameter}}:SecretString:${key}}}`);
    }
    for (const client of ['WebClient', 'MobileClient']) assert(t.Resources[client].Properties.SupportedIdentityProviders.some((p) => p?.['Fn::If']?.[0] === `Has${name}Provider`));
  }
  assert.equal(t.Resources.AppleProvider.Properties.ProviderName, 'SignInWithApple');
  assert.equal(t.Resources.GoogleProvider.Properties.ProviderName, 'Google');
});

test('migration Lambda is confined to RDS and the exact email pool, with no runtime secret API permission', async () => {
  const t = await load('cognito-migration'), r = t.Resources, fn = r.MigrationFunction.Properties;
  assert.deepEqual(t.Rules.ApprovedDeploymentTarget.Assertions[0].Assert['Fn::Equals'], [{ Ref: 'ExpectedAccountId' }, { Ref: 'AWS::AccountId' }]);
  assert.equal(fn.Runtime, 'nodejs24.x'); assert.equal(fn.Handler, 'migration-lambda.handler'); assert.equal(fn.Timeout, 5);
  assert.deepEqual(fn.Code.S3ObjectVersion, { Ref: 'CodeObjectVersion' });
  assert.equal(r.MigrationSecurityGroup.Properties.SecurityGroupEgress.length, 1);
  assert.deepEqual(r.MigrationSecurityGroup.Properties.SecurityGroupEgress[0], { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, DestinationSecurityGroupId: { Ref: 'DatabaseSecurityGroupId' } });
  const env = fn.Environment.Variables;
  assert.deepEqual(env.COGNITO_EMAIL_USER_POOL_ID, { Ref: 'EmailUserPoolId' });
  assert.equal(env.PGPASSWORD['Fn::Sub'], '{{resolve:secretsmanager:${DatabaseSecretArn}:SecretString:password}}');
  assert.equal(env.PGUSER['Fn::Sub'], '{{resolve:secretsmanager:${DatabaseSecretArn}:SecretString:username}}');
  const permission = r.CognitoMigrationPermission.Properties;
  assert.equal(permission.Principal, 'cognito-idp.amazonaws.com');
  assert.equal(permission.SourceArn['Fn::Sub'], 'arn:${AWS::Partition}:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/${EmailUserPoolId}');
  assert.deepEqual(permission.SourceAccount, { Ref: 'AWS::AccountId' });
  const statements = r.MigrationRole.Properties.Policies[0].PolicyDocument.Statement;
  assert(!JSON.stringify(statements).includes('secretsmanager:'));
  assert(statements.some((s) => s.Effect === 'Deny' && s.Condition.ArnEquals['lambda:SourceFunctionArn']));
  const eni = statements.filter(s => s.Effect === 'Allow' && s.Action.some(a => a.startsWith('ec2:')));
  assert.equal(eni.length, 3);
  assert(eni.every(s => s.Condition.StringEquals['aws:RequestedRegion'].Ref === 'AWS::Region'));
  const create = eni.find(s => s.Action.includes('ec2:CreateNetworkInterface'));
  assert.equal(create.Resource.length, 4);
  assert.equal(create.Resource[1]['Fn::Sub'], 'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:security-group/${MigrationSecurityGroup}');
  assert.deepEqual(create.Resource.slice(2).map(r => r['Fn::Sub'][1].Subnet['Fn::Select']), [[0, {Ref:'PrivateSubnetIds'}], [1, {Ref:'PrivateSubnetIds'}]]);
  const lifecycle = eni.find(s => s.Action.includes('ec2:DeleteNetworkInterface'));
  assert.equal(lifecycle.Condition.ArnEqualsIfExists['ec2:Vpc']['Fn::Sub'], 'arn:${AWS::Partition}:ec2:${AWS::Region}:${AWS::AccountId}:vpc/${VpcId}');
  assert.deepEqual(lifecycle.Condition.ArnEqualsIfExists['ec2:Subnet'], create.Resource.slice(2));
});

test('render inputs reject environment/account reversal, mutable artifacts and a foreign secret', async () => {
  const t = await load('cognito-migration'); validateParameters(config(), t);
  for (const mutate of [
    (c) => { c.parameters.Environment = 'prod'; },
    (c) => { c.parameters.ExpectedAccountId = '222222222222'; },
    (c) => { c.region = 'us-east-1'; },
    (c) => { c.parameters.DatabaseSecretArn = c.parameters.DatabaseSecretArn.replace('111111111111', '222222222222'); },
    (c) => { c.parameters.CodeObjectVersion = 'null'; },
    (c) => { c.parameters.PrivateSubnetIds = 'subnet-1111,subnet-1111'; },
    (c) => { c.parameters.PGPASSWORD = 'must-not-render'; },
  ]) { const c = config(); mutate(c); assert.throws(() => validateParameters(c, t)); }
});

test('parameter render never calls AWS or prints a password', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'byus-auth-render-'));
  try {
    const path = join(directory, 'config.json'); await writeFile(path, JSON.stringify(config()));
    const result = spawnSync(process.execPath, [resolve('scripts/aws-auth-migration-build.mjs'), 'render', '--config', path, '--out', directory], { encoding: 'utf8', env: { ...process.env, PATH: '/does-not-exist' } });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).executed, false);
    const parameters = JSON.parse(await readFile(join(directory, 'parameters.json'), 'utf8'));
    assert.equal(parameters.find((p) => p.ParameterKey === 'ExpectedAccountId').ParameterValue, config().accountId);
    assert(!parameters.some((p) => /password|username/i.test(p.ParameterKey)));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('official CA + locked pg ZIP is self-contained, reproducible and preserves the strict TLS entry', { timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'byus-auth-package-'));
  try {
    const response = await fetch(CA_URL, { redirect: 'error', signal: AbortSignal.timeout(30000) }); assert(response.ok);
    const ca = Buffer.from(await response.arrayBuffer()), digest = createHash('sha256').update(ca).digest('hex');
    assert(validateCaBundle(ca, digest).liveSeoulRoots > 0);
    assert.throws(() => validateCaBundle(ca, '0'.repeat(64)), /checksum/);
    assert.throws(() => validateCaBundle('not a certificate'));
    const path = join(directory, 'official-global-bundle.pem'); await writeFile(path, ca);
    const first = await build({ out: join(directory, 'first'), caPath: path, caSha256: digest });
    const second = await build({ out: join(directory, 'second'), caPath: path, caSha256: digest });
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.dependencies.pg, '8.23.1');
    assert.equal(first.ca.sha256, digest);
    const files = execFileSync('unzip', ['-Z1', first.zipPath], { encoding: 'utf8' }).trim().split('\n');
    assert(files.includes('migration-lambda.mjs')); assert(files.includes('global-bundle.pem')); assert(files.includes('node_modules/pg/lib/index.js'));
    assert(files.every((p) => !p.includes('.env') && !p.includes('config.json') && !p.includes('pg-native')));
    const source = execFileSync('unzip', ['-p', first.zipPath, 'migration-lambda.mjs'], { encoding: 'utf8' });
    assert(/rejectUnauthorized\s*:\s*true/.test(source));
    assert(source.includes('COGNITO_EMAIL_USER_POOL_ID'));
    assert.equal(execFileSync('unzip', ['-p', first.zipPath, 'global-bundle.pem']).compare(ca), 0);
    assert(first.zipBytes < 1024 * 1024);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
