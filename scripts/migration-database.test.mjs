import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {migrationDatabase} from './migrate-existing-nfts-giwa.mjs';
test('requires an explicit RDS executor and preserves read-only default and explicit write',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migration-db-'));
 try{
  const env=path.join(dir,'env'),runner=path.join(dir,'runner.cjs');
  fs.writeFileSync(env,'SUPABASE_PROD_DB_PASSWORD=unused');
  assert.throws(()=>migrationDatabase(env,'select 1'),/RDS_EXECUTOR_REQUIRED/);
  fs.writeFileSync(runner,"const fs=require('node:fs');console.log(JSON.stringify({args:process.argv.slice(2),options:process.env.PGOPTIONS,sql:fs.readFileSync(0,'utf8')}));");
  fs.writeFileSync(env,`BYUS_RDS_EXECUTOR=${runner}`);
  for(const write of [false,true]){
   const result=JSON.parse(migrationDatabase(env,'select 1',write));
   assert.equal(result.sql,'select 1');assert.deepEqual(result.args,['psql','-XAt','-v','ON_ERROR_STOP=1']);
   assert.equal(result.options,`-c default_transaction_read_only=${write?'off':'on'} -c statement_timeout=30000`);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
