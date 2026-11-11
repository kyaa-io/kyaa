import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
// Single-user PostgreSQL uses a disposable cluster, no listening server or project database.
const bin=process.env.POSTGRES_BIN??'/opt/homebrew/opt/postgresql@17/bin';
const dir=mkdtempSync(join(tmpdir(),'kyaa-e2e1650-'));
try{
 const init=spawnSync(join(bin,'initdb'),['-D',dir,'-A','trust'],{encoding:'utf8'});
 assert.equal(init.status,0,init.stderr);
 const [setup,checks]=readFileSync('scripts/tests/e2e-fix-batch-1650.sql','utf8').split('-- APPLY_MIGRATIONS');
 const migrations=['20261215093000_fan_post_period_filter.sql','20261215093100_page_notice_seen.sql'].map(name=>readFileSync(resolve('supabase/migrations',name),'utf8')).join('\n');
 const input=[setup,migrations,checks].join('\n').split('\n').filter(line=>line.trim()&&!line.trim().startsWith('--')).join('\n')+'\n\n';
 const run=spawnSync(join(bin,'postgres'),['--single','-j','-D',dir,'postgres'],{input,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 assert.doesNotMatch(run.stdout+run.stderr,/ERROR:|FATAL:/);
 assert.match(run.stdout+run.stderr,/E2E1650_SQL_PASS/);
 console.log('PASS: calendar period boundaries, recommendations, visibility, owner/round history and grants');
}finally{rmSync(dir,{recursive:true,force:true});}
