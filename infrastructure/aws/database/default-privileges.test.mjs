import test from 'node:test';import assert from 'node:assert/strict';
import {renderGlobalFunctionDefaults} from './default-privileges.mjs';
const ownerOnly={role:'postgres',schema:null,objectType:'f',grants:[{grantor:'postgres',grantee:'postgres',privilege:'EXECUTE',grantable:false}]};
test('global PUBLIC execution removal survives schema-only dump and role quoting',()=>{
 assert.equal(renderGlobalFunctionDefaults([ownerOnly]),'alter default privileges for role "postgres" revoke execute on functions from public,"postgres";\nalter default privileges for role "postgres" grant execute on functions to "postgres";\n');
 const q=structuredClone(ownerOnly);q.role='odd"owner';q.grants=[{grantor:q.role,grantee:'odd"reader',privilege:'EXECUTE',grantable:true}];
 assert.match(renderGlobalFunctionDefaults([q]),/to "odd""reader" with grant option;/);
 assert.equal(renderGlobalFunctionDefaults([{...ownerOnly,schema:'public'}]),'\n');
});
test('unknown global object types and changed grantors fail closed',()=>{
 assert.throws(()=>renderGlobalFunctionDefaults([{...ownerOnly,objectType:'r'}]),/Unreviewed/);
 assert.throws(()=>renderGlobalFunctionDefaults([{...ownerOnly,grants:[{...ownerOnly.grants[0],grantor:'other'}]}]),/exact owner/);
});
