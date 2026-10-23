import { describe, expect, it } from "vitest";
import { nativeDeploy } from "./helpers/native-deploy-fixture.js";

const scripts=["deploy-aws-worker.sh","deploy-aws-notification-worker.sh"];
const mutations=(calls:any[])=>calls.filter(c=>/^(create|update|put|attach|detach|add)-/.test(c.operation));
const arg=(call:any,name:string)=>call.args[call.args.indexOf(name)+1];
describe("native worker platform VPC deployment",()=>{
 it.each(scripts.flatMap(script=>["dev","staging","prod"].map(environment=>[script,environment])))('%s validates %s metadata in dry-run without mutation or secret values',(script,environment)=>{
  const result=nativeDeploy(script!,environment!);
  expect(result.status,result.stderr).toBe(0);
  expect(result.stdout).toContain('"callerArn":"arn:aws:iam::996702758024:user/test-operator"');
  expect(result.stdout).toContain(`"stack":"byus-${environment}-platform"`);
  expect(result.stdout).toContain('"SubnetIds":["subnet-1111","subnet-2222"]');
  expect(result.stdout).toContain('"SecurityGroupIds":["sg-1111"]');
  expect(mutations(result.calls)).toEqual([]);
  expect(result.calls.some(c=>c.service==="secretsmanager")).toBe(false);
  const stack=result.calls.find(c=>c.service==="cloudformation");
  expect(arg(stack,"--stack-name")).toBe(`byus-${environment}-platform`);
  expect(result.calls.every(c=>arg(c,"--profile")==="sallylab-test")).toBe(true);
 });
 it.each(scripts.flatMap(script=>[false,true].map(existing=>[script,existing] as const)))('%s configures selected VPC on create/update (existing=%s)',(script,existing)=>{
  const result=nativeDeploy(script,"staging",{dryRun:false,existing,broad:true});
  expect(result.status,result.stderr).toBe(0);
  const functions=script===scripts[0]?["byus-mint-worker-staging"]:["byus-notification-worker-staging","byus-benefit-maintenance-staging"];
  const deployed=result.calls.filter(c=>c.service==="lambda"&&c.operation===(existing?"update-function-configuration":"create-function"));
  expect(deployed).toHaveLength(functions.length);
  for(const call of deployed){
   expect(functions).toContain(arg(call,"--function-name"));
   expect(call["--vpc-config"]).toEqual({SubnetIds:["subnet-1111","subnet-2222"],SecurityGroupIds:["sg-1111"]});
   expect(arg(call,"--role")).toBe(`arn:aws:iam::996702758024:role/byus-${script===scripts[0]?"mint":"notification"}-worker-staging-lambda`);
   expect(arg(call,"--environment")).not.toContain("ENABLED=true");
   if(existing){const wait=result.calls[result.calls.indexOf(call)+1];expect(wait.operation).toBe("wait");expect(wait.args).toContain("function-updated-v2");expect(arg(wait,"--function-name")).toBe(arg(call,"--function-name"));}
  }
  const readback=result.calls.filter(c=>c.service==="lambda"&&c.operation==="get-function-configuration"&&arg(c,"--query").includes("VpcConfig:VpcConfig"));
  expect(readback).toHaveLength(functions.length);expect(readback.every(c=>arg(c,"--query").includes("Role:Role"))).toBe(true);
  const policy=result.calls.find(c=>c.operation==="put-role-policy"&&arg(c,"--policy-name").endsWith("vpc-eni"))["--policy-document"];
  const create=policy.Statement.find((s:any)=>s.Action.includes("ec2:CreateNetworkInterface")&&s.Effect==="Allow");
  expect(create.Resource).toEqual(expect.arrayContaining(["arn:aws:ec2:ap-northeast-2:996702758024:security-group/sg-1111","arn:aws:ec2:ap-northeast-2:996702758024:subnet/subnet-1111"]));
  const remove=policy.Statement.find((s:any)=>s.Action.includes("ec2:DeleteNetworkInterface")&&s.Effect==="Allow");
  expect(remove.Resource).toBe("*");
  expect(remove.Condition.ArnEqualsIfExists).toEqual({"ec2:Vpc":"arn:aws:ec2:ap-northeast-2:996702758024:vpc/vpc-1111","ec2:Subnet":["arn:aws:ec2:ap-northeast-2:996702758024:subnet/subnet-1111","arn:aws:ec2:ap-northeast-2:996702758024:subnet/subnet-2222"]});
  const deny=policy.Statement.find((s:any)=>s.Effect==="Deny");
  expect(deny.Condition.ArnEquals["lambda:SourceFunctionArn"]).toEqual(functions.map(f=>`arn:aws:lambda:ap-northeast-2:996702758024:function:${f}`));
  expect(result.calls.findIndex(c=>c.operation==="detach-role-policy")).toBeGreaterThan(result.calls.findIndex(c=>c.operation==="put-role-policy"&&arg(c,"--policy-name").endsWith("vpc-eni")));
  expect(result.calls.filter(c=>c.operation==="put-rule").every(c=>arg(c,"--state")==="DISABLED")).toBe(true);
  expect(result.calls.some(c=>c.operation==="get-secret-value"||c.operation==="invoke")).toBe(false);
  expect(result.calls.slice(0,result.calls.indexOf(mutations(result.calls)[0])).some(c=>c.operation==="describe-security-groups")).toBe(true);
 });
 it.each(scripts)('%s accepts absent roles but rejects IAM metadata access errors before mutation',script=>{
  const created=nativeDeploy(script,"dev",{dryRun:false,fault:"new-role"});expect(created.status,created.stderr).toBe(0);expect(created.calls.some(c=>c.operation==="create-role")).toBe(true);
  const denied=nativeDeploy(script,"dev",{dryRun:false,fault:"role-denied"});expect(denied.status).not.toBe(0);expect(mutations(denied.calls)).toEqual([]);
 });
 it.each(scripts.flatMap(script=>["account","stack-account","environment","missing-output","duplicate-subnet","unstable","subnet-vpc","subnet-owner","public-subnet","group-vpc"].map(fault=>[script,fault])))('%s rejects %s mismatch before any mutation',(script,fault)=>{
  const result=nativeDeploy(script!,"staging",{dryRun:false,fault:fault!});expect(result.status).not.toBe(0);expect(mutations(result.calls)).toEqual([]);
 });
 it('verifies the S3 proof bucket against platform outputs before notification IAM changes',()=>{
  const valid=nativeDeploy(scripts[1]!,"dev",{env:{AWS_STORAGE_ENABLED:"true",S3_PRIVATE_BUCKET:"byus-private-dev"}});expect(valid.status,valid.stderr).toBe(0);
  const invalid=nativeDeploy(scripts[1]!,"dev",{dryRun:false,env:{AWS_STORAGE_ENABLED:"true",S3_PRIVATE_BUCKET:"byus-private-prod"}});expect(invalid.status).not.toBe(0);expect(invalid.stderr).toContain("Private bucket must match");expect(mutations(invalid.calls)).toEqual([]);
 });
 it.each(scripts)('%s rejects an explicit foreign dev account before even metadata access',script=>{
  const result=nativeDeploy(script,"dev",{env:{EXPECTED_AWS_ACCOUNT_ID:"200151116034"}});expect(result.status).toBe(78);expect(result.calls).toEqual([]);
 });
});
