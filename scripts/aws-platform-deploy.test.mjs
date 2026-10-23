import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { loadTemplate, validateConfig, renderTemplate, deploymentCommand, verifyIdentity, awsCredentialArguments, webDomains, verifyCertificateCoverage } from './aws-platform-deploy.mjs';

test('OIDC requires an assumed-role Actions session and does not select a local profile', () => {
  assert.throws(() => awsCredentialArguments('oidc', {}), /assumed-role/);
  assert.throws(() => awsCredentialArguments('oidc', { GITHUB_ACTIONS: 'true' }), /assumed-role/);
  assert.deepEqual(awsCredentialArguments('oidc', { GITHUB_ACTIONS: 'true', AWS_SESSION_TOKEN: 'fixture-session', AWS_ACCESS_KEY_ID: 'fixture-key' }), []);
  assert.deepEqual(awsCredentialArguments('local-fixture', {}), ['--profile', 'local-fixture']);
  const command = deploymentCommand({ profile: 'oidc', region: 'ap-northeast-2', stackName: 'fixture', environment: 'dev', kind: 'environment', cloudFormationRoleArn: 'arn:aws:iam::222222222222:role/byus-cfn' }, 'template.json', 'parameters.json');
  assert(!command.includes('--profile'));
  assert.equal(command[command.indexOf('--role-arn') + 1], 'arn:aws:iam::222222222222:role/byus-cfn');
});

const prodAccount = '111111111111';
const nonprodAccount = '222222222222';
function config(kind = 'environment', environment = 'dev') {
  const accountId = environment === 'prod' ? prodAccount : nonprodAccount;
  const parameters = { ProductionAccountId: prodAccount, NonproductionAccountId: nonprodAccount };
  if (kind === 'network') Object.assign(parameters, { NetworkTier: environment === 'prod' ? 'prod' : 'nonprod', AlbCertificateArn: `arn:aws:acm:ap-northeast-2:${accountId}:certificate/1234`, CloudFrontPrefixListId: 'pl-1234' });
  else parameters.Environment = environment;
  if (kind === 'environment') Object.assign(parameters, {
    NetworkStackName: 'byus-nonprod-network', WebImageUri: `${accountId}.dkr.ecr.ap-northeast-2.amazonaws.com/byus/web@sha256:${'a'.repeat(64)}`,
    WebDomainName: `${environment}.example.test`, OriginDomainName: `origin-${environment}.example.test`, InternalApiDomainName: `api-${environment}.example.test`,
    CloudFrontCertificateArn: `arn:aws:acm:us-east-1:${accountId}:certificate/1234`, WebAclArn: `arn:aws:wafv2:us-east-1:${accountId}:global/webacl/test/1234`,
    RuntimeConfigSecretArn: `arn:aws:secretsmanager:ap-northeast-2:${accountId}:secret:byus/${environment}/web-abc123`, ListenerPriority: 100,
    WebCallbackUrls: `https://${environment}.example.test/auth/callback`, WebLogoutUrls: `https://${environment}.example.test/`,
    MobileCallbackUrls: 'byus://callback', MobileLogoutUrls: 'byus://logout',
  });
  return { kind, environment, region: kind === 'edge-security' ? 'us-east-1' : 'ap-northeast-2', accountId, profile: 'test-only', stackName: `byus-${environment}-${kind}`, parameters,
    ...(kind === 'environment' ? { runtimeEnvironment: { PRIVY_APP_ID: 'test-only-app', PRIVY_APP_ENVIRONMENT: environment === 'prod' ? 'production' : 'development', BYUS_DATA_ENVIRONMENT: environment === 'prod' ? 'production' : 'development' } } : {}) };
}

for (const kind of ['network', 'environment', 'edge-security']) test(`${kind}: dev/staging/prod explicit scope validates`, async () => {
  const template = await loadTemplate(kind);
  for (const env of ['dev', 'staging', 'prod']) validateConfig(config(kind, env), template);
});

test('wrong account/region/environment fail before AWS', async () => {
  const template = await loadTemplate('environment');
  for (const mutate of [
    (c) => { c.accountId = prodAccount; }, (c) => { c.region = 'us-east-1'; },
    (c) => { c.environment = 'staging'; }, (c) => { c.parameters.ProductionAccountId = 'invalid'; },
    (c) => { c.parameters.CloudFrontCertificateArn = c.parameters.CloudFrontCertificateArn.replace('us-east-1', 'ap-northeast-2'); },
    (c) => { c.parameters.RuntimeConfigSecretArn = c.parameters.RuntimeConfigSecretArn.replace(nonprodAccount, prodAccount); },
    (c) => { c.parameters.Unknown = 'no'; }, (c) => { c.parameters.WebImageUri = c.parameters.WebImageUri.replace(/@sha256:.+$/, ':latest'); },
  ]) { const c = config(); mutate(c); assert.throws(() => validateConfig(c, template)); }
  assert.throws(() => verifyIdentity(config(), { Account: prodAccount }), /differs/);
  assert.doesNotThrow(() => verifyIdentity(config(), { Account: nonprodAccount }));
});

test('only explicit public configuration and secret key names enter web task', async () => {
  const t = await loadTemplate('environment');
  const c = config();
  const web = renderTemplate(c, t).Resources.TaskDefinition.Properties.ContainerDefinitions[0];
  assert.equal(web.User, '1001:1001');
  assert.deepEqual(web.Secrets.map((s) => s.Name), ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVY_APP_SECRET']);
  assert.equal(web.Secrets[0].ValueFrom['Fn::Sub'], '${RuntimeConfigSecretArn}:SUPABASE_URL::');
  assert.equal(web.Environment.find((e) => e.Name === 'HOSTING_PROVIDER').Value, 'aws');
  for (const key of ['PRIVY_APP_SECRET', 'UNREVIEWED_PUBLIC_VALUE', 'AWS_ACCESS_KEY_ID', 'NEXT_PUBLIC_SUPABASE_URL', 'NODE_OPTIONS']) {
    const bad = config(); bad.runtimeEnvironment[key] = 'must-not-render';
    assert.throws(() => renderTemplate(bad, t), /Secrets Manager|reserved/);
  }
  c.runtimeSecretKeys = ['SUPABASE_URL'];
  assert.throws(() => renderTemplate(c, t), /required key/);
});

test('legacy email authentication uses the application provider value', async () => {
  const t = await loadTemplate('environment'), c = config();
  c.runtimeEnvironment.EMAIL_AUTH_PROVIDER = 'supabase';
  assert.throws(() => validateConfig(c, t), /EMAIL_AUTH_PROVIDER/);
  c.runtimeEnvironment.EMAIL_AUTH_PROVIDER = 'legacy';
  assert.doesNotThrow(() => validateConfig(c, t));
  c.runtimeSecretKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVY_APP_SECRET', 'SUPABASE_ANON_KEY'];
  assert.throws(() => validateConfig(c, t), /Invalid runtime secret/);
});

test('social app clients cannot write verification flags reserved for Cognito', async () => {
  const t = await loadTemplate('environment');
  for (const name of ['WebClient', 'MobileClient']) assert.deepEqual(t.Resources[name].Properties.WriteAttributes, ['email']);
  const c = config();
  c.runtimeEnvironment.COGNITO_NATIVE_REDIRECT_URI = 'kyaa-app://auth/cognito';
  c.runtimeEnvironment.COGNITO_ENROLLMENT_ENABLED = 'false';
  const web = renderTemplate(c, t).Resources.TaskDefinition.Properties.ContainerDefinitions[0];
  assert.equal(web.Environment.find(e => e.Name === 'COGNITO_NATIVE_REDIRECT_URI').Value, 'kyaa-app://auth/cognito');
});

test('PostgREST needs pinned image, separate secret, local URL and service token', async () => {
  const t = await loadTemplate('environment');
  const c = config();
  assert.equal(validateConfig(c, t).EnablePostgrest, 'false');
  assert.equal(validateConfig(c, t).EnableDatabase, 'false');
  c.parameters.EnablePostgrest = 'true';
  assert.throws(() => validateConfig(c, t));
  c.parameters.PostgrestImageUri = c.parameters.WebImageUri.replace('/byus/web@', '/byus/postgrest@');
  c.parameters.PostgrestSecretArn = c.parameters.RuntimeConfigSecretArn.replace('/web-', '/postgrest-');
  c.runtimeSecretKeys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVY_APP_SECRET', 'POSTGREST_SERVICE_TOKEN'];
  c.runtimeEnvironment.POSTGREST_URL = 'https://external.example.test';
  assert.throws(() => validateConfig(c, t), /localhost/);
  c.runtimeEnvironment.POSTGREST_URL = 'http://127.0.0.1:3001';
  validateConfig(c, t);
  const pg = renderTemplate(c, t).Resources.TaskDefinition.Properties.ContainerDefinitions[1]['Fn::If'][1];
  assert.equal(pg.User, '1001:1001');
  assert(pg.Environment.some((e) => e.Name === 'PGRST_SERVER_PORT' && e.Value === '3001'));
});

test('Supabase secrets become optional only after every legacy data path is disabled', async () => {
  const t = await loadTemplate('environment');
  const c = config();
  Object.assign(c.parameters, {
    EnablePostgrest: 'true',
    PostgrestImageUri: c.parameters.WebImageUri.replace('/byus/web@', '/byus/postgrest@'),
    PostgrestSecretArn: c.parameters.RuntimeConfigSecretArn.replace('/web-', '/postgrest-'),
  });
  Object.assign(c.runtimeEnvironment, {
    POSTGREST_URL: 'http://127.0.0.1:3001', AWS_STORAGE_ENABLED: 'true',
    EMAIL_AUTH_PROVIDER: 'cognito', LEGACY_EMAIL_AUTH_ENABLED: 'false',
  });
  c.runtimeSecretKeys = ['PRIVY_APP_SECRET', 'REQUEST_HASH_SECRET', 'AUTH_COOKIE_SECRET', 'POSTGREST_SERVICE_TOKEN'];
  assert.doesNotThrow(() => renderTemplate(c, t));
  for (const key of ['AWS_STORAGE_ENABLED', 'EMAIL_AUTH_PROVIDER', 'LEGACY_EMAIL_AUTH_ENABLED']) {
    const partial = structuredClone(c);
    delete partial.runtimeEnvironment[key];
    assert.throws(() => renderTemplate(partial, t), /required key/);
  }
  for (const key of ['REQUEST_HASH_SECRET', 'AUTH_COOKIE_SECRET']) {
    const missing = structuredClone(c);
    missing.runtimeSecretKeys = missing.runtimeSecretKeys.filter((value) => value !== key);
    assert.throws(() => renderTemplate(missing, t), /required key/);
  }
});

test('production HA, private routing and nonproduction NAT sharing remain explicit', async () => {
  const n = await loadTemplate('network');
  assert.equal(n.Resources.Nat2.Condition, 'IsProduction');
  assert.deepEqual(n.Resources.AppRoute2.Properties.NatGatewayId['Fn::If'], ['IsProduction', { Ref: 'Nat2' }, { Ref: 'Nat1' }]);
  for (const az of [1, 2]) {
    assert(!Object.keys(n.Resources).some((key) => key === `DatabaseRoute${az}`));
    assert.equal(n.Resources[`DatabaseSubnet${az}`].Properties.MapPublicIpOnLaunch, false);
  }
  const t = await loadTemplate('environment');
  assert.deepEqual(t.Resources.Service.Properties.DesiredCount['Fn::If'], ['IsProduction', 2, 1]);
  assert.deepEqual(t.Resources.Service.Properties.DeploymentConfiguration, { MinimumHealthyPercent: 100, MaximumPercent: 200, DeploymentCircuitBreaker: { Enable: true, Rollback: true } });
  assert.deepEqual(t.Resources.TaskDefinition.Properties.Cpu['Fn::If'], ['IsProduction', '1024', '512']);
  assert.deepEqual(t.Resources.Database.Properties.MultiAZ['Fn::If'], ['IsProduction', true, false]);
  assert.deepEqual(t.Resources.Database.Properties.BackupRetentionPeriod['Fn::If'], ['IsProduction', 14, 7]);
  assert.equal(t.Resources.Database.Properties.PubliclyAccessible, false);
  assert.equal(t.Resources.Database.Properties.ManageMasterUserPassword, true);
  assert.equal(t.Resources.DatabaseParameters.Properties.Parameters['rds.logical_replication'], '1');
  assert.equal(t.Resources.DatabaseParameters.Properties.Parameters.max_replication_slots, '10');
  assert.equal(t.Resources.DatabaseParameters.Properties.Parameters.max_wal_senders, '25');
  assert.equal(t.Resources.DatabaseParameters.Properties.Parameters.log_parameter_max_length_on_error, '0');
  assert.equal(t.Resources.Database.DeletionPolicy, 'Snapshot');
  assert.equal(t.Resources.Database.UpdateReplacePolicy, 'Snapshot');
  assert.equal(t.Resources.WebTargetGroup.Properties.HealthCheckPath, '/api/health/live');
});

test('CloudFront dynamic requests retain auth/cookies/query without caching and cache immutable paths only', async () => {
  const t = await loadTemplate('environment');
  const d = t.Resources.Distribution.Properties.DistributionConfig;
  assert.equal(t.Resources.NoCachePolicy.Properties.CachePolicyConfig.MaxTTL, 0);
  assert.deepEqual(d.DefaultCacheBehavior.CachePolicyId, { Ref: 'NoCachePolicy' });
  const policy = t.Resources.DynamicOriginPolicy.Properties.OriginRequestPolicyConfig;
  assert.equal(policy.CookiesConfig.CookieBehavior, 'all');
  assert.equal(policy.QueryStringsConfig.QueryStringBehavior, 'all');
  assert.deepEqual(policy.HeadersConfig, { HeaderBehavior: 'allExcept', Headers: ['host'] });
  assert.deepEqual(d.CacheBehaviors.filter((b) => b.CachePolicyId.Ref === 'ImmutableCachePolicy').map((b) => b.PathPattern), ['/_next/static/*', '/public-assets/immutable/*']);
  assert.equal(d.Origins[0].CustomOriginConfig.OriginProtocolPolicy, 'https-only');
  assert(d.CustomErrorResponses.every((e) => e.ErrorCachingMinTTL === 0));
  assert(!Object.values(t.Resources).some((r) => r.Type === 'AWS::Route53::RecordSet'));
});

test('private proof objects cannot enter OAC policy and OAuth has no client secrets', async () => {
  const t = await loadTemplate('environment');
  const statement = t.Resources.PublicAssetsPolicy.Properties.PolicyDocument.Statement.find((s) => s.Sid === 'CloudFrontReadPublicAssetsOnly');
  assert.equal(statement.Resource['Fn::Sub'], '${PublicAssetsBucket.Arn}/public-assets/*');
  assert.equal(t.Resources.PrivateProofsPolicy.Properties.PolicyDocument.Statement.length, 1);
  for (const bucket of ['PublicAssetsBucket', 'PrivateProofsBucket']) {
    assert(Object.values(t.Resources[bucket].Properties.PublicAccessBlockConfiguration).every(Boolean));
    assert.equal(t.Resources[bucket].DeletionPolicy, 'Retain');
  }
  for (const client of ['WebClient', 'MobileClient']) {
    assert.equal(t.Resources[client].Properties.GenerateSecret, false);
    assert.deepEqual(t.Resources[client].Properties.AllowedOAuthFlows, ['code']);
  }
  const task = t.Resources.TaskRole.Properties.Policies[0].PolicyDocument.Statement;
  assert(task.every((s) => !JSON.stringify(s).includes('secretsmanager')));
});

test('deploy command targets only the configured stack and default CLI never executes AWS', async () => {
  const c = config();
  const command = deploymentCommand(c, '/tmp/template.json', '/tmp/parameters.json');
  assert(command.includes('file:///tmp/parameters.json'));
  assert.equal(command[command.indexOf('--region') + 1], 'ap-northeast-2');
  const directory = await mkdtemp(join(tmpdir(), 'byus-platform-test-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const file = join(directory, 'config.json');
    await writeFile(file, JSON.stringify(c));
    for (const action of [[], ['deploy']]) {
      const result = spawnSync(process.execPath, [resolve('scripts/aws-platform-deploy.mjs'), ...action, '--config', file, '--out', directory], { encoding: 'utf8', env: { ...process.env, PATH: '/does-not-exist' } });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).executed, false);
      assert(Buffer.byteLength(await readFile(join(directory, 'environment.json'))) < 51200);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('viewer host cannot be spoofed and ALB accepts only the secret-bearing CloudFront origin', async () => {
  const t = await loadTemplate('environment');
  const r = t.Resources;
  const run = runInNewContext(`${r.ViewerHostFunction.Properties.FunctionCode}; handler;`);
  const request = { headers: { host: { value: 'dev.example.test' }, 'x-forwarded-host': { value: 'attacker.example.test' }, authorization: { value: 'test-token' } } };
  assert.equal(run({ request, viewer: { ip: '192.0.2.7' } }).headers['x-forwarded-host'].value, 'dev.example.test');
  assert.equal(request.headers.authorization.value, 'test-token');
  assert.equal(request.headers['x-byus-client-ip'].value, '192.0.2.7');
  const association = r.Distribution.Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations[0];
  assert.equal(association.EventType, 'viewer-request');
  const header = r.Distribution.Properties.DistributionConfig.Origins[0].OriginCustomHeaders[0];
  const condition = r.WebListenerRule.Properties.Conditions.find((c) => c.Field === 'http-header').HttpHeaderConfig;
  assert.equal(header.HeaderName, condition.HttpHeaderName);
  assert.deepEqual(header.HeaderValue, condition.Values[0]);
  assert.equal(header.HeaderValue['Fn::Sub'], '{{resolve:secretsmanager:${OriginVerificationSecret}:SecretString}}');
  assert.equal(r.OriginVerificationSecret.Properties.GenerateSecretString.PasswordLength, 48);
  assert.equal(r.OriginVerificationSecret.DeletionPolicy, 'Retain');
});

test('Sallylab can host all environments with environment-specific network tiers', async () => {
  for (const kind of ['network', 'environment', 'edge-security']) {
    const template = await loadTemplate(kind);
    for (const env of ['dev', 'staging', 'prod']) {
      const c = config(kind, env);
      c.parameters.ProductionAccountId = c.accountId;
      c.parameters.NonproductionAccountId = c.accountId;
      assert.doesNotThrow(() => validateConfig(c, template));
      assert.equal(template.Rules?.SeparateAccounts, undefined);
    }
  }
});

test('task identity cleanup and browser uploads stay limited to the environment', async () => {
  const t = await loadTemplate('environment');
  const policy = t.Resources.TaskRole.Properties.Policies.find(p => p.PolicyName === 'delete-own-environment-identities');
  assert.equal(policy.PolicyDocument.Statement[0].Action, 'cognito-idp:AdminDeleteUser');
  assert.deepEqual(policy.PolicyDocument.Statement[0].Resource, [{'Fn::GetAtt':['UserPool','Arn']},{'Fn::GetAtt':['EmailUserPool','Arn']}]);
  const cors = t.Resources.PrivateProofsBucket.Properties.CorsConfiguration.CorsRules[0];
  assert.deepEqual(cors.AllowedMethods, ['PUT','GET','HEAD']);
  assert.deepEqual(cors.AllowedHeaders, ['content-type','x-upsert','if-none-match']);
  assert.equal(JSON.stringify(cors.AllowedOrigins).includes('*'), false);
  assert.match(t.Resources.ViewerHostFunction.Properties.FunctionCode, /x-byus-client-ip.*event.viewer.ip/);
});


test('viewer aliases preserve the single-domain default and require canonical exact unique DNS names', async () => {
  const template=await loadTemplate('environment');
  const baseline=validateConfig(config(),template);
  assert.equal(baseline.WebDomainAliases,'');
  assert.deepEqual(webDomains(baseline),['dev.example.test']);
  assert.deepEqual(template.Resources.Distribution.Properties.DistributionConfig.Aliases,{'Fn::If':['HasWebDomainAliases',{Ref:'WebDomainAliases'},[{Ref:'WebDomainName'}]]});
  const c=config('environment','prod');
  c.parameters.WebDomainName='kyaa.io';c.parameters.WebDomainAliases='kyaa.io, www.kyaa.io,byus.kr,www.byus.kr';
  assert.equal(validateConfig(c,template).WebDomainAliases,'kyaa.io,www.kyaa.io,byus.kr,www.byus.kr');
  for(const invalid of ['www.kyaa.io','kyaa.io,kyaa.io','kyaa.io, kyaa.io','kyaa.io,','kyaa.io,,www.kyaa.io','kyaa.io,*.kyaa.io','kyaa.io,WWW.kyaa.io','kyaa.io,https://www.kyaa.io','kyaa.io,www.kyaa.io/path','kyaa.io,www.kyaa.io:443','kyaa.io,www.kyaa.io.','kyaa.io,-bad.kyaa.io','kyaa.io,bad-.kyaa.io','kyaa.io,127.0.0.1','kyaa.io,'+'a'.repeat(64)+'.test']) {
    c.parameters.WebDomainAliases=invalid;assert.throws(()=>validateConfig(c,template),undefined,invalid);
  }
  c.parameters.WebDomainAliases='kyaa.io,'+c.parameters.OriginDomainName;
  assert.throws(()=>validateConfig(c,template),/must be different/);
});

test('viewer forwarding uses each actual alias and certificate coverage includes every alias', async () => {
  const aliases=['kyaa.io','www.kyaa.io','byus.kr','www.byus.kr'];
  const template=await loadTemplate('environment');const run=runInNewContext(`${template.Resources.ViewerHostFunction.Properties.FunctionCode}; handler;`);
  for(const alias of aliases)assert.equal(run({request:{headers:{host:{value:alias},'x-forwarded-host':{value:'untrusted.example.test'}}},viewer:{ip:'192.0.2.7'}}).headers['x-forwarded-host'].value,alias);
  assert.doesNotThrow(()=>verifyCertificateCoverage(aliases,{Status:'ISSUED',DomainName:'kyaa.io',SubjectAlternativeNames:aliases}));
  assert.doesNotThrow(()=>verifyCertificateCoverage(aliases,{Status:'ISSUED',DomainName:'kyaa.io',SubjectAlternativeNames:['*.kyaa.io','byus.kr','*.byus.kr']}));
  assert.throws(()=>verifyCertificateCoverage(aliases,{Status:'ISSUED',DomainName:'kyaa.io',SubjectAlternativeNames:['www.kyaa.io','byus.kr']}),/www.byus.kr/);
  assert.throws(()=>verifyCertificateCoverage(['kyaa.io'],{Status:'ISSUED',DomainName:'*.kyaa.io'}),/kyaa.io/);
  assert.throws(()=>verifyCertificateCoverage(['deep.www.kyaa.io'],{Status:'ISSUED',DomainName:'*.kyaa.io'}),/deep.www.kyaa.io/);
  assert.throws(()=>verifyCertificateCoverage(aliases,{Status:'PENDING_VALIDATION',SubjectAlternativeNames:aliases}),/ISSUED/);
});

test('legacy redirect setting accepts only existing enabled states; omission disables', async () => {
  const template=await loadTemplate('environment'),c=config();
  assert.doesNotThrow(()=>validateConfig(c,template));
  for(const status of ['307','308']){c.runtimeEnvironment.LEGACY_DOMAIN_REDIRECT_STATUS=status;assert.doesNotThrow(()=>validateConfig(c,template));}
  for(const status of ['disabled','false','301','200']){c.runtimeEnvironment.LEGACY_DOMAIN_REDIRECT_STATUS=status;assert.throws(()=>validateConfig(c,template),/307 or 308/);}
});

test('AWS validation reads the edge certificate in us-east-1 and rejects missing alias coverage', async () => {
  const directory=await mkdtemp(join(tmpdir(),'byus-alias-validation-'));
  try {
    const c=config('environment','prod');c.parameters.WebDomainName='kyaa.io';c.parameters.WebDomainAliases='kyaa.io,www.kyaa.io,byus.kr,www.byus.kr';
    const file=join(directory,'config.json');await writeFile(file,JSON.stringify(c));
    const fixture=join(directory,'aws');
    await writeFile(fixture,`#!${process.execPath}
const args=process.argv.slice(2);const service=args.find(x=>['sts','cloudformation','acm','secretsmanager','ecr'].includes(x));
let result={};
if(service==='sts')result={Account:'${prodAccount}'};
if(service==='acm'){
 if(args[args.indexOf('--region')+1]!=='us-east-1')process.exit(9);
 result={Certificate:{Status:'ISSUED',DomainName:'kyaa.io',SubjectAlternativeNames:JSON.parse(process.env.FIXTURE_CERT_NAMES)}};
}
if(service==='cloudformation'&&args.includes('describe-stacks'))result={Stacks:[{Outputs:[{OutputKey:'NetworkTier',OutputValue:'prod'}],Parameters:[{ParameterKey:'ProductionAccountId',ParameterValue:'${prodAccount}'},{ParameterKey:'NonproductionAccountId',ParameterValue:'${nonprodAccount}'}]}]};
process.stdout.write(JSON.stringify(result));
`);await chmod(fixture,0o700);
    const run=(names)=>spawnSync(process.execPath,[resolve('scripts/aws-platform-deploy.mjs'),'validate','--aws','--config',file,'--out',directory],{encoding:'utf8',env:{...process.env,PATH:directory,FIXTURE_CERT_NAMES:JSON.stringify(names)}});
    const planned=spawnSync(process.execPath,[resolve('scripts/aws-platform-deploy.mjs'),'plan','--config',file,'--out',directory],{encoding:'utf8',env:{...process.env,PATH:'/does-not-exist'}});
    assert.equal(planned.status,0,planned.stderr);assert.equal(JSON.parse(planned.stdout).executed,false);
    const missing=run(['kyaa.io','www.kyaa.io','byus.kr']);assert.notEqual(missing.status,0);assert.match(missing.stderr,/www.byus.kr/);
    const covered=run(['kyaa.io','www.kyaa.io','byus.kr','www.byus.kr']);assert.equal(covered.status,0,covered.stderr);assert.equal(JSON.parse(covered.stdout).executed,false);
    const parameters=JSON.parse(await readFile(join(directory,'parameters.json'),'utf8'));assert.equal(parameters.find(p=>p.ParameterKey==='WebDomainAliases').ParameterValue,c.parameters.WebDomainAliases);
  } finally {await rm(directory,{recursive:true,force:true});}
});


test('CI certificate validation has read-only access to its exact edge certificate', async () => {
  const template=JSON.parse(await readFile(resolve('infrastructure/aws/platform/ci-role.json'),'utf8'));
  const statement=template.Resources.ReleaseRole.Properties.Policies[0].PolicyDocument.Statement.find(s=>s.Action==='acm:DescribeCertificate');
  assert.deepEqual(statement,{Effect:'Allow',Action:'acm:DescribeCertificate',Resource:{Ref:'CloudFrontCertificateArn'}});
  assert.match(template.Parameters.CloudFrontCertificateArn.AllowedPattern,/us-east-1/);
});


test('CI OIDC trust uses the observed immutable repository identity and exact environment', async () => {
  const template=JSON.parse(await readFile(resolve('infrastructure/aws/platform/ci-role.json'),'utf8'));
  const trust=template.Resources.ReleaseRole.Properties.AssumeRolePolicyDocument.Statement;
  assert.equal(trust.length,1);
  assert.deepEqual(trust[0],{
    Effect:'Allow',Principal:{Federated:{Ref:'OidcProviderArn'}},Action:'sts:AssumeRoleWithWebIdentity',
    Condition:{StringEquals:{
      'token.actions.githubusercontent.com:aud':'sts.amazonaws.com',
      'token.actions.githubusercontent.com:sub':{'Fn::Sub':'repo:kyaa-io@307444286/kyaa@1307387500:environment:${Environment}'},
    }},
  });
  assert.deepEqual(template.Parameters.Environment.AllowedValues,['dev','staging','prod']);
  for(const environment of template.Parameters.Environment.AllowedValues){
    assert.equal(trust[0].Condition.StringEquals['token.actions.githubusercontent.com:sub']['Fn::Sub'].replace('${Environment}',environment),`repo:kyaa-io@307444286/kyaa@1307387500:environment:${environment}`);
  }
});
