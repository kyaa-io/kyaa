import { mkdtempSync,writeFileSync,chmodSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve,join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect,it } from "vitest";
it("validates AWS-only database input before any secret write, using only a stubbed identity lookup",()=>{
 const directory=mkdtempSync(join(tmpdir(),"byus-secret-config-"));
 try{
  const aws=join(directory,"aws");writeFileSync(aws,'#!/usr/bin/env node\nif(process.argv[2]==="sts")process.stdout.write("996702758024\\n");else process.exit(9);\n');chmodSync(aws,0o700);
  const env={PATH:`${directory}:${process.env.PATH}`,AWS_REGION:"ap-northeast-2",AWS_PROFILE:"fixture",EXPECTED_AWS_ACCOUNT_ID:"996702758024"};
  const run=(extra:Record<string,string>)=>spawnSync(process.execPath,[resolve(process.cwd(),"../../scripts/configure-aws-worker-secret.mjs"),"staging"],{encoding:"utf8",env:{...env,...extra}});
  expect(run({POSTGREST_URL:"https://data.staging.kyaa.io"}).stderr).toContain("must be configured together");
  expect(run({}).stderr).toContain("requires PostgREST or Supabase");
  const awsOnly=run({POSTGREST_URL:"https://data.staging.kyaa.io",POSTGREST_SERVICE_TOKEN:"t".repeat(48)});
  expect(awsOnly.stderr).toContain("PINATA_STAGING_JWT is required");
  expect(awsOnly.stderr).not.toContain("SUPABASE_STAGING_URL is required");
  expect(run({EXPECTED_AWS_ACCOUNT_ID:"200151116034"}).stderr).toContain("Sallylab account");
 }finally{rmSync(directory,{recursive:true,force:true});}
});
