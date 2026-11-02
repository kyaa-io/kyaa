import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIRM, TARGET, validateSeedConfig, verifySeedAws } from './seed-groups-pencil-dev.mjs';
const config = () => ({ ...TARGET, environment: 'dev', profile: 'fixture', target: { ...TARGET, host: 'fixture.ap-northeast-2.rds.amazonaws.com', sslRootCert: '/private/ca.pem', connectionEnv: 'GROUPS_DEV_DATABASE_URL', migrationRole: 'byus_admin', identity: { database: 'byus', sessionUser: 'byus_admin', serverAddress: '10.40.5.209', serverPort: 5432 } } });
test('only explicit approved dev identity is accepted', () => {
  assert.equal(validateSeedConfig(config(), CONFIRM).runId, 'groups_pencil_dev_fixture');
  assert.throws(() => validateSeedConfig(config(), ''));
  for (const [key, value] of [['environment','prod'],['accountId','000000000000'],['region','us-east-1'],['localRehearsal',true]]) assert.throws(() => validateSeedConfig({...config(),[key]:value},CONFIRM));
  for (const [key,value] of [['rdsIdentifier','prod'],['rdsResourceId','db-prod'],['host','localhost'],['migrationRole','app'],['sslRootCert','']]) assert.throws(() => validateSeedConfig({...config(),target:{...config().target,[key]:value}},CONFIRM));
  assert.throws(() => validateSeedConfig({...config(),target:{...config().target,sqlTunnel:{hostaddr:'0.0.0.0',port:15432}}},CONFIRM));
});
test('live AWS account and RDS metadata must match every target guard', () => {
  const c=config();
  const instance={DbiResourceId:TARGET.rdsResourceId,DBInstanceStatus:'available',Endpoint:{Address:c.target.host,Port:5432},StorageEncrypted:true,PubliclyAccessible:false,EngineVersion:'17.6',TagList:[{Key:'Environment',Value:'dev'}]};
  const aws=(row=instance,account=TARGET.accountId)=>(args)=>args[0]==='sts'?{Account:account}:{DBInstances:[row]};
  verifySeedAws(c,aws());
  assert.throws(()=>verifySeedAws(c,aws(instance,'000000000000')));
  for(const [key,value]of [['DbiResourceId','db-prod'],['DBInstanceStatus','modifying'],['PubliclyAccessible',true],['StorageEncrypted',false],['EngineVersion','16.9'],['TagList',[]],['Endpoint',{Address:'prod',Port:5432}]]) assert.throws(()=>verifySeedAws(c,aws({...instance,[key]:value})));
});
