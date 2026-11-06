import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {Resources:resources}=JSON.parse(await readFile(new URL('./environment.json',import.meta.url)));
const monitor=JSON.parse(await readFile(new URL('../worker/notification-monitor.json',import.meta.url)));
const GiB=1024**3;

test('replication slot lag and transaction log alarms exist in the shared template and notify the alarm topic',()=>{
 // Oct 2026 incident: an abandoned slot kept ~18 GB/day of WAL on a 200 GB disk with 240 MB of data.
 // 5 GiB is ~7 hours of that growth, 10 GiB of log is ~14 hours; both leave ~10 days before the disk is full.
 for(const [key,metric,threshold] of [['DatabaseReplicationSlotLagAlarm','OldestReplicationSlotLag',5*GiB],['DatabaseTransactionLogAlarm','TransactionLogsDiskUsage',10*GiB]]) {
  const alarm=resources[key];
  assert.equal(alarm.Condition,'DatabaseEnabled');
  const p=alarm.Properties;
  assert.equal(p.Namespace,'AWS/RDS');
  assert.equal(p.MetricName,metric);
  assert.deepEqual(p.Dimensions,[{Name:'DBInstanceIdentifier',Value:{Ref:'Database'}}]);
  assert.equal(p.Statistic,'Maximum');
  assert.equal(p.Period,300);assert.equal(p.EvaluationPeriods,3);
  assert.equal(p.Threshold,threshold);
  assert.equal(p.ComparisonOperator,'GreaterThanThreshold');
  assert.equal(p.TreatMissingData,'notBreaching');
  assert.deepEqual(p.AlarmActions,[{Ref:'AlarmTopic'}]);
  assert.deepEqual(p.OKActions,[{Ref:'AlarmTopic'}]);
 }
 // The slot threshold must stay well below the old free-storage alarm so an abandoned slot is caught days earlier.
 assert(resources.DatabaseReplicationSlotLagAlarm.Properties.Threshold<resources.DatabaseStorageAlarm.Properties.Threshold);
});

test('the storage alarm keeps its generated name and the two new capacity alarms have fixed names that the production monitor subscribes to',()=>{
 // A fixed AlarmName on the existing storage alarm forces CloudFormation to replace it, which needs new create/delete permissions on the execution role.
 assert(!('AlarmName' in resources.DatabaseStorageAlarm.Properties),'DatabaseStorageAlarm must not set AlarmName');
 assert(!('AlarmDescription' in resources.DatabaseStorageAlarm.Properties),'DatabaseStorageAlarm must not set AlarmDescription');
 const names=['DatabaseReplicationSlotLagAlarm','DatabaseTransactionLogAlarm'].map((key)=>resources[key].Properties.AlarmName['Fn::Sub']);
 assert.deepEqual(names,['byus-${Environment}-database-replication-slot-lag','byus-${Environment}-database-transaction-log-usage']);
 const allowed=monitor.Resources.Subscription.Properties.FilterPolicy.AlarmName;
 for(const name of names) assert(allowed.includes(name.replace('${Environment}','prod')),name);
 // The filter mixes exact names (strings) and generated-name prefixes ({prefix}); neither form may match a dev alarm.
 const patterns=allowed.map((entry)=>typeof entry==='string'?entry:entry.prefix);
 assert(patterns.every((pattern)=>typeof pattern==='string'),'every filter entry must be an exact name or a prefix');
 assert(!patterns.some((pattern)=>pattern.includes('byus-dev-')),'dev alarms must not reach the production room');
});
