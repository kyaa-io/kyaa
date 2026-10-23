import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const stack=JSON.parse(await readFile(new URL('./webhook-buffer.json',import.meta.url)));
const environment=JSON.parse(await readFile(new URL('./environment.json',import.meta.url)));
const resources=stack.Resources;
const statements=resources.ReplayRole.Properties.Policies[0].PolicyDocument.Statement;
test('FIFO replay starts paused and keeps failed payloads beyond queue retention',()=>{
 assert.equal(stack.Parameters.EnableReplay.Default,'false');
 assert.deepEqual(resources.ReplayMapping.Properties.Enabled,{'Fn::If':['ReplayEnabled',true,false]});
 assert.deepEqual(resources.ReplayMapping.Properties.FunctionResponseTypes,['ReportBatchItemFailures']);
 assert.equal(resources.ReplayMapping.Properties.BatchSize,1);
 for(const key of ['Queue','DeadLetterQueue']) {assert(resources[key].Properties.FifoQueue);assert.equal(resources[key].Properties.MessageRetentionPeriod,14*86400);assert(resources[key].Properties.KmsMasterKeyId);}
 assert.equal(resources.Queue.Properties.VisibilityTimeout,6*resources.ReplayFunction.Properties.Timeout);
 assert.equal(resources.Bucket.Properties.LifecycleConfiguration.Rules[0].ExpirationInDays,30);
 assert.equal(resources.Bucket.Properties.VersioningConfiguration.Status,'Enabled');
 assert(Object.values(resources.Bucket.Properties.PublicAccessBlockConfiguration).every(Boolean));
 assert.equal(resources.Bucket.DeletionPolicy,'Retain');assert.equal(resources.Key.DeletionPolicy,'Retain');
});
test('consumer and producer use separate exact envelope and receipt capabilities',()=>{
 const consumerGet=statements.find((s)=>s.Action==='s3:GetObject');
 const consumerPut=statements.find((s)=>s.Action==='s3:PutObject');
 assert.equal(consumerGet.Resource['Fn::Sub'],'${Bucket.Arn}/webhook-intake/${Environment}/*');
 assert.equal(consumerPut.Resource['Fn::Sub'],'${Bucket.Arn}/webhook-receipts/${Environment}/*');
 assert(!JSON.stringify(statements).includes('s3:DeleteObject'));assert(!JSON.stringify(statements).includes('sqs:SendMessage'));
 const optional=environment.Resources.TaskRole.Properties.Policies.find((p)=>p['Fn::If']?.[0]==='WebhookBufferConfigured');
 assert.equal(environment.Parameters.WebhookBufferStackName.Default,'');
 const producer=optional['Fn::If'][1].PolicyDocument.Statement;
 assert.equal(producer.find((s)=>s.Action==='s3:GetObject').Resource['Fn::Sub'][0],'arn:${AWS::Partition}:s3:::${Bucket}/webhook-receipts/${Environment}/*');
 assert(!JSON.stringify(producer).includes('sqs:ReceiveMessage'));assert(!JSON.stringify(producer).includes('s3:DeleteObject'));
 assert.equal(resources.ReplayFunction.Properties.Environment.Variables.WEBHOOK_DB_SECRET_ARN['Fn::Sub'],'arn:${AWS::Partition}:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:byus/${Environment}/webhook-replay-${DatabaseSecretSuffix}');
 assert(!JSON.stringify(resources.ReplayFunction).includes('SUPABASE'));
});
test('both pools opt into approved SES sending only through paired explicit settings',()=>{
 assert.equal(environment.Parameters.CognitoSesIdentityArn.Default,'');
 assert(environment.Rules.CognitoSesPair);
 for(const pool of ['UserPool','EmailUserPool']) {
  const branches=environment.Resources[pool].Properties.EmailConfiguration['Fn::If'];
  assert.equal(branches[1].EmailSendingAccount,'DEVELOPER');assert.equal(branches[2].EmailSendingAccount,'COGNITO_DEFAULT');
 }
});
