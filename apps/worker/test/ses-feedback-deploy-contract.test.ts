import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const SCRIPT = "deploy-aws-ses-feedback.sh";
const script = readFileSync(resolve(root, "scripts", SCRIPT), "utf8");
const READS = new Set(["get-caller-identity", "describe-stacks", "describe-subnets", "describe-security-groups", "get-role", "list-attached-role-policies", "describe-secret", "get-queue-url", "get-queue-attributes", "get-role-policy", "get-function", "get-function-configuration", "get-function-event-invoke-config", "get-function-concurrency", "get-policy", "get-topic-attributes", "list-subscriptions-by-topic", "get-subscription-attributes", "get-configuration-set", "get-configuration-set-event-destinations", "describe-alarms", "wait"]);

// A stateful AWS CLI stub: every call is logged, writes are kept in a JSON file
// so a later --check run sees what an earlier apply run wrote.
const AWS_STUB = String.raw`
const fs=require('node:fs'),crypto=require('node:crypto');const a=process.argv.slice(2),account='996702758024',env=process.env.FIXTURE_ENV;
const val=k=>a.includes(k)?a[a.indexOf(k)+1]:undefined,file=k=>fs.readFileSync(val(k).replace(/^fileb?:\/\//,''));
const services=['sts','cloudformation','ec2','iam','lambda','sns','sqs','sesv2','cloudwatch','secretsmanager'];const i=a.findIndex(x=>services.includes(x)),service=a[i],op=a[i+1];
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({service,op,args:a})+'\n');
const path=process.env.FIXTURE_STATE,s=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):{policies:{},alarms:{},permissions:[]};
const save=()=>fs.writeFileSync(path,JSON.stringify(s));const out=x=>{save();console.log(typeof x==='string'?x:JSON.stringify(x));process.exit(0);};const fail=m=>{save();console.error(m);process.exit(254);};
const q=val('--query'),fn='arn:aws:lambda:ap-northeast-2:'+account+':function:byus-ses-feedback-'+env,topic='arn:aws:sns:ap-northeast-2:'+account+':byus-ses-feedback-'+env;
if(service==='sts')out(q?account:{Account:account,Arn:'arn:aws:iam::'+account+':user/test-operator'});
if(service==='cloudformation')out({StackId:'arn:aws:cloudformation:ap-northeast-2:'+account+':stack/byus-'+env+'-platform/00000000-0000-0000-0000-000000000001',StackStatus:'UPDATE_COMPLETE',Parameters:[{ParameterKey:'Environment',ParameterValue:env}],Outputs:[['VpcId','vpc-1111'],['AppSubnet1','subnet-1111'],['AppSubnet2','subnet-2222'],['TaskSecurityGroupId','sg-1111'],['AlarmTopicArn','arn:aws:sns:ap-northeast-2:'+account+':byus-prod-platform-AlarmTopic-fixture']].map(([OutputKey,OutputValue])=>({OutputKey,OutputValue}))});
if(service==='ec2'&&op==='describe-subnets')out({Subnets:['subnet-1111','subnet-2222'].map(SubnetId=>({SubnetId,VpcId:'vpc-1111',OwnerId:account,State:'available',MapPublicIpOnLaunch:false}))});
if(service==='ec2')out({SecurityGroups:[{GroupId:'sg-1111',VpcId:'vpc-1111',OwnerId:account}]});
if(service==='secretsmanager')out({});
if(service==='iam'){
 if(op==='get-role'){if(!s.role)fail('(NoSuchEntity)');out(q?'arn:aws:iam::'+account+':role/'+val('--role-name'):{Role:{Arn:'arn:aws:iam::'+account+':role/'+val('--role-name')}});}
 if(op==='create-role'){s.role=true;out({});}
 if(op==='put-role-policy'){s.policies[val('--policy-name')]=JSON.parse(file('--policy-document'));out({});}
 if(op==='get-role-policy'){const d=s.policies[val('--policy-name')];if(!d)fail('(NoSuchEntity)');out(d);}
 if(op==='list-attached-role-policies')out({AttachedPolicies:[]});
 out({});
}
if(service==='sqs'){
 if(op==='create-queue'){s.queue=s.queue??{};out('https://sqs.ap-northeast-2.amazonaws.com/'+account+'/'+val('--queue-name'));}
 if(op==='get-queue-url'){if(!s.queue)fail('(AWS.SimpleQueueService.NonExistentQueue)');out('https://sqs.ap-northeast-2.amazonaws.com/'+account+'/q');}
 if(op==='set-queue-attributes'){s.queue=JSON.parse(file('--attributes'));out({});}
 if(op==='get-queue-attributes')out(s.queue);
}
if(service==='lambda'){
 if(op==='get-function'){if(!s.fn)fail('(ResourceNotFoundException)');out({});}
 if(op==='create-function'||op==='update-function-configuration'||op==='update-function-code'){
  s.fn=s.fn??{};if(a.includes('--zip-file'))s.fn.CodeSha256=crypto.createHash('sha256').update(file('--zip-file')).digest('base64');
  if(a.includes('--handler'))Object.assign(s.fn,{Runtime:val('--runtime'),Handler:val('--handler'),Timeout:Number(val('--timeout')),MemorySize:Number(val('--memory-size')),Environment:JSON.parse(file('--environment'))});out({});
 }
 if(op==='get-function-configuration'){if(!s.fn)fail('(ResourceNotFoundException)');out(q==='FunctionArn'?fn:q?{}:{...s.fn,FunctionArn:fn});}
 if(op==='put-function-concurrency'){s.concurrency=val('--reserved-concurrent-executions');out({});}
 if(op==='get-function-concurrency'){if(!s.concurrency)fail('none');out(s.concurrency);}
 if(op==='put-function-event-invoke-config'){s.async={MaximumRetryAttempts:Number(val('--maximum-retry-attempts')),MaximumEventAgeInSeconds:Number(val('--maximum-event-age-in-seconds')),DestinationConfig:JSON.parse(file('--destination-config'))};out({});}
 if(op==='get-function-event-invoke-config'){if(!s.async)fail('(ResourceNotFoundException)');out(s.async);}
 if(op==='add-permission'){s.permissions.push(val('--statement-id'));out({});}
 if(op==='get-policy'){if(!s.permissions.length)fail('(ResourceNotFoundException)');out(JSON.stringify({Statement:s.permissions.map(Sid=>({Sid}))}));}
 out({});
}
if(service==='sns'){
 if(op==='create-topic'){s.topic=s.topic??{};out(topic);}
 if(op==='set-topic-attributes'){s.topic.Policy=val('--attribute-value');out({});}
 if(op==='get-topic-attributes'){if(!s.topic)fail('(NotFound)');out(s.topic.Policy);}
 if(op==='subscribe'){s.subscription={endpoint:val('--notification-endpoint'),redrive:val('--attributes').replace(/^RedrivePolicy=/,'')};out({});}
 if(op==='list-subscriptions-by-topic')out(s.subscription&&q.includes(s.subscription.endpoint)?topic+':sub-1':'None');
 if(op==='set-subscription-attributes'){s.subscription.redrive=val('--attribute-value');out({});}
 if(op==='get-subscription-attributes')out(s.subscription.redrive);
}
if(service==='sesv2'){
 if(op==='get-configuration-set'){if(!s.configSet)fail('(NotFoundException)');out({});}
 if(op==='create-configuration-set'){s.configSet={destinations:{}};out({});}
 if(op==='get-configuration-set-event-destinations'){const d=Object.entries(s.configSet.destinations).map(([Name,v])=>({Name,...v}));const hit=d.find(x=>q.includes(x.Name));out(q.includes('].Name')?(hit?hit.Name:'None'):(hit??null));}
 if(op==='create-configuration-set-event-destination'||op==='update-configuration-set-event-destination'){s.configSet.destinations[val('--event-destination-name')]=JSON.parse(file('--event-destination'));out({});}
}
if(service==='cloudwatch'){
 if(op==='put-metric-alarm'){s.alarms[val('--alarm-name')]={n:val('--alarm-name'),t:Number(val('--threshold')),a:[val('--alarm-actions')]};out({});}
 if(op==='describe-alarms')out(Object.values(s.alarms));
}
console.error('Unexpected AWS stub operation: '+service+' '+op);process.exit(89);
`;

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), "byus-ses-feedback-"));
  directories.push(directory);
  const bin = join(directory, "bin");
  for (const path of [bin, join(directory, "scripts"), join(directory, "infrastructure/aws/worker"), join(directory, "apps/worker/dist-lambda")]) mkdirSync(path, { recursive: true });
  for (const file of [SCRIPT, "aws-worker-vpc.mjs"]) copyFileSync(join(root, "scripts", file), join(directory, "scripts", file));
  for (const file of ["lambda-trust-policy.json", "dev-notification-secrets-policy.json", "prod-notification-secrets-policy.json"]) copyFileSync(join(root, "infrastructure/aws/worker", file), join(directory, "infrastructure/aws/worker", file));
  writeFileSync(join(directory, "apps/worker/dist-lambda/ses-feedback-index.cjs"), "exports.handler=async()=>({recorded:0});\n");
  const executable = (name: string, body: string) => writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  executable("npm", "process.exit(0);"); executable("sleep", "process.exit(0);"); executable("aws", AWS_STUB);
  return { directory, bin, log: join(directory, "calls.jsonl"), state: join(directory, "state.json") };
}

function run(ws: ReturnType<typeof workspace>, args: string[], environment = "dev", env: Record<string, string> = {}) {
  writeFileSync(ws.log, "");
  const result = spawnSync("bash", [join(ws.directory, "scripts", SCRIPT), ...args], {
    cwd: ws.directory, encoding: "utf8",
    env: { ...process.env, PATH: `${ws.bin}:${process.env.PATH}`, AWS_PROFILE: "sallylab-test", EXPECTED_AWS_ACCOUNT_ID: "996702758024", AWS_REGION: "ap-northeast-2", BYUS_SES_FEEDBACK_PROD_DEPLOY_CONFIRM: "I_UNDERSTAND_BYUS_SES_FEEDBACK_PROD_MUTATION", FIXTURE_ENV: environment, FIXTURE_LOG: ws.log, FIXTURE_STATE: ws.state, ...env },
  });
  const calls = readFileSync(ws.log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { service: string; op: string; args: string[] });
  return { ...result, calls, writes: calls.filter(call => !READS.has(call.op)) };
}

describe("SES feedback deployment contract", () => {
  it.each([[[]], [["staging"]], [["dev", "--force"]], [["dev", "--dry-run", "--check"]], [["prod", "true"]]])("rejects arguments %j before any AWS call", (args) => {
    const ws = workspace();
    const result = run(ws, args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
    expect(result.calls).toEqual([]);
  });

  it.each([
    [{ AWS_PROFILE: "" }, "requires an explicit AWS_PROFILE"],
    [{ EXPECTED_AWS_ACCOUNT_ID: "" }, "requires a 12-digit EXPECTED_AWS_ACCOUNT_ID"],
    [{ EXPECTED_AWS_ACCOUNT_ID: "200151116034" }, "only to Sallylab account 996702758024"],
    [{ BYUS_SES_FEEDBACK_PROD_DEPLOY_CONFIRM: "" }, "BYUS_SES_FEEDBACK_PROD_DEPLOY_CONFIRM"],
    [{ AWS_REGION: "us-east-1" }, "AWS region must be ap-northeast-2"],
  ])("fails closed for prod gate %j", (override, message) => {
    const ws = workspace();
    const result = run(ws, ["prod", "--dry-run"], "prod", override);
    expect(result.status).toBe(78);
    expect(result.stderr).toContain(message);
    expect(result.calls).toEqual([]);
  });

  it("dry-run validates names and the VPC without writing to AWS", () => {
    const ws = workspace();
    const result = run(ws, ["prod", "--dry-run"], "prod");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("validated ses feedback deployment: environment=prod profile=sallylab-test account=996702758024 configuration_set=byus-notification-prod topic=byus-ses-feedback-prod function=byus-ses-feedback-prod role=byus-ses-feedback-worker-prod-lambda dlq=byus-ses-feedback-prod-dlq");
    expect(result.writes).toEqual([]);
  });

  it("check on an empty account lists every resource to create and writes nothing", () => {
    const ws = workspace();
    const result = run(ws, ["prod", "--check"], "prod");
    expect(result.status, result.stderr).toBe(0);
    expect(result.writes).toEqual([]);
    for (const line of ["change create sqs-queue byus-ses-feedback-prod-dlq", "change create iam-role byus-ses-feedback-worker-prod-lambda", "change create lambda byus-ses-feedback-prod", "change create sns-topic byus-ses-feedback-prod", "change create ses-configuration-set byus-notification-prod", "change create ses-event-destination byus-ses-feedback-sns", "change cloudwatch-alarm byus-ses-prod-complaint-rate"])
      expect(result.stdout).toContain(line);
  });

  it("applies in a safe order with exact policies, then check reports no changes", () => {
    const ws = workspace();
    const applied = run(ws, ["prod"], "prod");
    expect(applied.status, applied.stderr).toBe(0);
    const order = (op: string) => applied.calls.findIndex(call => call.op === op);
    expect(order("create-queue")).toBeLessThan(order("create-function"));
    expect(order("put-function-event-invoke-config")).toBeLessThan(order("subscribe"));
    expect(order("add-permission")).toBeLessThan(order("subscribe"));
    expect(order("subscribe")).toBeLessThan(order("create-configuration-set-event-destination"));

    const state = JSON.parse(readFileSync(ws.state, "utf8"));
    expect(JSON.parse(state.topic.Policy).Statement).toEqual([{ Sid: "AllowSesConfigurationSetPublish", Effect: "Allow", Principal: { Service: "ses.amazonaws.com" }, Action: "sns:Publish", Resource: "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod", Condition: { StringEquals: { "AWS:SourceAccount": "996702758024", "AWS:SourceArn": "arn:aws:ses:ap-northeast-2:996702758024:configuration-set/byus-notification-prod" } } }]);
    expect(state.configSet.destinations["byus-ses-feedback-sns"]).toEqual({ Enabled: true, MatchingEventTypes: ["BOUNCE", "COMPLAINT", "DELIVERY", "DELIVERY_DELAY", "REJECT", "SEND"], SnsDestination: { TopicArn: "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod" } });
    expect(state.fn).toMatchObject({ Runtime: "nodejs24.x", Handler: "index.handler", Timeout: 30, Environment: { Variables: { SES_FEEDBACK_ENVIRONMENT: "prod", SES_FEEDBACK_SECRET_ID: "byus/notification/prod", SES_FEEDBACK_TOPIC_ARN: "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod" } } });
    expect(state.async).toEqual({ MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 21600, DestinationConfig: { OnFailure: { Destination: "arn:aws:sqs:ap-northeast-2:996702758024:byus-ses-feedback-prod-dlq" } } });
    expect(JSON.parse(state.subscription.redrive)).toEqual({ deadLetterTargetArn: "arn:aws:sqs:ap-northeast-2:996702758024:byus-ses-feedback-prod-dlq" });
    expect(JSON.parse(state.queue.Policy).Statement[0]).toMatchObject({ Principal: { Service: "sns.amazonaws.com" }, Action: "sqs:SendMessage", Condition: { ArnEquals: { "aws:SourceArn": "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod" } } });
    expect(state.policies["byus-ses-feedback-worker-prod-lambda-secret-read"].Statement[0].Resource).toBe("arn:aws:secretsmanager:ap-northeast-2:996702758024:secret:byus/notification/prod-*");
    expect(state.permissions).toEqual(["AllowSnsSesFeedback-prod"]);
    const permission = applied.calls.find(call => call.op === "add-permission")!.args;
    expect(permission[permission.indexOf("--principal") + 1]).toBe("sns.amazonaws.com");
    expect(permission[permission.indexOf("--source-arn") + 1]).toBe("arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod");

    const alarms = applied.calls.filter(call => call.op === "put-metric-alarm").map(call => call.args);
    expect(alarms).toHaveLength(4);
    const metric = (name: string) => alarms.find(args => args.includes(name))!;
    expect(metric("Reputation.BounceRate")).toEqual(expect.arrayContaining(["AWS/SES", "0.02", "ignore"]));
    expect(metric("Reputation.ComplaintRate")).toEqual(expect.arrayContaining(["AWS/SES", "0.001", "ignore"]));
    expect(metric("ApproximateNumberOfMessagesVisible")).toEqual(expect.arrayContaining(["AWS/SQS", "Name=QueueName,Value=byus-ses-feedback-prod-dlq"]));
    expect(metric("Errors")).toEqual(expect.arrayContaining(["AWS/Lambda", "Name=FunctionName,Value=byus-ses-feedback-prod"]));
    for (const args of alarms) expect(args[args.indexOf("--alarm-actions") + 1]).toBe("arn:aws:sns:ap-northeast-2:996702758024:byus-prod-platform-AlarmTopic-fixture");

    const checked = run(ws, ["prod", "--check"], "prod");
    expect(checked.status, checked.stderr).toBe(0);
    expect(checked.writes).toEqual([]);
    expect(checked.stdout.trim().split("\n")).toEqual(["checked ses feedback deployment: environment=prod changes=0"]);

    const again = run(ws, ["prod"], "prod");
    expect(again.status, again.stderr).toBe(0);
    expect(again.calls.filter(call => ["create-role", "create-function", "subscribe", "create-configuration-set", "create-configuration-set-event-destination", "add-permission"].includes(call.op))).toEqual([]);
  }, 30_000);

  it("check reports drift in the event destination and topic policy only", () => {
    const ws = workspace();
    expect(run(ws, ["prod"], "prod").status).toBe(0);
    const state = JSON.parse(readFileSync(ws.state, "utf8"));
    state.configSet.destinations["byus-ses-feedback-sns"].MatchingEventTypes = ["BOUNCE"];
    state.topic.Policy = JSON.stringify({ Version: "2012-10-17", Statement: [] });
    writeFileSync(ws.state, JSON.stringify(state));
    const checked = run(ws, ["prod", "--check"], "prod");
    expect(checked.stdout.trim().split("\n")).toEqual(["change sns-topic-policy byus-ses-feedback-prod", "change ses-event-destination byus-ses-feedback-sns", "checked ses feedback deployment: environment=prod changes=2"]);
  }, 30_000);

  it("creates no alarms in dev", () => {
    const ws = workspace();
    const applied = run(ws, ["dev"]);
    expect(applied.status, applied.stderr).toBe(0);
    expect(applied.calls.filter(call => call.service === "cloudwatch")).toEqual([]);
    expect(applied.calls.find(call => call.op === "create-configuration-set")!.args).toContain("byus-notification-dev");
  });

  it("does not track opens or clicks and keeps suppression at the account level", () => {
    expect(script).not.toMatch(/\bOPEN\b|\bCLICK\b|suppression-options|--tracking-options/);
  });
});

it("grants the configuration set to the production send policy with the same sender condition", () => {
  const policy = JSON.parse(readFileSync(resolve(root, "infrastructure/aws/worker/ses-email-send-policy.json"), "utf8"));
  expect(policy.Statement).toEqual([{ Effect: "Allow", Action: "ses:SendEmail", Resource: ["arn:aws:ses:ap-northeast-2:996702758024:identity/kyaa.io", "arn:aws:ses:ap-northeast-2:996702758024:configuration-set/byus-notification-prod"], Condition: { StringEquals: { "ses:FromAddress": "notifications@kyaa.io" } } }]);
});
