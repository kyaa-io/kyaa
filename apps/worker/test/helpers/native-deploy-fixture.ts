import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const root=resolve(process.cwd(),"../..");
export function nativeDeploy(name:string, environment="dev", options:{dryRun?:boolean;existing?:boolean;fault?:string;broad?:boolean;env?:Record<string,string>}={}) {
 const directory=mkdtempSync(join(tmpdir(),"byus-native-vpc-"));
 const bin=join(directory,"bin"),log=join(directory,"calls.jsonl");
 for(const path of [bin,join(directory,"scripts"),join(directory,"infrastructure/aws/worker"),join(directory,"apps/worker/dist-lambda")])mkdirSync(path,{recursive:true});
 for(const file of [name,"aws-worker-vpc.mjs"])copyFileSync(join(root,"scripts",file),join(directory,"scripts",file));
 for(const file of ["lambda-trust-policy.json","ses-email-send-policy.json","ses-bridge-assume-policy.json",`${environment}-secrets-policy.json`,`${environment}-notification-secrets-policy.json`])copyFileSync(join(root,"infrastructure/aws/worker",file),join(directory,"infrastructure/aws/worker",file));
 for(const file of ["index.cjs","notification-index.cjs"])writeFileSync(join(directory,"apps/worker/dist-lambda",file),"exports.handler=async()=>({enabled:false});\n");
 const executable=(name:string,body:string)=>writeFileSync(join(bin,name),`#!${process.execPath}\n${body}`,{mode:0o755});
 executable("npm","process.exit(0);");executable("git",`console.log('a'.repeat(40));`);executable("sleep","process.exit(0);");
 executable("aws",String.raw`
const fs=require('node:fs'),crypto=require('node:crypto');const a=process.argv.slice(2),e=process.env.FIXTURE_ENV,account='996702758024',fault=process.env.FIXTURE_FAULT;
const val=k=>a[a.indexOf(k)+1];const services=['sts','cloudformation','ec2','iam','lambda','events','cloudwatch','secretsmanager'];const i=a.findIndex(x=>services.includes(x)),service=a[i],operation=a[i+1];
const record={service,operation,args:a};for(const key of ['--policy-document','--vpc-config','--targets'])if(a.includes(key))record[key]=JSON.parse(fs.readFileSync(val(key).replace('file://',''),'utf8'));
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(record)+'\n');const done=x=>{console.log(typeof x==='string'?x:JSON.stringify(x));process.exit(0);};
if(service==='sts'&&a.includes('--query'))done(fault==='account'?'200151116034':account);
if(service==='sts')done({Account:fault==='account'?'200151116034':account,Arn:'arn:aws:iam::'+account+':user/test-operator'});
const subnet1='subnet-1111',subnet2='subnet-2222',vpc='vpc-1111',sg='sg-1111';
if(service==='cloudformation'){
 const env=fault==='environment'?(e==='prod'?'dev':'prod'):e;const outputs={VpcId:vpc,AppSubnet1:subnet1,AppSubnet2:fault==='duplicate-subnet'?subnet1:subnet2,TaskSecurityGroupId:sg,PrivateProofsBucketName:'byus-private-'+e,AlarmTopicArn:'arn:aws:sns:ap-northeast-2:'+account+':byus-prod-platform-AlarmTopic-fixture'};if(fault==='missing-output')delete outputs.TaskSecurityGroupId;
 done({StackId:'arn:aws:cloudformation:ap-northeast-2:'+(fault==='stack-account'?'200151116034':account)+':stack/byus-'+e+'-platform/00000000-0000-0000-0000-000000000001',StackStatus:fault==='unstable'?'UPDATE_IN_PROGRESS':'UPDATE_COMPLETE',Parameters:[{ParameterKey:'Environment',ParameterValue:env}],Outputs:Object.entries(outputs).map(([OutputKey,OutputValue])=>({OutputKey,OutputValue}))});
}
if(service==='ec2'&&operation==='describe-subnets')done({Subnets:[subnet1,subnet2].map(SubnetId=>({SubnetId,VpcId:fault==='subnet-vpc'?'vpc-ffff':vpc,OwnerId:fault==='subnet-owner'?'200151116034':account,State:'available',MapPublicIpOnLaunch:fault==='public-subnet'}))});
if(service==='ec2'&&operation==='describe-security-groups')done({SecurityGroups:[{GroupId:sg,VpcId:fault==='group-vpc'?'vpc-ffff':vpc,OwnerId:account}]});
if(service==='iam'&&operation==='get-role'){
 if(fault==='role-denied'){console.error('(AccessDenied)');process.exit(1);}
 if(fault==='new-role'&&!fs.existsSync(process.env.FIXTURE_LOG+'.role')){console.error('(NoSuchEntity)');process.exit(1);}
}
if(service==='iam'&&operation==='create-role')fs.writeFileSync(process.env.FIXTURE_LOG+'.role','created');
if(service==='iam'&&operation==='get-role')done(a.includes('--query')?'arn:aws:iam::'+account+':role/'+val('--role-name'):{Role:{Arn:'arn:aws:iam::'+account+':role/'+val('--role-name')}});
if(service==='iam'&&operation==='list-attached-role-policies')done({AttachedPolicies:process.env.FIXTURE_BROAD==='true'?[{PolicyArn:'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole'}]:[]});
if(service==='iam'&&['create-role','attach-role-policy','detach-role-policy','put-role-policy','wait'].includes(operation))done({});
const state=process.env.FIXTURE_LOG+'.hash';
if(service==='lambda'&&operation==='get-function'){
 if(a.includes('--query'))done(fs.readFileSync(state,'utf8'));
 if(process.env.FIXTURE_EXISTING!=='true'){console.error('(ResourceNotFoundException)');process.exit(1);}done({});
}
if(service==='lambda'&&['create-function','update-function-code'].includes(operation)){fs.writeFileSync(state,crypto.createHash('sha256').update(fs.readFileSync(val('--zip-file').replace('fileb://',''))).digest('base64'));done({});}
if(service==='lambda'&&operation==='get-function-configuration')done(val('--query')==='FunctionArn'?'arn:aws:lambda:ap-northeast-2:'+account+':function:'+val('--function-name'):{FunctionName:val('--function-name')});
if(service==='lambda'&&operation==='get-policy'){process.exit(1);}
if(service==='lambda'&&['update-function-configuration','wait','put-function-concurrency','add-permission'].includes(operation))done({});
if(service==='events'&&operation==='put-rule')done('arn:aws:events:ap-northeast-2:'+account+':rule/'+val('--name'));
if(service==='events'&&['put-targets','describe-rule'].includes(operation))done({});
if(service==='cloudwatch'&&operation==='put-metric-alarm')done({});
if(service==='secretsmanager'&&operation==='describe-secret')done({});
console.error('Unexpected AWS stub operation: '+service+' '+operation);process.exit(89);
`);
 try {
  const args=[environment,"false",...(options.dryRun===false?[]:["--dry-run"])];
  const result=spawnSync("bash",[join(directory,"scripts",name),...args],{cwd:directory,encoding:"utf8",env:{...process.env,PATH:`${bin}:${process.env.PATH}`,AWS_PROFILE:"sallylab-test",EXPECTED_AWS_ACCOUNT_ID:"996702758024",AWS_REGION:"ap-northeast-2",BYUS_MINT_PROD_DEPLOY_CONFIRM:"I_UNDERSTAND_BYUS_MINT_PROD_MUTATION",BYUS_NOTIFICATION_PROD_DEPLOY_CONFIRM:"I_UNDERSTAND_BYUS_NOTIFICATION_PROD_MUTATION",AWS_STORAGE_ENABLED:"false",S3_PRIVATE_BUCKET:"",BENEFIT_MAINTENANCE_ENABLED:"false",FIXTURE_ENV:environment,FIXTURE_FAULT:options.fault??"",FIXTURE_EXISTING:String(options.existing??false),FIXTURE_BROAD:String(options.broad??false),FIXTURE_LOG:log,...options.env}});
  const calls=(()=>{try{return readFileSync(log,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}})();
  return {...result,calls};
 }finally{rmSync(directory,{recursive:true,force:true});}
}
