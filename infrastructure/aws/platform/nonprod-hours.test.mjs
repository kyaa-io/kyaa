import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const template=JSON.parse(await readFile(new URL('./nonprod-hours.json',import.meta.url)));
const resources=template.Resources;
const environmentStack=JSON.parse(await readFile(new URL('./environment.json',import.meta.url)));
const policies=resources.Role.Properties.Policies;
test('office hours are opt-in dev/staging only and actions remain exactly scoped',()=>{
 assert.deepEqual(template.Parameters.Environment.AllowedValues,['dev','staging']);
 assert.equal(template.Parameters.EnableSchedules.Default,'false');
 assert.equal(template.Parameters.EnableDatabaseSchedules.Default,'false');
 const ecs=policies[0].PolicyDocument.Statement[0];
 const rds=policies[1]['Fn::If'][1].PolicyDocument.Statement[0];
 assert.equal(ecs.Action,'ecs:UpdateService');
 assert.deepEqual(rds.Action,['rds:StartDBInstance','rds:StopDBInstance']);
 assert.equal(ecs.Resource['Fn::Sub'],'arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:service/${ClusterName}/${ServiceName}');
 assert.equal(rds.Resource['Fn::Sub'],'arn:${AWS::Partition}:rds:${AWS::Region}:${AWS::AccountId}:db:${DatabaseInstanceIdentifier}');
 for(const statement of [ecs,rds]) {
  assert.deepEqual(statement.Condition,{'StringEquals':{'aws:ResourceTag/Environment':{'Ref':'Environment'}}});
  for(const environment of template.Parameters.Environment.AllowedValues) {
   const expectedTag=statement.Condition.StringEquals['aws:ResourceTag/Environment'];
   assert.equal(expectedTag.Ref,'Environment');
   const tagMatches=(resourceTag)=>resourceTag===environment;
   assert.equal(tagMatches('prod'),false,'Production tags must never satisfy this IAM condition');
   assert.equal(tagMatches(undefined),false,'Untagged resources must remain denied');
   assert.equal(tagMatches(environment),true);
   assert.equal(tagMatches(environment==='dev'?'staging':'dev'),false);
  }
 }
 for(const resource of ['Service','Database']) assert(environmentStack.Resources[resource].Properties.Tags.some((tag)=>tag.Key==='Environment'&&tag.Value.Ref==='Environment'));
 const trust=resources.Role.Properties.AssumeRolePolicyDocument.Statement[0];
 assert.equal(trust.Condition.ArnEquals['aws:SourceArn']['Fn::Sub'],'arn:${AWS::Partition}:scheduler:${AWS::Region}:${AWS::AccountId}:schedule-group/${Group}');
 assert(template.Rules.DatabaseRequired);
});
test('Korean weekday timing warms DB before web and stops web before DB',()=>{
 const times={DatabaseStart:'cron(45 8 ? * MON-FRI *)',WebStart:'cron(0 9 ? * MON-FRI *)',WebStop:'cron(0 19 ? * MON-FRI *)',DatabaseStop:'cron(15 19 ? * MON-FRI *)'};
 for(const [key,time] of Object.entries(times)) {
  const schedule=resources[key].Properties;
  assert.equal(schedule.ScheduleExpression,time);assert.equal(schedule.ScheduleExpressionTimezone,'Asia/Seoul');
  assert.equal(schedule.FlexibleTimeWindow.Mode,'OFF');
  assert.equal(schedule.State['Fn::If'][2],'DISABLED');
  assert.deepEqual(schedule.Target.DeadLetterConfig.Arn,{'Fn::GetAtt':['DeadLetterQueue','Arn']});
  assert.equal(schedule.Target.RetryPolicy.MaximumEventAgeInSeconds,900);
 }
 assert.equal(JSON.parse(resources.WebStart.Properties.Target.Input['Fn::Sub']).DesiredCount,1);
 assert.equal(JSON.parse(resources.WebStop.Properties.Target.Input['Fn::Sub']).DesiredCount,0);
 assert.equal(resources.DatabaseStart.Condition,'DatabaseConfigured');
 assert(resources.DeadLetterQueue.Properties.SqsManagedSseEnabled);
 assert.equal(resources.DeadLetterQueue.Properties.MessageRetentionPeriod,14*86400);
 assert.equal(resources.FailedActionsAlarm.Properties.Threshold,0);
});

test('RDS universal targets use the Scheduler SDK request field casing',()=>{
 for(const resource of ['DatabaseStart','DatabaseStop']) {
  const input=JSON.parse(resources[resource].Properties.Target.Input['Fn::Sub']);
  assert.deepEqual(input,{DbInstanceIdentifier:'${DatabaseInstanceIdentifier}'});
 }
});
