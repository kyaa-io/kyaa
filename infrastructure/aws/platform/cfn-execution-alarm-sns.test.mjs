import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const template=JSON.parse(await readFile(new URL('./cfn-execution-alarm-sns.json',import.meta.url)));
const environment=JSON.parse(await readFile(new URL('./environment.json',import.meta.url)));
const policy=template.Resources.AlarmSubscriptionPolicy.Properties;
const [subscribe,manage]=policy.PolicyDocument.Statement;
const account='996702758024',region='ap-northeast-2';
const arn=(sub)=>sub['Fn::Sub'][0].replace('${AWS::Partition}','aws').replace('${AWS::Region}',region).replace('${AWS::AccountId}',account);
const resolve=(sub,stack)=>arn(sub).replace('${Stack}',stack);
const glob=(pattern,value)=>new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')}$`).test(value);

test('the execution role gets exactly the three SNS subscription actions and nothing else',()=>{
 assert.deepEqual(Object.keys(template.Resources),['AlarmSubscriptionPolicy']);
 assert.equal(subscribe.Effect,'Allow');assert.equal(manage.Effect,'Allow');
 assert.equal(subscribe.Action,'sns:Subscribe');
 assert.deepEqual(manage.Action,['sns:Unsubscribe','sns:GetSubscriptionAttributes']);
 assert.equal(policy.PolicyDocument.Statement.length,2);
});

test('the grant covers only the named environment stack AlarmTopic and its subscriptions',()=>{
 const topic=(stack,suffix)=>`arn:aws:sns:${region}:${account}:${stack}-AlarmTopic-${suffix}`;
 const subscribePattern=resolve(subscribe.Resource,'byus-prod-platform');
 const managePattern=resolve(manage.Resource,'byus-prod-platform');
 assert(glob(subscribePattern,topic('byus-prod-platform','icELbB4BH8tc')));
 assert(glob(managePattern,`${topic('byus-prod-platform','icELbB4BH8tc')}:0a1b2c3d-0000-4000-8000-000000000000`));
 for(const other of ['byus-dev-platform','byus-prod-notification-monitor']) {
  assert(!glob(subscribePattern,topic(other,'cHM9GggjBy3D')),other);
  assert(!glob(managePattern,`${topic(other,'cHM9GggjBy3D')}:0a1b2c3d-0000-4000-8000-000000000000`),other);
 }
 assert(!glob(subscribePattern,`arn:aws:sns:${region}:${account}:byus-prod-platform-OtherTopic-x`));
 assert(!glob(subscribePattern,`arn:aws:sns:us-east-1:${account}:byus-prod-platform-AlarmTopic-x`));
});

test('the default role and stack names follow the existing byus-<env> convention and the topic keeps its generated name',()=>{
 assert.equal(template.Resources.AlarmSubscriptionPolicy.Properties.Roles[0]['Fn::If'][2]['Fn::Sub'],'byus-${Environment}-cfn-execution');
 assert.equal(subscribe.Resource['Fn::Sub'][1].Stack['Fn::If'][2]['Fn::Sub'],'byus-${Environment}-platform');
 // The grant relies on the generated logical-id-based name; a fixed TopicName would need a new pattern here.
 assert.equal(environment.Resources.AlarmTopic.Type,'AWS::SNS::Topic');
 assert(!('TopicName' in environment.Resources.AlarmTopic.Properties));
 assert.equal(environment.Resources.AlarmSubscription.Properties.Protocol,'email');
});
