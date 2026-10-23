import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { z } from "zod";
import { S3CertificationStorage } from "./adapters/s3-certification-storage.js";
export const postgrestFields = {
  POSTGREST_URL: z.string().url().refine(value=>["https:","http:"].includes(new URL(value).protocol)).optional(),
  POSTGREST_SERVICE_TOKEN: z.string().min(40).optional(),
};
export type WorkerDataSource = { POSTGREST_URL?:string|undefined;POSTGREST_SERVICE_TOKEN?:string|undefined;AWS_STORAGE_ENABLED?:boolean|string|undefined;AWS_REGION?:string|undefined;S3_PRIVATE_BUCKET?:string|undefined };
export type WorkerStorage = {from(bucket:string):{download(path:string):PromiseLike<{data:Blob|null;error:unknown}>}};
export type WorkerDataClient = Pick<SupabaseClient,"from"|"rpc"> & {storage?:WorkerStorage};
export function isWorkerPostgrestUrl(value:string,environment:"dev"|"staging"|"prod"){
 const expected={dev:"https://data.dev.kyaa.io/",staging:"https://data.staging.kyaa.io/",prod:"https://data.kyaa.io/"}[environment];
 try{return new URL(value).href===expected;}catch{return false;}
}
export function validatePostgrestPair(value:WorkerDataSource,context:z.RefinementCtx){if((value.POSTGREST_URL===undefined)!==(value.POSTGREST_SERVICE_TOKEN===undefined))context.addIssue({code:"custom",message:"POSTGREST_URL and POSTGREST_SERVICE_TOKEN must be configured together"});}
export function validateDatabaseCredentials(value:WorkerDataSource&{SUPABASE_URL?:string|undefined;SUPABASE_SERVICE_ROLE_KEY?:string|undefined},context:z.RefinementCtx){
 if((value.SUPABASE_URL===undefined)!==(value.SUPABASE_SERVICE_ROLE_KEY===undefined))context.addIssue({code:"custom",message:"Supabase URL and service key must be configured together"});
 if(!value.POSTGREST_URL&&(!value.SUPABASE_URL||!value.SUPABASE_SERVICE_ROLE_KEY))context.addIssue({code:"custom",message:"Database configuration requires PostgREST or Supabase credentials"});
}
const dataSourceSchema=z.object({...postgrestFields,AWS_STORAGE_ENABLED:z.union([z.boolean(),z.enum(["true","false"]).transform(value=>value==="true")]).optional(),AWS_REGION:z.string().optional(),S3_PRIVATE_BUCKET:z.string().optional()}).superRefine(validatePostgrestPair);
export function createWorkerClient(url:string|undefined,key:string|undefined,source:WorkerDataSource={},options?:Parameters<typeof createClient>[2]):WorkerDataClient{
 const dataSource=dataSourceSchema.parse(source);
 if((url===undefined)!==(key===undefined))throw new Error("Supabase URL and service key must be configured together");
 let client:WorkerDataClient;
 if(dataSource.POSTGREST_URL&&dataSource.POSTGREST_SERVICE_TOKEN){
  const rest=new PostgrestClient(dataSource.POSTGREST_URL.replace(/\/+$/, ""),{headers:{Authorization:`Bearer ${dataSource.POSTGREST_SERVICE_TOKEN}`},...(options?.global?.fetch?{fetch:options.global.fetch}:{})});
  client={from:rest.from.bind(rest),rpc:rest.rpc.bind(rest)};
  if(url&&key&&!dataSource.AWS_STORAGE_ENABLED)client.storage=createClient(url,key,options).storage;
 }else{
  if(!url||!key)throw new Error("Database configuration requires PostgREST or Supabase credentials");
  client=createClient(url,key,options);
 }
 if(dataSource.AWS_STORAGE_ENABLED){
  if(dataSource.AWS_REGION!=="ap-northeast-2"||!dataSource.S3_PRIVATE_BUCKET||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(dataSource.S3_PRIVATE_BUCKET))throw new Error("AWS storage requires Seoul region and a private bucket");
  client.storage=new S3CertificationStorage(dataSource.AWS_REGION,dataSource.S3_PRIVATE_BUCKET,client);
 }
 return client;
}
