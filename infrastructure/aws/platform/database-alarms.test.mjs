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

test('the three database capacity alarms have fixed names that the production monitor subscribes to',()=>{
 const names=['DatabaseStorageAlarm','DatabaseReplicationSlotLagAlarm','DatabaseTransactionLogAlarm'].map((key)=>resources[key].Properties.AlarmName['Fn::Sub']);
 assert.deepEqual(names,['byus-${Environment}-database-free-storage','byus-${Environment}-database-replication-slot-lag','byus-${Environment}-database-transaction-log-usage']);
 const allowed=monitor.Resources.Subscription.Properties.FilterPolicy.AlarmName;
 for(const name of names) assert(allowed.includes(name.replace('${Environment}','prod')),name);
 assert(!allowed.some((name)=>name.includes('byus-dev-')),'dev alarms must not reach the production room');
});
