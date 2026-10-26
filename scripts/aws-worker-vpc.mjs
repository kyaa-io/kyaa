import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNT = '996702758024';
const REGION = 'ap-northeast-2';
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
export function stackVpc(environment, identity, stack, privateBucket) {
  requireValue(['dev', 'staging', 'prod'].includes(environment), 'Invalid worker environment');
  requireValue(identity.Account === ACCOUNT, 'AWS account mismatch');
  requireValue(new RegExp(`^arn:aws:cloudformation:${REGION}:${ACCOUNT}:stack/byus-${environment}-platform/[a-f0-9-]{36}$`).test(stack?.StackId ?? ''), 'Platform stack account/environment mismatch');
  requireValue(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE', 'IMPORT_COMPLETE'].includes(stack.StackStatus), 'Platform stack must be stable');
  requireValue(stack.Parameters?.find(p => p.ParameterKey === 'Environment')?.ParameterValue === environment, 'Platform parameter environment mismatch');
  const output = Object.fromEntries((stack.Outputs ?? []).map(({ OutputKey, OutputValue }) => [OutputKey, OutputValue]));
  const { VpcId, AppSubnet1, AppSubnet2, TaskSecurityGroupId } = output;
  requireValue(/^vpc-[a-f0-9]+$/.test(VpcId ?? '') && /^sg-[a-f0-9]+$/.test(TaskSecurityGroupId ?? '') && [AppSubnet1, AppSubnet2].every(s => /^subnet-[a-f0-9]+$/.test(s ?? '')) && AppSubnet1 !== AppSubnet2, 'Missing/invalid platform VPC outputs');
  if (privateBucket !== undefined) requireValue(privateBucket === output.PrivateProofsBucketName, 'Private bucket must match the selected platform environment');
  return { VpcId, SubnetIds: [AppSubnet1, AppSubnet2], SecurityGroupIds: [TaskSecurityGroupId] };
}
export function validateVpc(environment, identity, stack, subnets, groups, privateBucket) {
  const vpc = stackVpc(environment, identity, stack, privateBucket);
  const { VpcId, SubnetIds: [AppSubnet1, AppSubnet2], SecurityGroupIds: [TaskSecurityGroupId] } = vpc;
  requireValue(subnets.length === 2 && new Set(subnets.map(s => s.SubnetId)).size === 2 && subnets.every(s => [AppSubnet1, AppSubnet2].includes(s.SubnetId) && s.VpcId === VpcId && s.OwnerId === ACCOUNT && s.State === 'available' && s.MapPublicIpOnLaunch === false), 'App subnets must belong to the selected account/VPC and remain private');
  requireValue(groups.length === 1 && groups[0].GroupId === TaskSecurityGroupId && groups[0].VpcId === VpcId && groups[0].OwnerId === ACCOUNT, 'Task security group account/VPC mismatch');
  return vpc;
}

export function eniPolicy(environment, component, vpc) {
  requireValue(['dev', 'staging', 'prod'].includes(environment) && ['mint', 'notification', 'creator-registration'].includes(component), 'Invalid worker target');
  const functions = component === 'notification' ? [`byus-notification-worker-${environment}`, `byus-benefit-maintenance-${environment}`] : [`byus-${component}-worker-${environment}`];
  const arns = functions.map(name => `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`);
  const networkInterfaces = `arn:aws:ec2:${REGION}:${ACCOUNT}:network-interface/*`;
  const subnetArns = vpc.SubnetIds.map(id => `arn:aws:ec2:${REGION}:${ACCOUNT}:subnet/${id}`);
  const actions = ['ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DescribeSubnets', 'ec2:DeleteNetworkInterface', 'ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses'];
  const region = { StringEquals: { 'aws:RequestedRegion': REGION } };
  return { Version: '2012-10-17', Statement: [
    { Effect: 'Allow', Action: ['ec2:CreateNetworkInterface'], Resource: [networkInterfaces, ...vpc.SecurityGroupIds.map(id => `arn:aws:ec2:${REGION}:${ACCOUNT}:security-group/${id}`), ...subnetArns], Condition: region },
    // Lambda's VPC preflight omits ENI resource/context; enforce VPC/subnet keys when supplied.
    { Effect: 'Allow', Action: ['ec2:DeleteNetworkInterface', 'ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses'], Resource: '*', Condition: { ...region, ArnEqualsIfExists: { 'ec2:Vpc': `arn:aws:ec2:${REGION}:${ACCOUNT}:vpc/${vpc.VpcId}`, 'ec2:Subnet': subnetArns } } },
    { Effect: 'Allow', Action: ['ec2:DescribeNetworkInterfaces', 'ec2:DescribeSubnets'], Resource: '*', Condition: region },
    // Lambda service ENI management must remain possible; function SDK network calls are denied.
    { Effect: 'Deny', Action: actions, Resource: '*', Condition: { ArnEquals: { 'lambda:SourceFunctionArn': arns } } },
  ] };
}
export async function prepare({ environment, component, profile, out, privateBucket }, runAws = args => JSON.parse(execFileSync('aws', ['--profile', profile, '--region', REGION, '--no-cli-pager', ...args, '--output', 'json'], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }))) {
  requireValue(['dev', 'staging', 'prod'].includes(environment) && ['mint', 'notification', 'creator-registration'].includes(component) && /^[A-Za-z0-9_.@-]+$/.test(profile ?? '') && out, 'Explicit worker environment/component/profile/output required');
  const identity = runAws(['sts', 'get-caller-identity']);
  requireValue(identity.Account === ACCOUNT, 'AWS account mismatch');
  const stack = runAws(['cloudformation', 'describe-stacks', '--stack-name', `byus-${environment}-platform`, '--query', 'Stacks[0].{StackId:StackId,StackStatus:StackStatus,Parameters:Parameters[?ParameterKey==`Environment`],Outputs:Outputs[?contains(`["VpcId","AppSubnet1","AppSubnet2","TaskSecurityGroupId","PrivateProofsBucketName"]`,OutputKey)]}']);
  // Validate the trusted stack before using any output as another AWS API argument.
  const preliminary = stackVpc(environment, identity, stack, privateBucket);
  const subnets = runAws(['ec2', 'describe-subnets', '--subnet-ids', ...preliminary.SubnetIds]).Subnets;
  const groups = runAws(['ec2', 'describe-security-groups', '--group-ids', ...preliminary.SecurityGroupIds]).SecurityGroups;
  const vpc = validateVpc(environment, identity, stack, subnets ?? [], groups ?? [], privateBucket);
  const roleName = `byus-${component}-worker-${environment}-lambda`;
  let replaceBroadVpcPolicy = false;
  try {
    const role = runAws(['iam', 'get-role', '--role-name', roleName]).Role;
    requireValue(role?.Arn === `arn:aws:iam::${ACCOUNT}:role/${roleName}`, 'Worker role account/environment mismatch');
    replaceBroadVpcPolicy = (runAws(['iam', 'list-attached-role-policies', '--role-name', roleName]).AttachedPolicies ?? []).some(p => p.PolicyArn === 'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole');
  } catch (error) {
    if (!/\(NoSuchEntity\)/.test(String(error.stderr ?? ''))) throw error;
  }
  await mkdir(resolve(out), { recursive: true });
  await writeFile(join(out, 'vpc-config.json'), `${JSON.stringify({ SubnetIds: vpc.SubnetIds, SecurityGroupIds: vpc.SecurityGroupIds })}\n`, { mode: 0o600 });
  await writeFile(join(out, 'vpc-eni-policy.json'), `${JSON.stringify(eniPolicy(environment, component, vpc))}\n`, { mode: 0o600 });
  const evidence = { replaceBroadVpcPolicy, account: ACCOUNT, callerArn: identity.Arn, environment, region: REGION, stack: `byus-${environment}-platform`, ...vpc };
  await writeFile(join(out, 'vpc-evidence.json'), `${JSON.stringify(evidence)}\n`, { mode: 0o600 });
  return evidence;
}
export async function main(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    requireValue(['--environment', '--component', '--profile', '--out', '--private-bucket'].includes(key) && !Object.hasOwn(options, key) && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Unknown/duplicate option or missing value');
    options[key] = argv[++i];
  }
  console.log(JSON.stringify(await prepare({ environment: options['--environment'], component: options['--component'], profile: options['--profile'], out: options['--out'], ...(options['--private-bucket'] !== undefined ? { privateBucket: options['--private-bucket'] } : {}) })));
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 78; });
