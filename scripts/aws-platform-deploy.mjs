#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = join(ROOT, 'infrastructure/aws/platform');
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
const KINDS = ['network', 'edge-security', 'environment'];
const REQUIRED_SECRET_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PRIVY_APP_SECRET'];
const RESERVED_ENV = ['PORT', 'HOSTNAME', 'NODE_ENV', 'APP_ENV', 'APP_URL', 'HOSTING_PROVIDER'];
const FORBIDDEN_ENV = /^(AWS_|NEXT_PUBLIC_|NODE_|LD_|PATH$|HOME$|SHELL$|SUPABASE_ANON_KEY$)/;
const PUBLIC_RUNTIME_ENV = new Set([
  'PRIVY_APP_ID', 'PRIVY_APP_ENVIRONMENT', 'BYUS_DATA_ENVIRONMENT',
  'PRIVY_APPLE_LOGIN_ENABLED', 'PRIVY_TEST_ACCOUNT_LOGIN_ENABLED', 'WEB_PUSH_VAPID_PUBLIC_KEY',
  'GIWA_CHAIN_ID', 'GIWA_RPC_URL', 'GIWA_EXPLORER_URL', 'BYUS_PASSPORT_CONTRACT_ADDRESS',
  'BYUS_STAMP_CONTRACT_ADDRESS', 'BYUS_RELAYER_ADDRESS', 'KAKAO_OAUTH_MODE', 'KAKAO_CLIENT_ID',
  'KAKAO_REDIRECT_URI', 'KAKAO_ALIMTALK_ENROLLMENT_ENABLED', 'PHONE_SMS_ENROLLMENT_MODE',
  'PHONE_SMS_SENDER', 'CHZZK_LIVE_ENABLED', 'POSTGREST_URL',
  'RELEASE_SHA', 'CRON_OWNER', 'MEDIA_WORKER_FUNCTION_ARN', 'LEGACY_EMAIL_AUTH_ENABLED', 'AUTH_PROVIDER', 'EMAIL_AUTH_PROVIDER', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID',
  'COGNITO_EMAIL_USER_POOL_ID', 'COGNITO_EMAIL_CLIENT_ID', 'COGNITO_DOMAIN', 'COGNITO_REDIRECT_URI', 'COGNITO_LOGOUT_URI',
  'COGNITO_ENROLLMENT_ENABLED', 'COGNITO_NATIVE_REDIRECT_URI', 'LEGACY_DOMAIN_REDIRECT_STATUS',
  'AWS_STORAGE_ENABLED', 'AWS_REGION', 'S3_PUBLIC_BUCKET', 'S3_PRIVATE_BUCKET', 'ASSET_PUBLIC_BASE_URL',
  'WEBHOOK_BUFFER_ENABLED', 'WEBHOOK_REPLAY_ENABLED', 'WEBHOOK_BUFFER_QUEUE_URL',
  'WEBHOOK_BUFFER_BUCKET', 'WEBHOOK_BUFFER_KMS_KEY_ID', 'WEBHOOK_BUFFER_INSTAGRAM_SECRET_SHA256',
]);

function requiredRuntimeSecrets(config) {
  const env = config.runtimeEnvironment ?? {};
  const fullAws = config.parameters.EnablePostgrest === 'true' && env.AWS_STORAGE_ENABLED === 'true'
    && env.EMAIL_AUTH_PROVIDER === 'cognito' && env.LEGACY_EMAIL_AUTH_ENABLED === 'false';
  const keys = fullAws ? ['PRIVY_APP_SECRET', 'REQUEST_HASH_SECRET'] : [...REQUIRED_SECRET_KEYS];
  if (env.AUTH_PROVIDER === 'cognito' || env.EMAIL_AUTH_PROVIDER === 'cognito') keys.push('AUTH_COOKIE_SECRET');
  return keys;
}
const KEY = /^[A-Z][A-Z0-9_]{0,127}$/;
const ACCOUNT = /^\d{12}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ARN = /^arn:aws:([^:]+):([^:]*):(\d{12}):(.+)$/;

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}
function onlyKeys(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`Unknown ${label} key: ${key}`);
}
function accountArn(value, account, region, service, label) {
  const match = ARN.exec(value ?? '');
  if (!match || match[1] !== service || match[2] !== region || match[3] !== account) fail(`${label} must be a ${service} ARN in ${region} / account ${account}`);
}

export async function loadTemplate(kind) {
  if (!KINDS.includes(kind)) fail(`Kind must be ${KINDS.join(', ')}`);
  return JSON.parse(await readFile(join(TEMPLATE_DIR, `${kind}.json`), 'utf8'));
}

/** Configuration files contain identifiers and secret key names, never credential values. */
export function validateConfig(config, template) {
  object(config, 'config');
  onlyKeys(config, ['kind', 'environment', 'region', 'accountId', 'profile', 'stackName', 'parameters', 'runtimeEnvironment', 'runtimeSecretKeys', 'cloudFormationRoleArn'], 'config');
  if (!KINDS.includes(config.kind)) fail('Explicit kind is required');
  if (!ENVIRONMENTS.includes(config.environment)) fail('Explicit environment dev|staging|prod is required');
  const expectedRegion = config.kind === 'edge-security' ? 'us-east-1' : 'ap-northeast-2';
  if (config.region !== expectedRegion) fail(`${config.kind} must deploy in ${expectedRegion}`);
  if (!ACCOUNT.test(config.accountId ?? '')) fail('Explicit 12 digit accountId is required');
  if (config.cloudFormationRoleArn) {
    accountArn(config.cloudFormationRoleArn, config.accountId, '', 'iam', 'cloudFormationRoleArn');
    if (!config.cloudFormationRoleArn.split(':')[5].startsWith('role/')) fail('cloudFormationRoleArn must identify a role');
  }
  if (typeof config.profile !== 'string' || !/^[A-Za-z0-9_.@-]+$/.test(config.profile)) fail('Explicit AWS profile is required');
  if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(config.stackName ?? '')) fail('Valid explicit stackName is required');
  object(config.parameters, 'parameters');
  onlyKeys(config.parameters, Object.keys(template.Parameters), 'parameter');
  const values = {};
  for (const [name, spec] of Object.entries(template.Parameters)) {
    const value = config.parameters[name] ?? spec.Default;
    if (value === undefined || value === null) fail(`Missing parameter ${name}`);
    if (!['string', 'number'].includes(typeof value)) fail(`Parameter ${name} must be a string or number (lists are comma-separated strings)`);
    const text = String(value);
    if (spec.AllowedValues && !spec.AllowedValues.includes(value)) fail(`Invalid ${name}`);
    const list = spec.Type === 'CommaDelimitedList' ? text.split(',').map(item => item.trim()) : null;
    if (spec.AllowedPattern && (list ?? [text]).some(item => !new RegExp(`^(?:${spec.AllowedPattern})$`).test(item))) fail(`Invalid ${name} format`);
    if (spec.Type === 'Number' && (!Number.isFinite(Number(value)) || Number(value) < spec.MinValue || Number(value) > spec.MaxValue)) fail(`Invalid ${name} number`);
    if (list?.some(item => !item) && !(name === 'WebDomainAliases' && text === '')) fail(`Empty item in ${name}`);
    values[name] = list ? list.join(',') : text;
  }
  if (!ACCOUNT.test(values.ProductionAccountId) || !ACCOUNT.test(values.NonproductionAccountId)) fail('Production and nonproduction account IDs must be explicit 12 digit values');
  const expectedAccount = config.environment === 'prod' ? values.ProductionAccountId : values.NonproductionAccountId;
  if (config.accountId !== expectedAccount) fail('Selected environment does not match its designated AWS account');
  if (config.kind === 'network') {
    if (values.NetworkTier !== (config.environment === 'prod' ? 'prod' : 'nonprod')) fail('Network tier must match the environment account');
    accountArn(values.AlbCertificateArn, config.accountId, config.region, 'acm', 'AlbCertificateArn');
  } else if (values.Environment !== config.environment) fail('Environment parameter must match environment');
  if (config.kind === 'environment') {
    if (config.stackName.length > 48) fail('Environment stackName must be at most 48 characters for CloudFront resource names');
    accountArn(values.RuntimeConfigSecretArn, config.accountId, config.region, 'secretsmanager', 'RuntimeConfigSecretArn');
    accountArn(values.CloudFrontCertificateArn, config.accountId, 'us-east-1', 'acm', 'CloudFrontCertificateArn');
    accountArn(values.WebAclArn, config.accountId, 'us-east-1', 'wafv2', 'WebAclArn');
    if (values.SecretKmsKeyArn) accountArn(values.SecretKmsKeyArn, config.accountId, config.region, 'kms', 'SecretKmsKeyArn');
    for (const name of ['GoogleProviderSecretArn', 'AppleProviderSecretArn']) if (values[name]) accountArn(values[name], config.accountId, config.region, 'secretsmanager', name);
    if (values.UserMigrationArn) {
      accountArn(values.UserMigrationArn, config.accountId, config.region, 'lambda', 'UserMigrationArn');
      if (values.UserMigrationArn.split(':').slice(5).join(':') !== `function:byus-email-migration-${config.environment}`) fail('UserMigrationArn must match the email migration function for this environment');
    }
    for (const image of ['WebImageUri', ...(values.EnablePostgrest === 'true' ? ['PostgrestImageUri'] : [])]) {
      if (!values[image].startsWith(`${config.accountId}.dkr.ecr.${config.region}.amazonaws.com/`) || !/@sha256:[a-f0-9]{64}$/.test(values[image])) fail(`${image} must be an immutable ECR digest in the selected account and region`);
    }
    if (values.EnablePostgrest === 'true') {
      accountArn(values.PostgrestSecretArn, config.accountId, config.region, 'secretsmanager', 'PostgrestSecretArn');
      if (values.PostgrestSecretArn === values.RuntimeConfigSecretArn) fail('PostgREST requires a separate database secret');
    }
    const domains = webDomains(values);
    if (!domains.includes(values.WebDomainName)) fail('WebDomainAliases must include canonical WebDomainName');
    if (domains.some(domain => !DOMAIN.test(domain))) fail('Web domains require exact lowercase DNS names without schemes, wildcards or paths');
    if (new Set(domains).size !== domains.length) fail('Duplicate WebDomainAliases');
    if (new Set([values.OriginDomainName, values.InternalApiDomainName]).size !== 2 || domains.some(domain => [values.OriginDomainName, values.InternalApiDomainName].includes(domain))) fail('Web, origin and internal API domains must be different');
    for (const name of ['WebCallbackUrls', 'WebLogoutUrls']) for (const entry of values[name].split(',')) {
      const url = new URL(entry.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.hostname.includes('*')) fail(`${name} requires exact HTTPS URLs`);
    }
    for (const name of ['MobileCallbackUrls', 'MobileLogoutUrls']) for (const entry of values[name].split(',')) {
      const url = new URL(entry.trim());
      if (!['https:', 'http:'].includes(url.protocol) && /^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) continue;
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.hostname.includes('*')) fail(`${name} requires HTTPS or a registered app scheme`);
    }
    object(config.runtimeEnvironment ?? {}, 'runtimeEnvironment');
    const required = requiredRuntimeSecrets(config);
    const secrets = config.runtimeSecretKeys ?? required;
    if (!Array.isArray(secrets) || new Set(secrets).size !== secrets.length || !required.every((key) => secrets.includes(key))) fail('runtimeSecretKeys must include each required key exactly once');
    for (const key of secrets) if (typeof key !== 'string' || !KEY.test(key) || RESERVED_ENV.includes(key) || FORBIDDEN_ENV.test(key)) fail('Invalid runtime secret key name');
    for (const [key, value] of Object.entries(config.runtimeEnvironment ?? {})) {
      const permittedAwsSetting = ['AWS_REGION', 'AWS_STORAGE_ENABLED'].includes(key);
      if (!PUBLIC_RUNTIME_ENV.has(key) || !KEY.test(key) || RESERVED_ENV.includes(key) || (FORBIDDEN_ENV.test(key) && !permittedAwsSetting) || secrets.includes(key)) fail(`Use a Secrets Manager JSON key for ${key}; reserved/credential environment keys cannot be plain values`);
      if (key === 'LEGACY_DOMAIN_REDIRECT_STATUS' && !['307', '308'].includes(value)) fail('LEGACY_DOMAIN_REDIRECT_STATUS must be 307 or 308; omit it to disable');
      if (key === 'AWS_REGION' && value !== config.region) fail('AWS_REGION must match the deployment region');
      if (key === 'EMAIL_AUTH_PROVIDER' && !['legacy', 'cognito'].includes(value)) fail('EMAIL_AUTH_PROVIDER must be legacy or cognito');
      if (key === 'RELEASE_SHA' && !/^[a-f0-9]{40}$/.test(value)) fail('RELEASE_SHA must be a full Git commit SHA');
      if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) fail(`Invalid runtime environment value: ${key}`);
    }
    if (values.EnablePostgrest === 'true' && !secrets.includes('POSTGREST_SERVICE_TOKEN')) fail('Enabled PostgREST requires POSTGREST_SERVICE_TOKEN runtime secret key');
    if (values.EnablePostgrest === 'true' && config.runtimeEnvironment?.POSTGREST_URL !== 'http://127.0.0.1:3001') fail('Web PostgREST URL must use its localhost sidecar');
    for (const key of ['PRIVY_APP_ID', 'PRIVY_APP_ENVIRONMENT', 'BYUS_DATA_ENVIRONMENT']) if (!config.runtimeEnvironment?.[key]) fail(`Missing runtimeEnvironment.${key}`);
    const prod = config.environment === 'prod';
    if (config.runtimeEnvironment.BYUS_DATA_ENVIRONMENT !== (prod ? 'production' : 'development')) fail('BYUS_DATA_ENVIRONMENT must match the environment');
    if (config.runtimeEnvironment.PRIVY_APP_ENVIRONMENT !== (prod ? 'production' : 'development')) fail('PRIVY_APP_ENVIRONMENT must match the environment');
    if (prod && config.runtimeEnvironment.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED === 'true') fail('Production forbids test account login');
  } else if (config.runtimeEnvironment || config.runtimeSecretKeys) fail('Runtime configuration only applies to environment stacks');
  return values;
}

export function renderTemplate(config, source) {
  validateConfig(config, source);
  const template = structuredClone(source);
  if (config.kind !== 'environment') return template;
  const web = template.Resources.TaskDefinition.Properties.ContainerDefinitions[0];
  for (const [Name, Value] of Object.entries(config.runtimeEnvironment ?? {})) web.Environment.push({ Name, Value });
  web.Secrets = (config.runtimeSecretKeys ?? requiredRuntimeSecrets(config)).map((Name) => ({ Name, ValueFrom: { 'Fn::Sub': `\${RuntimeConfigSecretArn}:${Name}::` } }));
  return template;
}

export function deploymentCommand(config, templatePath, parametersPath) {
  return ['cloudformation', 'deploy', ...(config.profile === 'oidc' ? [] : ['--profile', config.profile]), '--region', config.region, '--stack-name', config.stackName,
    ...(config.cloudFormationRoleArn ? ['--role-arn', config.cloudFormationRoleArn] : []),
    '--template-file', templatePath, '--parameter-overrides', `file://${parametersPath}`, '--capabilities', 'CAPABILITY_IAM',
    '--no-fail-on-empty-changeset', '--tags', `Project=ByUs`, `Environment=${config.environment}`, `PlatformKind=${config.kind}`];
}

export function awsCredentialArguments(profile, environment = process.env) {
  if (profile !== 'oidc') return ['--profile', profile];
  if (environment.GITHUB_ACTIONS !== 'true' || !environment.AWS_SESSION_TOKEN || !environment.AWS_ACCESS_KEY_ID) {
    fail('oidc credentials require a GitHub Actions assumed-role session');
  }
  return [];
}

function aws(config, args, options = {}) {
  const result = spawnSync('aws', ['--no-cli-pager', ...awsCredentialArguments(config.profile), '--region', config.region, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`AWS read/deploy failed (${args.slice(0, 2).join(' ')}): ${result.stderr.trim()}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

export function verifyIdentity(config, identity) {
  if (identity.Account !== config.accountId) fail(`AWS caller account ${identity.Account} differs from configured account ${config.accountId}`);
}

export function webDomains(parameters) {
  return parameters.WebDomainAliases ? parameters.WebDomainAliases.split(',').map(domain => domain.trim()) : [parameters.WebDomainName];
}

export function verifyCertificateCoverage(domains, certificate) {
  if (certificate?.Status !== 'ISSUED') fail('CloudFront certificate must be ISSUED');
  const names = [...new Set([certificate.DomainName, ...(certificate.SubjectAlternativeNames ?? [])].filter(Boolean).map(name => name.toLowerCase()))];
  const missing = domains.filter(domain => !names.some(name => name === domain || (name.startsWith('*.') && domain.endsWith(name.slice(1)) && domain.split('.').length === name.split('.').length)));
  if (missing.length) fail(`CloudFront certificate does not cover aliases: ${missing.join(', ')}`);
}

async function validateAws(config, parameters, templatePath) {
  verifyIdentity(config, aws(config, ['sts', 'get-caller-identity', '--output', 'json']));
  aws(config, ['cloudformation', 'validate-template', '--template-body', `file://${templatePath}`, '--output', 'json']);
  if (config.kind === 'environment') {
    const certificate = aws({ ...config, region: 'us-east-1' }, ['acm', 'describe-certificate', '--certificate-arn', parameters.CloudFrontCertificateArn, '--output', 'json']).Certificate;
    verifyCertificateCoverage(webDomains(parameters), certificate);
    const network = aws(config, ['cloudformation', 'describe-stacks', '--stack-name', parameters.NetworkStackName, '--output', 'json']).Stacks?.[0];
    const outputs = Object.fromEntries((network?.Outputs ?? []).map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]));
    if (outputs.NetworkTier !== (config.environment === 'prod' ? 'prod' : 'nonprod')) fail('Existing network stack has the wrong tier');
    const networkParameters = Object.fromEntries((network?.Parameters ?? []).map(({ ParameterKey, ParameterValue }) => [ParameterKey, ParameterValue]));
    for (const key of ['ProductionAccountId', 'NonproductionAccountId']) if (networkParameters[key] !== parameters[key]) fail(`Existing network ${key} differs`);
    for (const key of ['RuntimeConfigSecretArn', ...(parameters.EnablePostgrest === 'true' ? ['PostgrestSecretArn'] : [])]) {
      const secret = aws(config, ['secretsmanager', 'describe-secret', '--secret-id', parameters[key], '--output', 'json']);
      if (secret.DeletedDate) fail(`${key} is scheduled for deletion`);
    }
    for (const key of ['WebImageUri', ...(parameters.EnablePostgrest === 'true' ? ['PostgrestImageUri'] : [])]) {
      const [repository, digest] = parameters[key].split('.amazonaws.com/')[1].split('@');
      aws(config, ['ecr', 'describe-images', '--repository-name', repository, '--image-ids', `imageDigest=${digest}`, '--output', 'json']);
    }
  }
}

async function inventory(config) {
  verifyIdentity(config, aws(config, ['sts', 'get-caller-identity', '--output', 'json']));
  // Explicit queries exclude secret values, user attributes, container env and object keys.
  const reads = [
    ['vpcs', ['ec2', 'describe-vpcs', '--query', 'Vpcs[].{Id:VpcId,Cidr:CidrBlock,Default:IsDefault}']],
    ['subnets', ['ec2', 'describe-subnets', '--query', 'Subnets[].{Id:SubnetId,Vpc:VpcId,Az:AvailabilityZone,Cidr:CidrBlock}']],
    ['loadBalancers', ['elbv2', 'describe-load-balancers', '--query', 'LoadBalancers[].{Arn:LoadBalancerArn,Dns:DNSName,Scheme:Scheme,Vpc:VpcId}']],
    ['repositories', ['ecr', 'describe-repositories', '--query', 'repositories[].{Name:repositoryName,Uri:repositoryUri}']],
    ['databases', ['rds', 'describe-db-instances', '--query', 'DBInstances[].{Id:DBInstanceIdentifier,Engine:Engine,Version:EngineVersion,MultiAZ:MultiAZ,Public:PubliclyAccessible}']],
    ['certificates', ['acm', 'list-certificates', '--query', 'CertificateSummaryList[].{Arn:CertificateArn,Domain:DomainName,Status:Status}']],
    ['cloudFrontPrefixList', ['ec2', 'describe-managed-prefix-lists', '--filters', 'Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing', '--query', 'PrefixLists[].{Id:PrefixListId,Name:PrefixListName}']],
    ['hostedZones', ['route53', 'list-hosted-zones', '--query', 'HostedZones[].{Id:Id,Name:Name,Private:Config.PrivateZone}']],
  ];
  const result = { accountId: config.accountId, region: config.region, environment: config.environment };
  for (const [key, args] of reads) {
    if (config.region === 'us-east-1' && ['vpcs', 'subnets', 'loadBalancers', 'repositories', 'databases', 'cloudFrontPrefixList'].includes(key)) continue;
    result[key] = aws(config, [...args, '--output', 'json']);
  }
  console.log(JSON.stringify(result, null, 2));
}

export async function main(argv = process.argv.slice(2)) {
  const action = argv[0]?.startsWith('--') || !argv[0] ? 'plan' : argv.shift();
  if (!['plan', 'validate', 'deploy', 'inventory'].includes(action)) fail('Use plan (default), validate, deploy --execute, or inventory');
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!['--config', '--out', '--cfn-lint', '--aws', '--execute'].includes(flag) || Object.hasOwn(flags, flag)) fail(`Unknown/duplicate flag ${flag}`);
    flags[flag] = ['--aws', '--execute'].includes(flag) ? true : argv[++i];
    if (flags[flag] === undefined || String(flags[flag]).startsWith('--')) fail(`Missing ${flag} value`);
  }
  if (!flags['--config']) fail('--config is required; environment/account/region are never inferred');
  if (flags['--execute'] && action !== 'deploy') fail('--execute is only valid with deploy');
  const config = JSON.parse(await readFile(resolve(flags['--config']), 'utf8'));
  const source = await loadTemplate(config.kind);
  const values = validateConfig(config, source);
  if (action === 'inventory') return inventory(config);
  const template = renderTemplate(config, source);
  const out = resolve(flags['--out'] ?? join(ROOT, 'work/aws-platform', config.stackName));
  await mkdir(out, { recursive: true });
  const templatePath = join(out, `${config.kind}.json`);
  const parametersPath = join(out, 'parameters.json');
  const templateBody = `${JSON.stringify(template)}\n`;
  if (Buffer.byteLength(templateBody) > 51200) fail('Rendered template exceeds the CloudFormation inline limit');
  await writeFile(templatePath, templateBody, { mode: 0o600 });
  await writeFile(parametersPath, `${JSON.stringify(Object.entries(values).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })), null, 2)}\n`, { mode: 0o600 });
  if (flags['--cfn-lint']) {
    const lint = spawnSync(flags['--cfn-lint'], ['--region', config.region, '--template', templatePath], { encoding: 'utf8' });
    if (lint.error) throw lint.error;
    if (lint.status !== 0) fail(`cfn-lint failed:\n${lint.stdout}${lint.stderr}`);
  }
  if (flags['--aws'] || (action === 'deploy' && flags['--execute'])) await validateAws(config, values, templatePath);
  const command = deploymentCommand(config, templatePath, parametersPath);
  if (action === 'deploy' && flags['--execute']) {
    const result = spawnSync('aws', ['--no-cli-pager', ...command], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`CloudFormation deployment failed (${result.status})`);
    console.log(JSON.stringify({ deployed: true, accountId: config.accountId, region: config.region, stackName: config.stackName }));
  } else console.log(JSON.stringify({ executed: false, action, accountId: config.accountId, region: config.region, environment: config.environment, templatePath, parametersPath, deployCommand: ['aws', ...command], next: 'deploy --execute validates AWS identity and existing references before changing resources' }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
