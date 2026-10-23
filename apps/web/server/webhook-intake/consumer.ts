import "server-only";
import { GetObjectCommand,PutObjectCommand,S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { SecretsManagerClient,GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { bufferConfig,digest,validateEnvelope,type Envelope } from "./core";
const pointerSchema=z.object({version:z.literal(1),environment:z.enum(["dev","staging","prod"]),key:z.string(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function eventKey(e:Envelope) {
 const args=e.commands[0].args;
 if(e.provider==="telegram")return String(args.p_telegram_update_id);
 if(e.provider==="apple-account") {const p=args.p_event as Record<string,unknown>;return `${p.audience}:${p.eventId}`;}
 if(e.provider.startsWith("store-"))return `${args.p_store}:${args.p_environment}:${args.p_external_transaction_id}:${digest(JSON.stringify(e.commands))}`;
 return e.bodyHash;
}
export async function processPointer(body:string,deps:{source:Record<string,string|undefined>;read(key:string):Promise<string>;apply(envelope:Envelope,key:string):Promise<void>}) {
 if(deps.source.WEBHOOK_REPLAY_ENABLED!=="true")throw new Error("Webhook replay paused");
 const c=bufferConfig(deps.source),p=pointerSchema.parse(JSON.parse(body));
 if(p.environment!==c.environment||!new RegExp(`^webhook-intake/${c.environment}/[a-f0-9-]{36}\\.json$`).test(p.key))throw new Error("Invalid webhook pointer");
 const raw=await deps.read(p.key);
 if(Buffer.byteLength(raw)>1600000||digest(raw)!==p.hash)throw new Error("Invalid webhook body");
 const e=validateEnvelope(JSON.parse(raw));
 if(e.environment!==c.environment||Date.parse(e.receivedAt)>Date.now()+60000)throw new Error("Invalid webhook environment");
 await deps.apply(e,eventKey(e));
}
type Event={Records:Array<{messageId:string;eventSourceARN:string;body:string}>};
export async function handler(event:Event) {
 const failures:Array<{itemIdentifier:string}>=[];
 const c=bufferConfig();const expectedArn=`arn:aws:sqs:ap-northeast-2:996702758024:byus-webhook-buffer-${c.environment}.fifo`;
 // FIFO: stop after first failure, retaining following messages to preserve order.
 let failed=false;
 for(const record of event.Records){
  try{
   if(failed||record.eventSourceARN!==expectedArn)throw new Error("Invalid webhook queue");
   await processPointer(record.body,{source:process.env,async read(key){
    const object=await new S3Client({region:c.region}).send(new GetObjectCommand({Bucket:c.bucket,Key:key,ExpectedBucketOwner:"996702758024"}));
    if(!object.Body||!object.ContentLength||object.ContentLength>1600000||object.ServerSideEncryption!=="aws:kms"||object.SSEKMSKeyId!==c.kmsKeyId)throw new Error("Invalid webhook storage");
    return await object.Body.transformToString();
   },async apply(envelope,key){
    const secretArn=process.env.WEBHOOK_DB_SECRET_ARN;
    if(!secretArn?.startsWith(`arn:aws:secretsmanager:ap-northeast-2:996702758024:secret:byus/${c.environment}/webhook-replay-`))throw new Error("Invalid webhook database secret");
    const secret=await new SecretsManagerClient({region:c.region}).send(new GetSecretValueCommand({SecretId:secretArn}));
    const credentials=z.object({host:z.string().endsWith(".rds.amazonaws.com"),port:z.literal(5432),database:z.string().min(1),username:z.literal("byus_webhook_replay"),password:z.string().min(1)}).strict().parse(JSON.parse(secret.SecretString??"null"));
    const require=createRequire(`${process.cwd()}/package.json`);
    const {Client}=require("pg") as {Client:new(config:unknown)=>{connect():Promise<void>;query(sql:string,args:unknown[]):Promise<unknown>;end():Promise<void>}};
    const db=new Client({host:credentials.host,port:credentials.port,database:credentials.database,user:credentials.username,password:credentials.password,ssl:{rejectUnauthorized:true,ca:await readFile(process.env.RDS_CA_BUNDLE_PATH??"/var/task/global-bundle.pem","utf8")},connectionTimeoutMillis:3000,statement_timeout:20000});
    try{await db.connect();await db.query("select public.replay_buffered_webhook($1,$2,$3,$4::jsonb)",[envelope.provider,key,envelope.bodyHash,JSON.stringify(envelope.commands)]);}finally{await db.end();}
    if(envelope.provider.startsWith("instagram-")) {
     const hash=envelope.commands[0].args.p_confirmation_hash;
     if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash))throw new Error("Invalid webhook receipt");
     await new S3Client({region:c.region}).send(new PutObjectCommand({Bucket:c.bucket,Key:`webhook-receipts/${c.environment}/${hash}.json`,Body:JSON.stringify({state:"complete",expiresAt:Date.now()+30*86400000}),ContentType:"application/json",ServerSideEncryption:"aws:kms",SSEKMSKeyId:c.kmsKeyId,ExpectedBucketOwner:"996702758024"}));
    }
   }});
  }catch{failed=true;failures.push({itemIdentifier:record.messageId});}
 }
 return {batchItemFailures:failures};
}
