import assert from 'node:assert/strict';
const identifier=(v)=>{assert.equal(typeof v,'string');assert(v.length>0&&!v.includes('\0'));return '"'+v.replaceAll('"','""')+'"';};
// Schema-filtered pg_dump omits global defaults. Support only the measured function defaults.
export function renderGlobalFunctionDefaults(defaults){
 const statements=[];
 for(const row of defaults.filter(row=>row.schema===null)){
  assert.equal(row.objectType,'f','Unreviewed global default privilege object type');
  assert(Array.isArray(row.grants));
  const owner=identifier(row.role);
  statements.push(`alter default privileges for role ${owner} revoke execute on functions from public,${owner};`);
  for(const grant of row.grants){
   assert.equal(grant.grantor,row.role,'Default privilege grantor must remain the exact owner');
   assert.equal(grant.privilege,'EXECUTE');assert.equal(typeof grant.grantable,'boolean');
   const grantee=grant.grantee==='public'?'public':identifier(grant.grantee);
   statements.push(`alter default privileges for role ${owner} grant execute on functions to ${grantee}${grant.grantable?' with grant option':''};`);
  }
 }
 return statements.join('\n')+'\n';
}
