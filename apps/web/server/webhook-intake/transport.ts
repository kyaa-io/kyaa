import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { bufferConfig,webhookClientConfig,digest,objectKey,type Envelope } from "./core";
export const webhookTransport = {
 async persist(envelope:Envelope) {
  const c=bufferConfig(),client=webhookClientConfig();const body=JSON.stringify(envelope),key=objectKey(c.environment);
  await new S3Client(client).send(new PutObjectCommand({Bucket:c.bucket,Key:key,Body:body,ContentType:"application/json",ServerSideEncryption:"aws:kms",SSEKMSKeyId:c.kmsKeyId,ExpectedBucketOwner:"996702758024",IfNoneMatch:"*"}));
  if(envelope.provider.startsWith("instagram-")) {
   const hash=envelope.commands[0].args.p_confirmation_hash;
   if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))throw new Error("Invalid webhook receipt");
   try { await new S3Client(client).send(new PutObjectCommand({Bucket:c.bucket,Key:`webhook-receipts/${c.environment}/${hash}.json`,Body:JSON.stringify({state:"pending"}),ContentType:"application/json",ServerSideEncryption:"aws:kms",SSEKMSKeyId:c.kmsKeyId,ExpectedBucketOwner:"996702758024",IfNoneMatch:"*"})); } catch(error) { if((error as { $metadata?: {httpStatusCode?:number} }).$metadata?.httpStatusCode!==412)throw error; }
  }
  const queued=await new SQSClient(client).send(new SendMessageCommand({QueueUrl:c.queueUrl,MessageBody:JSON.stringify({version:1,environment:c.environment,key,hash:digest(body)}),MessageGroupId:"webhook-intake",MessageDeduplicationId:digest(`${envelope.provider}:${envelope.bodyHash}:${digest(JSON.stringify(envelope.commands))}`)}));
  if(!queued.MessageId)throw new Error("Webhook queue acknowledgement missing");
 }
};
