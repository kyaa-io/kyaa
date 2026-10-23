import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
export const providerSchema = z.enum(["store-apple","store-google","apple-account","solapi","telegram","instagram-deauthorize","instagram-deletion"]);
export type Provider = z.infer<typeof providerSchema>;
export type Command = { name: string; args: Record<string, unknown> };
export const rpcByProvider: Record<Provider,string> = {"store-apple":"mobile_store_apply_entitlement_verified","store-google":"mobile_store_apply_entitlement_verified","apple-account":"apply_apple_account_notification",solapi:"record_kakao_notification_receipt",telegram:"ingest_telegram_bug_report","instagram-deauthorize":"instagram_delete_subject","instagram-deletion":"instagram_delete_subject"};
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const envelopeSchema = z.object({version:z.literal(1),environment:z.enum(["dev","staging","prod"]),provider:providerSchema,receivedAt:z.string().datetime(),body:z.string().max(710000),bodyHash:z.string().regex(/^[a-f0-9]{64}$/),headers:z.record(z.string(),z.string()),commands:z.array(z.object({name:z.string(),args:z.record(z.string(),z.unknown())})).min(1).max(100)}).strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export function validateEnvelope(value:unknown) {
 const e=envelopeSchema.parse(value);
 if (digest(Buffer.from(e.body,"base64"))!==e.bodyHash || e.commands.some(c=>c.name!==rpcByProvider[e.provider]) || e.provider!=="solapi"&&e.commands.length!==1) throw new Error("Invalid webhook envelope");
 return e;
}
export function bufferConfig(source:Record<string,string|undefined>=process.env) {
 const environment=z.enum(["dev","staging","prod"]).parse(source.APP_ENV);
 const queue=new URL(source.WEBHOOK_BUFFER_QUEUE_URL??"");
 if(queue.origin!=="https://sqs.ap-northeast-2.amazonaws.com"||queue.pathname!==`/996702758024/byus-webhook-buffer-${environment}.fifo`||queue.search||queue.hash)throw new Error("Invalid webhook queue");
 const bucket=source.WEBHOOK_BUFFER_BUCKET;
 if(!bucket||!new RegExp(`^byus-[a-z0-9-]+-${environment}-996702758024$`).test(bucket)||!/^arn:aws:kms:ap-northeast-2:996702758024:key\/[a-f0-9-]{36}$/.test(source.WEBHOOK_BUFFER_KMS_KEY_ID??""))throw new Error("Invalid webhook encryption");
 return {environment,queueUrl:queue.href,bucket,kmsKeyId:source.WEBHOOK_BUFFER_KMS_KEY_ID!,region:"ap-northeast-2"};
}
export function webhookClientConfig(source:Record<string,string|undefined>=process.env) {
 const {region}=bufferConfig(source),accessKeyId=source.WEBHOOK_BUFFER_ACCESS_KEY_ID,secretAccessKey=source.WEBHOOK_BUFFER_SECRET_ACCESS_KEY;
 if(accessKeyId===undefined&&secretAccessKey===undefined)return {region};
 if(source.HOSTING_PROVIDER==="aws"||!/^AKIA[A-Z0-9]{16}$/.test(accessKeyId??"")||!(/^[A-Za-z0-9/+=]{40}$/).test(secretAccessKey??""))throw new Error("Invalid webhook credentials");
 return {region,credentials:{accessKeyId:accessKeyId!,secretAccessKey:secretAccessKey!}};
}
export type Capture = ReturnType<typeof createCapture>;
export function createCapture(provider:Provider) {
 const commands:Command[]=[];
 return {commands, async rpc(name:string,args:Record<string,unknown>) {
  if(name!==rpcByProvider[provider]||commands.length>=100)throw new Error("Invalid webhook operation");
  commands.push({name,args});
  return {data:provider==="telegram"?"00000000-0000-4000-8000-000000000001":true,error:null};
 }};
}
export interface Transport { persist(envelope:Envelope):Promise<void> }
const allowedHeaders=["content-type","authorization","x-solapi-secret","x-telegram-bot-api-secret-token"];
async function bytes(request:Request) {
 if(!request.body)throw new Error("Invalid webhook body");
 const chunks:Uint8Array[]=[];let size=0;
 const reader=request.body.getReader();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512*1024){await reader.cancel();throw new Error("Webhook body too large");}chunks.push(value);}
 return Buffer.concat(chunks);
}
export async function bufferWebhook(request:Request,provider:Provider,verify:(request:Request,capture:Capture,confirmation?:string)=>Promise<Response>,transport:Transport,source:Record<string,string|undefined>=process.env):Promise<Response|null> {
 if(source.WEBHOOK_INGRESS_HOLD==="true")return Response.json({error:{code:"WEBHOOK_INGRESS_HELD"}},{status:503,headers:{"cache-control":"no-store"}});
 if(source.WEBHOOK_BUFFER_ENABLED!=="true")return null;
 try {
  const {environment}=bufferConfig(source); const body=await bytes(request); const bodyHash=digest(body);
  const capture=createCapture(provider);
  if(provider.startsWith("instagram-")&&(!source.INSTAGRAM_APP_SECRET||digest(source.INSTAGRAM_APP_SECRET)!==source.WEBHOOK_BUFFER_INSTAGRAM_SECRET_SHA256))throw new Error("Webhook key mismatch");
  const confirmation=provider.startsWith("instagram-")?createHmac("sha256",source.INSTAGRAM_APP_SECRET??"").update(`webhook-confirmation:v1:${bodyHash}`).digest("base64url"):undefined;
  const receivedAt=new Date().toISOString();
  const verified=await verify(new Request(request.url,{method:"POST",headers:request.headers,body:new Uint8Array(body)}),capture,confirmation);
  if(!verified.ok || !capture.commands.length)return verified;
  const neededHeaders=allowedHeaders.filter(name=>name==="content-type" || name==="authorization"&&provider==="store-google" || name==="x-solapi-secret"&&provider==="solapi" || name==="x-telegram-bot-api-secret-token"&&provider==="telegram");
  const headers=Object.fromEntries(neededHeaders.flatMap(name=>request.headers.has(name)?[[name,request.headers.get(name)!]]:[]));
  const envelope=validateEnvelope({version:1,environment,provider,receivedAt,body:body.toString("base64"),bodyHash,headers,commands:capture.commands});
  await transport.persist(envelope);
  if(provider==="solapi")return Response.json({...await verified.json(),recorded:0,buffered:true},{status:200,headers:{"cache-control":"no-store"}});
  return verified;
 }catch{return Response.json({error:{code:"WEBHOOK_BUFFER_UNAVAILABLE"}},{status:503,headers:{"cache-control":"no-store"}});}
}
export const objectKey=(environment:string)=>`webhook-intake/${environment}/${randomUUID()}.json`;
