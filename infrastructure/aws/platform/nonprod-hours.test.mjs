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
 const rds=resources.StateMachineRole.Properties.Policies[0].PolicyDocument.Statement[0];
 const machines=policies[1]['Fn::If'][1].PolicyDocument.Statement[0];
 assert.equal(machines.Action,'states:StartExecution');
 assert.deepEqual(machines.Resource.map((resource)=>resource['Fn::Sub'].split(':stateMachine:')[1]),['byus-office-hours-${Environment}-database-start','byus-office-hours-${Environment}-database-stop']);
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

const definition=(machine)=>JSON.parse(resources[machine].Properties.DefinitionString['Fn::Sub']);

test('database schedules start state machines that use the SDK request field casing',()=>{
 for(const [schedule,machine,action] of [['DatabaseStart','DatabaseStartMachine','startDbInstance'],['DatabaseStop','DatabaseStopMachine','stopDbInstance']]) {
  assert.deepEqual(resources[schedule].Properties.Target.Arn,{Ref:machine});
  const states=definition(machine).States;
  assert(states.Call.Resource.endsWith(`:aws-sdk:rds:${action}`));
  assert.deepEqual(states.Call.Parameters,{DbInstanceIdentifier:'${DatabaseInstanceIdentifier}'});
  assert.equal(resources[machine].Condition,'DatabaseConfigured');
 }
});

test('DB already in the wanted state ends as success and any other refusal still fails',()=>{
 for(const [machine,wanted] of [['DatabaseStartMachine',['available','starting']],['DatabaseStopMachine',['stopped','stopping']]]) {
  const {States,StartAt}=definition(machine);
  assert.equal(StartAt,'Call');
  // Only the invalid-state error is caught; every other error keeps failing the execution.
  assert.deepEqual(States.Call.Catch.map((c)=>c.ErrorEquals),[['Rds.InvalidDbInstanceStateException','States.TaskFailed']]);
  assert.equal(States.Call.Catch[0].Next,'Describe');
  assert.deepEqual(States.Choice,undefined);
  assert.deepEqual(States.Decide.Choices.map((c)=>c.StringEquals),wanted);
  assert(States.Decide.Choices.every((c)=>c.Next==='AlreadyDone'));
  // A failing Describe has no Catch, so it fails the execution instead of counting as success; the Choice is the only way to Succeed.
  assert.equal(States.Describe.Catch,undefined);
  assert.equal(States.Describe.Next,'Decide');
  assert.deepEqual(Object.entries(States).filter(([,s])=>s.Next==='AlreadyDone'||s.Choices?.some((c)=>c.Next==='AlreadyDone')||s.Catch?.some((c)=>c.Next==='AlreadyDone')).map(([name])=>name),['Decide']);
  assert.equal(States.Decide.Default,'WrongState');
  assert.equal(States.AlreadyDone.Type,'Succeed');
  assert.equal(States.WrongState.Type,'Fail');
 }
 const describe=resources.StateMachineRole.Properties.Policies[0].PolicyDocument.Statement[1];
 assert.equal(describe.Action,'rds:DescribeDBInstances');
 assert.equal(describe.Resource['Fn::Sub'],'arn:${AWS::Partition}:rds:${AWS::Region}:${AWS::AccountId}:db:${DatabaseInstanceIdentifier}');
});

test('failures reach people: new DLQ messages and failed executions alarm, and a topic is required',()=>{
 const dlq=resources.FailedActionsAlarm.Properties;
 assert.equal(dlq.MetricName,'NumberOfMessagesSent');
 assert.equal(dlq.Statistic,'Sum');
 assert.equal(dlq.Threshold,0);
 for(const [alarm,machine] of [['DatabaseStartFailedAlarm','DatabaseStartMachine'],['DatabaseStopFailedAlarm','DatabaseStopMachine']]) {
  const properties=resources[alarm].Properties;
  assert.equal(properties.MetricName,'ExecutionsFailed');
  assert.deepEqual(properties.Dimensions[0].Value,{Ref:machine});
  assert.equal(properties.AlarmActions['Fn::If'][0],'HasAlarmTopic');
 }
 const rule=template.Rules.AlarmTopicRequired;
 assert.equal(rule.Assertions[0].Assert['Fn::Not'][0]['Fn::Equals'][0].Ref,'AlarmTopicArn');
});
